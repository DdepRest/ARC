import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerFilesIpc } from './files.ipc';
import { setCustomAllowedRoots, clearCustomAllowedRoots } from '../services/files.service';
import fs from 'fs/promises';

const handlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    })
  },
  app: {
    getPath: vi.fn().mockReturnValue('/mock/app/userdata')
  }
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('mock file content'),
    readdir: vi.fn().mockResolvedValue([]),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('files.ipc Path Traversal Tests', () => {
  beforeEach(() => {
    handlers.clear();
    clearCustomAllowedRoots();
    registerFilesIpc();
  });

  it('rejects unauthorized files:read with PATH_NOT_ALLOWED', async () => {
    setCustomAllowedRoots(['/mock/app/userdata']);

    const readHandler = handlers.get('files:read');
    expect(readHandler).toBeDefined();

    const result = await readHandler!({}, '/etc/passwd');
    expect(result.success).toBe(false);
    expect(result.error).toBe('PATH_NOT_ALLOWED');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('rejects path traversal escape attempts', async () => {
    setCustomAllowedRoots(['/mock/app/userdata']);

    const readHandler = handlers.get('files:read');
    const result = await readHandler!({}, '/mock/app/userdata/../../etc/shadow');
    expect(result.success).toBe(false);
    expect(result.error).toBe('PATH_NOT_ALLOWED');
  });

  it('allows authorized files:read inside allowed roots', async () => {
    setCustomAllowedRoots(['/mock/app/userdata']);

    const readHandler = handlers.get('files:read');
    const result = await readHandler!({}, '/mock/app/userdata/arc.db');
    expect(result.success).toBe(true);
    expect(result.content).toBe('mock file content');
    expect(fs.readFile).toHaveBeenCalled();
  });

  it('rejects unauthorized files:list with PATH_NOT_ALLOWED', async () => {
    setCustomAllowedRoots(['/mock/app/userdata']);

    const listHandler = handlers.get('files:list');
    expect(listHandler).toBeDefined();

    const result = await listHandler!({}, '/root');
    expect(result.success).toBe(false);
    expect(result.error).toBe('PATH_NOT_ALLOWED');
  });
});
