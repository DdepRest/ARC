import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProviderManager } from './provider-manager';
import { SecretVaultService } from '../../security/secret-vault.service';

describe('ProviderManager - resolveMultimodalGeminiConfig (Task 2.2)', () => {
  let tmpDir: string;
  let configPath: string;
  let vaultPath: string;
  let vault: SecretVaultService;
  let manager: ProviderManager;
  const origEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-multimodal-test-'));
    configPath = path.join(tmpDir, 'ai-providers.json');
    vaultPath = path.join(tmpDir, 'secrets.json');
    delete process.env.GEMINI_API_KEY;
    vault = new SecretVaultService(vaultPath);
    manager = new ProviderManager(configPath, vault);
  });

  afterEach(() => {
    if (origEnvKey !== undefined) {
      process.env.GEMINI_API_KEY = origEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('resolves model and key from active Gemini provider, stripping google/ and models/ prefixes', () => {
    manager.saveProvider({
      id: 'gemini',
      name: 'Google Gemini',
      type: 'cloud',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'google/gemini-2.5-flash',
      priority: 1,
      apiKey: 'AIzaSyTestKey12345',
      hasApiKey: true,
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true
    });

    const resolved = manager.resolveMultimodalGeminiConfig();
    expect(resolved.model).toBe('gemini-2.5-flash');
    expect(resolved.apiKey.status).toBe('ok');
    expect(resolved.apiKey.value).toBe('AIzaSyTestKey12345');
    expect(resolved.source).toBe('active_provider');

    manager.saveProvider({
      id: 'gemini',
      name: 'Google Gemini',
      type: 'cloud',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'models/gemini-2.5-pro',
      priority: 1,
      apiKey: 'AIzaSyTestKeyPro',
      hasApiKey: true,
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true
    });

    const resolvedPro = manager.resolveMultimodalGeminiConfig();
    expect(resolvedPro.model).toBe('gemini-2.5-pro');
    expect(resolvedPro.apiKey.value).toBe('AIzaSyTestKeyPro');
  });

  it('falls back to gemini-2.5-flash with resolveGeminiApiKey when active provider is non-Gemini', () => {
    vault.setSecret('gemini_api_key', 'AIzaSyGlobalKey999');
    manager.saveProvider({
      id: 'ollama',
      name: 'Ollama Local',
      type: 'local',
      endpoint: 'http://127.0.0.1:11434/api/generate',
      model: 'qwen2.5:7b',
      priority: 1,
      apiKey: '',
      hasApiKey: false,
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true
    });

    const resolved = manager.resolveMultimodalGeminiConfig();
    expect(resolved.model).toBe('gemini-2.5-flash');
    expect(resolved.apiKey.status).toBe('ok');
    expect(resolved.apiKey.value).toBe('AIzaSyGlobalKey999');
    expect(resolved.source).toBe('vault');
  });

  it('returns missing status and default gemini-2.5-flash model when no API key is configured without throwing', () => {
    const resolved = manager.resolveMultimodalGeminiConfig();
    expect(resolved.model).toBe('gemini-2.5-flash');
    expect(resolved.apiKey.status).toBe('missing');
    expect(resolved.apiKey.value).toBeNull();
    expect(resolved.source).toBe('default');
  });
});
