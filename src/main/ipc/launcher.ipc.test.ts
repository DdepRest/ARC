import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const handlers = new Map<string, (...args: any[]) => any>();
let mockUserDataDir = os.tmpdir();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mockUserDataDir),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  shell: {
    openPath: vi.fn(async () => ''),
  },
}));

import { registerLauncherIpc, saveFolders } from './launcher.ipc';

describe('launcher.ipc handlers (Task 3.3)', () => {
  beforeEach(() => {
    handlers.clear();
    mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-launcher-ipc-'));
    registerLauncherIpc();
  });

  afterEach(() => {
    try {
      fs.rmSync(mockUserDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('registers launcher:refreshIndex, launcher:search, and launcher:launch with new contracts', async () => {
    const refreshHandler = handlers.get('launcher:refreshIndex');
    const searchHandler = handlers.get('launcher:search');
    const launchHandler = handlers.get('launcher:launch');

    expect(refreshHandler).toBeDefined();
    expect(searchHandler).toBeDefined();
    expect(launchHandler).toBeDefined();

    // Empty folders -> note: 'no_folders'
    const emptyRes = await refreshHandler!();
    expect(emptyRes).toMatchObject({
      success: true,
      indexed: 0,
      folders: 0,
      note: 'no_folders',
    });

    // Populate a folder with an executable and refresh
    const appDir = path.join(mockUserDataDir, 'apps');
    fs.mkdirSync(appDir, { recursive: true });
    const exePath = path.join(appDir, 'ArcTerminal.exe');
    fs.writeFileSync(exePath, 'stub', 'utf-8');
    saveFolders([appDir]);

    const populatedRes = await refreshHandler!();
    expect(populatedRes).toMatchObject({
      success: true,
      indexed: 1,
      folders: 1,
    });

    const searchRes = await searchHandler!({}, { query: 'Arc', limit: 10 });
    expect(searchRes.results).toHaveLength(1);
    expect(searchRes.results[0].name).toBe('ArcTerminal');

    const blockedLaunch = await launchHandler!({}, path.join(mockUserDataDir, 'Other.exe'));
    expect(blockedLaunch.success).toBe(false);

    const allowedLaunch = await launchHandler!({}, exePath);
    expect(allowedLaunch.success).toBe(true);
  });
});
