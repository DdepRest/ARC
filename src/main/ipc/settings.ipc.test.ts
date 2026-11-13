import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { mockSafeStorage, mockIpcMain, mockBrowserWindow, state } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn((s: string) => Buffer.from(`ENC:${s}`, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => {
      const str = b.toString('utf-8');
      if (!str.startsWith('ENC:')) throw new Error('DPAPI decrypt error');
      return str.slice(4);
    })
  },
  mockIpcMain: {
    handle: vi.fn()
  },
  mockBrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([])
  },
  state: {
    userDataDir: ''
  }
}));

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
  ipcMain: mockIpcMain,
  BrowserWindow: mockBrowserWindow,
  app: {
    getPath: vi.fn(() => state.userDataDir)
  }
}));

import {
  handleSetKey,
  handleGetKey,
  handleHasKey,
  loadStoredKeysToEnv,
  resetPlaintextFallbackLogForTest
} from './settings.ipc';
import { secretVault } from '../services/security/secret-vault.service';

describe('settings.ipc.ts — SecretVaultService Delegation & Zero-Plaintext Disk Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-settings-ipc-test-'));
    resetPlaintextFallbackLogForTest();
  });

  afterEach(() => {
    try {
      if (state.userDataDir && fs.existsSync(state.userDataDir)) {
        fs.rmSync(state.userDataDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('saves encrypted key to secrets.json v2 when safeStorage is available', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);

    const res = handleSetKey('openrouter_key', 'sk-secret-12345');
    expect(res.success).toBe(true);
    expect(res.isEncrypted).toBe(true);
    expect(res.storageMode).toBe('dpapi');
    expect(res.warning).toBeUndefined();

    const secretsPath = path.join(state.userDataDir, 'secrets.json');
    expect(fs.existsSync(secretsPath)).toBe(true);
    const raw = fs.readFileSync(secretsPath, 'utf-8');
    expect(raw).not.toContain('sk-secret-12345');

    const getRes = handleGetKey('openrouter_key');
    expect(getRes.success).toBe(true);
    expect(getRes.value).toBe('sk-secret-12345');
    expect(getRes.status).toBe('ok');
    expect(getRes.isEncrypted).toBe(true);
  });

  it('stores key in session RAM only and NEVER writes plaintext/base64 to disk when safeStorage is unavailable', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);

    const res = handleSetKey('openrouter_key', 'sk-secret-ram-only');
    expect(res.success).toBe(true);
    expect(res.isEncrypted).toBe(false);
    expect(res.storageMode).toBe('session_memory_only');
    expect(res.warning).toContain('только в памяти текущей сессии');

    const secretsPath = path.join(state.userDataDir, 'secrets.json');
    expect(fs.existsSync(secretsPath)).toBe(false);

    const getRes = handleGetKey('openrouter_key');
    expect(getRes.success).toBe(true);
    expect(getRes.value).toBe('sk-secret-ram-only');
    expect(getRes.storageMode).toBe('session_memory_only');

    const hasRes = handleHasKey('openrouter_key');
    expect(hasRes.hasKey).toBe(true);
    expect(hasRes.status).toBe('ok');
  });

  it('migrates legacy v1 unencrypted base64 key into session RAM and removes it from disk when safeStorage is unavailable', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    const secretsPath = path.join(state.userDataDir, 'secrets.json');
    const base64Val = Buffer.from('my-legacy-openrouter-key').toString('base64');
    fs.writeFileSync(
      secretsPath,
      JSON.stringify({
        my_key: {
          encrypted: false,
          data: base64Val
        }
      }),
      'utf-8'
    );

    loadStoredKeysToEnv();

    const res = handleGetKey('my_key');
    expect(res.success).toBe(true);
    expect(res.value).toBe('my-legacy-openrouter-key');
    expect(res.isEncrypted).toBe(false);
    expect(res.storageMode).toBe('session_memory_only');

    // Disk file was upgraded to v2 and scrubbed of unencrypted data
    const afterDisk = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    expect(afterDisk.schemaVersion).toBe(2);
    expect(afterDisk.entries.my_key).toBeUndefined();
    expect(secretVault.getSecurityStatus().secretsStorageMode).toBe('session_memory_only');
  });
});
