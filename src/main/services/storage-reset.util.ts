import * as fs from 'fs';
import * as path from 'path';
import {
  APP_DATA_RESET_LEGACY_DIR_NAMES,
  APP_DATA_RESET_OPTIONAL_MODELS_TARGET,
  APP_DATA_RESET_TARGETS,
  getAppDataPreservedAssetList,
  type ResetFailedTarget,
  type ResetSystemResult
} from '../../shared/config/reset-policy';

export interface StorageResetFsOps {
  existsSync: (targetPath: string) => boolean;
  rmSync: (targetPath: string, options?: fs.RmOptions) => void;
}

export interface ExecuteAppDataResetParams {
  dataDir: string;
  appDataDir: string;
  clearModels: boolean;
  platform?: NodeJS.Platform;
  closeDatabase: () => void;
  clearSessionStorage: () => Promise<void>;
  recreateBaseDirs: () => void;
  relaunchApp: () => boolean;
  fsOps?: StorageResetFsOps;
}

function normalizeForCompare(targetPath: string, platform: NodeJS.Platform): string {
  const resolved = path.resolve(targetPath);
  const trimmed = resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved;
  return platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

/**
 * Returns true if `candidatePath` is identical to `protectedPath` or is an ancestor
 * directory containing `protectedPath`. Used to prevent legacy AppData cleanup from
 * accidentally wiping active `dataDir` (which holds preserved Secret Vault & logs).
 */
export function isPathSameOrParent(
  candidatePath: string,
  protectedPath: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const normCandidate = normalizeForCompare(candidatePath, platform);
  const normProtected = normalizeForCompare(protectedPath, platform);
  if (normCandidate === normProtected) {
    return true;
  }
  const sep = platform === 'win32' ? '\\' : path.sep;
  const candidatePrefix = normCandidate.endsWith(sep) ? normCandidate : `${normCandidate}${sep}`;
  return normProtected.startsWith(candidatePrefix);
}

export function resolveSafeLegacyAppDataDirs(
  appDataDir: string,
  dataDir: string,
  platform: NodeJS.Platform = process.platform
): string[] {
  if (!appDataDir || !appDataDir.trim()) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const dirName of APP_DATA_RESET_LEGACY_DIR_NAMES) {
    const candidate = path.join(appDataDir, dirName);
    const dedupeKey = normalizeForCompare(candidate, platform);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    if (isPathSameOrParent(candidate, dataDir, platform)) {
      continue;
    }
    result.push(candidate);
  }

  return result;
}

export function buildAppDataResetTargets(dataDir: string, clearModels: boolean): string[] {
  const targets = APP_DATA_RESET_TARGETS.map((entry) => path.join(dataDir, entry));
  if (clearModels) {
    targets.push(path.join(dataDir, APP_DATA_RESET_OPTIONAL_MODELS_TARGET));
  }
  return targets;
}

export async function executeAppDataReset(
  params: ExecuteAppDataResetParams
): Promise<ResetSystemResult> {
  const {
    dataDir,
    appDataDir,
    clearModels,
    platform = process.platform,
    closeDatabase,
    clearSessionStorage,
    recreateBaseDirs,
    relaunchApp
  } = params;

  const fsOps: StorageResetFsOps = params.fsOps || {
    existsSync: fs.existsSync,
    rmSync: fs.rmSync
  };

  const preservedAssets = getAppDataPreservedAssetList({ clearModels });
  const removedTargets: string[] = [];
  const failedTargets: ResetFailedTarget[] = [];

  console.log(
    '[StorageManager] Executing Variant A configuration and data reset (preserving Secret Vault, logs, backups, TTS dicts/policy)...',
    { clearModels }
  );

  // 1. Close SQLite database cleanly before removing DB files
  try {
    closeDatabase();
  } catch (err: any) {
    console.warn('[StorageManager] Error closing database during reset:', err);
  }

  // 2. Clear Chromium / Electron session storage
  try {
    await clearSessionStorage();
  } catch (err: any) {
    const message = err?.message || String(err);
    console.warn('[StorageManager] Error clearing electron session data:', err);
    failedTargets.push({ target: 'session:defaultSession', error: message });
  }

  // 3. Safely remove legacy %APPDATA% profile directories (skip if overlapping dataDir)
  const legacyDirs = resolveSafeLegacyAppDataDirs(appDataDir, dataDir, platform);
  for (const legacyDir of legacyDirs) {
    try {
      if (fsOps.existsSync(legacyDir)) {
        console.log(`[StorageManager] Removing legacy AppData directory: ${legacyDir}`);
        fsOps.rmSync(legacyDir, { recursive: true, force: true });
        removedTargets.push(legacyDir);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      console.warn(`[StorageManager] Failed to delete legacy directory ${legacyDir}:`, err);
      failedTargets.push({ target: legacyDir, error: message });
    }
  }

  // 4. Clean explicitly declared Variant A targets inside dataDir
  const cleanTargets = buildAppDataResetTargets(dataDir, clearModels);
  for (const target of cleanTargets) {
    try {
      if (fsOps.existsSync(target)) {
        console.log(`[StorageManager] Removing reset target: ${target}`);
        fsOps.rmSync(target, { recursive: true, force: true });
        removedTargets.push(target);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      console.warn(`[StorageManager] Failed to remove reset target ${target}:`, err);
      failedTargets.push({ target, error: message });
    }
  }

  // 5. Recreate required base directories so app remains in a valid layout
  try {
    recreateBaseDirs();
  } catch (err: any) {
    const message = err?.message || String(err);
    console.warn('[StorageManager] Failed to recreate base directories after reset:', err);
    failedTargets.push({ target: 'initPortablePaths', error: message });
  }

  // Fail honestly if any target failed to delete — never silently mask failure with relaunch
  if (failedTargets.length > 0) {
    const summary = failedTargets.map((f) => `${path.basename(f.target)}: ${f.error}`).join('; ');
    return {
      success: false,
      mode: 'app_data_and_config',
      clearModels,
      removedTargets,
      preservedAssets,
      failedTargets,
      relaunched: false,
      error: `Не удалось удалить часть данных (${failedTargets.length}): ${summary}`
    };
  }

  // 6. Relaunch cleanly only after verified target removal
  try {
    const relaunched = relaunchApp();
    return {
      success: true,
      mode: 'app_data_and_config',
      clearModels,
      removedTargets,
      preservedAssets,
      failedTargets: [],
      relaunched
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[StorageManager] Error relaunching app after reset:', err);
    return {
      success: false,
      mode: 'app_data_and_config',
      clearModels,
      removedTargets,
      preservedAssets,
      failedTargets: [],
      relaunched: false,
      error: message
    };
  }
}
