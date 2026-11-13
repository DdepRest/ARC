import { ToolDispatcher } from './tools/tool-dispatcher';
import { getToolsPrompt, parseToolCall } from './llm/tools-utils';
import { stripThinkingProcess, StreamingThinkingFilter } from './llm/thinking-cleaner';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import type { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import { DownloadState, DownloadProgressCallback } from './built-in-llm.types';
import { computeTokenDiff, tokenizeWordsApprox } from './llm/kv-prefill.utils';

export class BuiltInLlmService {
  private static instance: BuiltInLlmService | null = null;
  private llama: any = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;
  private isLoaded = false;
  private currentModelName = '';
  private activeDownloadAbortController: AbortController | null = null;
  private currentDownloadState: DownloadState | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private isGenerating = false;
  private telemetryInterval: NodeJS.Timeout | null = null;
  private activeSessionId: number | null = null;
  private isVoiceBusy = false;
  private voiceIdleResolvers: Array<() => void> = [];
  private modelAvailabilityCache = new Map<string, { exists: boolean; lastChecked: number }>();
  private prefillActive = false;
  private prefillUserTokens: number[] = [];
  private prefillBaseHistoryTokenIndex = 0;
  private prefillUserStartTokenIndex = -1;
  private lastSyncedHistorySignature = '';
  private activePrefillAbortController: AbortController | null = null;

  public clearModelCache(modelName?: string): void {
    if (modelName) {
      this.modelAvailabilityCache.delete(this.sanitizeModelName(modelName));
    } else {
      this.modelAvailabilityCache.clear();
    }
  }

  public setVoiceBusy(busy: boolean) {
    if (this.isVoiceBusy === busy) return;
    this.isVoiceBusy = busy;
    if (busy) {
      console.log('[BuiltIn-LLM] Voice activity detected: pausing background download stream.');
    } else {
      console.log('[BuiltIn-LLM] Voice activity ended: resuming background download stream.');
      const resolvers = [...this.voiceIdleResolvers];
      this.voiceIdleResolvers = [];
      resolvers.forEach(r => r());
    }
  }

  public async waitIfVoiceBusy(): Promise<void> {
    if (!this.isVoiceBusy) return;
    return new Promise<void>((resolve) => {
      this.voiceIdleResolvers.push(resolve);
    });
  }

  private resetIdleTimer(settings?: any) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const minutes = settings?.llmAutoUnloadMinutes ?? 10;
    if (minutes > 0) {
      this.idleTimer = setTimeout(() => {
        this.autoUnload();
      }, minutes * 60 * 1000);
    }
  }

  private async autoUnload() {
    if (this.isGenerating) {
      console.log('[BuiltIn-LLM] Auto-unload postponed because generation is in progress.');
      this.idleTimer = setTimeout(() => this.autoUnload(), 60 * 1000);
      return;
    }
    console.log('[BuiltIn-LLM] Auto-unload timer triggered due to inactivity.');
    await this.disposeAll();
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      wins.forEach((win: any) => win.webContents.send('ai:model-unloaded'));
    } catch (e) { console.warn('Ignored error in catch', e); }
  }

  private startTelemetry() {
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);
    this.telemetryInterval = setInterval(() => {
      if (!this.isLoaded) return;
      try {
        const { BrowserWindow } = require('electron');
        const wins = BrowserWindow.getAllWindows();
        const modelPath = path.join(this.getModelsDir(), this.currentModelName);
        let modelMemoryMb = 0;
        if (fs.existsSync(modelPath)) {
          modelMemoryMb = Math.round((fs.statSync(modelPath).size / (1024 * 1024)) * 1.1);
        }
        wins.forEach((win: any) => win.webContents.send('ai:model-telemetry', {
          modelName: this.currentModelName,
          modelMemoryMb,
          contextUsedTokens: (this.session as any)?.sequence?.nextTokenIndex || 0,
          contextMaxTokens: this.context?.contextSize || 0,
          offloadTarget: this.llama?.gpu ? 'gpu' : 'cpu',
          isLoaded: this.isLoaded
        }));
      } catch (e) { console.warn('Ignored error in catch', e); }
    }, 2000);
  }

  private stopTelemetry() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  private constructor() {}

  public static getInstance(): BuiltInLlmService {
    if (!BuiltInLlmService.instance) {
      BuiltInLlmService.instance = new BuiltInLlmService();
    }
    return BuiltInLlmService.instance;
  }

  private getModelsDir(): string {
    const safeModelsDir = path.join(app.getPath('userData'), 'models');
    if (!fs.existsSync(safeModelsDir)) {
      fs.mkdirSync(safeModelsDir, { recursive: true });
    }

    try {
      // Auto-migrate from old external AppData if present
      const appData = app.getPath('appData');
      const oldAppDataModelsDir = path.join(appData, 'A.R.C', 'models');
      if (fs.existsSync(oldAppDataModelsDir) && fs.lstatSync(oldAppDataModelsDir).isDirectory() && oldAppDataModelsDir !== safeModelsDir) {
        const files = fs.readdirSync(oldAppDataModelsDir).filter(f => f.endsWith('.gguf'));
        for (const file of files) {
          const oldFile = path.join(oldAppDataModelsDir, file);
          const newFile = path.join(safeModelsDir, file);
          if (!fs.existsSync(newFile) && fs.existsSync(oldFile)) {
            console.log(`[BuiltIn-LLM] Migrating GGUF model file into portable directory: from ${oldFile} to ${newFile}...`);
            fs.renameSync(oldFile, newFile);
          }
        }
      }
    } catch (migErr) {
      console.warn(`[BuiltIn-LLM] Auto-migration of old model files warning:`, migErr);
    }

    return safeModelsDir;
  }

  private sanitizeModelName(modelName?: string): string {
    const raw = (modelName || 'qwen2.5-1.5b-instruct-q4_k_m.gguf').trim();
    const baseName = path.basename(raw);
    if (!baseName.endsWith('.gguf')) {
      return 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
    }
    return baseName.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  }

  public async isModelDownloaded(modelName?: string): Promise<boolean> {
    const targetModel = this.sanitizeModelName(modelName);
    const now = Date.now();
    const cached = this.modelAvailabilityCache.get(targetModel);
    if (cached && (now - cached.lastChecked < 10000)) {
      return cached.exists;
    }

    const modelPath = path.join(this.getModelsDir(), targetModel);
    if (!fs.existsSync(modelPath)) {
      this.modelAvailabilityCache.set(targetModel, { exists: false, lastChecked: now });
      return false;
    }
    try {
      const stats = fs.statSync(modelPath);
      let minSize = 350 * 1024 * 1024; // ~350MB for 0.5B
      if (targetModel.includes('1.5b') || targetModel.includes('1.7b') || targetModel.includes('1.8b') || targetModel.includes('1_5b') || targetModel.includes('1_8b')) {
        minSize = 900 * 1024 * 1024; // ~900MB for 1.5B/1.7B/1.8B (actual ~1.1GB)
      } else if (targetModel.includes('2.6b') || targetModel.includes('2_6b') || targetModel.includes('lfm')) {
        minSize = 1400 * 1024 * 1024; // ~1.4GB for LFM2.5-2.6B
      } else if (targetModel.includes('3b') || targetModel.includes('2.5-3b')) {
        minSize = 1900 * 1024 * 1024; // ~1.9GB for 3B (actual ~2.1GB)
      }
      const isValid = stats.size >= minSize;
      if (!isValid) {
        if (!cached || cached.exists) {
          console.warn(`[BuiltIn-LLM] Model file exists at ${modelPath} but is incomplete: ${stats.size} bytes (minimum required: ${minSize} bytes).`);
        }
      } else if (!cached || !cached.exists) {
        console.log(`[BuiltIn-LLM] Model file verified at ${modelPath}: ${(stats.size / (1024 * 1024)).toFixed(1)} MB.`);
      }
      this.modelAvailabilityCache.set(targetModel, { exists: isValid, lastChecked: now });
      return isValid;
    } catch (e: any) {
      console.error(`[BuiltIn-LLM] Error checking model size at ${modelPath}: ${e.message}`);
      this.modelAvailabilityCache.set(targetModel, { exists: false, lastChecked: now });
      return false;
    }
  }

  public getModelEstimatedSizeBytes(modelName?: string): number {
    const targetModel = this.sanitizeModelName(modelName);
    if (targetModel.includes('0.5b') || targetModel.includes('0_5b')) return 390 * 1024 * 1024;
    if (targetModel.includes('1.7b') || targetModel.includes('lfm3')) return 1100 * 1024 * 1024;
    if (targetModel.includes('1.5b') || targetModel.includes('1_5b')) return 980 * 1024 * 1024;
    if (targetModel.includes('1.8b') || targetModel.includes('1_8b')) return 1150 * 1024 * 1024;
    if (targetModel.includes('2.6b') || targetModel.includes('2_6b') || targetModel.includes('lfm')) return 1450 * 1024 * 1024;
    if (targetModel.includes('3b') || targetModel.includes('2.5-3b')) return 2100 * 1024 * 1024;
    if (targetModel.includes('7b')) return 4500 * 1024 * 1024;
    return 1400 * 1024 * 1024;
  }

  public getActiveDownloadState() {
    return this.currentDownloadState;
  }

  private getModelUrls(targetModel: string): { primary: string; mirror: string } {
    let repoPath = '';
    if (targetModel === 'LFM3-1.7B-Q4_K_M.gguf' || targetModel === 'LFM3-1.7B.gguf' || targetModel.includes('LFM3-1.7B')) {
      repoPath = 'LiquidAI/LFM3-1.7B-GGUF/resolve/main/LFM3-1.7B-Q4_K_M.gguf';
    } else if (targetModel === 'qwen2.5-1.5b-instruct-q4_k_m.gguf' || targetModel === 'qwen2.5-1.5b-instruct.gguf') {
      repoPath = 'Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf';
    } else if (targetModel === 'LFM2.5-2.6B-Q4_K_M.gguf') {
      repoPath = 'LiquidAI/LFM2.5-2.6B-GGUF/resolve/main/LFM2.5-2.6B-Q4_K_M.gguf';
    } else if (targetModel === 'qwen2.5-3b-instruct-q4_k_m.gguf') {
      repoPath = 'Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf';
    } else if (targetModel === 'qwen2.5-7b-instruct-q4_k_m.gguf') {
      repoPath = 'Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf';
    } else if (targetModel === 'qwen2.5-0.5b-instruct-q4_k_m.gguf') {
      repoPath = 'Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
    } else if (targetModel === 'qwen1.5-1.8b-chat-q4_k_m.gguf' || targetModel === 'qwen1_5-1_8b-chat-q4_k_m.gguf') {
      repoPath = 'Qwen/Qwen1.5-1.8B-Chat-GGUF/resolve/main/qwen1_5-1_8b-chat-q4_k_m.gguf';
    } else {
      repoPath = `Qwen/${targetModel.replace('.gguf', '').toUpperCase()}-GGUF/resolve/main/${targetModel}`;
    }

    return {
      primary: `https://huggingface.co/${repoPath}`,
      mirror: `https://hf-mirror.com/${repoPath}`
    };
  }

  private async resolveDirectUrl(initialUrl: string): Promise<string> {
    let currentUrl = initialUrl;
    for (let redirectDepth = 0; redirectDepth < 5; redirectDepth++) {
      try {
        const response = await axios({
          method: 'head',
          url: currentUrl,
          maxRedirects: 0,
          timeout: 8000,
          validateStatus: (status) => status >= 200 && status < 400,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (response.status >= 300 && response.status < 400 && response.headers.location) {
          currentUrl = new URL(response.headers.location, currentUrl).toString();
        } else {
          break;
        }
      } catch (err: any) {
        if (err.response && err.response.status >= 300 && err.response.status < 400 && err.response.headers.location) {
          currentUrl = new URL(err.response.headers.location, currentUrl).toString();
        } else {
          // Fallback GET stream request without downloading buffer
          try {
            const streamRes = await axios({
              method: 'get',
              url: currentUrl,
              responseType: 'stream',
              maxRedirects: 0,
              timeout: 8000,
              validateStatus: (status) => status >= 200 && status < 400,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            if (streamRes.status >= 300 && streamRes.status < 400 && streamRes.headers.location) {
              currentUrl = new URL(streamRes.headers.location, currentUrl).toString();
            }
            if (streamRes.data && typeof streamRes.data.destroy === 'function') {
              streamRes.data.destroy();
            }
          } catch (streamErr: any) {
            if (streamErr.response && streamErr.response.status >= 300 && streamErr.response.status < 400 && streamErr.response.headers.location) {
              currentUrl = new URL(streamErr.response.headers.location, currentUrl).toString();
            } else {
              console.warn(`[BuiltIn-LLM] Direct URL resolution ended at ${currentUrl}`);
            }
          }
          break;
        }
      }
    }
    return currentUrl;
  }

  public async downloadModel(
    modelName: string,
    onProgress: DownloadProgressCallback,
    force: boolean = false
  ): Promise<void> {
    const targetModel = this.sanitizeModelName(modelName);
    this.clearModelCache(targetModel);
    const modelPath = path.join(this.getModelsDir(), targetModel);
    const tempPath = `${modelPath}.tmp`;

    if (this.activeDownloadAbortController) {
      console.log(`[BuiltIn-LLM] Aborting ongoing download to start download for ${targetModel}...`);
      try {
        this.activeDownloadAbortController.abort();
      } catch (e) { console.warn('Ignored error in catch', e); }
      this.activeDownloadAbortController = null;
    }

    if (force) {
      console.log(`[BuiltIn-LLM] Force re-download requested for ${targetModel}. Unlinking existing files...`);
      try {
        if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
      } catch (e: any) {
        console.warn(`[BuiltIn-LLM] Failed to delete existing model file: ${e.message}`);
      }
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (e: any) {
        console.warn(`[BuiltIn-LLM] Failed to delete existing temp file: ${e.message}`);
      }
    } else if (await this.isModelDownloaded(targetModel)) {
      const stats = fs.statSync(modelPath);
      onProgress(stats.size, stats.size, targetModel);
      return;
    }

    const { primary, mirror } = this.getModelUrls(targetModel);
    const sources = [primary, mirror];
    console.log(`[BuiltIn-LLM] Starting download process for ${targetModel}. Sources: primary=${primary}, mirror=${mirror}`);

    const MAX_ATTEMPTS = 5;
    let attempt = 0;
    let lastError: Error | null = null;
    this.currentDownloadState = {
      modelName: targetModel,
      bytesDone: 0,
      totalBytes: 0,
      isDownloading: true
    };

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      const currentUrl = sources[(attempt - 1) % sources.length];
      
      let existingBytes = 0;
      if (fs.existsSync(tempPath)) {
        try {
          existingBytes = fs.statSync(tempPath).size;
        } catch {
          existingBytes = 0;
        }
      }

      console.log(`[BuiltIn-LLM] Download attempt ${attempt}/${MAX_ATTEMPTS} from ${currentUrl} (Resume offset: ${existingBytes} bytes)...`);

      const abortController = new AbortController();
      this.activeDownloadAbortController = abortController;

      try {
        const directUrl = await this.resolveDirectUrl(currentUrl);
        console.log(`[BuiltIn-LLM] Resolved direct CDN URL: ${directUrl}`);

        const reqHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (existingBytes > 0) {
          reqHeaders['Range'] = `bytes=${existingBytes}-`;
        }

        const response = await axios({
          method: 'get',
          url: directUrl,
          responseType: 'stream',
          maxRedirects: 5,
          decompress: false,
          signal: abortController.signal,
          headers: reqHeaders,
          timeout: 600000, // 10 minutes timeout
          validateStatus: (status) => status === 200 || status === 206
        });

        let isPartial = response.status === 206;
        let totalBytes = 0;
        let startOffset = isPartial ? existingBytes : 0;

        if (isPartial && response.headers['content-range']) {
          const rangeMatch = String(response.headers['content-range']).match(/bytes (\d+)-/);
          if (rangeMatch) {
            const rangeStart = parseInt(rangeMatch[1], 10);
            if (rangeStart !== existingBytes) {
              console.warn(`[BuiltIn-LLM] Server returned range starting at ${rangeStart} instead of ${existingBytes}. Resetting temp file.`);
              try { fs.unlinkSync(tempPath); } catch (e) { console.warn('Ignored error in catch', e); }
              startOffset = 0;
              isPartial = false; // Force rewrite
            }
          }

          const match = String(response.headers['content-range']).match(/\/(\d+)$/);
          if (match) {
            totalBytes = parseInt(match[1], 10);
          }
        }

        if (!totalBytes && response.headers['content-length']) {
          const cl = parseInt(String(response.headers['content-length']), 10);
          totalBytes = isPartial ? existingBytes + cl : cl;
        }

        // If server refused range request and returned 200 OK, reset download offset
        if (!isPartial && existingBytes > 0 && startOffset > 0) {
          console.warn(`[BuiltIn-LLM] Server returned 200 OK instead of 206 Partial Content. Resetting temp file.`);
          try { fs.unlinkSync(tempPath); } catch (e) { console.warn('Ignored error in catch', e); }
          startOffset = 0;
        }

        let downloadedBytes = startOffset;
        let lastChunkTime = Date.now();
        let lastProgressEmitTime = 0;
        let lastLoggedPct = -1;
        let lastHeartbeatTime = Date.now();

        if (this.currentDownloadState) {
          this.currentDownloadState.bytesDone = downloadedBytes;
          this.currentDownloadState.totalBytes = totalBytes;
        }

        // Stall detector: check every 5s if chunks have stopped arriving for 30s
        let stallCheckInterval: NodeJS.Timeout | null = setInterval(() => {
          const timeSinceChunk = Date.now() - lastChunkTime;
          if (timeSinceChunk >= 30000) {
            console.warn(`[BuiltIn-LLM] Stall detected: No download progress for 30s on ${currentUrl}. Aborting attempt to retry...`);
            if (stallCheckInterval) {
              clearInterval(stallCheckInterval);
              stallCheckInterval = null;
            }
            try {
              abortController.abort();
            } catch (e) {
              console.warn('Ignored abort error', e);
            }
          }
        }, 5000);

        const self = this;
        const progressTransform = new Transform({
          async transform(chunk, _encoding, callback) {
            if (self.isVoiceBusy) {
              await self.waitIfVoiceBusy();
            }
            downloadedBytes += chunk.length;
            const now = Date.now();
            lastChunkTime = now;

            if (self.currentDownloadState) {
              self.currentDownloadState.bytesDone = downloadedBytes;
              self.currentDownloadState.totalBytes = totalBytes;
            }

            // IPC progress emit every 1000ms (1 Hz) for stability unless 100% complete
            if (now - lastProgressEmitTime >= 1000 || (totalBytes > 0 && downloadedBytes >= totalBytes)) {
              lastProgressEmitTime = now;
              onProgress(downloadedBytes, totalBytes > 0 ? totalBytes : 0, targetModel);
            }

            // Console logging: only on integer percentage change OR heartbeat every 10s
            const curPct = totalBytes > 0 ? Math.floor((downloadedBytes / totalBytes) * 100) : 0;
            const isHeartbeat = (now - lastHeartbeatTime) >= 10000;
            if (curPct !== lastLoggedPct || isHeartbeat) {
              lastLoggedPct = curPct;
              lastHeartbeatTime = now;
              const mbDone = (downloadedBytes / (1024 * 1024)).toFixed(1);
              const mbTotal = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
              console.log(`[BuiltIn-LLM Progress] ${targetModel}: ${curPct}% (${mbDone}/${mbTotal} MB)`);
            }

            callback(null, chunk);
          }
        });

        const writer = fs.createWriteStream(tempPath, { flags: isPartial ? 'a' : 'w' });

        try {
          await pipeline(response.data, progressTransform, writer);
        } catch (pipeErr) {
          try { abortController.abort(); } catch (e) { console.warn('Ignored error in catch', e); }
          if (response.data && typeof response.data.destroy === 'function') {
            try { response.data.destroy(); } catch (e) { console.warn('Ignored error in catch', e); }
          }
          if (writer && typeof writer.destroy === 'function') {
            try { writer.destroy(); } catch (e) { console.warn('Ignored error in catch', e); }
          }
          throw pipeErr;
        } finally {
          if (stallCheckInterval) {
            clearInterval(stallCheckInterval);
            stallCheckInterval = null;
          }
        }

        // Verify completion with minimum size check
        let minSize = 370 * 1024 * 1024;
        if (targetModel.includes('1.5b') || targetModel.includes('1.8b') || targetModel.includes('1_5b') || targetModel.includes('1_8b')) minSize = 900 * 1024 * 1024;
        else if (targetModel.includes('2.6b') || targetModel.includes('2_6b') || targetModel.includes('lfm')) minSize = 1400 * 1024 * 1024;
        else if (targetModel.includes('3b') || targetModel.includes('2.5-3b')) minSize = 1900 * 1024 * 1024;

        const finalTempSize = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;
        const isCompleteByTotal = totalBytes > 0 && finalTempSize >= totalBytes;
        const isCompleteByMin = finalTempSize >= minSize;

        if (isCompleteByTotal || (totalBytes === 0 && isCompleteByMin)) {
          if (fs.existsSync(modelPath)) {
            try { fs.unlinkSync(modelPath); } catch (e) { console.warn('Ignored error in catch', e); }
          }
          fs.renameSync(tempPath, modelPath);
          this.clearModelCache(targetModel);
          console.log(`[BuiltIn-LLM] Model download complete: ${modelPath} (${(finalTempSize / (1024 * 1024)).toFixed(1)} MB)`);
          onProgress(finalTempSize, finalTempSize, targetModel);
          
          // Wait up to 30 seconds for OS file locks / anti-virus scans to release before letting C++ open it
          let unlockAttempts = 0;
          while (unlockAttempts < 30) {
            try {
              const fd = fs.openSync(modelPath, 'r');
              fs.closeSync(fd);
              break;
            } catch (err: any) {
              await new Promise(r => setTimeout(r, 1000));
              unlockAttempts++;
            }
          }
          this.activeDownloadAbortController = null;
          this.currentDownloadState = null;
          return;
        } else if (totalBytes > 0 && finalTempSize < totalBytes) {
          console.warn(`[BuiltIn-LLM] Download interrupted (${finalTempSize}/${totalBytes} bytes). Will resume on next attempt...`);
          throw new Error('Incomplete download');
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('aborted') || axios.isCancel(err) || abortController.signal.aborted) {
          console.log(`[BuiltIn-LLM] Download process for ${targetModel} was explicitly aborted.`);
          this.activeDownloadAbortController = null;
          this.currentDownloadState = null;
          return;
        }
        console.warn(`[BuiltIn-LLM] Download attempt ${attempt}/${MAX_ATTEMPTS} failed for URL: ${currentUrl}`);
        console.warn(`[BuiltIn-LLM] Error details: ${err.message || err}`);
        if (err.response) {
          console.warn(`[BuiltIn-LLM] Response status: ${err.response.status}`);
        } else if (err.request) {
          console.warn(`[BuiltIn-LLM] No response received. Request might have timed out or failed to connect.`);
        }
        lastError = err;

        if (attempt < MAX_ATTEMPTS) {
          // Exponential back-off: 2s -> 4s -> 8s -> 16s -> 32s
          const backoffDelay = Math.min(2000 * Math.pow(2, attempt - 1), 32000);
          console.log(`[BuiltIn-LLM] Waiting ${backoffDelay}ms before retry attempt ${attempt + 1}...`);
          await new Promise((res) => setTimeout(res, backoffDelay));
        }
      }
    }

    this.activeDownloadAbortController = null;
    this.currentDownloadState = null;
    throw new Error(`Failed to download model ${targetModel} after ${MAX_ATTEMPTS} attempts: ${lastError?.message || 'Download failed'}`);
  }

  public cancelDownload(): void {
    if (this.activeDownloadAbortController) {
      console.log('[BuiltIn-LLM] Explicitly canceling active download via user request.');
      try {
        this.activeDownloadAbortController.abort();
      } catch (e) {
        console.warn('Ignored abort error in cancelDownload:', e);
      }
      this.activeDownloadAbortController = null;
    }
  }

  private broadcastModelLoading(modelName: string, status: 'loading' | 'ready' | 'error') {
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      wins.forEach((win: any) => {
        win.webContents.send('ai:model-loading', { modelName, status });
      });
    } catch (e) { console.warn('Ignored error in catch', e); }
  }

  public async disposeAll(): Promise<void> {
    console.log('[BuiltIn-LLM] Disposing all resources...');
    this.stopTelemetry();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.session) {
      try {
        if (typeof (this.session as any)?.dispose === 'function') {
          await (this.session as any).dispose();
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
      this.session = null;
    }
    if (this.context) {
      try { await this.context.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
      this.context = null;
    }
    if (this.model) {
      try { await this.model.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
      this.model = null;
    }
    if (this.llama) {
      try { await this.llama.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
      this.llama = null;
    }
    this.isLoaded = false;
    this.currentModelName = '';
    console.log('[BuiltIn-LLM] All resources disposed.');
  }

  public async initialize(modelName?: string, settings?: any): Promise<boolean> {
    const targetModel = this.sanitizeModelName(modelName);
    
    if (this.isLoaded && this.currentModelName === targetModel && this.session) {
      this.resetIdleTimer(settings);
      return true;
    }

    const modelPath = path.join(this.getModelsDir(), targetModel);
    
    if (!fs.existsSync(modelPath)) {
      console.warn(`[BuiltIn-LLM] Model file not found at ${modelPath}`);
      return false;
    }

    // OOM Protection Check
    const stats = fs.statSync(modelPath);
    const fileSizeMb = stats.size / (1024 * 1024);
    const requiredMb = fileSizeMb * 1.5;
    const availableMb = os.freemem() / (1024 * 1024);

    if (availableMb < requiredMb && !settings?.ignoreOomWarning) {
      try {
        const { BrowserWindow } = require('electron');
        const wins = BrowserWindow.getAllWindows();
        wins.forEach((win: any) => {
          win.webContents.send('ai:oom-warning', { 
            requiredMb: Math.round(requiredMb), 
            availableMb: Math.round(availableMb), 
            modelName: targetModel 
          });
        });
      } catch (e) { console.warn('Ignored error in catch', e); }
      console.warn(`[BuiltIn-LLM] OOM Warning: required ~${Math.round(requiredMb)} MB, available ${Math.round(availableMb)} MB. Aborting load.`);
      return false;
    }

    // Double check file is readable (antivirus scan could be holding it)
    let unlockAttempts = 0;
    while (unlockAttempts < 15) {
      try {
        const fd = fs.openSync(modelPath, 'r');
        fs.closeSync(fd);
        break;
      } catch (err: any) {
        console.log(`[BuiltIn-LLM] Model file locked by OS, waiting...`);
        await new Promise(r => setTimeout(r, 1000));
        unlockAttempts++;
      }
    }

    try {
      console.log(`[BuiltIn-LLM] Initializing node-llama-cpp with model ${targetModel}...`);
      this.broadcastModelLoading(targetModel, 'loading');
      
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

      let llamaInstance = this.llama;
      if (!llamaInstance) {
        try {
          llamaInstance = await getLlama();
          console.log(`[BuiltIn-LLM] Llama initialized. GPU support: ${llamaInstance?.gpu}`);
        } catch (gpuErr: any) {
          console.warn(`[BuiltIn-LLM] Default getLlama failed (${gpuErr?.message}), falling back to CPU mode...`);
          llamaInstance = await getLlama({ gpu: false });
        }
      }

      // Dispose old resources in strict order: session -> context -> model
      if (this.session) {
        try {
          if (typeof (this.session as any)?.dispose === 'function') {
            await (this.session as any).dispose();
          }
        } catch (e) { console.warn('Ignored error in catch', e); }
        this.session = null;
      }
      if (this.context) {
        try { await this.context.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
        this.context = null;
      }
      if (this.model) {
        try { await this.model.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
        this.model = null;
      }

      // Calculate context size
      const ctxSize = settings?.llmMaxContextSize || 2048;
      
      // Calculate gpuLayers
      let gpuLayersObj = undefined;
      if (settings?.llmGpuOffloadMode === 'cpu') {
        gpuLayersObj = 0;
      } else if (settings?.llmGpuOffloadMode === 'gpu') {
        gpuLayersObj = -1;
      } else if (settings?.llmGpuOffloadMode === 'split') {
        gpuLayersObj = settings?.llmGpuLayers || 20;
      }

      try {
        this.model = await llamaInstance.loadModel({
          modelPath: modelPath,
          ...(gpuLayersObj !== undefined ? { gpuLayers: gpuLayersObj } : {})
        });
        this.context = await this.model.createContext({
          contextSize: ctxSize,
          sequences: 4
        });
        this.llama = llamaInstance;
      } catch (gpuLoadErr: any) {
        console.warn(`[BuiltIn-LLM] Primary GPU load failed (${gpuLoadErr?.message}). Retrying with fresh CPU Llama instance (getLlama({ gpu: false }))...`);
        try {
          if (llamaInstance) {
            try { await llamaInstance.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
          }
          const cpuLlama = await getLlama({ gpu: false });
          this.model = await cpuLlama.loadModel({
            modelPath: modelPath,
            gpuLayers: 0
          });
          this.context = await this.model.createContext({
            contextSize: ctxSize,
            sequences: 4
          });
          this.llama = cpuLlama;
        } catch (cpuLoadErr: any) {
          console.error(`[BuiltIn-LLM] CPU model load also failed:`, cpuLoadErr);
          throw cpuLoadErr;
        }
      }
      
      const toolDispatcher = ToolDispatcher.getInstance();
      const toolDefs = toolDispatcher.getToolDefinitions();
      const toolsPrompt = getToolsPrompt(toolDefs);
      const antiReasoningRule = ' КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить рассуждения, внутренний монолог, английский текст ("Here is a thinking process"), этапы анализа или теги <think>. Сразу выводи ТОЛЬКО готовый итоговый ответ пользователю на русском языке.';
      const defaultSystemPrompt = 'Ты — A.R.C., интеллектуальный ассистент и цифровой напарник. Твой пол — ИСКЛЮЧИТЕЛЬНО МУЖСКОЙ. Общайся уверенно, уважительно и профессионально. Грубость, уличный сленг ("Чё надо?") и панибратство СТРОГО ЗАПРЕЩЕНЫ. Кальки, канцелярит и подобострастие запрещены. Используй конкретные глаголы ("найду", "сделаю", "подскажу"). Отвечай лаконично и по делу. Всегда отвечай ТОЛЬКО на русском языке. Термины переводи или транслитерируй. Обращение "сэр" запрещено. Пользователь общается голосом — понимай живую речь.' + antiReasoningRule + '\n\n' + toolsPrompt;

      // Allow node-llama-cpp to automatically resolve appropriate chat wrapper from GGUF metadata
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: defaultSystemPrompt,
        autoDisposeSequence: false // MUST BE FALSE for manual dispose and session switching
      });
      
      if (settings?.sessionId) {
        this.activeSessionId = settings.sessionId;
      }

      this.isLoaded = true;
      this.currentModelName = targetModel;
      this.resetIdleTimer(settings);
      this.startTelemetry();
      this.broadcastModelLoading(targetModel, 'ready');
      console.log(`[BuiltIn-LLM] Model ${targetModel} loaded successfully!`);
      return true;
    } catch (e: any) {
      console.error(`[BuiltIn-LLM] Failed to initialize node-llama-cpp with model ${targetModel}:`, e);
      this.broadcastModelLoading(targetModel, 'error');
      this.isLoaded = false;
      this.currentModelName = '';

      // Only unlink file if it is clearly truncated/corrupted on disk (smaller than minimal expected size)
      try {
        if (fs.existsSync(modelPath)) {
          const stats = fs.statSync(modelPath);
          let minSize = 350 * 1024 * 1024;
          if (targetModel.includes('1.8b')) minSize = 1000 * 1024 * 1024;
          if (targetModel.includes('3b')) minSize = 1800 * 1024 * 1024;
          if (stats.size < minSize) {
            console.warn(`[BuiltIn-LLM] Unlinking truncated model file ${modelPath} (${stats.size} bytes).`);
            fs.unlinkSync(modelPath);
          }
        }
      } catch (delErr) {
        console.error(`[BuiltIn-LLM] Failed to check/delete truncated model file:`, delErr);
      }

      throw e;
    }
  }

  public async generate(
    text: string,
    history: any[],
    modelName: string,
    settings: any,
    callback: (chunk: string, done: boolean) => void
  ): Promise<void> {
    this.isGenerating = true;
    try {
      this.resetIdleTimer(settings);
      const targetModel = modelName || 'LFM2.5-2.6B-Q4_K_M.gguf';
      
      // Auto-download on demand if missing with consent check
      const exists = await this.isModelDownloaded(targetModel);
      if (!exists) {
        if (!settings?.autoDownloadLargeModels) {
          console.warn(`[BuiltIn-LLM] Model ${targetModel} is missing and autoDownloadLargeModels is disabled. Download blocked.`);
          callback('Облачный сервис сейчас недоступен, а встроенная локальная модель не установлена. Загрузите её в разделе настроек ИИ.', true);
          return;
        }

        console.log(`[BuiltIn-LLM] Model ${targetModel} is missing. Consent granted, initiating automatic download...`);
        callback(`Идет автоматическое скачивание файлов встроенной модели (${targetModel}). Пожалуйста, подождите...`, false);
        let lastLoggedPct = -1;
        let lastLogTime = 0;
        await this.downloadModel(targetModel, (loaded, total) => {
          const pct = total > 0 ? Math.floor((loaded / total) * 100) : 0;
          const now = Date.now();
          if (pct !== lastLoggedPct && (now - lastLogTime >= 2000 || pct === 100)) {
            lastLoggedPct = pct;
            lastLogTime = now;
            console.log(`[BuiltIn-LLM Download] ${targetModel}: ${pct}%`);
          }
        });
      }

      if (!this.isLoaded || this.currentModelName !== targetModel) {
        try {
          const initSuccess = await this.initialize(targetModel, settings);
          if (!initSuccess) {
            callback(`Не удалось инициализировать модель ${targetModel}. Возможно, недостаточно памяти.`, true);
            return;
          }
        } catch (firstErr: any) {
          console.warn(`[BuiltIn-LLM] Primary load failed for ${targetModel}: ${firstErr?.message || firstErr}. Checking file validity...`);
          
          const fileValid = await this.isModelDownloaded(targetModel);
          if (!fileValid) {
            if (!settings?.autoDownloadLargeModels) {
              callback(`Файл модели (${targetModel}) поврежден. Пожалуйста, перескачайте его вручную в настройках ИИ.`, true);
              return;
            }
            callback(`Обнаружен поврежденный файл модели (${targetModel}). Скачиваю чистую версию...`, false);
            let lastRecoveryPct = -1;
            let lastRecoveryTime = 0;
            await this.downloadModel(targetModel, (loaded, total) => {
              const pct = total > 0 ? Math.floor((loaded / total) * 100) : 0;
              const now = Date.now();
              if (pct !== lastRecoveryPct && (now - lastRecoveryTime >= 2000 || pct === 100)) {
                lastRecoveryPct = pct;
                lastRecoveryTime = now;
                console.log(`[BuiltIn-LLM Recovery Download] ${targetModel}: ${pct}%`);
              }
            }, true);

            try {
              await this.initialize(targetModel);
            } catch (secondErr: any) {
              throw new Error(`Модель ${targetModel} недоступна для запуска: ${secondErr?.message || secondErr}`);
            }
          } else {
            throw new Error(`Модель ${targetModel} недоступна для запуска: ${firstErr?.message || firstErr}`);
          }
        }
      }

      const incomingSessionId = settings?.sessionId || null;
      if (incomingSessionId && this.activeSessionId !== incomingSessionId) {
        console.log(`[BuiltIn-LLM] Session switch detected (${this.activeSessionId} -> ${incomingSessionId}). Resetting context sequence...`);
        if (this.session) {
          try {
             const seq = (this.session as any)?.sequence;
             if (typeof (this.session as any).dispose === 'function') {
                await (this.session as any).dispose();
             }
             if (seq && typeof seq.dispose === 'function') {
                await seq.dispose();
             }
          } catch (e) { console.warn('Ignored error in catch', e); }
          this.session = null;
        }
        if (this.context) {
           const { LlamaChatSession } = await import('node-llama-cpp');
           const antiReasoning = ' КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить рассуждения, внутренний монолог, английский текст или теги <think>. Сразу выводи ТОЛЬКО готовый ответ на русском языке.';
           this.session = new LlamaChatSession({
             contextSequence: this.context.getSequence(),
             systemPrompt: (settings?.systemPrompt || 'Ты — A.R.C., интеллектуальный ассистент и цифровой напарник. Твой пол — ИСКЛЮЧИТЕЛЬНО МУЖСКОЙ. Общайся уверенно, уважительно и профессионально. Грубость, уличный сленг ("Чё надо?") и панибратство СТРОГО ЗАПРЕЩЕНЫ. Кальки, канцелярит и подобострастие запрещены. Используй конкретные глаголы ("найду", "сделаю", "подскажу"). Отвечай лаконично и по делу. Всегда отвечай ТОЛЬКО на русском языке. Термины переводи или транслитерируй. Обращение "сэр" запрещено. Пользователь общается голосом — понимай живую речь.') + antiReasoning,
             autoDisposeSequence: false
           });
        }
        this.activeSessionId = incomingSessionId;
      }

      if (!this.session) {
        throw new Error('Chat session is not initialized.');
      }

      const mappedHistory = this.mapDialogHistory(history, text);

      // Check context summarization
      const ctxSize = settings?.llmMaxContextSize || 2048;
      const currentTokens = (this.session as any)?.sequence?.nextTokenIndex || 0;
      
      if (settings?.llmContextSummarization !== false && mappedHistory.length > 2 && currentTokens > ctxSize * 0.8) {
        console.log(`[BuiltIn-LLM] Context over 80% (${currentTokens}/${ctxSize}). Running summarization...`);
        callback('Провожу сжатие контекста старых сообщений для экономии памяти. Секунду...', false);
        try {
          const messagesToSummarize = mappedHistory.slice(0, -1);
          const lastMessage = mappedHistory[mappedHistory.length - 1];
          const summaryPrompt = `Сожми следующий диалог в краткое резюме, сохранив ключевые факты и решения: ${JSON.stringify(messagesToSummarize)}`;
          
          let tempSequence: any = null;
          let summary = '';
          try {
            const { LlamaChatSession } = await import('node-llama-cpp');
            tempSequence = this.context!.getSequence();
            const tempSession = new LlamaChatSession({
              contextSequence: tempSequence,
              systemPrompt: 'Ты — A.R.C., интеллектуальный ассистент. Твой пол — ИСКЛЮЧИТЕЛЬНО МУЖСКОЙ. О себе говори в мужском роде.',
              autoDisposeSequence: false
            });
            await tempSession.prompt(summaryPrompt, {
              temperature: 0.1,
              maxTokens: 200,
              onTextChunk: (chunk: string) => { summary += chunk; }
            });
          } finally {
            if (tempSequence) {
              try { tempSequence.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
            }
          }
          
          if (summary) {
            mappedHistory.length = 0;
            mappedHistory.push({ type: 'user', text: `Резюме предыдущего диалога: ${summary}` });
            mappedHistory.push(lastMessage);
            this.prefillActive = false;
          }
        } catch (sumErr) {
          console.warn('[BuiltIn-LLM] Summarization failed:', sumErr);
          if (mappedHistory.length > 4) {
             mappedHistory.splice(0, mappedHistory.length - 4);
             this.prefillActive = false;
          }
        }
      } else if (currentTokens > ctxSize * 0.9 && mappedHistory.length > 4) {
          mappedHistory.splice(0, mappedHistory.length - 4);
          this.prefillActive = false;
      }

      // Synchronize chat history while preserving any prefilled KV-cache state for the current turn
      this.syncSessionHistory(mappedHistory);

      let fullResponse = '';

      // Clean prompt text from raw format tags
      const cleanInputText = text
        .replace(/<\|im_start\|>/g, '')
        .replace(/<\|im_end\|>/g, '')
        .trim();

      // Yield event loop before initiating prompt processing
      await new Promise((resolve) => setImmediate(resolve));

      const thinkingFilter = new StreamingThinkingFilter();
      let streamedLength = 0;

      // Perform generation natively with repeatPenalty to prevent repetition loops
      await this.session.prompt(cleanInputText, {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 250,
        repeatPenalty: {
          penalty: 1.18,
          presencePenalty: 0.1,
          frequencyPenalty: 0.1
        },
        onTextChunk: async (chunk: string) => {
          fullResponse += chunk;
          thinkingFilter.processChunk(chunk, (cleanChunk) => {
            streamedLength += cleanChunk.length;
            callback(cleanChunk, false);
          });
          // Await setImmediate to yield Node.js main thread event loop on every token chunk
          await new Promise((resolve) => setImmediate(resolve));
        }
      });

      thinkingFilter.finalize((cleanChunk) => {
        streamedLength += cleanChunk.length;
        callback(cleanChunk, false);
      });

      let finalResponse = stripThinkingProcess(fullResponse.trim());
      
      // Strip hallucinated code blocks if user didn't ask for code
      if (!/код|скрипт|code|script|программ/i.test(cleanInputText)) {
        finalResponse = finalResponse.replace(/```[\s\S]*?```/g, '').trim();
      }

      // Robust leak sanitization, foreign script removal & profanity removal
      finalResponse = finalResponse
        .replace(/^<\|im_start\|>system[\s\S]*?<\|im_end\|>/gi, '')
        .replace(/^system\n[\s\S]*?assistant\n/gi, '')
        .replace(/^system\s*/i, '')
        .replace(/^assistant\s*/i, '')
        .replace(/<\|im_start\|>/gi, '')
        .replace(/<\|im_end\|>/gi, '')
        .replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '') // remove accidental CJK / foreign script chars
        .replace(/\b(блять|бля|блядина|сука|нахуй|похуй|дохуя|хуй|хуйн[яеию]|пизда|пиздец|долбоеб|долбоёб|ебать|ебаный|ёбаный|мудак|еблан)\b/gi, '')
        .replace(/(.{3,})\1{4,}/gi, '$1') // collapse 4+ phrase loop repetitions
        .replace(/\s+/g, ' ')
        .trim();

      // Clean up common 0.5B Qwen model grammatical hallucinations
      const lowerCleanText = cleanInputText.toLowerCase();
      const isGreetingInput = /^(?:привет|приветик|приветствую|приветули|приветики|здравствуй|здравствуйте|здорово|здарова|дарова|добрый|хай|салют|хеллоу|хелло|ку|дратути)\b/i.test(lowerCleanText);
      
      if (isGreetingInput || ((lowerCleanText.includes('привет') || lowerCleanText.includes('как дела')) && /я\s+привет|конечно,\s*я\s+привет|как\s+дела/i.test(finalResponse))) {
        finalResponse = 'Приветствую. На связи.';
      } else if (/я\s+видим\s+на\s+экране|видим\s+на\s+экране/i.test(finalResponse)) {
        finalResponse = 'Модуль визуального анализа экранов активирован. Захвачено изображение всех подключенных мониторов.';
      } else if (/основная\s+информация\s+о|разработку\s+и\s+реализация|управления\s+сетьом|такие\s+as|поддержка\s+операционных\s+систем/i.test(finalResponse)) {
        finalResponse = `По вашему запросу «${cleanInputText}» формирую сведение.`;
      }

      if (!finalResponse) {
        finalResponse = 'Система готова к работе.';
      }

      if (streamedLength > 0) {
        // Chunks were already streamed, notify completion without duplicating
        callback('', true);
      } else {
        callback(finalResponse, true);
      }
      
    } catch (err: any) {
      console.error('[BuiltIn-LLM] Generation error:', err);
      throw err;
    } finally {
      this.isGenerating = false;
      this.prefillActive = false;
      this.prefillUserTokens = [];
      this.prefillUserStartTokenIndex = -1;
      this.resetIdleTimer(settings);
    }
  }

  private mapDialogHistory(history: any[], currentQueryText?: string): any[] {
    const mappedHistory: any[] = [];
    if (!Array.isArray(history)) return mappedHistory;

    for (const msg of history) {
      if (!msg) continue;
      if (msg.role === 'user') {
        let cleanText = msg.content || '';
        cleanText = cleanText.replace(/system\n[\s\S]*?assistant\n/gi, '').trim();
        if (cleanText) {
          mappedHistory.push({ type: 'user', text: cleanText });
        }
      } else if (msg.role === 'assistant') {
        let cleanText = msg.content || '';
        cleanText = cleanText.replace(/system\n[\s\S]*?assistant\n/gi, '').trim();
        if (cleanText) {
          mappedHistory.push({ type: 'model', response: [cleanText] });
        }
      }
    }

    if (currentQueryText && mappedHistory.length > 0) {
      const lastMsg = mappedHistory[mappedHistory.length - 1];
      if (lastMsg.type === 'user' && (lastMsg.text === currentQueryText || lastMsg.text.trim() === currentQueryText.trim())) {
        mappedHistory.pop();
      }
    }
    return mappedHistory;
  }

  private syncSessionHistory(mappedHistory: any[]): void {
    if (!this.session) return;
    const targetSig = JSON.stringify(mappedHistory);

    // If background KV prefill already synced this exact conversation history,
    // do NOT call setChatHistory again so _lastEvaluation and KV-cache tokens stay intact.
    if (this.prefillActive && this.lastSyncedHistorySignature === targetSig) {
      (this.session as any)._canUseContextWindowForCompletion = true;
      return;
    }

    let targetHistory = mappedHistory;
    if (typeof (this.session as any).getChatHistory === 'function') {
      try {
        const existing = (this.session as any).getChatHistory();
        if (Array.isArray(existing)) {
          const systemItems = existing.filter((m: any) => m?.type === 'system');
          if (systemItems.length > 0) {
            targetHistory = [...systemItems, ...mappedHistory];
          }
        }
      } catch {}
    }

    this.session.setChatHistory(targetHistory as any);
    this.lastSyncedHistorySignature = targetSig;
  }

  /**
   * Incrementally prefills the KV-cache with the stable prefix of an ongoing user utterance.
   * Performs token-level Longest Common Prefix matching and rolls back only changed tail tokens
   * if streaming STT revised earlier words.
   */
  public async prefillPartial(
    stableText: string,
    history: any[] = [],
    modelName?: string,
    settings?: any
  ): Promise<{
    evaluated: boolean;
    userTokens: number[];
    deltaTokens: number;
    rollbackTokens: number;
  }> {
    if (this.isGenerating) {
      return { evaluated: false, userTokens: [], deltaTokens: 0, rollbackTokens: 0 };
    }

    const cleanInputText = (stableText || '')
      .replace(/<\|im_start\|>/g, '')
      .replace(/<\|im_end\|>/g, '')
      .trim();
    if (!cleanInputText) {
      return { evaluated: false, userTokens: [], deltaTokens: 0, rollbackTokens: 0 };
    }

    const targetModel = this.sanitizeModelName(modelName || settings?.builtinLLMModel || 'LFM2.5-2.6B-Q4_K_M.gguf');
    if (!this.isLoaded || this.currentModelName !== targetModel || !this.session) {
      const exists = await this.isModelDownloaded(targetModel);
      if (!exists) {
        return { evaluated: false, userTokens: [], deltaTokens: 0, rollbackTokens: 0 };
      }
      try {
        const ok = await this.initialize(targetModel, settings);
        if (!ok || !this.session) {
          return { evaluated: false, userTokens: [], deltaTokens: 0, rollbackTokens: 0 };
        }
      } catch {
        return { evaluated: false, userTokens: [], deltaTokens: 0, rollbackTokens: 0 };
      }
    }

    this.resetIdleTimer(settings);

    const mappedHistory = this.mapDialogHistory(history, cleanInputText);
    const historySig = JSON.stringify(mappedHistory);

    if (!this.prefillActive || this.lastSyncedHistorySignature !== historySig) {
      this.syncSessionHistory(mappedHistory);
      const seq = (this.session as any)?.sequence;
      this.prefillBaseHistoryTokenIndex = seq?.nextTokenIndex ?? seq?.contextTokens?.length ?? 0;
      this.prefillUserTokens = [];
      this.prefillUserStartTokenIndex = -1;
      this.prefillActive = true;
    }

    const nextTokens: number[] =
      typeof (this.model as any)?.tokenize === 'function'
        ? Array.from((this.model as any).tokenize(cleanInputText)).map((t: any) => Number(t))
        : tokenizeWordsApprox(cleanInputText);

    const diff = computeTokenDiff(this.prefillUserTokens, nextTokens);
    if (diff.isIdentical && this.prefillUserTokens.length > 0) {
      return {
        evaluated: false,
        userTokens: this.prefillUserTokens,
        deltaTokens: 0,
        rollbackTokens: 0
      };
    }

    const seq = (this.session as any)?.sequence;
    const getSeqLen = () => seq?.nextTokenIndex ?? seq?.contextTokens?.length ?? 0;

    // Roll back changed tail tokens in KV-cache if STT revised earlier words
    if (diff.rollbackTokenCount > 0 && seq && typeof seq.eraseContextTokenRanges === 'function') {
      const seqLen = getSeqLen();
      const baseStart =
        this.prefillUserStartTokenIndex >= 0
          ? this.prefillUserStartTokenIndex
          : Math.max(0, (seqLen || this.prefillUserTokens.length) - this.prefillUserTokens.length);
      const eraseStart = Math.max(this.prefillBaseHistoryTokenIndex, baseStart + diff.commonPrefixLength);
      const eraseEnd = seqLen || (baseStart + this.prefillUserTokens.length);
      if (eraseEnd > eraseStart) {
        await seq.eraseContextTokenRanges([{ start: eraseStart, end: eraseEnd }]);
      }
    }

    if (this.activePrefillAbortController) {
      try {
        this.activePrefillAbortController.abort();
      } catch {}
    }
    const abortController = new AbortController();
    this.activePrefillAbortController = abortController;

    try {
      if (typeof (this.session as any).preloadPrompt === 'function') {
        await (this.session as any).preloadPrompt(cleanInputText, {
          signal: abortController.signal
        });
        (this.session as any)._canUseContextWindowForCompletion = true;
        const seqLenAfter = getSeqLen();
        if (seqLenAfter > 0) {
          this.prefillUserStartTokenIndex = Math.max(
            this.prefillBaseHistoryTokenIndex,
            seqLenAfter - nextTokens.length
          );
        }
      } else if (seq && typeof seq.evaluateWithoutGeneratingNewTokens === 'function') {
        if (this.prefillUserStartTokenIndex < 0) {
          this.prefillUserStartTokenIndex = getSeqLen();
        }
        if (diff.deltaTokens.length > 0) {
          await seq.evaluateWithoutGeneratingNewTokens(diff.deltaTokens);
        }
      }

      this.prefillUserTokens = nextTokens;
      this.prefillActive = true;

      return {
        evaluated: true,
        userTokens: nextTokens,
        deltaTokens: diff.deltaTokens.length,
        rollbackTokens: diff.rollbackTokenCount
      };
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        console.debug(`[BuiltIn-LLM] Prefill evaluation warning: ${err?.message || err}`);
      }
      return { evaluated: false, userTokens: this.prefillUserTokens, deltaTokens: 0, rollbackTokens: 0 };
    } finally {
      if (this.activePrefillAbortController === abortController) {
        this.activePrefillAbortController = null;
      }
    }
  }

  public getPrefillState() {
    return {
      active: this.prefillActive,
      userTokens: [...this.prefillUserTokens],
      baseHistoryTokenIndex: this.prefillBaseHistoryTokenIndex
    };
  }

  /**
   * Cancels any uncommitted KV-cache prefill and restores sequence state to the last committed turn.
   */
  public async cancelPrefill(_reason: string = 'cancelled'): Promise<void> {
    if (this.activePrefillAbortController) {
      try {
        this.activePrefillAbortController.abort();
      } catch {}
      this.activePrefillAbortController = null;
    }

    if (this.session && typeof (this.session as any)._stopAllPreloadAndPromptCompletions === 'function') {
      try {
        (this.session as any)._stopAllPreloadAndPromptCompletions();
      } catch {}
    }

    if (this.prefillActive && this.session) {
      const seq = (this.session as any)?.sequence;
      if (seq && typeof seq.eraseContextTokenRanges === 'function') {
        const currentEnd = seq.nextTokenIndex ?? seq.contextTokens?.length ?? 0;
        if (currentEnd > this.prefillBaseHistoryTokenIndex) {
          try {
            await seq.eraseContextTokenRanges([
              { start: this.prefillBaseHistoryTokenIndex, end: currentEnd }
            ]);
          } catch {}
        }
      }
    }

    this.prefillActive = false;
    this.prefillUserTokens = [];
    this.prefillUserStartTokenIndex = -1;
  }

  public async generateSingleTurn(
    prompt: string,
    systemPrompt: string,
    modelName: string
  ): Promise<string> {
    const targetModel = modelName || 'LFM2.5-2.6B-Q4_K_M.gguf';

    const exists = await this.isModelDownloaded(targetModel);
    if (!exists) {
      console.warn(`[BuiltIn-LLM SingleTurn] Model ${targetModel} missing. Returning prompt as fallback.`);
      return prompt;
    }

    if (!this.isLoaded || this.currentModelName !== targetModel) {
      await this.initialize(targetModel);
    }

    if (!this.context) {
      throw new Error('BuiltIn LLM context is not initialized.');
    }

    let tempSequence: any = null;
    let tempSession: any = null;
    try {
      const { LlamaChatSession } = await import('node-llama-cpp');
      tempSequence = this.context.getSequence();
      tempSession = new LlamaChatSession({
        contextSequence: tempSequence,
        systemPrompt: systemPrompt,
        autoDisposeSequence: false
      });

      let response = '';
      await tempSession.prompt(prompt, {
        temperature: 0.1,
        maxTokens: 96,
        repeatPenalty: {
          penalty: 1.2,
          presencePenalty: 0.1,
          frequencyPenalty: 0.1
        },
        onTextChunk: (chunk: string) => {
          response += chunk;
        }
      });

      return response.trim();
    } catch (err: any) {
      console.warn(`[BuiltIn-LLM SingleTurn] Isolated execution failed: ${err.message || err}`);
      return prompt;
    } finally {
      if (tempSession) {
        try {
          if (typeof (tempSession as any)?.dispose === 'function') {
            await (tempSession as any).dispose();
          }
        } catch (e) { console.warn('Ignored error in catch', e); }
        tempSession = null;
      }
      if (tempSequence) {
        try { await tempSequence.dispose(); } catch (e) { console.warn('Ignored error in catch', e); }
        tempSequence = null;
      }
    }
  }

  public async testInference(
    modelName?: string,
    promptText?: string,
    maxTokens?: number
  ): Promise<string> {
    const targetModel = modelName || 'LFM2.5-2.6B-Q4_K_M.gguf';
    console.log(`[BuiltIn-LLM Test] Running direct inference test for ${targetModel}...`);

    const exists = await this.isModelDownloaded(targetModel);
    if (!exists) {
      throw new Error(`Модель ${targetModel} не найдена на диске. Сначала скачайте её.`);
    }

    if (!this.isLoaded || this.currentModelName !== targetModel) {
      await this.initialize(targetModel);
    }

    if (!this.session) {
      throw new Error('Не удалось инициализировать сессию инференса.');
    }

    const prompt = promptText || 'Поздоровайся и скажи "Я готов к работе" очень кратко!';
    let response = '';

    await this.session.prompt(prompt, {
      temperature: 0.7,
      maxTokens: maxTokens || 60,
      onTextChunk: (chunk: string) => {
        response += chunk;
      }
    });

    let cleanRes = response.trim()
      .replace(/^<\|im_start\|>system[\s\S]*?<\|im_end\|>/gi, '')
      .replace(/^system\n[\s\S]*?assistant\n/gi, '')
      .replace(/^system\s*/i, '')
      .replace(/^assistant\s*/i, '')
      .replace(/<\|im_start\|>/gi, '')
      .replace(/<\|im_end\|>/gi, '')
      .replace(/[\u4e00-\u9fa5]/g, '')
      .trim();

    const lowerRes = cleanRes.toLowerCase();
    if (lowerRes.endsWith('готов к работе') || lowerRes.endsWith('на связи')) {
      cleanRes = cleanRes + '.';
    }

    return cleanRes;
  }
}

