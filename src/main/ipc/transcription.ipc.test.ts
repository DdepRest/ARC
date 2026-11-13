import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn().mockResolvedValue({ text: '[00:00 - 00:05] Тестовая транскрибация' });

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp')
  },
  ipcMain: {
    handle: vi.fn()
  }
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent
    };
  }
}));

vi.mock('../services/built-in-whisper.service', () => ({
  builtInWhisperService: {
    isModelDownloaded: vi.fn().mockResolvedValue(true),
    downloadModel: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockResolvedValue('local text'),
    abort: vi.fn()
  }
}));

import { ipcMain } from 'electron';
import { registerTranscriptionIpc } from './transcription.ipc';
import { providerManager } from '../services/llm/providers/provider-manager';

describe('transcription.ipc - Multimodal Model Resolution (Task 2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses providerManager.resolveMultimodalGeminiConfig() model in transcription:transcribe-gemini', async () => {
    vi.spyOn(providerManager, 'resolveMultimodalGeminiConfig').mockReturnValue({
      model: 'gemini-2.5-flash',
      apiKey: { status: 'ok', value: 'AIzaTestKey', storageMode: 'dpapi' },
      source: 'active_provider'
    });

    registerTranscriptionIpc();

    const handleCalls = (ipcMain.handle as any).mock.calls;
    const geminiCall = handleCalls.find((c: any[]) => c[0] === 'transcription:transcribe-gemini');
    expect(geminiCall).toBeDefined();

    const res = await geminiCall[1]({}, { base64Data: 'dGVzdA==', mimeType: 'audio/mp3' });
    expect(res).toEqual({
      success: true,
      text: '[00:00 - 00:05] Тестовая транскрибация'
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash'
      })
    );
  });

  it('returns clear error when Gemini API key is missing', async () => {
    vi.spyOn(providerManager, 'resolveMultimodalGeminiConfig').mockReturnValue({
      model: 'gemini-2.5-flash',
      apiKey: { status: 'missing', value: null, storageMode: 'dpapi' },
      source: 'default'
    });

    registerTranscriptionIpc();

    const handleCalls = (ipcMain.handle as any).mock.calls;
    const geminiCall = handleCalls.find((c: any[]) => c[0] === 'transcription:transcribe-gemini');
    const res = await geminiCall[1]({}, { base64Data: 'dGVzdA==', mimeType: 'audio/mp3' });

    expect(res.success).toBe(false);
    expect(res.error).toContain('GEMINI_API_KEY');
  });
});
