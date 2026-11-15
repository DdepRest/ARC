import { app, shell, session, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DatabaseService } from './database';
import {
  cleanupDatabaseSnapshotTemp,
  createVerifiedDatabaseSnapshot,
  type DatabaseSnapshotResult
} from './database-snapshot.service';
import { buildDataBackupZipBuffer } from '../utils/zip-writer';

export interface StorageFolderInfo {
  path: string;
  sizeBytes: number;
  exists: boolean;
}

export interface StorageInfo {
  dataDir: string;
  isPortable: boolean;
  folders: {
    database: StorageFolderInfo;
    config: StorageFolderInfo;
    models: StorageFolderInfo;
    macros: StorageFolderInfo;
    cache: StorageFolderInfo;
  };
  appDataLegacyPath: string;
}

export interface ResetOptions {
  clearModels?: boolean;
}

export interface DataArchiveExportResult {
  success: boolean;
  filePath?: string;
  sizeBytes?: number;
  entriesCount?: number;
  canceled?: boolean;
  error?: string;
}

export class StorageManagerService {
  private static dataDir: string = '';
  private static isExportingArchive = false;

  public static setDataDirForTests(dir: string): void {
    StorageManagerService.dataDir = dir;
  }

  public static getAppRoot(): string {
    if (app && typeof app.isPackaged === 'boolean') {
      return app.isPackaged ? path.dirname(process.execPath) : process.cwd();
    }
    return process.cwd();
  }

  public static getDataDir(): string {
    if (!StorageManagerService.dataDir) {
      const root = StorageManagerService.getAppRoot();
      StorageManagerService.dataDir = path.join(root, 'data');
    }
    return StorageManagerService.dataDir;
  }

  public static initPortablePaths(): string {
    const dataDir = StorageManagerService.getDataDir();
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const subfolders = ['database', 'config', 'models', 'macros', 'cache', 'logs'];
      for (const sub of subfolders) {
        const fullSub = path.join(dataDir, sub);
        if (!fs.existsSync(fullSub)) {
          fs.mkdirSync(fullSub, { recursive: true });
        }
      }

      if (app && typeof app.setPath === 'function') {
        app.setPath('userData', dataDir);
        console.log(`[StorageManager] Portable userData configured at: ${dataDir}`);
      }
    } catch (err) {
      console.warn('[StorageManager] Failed to configure portable userData path:', err);
    }
    return dataDir;
  }

  public static getDirectorySizeBytes(dirPath: string): number {
    let size = 0;
    try {
      if (!fs.existsSync(dirPath)) return 0;
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) return stat.size;
      const files = fs.readdirSync(dirPath);
      for (const f of files) {
        const full = path.join(dirPath, f);
        try {
          const fileStat = fs.statSync(full);
          if (fileStat.isDirectory()) {
            size += StorageManagerService.getDirectorySizeBytes(full);
          } else {
            size += fileStat.size;
          }
        } catch {
          // ignore individual unreadable files
        }
      }
    } catch {
      // ignore
    }
    return size;
  }

  private static collectExternalDatabaseFilePaths(dataDir: string): string[] {
    const dbFolderResolved = path.resolve(path.join(dataDir, 'database'));
    const candidates = new Set<string>([
      path.join(dataDir, 'arc.db'),
      path.join(dataDir, 'arc.db-wal'),
      path.join(dataDir, 'arc.db-shm'),
      path.join(dataDir, 'arc.db_fallback.json')
    ]);

    try {
      const health = DatabaseService.getHealthStatus?.();
      const activePath = health?.dbPath;
      if (activePath && activePath !== ':memory:' && !activePath.startsWith('test_')) {
        const resolvedActive = path.resolve(activePath);
        candidates.add(resolvedActive);
        candidates.add(`${resolvedActive}-wal`);
        candidates.add(`${resolvedActive}-shm`);
        candidates.add(`${resolvedActive}_fallback.json`);
      }
    } catch {
      // ignore if database not initialized yet
    }

    const externalFiles: string[] = [];
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      if (resolved.startsWith(dbFolderResolved + path.sep) || resolved === dbFolderResolved) {
        continue;
      }
      try {
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          externalFiles.push(resolved);
        }
      } catch {
        // ignore unreadable paths
      }
    }
    return externalFiles;
  }

  public static getStorageInfo(): StorageInfo {
    const dataDir = StorageManagerService.getDataDir();
    const appData = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));

    const getFolderInfo = (sub: string): StorageFolderInfo => {
      const p = path.join(dataDir, sub);
      const exists = fs.existsSync(p);
      return {
        path: p,
        sizeBytes: exists ? StorageManagerService.getDirectorySizeBytes(p) : 0,
        exists
      };
    };

    const dbFolder = getFolderInfo('database');
    const externalDbFiles = StorageManagerService.collectExternalDatabaseFilePaths(dataDir);
    let externalDbBytes = 0;
    for (const f of externalDbFiles) {
      try {
        externalDbBytes += fs.statSync(f).size;
      } catch {
        // ignore
      }
    }

    return {
      dataDir,
      isPortable: true,
      folders: {
        database: {
          path: dbFolder.path,
          sizeBytes: dbFolder.sizeBytes + externalDbBytes,
          exists: dbFolder.exists || externalDbFiles.length > 0
        },
        config: getFolderInfo('config'),
        models: getFolderInfo('models'),
        macros: getFolderInfo('macros'),
        cache: getFolderInfo('cache')
      },
      appDataLegacyPath: path.join(appData, 'a.r.c')
    };
  }

  public static async exportDataArchive(parentWindow?: BrowserWindow | null): Promise<DataArchiveExportResult> {
    if (StorageManagerService.isExportingArchive) {
      return { success: false, error: 'Экспорт архива уже выполняется' };
    }
    StorageManagerService.isExportingArchive = true;
    let tmpPath: string | null = null;
    let snapshot: DatabaseSnapshotResult | null = null;

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultFilename = `arc-backup-${dateStr}.zip`;
      let baseSaveDir = StorageManagerService.getDataDir();
      try {
        if (app && typeof app.getPath === 'function') {
          baseSaveDir = app.getPath('documents') || baseSaveDir;
        }
      } catch {
        // fallback to dataDir
      }

      const options = {
        title: 'Экспорт архива данных A.R.C.',
        defaultPath: path.join(baseSaveDir, defaultFilename),
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
      };

      const dialogRes = parentWindow && !parentWindow.isDestroyed()
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options);

      if (dialogRes.canceled || !dialogRes.filePath) {
        return { success: false, canceled: true };
      }

      const targetPath = dialogRes.filePath.toLowerCase().endsWith('.zip')
        ? dialogRes.filePath
        : `${dialogRes.filePath}.zip`;

      const dataDir = StorageManagerService.getDataDir();
      const appVersion = app && typeof app.getVersion === 'function' ? app.getVersion() : 'unknown';

      // Create & verify consistent database snapshot BEFORE ZIP assembly
      snapshot = await createVerifiedDatabaseSnapshot();

      const { buffer: archiveBuf, entriesCount } = await buildDataBackupZipBuffer({
        dataDir,
        appVersion,
        dbSnapshot: snapshot
      });
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      tmpPath = `${targetPath}.tmp-${Date.now()}`;
      await fs.promises.writeFile(tmpPath, archiveBuf);
      await fs.promises.rename(tmpPath, targetPath);
      tmpPath = null;

      return {
        success: true,
        filePath: targetPath,
        sizeBytes: archiveBuf.length,
        entriesCount
      };
    } catch (err: any) {
      if (tmpPath && fs.existsSync(tmpPath)) {
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // ignore cleanup failure
        }
      }
      return { success: false, error: err?.message || String(err) };
    } finally {
      await cleanupDatabaseSnapshotTemp(snapshot);
      StorageManagerService.isExportingArchive = false;
    }
  }

  public static async openDataFolder(): Promise<{ success: boolean; error?: string }> {
    const dataDir = StorageManagerService.getDataDir();
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      await shell.openPath(dataDir);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public static async resetSystemData(options?: ResetOptions): Promise<{ success: boolean; error?: string }> {
    console.log('[StorageManager] Executing full system reset...', options);
    
    // 1. Close database
    try {
      DatabaseService.close();
    } catch (e) {
      console.warn('[StorageManager] Error closing database during reset:', e);
    }

    // 2. Clear browser/electron session storage
    try {
      if (session?.defaultSession) {
        await session.defaultSession.clearStorageData();
      }
    } catch (e) {
      console.warn('[StorageManager] Error clearing electron session data:', e);
    }

    // 3. Clean %APPDATA%/a.r.c and %APPDATA%/A.R.C
    const appData = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));

    const legacyDirs = [
      path.join(appData, 'a.r.c'),
      path.join(appData, 'A.R.C'),
      path.join(appData, 'arc')
    ];

    for (const lDir of legacyDirs) {
      try {
        if (fs.existsSync(lDir)) {
          console.log(`[StorageManager] Removing legacy AppData directory: ${lDir}`);
          fs.rmSync(lDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[StorageManager] Failed to delete ${lDir}:`, err);
      }
    }

    // 4. Clean local portable data/ directories
    const dataDir = StorageManagerService.getDataDir();
    const cleanTargets = [
      path.join(dataDir, 'database'),
      path.join(dataDir, 'config'),
      path.join(dataDir, 'cache'),
      path.join(dataDir, 'macros'),
      path.join(dataDir, 'Partitions'),
      path.join(dataDir, 'Local Storage'),
      path.join(dataDir, 'IndexedDB'),
      path.join(dataDir, 'Session Storage'),
      path.join(dataDir, 'Network'),
      path.join(dataDir, 'GPUCache'),
      path.join(dataDir, 'arc.db'),
      path.join(dataDir, 'arc.db-wal'),
      path.join(dataDir, 'arc.db-shm'),
      path.join(dataDir, 'arc-performance-settings.json')
    ];

    if (options?.clearModels) {
      cleanTargets.push(path.join(dataDir, 'models'));
    }

    for (const target of cleanTargets) {
      try {
        if (fs.existsSync(target)) {
          console.log(`[StorageManager] Removing target: ${target}`);
          fs.rmSync(target, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[StorageManager] Failed to remove ${target}:`, err);
      }
    }

    // Re-create necessary directory structure
    StorageManagerService.initPortablePaths();

    // 5. Relaunch application cleanly
    try {
      if (app && typeof app.relaunch === 'function') {
        app.relaunch();
        app.exit(0);
      }
      return { success: true };
    } catch (err: any) {
      console.error('[StorageManager] Error relaunching app after reset:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }
}
