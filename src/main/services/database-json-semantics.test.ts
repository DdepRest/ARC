import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';

const { appState, showSaveDialogMock } = vi.hoisted(() => ({
  appState: { isPackaged: false, dataDir: '' },
  showSaveDialogMock: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: vi.fn(() => appState.dataDir || os.tmpdir()),
    getVersion: vi.fn(() => '2.5.0-test')
  },
  dialog: {
    showSaveDialog: showSaveDialogMock
  },
  shell: { openPath: vi.fn() },
  session: { defaultSession: { clearStorageData: vi.fn() } },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null)
  }
}));

vi.mock('systeminformation', () => ({
  currentLoad: vi.fn().mockResolvedValue({ currentLoad: 10 }),
  graphics: vi.fn().mockResolvedValue({ controllers: [] }),
  cpuTemperature: vi.fn().mockResolvedValue({ main: 40 })
}));

vi.mock('./llm/providers/provider-manager', () => ({
  providerManager: {
    getProviders: vi.fn().mockResolvedValue([])
  }
}));

import { DatabaseService, JSONDatabase } from './database';
import { DiagnosticsService } from './diagnostics.service';
import { StorageManagerService } from './storage-manager.service';
import { readZipArchiveEntries } from '../utils/zip-writer';

describe('S3-02 (P2-01) — JSONDatabase honest storage semantics & split-brain prevention', () => {
  let tmpDir: string;
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-json-semantics-'));
    dbDir = path.join(tmpDir, 'database');
    fs.mkdirSync(dbDir, { recursive: true });
    dbPath = path.join(dbDir, 'arc.db');
    appState.dataDir = tmpDir;
    appState.isPackaged = false;
    StorageManagerService.setDataDirForTests(tmpDir);
  });

  afterEach(() => {
    DatabaseService.close();
    StorageManagerService.setDataDirForTests('');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1. JSONDatabase honestly reports no ACID transactions or rollback and distinguishes volatile vs test vs degraded storage', () => {
    const volatileDb = new JSONDatabase(path.join(tmpDir, 'volatile.json'), {
      inMemoryOnly: true,
      safeModeReadOnly: true
    });
    expect(volatileDb.supportsTransactions).toBe(false);
    expect(volatileDb.supportsRollback).toBe(false);
    expect(volatileDb.getStorageStatus()).toBe('VOLATILE_STORAGE');

    const testDb = new JSONDatabase(path.join(tmpDir, 'test.json'), { isTestMode: true });
    expect(testDb.supportsTransactions).toBe(false);
    expect(testDb.supportsRollback).toBe(false);
    expect(testDb.getStorageStatus()).toBe('TEST_EPHEMERAL');

    const degradedDb = new JSONDatabase(path.join(tmpDir, 'degraded.json'));
    expect(degradedDb.supportsTransactions).toBe(false);
    expect(degradedDb.supportsRollback).toBe(false);
    expect(degradedDb.getStorageStatus()).toBe('PERSISTENT_JSON_DEGRADED');
  });

  it('2. Dev non-packaged without SQLite and WITHOUT existing arc.db enters DEGRADED (json-degraded, PERSISTENT_JSON_DEGRADED), never PERSISTENT_SQLITE', () => {
    const health = DatabaseService.initWithConfig({
      dbPath,
      DatabaseClass: undefined,
      isTestEnv: false,
      isPackaged: false,
      allowDevJsonFallback: true
    });

    expect(health.mode).toBe('DEGRADED');
    expect(health.isSafeMode).toBe(false);
    expect(health.readOnly).toBe(false);
    expect(health.engine).toBe('json-degraded');
    expect(health.storageStatus).toBe('PERSISTENT_JSON_DEGRADED');
    expect(health.storageStatus).not.toBe('PERSISTENT_SQLITE');
    expect(health.capabilities).toEqual({
      persistent: true,
      supportsTransactions: false,
      supportsRollback: false,
      supportsFts5: false,
      supportsForeignKeys: false,
      supportsSqlIndexes: false
    });
    expect(health.limitations && health.limitations.length).toBeGreaterThan(0);

    // Persists to arc_fallback.json
    DatabaseService.db.exec('CREATE TABLE IF NOT EXISTS test_items (id TEXT PRIMARY KEY)');
    DatabaseService.db.prepare('INSERT INTO test_items (id) VALUES (?)').run('item-1');
    expect(fs.existsSync(path.join(dbDir, 'arc_fallback.json'))).toBe(true);
  });

  it('3. Dev non-packaged without SQLite when arc.db ALREADY EXISTS strictly enters DB_SAFE_MODE (prevents split-brain)', () => {
    const originalBytes = Buffer.from('SQLite format 3\0-REAL-USER-DB-DATA');
    fs.writeFileSync(dbPath, originalBytes);

    const health = DatabaseService.initWithConfig({
      dbPath,
      DatabaseClass: undefined,
      isTestEnv: false,
      isPackaged: false,
      allowDevJsonFallback: true
    });

    expect(health.mode).toBe('DB_SAFE_MODE');
    expect(health.isSafeMode).toBe(true);
    expect(health.readOnly).toBe(true);
    expect(health.engine).toBe('json-safe-mode');
    expect(health.storageStatus).toBe('VOLATILE_STORAGE');
    expect(health.capabilities?.persistent).toBe(false);
    expect(health.capabilities?.supportsTransactions).toBe(false);
    expect(health.limitations && health.limitations.length).toBeGreaterThan(0);

    // Original arc.db untouched and no arc_fallback.json created
    expect(fs.readFileSync(dbPath).equals(originalBytes)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'arc_fallback.json'))).toBe(false);
  });

  it('4. Packaged production without SQLite ALWAYS enters strict read-only DB_SAFE_MODE even if allowDevJsonFallback is passed', () => {
    const health = DatabaseService.initWithConfig({
      dbPath,
      DatabaseClass: undefined,
      isTestEnv: false,
      isPackaged: true,
      allowDevJsonFallback: true
    });

    expect(health.mode).toBe('DB_SAFE_MODE');
    expect(health.isSafeMode).toBe(true);
    expect(health.readOnly).toBe(true);
    expect(health.engine).toBe('json-safe-mode');
    expect(health.storageStatus).toBe('VOLATILE_STORAGE');
    expect(fs.existsSync(path.join(dbDir, 'arc_fallback.json'))).toBe(false);
  });

  it('5. Test mode enters TEST_MEMORY (json-test, TEST_EPHEMERAL) without pretending to be SQLite', () => {
    const health = DatabaseService.initWithConfig({
      dbPath,
      DatabaseClass: undefined,
      isTestEnv: true
    });

    expect(health.mode).toBe('TEST_MEMORY');
    expect(health.engine).toBe('json-test');
    expect(health.storageStatus).toBe('TEST_EPHEMERAL');
    expect(health.capabilities?.supportsTransactions).toBe(false);
    expect(health.capabilities?.supportsRollback).toBe(false);
    expect(health.limitations && health.limitations.length).toBeGreaterThan(0);
  });

  it('6. Normal SQLite mode reports honest full ACID capabilities and zero fallback limitations', () => {
    const health = DatabaseService.initWithConfig({
      dbPath,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });

    expect(health.mode).toBe('NORMAL');
    expect(health.isSafeMode).toBe(false);
    expect(health.readOnly).toBe(false);
    expect(health.engine).toBe('sqlite');
    expect(health.storageStatus).toBe('PERSISTENT_SQLITE');
    expect(health.capabilities).toEqual({
      persistent: true,
      supportsTransactions: true,
      supportsRollback: true,
      supportsFts5: true,
      supportsForeignKeys: true,
      supportsSqlIndexes: true
    });
    expect(health.limitations).toEqual([]);
  });

  it('7. DiagnosticsService.collectReport and StorageManagerService.exportDataArchive faithfully reflect PERSISTENT_JSON_DEGRADED', async () => {
    DatabaseService.initWithConfig({
      dbPath,
      DatabaseClass: undefined,
      isTestEnv: false,
      isPackaged: false,
      allowDevJsonFallback: true
    });

    DatabaseService.db
      .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
      .run('deg-1', 'notes', 'k', 'degraded-persisted');

    const report = await DiagnosticsService.collectReport(tmpDir);
    expect(report.storage.dbStatus).toMatchObject({
      mode: 'DEGRADED',
      engine: 'json-degraded',
      storageStatus: 'PERSISTENT_JSON_DEGRADED',
      readOnly: false,
      isSafeMode: false,
      capabilities: {
        persistent: true,
        supportsTransactions: false,
        supportsRollback: false,
        supportsFts5: false
      }
    });
    expect(report.storage.dbStatus.limitations.length).toBeGreaterThan(0);

    const outZip = path.join(tmpDir, 'degraded-export.zip');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: outZip });
    const exportRes = await StorageManagerService.exportDataArchive(null);
    expect(exportRes.success).toBe(true);

    const entries = readZipArchiveEntries(fs.readFileSync(outZip));
    const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
    expect(manifest.database).toMatchObject({
      engine: 'json-degraded',
      mode: 'DEGRADED',
      storageStatus: 'PERSISTENT_JSON_DEGRADED',
      format: 'json',
      snapshotEntry: 'database/arc_fallback.json'
    });
  });
});
