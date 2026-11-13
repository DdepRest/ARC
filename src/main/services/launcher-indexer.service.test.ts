import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  shell: {
    openPath: vi.fn(async () => ''),
  },
}));

import { LauncherIndexerService } from './launcher-indexer.service';

describe('LauncherIndexerService (Task 3.3)', () => {
  let tmpDir: string;
  let indexFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-launcher-idx-'));
    indexFilePath = path.join(tmpDir, 'launcher-index.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  function touchFile(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'binary-stub', 'utf-8');
  }

  it('recursively indexes .exe, .lnk, .bat, and .cmd files up to depth 3 and ignores deeper levels (depth 4+)', async () => {
    const root = path.join(tmpDir, 'apps');
    touchFile(path.join(root, 'RootApp.exe')); // depth 1
    touchFile(path.join(root, 'sub1', 'Shortcut.lnk')); // depth 2
    touchFile(path.join(root, 'sub1', 'sub2', 'Runner.bat')); // depth 3
    touchFile(path.join(root, 'sub1', 'sub2', 'Deploy.cmd')); // depth 3
    touchFile(path.join(root, 'sub1', 'sub2', 'Readme.txt')); // ignored extension
    touchFile(path.join(root, 'sub1', 'sub2', 'sub3', 'TooDeep.exe')); // depth 4 -> ignored

    const service = new LauncherIndexerService({ indexFilePath });
    const res = await service.buildIndex([root]);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.indexed).toBe(4);
      expect(res.folders).toBe(1);
    }

    const index = service.loadIndex();
    expect(index?.entries.map((e) => e.name).sort()).toEqual([
      'Deploy',
      'RootApp',
      'Runner',
      'Shortcut',
    ]);
  });

  it('skips ignored directories (node_modules, .git, AppData, Windows) and symbolic links', async () => {
    const root = path.join(tmpDir, 'scan');
    touchFile(path.join(root, 'ValidTool.exe'));
    touchFile(path.join(root, 'node_modules', 'pkg', 'bin.exe'));
    touchFile(path.join(root, '.git', 'hooks', 'hook.bat'));
    touchFile(path.join(root, 'AppData', 'Local', 'helper.exe'));
    touchFile(path.join(root, 'Windows', 'System32', 'cmd.exe'));
    touchFile(path.join(root, 'ProgramData', 'Microsoft', ' updater.exe'));

    // Create external file and a symlink inside root
    const externalExe = path.join(tmpDir, 'external', 'Outside.exe');
    touchFile(externalExe);
    const symlinkPath = path.join(root, 'SymlinkApp.exe');
    try {
      fs.symlinkSync(externalExe, symlinkPath);
    } catch {
      // If symlink creation is restricted, test still verifies ignored dirs
    }

    const service = new LauncherIndexerService({ indexFilePath });
    const res = await service.buildIndex([root]);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.indexed).toBe(1);
    }
    const index = service.loadIndex();
    expect(index?.entries).toHaveLength(1);
    expect(index?.entries[0].name).toBe('ValidTool');
  });

  it('deduplicates entries by resolved path (case-insensitive on win32) and persists launcher-index.json atomically', async () => {
    const root = path.join(tmpDir, 'dup-root');
    const sub = path.join(root, 'bin');
    touchFile(path.join(sub, 'Studio.exe'));

    const service = new LauncherIndexerService({
      indexFilePath,
      platform: 'win32',
    });

    // Pass overlapping folders (root and root/bin)
    const res = await service.buildIndex([root, sub]);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.indexed).toBe(1);
    }

    expect(fs.existsSync(indexFilePath)).toBe(true);
    expect(fs.existsSync(`${indexFilePath}.tmp`)).toBe(false);
  });

  it('returns { success: true, indexed: 0, folders: 0, note: "no_folders" } when folders list is empty', async () => {
    const service = new LauncherIndexerService({ indexFilePath });
    const res = await service.buildIndex([]);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.indexed).toBe(0);
      expect(res.folders).toBe(0);
      expect(res.note).toBe('no_folders');
    }
  });

  it('searches index with prefix match ranked higher than substring match and returns empty results when index file is missing', async () => {
    const service = new LauncherIndexerService({ indexFilePath });

    // Before index file exists -> empty array without throwing
    expect(service.search('code').results).toEqual([]);

    const root = path.join(tmpDir, 'search-apps');
    touchFile(path.join(root, 'MyCodeHelper.exe')); // substring 'code'
    touchFile(path.join(root, 'CodeRunner.exe')); // prefix 'code'
    touchFile(path.join(root, 'Code.exe')); // exact 'code'

    await service.buildIndex([root]);

    const searchRes = service.search('code', 10);
    expect(searchRes.results.map((r) => r.name)).toEqual([
      'Code',
      'CodeRunner',
      'MyCodeHelper',
    ]);
  });

  it('allows launching only paths present in launcher-index.json whitelist and rejects arbitrary external paths', async () => {
    const root = path.join(tmpDir, 'trusted');
    const allowedApp = path.join(root, 'TrustedApp.exe');
    const untrustedApp = path.join(tmpDir, 'untrusted', 'Evil.exe');
    touchFile(allowedApp);
    touchFile(untrustedApp);

    const openPathMock = vi.fn().mockResolvedValue('');
    const service = new LauncherIndexerService({
      indexFilePath,
      platform: 'win32',
      openPathFn: openPathMock,
    });

    await service.buildIndex([root]);

    // Rejects unindexed path
    const blocked = await service.launch(untrustedApp);
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('whitelist');
    expect(openPathMock).not.toHaveBeenCalled();

    // Allows indexed path and passes canonical entry.path to openPath
    const allowed = await service.launch(allowedApp);
    expect(allowed.success).toBe(true);
    expect(openPathMock).toHaveBeenCalledTimes(1);
    expect(openPathMock).toHaveBeenCalledWith(path.resolve(allowedApp));
  });
});
