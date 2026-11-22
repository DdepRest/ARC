import { ipcMain, BrowserWindow } from 'electron';
import { sttService } from '../services/stt.service';
import { ttsService } from '../services/tts.service';
import { PythonServerService } from '../services/python_server.service';
import { adaptiveService } from '../services/adaptive.service';
import { cacheService } from '../services/cache.service';
import { LocalClassifier } from '../services/local-classifier';
import { aiCache } from '../services/ai-cache';
import { vkWebSocketServer } from '../services/media/vk-websocket-server';
import { BuiltInWhisperService } from '../services/built-in-whisper.service';
import { BuiltInLlmService } from '../services/built-in-llm.service';
import { llmCacheService } from '../services/llm-cache.service';
import { sherpaDownloaderService } from '../services/sherpa-downloader.service';
import { isCancellationError } from '../services/sherpa-download-task.helper';
import { hfRateLimiter } from '../services/hf-rate-limiter.service';
import { FALLBACK_STT_MODELS_LIST, fetchFullSttModelsList } from '../services/stt-models-list.helper';
import { sanitizeError } from '../../shared/utils/log-sanitizer';
import { SystemMediaController } from '../services/media/system-media';
import { voiceSetupService, VoiceSetupChoiceMode, VoiceSetupStartOptions } from '../services/voice-setup.service';
import { evaluateSileroModelWithReport } from '../services/python_integrity.util';
import { verifyPythonBundleFiles } from '../services/python_sync.util';

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
      const data = response.data || {};
      const ok = data.status !== 'error' && data.pronunciationState !== 'ERROR';
      return { success: ok, data };
    } catch (e: any) {
      const responseData = e?.response?.data;
      console.error(`[VoiceIPC] tts:reload-dictionaries error: ${sanitizeError(e)}`);
      return { success: false, data: responseData, error: sanitizeError(e) };
    }
  });

  ipcMain.handle('voice:start-listening', async (_event, modelName?: string) => {
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
      const { text, style, speed, pitch, sampleRate, putAccent, putYo, speaker, autoClearCache, force, queryId, allowCloudTtsFallback, forcedOfflineMode } = payload;
      if (typeof allowCloudTtsFallback === 'boolean' || typeof forcedOfflineMode === 'boolean') {
        ttsService.setPolicy({
          ...(typeof allowCloudTtsFallback === 'boolean' ? { allowCloudTtsFallback } : {}),
          ...(typeof forcedOfflineMode === 'boolean' ? { forcedOfflineMode } : {}),
        });
      }
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

  ipcMain.handle('tts:get-active-engine', async () => ttsService.getActiveEngine());

  ipcMain.handle('tts:set-provider', async (_event, provider: string) => {
    const normalized = (provider === 'piper' || provider === 'kokoro') ? 'auto' : provider;
    if (normalized !== provider) {
      console.warn(`[VoiceIPC] Planned TTS provider "${provider}" is not active in v1.0; migrating to "auto".`);
    }
    ttsService.setProvider(normalized);
    return ttsService.getActiveEngine();
  });

  ipcMain.handle('tts:set-policy', async (_event, policy: { provider?: string; allowCloudTtsFallback?: boolean; forcedOfflineMode?: boolean } = {}) => {
    const rawProvider = policy?.provider;
    const normalized = (rawProvider === 'piper' || rawProvider === 'kokoro') ? 'auto' : rawProvider;
    return ttsService.setPolicy({
      ...(normalized !== undefined ? { provider: normalized } : {}),
      ...(typeof policy?.allowCloudTtsFallback === 'boolean' ? { allowCloudTtsFallback: policy.allowCloudTtsFallback } : {}),
      ...(typeof policy?.forcedOfflineMode === 'boolean' ? { forcedOfflineMode: policy.forcedOfflineMode } : {}),
    });
  });

  ipcMain.handle('vk:control', async (_event, action, data) => LocalClassifier.controlVk(action, data));
  ipcMain.handle('vk:get-connection-status', async () => vkWebSocketServer.getConnectionStatus());

  ipcMain.on('voice:stream-chunk', (_evt, samples: Float32Array) => sttService.feedChunk(samples));
  ipcMain.on('voice:stream-end', () => sttService.endStream());
  ipcMain.on('voice:reset-buffer', () => sttService.resetBuffer());
  ipcMain.on('voice:set-busy', async (_evt, busy: boolean) => {
    try { BuiltInLlmService.getInstance().setVoiceBusy(Boolean(busy)); } catch (e) { console.warn('[VoiceIPC] Failed to update voice busy state:', e); }
  });

  ipcMain.handle('stt:status', () => sttService.getStatus());
  ipcMain.handle('stt:set-engine', async (_event, engine: 'gigaam' | 'legacy') => {
    sttService.setEngine(engine);
    return { success: true, engine };
  });
  ipcMain.handle('stt:reload', async (_event, modelName?: string) => {
    try {
      const res = await sttService.switchModel(modelName || 'zipformer-ru', 'user_switch');
      if (res && !res.ready && res.error && /4294967295|-1|worker process exited/i.test(res.error)) {
        res.error = 'Критический сбой движка STT. Попробуйте другую модель или перезапустите приложение';
      }
      return res;
    } catch (err: any) {
      console.warn('[Voice IPC] stt:reload error:', err?.message || err);
      return { ready: false, error: 'Критический сбой движка STT. Попробуйте другую модель или перезапустите приложение' };
    }
  });
  ipcMain.handle('stt:switch-model', async (_event, modelId: string) => sttService.switchModel(modelId, 'user_switch'));
  ipcMain.handle('stt:cancel-download', async (_event, modelId?: unknown) => {
    const targetId = typeof modelId === 'string' && modelId.trim().length > 0 ? modelId.trim() : undefined;
    if (targetId) {
      const sherpaCancelled = await sherpaDownloaderService.cancelDownload(targetId);
      const whisperCancelled = BuiltInWhisperService.getInstance().abort(targetId);
      return { success: true, cancelled: sherpaCancelled || whisperCancelled, modelId: targetId };
    }
    await sherpaDownloaderService.cancelAllDownloads();
    BuiltInWhisperService.getInstance().abort();
    return { success: true, cancelled: true };
  });

  ipcMain.handle('voice:setup-status', (_event, options?: VoiceSetupStartOptions) => voiceSetupService.getStatus(options));
  ipcMain.handle('voice:setup-mode', (_event, mode: VoiceSetupChoiceMode) => {
    const mainWin = BrowserWindow.getAllWindows()[0] || null;
    if (mode === 'system_fallback') {
      ttsService.setPolicy({ provider: 'native' });
    }
    return voiceSetupService.setMode(mode, mainWin);
  });
  ipcMain.handle('voice:setup-start', (_event, options?: VoiceSetupStartOptions) => {
    const mainWin = BrowserWindow.getAllWindows()[0] || null;
    return voiceSetupService.startSetup(options || {}, mainWin);
  });
  ipcMain.handle('voice:setup-pause', () => {
    const mainWin = BrowserWindow.getAllWindows()[0] || null;
    return voiceSetupService.pauseSetup(mainWin);
  });
  ipcMain.handle('voice:setup-cancel', () => {
    const mainWin = BrowserWindow.getAllWindows()[0] || null;
    return voiceSetupService.cancelSetup(mainWin);
  });

  for (const eventName of ['fallback', 'ready', 'engine-ready'] as const) {
    sttService.on(eventName, (info) => {
      try {
        BrowserWindow.getAllWindows().forEach((w: any) => w.webContents.send(`stt:${eventName}`, info));
      } catch (err) {
        console.warn(`[Voice IPC] Failed to broadcast stt:${eventName}:`, err);
      }
    });
  }

  ipcMain.handle('stt:list-models', async () => {
    try {
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 1500));
      const fullPromise = fetchFullSttModelsList();
      const raceResult = await Promise.race([fullPromise, timeoutPromise]);

      if (raceResult === 'timeout') {
        fullPromise.then((finalRes) => {
          try {
            BrowserWindow.getAllWindows().forEach((w: any) => w.webContents.send('stt:models-updated', finalRes));
          } catch {}
        });
        return FALLBACK_STT_MODELS_LIST;
      }

      return raceResult;
    } catch (err: any) {
      console.warn('[stt:list-models] Fallback returned:', err?.message || err);
      return { ...FALLBACK_STT_MODELS_LIST, sherpaAvailable: false, isPending: false };
    }
  });

  ipcMain.handle('stt:download-model', async (_event, { modelId, provider }) => {
    const wins = BrowserWindow.getAllWindows();
    const sendProgress = (data: any) => wins.forEach((w: any) => w.webContents.send('stt:download-progress', data));

    if (provider === 'whisper') {
      try {
        sendProgress({ modelId, percent: 0, status: 'downloading' });
        await BuiltInWhisperService.getInstance().downloadModel(modelId, (loaded: number, total: number) => {
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
          sendProgress({ modelId, percent, status: 'downloading', bytes_done: loaded, total_bytes: total });
        });
        sendProgress({ modelId, percent: 100, status: 'completed' });
        return { success: true, status: 'completed' };
      } catch (e: any) {
        if (isCancellationError(e)) {
          sendProgress({ modelId, percent: 0, status: 'cancelled' });
          return { success: false, cancelled: true, status: 'cancelled' };
        }
        sendProgress({ modelId, percent: 0, status: 'error', error: e?.message || String(e) });
        return { success: false, status: 'error', error: e?.message || String(e) };
      }
    } else {
      try {
        return await sherpaDownloaderService.downloadModel(modelId, sendProgress);
      } catch (e: any) {
        if (isCancellationError(e)) {
          sendProgress({ modelId, percent: 0, status: 'cancelled' });
          return { success: false, cancelled: true, status: 'cancelled' };
        }
        sendProgress({ modelId, percent: 0, status: 'error', error: e?.message || String(e) });
        return { success: false, status: 'error', error: e?.message || String(e) };
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
    const dictsPaths = PythonServerService.resolveTtsDictsPaths();
    const depsReadiness = PythonServerService.getLastDependencyReadiness();
    const installerState = PythonServerService.getDependencyInstallerState();
    const sileroModelPath = PythonServerService.resolveSileroModelPath();
    const pythonExe = PythonServerService.resolvePythonExe();
    let integrity = PythonServerService.getLastIntegrityReport();
    if (!integrity || !integrity.modelFile) {
      const baseReport = integrity || verifyPythonBundleFiles((rel) => PythonServerService.getPath(rel));
      integrity = evaluateSileroModelWithReport(sileroModelPath, baseReport).report;
    }
    const modelInstalled = Boolean(sileroModelPath);
    const pythonInstalled = Boolean(pythonExe);
    try {
      const axios = require('axios');
      const r = await axios.get('http://127.0.0.1:8002/status', { timeout: 2000 });
      return {
        online: true,
        modelInstalled,
        pythonInstalled,
        dictsPaths,
        integrity,
        ...r.data,
        dependencies: {
          ...(depsReadiness || {}),
          ...(r.data?.dependencies || {}),
          phase: installerState.inProgress ? installerState.phase : (depsReadiness?.phase ?? r.data?.dependencies?.state ?? 'READY'),
          activePackage: installerState.activePackage
        }
      };
    } catch (e: any) {
      const degradedData = e?.response?.status === 503 && e?.response?.data ? e.response.data : {};
      const dependencies =
        depsReadiness || degradedData?.dependencies || installerState.inProgress
          ? {
              ...(depsReadiness || {}),
              ...(degradedData?.dependencies || {}),
              phase: installerState.inProgress ? installerState.phase : (depsReadiness?.phase ?? degradedData?.dependencies?.state ?? 'IDLE'),
              activePackage: installerState.activePackage
            }
          : null;
      return { online: false, modelInstalled, pythonInstalled, dictsPaths, integrity, ...degradedData, dependencies };
    }
  });

  ipcMain.handle('adaptive:get-state', () => ({
    currentTier: adaptiveService.getCurrentTier(),
    manualPreset: adaptiveService.getManualPreset()
  }));
  ipcMain.handle('adaptive:force-tier', (_event, preset) => {
    adaptiveService.setManualPreset(preset);
    return { success: true };
  });
  ipcMain.handle('adaptive:add-process', (_event, name) => {
    adaptiveService.addProcess(name);
    return { success: true };
  });

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
    } catch {
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
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('voice:calibration-start', () => ({ success: true }));
  ipcMain.handle('voice:calibration-done', () => ({ ok: true }));
  ipcMain.handle('voice:calibration-reset', () => ({ ok: true }));

  ipcMain.handle('tts:get-presets', async () => {
    try {
      const axios = require('axios');
      const res = await axios.get('http://127.0.0.1:8002/presets');
      return res.data.presets;
    } catch {
      return [];
    }
  });

  ipcMain.handle('tts:get-tier', () => adaptiveService.getCurrentTier());

  sttService.on('wake', () => {
    BrowserWindow.getAllWindows().forEach((win: any) => win.webContents.send('voice:wake'));
  });
  sttService.on('partial', (text: string) => {
    BrowserWindow.getAllWindows().forEach((win: any) => win.webContents.send('stt:partial', text));
  });
  sttService.on('final', (text: string, meta?: any) => {
    BrowserWindow.getAllWindows().forEach((win: any) => win.webContents.send('stt:final', text, meta));
  });
}
