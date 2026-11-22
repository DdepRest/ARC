import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validateWindowsQaBundle } = require('../../../scripts/verify-windows-qa-bundle.cjs');

const NSIS_SHA = 'a'.repeat(64);
const PORTABLE_SHA = 'b'.repeat(64);
const TEST_COMMIT = 'a3cd3ecb6d249eabd354023e0e5e1c220db74bb0';

const tempDirs: string[] = [];

function createCompleteValidBundle(signingStatus: 'UNSIGNED' | 'TRUSTED_SIGNED' = 'UNSIGNED'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-qa-bundle-'));
  tempDirs.push(root);

  const writeFile = (rel: string, content: string | Buffer) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };

  // 1. CI & Packaging artifacts
  writeFile(
    'dist/SHA256SUMS.txt',
    `${NSIS_SHA}  ARC-Setup-1.0.12-x64.exe\n${PORTABLE_SHA}  ARC-Portable-1.0.12-x64.exe\n`
  );
  writeFile(
    'dist/ARTIFACT_VERIFICATION.json',
    JSON.stringify({
      version: '1.0.12',
      productName: 'A.R.C.',
      overallSigningStatus: signingStatus,
      requireSigned: signingStatus === 'TRUSTED_SIGNED',
      artifacts: {
        nsis: { file: 'ARC-Setup-1.0.12-x64.exe', sha256: NSIS_SHA },
        portable: { file: 'ARC-Portable-1.0.12-x64.exe', sha256: PORTABLE_SHA }
      }
    })
  );
  writeFile(
    'dist/sbom-cyclonedx.json',
    JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', components: [{ name: 'electron' }] })
  );

  // 2. Clean OS Preflight (Win10 + Win11, non-admin)
  writeFile(
    'preflight/qa-preflight-win10.json',
    JSON.stringify({
      os: { caption: 'Microsoft Windows 10 Pro', build: '19045' },
      environment: { isAdministrator: false },
      artifact: { file: 'ARC-Setup-1.0.12-x64.exe', sha256: NSIS_SHA }
    })
  );
  writeFile(
    'preflight/qa-preflight-win11.json',
    JSON.stringify({
      os: { caption: 'Microsoft Windows 11 Home', build: '22631' },
      environment: { isAdministrator: false },
      artifact: { file: 'ARC-Portable-1.0.12-x64.exe', sha256: PORTABLE_SHA }
    })
  );

  // 3. Exported diagnostics (matching version + commit, no raw secrets)
  writeFile(
    'diagnostics/arc-diagnostics-win11.json',
    JSON.stringify({
      app: { version: '1.0.12', commit: TEST_COMMIT.slice(0, 12), commitSource: 'env' },
      database: { mode: 'PERSISTENT_SQLITE', schemaVersion: 8 }
    })
  );

  // 4. Upgrade & Uninstall snapshot diff verdicts
  writeFile(
    'upgrade/qa-diff-upgrade-20261121.json',
    JSON.stringify({ scenario: 'upgrade', verdict: 'PASS', failures: [], warnings: [] })
  );
  writeFile(
    'upgrade/qa-diff-uninstall-20261121.json',
    JSON.stringify({ scenario: 'uninstall', verdict: 'PASS', failures: [], warnings: [] })
  );

  // 5. Multi-process 2h+ soak verdict
  writeFile(
    'soak/run-20261121/soak-analysis.json',
    JSON.stringify({
      verdict: 'PASS',
      failures: [],
      warnings: [],
      summary: {
        durationSec: 7320,
        resources: { orphanCount: 0, fatalErrors: 0 },
        scenarios: { completed: ['idle_30m'], missing: [] }
      }
    })
  );

  // 6. UX Matrix Screenshots (all 4 mandatory resolution/DPI modes)
  const pngStub = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeFile('screenshots/core-1920x1080-100.png', pngStub);
  writeFile('screenshots/settings-1366x768-100.png', pngStub);
  writeFile('screenshots/settings-1366x768-125.png', pngStub);
  writeFile('screenshots/approval-1280x720-100.png', pngStub);

  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('scripts/verify-windows-qa-bundle.cjs (Windows QA Evidence Bundle Validator)', () => {
  it('returns RELEASE_READY when all 7 gates pass with valid evidence', () => {
    const dir = createCompleteValidBundle('UNSIGNED');
    const result = validateWindowsQaBundle(dir, {
      expectedVersion: '1.0.12',
      expectedCommit: TEST_COMMIT
    });

    expect(result.verdict).toBe('RELEASE_READY');
    expect(result.signingStatus).toBe('UNSIGNED');
    expect(result.blockingReasons).toEqual([]);
    expect(result.gates.ciArtifacts.status).toBe('PASS');
    expect(result.gates.cleanOsPreflight.status).toBe('PASS');
    expect(result.gates.diagnosticsProvenance.status).toBe('PASS');
    expect(result.gates.upgradePreservation.status).toBe('PASS');
    expect(result.gates.uninstallPreservation.status).toBe('PASS');
    expect(result.gates.multiProcessSoak.status).toBe('PASS');
    expect(result.gates.uxScreenshots.status).toBe('PASS');
    expect(result.taskReadiness['S4-06']).toBe('READY_FOR_VERIFIED');
  });

  it('blocks UNSIGNED bundle when requireSigned is enabled', () => {
    const dir = createCompleteValidBundle('UNSIGNED');
    const result = validateWindowsQaBundle(dir, {
      expectedVersion: '1.0.12',
      expectedCommit: TEST_COMMIT,
      requireSigned: true
    });

    expect(result.verdict).toBe('BLOCKED');
    expect(result.gates.ciArtifacts.status).toBe('FAIL');
    expect(result.blockingReasons.some((r: string) => r.includes('RequireSigned'))).toBe(true);
  });

  it('blocks when Clean OS matrix is missing Windows 11 preflight evidence', () => {
    const dir = createCompleteValidBundle();
    fs.unlinkSync(path.join(dir, 'preflight/qa-preflight-win11.json'));

    const result = validateWindowsQaBundle(dir, { expectedVersion: '1.0.12' });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.gates.cleanOsPreflight.status).toBe('FAIL');
    expect(result.taskReadiness['S4-03']).toBe('BLOCKED');
    expect(result.blockingReasons.some((r: string) => r.includes('Windows 11'))).toBe(true);
  });

  it('blocks when soak has orphan processes, short duration, or missing scenarios', () => {
    const dir = createCompleteValidBundle();
    fs.writeFileSync(
      path.join(dir, 'soak/run-20261121/soak-analysis.json'),
      JSON.stringify({
        verdict: 'PASS',
        summary: {
          durationSec: 1800,
          resources: { orphanCount: 2, fatalErrors: 0 },
          scenarios: { completed: ['idle_30m'], missing: ['sleep_resume_lock_unlock'] }
        }
      })
    );

    const result = validateWindowsQaBundle(dir, { expectedVersion: '1.0.12' });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.gates.multiProcessSoak.status).toBe('FAIL');
    expect(result.taskReadiness['S4-01']).toBe('BLOCKED');
    expect(result.gates.multiProcessSoak.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('blocks when upgrade diff fails, UX screenshot mode is missing, or diagnostics leaks raw secret / wrong commit', () => {
    const dir = createCompleteValidBundle();
    fs.writeFileSync(
      path.join(dir, 'upgrade/qa-diff-upgrade-20261121.json'),
      JSON.stringify({
        scenario: 'upgrade',
        verdict: 'FAIL',
        failures: ['Critical user asset deleted during upgrade: arc.db']
      })
    );
    fs.unlinkSync(path.join(dir, 'screenshots/settings-1366x768-125.png'));
    fs.writeFileSync(
      path.join(dir, 'diagnostics/arc-diagnostics-win11.json'),
      JSON.stringify({
        app: { version: '1.0.12', commit: 'deadbeef1234' },
        rawLeak: 'sk-1234567890abcdefghijklmnop'
      })
    );

    const result = validateWindowsQaBundle(dir, {
      expectedVersion: '1.0.12',
      expectedCommit: TEST_COMMIT
    });

    expect(result.verdict).toBe('BLOCKED');
    expect(result.gates.upgradePreservation.status).toBe('FAIL');
    expect(result.gates.uxScreenshots.status).toBe('FAIL');
    expect(result.gates.diagnosticsProvenance.status).toBe('FAIL');
    expect(result.blockingReasons.some((r: string) => r.includes('unredacted secret'))).toBe(true);
    expect(result.blockingReasons.some((r: string) => r.includes('does not match expected commit'))).toBe(true);
    expect(result.blockingReasons.some((r: string) => r.includes('1366x768 @ 125%'))).toBe(true);
  });

  it('fails closed when evidence directory does not exist', () => {
    const result = validateWindowsQaBundle(path.join(os.tmpdir(), 'arc-nonexistent-qa-bundle-xyz'));
    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockingReasons[0]).toContain('does not exist');
  });
});
