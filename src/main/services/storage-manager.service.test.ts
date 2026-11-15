import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

vi.mock('./database', () => ({
  DatabaseService: {
    getHealthStatus: vi.fn(() => ({ dbPath: ':memory:', isConnected: true })),
    close: vi.fn()
  }
}));

import { StorageManagerService } from './storage-manager.service';
import { createZipArchiveBuffer } from '../utils/zip-writer';

describe('StorageManagerService & ZipWriter', () => {
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

    // Local file header signature: PK\x03\x04
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    // Contains Central Directory signature PK\x01\x02 and EOCD PK\x05\x06
    expect(buf.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(true);
    expect(buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    expect(buf.toString('utf8')).toContain('database/test.db');
    expect(buf.toString('utf8')).toContain('config/settings.json');
  });

  it('exportDataArchive writes ZIP atomically with .zip extension via save dialog and excludes models/cache', async () => {
    fs.mkdirSync(path.join(tmpDataDir, 'database'), { recursive: true });
    fs.mkdirSync(path.join(tmpDataDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(tmpDataDir, 'macros'), { recursive: true });
    fs.mkdirSync(path.join(tmpDataDir, 'models'), { recursive: true });
    fs.mkdirSync(path.join(tmpDataDir, 'cache'), { recursive: true });

    fs.writeFileSync(path.join(tmpDataDir, 'database', 'arc.sqlite'), Buffer.from('db-content'));
    fs.writeFileSync(path.join(tmpDataDir, 'config', 'app.json'), Buffer.from('{"ok":true}'));
    fs.writeFileSync(path.join(tmpDataDir, 'macros', 'hello.json'), Buffer.from('{"steps":[]}'));
    fs.writeFileSync(path.join(tmpDataDir, 'models', 'huge-weight.gguf'), Buffer.from('EXCLUDED_WEIGHT_DATA'));
    fs.writeFileSync(path.join(tmpDataDir, 'cache', 'temp.wav'), Buffer.from('EXCLUDED_CACHE_DATA'));

    const chosenBase = path.join(tmpOutDir, 'my-arc-backup');
    showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: chosenBase });

    const res = await StorageManagerService.exportDataArchive(null);
    expect(res.success).toBe(true);
    expect(res.filePath).toBe(`${chosenBase}.zip`);
    expect(res.entriesCount).toBe(4); // database + config + macros + manifest.json
    expect(fs.existsSync(`${chosenBase}.zip`)).toBe(true);

    const written = fs.readFileSync(`${chosenBase}.zip`);
    expect(written.readUInt32LE(0)).toBe(0x04034b50);
    const rawText = written.toString('utf8');
    expect(rawText).toContain('manifest.json');
    expect(rawText).toContain('database/arc.sqlite');
    expect(rawText).not.toContain('huge-weight.gguf');
    expect(rawText).not.toContain('temp.wav');
  });

  it('exportDataArchive returns canceled: true when user cancels save dialog', async () => {
    showSaveDialogMock.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const res = await StorageManagerService.exportDataArchive(null);
    expect(res).toEqual({ success: false, canceled: true });
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
