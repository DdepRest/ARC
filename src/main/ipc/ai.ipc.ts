import { GoogleGenAI } from '@google/genai';
import fs_native from 'fs';
import os from 'os';
import path from 'path';
import { ipcMain, BrowserWindow } from 'electron';
import { aiService, AiProvider } from '../services/ai.service';
import { LocalClassifier } from '../services/local-classifier';
import { DialogLogger } from '../services/dialog-logger';
import { BuiltInLlmService } from '../services/built-in-llm.service';
import { providerHealthManager } from '../services/llm/providers/provider-health';
import { providerManager } from '../services/llm/providers/provider-manager';
import { scanLocalFreeLlm } from '../services/llm/providers/free-llm-scanner';
import { llmCacheService } from '../services/llm-cache.service';
import { sanitizeError } from '../../shared/utils/log-sanitizer';
import { secretVault, MASKED_SECRET_PLACEHOLDER } from '../services/security/secret-vault.service';
import { ttsService } from '../services/tts.service';

let lastDownloadProgressSendTime = 0;

interface FallbackConsentRequest {
  modelName: string;
  sizeBytes: number;
  reason: string;
  timeoutMs: number;
}

let activeConsentResolver: ((approved: boolean) => void) | null = null;
let activeConsentRequest: FallbackConsentRequest | null = null;

export function requestFallbackConsent(payload: FallbackConsentRequest): Promise<boolean> {
  if (activeConsentResolver) {
    console.log('[AI-IPC] Fallback consent dialog already active, skipping duplicate request.');
    return Promise.resolve(false);
  }

  activeConsentRequest = payload;

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      activeConsentResolver = null;
      activeConsentRequest = null;
      resolve(result);
    };

    activeConsentResolver = cleanup;

    // Broadcast event to renderer
    try {
      const wins = BrowserWindow.getAllWindows();
      wins.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('llm:fallback-required', payload);
        }
      });
    } catch (e) {
      console.warn('[AI-IPC] Failed to broadcast llm:fallback-required:', e);
    }

    // Auto-reject on timeout
    timer = setTimeout(() => {
      console.log(`[AI-IPC] Fallback consent timed out after ${payload.timeoutMs}ms. Auto-rejecting.`);
      cleanup(false);
    }, payload.timeoutMs || 30000);
  });
}

export function broadcastToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 4500) {
  try {
    if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
    const wins = BrowserWindow.getAllWindows();
    wins.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('ui:show-toast', { message, type, duration });
      }
    });
  } catch (err) {
    console.warn('[BroadcastToast] Failed to send toast:', err);
  }
}

export const ALLOWED_PROVIDERS = [
  'openrouter', 'huggingface', 'ollama', 'gemini', 'groq', 'deepseek', 'builtin', 'custom', 'local',
  'cloud', 'freellmapi', 'freeapillm', 'freeapi', 'freellm', 'lmstudio', 'vllm', 'localai', 'gpt4all', 'jan',
  'nvidia', 'cerebras', 'sambanova', 'deepinfra', 'horde', 'siliconflow',
  'together', 'fireworks', 'novita', 'lepton', 'openai', 'mistral', 'anthropic', 'cohere', 'perplexity'
];

export function isProviderAllowed(providerIdOrType?: string): boolean {
  if (!providerIdOrType) return true;
  const s = providerIdOrType.toLowerCase().trim();
  if (s.startsWith('new_') || s.startsWith('custom_') || s.startsWith('provider_') || s.startsWith('freeapi_')) return true;
  return ALLOWED_PROVIDERS.some(p => s === p || s.includes(p));
}

function speakSystemResponse(text: string, settings?: any, reqId?: string) {
  if (!text || !text.trim() || text.trim() === 'Остановлено.') return;
  ttsService.speak(
    text, 'default', settings?.voicePresetId || 'eugene',
    settings?.ttsSpeed ?? 1.0, settings?.ttsPitch ?? 0, settings?.ttsSampleRate ?? 48000,
    settings?.ttsPutAccent ?? true, settings?.ttsPutYo ?? true, Boolean(settings?.voiceAutoClearCache), false, reqId
  ).catch((ttsErr) => console.warn('[AI-IPC] System response TTS speak error:', ttsErr));
}

function safeSend(sender: any, channel: string, payload: any) {
  try {
    if (sender && (typeof sender.isDestroyed !== 'function' || !sender.isDestroyed())) {
      sender.send(channel, payload);
    }
  } catch (err) {
    console.warn(`[AI-IPC] Failed to send ${channel} to renderer:`, err);
  }
}

export function registerAiIpc() {
  ipcMain.handle('ai:request', async (event, { text, context, reqId, settings }) => {
    if (settings?.provider && !isProviderAllowed(settings.provider)) {
      console.warn(`[AI-IPC] Provider not allowed: ${settings.provider}`);
      safeSend(event.sender, 'ai:chunk', { chunk: 'Провайдер не разрешён. Проверьте настройки AI-провайдеров.', done: true, reqId, meta: { source: 'system' } });
      return { success: false, error: 'PROVIDER_NOT_ALLOWED' };
    }
    let processedText = text;
    let preprocessed = false;
    const safeSettings = settings ?? {};
    if (safeSettings?.aiPreprocessEnabled) {
      try {
        const originalText = text;
        processedText = await aiService.preprocessText(originalText, safeSettings);
        if (processedText.trim() !== originalText.trim()) {
          preprocessed = true;
          safeSend(event.sender, 'ai:text-corrected', { originalText, correctedText: processedText });
        }
      } catch (e) {
        console.error('[AI-IPC] Error during text preprocessing:', e);
      }
    }

    return new Promise((resolve, reject) => {
      let fullResponse = '';
      let lastRouteData: any = null;
      const startTime = Date.now();

      aiService.request(processedText, context, (chunk, done, isSearching, toolSource) => {
        fullResponse += chunk;
        let meta: any = undefined;
        if (done) {
          const latency = Date.now() - startTime;
          const cause = lastRouteData?.cause || '';
          const isSystemError = cause === 'Нет связи' || cause === 'Нет активных провайдеров' || 
            cause.includes('сбой') || cause.includes('не ответил') || (lastRouteData as any)?.hasError ||
            lastRouteData?.modelName === 'Система';

          if (isSystemError) {
            meta = { source: 'system' };
          } else {
            let providerName = aiService.getActiveProvider(settings)?.name || 'Неизвестно';
            const modelName = lastRouteData?.modelName;
            const isCache = Boolean(lastRouteData?.isCache || lastRouteData?.source === 'cache' || cause.includes('кэш'));
            if (isCache) providerName = lastRouteData?.provider || lastRouteData?.modelName || providerName;
            else if (cause.includes('Исполнение через ')) providerName = cause.replace('Исполнение через ', '').trim();
            else if (cause.includes('Основная локальная модель') || cause.includes('Локальный режим')) providerName = 'Встроенная LLM';
            else if (lastRouteData?.target === 'local' && cause.includes('классификатор')) providerName = 'Локальный классификатор';
            const isLocal = !isCache && lastRouteData?.target === 'local' && ['Локальный классификатор', 'Встроенная LLM', 'Локальный триггер'].includes(providerName);
            meta = { provider: providerName, model: modelName, latency, isCache, source: isCache ? 'cache' : (isLocal ? 'local' : 'live') };
          }
          if (meta?.source === 'system' || meta?.source === 'local') {
            speakSystemResponse(fullResponse, safeSettings, reqId);
          }
        }

        safeSend(event.sender, 'ai:chunk', { chunk, done, reqId, isSearching, toolSource, meta, fullResponse: done ? fullResponse : undefined });
        if (done) {
          try {
            DialogLogger.log(processedText, fullResponse, { originalText: text, preprocessed, provider: meta.provider, model: meta.model });
          } catch (logErr) {
            console.error('[AI-IPC] Dialog log save failed:', logErr);
          }
          setTimeout(() => resolve(fullResponse), 25);
        }
      }, (err) => {
        try {
          const activeProvider = aiService.getActiveProvider(settings);
          DialogLogger.log(processedText, `[FAILED / ABORTED: ${err?.message || err}]`, {
            originalText: text, preprocessed, provider: activeProvider?.name, model: activeProvider?.model,
            aborted: err?.message?.includes('barge-in') || err?.message?.includes('Abort')
          });
        } catch (logErr) {
          console.error('[AI-IPC] Dialog error-log save failed:', logErr);
        }
        reject(err);
      }, settings, (routeData) => {
        lastRouteData = routeData;
        safeSend(event.sender, 'ai:route-info', { reqId, ...routeData });
      });
    });
  });

  ipcMain.handle('ai:abort-request', () => { aiService.abortCurrentRequest(); return { success: true }; });
  ipcMain.handle('ai:prefill-partial', async (_e, payload: { partialText: string; context?: any[]; settings?: any; utteranceId?: string }) => await aiService.prefillPartial(payload || { partialText: '' }));
  ipcMain.handle('ai:cancel-prefill', async (_e, reason?: string) => { await aiService.cancelPrefill(reason || 'ipc_cancel'); return { success: true }; });
  ipcMain.handle('ai:prefill-stats', () => aiService.getPrefillStats());
  ipcMain.handle('ai:cache-stats', () => llmCacheService.stats());
  ipcMain.handle('ai:cache-clear', () => llmCacheService.clear());
  ipcMain.handle('ai:get-providers', () => aiService.getProviders());
  ipcMain.handle('ai:get-quarantined-providers', () => {
    return aiService.getProviders().map(p => ({
      id: p.id, name: p.name, quarantineUntil: providerHealthManager.getHealth(p.id).inQuarantineUntil
    })).filter(p => p.quarantineUntil > Date.now());
  });
  ipcMain.handle('ai:reset-provider-health', (_e, id: string) => { providerHealthManager.reset(id); return { success: true }; });
  ipcMain.handle('ai:save-provider', (_event, provider: AiProvider) => {
    if (provider?.id && !isProviderAllowed(provider.id) && !isProviderAllowed(provider.type) && !isProviderAllowed(provider.name)) {
      return { success: false, error: 'PROVIDER_NOT_ALLOWED' };
    }
    const hadNewKey = Boolean(provider?.apiKey && provider.apiKey.trim() && provider.apiKey.trim() !== MASKED_SECRET_PLACEHOLDER);
    aiService.saveProvider(provider);
    if (hadNewKey && secretVault.getSecurityStatus().secretsStorageMode === 'session_memory_only') {
      broadcastToast('DPAPI недоступен: ключ провайдера сохранён только в памяти текущей сессии (на диск не записан).', 'warning', 6500);
    }
    if (provider?.id) providerHealthManager.reset(provider.id);
    return { success: true };
  });
  ipcMain.handle('ai:delete-provider', (_event, id: string) => { aiService.deleteProvider(id); return { success: true }; });
  ipcMain.handle('ai:test-connection', async (_event, provider: AiProvider) => {
    const res = await aiService.testConnection(provider);
    if (res && res.success && provider?.id) providerHealthManager.reset(provider.id);
    return res;
  });
  ipcMain.handle('ai:get-available-models', async (_event, provider: AiProvider) => ({ models: await aiService.getAvailableModels(provider) }));
  ipcMain.handle('ai:scan-freellm', async (_event, host?: string) => await scanLocalFreeLlm(host));
  ipcMain.handle('ai:check-builtin-model', async (_event, modelName: string) => await BuiltInLlmService.getInstance().isModelDownloaded(modelName));
  ipcMain.handle('ai:get-active-download', async () => BuiltInLlmService.getInstance().getActiveDownloadState());
  ipcMain.handle('llm:approve-fallback', async () => {
    if (activeConsentResolver) { activeConsentResolver(true); return { success: true }; }
    return { success: false, message: 'No active consent request' };
  });
  ipcMain.handle('llm:reject-fallback', async () => {
    if (activeConsentResolver) { activeConsentResolver(false); return { success: true }; }
    return { success: false, message: 'No active consent request' };
  });
  ipcMain.handle('ai:download-builtin-model', async (event, modelName: string, force: boolean = false) => {
    try {
      await BuiltInLlmService.getInstance().downloadModel(modelName, (loaded, total, file) => {
        const now = Date.now();
        const isComplete = total > 0 && loaded >= total;
        if (!isComplete && now - lastDownloadProgressSendTime < 1000) return;
        lastDownloadProgressSendTime = now;
        safeSend(event.sender, 'model:download-progress', { bytes_done: loaded, total_bytes: total, filename: file });
      }, force);
      return { success: true };
    } catch (err: any) {
      lastDownloadProgressSendTime = 0;
      safeSend(event.sender, 'model:download-progress', { bytes_done: 0, total_bytes: 0, filename: modelName, error: err.message || String(err) });
      broadcastToast(`Ошибка загрузки локальной модели: ${err.message || 'Сбой сети'}`, 'error');
      return { success: false, error: err.message || err };
    }
  });
  ipcMain.handle('ui:show-toast', (_event, payload: { message: string; type?: 'info' | 'success' | 'warning' | 'error'; duration?: number }) => {
    broadcastToast(payload.message, payload.type, payload.duration);
    return { success: true };
  });
  ipcMain.handle('ai:cancel-builtin-download', async () => { BuiltInLlmService.getInstance().cancelDownload(); return { success: true }; });
  ipcMain.handle('ai:initialize-builtin-model', async (_event, modelName: string, settings?: any) => await BuiltInLlmService.getInstance().initialize(modelName, settings));
  ipcMain.handle('ai:force-unload', async () => { await BuiltInLlmService.getInstance().disposeAll(); return { success: true }; });
  ipcMain.handle('ai:test-builtin-model', async (_event, modelName?: string, promptText?: string, maxTokens?: number) => await BuiltInLlmService.getInstance().testInference(modelName, promptText, maxTokens));
  ipcMain.handle('ai:check-ollama-online', async () => {
    try { return { online: (await fetch('http://127.0.0.1:11434/api/tags')).ok }; } catch { return { online: false }; }
  });
  ipcMain.handle('ai:classify-command', async (_event, { text, settings }) => {
    try {
      const res = await LocalClassifier.classify(text, settings);
      if (res) speakSystemResponse(res, settings);
      return res;
    } catch (err) {
      console.error('[AI-IPC] Command classification failed:', err);
      return null;
    }
  });
  ipcMain.handle('ai:log-dialog', (_event, { userText, arcResponse, details }) => {
    try { DialogLogger.log(userText, arcResponse, details || {}); return { success: true }; }
    catch (err: any) { console.error(`[AI-IPC] Manual dialog log failed: ${sanitizeError(err)}`); return { success: false, error: err?.message }; }
  });
  ipcMain.handle('ai:analyze-vision', async () => {
    try {
      const tmpFile = os.platform() === 'win32' ? path.join(os.tmpdir(), 'arc_screen.png') : '/tmp/arc_screen.png';
      if (!fs_native.existsSync(tmpFile)) throw new Error("Скриншот не найден.");
      const base64Data = fs_native.readFileSync(tmpFile, { encoding: 'base64' });
      const config = providerManager.resolveMultimodalGeminiConfig();
      if (!config.apiKey.value) return { success: false, error: 'Gemini API key is not configured.' };
      const ai = new GoogleGenAI({ apiKey: config.apiKey.value, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
      const response = await ai.models.generateContent({
        model: config.model,
        contents: [
          { inlineData: { mimeType: 'image/png', data: base64Data } },
          "Что ты видишь на экране? Опиши кратко, емко и по делу, как ИИ-ассистент A.R.C. Отвечай от первого лица, сразу к делу. Если спрашивают, что ты видишь - перечисли основные элементы."
        ]
      });
      return response.text || "Не удалось проанализировать изображение.";
    } catch (e: any) {
      console.error(`[Vision] Analysis error: ${sanitizeError(e)}`);
      return `Произошла ошибка при анализе изображения: ${e?.message || sanitizeError(e)}`;
    }
  });
  ipcMain.handle('ai:get-multimodal-model', async () => {
    const config = providerManager.resolveMultimodalGeminiConfig();
    return { model: config.model, hasKey: Boolean(config.apiKey.value && config.apiKey.status === 'ok') };
  });
}
