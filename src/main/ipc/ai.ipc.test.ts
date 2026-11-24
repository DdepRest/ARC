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

  it('S1-01: ai:save-provider propagates { success: false, error } without false toast when disk write fails', async () => {
    const { ipcMain } = await import('electron');
    const { registerAiIpc } = await import('./ai.ipc');
    const { aiService } = await import('../services/ai.service');

    vi.spyOn(aiService, 'saveProvider').mockReturnValue({
      success: false,
      storageMode: 'dpapi',
      isEncrypted: false,
      error: 'Ключ не сохранён: нет прав на запись (EACCES).'
    });

    registerAiIpc();
    const handleCalls = (ipcMain.handle as any).mock.calls;
    const saveCall = handleCalls.filter((c: any[]) => c[0] === 'ai:save-provider').pop();
    expect(saveCall).toBeDefined();

    const res = await saveCall[1](null, {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'cloud',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-2.5-flash',
      apiKey: 'AIzaFailKey',
      priority: 1,
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('EACCES');
  });

  it('ai:analyze-vision accepts direct camera frame { imageBase64, mimeType } payload and returns structured result', async () => {
    const { ipcMain } = await import('electron');
    const { registerAiIpc } = await import('./ai.ipc');
    const { providerManager } = await import('../services/llm/providers/provider-manager');

    vi.spyOn(providerManager, 'resolveMultimodalGeminiConfig').mockReturnValue({
      model: 'gemini-2.5-flash',
      apiKey: { status: 'missing', value: '', storageMode: 'dpapi' },
      source: 'default'
    });

    registerAiIpc();
    const handleCalls = (ipcMain.handle as any).mock.calls;
    const visionCall = handleCalls.filter((c: any[]) => c[0] === 'ai:analyze-vision').pop();
    expect(visionCall).toBeDefined();

    const missingKeyRes = await visionCall[1](null, {
      imageBase64: 'data:image/jpeg;base64,aGVsbG8=',
      mimeType: 'image/jpeg'
    });
    expect(missingKeyRes).toEqual({
      success: false,
      error: 'Gemini API key is not configured.'
    });
  });
});


