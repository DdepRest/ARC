export type BuildCommitSource = 'env' | 'git' | 'file' | 'unknown';

export interface AppBuildMetadata {
  version: string;
  commit: string;
  commitFull: string;
  commitSource: BuildCommitSource;
}

export const UNKNOWN_BUILD_COMMIT = 'unknown';

const VALID_HEX_SHA_RE = /^[0-9a-f]{7,40}$/i;

/**
 * Validates and normalizes a Git commit SHA (7-40 hex chars).
 * Returns null for empty, placeholder, or malformed strings.
 */
export function normalizeCommitSha(raw: unknown): { short: string; full: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!VALID_HEX_SHA_RE.test(trimmed)) return null;
  const full = trimmed.toLowerCase();
  return {
    short: full.slice(0, 7),
    full,
  };
}

function readCompileTimeString(getter: () => unknown): string | null {
  try {
    const val = getter();
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  } catch {
    // Define not injected in direct Node/Vitest execution
  }
  return null;
}

/**
 * Returns the compile-time build metadata injected by electron-vite for both Main and Renderer.
 * Never falls back to a stale hardcoded commit SHA.
 */
export function getRuntimeBuildMetadata(versionOverride?: string): AppBuildMetadata {
  const rawCommit = readCompileTimeString(() => __BUILD_COMMIT__);
  const rawCommitFull = readCompileTimeString(() => __BUILD_COMMIT_FULL__);
  const rawSource = readCompileTimeString(() => __BUILD_COMMIT_SOURCE__);
  const rawVersion = readCompileTimeString(() => __APP_VERSION__);

  const normalizedShort = normalizeCommitSha(rawCommit);
  const normalizedFull = normalizeCommitSha(rawCommitFull);

  const commit = normalizedShort?.short ?? normalizedFull?.short ?? UNKNOWN_BUILD_COMMIT;
  const commitFull = normalizedFull?.full ?? normalizedShort?.full ?? UNKNOWN_BUILD_COMMIT;

  const commitSource: BuildCommitSource =
    commit === UNKNOWN_BUILD_COMMIT
      ? 'unknown'
      : rawSource === 'env' || rawSource === 'git' || rawSource === 'file'
        ? rawSource
        : 'env';

  const version =
    (typeof versionOverride === 'string' && versionOverride.trim().length > 0
      ? versionOverride.trim()
      : null) ??
    rawVersion ??
    UNKNOWN_BUILD_COMMIT;

  return {
    version,
    commit,
    commitFull,
    commitSource,
  };
}

export function formatBuildIdentity(meta: Pick<AppBuildMetadata, 'version' | 'commit'>): string {
  const versionLabel = meta.version && meta.version !== UNKNOWN_BUILD_COMMIT ? `v${meta.version}` : 'v?';
  const commitLabel = meta.commit && meta.commit !== UNKNOWN_BUILD_COMMIT ? meta.commit : UNKNOWN_BUILD_COMMIT;
  return `${versionLabel} · ${commitLabel}`;
}
