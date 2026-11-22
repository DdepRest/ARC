#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXPECTED_LAZY_CHUNKS = [
  'SettingsPanel',
  'ChatView',
  'TasksView',
  'ObjectivesView',
  'MemoryView',
  'CommandsView',
  'ModulesView',
  'TranscriptionView',
  'whisper.worker'
];

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function roundKb(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function classifyBundleFile(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.startsWith('main/')) return 'main';
  if (norm.startsWith('preload/')) return 'preload';
  if (norm.endsWith('.woff2') || norm.endsWith('.woff') || norm.endsWith('.ttf')) return 'renderer-fonts';
  if (norm.endsWith('.css')) return 'renderer-css';
  if (norm.includes('worker') && norm.endsWith('.js')) return 'renderer-workers';
  if (/^renderer\/assets\/index-[^/]+\.js$/.test(norm)) return 'renderer-entry';
  if (norm.startsWith('renderer/assets/') && norm.endsWith('.js')) return 'renderer-lazy-chunks';
  return 'renderer-other';
}

function measureFile(absPath, outDir) {
  const relPath = path.relative(outDir, absPath).replace(/\\/g, '/');
  const buf = fs.readFileSync(absPath);
  const gz = zlib.gzipSync(buf, { level: 9 });
  const br = zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
  });

  return {
    file: relPath,
    category: classifyBundleFile(relPath),
    rawBytes: buf.length,
    gzipBytes: gz.length,
    brotliBytes: br.length,
    rawKb: roundKb(buf.length),
    gzipKb: roundKb(gz.length),
    brotliKb: roundKb(br.length)
  };
}

function analyzeBuildOutput(outDir) {
  if (!fs.existsSync(outDir)) {
    throw new Error(`Build output directory not found: ${outDir}. Run "npm run build" first.`);
  }

  const absFiles = walkFiles(outDir);
  const files = absFiles.map((f) => measureFile(f, outDir)).sort((a, b) => b.rawBytes - a.rawBytes);

  const byCategory = {};
  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  let totalBrotliBytes = 0;

  for (const item of files) {
    totalRawBytes += item.rawBytes;
    totalGzipBytes += item.gzipBytes;
    totalBrotliBytes += item.brotliBytes;
    if (!byCategory[item.category]) {
      byCategory[item.category] = { count: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 };
    }
    const bucket = byCategory[item.category];
    bucket.count += 1;
    bucket.rawBytes += item.rawBytes;
    bucket.gzipBytes += item.gzipBytes;
    bucket.brotliBytes += item.brotliBytes;
  }

  const categorySummary = {};
  for (const [cat, stats] of Object.entries(byCategory)) {
    categorySummary[cat] = {
      count: stats.count,
      rawKb: roundKb(stats.rawBytes),
      gzipKb: roundKb(stats.gzipBytes),
      brotliKb: roundKb(stats.brotliBytes)
    };
  }

  const lazyChunkStatus = {};
  for (const prefix of EXPECTED_LAZY_CHUNKS) {
    const matched = files.find(
      (f) => f.file.startsWith('renderer/assets/') && f.file.endsWith('.js') && path.basename(f.file).startsWith(`${prefix}-`)
    );
    lazyChunkStatus[prefix] = matched
      ? { present: true, file: matched.file, rawKb: matched.rawKb, gzipKb: matched.gzipKb, brotliKb: matched.brotliKb }
      : { present: false, file: null, rawKb: 0, gzipKb: 0, brotliKb: 0 };
  }

  const forbiddenDeadAssets = files
    .filter((f) => f.file.includes('assets/aistudio/') || f.file.includes('vosk_server'))
    .map((f) => f.file);

  const missingLazyChunks = Object.entries(lazyChunkStatus)
    .filter(([, info]) => !info.present)
    .map(([name]) => name);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    totals: {
      rawKb: roundKb(totalRawBytes),
      gzipKb: roundKb(totalGzipBytes),
      brotliKb: roundKb(totalBrotliBytes)
    },
    categories: categorySummary,
    topChunks: files.slice(0, 12),
    lazyChunkStatus,
    checks: {
      allHeavyViewsLazyLoaded: missingLazyChunks.length === 0,
      missingLazyChunks,
      zeroForbiddenDeadAssets: forbiddenDeadAssets.length === 0,
      forbiddenDeadAssets
    }
  };
}

function runCli() {
  const repoRoot = path.resolve(__dirname, '..');
  const outDir = path.join(repoRoot, 'out');
  const report = analyzeBuildOutput(outDir);

  const distDir = path.join(repoRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const reportPath = path.join(distDir, 'bundle-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('--- A.R.C. BUNDLE & LAZY-LOADING REPORT (TZ §11) ---');
  console.log(
    `Total (${report.fileCount} files): raw=${report.totals.rawKb} KB | gzip=${report.totals.gzipKb} KB | brotli=${report.totals.brotliKb} KB`
  );
  console.log('Top chunks:');
  for (const chunk of report.topChunks.slice(0, 8)) {
    console.log(`  - ${chunk.file}: raw=${chunk.rawKb} KB | gzip=${chunk.gzipKb} KB | brotli=${chunk.brotliKb} KB`);
  }
  console.log(
    `Lazy chunks check: ${report.checks.allHeavyViewsLazyLoaded ? 'PASS' : 'FAIL'} (missing: ${report.checks.missingLazyChunks.join(', ') || 'none'})`
  );
  console.log(
    `Dead assets guard: ${report.checks.zeroForbiddenDeadAssets ? 'PASS' : 'FAIL'} (found: ${report.checks.forbiddenDeadAssets.length})`
  );
  console.log(`Saved JSON report to ${path.relative(repoRoot, reportPath)}`);

  if (!report.checks.zeroForbiddenDeadAssets) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  EXPECTED_LAZY_CHUNKS,
  classifyBundleFile,
  analyzeBuildOutput
};
