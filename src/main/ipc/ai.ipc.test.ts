import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/app/userdata')
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([])
  },
  ipcMain: {
    handle: vi.fn()
  }
}));

import { isProviderAllowed, ALLOWED_PROVIDERS } from './ai.ipc';

describe('ai.ipc Provider Allowlist Tests', () => {
  it('allows verified AI providers', () => {
    expect(isProviderAllowed('openrouter')).toBe(true);
    expect(isProviderAllowed('ollama')).toBe(true);
    expect(isProviderAllowed('builtin')).toBe(true);
    expect(isProviderAllowed('gemini')).toBe(true);
    expect(isProviderAllowed('groq')).toBe(true);
    expect(isProviderAllowed('deepseek')).toBe(true);
    expect(isProviderAllowed('freellmapi')).toBe(true);
    expect(isProviderAllowed('cloud')).toBe(true);
    expect(isProviderAllowed('new_1726615320000')).toBe(true);
    expect(isProviderAllowed('custom_preset')).toBe(true);
  });

  it('rejects unverified or malicious provider identifiers', () => {
    expect(isProviderAllowed('evil-api')).toBe(false);
    expect(isProviderAllowed('malicious-c2-server')).toBe(false);
    expect(isProviderAllowed('unauthorized_service')).toBe(false);
  });

  it('handles undefined or empty gracefully', () => {
    expect(isProviderAllowed(undefined)).toBe(true);
    expect(isProviderAllowed('')).toBe(true);
  });

  it('registers ai:get-multimodal-model and returns { model, hasKey } without leaking apiKey value', async () => {
    const { ipcMain } = await import('electron');
    const { registerAiIpc } = await import('./ai.ipc');
    const { providerManager } = await import('../services/llm/providers/provider-manager');

    vi.spyOn(providerManager, 'resolveMultimodalGeminiConfig').mockReturnValue({
      model: 'gemini-2.5-flash',
      apiKey: { status: 'ok', value: 'SUPER_SECRET_KEY_DO_NOT_LEAK', storageMode: 'dpapi' },
      source: 'active_provider'
    });

    registerAiIpc();

    const handleCalls = (ipcMain.handle as any).mock.calls;
    const multimodalCall = handleCalls.find((c: any[]) => c[0] === 'ai:get-multimodal-model');
    expect(multimodalCall).toBeDefined();

    const result = await multimodalCall[1]();
    expect(result).toEqual({
      model: 'gemini-2.5-flash',
      hasKey: true
    });
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET_KEY_DO_NOT_LEAK');
  });
});

