import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  formatBuildIdentity,
  getRuntimeBuildMetadata,
  normalizeCommitSha,
  UNKNOWN_BUILD_COMMIT,
} from './build-metadata';
import { resolveBuildMetadata } from './build-metadata.resolver';

describe('build-metadata & resolver (S3-10 accurate commit metadata)', () => {
  it('validates and normalizes 7-40 char hex commit SHAs and rejects malformed values', () => {
    expect(normalizeCommitSha('A3CD3ECB6D249EABD354023E0E5E1C220DB74BB0')).toEqual({
      short: 'a3cd3ec',
      full: 'a3cd3ecb6d249eabd354023e0e5e1c220db74bb0',
    });
    expect(normalizeCommitSha('  deadbee  ')).toEqual({
      short: 'deadbee',
      full: 'deadbee',
    });
    expect(normalizeCommitSha('')).toBeNull();
    expect(normalizeCommitSha('unknown')).toBeNull();
    expect(normalizeCommitSha('123456')).toBeNull();
    expect(normalizeCommitSha('zzzzzzz')).toBeNull();
    expect(normalizeCommitSha('a3cd3ec; rm -rf /')).toBeNull();
  });

  it('prefers BUILD_COMMIT over GITHUB_SHA, git HEAD, and .commit_hash', () => {
    const meta = resolveBuildMetadata({
      env: {
        BUILD_COMMIT: '1234567890abcdef1234567890abcdef12345678',
        GITHUB_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      packageVersion: '1.0.12',
      execGitRevParse: () => 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });

    expect(meta).toEqual({
      version: '1.0.12',
      commit: '1234567',
      commitFull: '1234567890abcdef1234567890abcdef12345678',
      commitSource: 'env',
    });
  });

  it('uses GITHUB_SHA when BUILD_COMMIT is absent', () => {
    const meta = resolveBuildMetadata({
      env: {
        GITHUB_SHA: 'abcdef1234567890abcdef1234567890abcdef12',
      },
      packageVersion: '1.0.12',
      execGitRevParse: () => {
        throw new Error('git unavailable');
      },
    });

    expect(meta.commit).toBe('abcdef1');
    expect(meta.commitSource).toBe('env');
  });

  it('falls back to live git HEAD then .commit_hash file when env vars are absent', () => {
    const fromGit = resolveBuildMetadata({
      env: {},
      packageVersion: '1.0.12',
      execGitRevParse: () => 'fedcba9876543210fedcba9876543210fedcba98',
    });
    expect(fromGit.commit).toBe('fedcba9');
    expect(fromGit.commitSource).toBe('git');

    const fromFile = resolveBuildMetadata({
      env: {},
      repoRoot: '/virtual/repo',
      packageVersion: '1.0.12',
      execGitRevParse: () => {
        throw new Error('no git');
      },
      existsSync: (target) => String(target).endsWith('.commit_hash'),
      readFileSync: () => '0123456789abcdef\n',
    });
    expect(fromFile.commit).toBe('0123456');
    expect(fromFile.commitSource).toBe('file');
  });

  it('returns explicit unknown in dev mode without git and never injects stale hardcoded 9048f71', () => {
    const meta = resolveBuildMetadata({
      env: {},
      repoRoot: '/virtual/no-git',
      packageVersion: '1.0.12',
      execGitRevParse: () => {
        throw new Error('fatal: not a git repository');
      },
      existsSync: () => false,
    });

    expect(meta.commit).toBe(UNKNOWN_BUILD_COMMIT);
    expect(meta.commitFull).toBe(UNKNOWN_BUILD_COMMIT);
    expect(meta.commitSource).toBe('unknown');
    expect(meta.commit).not.toBe('9048f71');
  });

  it('fails closed in CI/release builds when commit SHA is missing or malformed', () => {
    expect(() =>
      resolveBuildMetadata({
        env: { ARC_REQUIRE_BUILD_COMMIT: 'true' },
        repoRoot: '/virtual/no-git',
        packageVersion: '1.0.12',
        execGitRevParse: () => {
          throw new Error('no git');
        },
        existsSync: () => false,
      })
    ).toThrow(/Missing valid BUILD_COMMIT/);

    expect(() =>
      resolveBuildMetadata({
        env: {
          ARC_REQUIRE_BUILD_COMMIT: 'true',
          BUILD_COMMIT: 'not-a-sha',
        },
        packageVersion: '1.0.12',
      })
    ).toThrow(/Invalid BUILD_COMMIT/);
  });

  it('getRuntimeBuildMetadata never falls back to stale 9048f71 and formats version + commit cleanly', () => {
    const meta = getRuntimeBuildMetadata('1.0.12');
    expect(meta.version).toBe('1.0.12');
    expect(meta.commit).not.toBe('9048f71');
    expect(formatBuildIdentity({ version: '1.0.12', commit: 'a3cd3ec' })).toBe('v1.0.12 · a3cd3ec');
    expect(formatBuildIdentity({ version: '1.0.12', commit: 'unknown' })).toBe('v1.0.12 · unknown');
  });

  it('CI and Release workflows pass BUILD_COMMIT=${{ github.sha }} with ARC_REQUIRE_BUILD_COMMIT=true', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    for (const relPath of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
      const content = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
      expect(content).toContain('BUILD_COMMIT: ${{ github.sha }}');
      expect(content).toContain("ARC_REQUIRE_BUILD_COMMIT: 'true'");
    }
  });
});
