import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { analyzeBuildOutput, EXPECTED_LAZY_CHUNKS } = require('../../../scripts/analyze-bundle.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('TZ §10 Repository Hygiene & §11 Bundle Analyzer', () => {
  it('measures raw/gzip/brotli sizes, verifies lazy chunks, and flags forbidden dead assets', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-bundle-test-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'main'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'preload'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'renderer', 'assets'), { recursive: true });

      fs.writeFileSync(path.join(tmpDir, 'main', 'index.js'), 'export const main = true;\n'.repeat(200));
      fs.writeFileSync(path.join(tmpDir, 'preload', 'index.js'), 'export const preload = true;\n'.repeat(40));
      fs.writeFileSync(path.join(tmpDir, 'renderer', 'assets', 'index-abc123.js'), 'console.log("arc");\n'.repeat(500));

      for (const prefix of EXPECTED_LAZY_CHUNKS) {
        fs.writeFileSync(
          path.join(tmpDir, 'renderer', 'assets', `${prefix}-hash123.js`),
          `export const view = "${prefix}";\n`.repeat(100)
        );
      }

      const cleanReport = analyzeBuildOutput(tmpDir);
      expect(cleanReport.checks.allHeavyViewsLazyLoaded).toBe(true);
      expect(cleanReport.checks.zeroForbiddenDeadAssets).toBe(true);
      expect(cleanReport.totals.rawKb).toBeGreaterThan(cleanReport.totals.gzipKb);
      expect(cleanReport.totals.gzipKb).toBeGreaterThanOrEqual(cleanReport.totals.brotliKb);
      expect(cleanReport.categories['main'].count).toBe(1);
      expect(cleanReport.categories['renderer-entry'].count).toBe(1);

      // Inject a dead AI Studio screenshot -> must fail dead-assets guard
      fs.mkdirSync(path.join(tmpDir, 'renderer', 'assets', 'aistudio'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'renderer', 'assets', 'aistudio', 'Paste_01.png'), Buffer.alloc(1024, 1));
      const dirtyReport = analyzeBuildOutput(tmpDir);
      expect(dirtyReport.checks.zeroForbiddenDeadAssets).toBe(false);
      expect(dirtyReport.checks.forbiddenDeadAssets).toContain('renderer/assets/aistudio/Paste_01.png');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces Section 10 hygiene invariants: proven-unused artifacts removed, active tools & wrappers preserved', () => {
    // Removed proven-unused artifacts (0 inbound references)
    expect(fs.existsSync(path.join(REPO_ROOT, 'public', 'assets', 'aistudio'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, 'screeninfo'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, 'src', 'main', 'services', 'vosk-tts.util.ts'))).toBe(false);

    // Preserved active dependencies and compatibility wrappers
    expect(fs.existsSync(path.join(REPO_ROOT, 'myload', 'english_pronunciation_dict.py'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'myload', 'ARC_TTS_normalizer.py'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'src', 'renderer', 'components', 'ui', 'ApprovalDialog.vue'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'docs', 'AI-STUDIO-CONTEXT.md'))).toBe(true);
  });
});
