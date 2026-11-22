#!/usr/bin/env node
/**
 * scripts/soak-report-analyzer.cjs
 * Deterministic analyzer for real Windows multi-process soak telemetry (S4-01).
 * Evaluates process-tree memory slope after warmup, p50/p95 latencies, orphan processes,
 * restart loops, idle CPU anomalies, and coverage of the 11 required soak scenarios.
 */
const fs = require('fs');
const path = require('path');

const REQUIRED_SOAK_SCENARIOS = [
  'idle_30m',
  'chat_stream_cancel',
  'stt_mic_30m',
  'tts_repeat_playback',
  'concurrency_chat_stt_tts',
  'eco_minimized_background',
  'workspace_modals_reopen',
  'provider_outage_recovery',
  'network_loss_download',
  'sleep_resume_lock_unlock',
  'shutdown_active_tasks'
];

function parseNumeric(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A' || trimmed.toUpperCase() === 'NULL') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function parseSoakCsv(csvContent) {
  const lines = String(csvContent || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const raw = {};
    for (let c = 0; c < headers.length; c++) {
      raw[headers[c]] = cols[c] !== undefined ? cols[c].trim() : '';
    }
    rows.push({
      timestamp: raw.timestamp || '',
      elapsedSec: parseNumeric(raw.elapsed_sec) ?? 0,
      scenario: raw.scenario || 'unspecified',
      totalRssMb: parseNumeric(raw.total_rss_mb) ?? 0,
      mainRssMb: parseNumeric(raw.main_rss_mb) ?? 0,
      rendererGpuRssMb: parseNumeric(raw.renderer_gpu_rss_mb) ?? 0,
      pythonTtsRssMb: parseNumeric(raw.python_tts_rss_mb) ?? 0,
      sttWorkerRssMb: parseNumeric(raw.stt_worker_rss_mb) ?? 0,
      localLlmRssMb: parseNumeric(raw.local_llm_rss_mb) ?? 0,
      downloadWorkerRssMb: parseNumeric(raw.download_worker_rss_mb) ?? 0,
      processCount: parseNumeric(raw.process_count) ?? 0,
      totalHandles: parseNumeric(raw.total_handles) ?? 0,
      totalThreads: parseNumeric(raw.total_threads) ?? 0,
      cpuPercent: parseNumeric(raw.cpu_percent),
      gpuMemMb: parseNumeric(raw.gpu_mem_mb),
      dbSizeKb: parseNumeric(raw.db_size_kb),
      walSizeKb: parseNumeric(raw.wal_size_kb),
      restartsTotal: parseNumeric(raw.restarts_total) ?? 0,
      dbWriteMs: parseNumeric(raw.db_write_ms),
      sttLatencyMs: parseNumeric(raw.stt_latency_ms),
      ttsLatencyMs: parseNumeric(raw.tts_latency_ms),
      fatalErrors: parseNumeric(raw.fatal_errors) ?? 0
    });
  }
  return rows;
}

function computePercentile(values, percentile) {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const rank = (percentile / 100) * (clean.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return Number(clean[low].toFixed(2));
  const weight = rank - low;
  return Number((clean[low] + (clean[high] - clean[low]) * weight).toFixed(2));
}

function computeLatencySummary(values) {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (clean.length === 0) {
    return { count: 0, p50Ms: null, p95Ms: null, maxMs: null };
  }
  return {
    count: clean.length,
    p50Ms: computePercentile(clean, 50),
    p95Ms: computePercentile(clean, 95),
    maxMs: Number(Math.max(...clean).toFixed(2))
  };
}

/**
 * Ordinary least squares linear regression of memory (MB) vs time (hours)
 * computed over samples strictly after the warmup window.
 */
function computePostWarmupSlopeMbPerHour(rows, warmupRatio = 0.2, minWarmupSec = 0) {
  if (rows.length < 3) {
    return { slopeMbPerHour: 0, rSquared: 0, postWarmupSamples: 0, startRssMb: null, endRssMb: null };
  }
  const maxElapsed = rows[rows.length - 1].elapsedSec;
  const warmupCutoff = Math.max(minWarmupSec, maxElapsed * warmupRatio);
  const tail = rows.filter((r) => r.elapsedSec >= warmupCutoff);
  const series = tail.length >= 3 ? tail : rows;

  const n = series.length;
  const xs = series.map((r) => r.elapsedSec / 3600);
  const ys = series.map((r) => r.totalRssMb);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const slope = denX > 0 ? num / denX : 0;
  const rSquared = denX > 0 && denY > 0 ? (num * num) / (denX * denY) : 0;

  return {
    slopeMbPerHour: Number(slope.toFixed(2)),
    rSquared: Number(rSquared.toFixed(4)),
    postWarmupSamples: n,
    startRssMb: Number(ys[0].toFixed(2)),
    endRssMb: Number(ys[ys.length - 1].toFixed(2))
  };
}

function analyzeSoakRun(rows, meta = {}, thresholds = {}) {
  const maxMemorySlopeMbPerHour = thresholds.maxMemorySlopeMbPerHour ?? 45;
  const minLeakRSquared = thresholds.minLeakRSquared ?? 0.7;
  const maxAllowedRestarts = thresholds.maxAllowedRestarts ?? 2;
  const maxIdleCpuPercent = thresholds.maxIdleCpuPercent ?? 12;
  const minDurationSeconds = thresholds.minDurationSeconds ?? 7200; // 2 hours per S4-01
  const enforceFullDuration = thresholds.enforceFullDuration ?? false;

  const failures = [];
  const warnings = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      verdict: 'FAIL',
      failures: ['No soak telemetry samples recorded.'],
      warnings: [],
      summary: null
    };
  }

  const durationSec = Math.max(0, rows[rows.length - 1].elapsedSec - rows[0].elapsedSec);
  const memoryTrend = computePostWarmupSlopeMbPerHour(rows, thresholds.warmupRatio ?? 0.2, thresholds.minWarmupSec ?? 0);

  const peakTotalRssMb = Number(Math.max(...rows.map((r) => r.totalRssMb)).toFixed(2));
  const peakMainRssMb = Number(Math.max(...rows.map((r) => r.mainRssMb)).toFixed(2));
  const peakRendererGpuRssMb = Number(Math.max(...rows.map((r) => r.rendererGpuRssMb)).toFixed(2));
  const peakPythonTtsRssMb = Number(Math.max(...rows.map((r) => r.pythonTtsRssMb)).toFixed(2));
  const peakSttWorkerRssMb = Number(Math.max(...rows.map((r) => r.sttWorkerRssMb)).toFixed(2));
  const peakLocalLlmRssMb = Number(Math.max(...rows.map((r) => r.localLlmRssMb)).toFixed(2));
  const peakHandles = Math.max(...rows.map((r) => r.totalHandles));
  const peakWalKb = Math.max(0, ...rows.map((r) => r.walSizeKb ?? 0));

  const maxRestarts = Math.max(
    meta.totalRestarts ?? 0,
    ...rows.map((r) => r.restartsTotal)
  );
  const fatalErrors = Math.max(
    (meta.rendererCrashes ?? 0) + (meta.unhandledRejections ?? 0),
    ...rows.map((r) => r.fatalErrors)
  );
  const orphanPids = Array.isArray(meta.orphanPids) ? meta.orphanPids : [];

  const idleRows = rows.filter(
    (r) => (r.scenario === 'idle_30m' || r.scenario === 'eco_minimized_background') && r.cpuPercent !== null
  );
  const idleCpuP95 = computePercentile(
    idleRows.map((r) => r.cpuPercent),
    95
  );

  const observedScenarios = new Set([
    ...rows.map((r) => r.scenario).filter((s) => s && s !== 'unspecified'),
    ...(Array.isArray(meta.completedScenarios) ? meta.completedScenarios : [])
  ]);
  const missingScenarios = REQUIRED_SOAK_SCENARIOS.filter((s) => !observedScenarios.has(s));

  // Gate assertions aligned with S4-01 criteria
  if (fatalErrors > 0) {
    failures.push(`Detected ${fatalErrors} fatal exception(s) / renderer crash(es).`);
  }
  if (orphanPids.length > 0) {
    failures.push(`Detected ${orphanPids.length} orphan child process(es) after exit: PIDs ${orphanPids.join(', ')}.`);
  }
  if (maxRestarts > maxAllowedRestarts) {
    failures.push(`Process restart count (${maxRestarts}) exceeded restart-loop threshold (${maxAllowedRestarts}).`);
  }
  if (memoryTrend.slopeMbPerHour > maxMemorySlopeMbPerHour && memoryTrend.rSquared >= minLeakRSquared) {
    failures.push(
      `Sustained post-warmup memory growth detected: +${memoryTrend.slopeMbPerHour} MB/hr (R^2=${memoryTrend.rSquared}, limit=${maxMemorySlopeMbPerHour} MB/hr).`
    );
  }
  if (idleCpuP95 !== null && idleCpuP95 > maxIdleCpuPercent) {
    failures.push(`Idle/Eco CPU p95 (${idleCpuP95}%) exceeded threshold (${maxIdleCpuPercent}%).`);
  }
  if (enforceFullDuration && durationSec < minDurationSeconds) {
    failures.push(`Soak duration (${durationSec}s) is below S4-01 minimum (${minDurationSeconds}s / 2 hours).`);
  } else if (durationSec < minDurationSeconds) {
    warnings.push(`Run duration (${durationSec}s) is shorter than S4-01 2-hour minimum (${minDurationSeconds}s).`);
  }
  if (missingScenarios.length > 0) {
    warnings.push(`Missing S4-01 scenario markers (${missingScenarios.length}/11): ${missingScenarios.join(', ')}.`);
  }

  return {
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    warnings,
    summary: {
      sampleCount: rows.length,
      durationSec,
      hardwareBaseline: meta.hardwareBaseline || null,
      memoryMb: {
        peakTotalRssMb,
        peakMainRssMb,
        peakRendererGpuRssMb,
        peakPythonTtsRssMb,
        peakSttWorkerRssMb,
        peakLocalLlmRssMb,
        postWarmupSlopeMbPerHour: memoryTrend.slopeMbPerHour,
        postWarmupRSquared: memoryTrend.rSquared
      },
      resources: {
        peakHandles,
        peakWalKb,
        idleCpuP95,
        restartsTotal: maxRestarts,
        fatalErrors,
        orphanCount: orphanPids.length
      },
      latency: {
        dbWrite: computeLatencySummary(rows.map((r) => r.dbWriteMs)),
        stt: computeLatencySummary(rows.map((r) => r.sttLatencyMs)),
        tts: computeLatencySummary(rows.map((r) => r.ttsLatencyMs))
      },
      scenarios: {
        completed: [...observedScenarios].sort(),
        missing: missingScenarios
      }
    }
  };
}

if (require.main === module) {
  const csvFile = process.argv[2];
  const metaFile = process.argv[3];
  const enforceFull = process.argv.includes('--enforce-full-duration');

  if (!csvFile || !fs.existsSync(csvFile)) {
    console.error('Usage: node scripts/soak-report-analyzer.cjs <soak-samples.csv> [soak-meta.json] [--enforce-full-duration]');
    process.exit(1);
  }

  const rows = parseSoakCsv(fs.readFileSync(csvFile, 'utf8'));
  const meta = metaFile && fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const result = analyzeSoakRun(rows, meta, { enforceFullDuration: enforceFull });

  const outJsonPath = path.join(path.dirname(path.resolve(csvFile)), 'soak-analysis.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'PASS' ? 0 : 1);
}

module.exports = {
  REQUIRED_SOAK_SCENARIOS,
  parseSoakCsv,
  computePercentile,
  computeLatencySummary,
  computePostWarmupSlopeMbPerHour,
  analyzeSoakRun
};
