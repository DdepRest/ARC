import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { clearStorageDataMock, relaunchMock, exitMock } = vi.hoisted(() => ({
  clearStorageDataMock: vi.fn().mockResolvedValue(undefined),
  relaunchMock: vi.fn(),
  exitMock: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => os.tmpdir()),
    getVersion: vi.fn(() => '1.0.12-test'),
    setPath: vi.fn(),
    relaunch: relaunchMock,
    exit: exitMock
  },
  dialog: { showSaveDialog: vi.fn() },
  shell: { openPath: vi.fn() },
  session: {
    defaultSession: { clearStorageData: clearStorageDataMock }
  },
  BrowserWindow: vi.fn()
}));

import { DatabaseService } from './database';
import { StorageManagerService } from './storage-manager.service';
import {
  getAppDataResetDisclosure,
  getUiResetDisclosure,
  normalizeResetOptions
} from '../../shared/config/reset-policy';
import { isPathSameOrParent, resolveSafeLegacyAppDataDirs } from './storage-reset.util';

function seedFullDataDir(dataDir: string, legacyAppDataDir: string) {
  // Removable Variant A targets
  const removableDirs = [
    'database',
    'config',
    'cache',
    'macros',
    'Partitions',
    'Local Storage',
    'IndexedDB',
    'Session Storage',
    'Network',
    'GPUCache'
  ];
  for (const dir of removableDirs) {
    const full = path.join(dataDir, dir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, 'sample.dat'), `payload-${dir}`, 'utf8');
  }
  fs.writeFileSync(path.join(dataDir, 'arc.db'), 'sqlite-bytes', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'arc.db-wal'), 'wal-bytes', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'arc.db-shm'), 'shm-bytes', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'arc.db_fallback.json'), '{"ltm":[]}', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'arc-performance-settings.json'), '{"preset":"High"}', 'utf8');

  // Optional models target
  fs.mkdirSync(path.join(dataDir, 'models'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'models', 'qwen.gguf'), 'MODEL_WEIGHTS', 'utf8');

  // Strictly preserved Variant A assets
  fs.writeFileSync(path.join(dataDir, 'secrets.json'), '{"schemaVersion":2,"entries":{"k":"DPAPI"}}', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'secrets.json.corrupt.170000.bak'), 'CORRUPT_BACKUP', 'utf8');
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'logs', 'app.log'), 'AUDIT_LOG_LINE', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'csp-violations.log'), 'CSP_ENTRY', 'utf8');
  fs.mkdirSync(path.join(dataDir, 'backups', 'pre-migration-v7'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'backups', 'pre-migration-v7', 'arc.db'), 'BACKUP_DB', 'utf8');
  fs.mkdirSync(path.join(dataDir, 'tts_dicts'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'tts_dicts', 'user.json'), '{"ARC":"Арк"}', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'tts-policy.json'), '{"allowCloudTtsFallback":false}', 'utf8');

  // Legacy AppData dirs outside dataDir
  for (const legacyName of ['a.r.c', 'A.R.C', 'arc']) {
    const legacyDir = path.join(legacyAppDataDir, legacyName);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'legacy.json'), 'old', 'utf8');
  }
}

describe('S3-08 — Reset semantics (Variant A)', () => {
  let tmpRoot: string;
  let dataDir: string;
  let appDataDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-reset-s308-'));
    dataDir = path.join(tmpRoot, 'portable-data');
    appDataDir = path.join(tmpRoot, 'fake-appdata');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(appDataDir, { recursive: true });
    StorageManagerService.setDataDirForTests(dataDir);
    StorageManagerService.setAppDataDirForTests(appDataDir);
  });

  afterEach(() => {
    DatabaseService.close();
    StorageManagerService.setDataDirForTests('');
    StorageManagerService.setAppDataDirForTests(null);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('removes exact Variant A targets and strictly preserves Secret Vault, logs, backups, TTS dicts/policy, and models by default', async () => {
    seedFullDataDir(dataDir, appDataDir);
    const closeSpy = vi.spyOn(DatabaseService, 'close');

    const res = await StorageManagerService.resetSystemData();

    expect(res.success).toBe(true);
    expect(res.mode).toBe('app_data_and_config');
    expect(res.clearModels).toBe(false);
    expect(res.failedTargets).toEqual([]);
    expect(res.relaunched).toBe(true);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(clearStorageDataMock).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(0);

    // Removable payloads are gone (base folders database/config/cache/macros recreated empty)
    for (const recreated of ['database', 'config', 'cache', 'macros']) {
      expect(fs.existsSync(path.join(dataDir, recreated))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, recreated, 'sample.dat'))).toBe(false);
    }
    for (const removedOnly of [
      'Partitions',
      'Local Storage',
      'IndexedDB',
      'Session Storage',
      'Network',
      'GPUCache',
      'arc.db',
      'arc.db-wal',
      'arc.db-shm',
      'arc.db_fallback.json',
      'arc-performance-settings.json'
    ]) {
      expect(fs.existsSync(path.join(dataDir, removedOnly)), `${removedOnly} should be removed`).toBe(false);
    }

    // Legacy AppData dirs removed
    expect(fs.existsSync(path.join(appDataDir, 'a.r.c'))).toBe(false);
    expect(fs.existsSync(path.join(appDataDir, 'A.R.C'))).toBe(false);
    expect(fs.existsSync(path.join(appDataDir, 'arc'))).toBe(false);

    // Strictly preserved Variant A assets remain completely intact
    expect(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8')).toContain('DPAPI');
    expect(fs.readFileSync(path.join(dataDir, 'secrets.json.corrupt.170000.bak'), 'utf8')).toBe('CORRUPT_BACKUP');
    expect(fs.readFileSync(path.join(dataDir, 'logs', 'app.log'), 'utf8')).toBe('AUDIT_LOG_LINE');
    expect(fs.readFileSync(path.join(dataDir, 'csp-violations.log'), 'utf8')).toBe('CSP_ENTRY');
    expect(fs.readFileSync(path.join(dataDir, 'backups', 'pre-migration-v7', 'arc.db'), 'utf8')).toBe('BACKUP_DB');
    expect(fs.readFileSync(path.join(dataDir, 'tts_dicts', 'user.json'), 'utf8')).toContain('Арк');
    expect(fs.readFileSync(path.join(dataDir, 'tts-policy.json'), 'utf8')).toContain('allowCloudTtsFallback');
    expect(fs.readFileSync(path.join(dataDir, 'models', 'qwen.gguf'), 'utf8')).toBe('MODEL_WEIGHTS');
    expect(res.preservedAssets).toContain('secrets.json');
    expect(res.preservedAssets).toContain('models');
  });

  it('removes models/ only when clearModels: true while still preserving Secret Vault, logs, backups, and TTS user files', async () => {
    seedFullDataDir(dataDir, appDataDir);

    const res = await StorageManagerService.resetSystemData({ clearModels: true });

    expect(res.success).toBe(true);
    expect(res.clearModels).toBe(true);
    expect(res.preservedAssets).not.toContain('models');
    expect(fs.existsSync(path.join(dataDir, 'models', 'qwen.gguf'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'models'))).toBe(true); // recreated empty by initPortablePaths

    // Vault, logs, backups, TTS dicts & policy MUST still survive
    expect(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8')).toContain('DPAPI');
    expect(fs.readFileSync(path.join(dataDir, 'logs', 'app.log'), 'utf8')).toBe('AUDIT_LOG_LINE');
    expect(fs.readFileSync(path.join(dataDir, 'csp-violations.log'), 'utf8')).toBe('CSP_ENTRY');
    expect(fs.readFileSync(path.join(dataDir, 'backups', 'pre-migration-v7', 'arc.db'), 'utf8')).toBe('BACKUP_DB');
    expect(fs.readFileSync(path.join(dataDir, 'tts_dicts', 'user.json'), 'utf8')).toContain('Арк');
    expect(fs.readFileSync(path.join(dataDir, 'tts-policy.json'), 'utf8')).toContain('allowCloudTtsFallback');
  });

  it('skips legacy AppData removal when legacy path equals or contains active dataDir (prevents wiping Vault/logs)', async () => {
    const overlappingDataDir = path.join(appDataDir, 'a.r.c');
    fs.mkdirSync(overlappingDataDir, { recursive: true });
    StorageManagerService.setDataDirForTests(overlappingDataDir);
    seedFullDataDir(overlappingDataDir, appDataDir);

    const res = await StorageManagerService.resetSystemData({ clearModels: false });

    expect(res.success).toBe(true);
    expect(fs.readFileSync(path.join(overlappingDataDir, 'secrets.json'), 'utf8')).toContain('DPAPI');
    expect(fs.readFileSync(path.join(overlappingDataDir, 'logs', 'app.log'), 'utf8')).toBe('AUDIT_LOG_LINE');
    expect(fs.existsSync(path.join(overlappingDataDir, 'arc.db'))).toBe(false);

    // Case-insensitive Windows check
    expect(
      isPathSameOrParent('C:\\Users\\Operator\\AppData\\Roaming\\A.R.C', 'c:\\users\\operator\\appdata\\roaming\\a.r.c\\data', 'win32')
    ).toBe(true);
    const safeDirs = resolveSafeLegacyAppDataDirs(
      'C:\\Users\\Operator\\AppData\\Roaming',
      'c:\\users\\operator\\appdata\\roaming\\a.r.c',
      'win32'
    );
    expect(safeDirs.some((d) => d.toLowerCase().endsWith('\\a.r.c'))).toBe(false);
  });

  it('fails honestly without relaunching when a target cannot be deleted (e.g. Windows EBUSY lock)', async () => {
    seedFullDataDir(dataDir, appDataDir);

    const res = await StorageManagerService.resetSystemData(
      { clearModels: false },
      {
        existsSync: fs.existsSync,
        rmSync: (targetPath, opts) => {
          if (targetPath.endsWith(path.join('data', 'database')) || path.basename(targetPath) === 'database') {
            const err: any = new Error('EBUSY: resource busy or locked');
            err.code = 'EBUSY';
            throw err;
          }
          fs.rmSync(targetPath, opts);
        }
      }
    );

    expect(res.success).toBe(false);
    expect(res.relaunched).toBe(false);
    expect(res.failedTargets.length).toBe(1);
    expect(res.failedTargets[0].error).toContain('EBUSY');
    expect(res.error).toContain('EBUSY');
    expect(relaunchMock).not.toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('rejects malformed or unsupported reset options fail-closed without touching disk', () => {
    expect(normalizeResetOptions(undefined)).toEqual({ valid: true, options: { clearModels: false } });
    expect(normalizeResetOptions({ clearModels: true })).toEqual({ valid: true, options: { clearModels: true } });
    expect(normalizeResetOptions('yes').valid).toBe(false);
    expect(normalizeResetOptions({ clearModels: 'true' }).valid).toBe(false);
    expect(normalizeResetOptions({ deleteVault: true }).valid).toBe(false);
    expect(normalizeResetOptions({ factoryReset: true }).valid).toBe(false);
  });

  it('keeps UI and AppData disclosures aligned with Variant A and clearModels toggle', () => {
    const ui = getUiResetDisclosure();
    expect(ui.requiresRestart).toBe(false);
    expect(ui.willPreserve.some((i) => i.id === 'secret-vault')).toBe(true);
    expect(ui.willPreserve.some((i) => i.id === 'sqlite-db')).toBe(true);

    const dataDefault = getAppDataResetDisclosure({ clearModels: false });
    expect(dataDefault.requiresRestart).toBe(true);
    expect(dataDefault.willPreserve.some((i) => i.id === 'secret-vault')).toBe(true);
    expect(dataDefault.willPreserve.some((i) => i.id === 'logs-audit')).toBe(true);
    expect(dataDefault.willPreserve.some((i) => i.id === 'models')).toBe(true);
    expect(dataDefault.willDelete.some((i) => i.id === 'models')).toBe(false);

    const dataWithModels = getAppDataResetDisclosure({ clearModels: true });
    expect(dataWithModels.willDelete.some((i) => i.id === 'models')).toBe(true);
    expect(dataWithModels.willPreserve.some((i) => i.id === 'models')).toBe(false);
    expect(dataWithModels.willPreserve.some((i) => i.id === 'secret-vault')).toBe(true);
    expect(dataWithModels.willPreserve.some((i) => i.id === 'logs-audit')).toBe(true);
  });
});
