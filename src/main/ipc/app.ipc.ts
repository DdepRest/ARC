import { ipcMain, app, BrowserWindow } from 'electron';
import axios from 'axios';
import { StorageManagerService } from '../services/storage-manager.service';
import { DatabaseService } from '../services/database';
import { secretVault } from '../services/security/secret-vault.service';
import { DiagnosticsService } from '../services/diagnostics.service';
import {
  getAppDataPreservedAssetList,
  normalizeResetOptions
} from '../../shared/config/reset-policy';

export const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/OWNER/REPO/releases/latest'; // TODO: Заменить OWNER/REPO на актуальные

export function semverGt(latest: string, current: string): boolean {
  const cleanA = String(latest || '').trim().replace(/^v/i, '').split('-')[0];
  const cleanB = String(current || '').trim().replace(/^v/i, '').split('-')[0];
  const partsA = cleanA.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return true;
    if (numA < numB) return false;
  }
  return false;
}

export function registerAppIpc() {
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  let previousBounds = { width: 1280, height: 800 };
  let isMinMode = false;

  ipcMain.handle('app:toggleFocus', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (isMinMode) {
        if (win.isFullScreen()) win.setFullScreen(false);
        if (win.isMaximized()) win.unmaximize();
        win.setAlwaysOnTop(false);
        win.setAspectRatio(0); // Reset aspect ratio
        win.setBounds(previousBounds);
        win.center();
        isMinMode = false;
      } else {
        if (win.isFullScreen()) win.setFullScreen(false);
        if (win.isMaximized()) win.unmaximize();
        previousBounds = win.getBounds();
        // Calculate the aspect ratio 9:16 on the current display
        const display = require('electron').screen.getPrimaryDisplay();
        const height = Math.min(800, display.workAreaSize.height - 100);
        const width = Math.round(height * (9 / 16));
        win.setSize(width, height, false);
        win.setAspectRatio(9 / 16); // Lock aspect ratio
        win.setAlwaysOnTop(true);
        win.center();
        isMinMode = true;
      }
    }
  });

  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:check-updates', async () => {
    try {
      const response = await axios.get(GITHUB_RELEASES_URL, {
        headers: { 'User-Agent': 'ARC-Desktop-App' },
        timeout: 5000
      });

      const rawTag = typeof response?.data?.tag_name === 'string' ? response.data.tag_name : '';
      const latestVersion = rawTag.replace(/^v/i, '');
      const currentVersion = app.getVersion();
      const hasUpdate = latestVersion ? semverGt(latestVersion, currentVersion) : false;
      const changelog = typeof response?.data?.body === 'string' ? response.data.body : '';
      const downloadUrl = typeof response?.data?.html_url === 'string' ? response.data.html_url : '';

      return {
        success: true,
        hasUpdate,
        currentVersion,
        latestVersion,
        changelog,
        downloadUrl
      };
    } catch (_error) {
      return {
        success: false,
        error: 'Network error or rate limit exceeded'
      };
    }
  });

  ipcMain.handle('window:is-focused', () => {
    const win = BrowserWindow.getFocusedWindow();
    return win ? win.isFocused() : false;
  });

  ipcMain.handle('system:get-storage-info', () => {
    return StorageManagerService.getStorageInfo();
  });

  ipcMain.handle('system:get-db-status', () => {
    return {
      ...DatabaseService.getHealthStatus(),
      security: secretVault.getSecurityStatus()
    };
  });

  ipcMain.handle('system:open-data-folder', async () => {
    return await StorageManagerService.openDataFolder();
  });

  ipcMain.handle('system:reset-data', async (_event, options?: unknown) => {
    const parsed = normalizeResetOptions(options);
    if (parsed.valid === false) {
      return {
        success: false,
        mode: 'app_data_and_config' as const,
        clearModels: false,
        removedTargets: [],
        preservedAssets: getAppDataPreservedAssetList({ clearModels: false }),
        failedTargets: [],
        relaunched: false,
        error: parsed.error
      };
    }
    return await StorageManagerService.resetSystemData(parsed.options);
  });

  ipcMain.handle('system:export-diagnostics', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    return await DiagnosticsService.exportDiagnostics(win);
  });

  ipcMain.handle('system:export-archive', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    return await StorageManagerService.exportDataArchive(win);
  });
}
