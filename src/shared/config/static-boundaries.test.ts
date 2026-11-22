import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const boundaries = require('../../../scripts/check-static-boundaries.js');

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('S3-11 Static Vue / TS / IPC Boundary Checker', () => {
  it('passes all static boundary checks on the live A.R.C. repository', () => {
    const report = boundaries.runAllStaticBoundaryChecks(REPO_ROOT);

    expect(report.errors).toEqual([]);
    expect(report.vue.checkedCount).toBeGreaterThan(50);
    expect(report.ipc.invokedCount).toBeGreaterThan(150);
    expect(report.ipc.handledCount).toBeGreaterThanOrEqual(report.ipc.invokedCount);
  });

  it('detects broken Vue SFC templates and script compile errors', () => {
    const brokenSfc = `<template><div><span>unclosed</template><script setup lang="ts">const x = 1;</script>`;
    const errors = boundaries.validateVueSfcSource(brokenSfc, 'Broken.vue');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: string) => e.includes('Broken.vue'))).toBe(true);
  });

  it('detects orphaned preload IPC invoke channels without a matching Main handler', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-ipc-boundary-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src', 'main', 'ipc'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'main', 'preload.ts'),
        `ipcRenderer.invoke('demo:ghost-channel');`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'main', 'ipc', 'demo.ipc.ts'),
        `ipcMain.handle('demo:real-channel', () => true);`,
        'utf8'
      );

      const ipcReport = boundaries.checkIpcBoundaryParity(tmpDir);
      expect(ipcReport.errors).toHaveLength(1);
      expect(ipcReport.errors[0]).toContain('demo:ghost-channel');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blocks child_process.exec regressions in hardened main modules', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-sec-boundary-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src', 'main', 'services'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'main', 'services', 'system-tts.util.ts'),
        `import { exec } from 'child_process';\nexec('echo unsafe');`,
        'utf8'
      );

      const secReport = boundaries.checkHardenedSecurityRegressions(tmpDir);
      expect(secReport.errors).toHaveLength(1);
      expect(secReport.errors[0]).toContain('system-tts.util.ts');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
