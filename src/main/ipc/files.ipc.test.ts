import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsNative from 'fs';
import os from 'os';
import path from 'path';
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

describe('files.ipc Path Traversal & S1-02 Symlink Escape Tests', () => {
  let tmpBase: string;
  let realRoot: string;
  let outsideDir: string;
  let outsideFile: string;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    clearCustomAllowedRoots();
    registerFilesIpc();
    tmpBase = fsNative.mkdtempSync(path.join(os.tmpdir(), 'arc-files-ipc-test-'));
    realRoot = path.join(tmpBase, 'workspace');
    outsideDir = path.join(tmpBase, 'outside');
    fsNative.mkdirSync(realRoot, { recursive: true });
    fsNative.mkdirSync(outsideDir, { recursive: true });
    outsideFile = path.join(outsideDir, 'outside.txt');
    fsNative.writeFileSync(outsideFile, 'OUTSIDE', 'utf8');
  });

  afterEach(() => {
    try {
      if (tmpBase && fsNative.existsSync(tmpBase)) {
        fsNative.rmSync(tmpBase, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
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

  it('S1-02: blocks files:read, files:write, files:delete on symlink/junction and blocks deleting root itself', async () => {
    setCustomAllowedRoots([realRoot]);

    const fileLink = path.join(realRoot, 'symlink-outside.txt');
    const dirJunction = path.join(realRoot, 'junction-outside');
    fsNative.symlinkSync(outsideFile, fileLink);
    fsNative.symlinkSync(outsideDir, dirJunction, 'junction');

    const readHandler = handlers.get('files:read')!;
    const writeHandler = handlers.get('files:write')!;
    const deleteHandler = handlers.get('files:delete')!;

    expect(await readHandler({}, fileLink)).toEqual({ success: false, error: 'PATH_NOT_ALLOWED' });
    expect(await writeHandler({}, fileLink, 'HACK')).toEqual({ success: false, error: 'PATH_NOT_ALLOWED' });
    expect(await writeHandler({}, path.join(dirJunction, 'new.txt'), 'HACK')).toEqual({
      success: false,
      error: 'PATH_NOT_ALLOWED'
    });
    expect(await deleteHandler({}, fileLink)).toEqual({ success: false, error: 'PATH_NOT_ALLOWED' });
    expect(await deleteHandler({}, realRoot)).toEqual({ success: false, error: 'PATH_NOT_ALLOWED' });

    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.rm).not.toHaveBeenCalled();
  });
});
