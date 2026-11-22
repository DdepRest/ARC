import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  normalizeCommitSha,
  UNKNOWN_BUILD_COMMIT,
  type AppBuildMetadata,
} from './build-metadata';

export interface ResolveBuildMetadataOptions {
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  packageVersion?: string;
  existsSync?: (target: fs.PathLike) => boolean;
  readFileSync?: (target: fs.PathLike, encoding: BufferEncoding) => string;
  execGitRevParse?: (repoRoot: string) => string;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function readPackageVersion(
  repoRoot: string,
  existsFn: (target: fs.PathLike) => boolean,
  readFileFn: (target: fs.PathLike, encoding: BufferEncoding) => string
): string {
  try {
    const pkgPath = path.resolve(repoRoot, 'package.json');
    if (existsFn(pkgPath)) {
      const parsed = JSON.parse(readFileFn(pkgPath, 'utf-8'));
      if (typeof parsed?.version === 'string' && parsed.version.trim().length > 0) {
        return parsed.version.trim();
      }
    }
  } catch {
    // Fallback handled below
  }
  return UNKNOWN_BUILD_COMMIT;
}

function defaultExecGitRevParse(repoRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf-8',
  }).trim();
}

/**
 * Resolves build version and commit SHA at build time.
 *
 * Resolution order:
 *   1. env.BUILD_COMMIT (explicit CI/release override)
 *   2. env.GITHUB_SHA (GitHub Actions commit SHA)
 *   3. Live `git rev-parse HEAD` (execFileSync without shell)
 *   4. `.commit_hash` file in repo root
 *
 * Never substitutes a hardcoded historical commit SHA.
 * If ARC_REQUIRE_BUILD_COMMIT=true or ARC_RELEASE_BUILD=true and no valid SHA is resolved,
 * throws an error to fail closed in CI/release builds.
 */
export function resolveBuildMetadata(options?: ResolveBuildMetadataOptions): AppBuildMetadata {
  const env = options?.env ?? process.env;
  const repoRoot = options?.repoRoot ?? process.cwd();
  const existsFn = options?.existsSync ?? fs.existsSync;
  const readFileFn =
    options?.readFileSync ?? ((target, encoding) => fs.readFileSync(target, encoding));
  const execGitFn = options?.execGitRevParse ?? defaultExecGitRevParse;

  const requireCommit =
    isTruthyEnv(env.ARC_REQUIRE_BUILD_COMMIT) || isTruthyEnv(env.ARC_RELEASE_BUILD);
  const version =
    typeof options?.packageVersion === 'string' && options.packageVersion.trim().length > 0
      ? options.packageVersion.trim()
      : readPackageVersion(repoRoot, existsFn, readFileFn);

  // 1. Explicit BUILD_COMMIT env var
  const rawBuildCommit = env.BUILD_COMMIT?.trim();
  if (rawBuildCommit) {
    const normalized = normalizeCommitSha(rawBuildCommit);
    if (normalized) {
      return {
        version,
        commit: normalized.short,
        commitFull: normalized.full,
        commitSource: 'env',
      };
    }
    if (requireCommit) {
      throw new Error(
        `[BuildMetadata] Invalid BUILD_COMMIT="${rawBuildCommit}" for CI/release build. Expected 7-40 hex characters.`
      );
    }
  }

  // 2. GitHub Actions GITHUB_SHA env var
  const rawGithubSha = env.GITHUB_SHA?.trim();
  if (rawGithubSha) {
    const normalized = normalizeCommitSha(rawGithubSha);
    if (normalized) {
      return {
        version,
        commit: normalized.short,
        commitFull: normalized.full,
        commitSource: 'env',
      };
    }
  }

  // 3. Local git HEAD (no shell)
  try {
    const gitHash = execGitFn(repoRoot);
    const normalized = normalizeCommitSha(gitHash);
    if (normalized) {
      return {
        version,
        commit: normalized.short,
        commitFull: normalized.full,
        commitSource: 'git',
      };
    }
  } catch {
    // Non-git environment (e.g. exported source archive / container)
  }

  // 4. Optional .commit_hash file
  try {
    const commitFile = path.resolve(repoRoot, '.commit_hash');
    if (existsFn(commitFile)) {
      const fileHash = readFileFn(commitFile, 'utf-8');
      const normalized = normalizeCommitSha(fileHash);
      if (normalized) {
        return {
          version,
          commit: normalized.short,
          commitFull: normalized.full,
          commitSource: 'file',
        };
      }
    }
  } catch {
    // Ignore unreadable .commit_hash
  }

  // 5. Fail-closed gate for CI / release builds; explicit 'unknown' for local dev
  if (requireCommit) {
    throw new Error(
      '[BuildMetadata] Missing valid BUILD_COMMIT for CI/release build. Refusing to build artifact without verified commit SHA.'
    );
  }

  return {
    version,
    commit: UNKNOWN_BUILD_COMMIT,
    commitFull: UNKNOWN_BUILD_COMMIT,
    commitSource: 'unknown',
  };
}
