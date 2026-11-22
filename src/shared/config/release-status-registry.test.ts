import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const snapshotComparator = require('../../../scripts/compare-qa-snapshots.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

interface RegistryTask {
  id: string;
  auditIds: string[];
  sprint: string;
  title: string;
  status: 'NOT_STARTED' | 'PLAN_READY' | 'APPROVED' | 'IMPLEMENTED' | 'VERIFIED' | 'ALREADY_FIXED' | 'BLOCKED' | 'REJECTED';
  linuxVerified: boolean;
  windowsQaStatus: 'VERIFIED' | 'NOT_RUN' | 'N/A';
  testSuites: string[];
  evidence: string[];
  notes: string;
  updatedAt: string;
}

interface ReleaseStatusRegistry {
  schemaVersion: number;
  project: string;
  version: string;
  releaseStatus: string;
  signingStatus: string;
  distributionPolicy: string;
  handoffRunbook: string;
  qaProtocol: string;
  tasks: RegistryTask[];
}

describe('Audit §7.4 Release Status Registry & S4-02 QA Snapshot Comparator', () => {
  it('validates docs/release-status-registry.json schema, completeness, honesty invariants, and existing test references', () => {
    const registryPath = path.join(REPO_ROOT, 'docs', 'release-status-registry.json');
    expect(fs.existsSync(registryPath)).toBe(true);

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as ReleaseStatusRegistry;
    expect(registry.schemaVersion).toBe(1);
    expect(registry.signingStatus).toBe('UNSIGNED');
    expect(registry.distributionPolicy).toBe('non-commercial-open-source');
    expect(fs.existsSync(path.join(REPO_ROOT, registry.handoffRunbook))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, registry.qaProtocol))).toBe(true);

    const expectedTaskIds = [
      'S0-01', 'S0-02', 'S0-03', 'S0-04', 'S0-05',
      'S1-01', 'S1-02', 'S1-03', 'S1-04', 'S1-05',
      'S2-01', 'S2-02', 'S2-03', 'S2-04', 'S2-05', 'S2-06', 'S2-07',
      'S3-01', 'S3-02', 'S3-03', 'S3-04', 'S3-05', 'S3-06', 'S3-07', 'S3-08', 'S3-09', 'S3-10', 'S3-11', 'S3-12',
      'S4-01', 'S4-02', 'S4-03', 'S4-04', 'S4-05', 'S4-06',
      'SEC-09', 'SEC-10', 'SEC-11'
    ];

    const seenIds = new Set<string>();
    for (const task of registry.tasks) {
      expect(seenIds.has(task.id)).toBe(false);
      seenIds.add(task.id);

      // Honesty invariant: a task whose Windows QA is NOT_RUN must NEVER be marked VERIFIED.
      if (task.windowsQaStatus === 'NOT_RUN') {
        expect(task.status).not.toBe('VERIFIED');
      }

      // Every referenced test suite path must exist on disk.
      for (const suite of task.testSuites) {
        expect(fs.existsSync(path.join(REPO_ROOT, suite))).toBe(true);
      }
    }

    for (const id of expectedTaskIds) {
      expect(seenIds.has(id)).toBe(true);
    }

    // Ensure every Audit P0..P2 defect ID is mapped at least once.
    const mappedAuditIds = new Set(registry.tasks.flatMap((t) => t.auditIds));
    const expectedAuditIds = [
      'P0-01', 'P0-02',
      'P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05', 'P1-06', 'P1-07', 'P1-08', 'P1-09', 'P1-10', 'P1-11', 'P1-12',
      'P2-01', 'P2-02', 'P2-03', 'P2-04', 'P2-05', 'P2-06', 'P2-07', 'P2-08', 'P2-09', 'P2-10', 'P2-11', 'P2-12'
    ];
    for (const auditId of expectedAuditIds) {
      expect(mappedAuditIds.has(auditId)).toBe(true);
    }
  });

  it('passes upgrade snapshot comparison when DB migrates (modified hash) and secrets/models are preserved', () => {
    const before = {
      capturedAt: '2026-11-21T10:00:00Z',
      userDataExists: true,
      userDataSnapshot: [
        { path: 'arc.db', exists: true, type: 'file', sizeBytes: 40960, sha256: 'aaa' },
        { path: 'secrets.json', exists: true, type: 'file', sizeBytes: 512, sha256: 'bbb' },
        { path: 'tts-policy.json', exists: true, type: 'file', sizeBytes: 96, sha256: 'ccc' },
        { path: 'models', exists: true, type: 'directory', fileCount: 4, sizeBytes: 120000 }
      ]
    };
    const after = {
      capturedAt: '2026-11-21T10:05:00Z',
      userDataExists: true,
      userDataSnapshot: [
        { path: 'arc.db', exists: true, type: 'file', sizeBytes: 45056, sha256: 'aaa-v8' },
        { path: 'secrets.json', exists: true, type: 'file', sizeBytes: 512, sha256: 'bbb' },
        { path: 'tts-policy.json', exists: true, type: 'file', sizeBytes: 96, sha256: 'ccc' },
        { path: 'models', exists: true, type: 'directory', fileCount: 4, sizeBytes: 120000 },
        { path: 'backups', exists: true, type: 'directory', fileCount: 2, sizeBytes: 41000 }
      ]
    };

    const report = snapshotComparator.compareQaSnapshots(before, after, { scenario: 'upgrade' });
    expect(report.verdict).toBe('PASS');
    expect(report.failures).toEqual([]);
  });

  it('fails snapshot comparison if critical user assets are deleted, truncated, or lost on uninstall', () => {
    const before = {
      capturedAt: '2026-11-21T10:00:00Z',
      userDataExists: true,
      userDataSnapshot: [
        { path: 'arc.db', exists: true, type: 'file', sizeBytes: 40960, sha256: 'aaa' },
        { path: 'secrets.json', exists: true, type: 'file', sizeBytes: 512, sha256: 'bbb' },
        { path: 'macros', exists: true, type: 'directory', fileCount: 3, sizeBytes: 1500 }
      ]
    };
    const afterBroken = {
      capturedAt: '2026-11-21T10:05:00Z',
      userDataExists: true,
      userDataSnapshot: [
        { path: 'arc.db', exists: true, type: 'file', sizeBytes: 0, sha256: 'empty' },
        { path: 'secrets.json', exists: false, type: 'missing', sizeBytes: 0, sha256: null },
        { path: 'macros', exists: true, type: 'directory', fileCount: 0, sizeBytes: 0 }
      ]
    };

    const upgradeReport = snapshotComparator.compareQaSnapshots(before, afterBroken, { scenario: 'upgrade' });
    expect(upgradeReport.verdict).toBe('FAIL');
    expect(upgradeReport.failures.some((f: string) => f.includes('arc.db'))).toBe(true);
    expect(upgradeReport.failures.some((f: string) => f.includes('secrets.json'))).toBe(true);
    expect(upgradeReport.failures.some((f: string) => f.includes('macros'))).toBe(true);

    // Uninstall must also fail if a critical file hash changes unexpectedly
    const afterUninstallMutated = {
      capturedAt: '2026-11-21T10:10:00Z',
      userDataExists: true,
      userDataSnapshot: [
        { path: 'arc.db', exists: true, type: 'file', sizeBytes: 40960, sha256: 'mutated' },
        { path: 'secrets.json', exists: true, type: 'file', sizeBytes: 512, sha256: 'bbb' },
        { path: 'macros', exists: true, type: 'directory', fileCount: 3, sizeBytes: 1500 }
      ]
    };
    const uninstallReport = snapshotComparator.compareQaSnapshots(before, afterUninstallMutated, { scenario: 'uninstall' });
    expect(uninstallReport.verdict).toBe('FAIL');
    expect(uninstallReport.failures.some((f: string) => f.includes('unexpectedly modified during uninstall'))).toBe(true);
  });
});
