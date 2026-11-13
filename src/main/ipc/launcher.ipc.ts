import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { launcherIndexer } from '../services/launcher-indexer.service';
import { logger } from '../utils/logger';

function getFoldersFilePath(): string {
  return path.join(app.getPath('userData'), 'launcher-folders.json');
}

export function loadFolders(): string[] {
  try {
    const dataFile = getFoldersFilePath();
    if (fs.existsSync(dataFile)) {
      const data = fs.readFileSync(dataFile, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    logger.error('Error loading launcher folders', err);
  }
  return [];
}

export function saveFolders(folders: string[]): void {
  try {
    const dataFile = getFoldersFilePath();
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(folders, null, 2), 'utf-8');
  } catch (err) {
    logger.error('Error saving launcher folders', err);
  }
}

export function registerLauncherIpc() {
  ipcMain.handle('launcher:getFolders', () => {
    return loadFolders();
  });

  ipcMain.handle('launcher:addFolder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      const folders = loadFolders();
      if (!folders.includes(folderPath)) {
        folders.push(folderPath);
        saveFolders(folders);
        await launcherIndexer.buildIndex(folders);
      }
      return folderPath;
    }
    return null;
  });

  ipcMain.handle('launcher:removeFolder', async (_event, folderPath: string) => {
    let folders = loadFolders();
    folders = folders.filter((f) => f !== folderPath);
    saveFolders(folders);
    await launcherIndexer.buildIndex(folders);
    return true;
  });

  ipcMain.handle('launcher:refreshIndex', async () => {
    try {
      const folders = loadFolders();
      return await launcherIndexer.buildIndex(folders);
    } catch (err: any) {
      logger.error('Failed to refresh launcher index:', err);
      return { success: false, error: err?.message || 'Failed to refresh index' };
    }
  });

  ipcMain.handle('launcher:search', async (_event, payload?: { query?: string; limit?: number }) => {
    const query = typeof payload === 'object' && payload !== null ? String(payload.query ?? '') : '';
    const limit = typeof payload === 'object' && payload !== null && typeof payload.limit === 'number' ? payload.limit : 20;
    return launcherIndexer.search(query, limit);
  });

  ipcMain.handle('launcher:launch', async (_event, targetPath: string) => {
    return await launcherIndexer.launch(targetPath);
  });
}

