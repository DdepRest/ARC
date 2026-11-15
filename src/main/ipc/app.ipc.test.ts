import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { semverGt, registerAppIpc } from './app.ipc';

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn()
  },
  app: {
    getVersion: vi.fn().mockReturnValue('1.0.0'),
    quit: vi.fn()
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn().mockReturnValue(null),
    fromWebContents: vi.fn().mockReturnValue(null)
  }
}));

vi.mock('../services/storage-manager.service', () => ({
  StorageManagerService: {
    getStorageInfo: vi.fn(),
    openDataFolder: vi.fn(),
    resetSystemData: vi.fn(),
    exportDataArchive: vi.fn()
  }
}));

vi.mock('../services/database', () => ({
  DatabaseService: {
    getHealthStatus: vi.fn().mockReturnValue({ isConnected: true })
  }
}));

vi.mock('../services/security/secret-vault.service', () => ({
  secretVault: {
    getSecurityStatus: vi.fn().mockReturnValue({ available: true })
  }
}));

vi.mock('../services/diagnostics.service', () => ({
  DiagnosticsService: {
    exportDiagnostics: vi.fn()
  }
}));

vi.mock('axios');

describe('semverGt', () => {
  it('returns true when latest version is strictly greater than current version', () => {
    expect(semverGt('1.0.10', '1.0.9')).toBe(true);
    expect(semverGt('2.0.0', '1.0.0')).toBe(true);
    expect(semverGt('v1.1.0', '1.0.0')).toBe(true);
    expect(semverGt('1.0.1', '1.0.0')).toBe(true);
  });

  it('returns false when versions are equal or latest is lower', () => {
    expect(semverGt('1.0.0', '1.0.0')).toBe(false);
    expect(semverGt('v1.0.0', '1.0.0')).toBe(false);
    expect(semverGt('1.0.9', '1.0.10')).toBe(false);
    expect(semverGt('1.0.0', '2.0.0')).toBe(false);
  });

  it('handles empty or malformed strings gracefully', () => {
    expect(semverGt('', '1.0.0')).toBe(false);
    expect(semverGt('invalid', '1.0.0')).toBe(false);
  });
});

describe('app.ipc Channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    registerAppIpc();
  });

  it('app:version returns app.getVersion()', async () => {
    const handler = handlers.get('app:version');
    expect(handler).toBeDefined();
    const ver = await handler!();
    expect(ver).toBe('1.0.0');
  });

  it('app:check-updates returns hasUpdate: true when latest tag is newer than current', async () => {
    const mockResponse = {
      data: {
        tag_name: 'v1.1.0',
        body: 'Release notes for 1.1.0',
        html_url: 'https://github.com/OWNER/REPO/releases/tag/v1.1.0'
      }
    };
    (axios.get as any).mockResolvedValueOnce(mockResponse);

    const handler = handlers.get('app:check-updates');
    expect(handler).toBeDefined();
    const result = await handler!();

    expect(result).toEqual({
      success: true,
      hasUpdate: true,
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      changelog: 'Release notes for 1.1.0',
      downloadUrl: 'https://github.com/OWNER/REPO/releases/tag/v1.1.0'
    });
  });

  it('app:check-updates returns hasUpdate: false when latest tag matches current', async () => {
    const mockResponse = {
      data: {
        tag_name: 'v1.0.0',
        body: 'Initial release',
        html_url: 'https://github.com/OWNER/REPO/releases/tag/v1.0.0'
      }
    };
    (axios.get as any).mockResolvedValueOnce(mockResponse);

    const handler = handlers.get('app:check-updates');
    const result = await handler!();

    expect(result).toEqual({
      success: true,
      hasUpdate: false,
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      changelog: 'Initial release',
      downloadUrl: 'https://github.com/OWNER/REPO/releases/tag/v1.0.0'
    });
  });

  it('app:check-updates catches axios errors and returns graceful failure message', async () => {
    (axios.get as any).mockRejectedValueOnce(new Error('Rate limit exceeded (403)'));

    const handler = handlers.get('app:check-updates');
    const result = await handler!();

    expect(result).toEqual({
      success: false,
      error: 'Network error or rate limit exceeded'
    });
  });

  it('system:export-archive delegates to StorageManagerService.exportDataArchive with sender window', async () => {
    const { StorageManagerService } = await import('../services/storage-manager.service');
    (StorageManagerService.exportDataArchive as any).mockResolvedValueOnce({
      success: true,
      filePath: '/tmp/arc-backup.zip',
      sizeBytes: 4096,
      entriesCount: 5
    });

    const handler = handlers.get('system:export-archive');
    expect(handler).toBeDefined();
    const res = await handler!({ sender: {} });
    expect(StorageManagerService.exportDataArchive).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      success: true,
      filePath: '/tmp/arc-backup.zip',
      sizeBytes: 4096,
      entriesCount: 5
    });
  });

  it('system:get-db-status merges database health with secretVault security status', async () => {
    const handler = handlers.get('system:get-db-status');
    expect(handler).toBeDefined();
    const res = await handler!();
    expect(res).toEqual({
      isConnected: true,
      security: { available: true }
    });
  });
});
