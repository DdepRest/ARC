import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const analyzer = require('../../../scripts/soak-report-analyzer.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

function buildRow(overrides: Record<string, string | number>) {
  const defaults = {
    timestamp: '2026-11-20T12:00:00Z',
    elapsed_sec: 0,
    scenario: 'idle_30m',
    total_rss_mb: 620,
    main_rss_mb: 140,
    renderer_gpu_rss_mb: 240,
    python_tts_rss_mb: 180,
    stt_worker_rss_mb: 60,
    local_llm_rss_mb: 0,
    download_worker_rss_mb: 0,
    process_count: 6,
    total_handles: 1800,
    total_threads: 95,
    cpu_percent: 2.5,
    gpu_mem_mb: 'N/A',
    db_size_kb: 420,
    wal_size_kb: 32,
    restarts_total: 0,
    db_write_ms: 4.2,
    stt_latency_ms: 190,
    tts_latency_ms: 410,
    fatal_errors: 0
  };
  const merged = { ...defaults, ...overrides };
  return Object.values(merged).join(',');
}

const CSV_HEADER =
  'timestamp,elapsed_sec,scenario,total_rss_mb,main_rss_mb,renderer_gpu_rss_mb,python_tts_rss_mb,stt_worker_rss_mb,local_llm_rss_mb,download_worker_rss_mb,process_count,total_handles,total_threads,cpu_percent,gpu_mem_mb,db_size_kb,wal_size_kb,restarts_total,db_write_ms,stt_latency_ms,tts_latency_ms,fatal_errors';

describe('S4-01 Real Multi-Process Soak Report Analyzer', () => {
  it('passes a stable 2-hour plateau run covering all 11 scenarios and computes exact p50/p95 latencies', () => {
    const scenarios = analyzer.REQUIRED_SOAK_SCENARIOS as string[];
    const csvLines = [CSV_HEADER];

    for (let i = 0; i < 12; i++) {
      const sec = i * 720; // 0 .. 7920s (> 2 hours)
      const rss = i < 2 ? 560 + i * 35 : 630 + (i % 2 === 0 ? 4 : -3); // warmup then flat plateau
      csvLines.push(
        buildRow({
          elapsed_sec: sec,
          scenario: scenarios[i % scenarios.length],
          total_rss_mb: rss,
          cpu_percent: scenarios[i % scenarios.length].startsWith('idle') || scenarios[i % scenarios.length].startsWith('eco') ? 1.8 : 18.5,
          db_write_ms: 2 + i,
          stt_latency_ms: 150 + i * 10,
          tts_latency_ms: 300 + i * 20
        })
      );
    }

    const rows = analyzer.parseSoakCsv(csvLines.join('\n'));
    const report = analyzer.analyzeSoakRun(
      rows,
      { orphanPids: [], totalRestarts: 0, completedScenarios: scenarios },
      { enforceFullDuration: true }
    );

    expect(report.verdict).toBe('PASS');
    expect(report.failures).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.summary.resources.orphanCount).toBe(0);
    expect(report.summary.latency.dbWrite.p50Ms).toBeCloseTo(7.5, 1);
    expect(report.summary.latency.dbWrite.p95Ms).toBeGreaterThan(11);
    expect(report.summary.latency.stt.p95Ms).toBeGreaterThan(240);
    expect(report.summary.latency.tts.p95Ms).toBeGreaterThan(480);
  });

  it('fails when sustained post-warmup linear memory growth indicates a leak', () => {
    const csvLines = [CSV_HEADER];
    for (let i = 0; i < 10; i++) {
      csvLines.push(
        buildRow({
          elapsed_sec: i * 900, // every 15 min -> 2.25 hours
          total_rss_mb: 500 + i * 45 // +180 MB/hr linear leak
        })
      );
    }

    const rows = analyzer.parseSoakCsv(csvLines.join('\n'));
    const report = analyzer.analyzeSoakRun(rows, { orphanPids: [] });

    expect(report.verdict).toBe('FAIL');
    expect(report.failures.some((f: string) => f.includes('Sustained post-warmup memory growth'))).toBe(true);
    expect(report.summary.memoryMb.postWarmupSlopeMbPerHour).toBeGreaterThan(150);
  });

  it('fails on orphan child processes after exit, restart loops, fatal errors, and idle CPU spikes', () => {
    const csvLines = [
      CSV_HEADER,
      buildRow({ elapsed_sec: 0, scenario: 'idle_30m', cpu_percent: 34, restarts_total: 5, fatal_errors: 1 }),
      buildRow({ elapsed_sec: 300, scenario: 'eco_minimized_background', cpu_percent: 41, restarts_total: 5, fatal_errors: 1 }),
      buildRow({ elapsed_sec: 600, scenario: 'idle_30m', cpu_percent: 38, restarts_total: 5, fatal_errors: 1 })
    ];

    const rows = analyzer.parseSoakCsv(csvLines.join('\n'));
    const report = analyzer.analyzeSoakRun(rows, { orphanPids: [4120, 4199] });

    expect(report.verdict).toBe('FAIL');
    expect(report.failures.some((f: string) => f.includes('orphan child process'))).toBe(true);
    expect(report.failures.some((f: string) => f.includes('restart count'))).toBe(true);
    expect(report.failures.some((f: string) => f.includes('fatal exception'))).toBe(true);
    expect(report.failures.some((f: string) => f.includes('Idle/Eco CPU p95'))).toBe(true);
  });

  it('keeps Windows soak harness and QA preflight scripts present and compliant with S4-01..S4-04 contracts', () => {
    const soakPs1 = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'windows-soak-harness.ps1'), 'utf8');
    const preflightPs1 = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'windows-qa-preflight.ps1'), 'utf8');
    const protocolMd = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'WINDOWS-RELEASE-QA-PROTOCOL.md'), 'utf8');

    expect(soakPs1).toContain('Win32_Process');
    expect(soakPs1).toContain('silero_server.py');
    expect(soakPs1).toContain('stt_worker');
    expect(soakPs1).toContain('[switch]$SelfTest');
    expect(soakPs1).toContain('InvariantCulture');
    expect(preflightPs1).toContain('Get-AuthenticodeSignature');
    expect(preflightPs1).toContain('hasNonAsciiProfile');
    expect(protocolMd).toContain('NOT RUN');
  });
});
