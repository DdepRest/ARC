import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

const { showSaveDialogMock, getPathMock, getVersionMock } = vi.hoisted(() => ({
  showSaveDialogMock: vi.fn(),
  getPathMock: vi.fn(),
  getVersionMock: vi.fn(() => '1.0.12-test')
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: getPathMock,
    getVersion: getVersionMock,
    setPath: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn()
  },
  dialog: {
    showSaveDialog: showSaveDialogMock
  },
  shell: {
    openPath: vi.fn()
  },
  session: {
    defaultSession: { clearStorageData: vi.fn() }
  },
  BrowserWindow: vi.fn()
}));

import { DatabaseService } from './database';
import { StorageManagerService } from './storage-manager.service';
import { createZipArchiveBuffer, readZipArchiveEntries } from '../utils/zip-writer';

describe('StorageManagerService, DatabaseSnapshotService & ZipWriter', () => {
  let tmpDataDir: string;
  let tmpOutDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-storage-data-'));
    tmpOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-storage-out-'));
    StorageManagerService.setDataDirForTests(tmpDataDir);
    getPathMock.mockReturnValue(tmpOutDir);
  });

  afterEach(() => {
    DatabaseService.close();
    StorageManagerService.setDataDirForTests('');
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    fs.rmSync(tmpOutDir, { recursive: true, force: true });
  });

  it('measures real SQLite DB bytes across data/database and root arc.db* without double counting', () => {
    const dbDir = path.join(tmpDataDir, 'database');
    const cfgDir = path.join(tmpDataDir, 'config');
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(cfgDir, { recursive: true });

    fs.writeFileSync(path.join(dbDir, 'main.db'), Buffer.alloc(1024, 1));
    fs.writeFileSync(path.join(tmpDataDir, 'arc.db'), Buffer.alloc(2048, 2));
    fs.writeFileSync(path.join(tmpDataDir, 'arc.db-wal'), Buffer.alloc(512, 3));
    fs.writeFileSync(path.join(cfgDir, 'prefs.json'), Buffer.from('{"theme":"red"}'));

    const info = StorageManagerService.getStorageInfo();
    expect(info.dataDir).toBe(tmpDataDir);
    expect(info.folders.database.exists).toBe(true);
    expect(info.folders.database.sizeBytes).toBe(1024 + 2048 + 512);
    expect(info.folders.config.sizeBytes).toBe(Buffer.byteLength('{"theme":"red"}'));
  });

  it('creates a valid ZIP buffer containing PK local/central headers, EOCD, and filenames', () => {
    const buf = createZipArchiveBuffer([
      { name: 'database/test.db', data: Buffer.from('SQLite payload sample content 12345') },
      { name: 'config/settings.json', data: Buffer.from('{"autoSpeak":true}') }
    ]);

    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    expect(buf.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(true);
    expect(buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    const entries = readZipArchiveEntries(buf);
    expect(entries['database/test.db'].toString('utf8')).toBe('SQLite payload sample content 12345');
    expect(entries['config/settings.json'].toString('utf8')).toBe('{"autoSpeak":true}');
  });

  it('creates a consistent SQLite WAL online snapshot, verifies PRAGMA integrity_check=ok, preserves WAL commits, and keeps main DB open', async () => {
    const dbDir = path.join(tmpDataDir, 'database');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'arc.db');
    DatabaseService.initWithConfig({ dbPath, backupRootDir: path.join(tmpDataDir, 'backups'), DatabaseClass: BetterSqlite3 });

    // Write committed transactions that stay in WAL while connection remains open
    DatabaseService.db
      .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
      .run('ltm-wal-1', 'facts', 'wal_key', 'wal_committed_value');
    DatabaseService.db
      .prepare('INSERT INTO arc_tasks (id, text, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('task-wal-1', 'Verify snapshot transaction', 0, 1700000000000, 1700000000000);

    const chosenBase = path.join(tmpOutDir, 'wal-snapshot-backup');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: chosenBase });

    const beforeTmpCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('arc-db-snap-')).length;
    const res = await StorageManagerService.exportDataArchive(null);
    const afterTmpCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('arc-db-snap-')).length;

    expect(res.success).toBe(true);
    expect(res.filePath).toBe(`${chosenBase}.zip`);
    expect(afterTmpCount).toBe(beforeTmpCount); // Temp snapshot cleaned up
    expect(DatabaseService.db.open).toBe(true); // Main connection never closed

    const zipEntries = readZipArchiveEntries(fs.readFileSync(`${chosenBase}.zip`));
    expect(Object.keys(zipEntries)).toContain('database/arc.db');
    expect(Object.keys(zipEntries)).not.toContain('database/arc.db-wal');
    expect(Object.keys(zipEntries)).not.toContain('database/arc.db-shm');

    const manifest = JSON.parse(zipEntries['manifest.json'].toString('utf8'));
    expect(manifest.database).toMatchObject({
      engine: 'sqlite',
      mode: 'NORMAL',
      storageStatus: 'PERSISTENT_SQLITE',
      isSafeMode: false,
      format: 'sqlite',
      snapshotEntry: 'database/arc.db',
      integrityVerified: true
    });

    // Recoverability proof: write extracted snapshot independently and check PRAGMA integrity_check + rows
    const restoredPath = path.join(tmpOutDir, 'restored-arc.db');
    fs.writeFileSync(restoredPath, zipEntries['database/arc.db']);
    const restoredDb = new BetterSqlite3(restoredPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = restoredDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
      expect(integrity).toEqual([{ integrity_check: 'ok' }]);
      const ltmRow = restoredDb.prepare('SELECT value FROM ltm WHERE id = ?').get('ltm-wal-1') as { value: string };
      const taskRow = restoredDb.prepare('SELECT text FROM arc_tasks WHERE id = ?').get('task-wal-1') as { text: string };
      expect(ltmRow?.value).toBe('wal_committed_value');
      expect(taskRow?.text).toBe('Verify snapshot transaction');
    } finally {
      restoredDb.close();
    }

    // Confirm original live DB still accepts writes cleanly after export
    DatabaseService.db
      .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
      .run('ltm-post-1', 'facts', 'post_key', 'post_value');
    const postRow = DatabaseService.db.prepare('SELECT value FROM ltm WHERE id = ?').get('ltm-post-1') as { value: string };
    expect(postRow?.value).toBe('post_value');
  });

  it('keeps SQLite backup intact while concurrent writes occur on the live database', async () => {
    const dbDir = path.join(tmpDataDir, 'database');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'arc.db');
    DatabaseService.initWithConfig({ dbPath, backupRootDir: path.join(tmpDataDir, 'backups'), DatabaseClass: BetterSqlite3 });

    for (let i = 0; i < 40; i++) {
      DatabaseService.db
        .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
        .run(`seed-${i}`, 'facts', `seed_key_${i}`, `seed_val_${i}`.repeat(20));
    }

    const originalBackup = DatabaseService.db.backup.bind(DatabaseService.db);
    let concurrentWritesDone = 0;
    vi.spyOn(DatabaseService.db, 'backup').mockImplementation(async (...args: unknown[]) => {
      const [dest, opts] = args as [string, any];
      // Interleave live concurrent transactions while backup executes
      DatabaseService.db
        .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
        .run('concurrent-1', 'facts', 'concurrent_key_1', 'concurrent_val_1');
      concurrentWritesDone++;
      const res = await originalBackup(dest, opts);
      DatabaseService.db
        .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
        .run('concurrent-2', 'facts', 'concurrent_key_2', 'concurrent_val_2');
      concurrentWritesDone++;
      return res;
    });

    const chosenBase = path.join(tmpOutDir, 'concurrent-backup.zip');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: chosenBase });

    const res = await StorageManagerService.exportDataArchive(null);
    expect(res.success).toBe(true);
    expect(concurrentWritesDone).toBe(2);

    const entries = readZipArchiveEntries(fs.readFileSync(chosenBase));
    const restoredPath = path.join(tmpOutDir, 'concurrent-restored.db');
    fs.writeFileSync(restoredPath, entries['database/arc.db']);
    const restoredDb = new BetterSqlite3(restoredPath, { readonly: true, fileMustExist: true });
    try {
      expect(restoredDb.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      const countRow = restoredDb.prepare('SELECT COUNT(*) as n FROM ltm').get() as { n: number };
      expect(countRow.n).toBeGreaterThanOrEqual(40);
    } finally {
      restoredDb.close();
    }
  });

  it('creates JSON fallback snapshot in JSON mode without labeling it SQLite, and records engine/storage in manifest', async () => {
    DatabaseService.initWithConfig({
      dbPath: path.join(tmpDataDir, 'database', 'arc.db'),
      DatabaseClass: undefined,
      isTestEnv: true
    });
    DatabaseService.db
      .prepare('INSERT INTO ltm (id, category, key, value) VALUES (?, ?, ?, ?)')
      .run('json-1', 'facts', 'json_k', 'json_v');

    const chosenZip = path.join(tmpOutDir, 'json-fallback.zip');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: chosenZip });

    const res = await StorageManagerService.exportDataArchive(null);
    expect(res.success).toBe(true);

    const entries = readZipArchiveEntries(fs.readFileSync(chosenZip));
    expect(entries['database/arc.db']).toBeUndefined();
    expect(entries['database/arc_fallback.json']).toBeDefined();

    const parsedSnapshot = JSON.parse(entries['database/arc_fallback.json'].toString('utf8'));
    expect(parsedSnapshot.ltm.some((r: any) => r.id === 'json-1' && r.value === 'json_v')).toBe(true);

    const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
    expect(manifest.database).toMatchObject({
      engine: 'json-test',
      mode: 'TEST_MEMORY',
      storageStatus: 'TEST_EPHEMERAL',
      format: 'json',
      snapshotEntry: 'database/arc_fallback.json',
      integrityVerified: true
    });
  });

  it('handles DB_SAFE_MODE with persisted fallback JSON and rejects DB_SAFE_MODE with no reliable data source without writing ZIP', async () => {
    const dbDir = path.join(tmpDataDir, 'database');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'arc.db');
    const fallbackPath = path.join(dbDir, 'arc_fallback.json');

    // Case A: DB_SAFE_MODE with NO persisted fallback -> fail export, no ZIP written
    DatabaseService.initWithConfig({ dbPath, DatabaseClass: undefined, isTestEnv: false });
    const failedZip = path.join(tmpOutDir, 'should-not-exist.zip');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: failedZip });

    const failRes = await StorageManagerService.exportDataArchive(null);
    expect(failRes.success).toBe(false);
    expect(failRes.error).toContain('DB_SAFE_MODE');
    expect(fs.existsSync(failedZip)).toBe(false);

    // Case B: DB_SAFE_MODE with valid _fallback.json -> succeeds & tags DB_SAFE_MODE / json-safe-mode
    fs.writeFileSync(
      fallbackPath,
      JSON.stringify({ ltm: [{ id: 'safe-1', category: 'ops', key: 'k', value: 'persisted' }] }),
      'utf8'
    );
    const safeOkZip = path.join(tmpOutDir, 'safe-mode-fallback.zip');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: safeOkZip });

    const okRes = await StorageManagerService.exportDataArchive(null);
    expect(okRes.success).toBe(true);
    const entries = readZipArchiveEntries(fs.readFileSync(safeOkZip));
    const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
    expect(manifest.database).toMatchObject({
      engine: 'json-safe-mode',
      mode: 'DB_SAFE_MODE',
      storageStatus: 'VOLATILE_STORAGE',
      isSafeMode: true,
      format: 'json'
    });
  });

  it('excludes secrets.json, secure-keys.json, API keys in ai-providers.json, models/cache, and declares exclusion in manifest.json', async () => {
    const dbDir = path.join(tmpDataDir, 'database');
    const cfgDir = path.join(tmpDataDir, 'config');
    const macrosDir = path.join(tmpDataDir, 'macros');
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.mkdirSync(macrosDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDataDir, 'models'), { recursive: true });
    fs.mkdirSync(path.join(tmpDataDir, 'cache'), { recursive: true });

    DatabaseService.initWithConfig({
      dbPath: path.join(dbDir, 'arc.db'),
      DatabaseClass: BetterSqlite3
    });

    const apiKeySecret = 'sk-proj-SUPER-SECRET-TOKEN-99999';
    const vaultCipher = 'DPAPI_CIPHERTEXT_SECRET_PAYLOAD';

    fs.writeFileSync(
      path.join(tmpDataDir, 'secrets.json'),
      JSON.stringify({ schemaVersion: 2, entries: { openai: { encrypted: true, ciphertextBase64: vaultCipher } } })
    );
    fs.writeFileSync(path.join(cfgDir, 'secrets.json'), 'NESTED_VAULT_SECRET');
    fs.writeFileSync(path.join(cfgDir, 'secure-keys.json'), JSON.stringify({ gemini: apiKeySecret }));
    fs.writeFileSync(path.join(cfgDir, '.env'), `OPENAI_API_KEY=${apiKeySecret}`);
    fs.writeFileSync(
      path.join(cfgDir, 'ai-providers.json'),
      JSON.stringify([{ id: 'openai', name: 'OpenAI', apiKey: apiKeySecret, enabled: true }])
    );
    fs.writeFileSync(path.join(cfgDir, 'app.json'), JSON.stringify({ ok: true }));
    fs.writeFileSync(path.join(macrosDir, 'hello.json'), JSON.stringify({ steps: [] }));
    fs.writeFileSync(path.join(tmpDataDir, 'models', 'huge-weight.gguf'), Buffer.from('EXCLUDED_WEIGHT_DATA'));
    fs.writeFileSync(path.join(tmpDataDir, 'cache', 'temp.wav'), Buffer.from('EXCLUDED_CACHE_DATA'));

    const chosenBase = path.join(tmpOutDir, 'my-arc-backup');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: chosenBase });

    const res = await StorageManagerService.exportDataArchive(null);
    expect(res.success).toBe(true);
    expect(res.filePath).toBe(`${chosenBase}.zip`);

    const entries = readZipArchiveEntries(fs.readFileSync(`${chosenBase}.zip`));
    const entryNames = Object.keys(entries);

    expect(entryNames).toContain('manifest.json');
    expect(entryNames).toContain('database/arc.db');
    expect(entryNames).toContain('config/app.json');
    expect(entryNames).toContain('config/ai-providers.json');
    expect(entryNames).toContain('macros/hello.json');

    expect(entryNames.some((n) => n.includes('secrets.json'))).toBe(false);
    expect(entryNames.some((n) => n.includes('secure-keys.json'))).toBe(false);
    expect(entryNames.some((n) => n.includes('.env'))).toBe(false);
    expect(entryNames.some((n) => n.includes('huge-weight.gguf'))).toBe(false);
    expect(entryNames.some((n) => n.includes('temp.wav'))).toBe(false);

    // Ensure secret strings never appear inside ANY decompressed ZIP payload
    for (const [name, buf] of Object.entries(entries)) {
      const content = buf.toString('utf8');
      expect(content, `Secret leaked into ${name}`).not.toContain(apiKeySecret);
      expect(content, `Vault payload leaked into ${name}`).not.toContain(vaultCipher);
    }

    const providersExported = JSON.parse(entries['config/ai-providers.json'].toString('utf8'));
    expect(providersExported[0].apiKey).toBe('');

    const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
    expect(manifest.secretsIncluded).toBe(false);
    expect(typeof manifest.secretsExcludedReason).toBe('string');
    expect(manifest.secretsExcludedReason.length).toBeGreaterThan(20);
  });

  it('does not leave partial ZIP and deletes temporary snapshot files when snapshot fails', async () => {
    const dbDir = path.join(tmpDataDir, 'database');
    fs.mkdirSync(dbDir, { recursive: true });
    DatabaseService.initWithConfig({
      dbPath: path.join(dbDir, 'arc.db'),
      DatabaseClass: BetterSqlite3
    });

    vi.spyOn(DatabaseService.db, 'backup').mockRejectedValueOnce(new Error('Simulated SQLite backup failure'));

    const targetZip = path.join(tmpOutDir, 'failed-snapshot.zip');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: targetZip });

    const beforeTmpCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('arc-db-snap-')).length;
    const res = await StorageManagerService.exportDataArchive(null);
    const afterTmpCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('arc-db-snap-')).length;

    expect(res.success).toBe(false);
    expect(res.error).toContain('Simulated SQLite backup failure');
    expect(fs.existsSync(targetZip)).toBe(false);
    expect(afterTmpCount).toBe(beforeTmpCount);
  });

  it('exportDataArchive returns canceled: true and creates no temp snapshot when user cancels save dialog', async () => {
    const beforeTmpCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('arc-db-snap-')).length;
    showSaveDialogMock.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const res = await StorageManagerService.exportDataArchive(null);
    const afterTmpCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('arc-db-snap-')).length;

    expect(res).toEqual({ success: false, canceled: true });
    expect(afterTmpCount).toBe(beforeTmpCount);
  });

  it('exportDataArchive prevents concurrent duplicate export invocations', async () => {
    let resolveDialog!: (v: any) => void;
    showSaveDialogMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDialog = resolve;
        })
    );

    const firstCall = StorageManagerService.exportDataArchive(null);
    const secondCall = await StorageManagerService.exportDataArchive(null);

    expect(secondCall).toEqual({ success: false, error: 'Экспорт архива уже выполняется' });

    resolveDialog({ canceled: true });
    const firstResult = await firstCall;
    expect(firstResult.canceled).toBe(true);
  });
});
