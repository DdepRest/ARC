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

  it('S1-01 fail-closed: handleSetKey returns success=false and never falls back to session RAM or leaks secret when DPAPI disk write fails', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    delete process.env.GEMINI_API_KEY;
    const rawSecret = 'AIzaSuperSecretIpcFailKey';

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const openSpy = vi.spyOn(fs, 'openSync').mockImplementation(() => {
      throw Object.assign(new Error(`Denied writing ${rawSecret}`), { code: 'EACCES' });
    });
    try {
      const res = handleSetKey('gemini_api_key', rawSecret);
      expect(res.success).toBe(false);
      expect(res.isEncrypted).toBe(false);
      expect(res.error).toContain('EACCES');
      expect(res.error).not.toContain(rawSecret);
      expect(process.env.GEMINI_API_KEY).toBeUndefined();
      expect(handleGetKey('gemini_api_key').status).toBe('missing');
    } finally {
      openSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('S1-01 canonical Gemini slot: handleSetKey("GEMINI_API_KEY") stores in gemini_api_key and removes legacy provider:gemini:api_key', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    secretVault.setSecret('provider:gemini:api_key', 'AIzaOldAlias');

    const res = handleSetKey('GEMINI_API_KEY', 'AIzaCanonicalIpcKey');
    expect(res.success).toBe(true);

    const disk = JSON.parse(fs.readFileSync(path.join(state.userDataDir, 'secrets.json'), 'utf-8'));
    expect(disk.entries.gemini_api_key).toBeDefined();
    expect(disk.entries['provider:gemini:api_key']).toBeUndefined();
    expect(process.env.GEMINI_API_KEY).toBe('AIzaCanonicalIpcKey');
  });
});

