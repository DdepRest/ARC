import { ipcMain } from 'electron';
import { sttService } from '../services/stt.service';
import { ttsService } from '../services/tts.service';
import { PythonServerService } from '../services/python_server.service';
import { BrowserWindow } from 'electron';
import { adaptiveService } from '../services/adaptive.service';
import { cacheService } from '../services/cache.service';
import { LocalClassifier } from '../services/local-classifier';
import { aiCache } from '../services/ai-cache';
import { vkWebSocketServer } from '../services/media/vk-websocket-server';
import { BuiltInWhisperService } from '../services/built-in-whisper.service';
import { BuiltInLlmService } from '../services/built-in-llm.service';
import { llmCacheService } from '../services/llm-cache.service';
import { SHERPA_MODELS_CONFIG, sherpaDownloaderService } from '../services/sherpa-downloader.service';
import { hfRateLimiter } from '../services/hf-rate-limiter.service';
import { FALLBACK_STT_MODELS_LIST, fetchFullSttModelsList } from '../services/stt-models-list.helper';
import { STT_CHECK_TIMEOUT_MS } from '../config/timeouts';
import { sanitizeError } from '../../shared/utils/log-sanitizer';
import { SystemMediaController } from '../services/media/system-media';

export function registerVoiceIpc() {
  SystemMediaController.warmUp();

  ipcMain.handle('media:duck-system', (_event, payload: { factor: number; enable: boolean }) => {
    try {
      SystemMediaController.duckSystemAudio(payload?.factor ?? 0.7, Boolean(payload?.enable));
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('tts:reload-dictionaries', async () => {
    try {
      const axios = require('axios');
      const response = await axios.post('http://127.0.0.1:8002/reload_dicts');
      return { success: true, data: response.data };
    } catch (e) {
      console.error(`[VoiceIPC] tts:reload-dictionaries error: ${sanitizeError(e)}`);
      return { success: false, error: sanitizeError(e) };
    }
  });

  ipcMain.handle('voice:start-listening', async (event, modelName?: string) => {
    try {
      const ok = await sttService.startListening(modelName);
      return { success: ok && sttService.getStatus().ready };
    } catch (e) {
      console.error(`[VoiceIPC] voice:start-listening error: ${sanitizeError(e)}`);
      return { success: false, error: sanitizeError(e) };
    }
  });

  ipcMain.handle('voice:stop-listening', async () => {
    const text = await sttService.stopListening();
    return { text };
  });

  ipcMain.handle('voice:speak', async (_event, payload = {}) => {
    try {
      const { text, style, speed, pitch, sampleRate, putAccent, putYo, speaker, autoClearCache, force, queryId } = payload;
      // Fire-and-forget async invocation: does not block the Electron IPC channel while synthesizing audio
      void ttsService.speak(text, style, speaker || 'eugene', speed, pitch, sampleRate, putAccent, putYo, autoClearCache, Boolean(force), queryId)
        .catch(e => console.warn(`[VoiceIPC] Async ttsService.speak warning: ${sanitizeError(e)}`));
      return { success: true };
    } catch (e) {
      console.warn(`[VoiceIPC] voice:speak error: ${sanitizeError(e)}`);
      return { success: false, error: sanitizeError(e) };
    }
  });

  ipcMain.handle('voice:stop-speak', async () => {
    ttsService.stop(true);
    return { success: true };
  });

  ipcMain.handle('tts:get-active-engine', async () => {
    return ttsService.getActiveEngine();
  });

  ipcMain.handle('tts:set-provider', async (_event, provider: string) => {
    const normalized = (provider === 'piper' || provider === 'kokoro') ? 'auto' : provider;
    if (normalized !== provider) {
      console.warn(`[VoiceIPC] Planned TTS provider "${provider}" is not active in v1.0; migrating to "auto".`);
    }
    ttsService.setProvider(normalized);
    return ttsService.getActiveEngine();
  });

  ipcMain.handle('vk:control', async (event, action, data) => {
    return LocalClassifier.controlVk(action, data);
  });

  ipcMain.handle('vk:get-connection-status', async () => {
    return vkWebSocketServer.getConnectionStatus();
  });

  // Streaming chunks
  ipcMain.on('voice:stream-chunk', (_evt, samples: Float32Array) => {
    sttService.feedChunk(samples);
  });
  
  ipcMain.on('voice:stream-end', () => {
    sttService.endStream();
  });

  ipcMain.on('voice:reset-buffer', () => {
    sttService.resetBuffer();
  });

  ipcMain.on('voice:set-busy', async (_evt, busy: boolean) => {
    try {
      BuiltInLlmService.getInstance().setVoiceBusy(Boolean(busy));
    } catch (e) {
      console.warn('[VoiceIPC] Failed to update voice busy state:', e);
    }
  });

  // STT status, set-engine & reload
  ipcMain.handle('stt:status', () => sttService.getStatus());
  ipcMain.handle('stt:set-engine', async (_event, engine: 'gigaam' | 'legacy') => {
    sttService.setEngine(engine);
    return { success: true, engine };
  });
  ipcMain.handle('stt:reload', async (_event, modelName?: string) => {
    try {
      const res = await sttService.switchModel(modelName || 'zipformer-ru', 'user_switch');
      if (res && !res.ready && res.error) {
        if (/4294967295|-1|worker process exited/i.test(res.error)) {
          res.error = 'Критический сбой движка STT. Попробуйте другую модель или перезапустите приложение';
        }
      }
      return res;
    } catch (err: any) {
      console.warn('[Voice IPC] stt:reload error:', err?.message || err);
      return {
        ready: false,
        error: 'Критический сбой движка STT. Попробуйте другую модель или перезапустите приложение'
      };
    }
  });
  ipcMain.handle('stt:switch-model', async (_event, modelId: string) => {
    return sttService.switchModel(modelId, 'user_switch');
  });
  ipcMain.handle('stt:cancel-download', async () => {
    sherpaDownloaderService.cancelDownload();
    return { success: true };
  });

  sttService.on('fallback', (info) => {
    try {
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((w: any) => {
        w.webContents.send('stt:fallback', info);
      });
    } catch (err) {
      console.warn('[Voice IPC] Failed to broadcast fallback:', err);
    }
  });

  sttService.on('ready', (info) => {
    try {
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((w: any) => {
        w.webContents.send('stt:ready', info);
      });
    } catch (err) {
      console.warn('[Voice IPC] Failed to broadcast stt:ready:', err);
    }
  });

  sttService.on('engine-ready', (info) => {
    try {
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((w: any) => {
        w.webContents.send('stt:engine-ready', info);
      });
    } catch (err) {
      console.warn('[Voice IPC] Failed to broadcast stt:engine-ready:', err);
    }
  });

  ipcMain.handle('stt:list-models', async () => {
    try {
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 1500));
      const fullPromise = fetchFullSttModelsList();
      const raceResult = await Promise.race([fullPromise, timeoutPromise]);

      if (raceResult === 'timeout') {
        fullPromise.then((finalRes) => {
          try {
            const { BrowserWindow } = require('electron');
            BrowserWindow.getAllWindows().forEach((w: any) => {
              w.webContents.send('stt:models-updated', finalRes);
            });
          } catch {}
        });
        return FALLBACK_STT_MODELS_LIST;
      }

      return raceResult;
    } catch (err: any) {
      console.warn('[stt:list-models] Fallback returned:', err?.message || err);
      return {
        ...FALLBACK_STT_MODELS_LIST,
        sherpaAvailable: false,
        isPending: false
      };
    }
  });

  ipcMain.handle('stt:download-model', async (event, { modelId, provider }) => {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    const sendProgress = (data: any) => {
      wins.forEach((w: any) => w.webContents.send('stt:download-progress', data));
    };

    if (provider === 'whisper') {
      try {
        sendProgress({ modelId, percent: 0, status: 'downloading' });
        await BuiltInWhisperService.getInstance().downloadModel(modelId, (loaded: number, total: number) => {
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
          sendProgress({ modelId, percent, status: 'downloading', bytes_done: loaded, total_bytes: total });
        });
        sendProgress({ modelId, percent: 100, status: 'completed' });
        return { success: true };
      } catch (e: any) {
        sendProgress({ modelId, status: 'error', error: e?.message || String(e) });
        return { success: false, error: e?.message || String(e) };
      }
    } else {
      try {
        return await sherpaDownloaderService.downloadModel(modelId, sendProgress);
      } catch (e: any) {
        sendProgress({ modelId, status: 'error', error: e?.message || String(e) });
        return { success: false, error: e?.message || String(e) };
      }
    }
  });

  ipcMain.handle('hf:reset-cooldown', () => {
    hfRateLimiter.resetCooldown();
    return { success: true };
  });

  ipcMain.handle('tts:restart-server', async () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      PythonServerService.stop();
      await PythonServerService.start(wins[0]);
    }
  });
  
  ipcMain.handle('tts:server-status', async () => {
    try {
      const axios = require('axios');
      const r = await axios.get('http://127.0.0.1:8002/status', { timeout: 2000 });
      return { online: true, ...r.data };
    } catch {
      return { online: false };
    }
  });

  // Adaptive
  ipcMain.handle('adaptive:get-state', () => {
    return {
      currentTier: adaptiveService.getCurrentTier(),
      manualPreset: adaptiveService.getManualPreset()
    };
  });

  ipcMain.handle('adaptive:force-tier', (event, preset) => {
    adaptiveService.setManualPreset(preset);
    return { success: true };
  });

  ipcMain.handle('adaptive:add-process', (event, name) => {
    adaptiveService.addProcess(name);
    return { success: true };
  });

  // Cache
  ipcMain.handle('voice:get-cache-stats', async () => {
    try {
      const stats = cacheService.getStats();
      try {
        const axios = require('axios');
        const res = await axios.get('http://127.0.0.1:8002/cache-stats', { timeout: 500 });
        if (res.data && res.data.entries > 0) {
          stats.entries += res.data.entries;
          stats.sizeBytes += res.data.sizeBytes || 0;
        }
      } catch (e: any) { console.warn(`[Voice IPC] cache-stats failed: ${e.code || 'ERR'} ${e.message || 'Unknown'}`); }
      return stats;
    } catch(e) {
      return { entries: 0, sizeBytes: 0, hits: 0, misses: 0, evictions: 0 };
    }
  });

  ipcMain.handle('voice:clear-cache', async () => {
    try {
      const result = cacheService.clear();
      aiCache.clear();
      llmCacheService.clear();
      try {
        const { memoryManager } = require('../services/memory/memory-manager');
        if (memoryManager?.stm) memoryManager.stm.clear();
      } catch {}
      const axios = require('axios');
      void Promise.resolve(axios.post('http://127.0.0.1:8002/clear-cache', {}, { timeout: 200 })).catch(() => {});
      return { success: true, ...result };
    } catch(e) {
      return { success: false, error: String(e) };
    }
  });

  // Calibration (stub for UI)
  ipcMain.handle('voice:calibration-start', () => { return { success: true }; });
  ipcMain.handle('voice:calibration-done', (event, audioBuffer) => { return { ok: true }; });
  ipcMain.handle('voice:calibration-reset', () => { return { ok: true }; });

  // TTS
  ipcMain.handle('tts:get-presets', async () => {
    try {
      const axios = require('axios');
      const res = await axios.get('http://127.0.0.1:8002/presets');
      return res.data.presets;
    } catch(e) {
      return [];
    }
  });

  ipcMain.handle('tts:get-tier', () => {
    return adaptiveService.getCurrentTier();
  });

  // Forward wake-word events to renderer
  sttService.on('wake', () => {
    const wins = require('electron').BrowserWindow.getAllWindows();
    wins.forEach((win: any) => win.webContents.send('voice:wake'));
  });

  sttService.on('partial', (text: string) => {
    const wins = require('electron').BrowserWindow.getAllWindows();
    wins.forEach((win: any) => win.webContents.send('stt:partial', text));
  });

  sttService.on('final', (text: string, meta?: any) => {
    const wins = require('electron').BrowserWindow.getAllWindows();
    wins.forEach((win: any) => win.webContents.send('stt:final', text, meta));
  });
}
