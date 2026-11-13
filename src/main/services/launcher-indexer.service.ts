import { app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export type LauncherEntryType = 'exe' | 'lnk' | 'bat' | 'cmd';

export interface LauncherIndexEntry {
  name: string;
  path: string;
  type: LauncherEntryType;
  folder: string;
}

export interface LauncherIndexFile {
  version: 1;
  updatedAt: number;
  entries: LauncherIndexEntry[];
}

export type LauncherRefreshIndexResponse =
  | { success: true; indexed: number; folders: number; elapsedMs: number; note?: 'no_folders' }
  | { success: false; error: string };

export const MAX_SCAN_DEPTH = 3;
export const ALLOWED_EXTENSIONS = new Set<string>(['.exe', '.lnk', '.bat', '.cmd']);
export const IGNORED_DIR_NAMES = new Set<string>([
  'node_modules',
  '.git',
  '$recycle.bin',
  'system volume information',
  'appdata',
  'windows',
]);

export function normalizeLauncherPath(targetPath: string, platform: NodeJS.Platform = process.platform): string {
  const resolved = path.resolve(targetPath);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export interface LauncherIndexerOptions {
  indexFilePath?: string;
  platform?: NodeJS.Platform;
  openPathFn?: (targetPath: string) => Promise<string>;
}

export class LauncherIndexerService {
  private readonly customIndexFilePath?: string;
  private readonly platform: NodeJS.Platform;
  private readonly openPathFn: (targetPath: string) => Promise<string>;

  constructor(options: LauncherIndexerOptions = {}) {
    this.customIndexFilePath = options.indexFilePath;
    this.platform = options.platform ?? process.platform;
    this.openPathFn = options.openPathFn ?? ((p) => shell.openPath(p));
  }

  public getIndexFilePath(): string {
    return this.customIndexFilePath ?? path.join(app.getPath('userData'), 'launcher-index.json');
  }

  private saveIndexAtomically(indexData: LauncherIndexFile): void {
    const filePath = this.getIndexFilePath();
    const dir = path.dirname(filePath);
    const tmpPath = `${filePath}.tmp`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(indexData, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  public loadIndex(): LauncherIndexFile | null {
    const filePath = this.getIndexFilePath();
    try {
      if (!fs.existsSync(filePath)) return null;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (parsed && Array.isArray(parsed.entries)) return parsed as LauncherIndexFile;
    } catch (err) {
      logger.warn('[LauncherIndexer] Failed to read launcher-index.json:', err);
    }
    return null;
  }

  private isIgnoredDirectory(dirName: string, fullPath: string): boolean {
    if (IGNORED_DIR_NAMES.has(dirName.toLowerCase())) return true;
    const normalizedSlashes = fullPath.toLowerCase().replace(/\\/g, '/');
    return normalizedSlashes.endsWith('/programdata/microsoft');
  }

  public async buildIndex(folders: string[]): Promise<LauncherRefreshIndexResponse> {
    const startMs = Date.now();
    try {
      const validFolders = (Array.isArray(folders) ? folders : [])
        .map((f) => String(f ?? '').trim())
        .filter((f) => f.length > 0);

      if (validFolders.length === 0) {
        this.saveIndexAtomically({ version: 1, updatedAt: Date.now(), entries: [] });
        return { success: true, indexed: 0, folders: 0, elapsedMs: Date.now() - startMs, note: 'no_folders' };
      }

      const entries: LauncherIndexEntry[] = [];
      const seenPaths = new Set<string>();

      const scanDir = async (rootFolder: string, currentDir: string, depth: number): Promise<void> => {
        if (depth > MAX_SCAN_DEPTH) return;
        let dirents: fs.Dirent[];
        try {
          dirents = await fs.promises.readdir(currentDir, { withFileTypes: true });
        } catch (err) {
          logger.warn(`[LauncherIndexer] Cannot read directory ${currentDir}:`, err);
          return;
        }

        for (const dirent of dirents) {
          if (dirent.isSymbolicLink()) continue;
          const fullPath = path.join(currentDir, dirent.name);
          try {
            const lstat = await fs.promises.lstat(fullPath);
            if (lstat.isSymbolicLink()) continue;
          } catch {
            continue;
          }

          if (dirent.isDirectory()) {
            if (this.isIgnoredDirectory(dirent.name, fullPath)) continue;
            await scanDir(rootFolder, fullPath, depth + 1);
          } else if (dirent.isFile()) {
            const ext = path.extname(dirent.name).toLowerCase();
            if (!ALLOWED_EXTENSIONS.has(ext)) continue;

            const dedupKey = normalizeLauncherPath(fullPath, this.platform);
            if (seenPaths.has(dedupKey)) continue;
            seenPaths.add(dedupKey);

            entries.push({
              name: path.basename(dirent.name, path.extname(dirent.name)),
              path: path.resolve(fullPath),
              type: ext.slice(1) as LauncherEntryType,
              folder: rootFolder,
            });
          }
        }
      };

      for (const folder of validFolders) {
        await scanDir(folder, folder, 1);
      }

      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      this.saveIndexAtomically({ version: 1, updatedAt: Date.now(), entries });

      return { success: true, indexed: entries.length, folders: validFolders.length, elapsedMs: Date.now() - startMs };
    } catch (err: any) {
      logger.error('[LauncherIndexer] Failed to build index:', err);
      return { success: false, error: err?.message || 'Failed to build launcher index' };
    }
  }

  public search(query: string, limit = 20): { results: LauncherIndexEntry[] } {
    const index = this.loadIndex();
    if (!index || !Array.isArray(index.entries) || index.entries.length === 0) return { results: [] };

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return { results: index.entries.slice(0, safeLimit) };

    const scored: Array<{ entry: LauncherIndexEntry; rank: number }> = [];
    for (const entry of index.entries) {
      const nameLower = entry.name.toLowerCase();
      const baseLower = path.basename(entry.path).toLowerCase();
      if (nameLower === q) scored.push({ entry, rank: 0 });
      else if (nameLower.startsWith(q)) scored.push({ entry, rank: 1 });
      else if (nameLower.includes(q)) scored.push({ entry, rank: 2 });
      else if (baseLower.includes(q)) scored.push({ entry, rank: 3 });
    }

    scored.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.entry.name.localeCompare(b.entry.name, undefined, { sensitivity: 'base' })));
    return { results: scored.slice(0, safeLimit).map((item) => item.entry) };
  }

  public async launch(targetPath: string): Promise<{ success: boolean; error?: string }> {
    if (typeof targetPath !== 'string' || !targetPath.trim()) return { success: false, error: 'Invalid target path' };
    const ext = path.extname(targetPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return { success: false, error: 'Unsupported executable extension' };

    const index = this.loadIndex();
    if (!index || !Array.isArray(index.entries)) return { success: false, error: 'Launcher index is not initialized' };

    const normalizedTarget = normalizeLauncherPath(targetPath, this.platform);
    const matchedEntry = index.entries.find((item) => normalizeLauncherPath(item.path, this.platform) === normalizedTarget);
    if (!matchedEntry) return { success: false, error: 'Path is not in launcher index whitelist' };

    try {
      const errMsg = await this.openPathFn(matchedEntry.path);
      if (errMsg && errMsg.trim().length > 0) return { success: false, error: errMsg };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to launch application' };
    }
  }
}

export const launcherIndexer = new LauncherIndexerService();
