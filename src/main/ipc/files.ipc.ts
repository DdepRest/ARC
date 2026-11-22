import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { isPathAllowed } from '../services/files.service';

export function registerFilesIpc() {
  ipcMain.handle('files:list', async (_event, dirPath: string = '.') => {
    try {
      if (!dirPath || typeof dirPath !== 'string' || !isPathAllowed(dirPath, { mode: 'list', allowRootSelf: true })) {
        console.warn(`[files:list] Path traversal attempt blocked: ${dirPath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolvedPath = path.resolve(dirPath);
      if (!isPathAllowed(resolvedPath, { mode: 'list', allowRootSelf: true })) {
        console.warn(`[files:list] Path traversal attempt blocked: ${resolvedPath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      const files = entries
        .filter((entry) => {
          if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) {
            return false;
          }
          const entryPath = path.join(resolvedPath, entry.name);
          return isPathAllowed(entryPath, { mode: 'read', allowRootSelf: false });
        })
        .map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          path: path.join(resolvedPath, entry.name)
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
      if (!filePath || typeof filePath !== 'string' || !isPathAllowed(filePath, { mode: 'read', allowRootSelf: false })) {
        console.warn(`[files:read] Path traversal attempt blocked: ${filePath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolved = path.resolve(filePath);
      if (!isPathAllowed(resolved, { mode: 'read', allowRootSelf: false })) {
        console.warn(`[files:read] Path traversal attempt blocked: ${resolved}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const content = await fs.readFile(resolved, 'utf-8');
      return { success: true, content };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('files:write', async (_event, filePath: string, content: string) => {
    try {
      if (!filePath || typeof filePath !== 'string' || !isPathAllowed(filePath, { mode: 'write', allowRootSelf: false })) {
        console.warn(`[files:write] Path traversal attempt blocked: ${filePath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolved = path.resolve(filePath);
      const parentDir = path.dirname(resolved);
      if (!isPathAllowed(parentDir, { mode: 'list', allowRootSelf: true })) {
        console.warn(`[files:write] Parent directory outside allowed roots: ${parentDir}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      await fs.mkdir(parentDir, { recursive: true });

      // Re-validate after mkdir and immediately before writeFile
      if (!isPathAllowed(resolved, { mode: 'write', allowRootSelf: false })) {
        console.warn(`[files:write] Post-mkdir path validation blocked: ${resolved}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      await fs.writeFile(resolved, content, 'utf-8');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('files:delete', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string' || !isPathAllowed(filePath, { mode: 'delete', allowRootSelf: false })) {
        console.warn(`[files:delete] Path traversal attempt blocked: ${filePath}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      const resolved = path.resolve(filePath);
      if (!isPathAllowed(resolved, { mode: 'delete', allowRootSelf: false })) {
        console.warn(`[files:delete] Re-validation before delete blocked: ${resolved}`);
        return { success: false, error: 'PATH_NOT_ALLOWED' };
      }

      await fs.rm(resolved, { recursive: true, force: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}
