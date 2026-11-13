import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { macroExecutor } from '../services/MacroExecutor';
import { macroScheduler } from '../services/macro-scheduler.service';

export function getMacrosDir(): string {
  return path.join(app.getPath('userData'), 'macros');
}

function ensureMacrosDir(dirPath: string = getMacrosDir()): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function resolveMacroFilePath(id: unknown, baseDir: string = getMacrosDir()): string {
  const normalizedId = String(id ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(normalizedId)) {
    throw new Error('Invalid macro id');
  }
  const base = path.resolve(baseDir);
  const target = path.resolve(base, `${normalizedId}.json`);
  if (!target.startsWith(base + path.sep)) {
    throw new Error('Invalid macro id');
  }
  return target;
}

export function registerMacrosIpc() {
  ensureMacrosDir();

  ipcMain.handle('macros:list', async () => {
    try {
      const macrosDir = ensureMacrosDir();
      const files = fs.readdirSync(macrosDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const content = fs.readFileSync(path.join(macrosDir, f), 'utf-8');
          const data = JSON.parse(content);
          return {
            id: f.replace('.json', ''),
            title: data.name || f.replace('.json', ''),
            desc: data.description || 'Визуальный макрос',
            enabled: data.enabled !== false,
            triggers: data.triggers || []
          };
        });
    } catch (err) {
      console.error('Failed to list macros:', err);
      return [];
    }
  });

  ipcMain.handle('macros:save', async (_event, payload) => {
    try {
      const id = payload && typeof payload === 'object' ? payload.id : undefined;
      const data = payload && typeof payload === 'object' ? payload.data : undefined;
      const macrosDir = ensureMacrosDir();
      const filePath = resolveMacroFilePath(id, macrosDir);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      void macroScheduler.reload();
      return true;
    } catch (err: any) {
      if (err?.message === 'Invalid macro id') {
        return { success: false, error: 'Invalid macro id' };
      }
      console.error('Failed to save macro:', err);
      return false;
    }
  });

  ipcMain.handle('macros:load', async (_event, id) => {
    try {
      const macrosDir = ensureMacrosDir();
      const filePath = resolveMacroFilePath(id, macrosDir);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (err: any) {
      if (err?.message === 'Invalid macro id') {
        return { success: false, error: 'Invalid macro id' };
      }
      console.error('Failed to load macro:', err);
    }
    return null;
  });

  ipcMain.handle('macros:delete', async (_event, id) => {
    try {
      const macrosDir = ensureMacrosDir();
      const filePath = resolveMacroFilePath(id, macrosDir);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        void macroScheduler.reload();
        return true;
      }
    } catch (err: any) {
      if (err?.message === 'Invalid macro id') {
        return { success: false, error: 'Invalid macro id' };
      }
      console.error('Failed to delete macro:', err);
    }
    return false;
  });

  ipcMain.handle('macros:execute', async (_event, id) => {
    let acquiredId: string | null = null;
    try {
      const macrosDir = ensureMacrosDir();
      const filePath = resolveMacroFilePath(id, macrosDir);
      const normalizedId = String(id ?? '').trim();
      if (!macroScheduler.tryAcquireMacro(normalizedId)) {
        console.warn(`Macro ${normalizedId} is already in flight, skipping concurrent execute.`);
        return false;
      }
      acquiredId = normalizedId;
      console.log(`Executing macro: ${normalizedId}`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        await macroExecutor.execute(data);
      } else {
        console.warn(`No macro file found at ${filePath}`);
      }
    } catch (err: any) {
      if (err?.message === 'Invalid macro id') {
        return { success: false, error: 'Invalid macro id' };
      }
      console.error(`Failed to execute macro: ${id}`, err);
    } finally {
      if (acquiredId) {
        macroScheduler.releaseMacro(acquiredId);
      }
    }
    return true;
  });
}
