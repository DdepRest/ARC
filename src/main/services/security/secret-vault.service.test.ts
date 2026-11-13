import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn((plain: string) => {
      const payload = Buffer.from(plain, 'utf-8').map((b) => b ^ 0x5a);
      return Buffer.concat([Buffer.from('DPAPI:', 'utf-8'), Buffer.from(payload)]);
    }),
    decryptString: vi.fn((buf: Buffer) => {
      const header = 'DPAPI:';
      if (buf.length < header.length || buf.subarray(0, header.length).toString('utf-8') !== header) {
        throw new Error('DPAPI decryption failed: wrong Windows user profile or corrupted blob');
      }
      const unxored = Buffer.from(buf.subarray(header.length).map((b) => b ^ 0x5a));
      return unxored.toString('utf-8');
    })
  }
}));

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir())
  }
}));

import {
  SecretVaultService,
  MASKED_SECRET_PLACEHOLDER
} from './secret-vault.service';
import { ProviderManager } from '../llm/providers/provider-manager';

describe('Task 1.2 — SecretVaultService & ProviderManager DPAPI Policy', () => {
  let tmpDir: string;
  let secretsPath: string;
  let providersPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-secret-vault-test-'));
    secretsPath = path.join(tmpDir, 'secrets.json');
    providersPath = path.join(tmpDir, 'ai-providers.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup error
    }
  });

  it('1. safeStorage = true: writes v2 schema with encrypted: true and zero plaintext/base64 on disk', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    const vault = new SecretVaultService(secretsPath);

    const writeRes = vault.setSecret('openrouter_api_key', 'sk-or-v1-supersecret999');
    expect(writeRes.success).toBe(true);
    expect(writeRes.storageMode).toBe('dpapi');
    expect(writeRes.isEncrypted).toBe(true);
    expect(writeRes.warning).toBeUndefined();

    expect(fs.existsSync(secretsPath)).toBe(true);
    const rawFile = fs.readFileSync(secretsPath, 'utf-8');
    expect(rawFile).not.toContain('sk-or-v1-supersecret999');
    expect(rawFile).not.toContain(Buffer.from('sk-or-v1-supersecret999').toString('base64'));

    const parsed = JSON.parse(rawFile);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.entries.openrouter_api_key.encrypted).toBe(true);
    expect(typeof parsed.entries.openrouter_api_key.ciphertextBase64).toBe('string');

    const readRes = vault.getSecret('openrouter_api_key');
    expect(readRes.status).toBe('ok');
    expect(readRes.value).toBe('sk-or-v1-supersecret999');
    expect(readRes.storageMode).toBe('dpapi');
  });

  it('2. safeStorage = false: stores secret ONLY in session RAM and writes nothing to secrets.json or ai-providers.json', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    const vault = new SecretVaultService(secretsPath);

    const writeRes = vault.setSecret('gemini_api_key', 'AIzaSySessionOnlyKey123');
    expect(writeRes.success).toBe(true);
    expect(writeRes.storageMode).toBe('session_memory_only');
    expect(writeRes.isEncrypted).toBe(false);
    expect(writeRes.warning).toContain('только в памяти текущей сессии');

    // Disk file must NOT be created for session-only secret
    expect(fs.existsSync(secretsPath)).toBe(false);

    // Reading within the same session returns the value from RAM
    const readRes = vault.getSecret('gemini_api_key');
    expect(readRes.status).toBe('ok');
    expect(readRes.value).toBe('AIzaSySessionOnlyKey123');
    expect(readRes.storageMode).toBe('session_memory_only');

    // Simulated app restart (new instance) has no secret on disk
    const restartedVault = new SecretVaultService(secretsPath);
    expect(restartedVault.getSecret('gemini_api_key').status).toBe('missing');
  });

  it('3a. Legacy v1 migration with safeStorage = true: re-encrypts legacy secrets.json and strips b64:/enc:/plaintext from ai-providers.json', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);

    // Write legacy v1 secrets.json with plaintext base64 entry
    const legacyPlainKey = 'AIzaLegacyPlaintextGeminiKey';
    fs.writeFileSync(
      secretsPath,
      JSON.stringify({
        gemini_api_key: {
          encrypted: false,
          data: Buffer.from(legacyPlainKey, 'utf-8').toString('base64')
        }
      }),
      'utf-8'
    );

    const vault = new SecretVaultService(secretsPath);
    const migStats = vault.migrateLegacySecretsOnStartup();
    expect(migStats.migratedCount).toBe(1);

    const diskAfter = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    expect(diskAfter.schemaVersion).toBe(2);
    expect(diskAfter.entries.gemini_api_key.encrypted).toBe(true);
    expect(fs.readFileSync(secretsPath, 'utf-8')).not.toContain(
      Buffer.from(legacyPlainKey, 'utf-8').toString('base64')
    );
    expect(vault.getSecret('gemini_api_key').value).toBe(legacyPlainKey);

    // Also test legacy b64: and enc: in ai-providers.json via ProviderManager
    const b64ProviderKey = `b64:${Buffer.from('sk-legacy-b64-provider-key', 'utf-8').toString('base64')}`;
    const encProviderKey = `enc:${mockSafeStorage.encryptString('sk-legacy-enc-provider-key').toString('base64')}`;
    fs.writeFileSync(
      providersPath,
      JSON.stringify([
        {
          id: 'openrouter_legacy',
          name: 'OpenRouter Legacy',
          type: 'cloud',
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: b64ProviderKey,
          model: 'qwen/qwen3-coder:free',
          enabled: true,
          priority: 1
        },
        {
          id: 'groq_legacy',
          name: 'Groq Legacy',
          type: 'cloud',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: encProviderKey,
          model: 'llama-3.3-70b-versatile',
          enabled: true,
          priority: 2
        }
      ]),
      'utf-8'
    );

    const pm = new ProviderManager(providersPath, vault);
    const providersOnDisk = JSON.parse(fs.readFileSync(providersPath, 'utf-8'));
    for (const p of providersOnDisk) {
      expect(p.apiKey).toBe('');
      expect(p.hasApiKey).toBe(true);
    }
    const rawProvidersDisk = fs.readFileSync(providersPath, 'utf-8');
    expect(rawProvidersDisk).not.toContain('b64:');
    expect(rawProvidersDisk).not.toContain('enc:');
    expect(rawProvidersDisk).not.toContain('sk-legacy-b64-provider-key');

    expect(pm.resolveProviderKey('openrouter_legacy').value).toBe('sk-legacy-b64-provider-key');
    expect(pm.resolveProviderKey('groq_legacy').value).toBe('sk-legacy-enc-provider-key');
  });

  it('3b. Legacy v1 migration with safeStorage = false: moves legacy plaintext keys to session RAM and scrubs them from disk', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);

    const legacySecret = 'sk-v1-unencrypted-secret';
    fs.writeFileSync(
      secretsPath,
      JSON.stringify({
        openrouter_api_key: {
          encrypted: false,
          data: Buffer.from(legacySecret, 'utf-8').toString('base64')
        }
      }),
      'utf-8'
    );

    const vault = new SecretVaultService(secretsPath);
    const migStats = vault.migrateLegacySecretsOnStartup();
    expect(migStats.movedToSessionCount).toBe(1);

    // Moved to session RAM for current run
    const readRes = vault.getSecret('openrouter_api_key');
    expect(readRes.status).toBe('ok');
    expect(readRes.value).toBe(legacySecret);
    expect(readRes.storageMode).toBe('session_memory_only');

    // Purged from disk
    const diskAfter = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    expect(diskAfter.schemaVersion).toBe(2);
    expect(diskAfter.entries.openrouter_api_key).toBeUndefined();
    expect(fs.readFileSync(secretsPath, 'utf-8')).not.toContain(
      Buffer.from(legacySecret, 'utf-8').toString('base64')
    );
  });

  it('4. Unreadable DPAPI blob (wrong Windows user profile): returns status="unreadable", preserves disk entry, increments unreadableKeysCount', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);

    // Write a v2 entry whose ciphertext was encrypted under a different Windows user profile
    const foreignCiphertext = Buffer.from('FOREIGN_WINDOWS_PROFILE_BLOB').toString('base64');
    fs.writeFileSync(
      secretsPath,
      JSON.stringify({
        schemaVersion: 2,
        entries: {
          'provider:openrouter_1:api_key': {
            encrypted: true,
            ciphertextBase64: foreignCiphertext,
            updatedAt: '2026-10-31T00:00:00.000Z'
          }
        }
      }),
      'utf-8'
    );

    const vault = new SecretVaultService(secretsPath);
    const res = vault.resolveProviderApiKey('openrouter_1');

    expect(res.status).toBe('unreadable');
    expect(res.value).toBeNull();
    expect(res.errorMessage).toContain('DPAPI');

    // Disk entry MUST NOT be deleted
    const diskAfter = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    expect(diskAfter.entries['provider:openrouter_1:api_key'].ciphertextBase64).toBe(foreignCiphertext);

    const secStatus = vault.getSecurityStatus();
    expect(secStatus.unreadableKeysCount).toBe(1);
  });

  it('5 & 6. getProviders() returns masked placeholder while resolveProviderApiKey returns real secret, and saving with placeholder does not overwrite real secret', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    const vault = new SecretVaultService(secretsPath);
    const pm = new ProviderManager(providersPath, vault);

    pm.saveProvider({
      id: 'openrouter_main',
      name: 'OpenRouter Main',
      type: 'cloud',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: 'sk-or-v1-real-secret-key-777',
      model: 'qwen/qwen3-coder:free',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      priority: 1
    });

    // 5. Renderer-facing getProviders() returns MASKED_SECRET_PLACEHOLDER, never real key
    const uiProviders = pm.getProviders();
    const savedUi = uiProviders.find((p) => p.id === 'openrouter_main');
    expect(savedUi).toBeDefined();
    expect(savedUi!.apiKey).toBe(MASKED_SECRET_PLACEHOLDER);
    expect(savedUi!.hasApiKey).toBe(true);
    expect(savedUi!.apiKeyStatus).toBe('ok');

    // Real key is resolved in main process
    const resolved = pm.resolveProviderKey('openrouter_main', savedUi!.apiKey);
    expect(resolved.status).toBe('ok');
    expect(resolved.value).toBe('sk-or-v1-real-secret-key-777');

    // 6. Saving the provider back from UI with MASKED_SECRET_PLACEHOLDER preserves the real key
    pm.saveProvider({
      ...savedUi!,
      temperature: 0.3,
      apiKey: MASKED_SECRET_PLACEHOLDER
    });

    const resolvedAfterUiSave = pm.resolveProviderKey('openrouter_main');
    expect(resolvedAfterUiSave.status).toBe('ok');
    expect(resolvedAfterUiSave.value).toBe('sk-or-v1-real-secret-key-777');

    // Explicitly clearing apiKey ('') deletes the secret from vault
    pm.saveProvider({
      ...savedUi!,
      apiKey: ''
    });
    expect(pm.resolveProviderKey('openrouter_main').status).toBe('missing');
    expect(pm.getProviders().find((p) => p.id === 'openrouter_main')?.apiKey).toBe('');
  });

  it('7. resolveGeminiApiKey follows strict priority order: gemini_api_key -> provider:gemini:api_key -> process.env.GEMINI_API_KEY', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    const vault = new SecretVaultService(secretsPath);

    // Priority 3: fallback to process.env.GEMINI_API_KEY when vault has neither slot
    process.env.GEMINI_API_KEY = 'AIzaEnvFallbackKey333';
    expect(vault.resolveGeminiApiKey()).toEqual({
      value: 'AIzaEnvFallbackKey333',
      status: 'ok',
      storageMode: 'session_memory_only'
    });

    // Priority 2: provider:gemini:api_key overrides process.env.GEMINI_API_KEY
    vault.setSecret('provider:gemini:api_key', 'AIzaProviderGeminiKey222');
    expect(vault.resolveGeminiApiKey()).toEqual({
      value: 'AIzaProviderGeminiKey222',
      status: 'ok',
      storageMode: 'dpapi'
    });

    // Priority 1: gemini_api_key overrides both provider:gemini:api_key and process.env.GEMINI_API_KEY
    vault.setSecret('gemini_api_key', 'AIzaPrimaryGeminiKey111');
    expect(vault.resolveGeminiApiKey()).toEqual({
      value: 'AIzaPrimaryGeminiKey111',
      status: 'ok',
      storageMode: 'dpapi'
    });
  });
});

