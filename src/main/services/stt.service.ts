import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { app } from 'electron';
import { resolveSherpaModelDir } from './sherpa-paths.util';
import { sherpaDownloaderService } from './sherpa-downloader.service';
import { applyCorrections } from './stt-corrections.util';
import { buildSttWorkerConfigs, broadcastSttToast, executeSttAutoDownload, isGigaamPreVerified, attemptGigaamHotSwap } from './stt-config.helper';
import { sttCircuitBreaker } from './stt-circuit-breaker.util';
import { ecoService } from './eco.service';
import type { VoiceModelSetupState } from '../../shared/utils/voice-model-state-machine';

export class STTService extends EventEmitter {
  private isListening: boolean = false;
  private child: cp.ChildProcess | null = null;
  private modelLoaded: boolean = false;
  private sttEngine: 'gigaam' | 'legacy' = 'gigaam';
  private activeEngine: 'gigaam' | 'whisper' | 'sherpa' | 'none' = 'none';
  private loadedEngines: Set<'gigaam' | 'whisper' | 'sherpa'> = new Set();
  private activeGigaamSource: string = 'fussraider-multilingual';
  private downloadPromise: Promise<{ success: boolean; error?: string }> | null = null;
  private intentionallyStoppedChildren = new WeakSet<cp.ChildProcess>();
  private isShuttingDown: boolean = false;
  private crashTimestamps: number[] = [];
  private heartbeatIntervalTimer: NodeJS.Timeout | null = null;
  private heartbeatResetTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatAt: number = 0;
  private isRecoveringHeartbeat: boolean = false;
  private activeInitPromise: Promise<{ ready: boolean; error?: string }> | null = null;
  private activeInitTimer: NodeJS.Timeout | null = null;
  public lastInitError: string = '';
  private missingModelsReason: string | null = null;

  constructor() {
    super();
    ecoService.on('state-change', (state) => {
      const interval = state === 'hidden' ? 30000 : 2000;
      if (this.child && this.child.connected) {
        this.startHeartbeat(interval);
      }
    });
  }

  private startHeartbeat(intervalMs: number = 2000) {
    if (this.heartbeatIntervalTimer) {
      clearInterval(this.heartbeatIntervalTimer);
      this.heartbeatIntervalTimer = null;
    }
    if (!this.child || !this.child.connected) return;

    this.lastHeartbeatAt = Date.now();
    const timeoutThreshold = intervalMs >= 15000 ? Math.max(intervalMs + 15000, 45000) : 15000;

    this.heartbeatIntervalTimer = setInterval(() => {
      if (!this.child || !this.child.connected) return;
      if (this.isRecoveringHeartbeat) return;

      if (Date.now() - this.lastHeartbeatAt > timeoutThreshold) {
        console.warn(`[STT] Heartbeat timeout (${timeoutThreshold / 1000}s), attempting reset_buffer first`);
        this.isRecoveringHeartbeat = true;
        try {
          this.child.send({ type: 'reset_buffer' });
          this.child.send({ type: 'ping' });
        } catch (e) {}

        if (this.heartbeatResetTimer) clearTimeout(this.heartbeatResetTimer);
        this.heartbeatResetTimer = setTimeout(() => {
          if (!this.isRecoveringHeartbeat || this.isShuttingDown) return;
          console.error('[STT] Worker did not recover after reset_buffer. Force restarting via SIGTERM...');
          this.terminateWorker(true);
          this.initializeModels('whisper-small').then(res => {
            if (res.ready) console.log('[STT] Voice: STT Listening started');
          }).catch(() => {});
        }, 3000);
      } else {
        this.child.send({ type: 'ping' });
      }
    }, intervalMs);
  }

  setEngine(engine: 'gigaam' | 'legacy') {
    this.sttEngine = engine;
    if (this.child && this.child.connected) {
      this.child.send({ type: 'set_engine', sttEngine: engine });
    }
  }

  async startListening(modelName?: string, options?: { allowAutoDownload?: boolean }): Promise<boolean> {
    this.isShuttingDown = false;
    if (this.isListening) return true;
    
    if (!this.modelLoaded) {
      const sherpaRes = resolveSherpaModelDir('zipformer-ru');
      const whisperRes = resolveSherpaModelDir('whisper-small');
      const gigaRes = resolveSherpaModelDir('gigaam-ctc');

      if (!sherpaRes.isComplete && !whisperRes.isComplete && !gigaRes.isComplete) {
        if (options?.allowAutoDownload === true) {
          console.log('[STT] Explicit auto-download consented during startListening...');
          await this.autoDownloadMissingModels(false);
        } else {
          this.lastInitError = '';
          this.missingModelsReason = 'Голосовые модели STT не установлены. Настройте голосовой контур в мастере первого запуска или в настройках.';
          console.warn('[STT] Cannot start listening: no STT models installed and auto-download not consented.');
          broadcastSttToast(this.missingModelsReason, 'warning', 5000);
          return false;
        }
      }

      this.missingModelsReason = null;
      const initResult = await this.initializeModels(modelName);
      if (!initResult.ready) {
        this.lastInitError = initResult.error || 'Ошибка инициализации STT';
        console.error('[STT] Initialization failed:', initResult.error);
        return false;
      }
      this.lastInitError = '';
    }
    
    this.isListening = true;
    return true;
  }

  async autoDownloadMissingModels(
    includeGigaamOrOpts: boolean | { includeGigaam?: boolean; includeWhisper?: boolean; includeZipformer?: boolean } | ((data: any) => void) = false,
    onProgress?: (data: any) => void
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    const opts = typeof includeGigaamOrOpts === 'function' ? false : includeGigaamOrOpts;
    const progressCb = typeof includeGigaamOrOpts === 'function' ? includeGigaamOrOpts : onProgress;
    if (this.downloadPromise) return this.downloadPromise;
    this.downloadPromise = (async () => {
      try {
        return await executeSttAutoDownload(opts, progressCb, async () => {
          if (this.child?.connected && this.activeEngine !== 'gigaam') await this.triggerGigaamHotSwapIfReady();
        });
      } finally {
        this.downloadPromise = null;
      }
    })();
    return this.downloadPromise;
  }

  stopListening() {
    this.isListening = false;
  }

  shutdown(): void {
    this.isShuttingDown = true;
    this.isListening = false;
    this.terminateWorker(true);
  }

  private terminateWorker(intentional: boolean = false) {
    if (this.activeInitTimer) {
      clearTimeout(this.activeInitTimer);
      this.activeInitTimer = null;
    }
    this.activeInitPromise = null;
    if (this.heartbeatIntervalTimer) {
      clearInterval(this.heartbeatIntervalTimer);
      this.heartbeatIntervalTimer = null;
    }
    if (this.heartbeatResetTimer) {
      clearTimeout(this.heartbeatResetTimer);
      this.heartbeatResetTimer = null;
    }
    this.isRecoveringHeartbeat = false;
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    this.ipcInFlightChunks = 0;
    if (this.child) {
      const proc = this.child;
      if (intentional) {
        this.intentionallyStoppedChildren.add(proc);
      }
      this.child = null;
      try {
        if (proc.connected) proc.disconnect();
        proc.kill('SIGTERM');
      } catch (e) {}
    }
    this.modelLoaded = false;
    this.activeEngine = 'none';
    this.loadedEngines.clear();
  }

  async switchModel(modelId: string, reason: 'user_switch' | 'crash' = 'user_switch'): Promise<{ ready: boolean; error?: string; loading?: boolean; message?: string }> {
    const isGiga = modelId === 'gigaam-ctc' || modelId === 'gigaam';
    const isSherpa = modelId === 'zipformer-ru';
    const targetKey = isGiga ? 'gigaam-ctc' : (isSherpa ? 'zipformer-ru' : 'whisper-small');
    const targetDirRes = resolveSherpaModelDir(targetKey);

    // Invariant: If files missing and current engine is active, keep it running and download in background
    if (!targetDirRes.isComplete && this.modelLoaded && this.child?.connected) {
      console.log(`[STT] Model ${modelId} files missing. Keeping current engine active and downloading in background.`);
      broadcastSttToast('Модель загружается, текущий движок активен', 'info');
      this.downloadAndHotSwapModel(targetKey);
      return { ready: true, loading: true, message: 'Модель загружается, текущий движок активен' };
    }

    if (isGiga) {
      this.sttEngine = 'gigaam';
      if (this.child?.connected && this.modelLoaded) {
        this.child.send({ type: 'set_engine', sttEngine: 'gigaam' });
        if (this.activeEngine === 'gigaam') {
          this.emit('engine-ready', { engine: 'gigaam' });
          return { ready: true };
        }
        const swapped = await this.triggerGigaamHotSwapIfReady();
        if (swapped) {
          this.activeEngine = 'gigaam';
          this.emit('engine-ready', { engine: 'gigaam' });
          return { ready: true };
        }
      }
    } else {
      this.sttEngine = 'legacy';
      if (this.child?.connected) {
        this.child.send({ type: 'set_engine', sttEngine: 'legacy' });
      }
    }

    this.isShuttingDown = false;
    this.terminateWorker(reason === 'user_switch');
    return this.initializeModels(modelId);
  }

  private downloadAndHotSwapModel(modelKey: string) {
    const broadcast = (data: any) => {
      try {
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((w: any) => w.webContents.send('stt:download-progress', data));
      } catch {}
    };

    sherpaDownloaderService.downloadModel(modelKey, broadcast)
      .then(async (res) => {
        if (res.success) {
          console.log(`[STT] Background download of ${modelKey} succeeded.`);
          if (modelKey === 'gigaam-ctc') {
            await this.triggerGigaamHotSwapIfReady();
            broadcastSttToast('Модель GigaAM успешно подключена', 'success');
          } else {
            broadcastSttToast('Модель загружена и готова к работе', 'success');
          }
        } else if (res.cancelled) {
          console.log(`[STT] Background download of ${modelKey} cancelled by user.`);
        } else {
          console.warn(`[STT] Background download error: ${res.error}`);
          broadcastSttToast(`Загрузка ${modelKey} прервана: ${res.error || 'сбой сети'}. Текущий движок активен.`, 'warning');
        }
      })
      .catch((err) => console.warn('[STT] Download exception:', err?.message || err));
  }

  async reinitialize(modelName?: string, reason: 'user_switch' | 'crash' = 'user_switch'): Promise<{ ready: boolean; error?: string }> {
    return this.switchModel(modelName || 'zipformer-ru', reason);
  }

  async initializeModels(requestedModel?: string): Promise<{ ready: boolean; error?: string }> {
    this.isShuttingDown = false;
    if (this.modelLoaded && this.child && this.child.connected) {
      return { ready: true };
    }
    if (this.activeInitPromise) {
      return this.activeInitPromise;
    }
    
    this.activeInitPromise = new Promise<{ ready: boolean; error?: string }>((resolve) => {
      this.terminateWorker(true);
      
      const gigaDirRes = resolveSherpaModelDir('gigaam-ctc');
      const whisperDirRes = resolveSherpaModelDir('whisper-small');
      const sherpaDirRes = resolveSherpaModelDir('zipformer-ru');

      const activeMode = (this.sttEngine === 'gigaam' && gigaDirRes.isComplete && requestedModel !== 'zipformer-ru') ? 'gigaam' : 'legacy';

      if (activeMode === 'gigaam') {
        if (!gigaDirRes.isComplete) {
          this.activeInitPromise = null;
          return resolve({ ready: false, error: 'GigaAM CTC model is not ready' });
        }
      } else if (!sherpaDirRes.isComplete && !whisperDirRes.isComplete) {
        const errDetail = sherpaDirRes.missingFiles?.join(', ') || whisperDirRes.missingFiles?.join(', ') || 'Sherpa/Whisper models incomplete';
        this.activeInitPromise = null;
        return resolve({ ready: false, error: errDetail });
      }

      const { vadConfig, sherpaConfig, whisperConfig, gigaamConfig, gigaamSourceInfo } = buildSttWorkerConfigs(activeMode);

      const candidateWorkerPaths = [
        process.resourcesPath ? path.join(process.resourcesPath, 'scripts', 'stt_worker.js') : '',
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', 'stt_worker.js') : '',
        path.join(app.getAppPath(), 'scripts', 'stt_worker.js'),
        path.join(process.cwd(), 'scripts', 'stt_worker.js'),
        path.join(__dirname, '..', '..', 'scripts', 'stt_worker.js')
      ].filter(Boolean);
      const workerScriptPath = candidateWorkerPaths.find(p => fs.existsSync(p));
      if (!workerScriptPath) {
        this.activeInitPromise = null;
        return resolve({ ready: false, error: 'stt_worker.js script missing' });
      }

      try {
        const extraNodePaths = [
          process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules') : '',
          path.join(app.getAppPath(), 'node_modules'),
          process.env.NODE_PATH || ''
        ].filter(Boolean).join(path.delimiter);
        const proc = cp.fork(workerScriptPath, [], {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: { ...process.env, NODE_PATH: extraNodePaths }
        });
        this.child = proc;
        
        let lastCircularBufferErrorTime = 0;
        let consecutiveBufferResets = 0;
        let hasResolved = false;

        const finishInit = (result: { ready: boolean; error?: string }) => {
          if (hasResolved) return;
          hasResolved = true;
          if (this.activeInitTimer) {
            clearTimeout(this.activeInitTimer);
            this.activeInitTimer = null;
          }
          this.activeInitPromise = null;
          resolve(result);
        };

        this.activeInitTimer = setTimeout(() => {
          if (!hasResolved && this.child === proc) {
            console.error('[STT] Worker initialization failed: Timeout initializing worker (30s)');
            this.terminateWorker();
            finishInit({ ready: false, error: 'Timeout initializing worker' });
          }
        }, 30000);

        if (proc.stdout) {
          proc.stdout.on('data', (d) => console.log(`[STT Worker] ${d.toString().trim()}`));
        }
        if (proc.stderr) {
          proc.stderr.on('data', (d) => {
            const errStr = d.toString().trim();
            console.error(`[STT Worker] ${errStr}`);
            if (errStr.includes('Invalid n: -')) {
              const now = Date.now();
              if (now - lastCircularBufferErrorTime > 2000) {
                if (now - lastCircularBufferErrorTime > 60000) consecutiveBufferResets = 0;
                lastCircularBufferErrorTime = now;
                consecutiveBufferResets++;
                console.error('[STT] Circular buffer error detected! Stack trace:\n' + new Error().stack);
                if (consecutiveBufferResets >= 3) {
                  console.warn('[STT] 3 consecutive buffer resets failed. Falling back to Whisper floor...');
                  if (this.child === proc && proc.connected) proc.send({ type: 'fallback_to_whisper' });
                  this.activeEngine = 'whisper';
                  this.emit('engine-ready', { engine: 'whisper' });
                } else {
                  console.warn(`[STT] Buffer reset ${consecutiveBufferResets}/3 to recover from Invalid n error...`);
                  if (this.child === proc && proc.connected) proc.send({ type: 'reset_buffer' });
                }
              }
            }
          });
        }

        proc.on('message', (msg: any) => {
          if (!msg || this.child !== proc) return;
          if (msg.type === 'pong') {
            this.lastHeartbeatAt = Date.now();
            if (this.isRecoveringHeartbeat) {
              console.log('[STT] Worker responded to ping/pong after reset_buffer, recovery avoided');
              this.isRecoveringHeartbeat = false;
              if (this.heartbeatResetTimer) {
                clearTimeout(this.heartbeatResetTimer);
                this.heartbeatResetTimer = null;
              }
            }
            return;
          }
          if (msg.type === 'engine_ready') {
            const readyEngine = msg.engine || 'whisper';
            this.activeEngine = readyEngine;
            if (readyEngine === 'gigaam' || readyEngine === 'whisper' || readyEngine === 'sherpa') {
              this.loadedEngines.add(readyEngine);
            }
            console.log(`[STT] Engine ready: ${this.activeEngine}`);
            this.emit('engine-ready', { engine: this.activeEngine });
          } else if (msg.type === 'init_result' || msg.type === 'worker-ready') {
            if (!hasResolved) {
              if (msg.success) {
                this.modelLoaded = true;
                this.lastInitError = '';
                this.missingModelsReason = null;
                this.loadedEngines.clear();
                if (msg.hasGigaam) this.loadedEngines.add('gigaam');
                if (msg.hasWhisper) this.loadedEngines.add('whisper');
                if (!msg.hasGigaam && !msg.hasWhisper) this.loadedEngines.add('sherpa');
                if (!this.activeEngine || this.activeEngine === 'none') {
                  this.activeEngine = msg.hasGigaam ? 'gigaam' : (msg.hasWhisper ? 'whisper' : 'sherpa');
                }
                this.loadedEngines.add(this.activeEngine);
                console.log(`[STT] Worker initialized successfully. Active: ${this.activeEngine}. GigaAM: ${msg.hasGigaam}, Whisper: ${msg.hasWhisper}, VAD: ${msg.hasVad}`);
                this.emit('ready', { model: 'stt-v2', engine: this.activeEngine });
                this.emit('engine-ready', { engine: this.activeEngine });
                finishInit({ ready: true });

                const interval = ecoService.getState() === 'hidden' ? 30000 : 2000;
                this.startHeartbeat(interval);

                // Asynchronously attempt GigaAM hot-swap if not ready yet
                if (!msg.hasGigaam && gigaamConfig && gigaamSourceInfo) {
                  attemptGigaamHotSwap(this.child, this.activeGigaamSource, gigaamConfig, gigaamSourceInfo);
                }
              } else {
                console.error('[STT] Worker init failed:', msg.error);
                this.terminateWorker();
                finishInit({ ready: false, error: msg.error });
              }
            }
          } else if (msg.type === 'zero_engines_error') {
            console.error('[STT] Worker reported zero engines available.');
            this.lastInitError = 'Ни один движок STT не готов. Проверьте установленные модели в настройках.';
            broadcastSttToast(this.lastInitError, 'error');
          } else if (msg.type === 'partial') {
            if (msg.text) this.emit('partial', msg.text);
          } else if (msg.type === 'final') {
            if (msg.text) {
              const text = applyCorrections(msg.text.trim());
              if (text) {
                this.emit('final', text, { engine: msg.engine || this.activeEngine, latencyMs: msg.latencyMs || 0 });
              }
            }
          }
        });

        proc.on('error', (err) => {
          console.error('[STT] Worker error:', err);
          if (this.child === proc) {
            this.terminateWorker();
            finishInit({ ready: false, error: err.message });
          }
        });

        proc.on('exit', (code, signal) => {
          const wasIntentional = this.isShuttingDown || this.intentionallyStoppedChildren.has(proc);
          if (wasIntentional || code === 0 || signal === 'SIGTERM') {
            console.log(`[STT] Worker exited cleanly (code: ${code}, signal: ${signal})`);
            if (this.child === proc) this.terminateWorker(true);
            finishInit({ ready: false, error: 'Worker stopped' });
            return;
          }

          if (this.child !== proc) {
            finishInit({ ready: false, error: 'Superseded worker stopped' });
            return;
          }

          console.warn(`[STT] Worker exited with code ${code}, signal: ${signal}`);
          const now = Date.now();
          this.crashTimestamps = this.crashTimestamps.filter(t => now - t < 30000);
          this.crashTimestamps.push(now);

          const isCrash = code === -1 || code === 4294967295 || signal === 'SIGSEGV' || signal === 'SIGABRT';
          if (isCrash && gigaamSourceInfo) {
            const tripped = sttCircuitBreaker.recordWorkerCrash(code, signal, this.activeGigaamSource, gigaamSourceInfo.dir);
            if (tripped) {
              console.warn('[STT] Circuit breaker tripped! Fallback to Whisper Small int8 without GigaAM');
            }
          }

          this.terminateWorker();
          
          if (this.crashTimestamps.length >= 3) {
            const msg = `Критическая ошибка STT: циклическое падение (${code}, ${signal}). Микрофон отключен.`;
            this.lastInitError = msg;
            this.isListening = false;
            console.error(`[STT] ${msg}`);
            broadcastSttToast(msg, 'error');
            finishInit({ ready: false, error: msg });
            return;
          }

          if (!hasResolved) {
            finishInit({ ready: false, error: `Worker exited prematurely (code: ${code}, signal: ${signal})` });
          } else if (!this.isShuttingDown) {
            console.log('[STT] Unexpected worker exit during runtime, recovering floor Whisper...');
            this.initializeModels('whisper-small').then(res => {
              if (res.ready) console.log('[STT] Voice: STT Listening started');
            }).catch(() => {});
          }
        });

        // In GigaAM mode, provide config directly to worker; in legacy mode, defer if unverified
        const isGigaamBlocked = gigaamSourceInfo ? sttCircuitBreaker.isSourceBlocked(this.activeGigaamSource, gigaamSourceInfo.dir) : true;
        const initialGigaamConfig = !isGigaamBlocked && gigaamSourceInfo && (this.sttEngine === 'gigaam' || isGigaamPreVerified(gigaamSourceInfo.dir))
          ? gigaamConfig
          : null;

        proc.send({
          type: 'init',
          sttEngine: this.sttEngine,
          vadConfig,
          whisperConfig,
          sherpaConfig,
          gigaamConfig: initialGigaamConfig
        });
      } catch (err: any) {
        this.terminateWorker();
        this.activeInitPromise = null;
        resolve({ ready: false, error: err.message });
      }
    });
    return this.activeInitPromise;
  }

  async triggerGigaamHotSwapIfReady(): Promise<boolean> {
    if (this.activeEngine === 'gigaam' && this.child?.connected) return true;
    const { gigaamConfig, gigaamSourceInfo } = buildSttWorkerConfigs();
    if (gigaamConfig && gigaamSourceInfo && this.child && this.child.connected && this.activeEngine !== 'gigaam') {
      const ok = await attemptGigaamHotSwap(this.child, this.activeGigaamSource, gigaamConfig, gigaamSourceInfo);
      if (ok) this.activeEngine = 'gigaam';
      return ok || (this.activeEngine as any) === 'gigaam';
    }
    return false;
  }

  feedChunk(samples: Float32Array | number[] | object) {
    if (!this.modelLoaded || !this.child?.connected) return;
    try {
      let f32: Float32Array | null = null;
      if (samples instanceof Float32Array) f32 = samples;
      else if (Buffer.isBuffer(samples) || samples instanceof Uint8Array) f32 = new Float32Array((samples as Uint8Array).buffer.slice((samples as Uint8Array).byteOffset, (samples as Uint8Array).byteOffset + (samples as Uint8Array).byteLength));
      else if (Array.isArray(samples)) f32 = new Float32Array(samples);
      else if (samples && typeof samples === 'object' && 'buffer' in samples) f32 = new Float32Array((samples as any).buffer.slice((samples as any).byteOffset || 0, ((samples as any).byteOffset || 0) + ((samples as any).byteLength || 0)));
      else if (samples && typeof samples === 'object') f32 = new Float32Array(Object.values(samples));
      if (!f32 || f32.length === 0) return;

      this.enqueueAndFlushChunk(f32);
    } catch (err) {
      console.error('[STT] Exception in feedChunk:', err);
    }
  }

  private ipcInFlightChunks = 0;
  private pendingAudioChunks: Float32Array[] = [];
  private pendingAudioSamples = 0;
  private static readonly MAX_PENDING_SAMPLES = 32000; // 2s cap at 16kHz

  private enqueueAndFlushChunk(f32: Float32Array) {
    this.pendingAudioChunks.push(f32);
    this.pendingAudioSamples += f32.length;

    while (this.pendingAudioSamples > STTService.MAX_PENDING_SAMPLES && this.pendingAudioChunks.length > 1) {
      const dropped = this.pendingAudioChunks.shift()!;
      this.pendingAudioSamples -= dropped.length;
    }

    this.flushPendingChunks();
  }

  private flushPendingChunks() {
    if (!this.modelLoaded || !this.child?.connected) {
      this.pendingAudioChunks = [];
      this.pendingAudioSamples = 0;
      this.ipcInFlightChunks = 0;
      return;
    }
    if (this.ipcInFlightChunks >= 2 || this.pendingAudioSamples === 0) return;

    let merged: Float32Array;
    if (this.pendingAudioChunks.length === 1) {
      merged = this.pendingAudioChunks[0];
    } else {
      merged = new Float32Array(this.pendingAudioSamples);
      let offset = 0;
      for (const chunk of this.pendingAudioChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
    }
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    this.ipcInFlightChunks++;

    try {
      this.child.send({ type: 'chunk', samples: Array.from(merged), sampleRate: 16000 }, () => {
        this.ipcInFlightChunks = Math.max(0, this.ipcInFlightChunks - 1);
        if (this.pendingAudioSamples >= 1024) {
          this.flushPendingChunks();
        }
      });
    } catch {
      this.ipcInFlightChunks = Math.max(0, this.ipcInFlightChunks - 1);
    }
  }

  endStream() {
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    if (this.child && this.child.connected) {
      try {
        this.child.send({ type: 'end_stream' });
      } catch (err) {
        console.error('[STT] Exception in endStream:', err);
      }
    }
  }

  resetBuffer() {
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    if (this.child && this.child.connected) {
      try {
        this.child.send({ type: 'reset_buffer' });
      } catch (err) {
        console.error('[STT] Exception in resetBuffer:', err);
      }
    }
  }

  getStatus() {
    const zipInstalled = resolveSherpaModelDir('zipformer-ru').isComplete;
    const whisperInstalled = resolveSherpaModelDir('whisper-small').isComplete;
    const gigaInstalled = resolveSherpaModelDir('gigaam-ctc').isComplete;
    const modelsInstalled = zipInstalled || whisperInstalled || gigaInstalled;
    const mapEngineToModelId = (eng: 'gigaam' | 'whisper' | 'sherpa') =>
      eng === 'gigaam' ? 'gigaam-ctc' : eng === 'whisper' ? 'whisper-small' : 'zipformer-ru';
    const loadedModelIds = this.modelLoaded ? Array.from(this.loadedEngines).map(mapEngineToModelId) : [];
    const activeModelId =
      this.modelLoaded && this.activeEngine !== 'none' ? mapEngineToModelId(this.activeEngine) : null;
    const setupState: VoiceModelSetupState = this.activeInitPromise
      ? 'checking'
      : this.lastInitError
      ? 'failed'
      : !modelsInstalled
      ? (this.missingModelsReason ? 'consent_required' : 'missing')
      : 'ready';
    return {
      ready: this.modelLoaded,
      modelLoaded: this.modelLoaded,
      engine: this.sttEngine,
      activeEngine: this.activeEngine,
      lastError: this.lastInitError || null,
      modelsInstalled,
      missingReason: !modelsInstalled ? (this.missingModelsReason || 'Локальные модели STT ещё не скачаны') : null,
      setupState,
      loadedModelIds,
      activeModelId
    };
  }

  getWorkerPid(): number | null {
    return this.child && !this.child.killed ? (this.child.pid ?? null) : null;
  }
}

export const sttService = new STTService();
