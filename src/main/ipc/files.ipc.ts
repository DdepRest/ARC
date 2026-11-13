import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { isPathAllowed } from '../services/files.service';

export function registerFilesIpc() {
  ipcMain.handle('files:list', async (_event, dirPath: string = '.') => {
    try {
      const resolvedPath = path.resolve(dirPath);
      if (!isPathAllowed(resolvedPath)) {
        console.warn(`[files:list] Path traversal attempt blocked: ${resolvedPath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      const files = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(resolvedPath, entry.name),
      }));
      
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        currentPath: resolvedPath,
        files
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  });

  ipcMain.handle('files:read', async (_event, filePath: string) => {
    try {
      if (!isPathAllowed(filePath)) {
        console.warn(`[files:read] Path traversal attempt blocked: ${filePath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolved = path.resolve(filePath);
      const content = await fs.readFile(resolved, 'utf-8');
      return { success: true, content };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('files:write', async (_event, filePath: string, content: string) => {
    try {
      if (!isPathAllowed(filePath)) {
        console.warn(`[files:write] Path traversal attempt blocked: ${filePath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolved = path.resolve(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, 'utf-8');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('files:delete', async (_event, filePath: string) => {
    try {
      if (!isPathAllowed(filePath)) {
        console.warn(`[files:delete] Path traversal attempt blocked: ${filePath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolved = path.resolve(filePath);
      await fs.rm(resolved, { recursive: true, force: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}
