import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

export interface WhisperSegment {
  timestamp: [number, number] | null;
  text: string;
}

export interface WhisperResult {
  text: string;
  chunks: WhisperSegment[];
}

export class BuiltInWhisperService {
  private static instance: BuiltInWhisperService | null = null;
  private worker: Worker | null = null;
  private isLoaded = false;
  private currentModelName = '';
  private pendingResolves: Map<string, (val: any) => void> = new Map();
  private pendingRejects: Map<string, (err: any) => void> = new Map();
  private progressCallback: ((loaded: number, total: number, file: string) => void) | null = null;
  private chunkCallback: ((chunk: any) => void) | null = null;

  private constructor() {}

  public static getInstance(): BuiltInWhisperService {
    if (!BuiltInWhisperService.instance) {
      BuiltInWhisperService.instance = new BuiltInWhisperService();
    }
    return BuiltInWhisperService.instance;
  }

  private getCacheDir(): string {
    return path.join(app.getPath('userData'), 'cache', 'transformers-cache');
  }

  /**
   * Initializes the persistent worker thread for Whisper
   */
  private initWorker(): Worker {
    if (this.worker) return this.worker;

    console.log('[BuiltIn-Whisper-Parent] Initializing background Worker Thread for Whisper inference...');
    
    // JS Worker code to execute in background thread
    const workerCode = `
      const { parentPort } = require('worker_threads');
      
      // Sharp mock removed as per TZ
      
      let pipeline, env;
      
      async function ensurePipeline() {
         if (!pipeline) {
             let trans;
             trans = await import('@xenova/transformers');
             pipeline = trans.pipeline || (trans.default && trans.default.pipeline);
             env = trans.env || (trans.default && trans.default.env);
         }
         if (typeof pipeline !== 'function') throw new Error("pipeline is not a function in whisper worker");
      }


      let transcriber = null;
      let loadedModel = '';
      let loadedDevice = '';

      parentPort.on('message', async (message) => {
        const { action, modelName, samples, cacheDir, device } = message;
        const targetDevice = device || 'cpu';

        let hasOnnxNode = false;
        try {
          require('onnxruntime-node');
          hasOnnxNode = true;
        } catch (e) {
          hasOnnxNode = false;
        }

        // Apply cache directory settings
        if (env && cacheDir) {
          env.allowLocalModels = true;
          env.cacheDir = cacheDir;
          env.remoteHost = 'https://hf-mirror.com';
          if (env.backends && env.backends.onnx) {
            env.backends.onnx.node = (targetDevice !== 'cpu') ? true : hasOnnxNode;
          }
        }

        if (action === 'check') {
          try {
            const fs = require('fs');
            const path = require('path');
            const modelDir = path.join(cacheDir, modelName);
            const modelDir2 = path.join(cacheDir, 'models', modelName);
            
            const exists = fs.existsSync(path.join(modelDir, 'config.json')) || 
                           fs.existsSync(path.join(modelDir2, 'config.json')) ||
                           fs.existsSync(path.join(modelDir, 'onnx', 'config.json'));
            parentPort.postMessage({ type: 'check', modelName, result: exists });
          } catch (e) {
            parentPort.postMessage({ type: 'check', modelName, result: false });
          }
        }

        else if (action === 'download' || action === 'initialize') {
          try {
            await ensurePipeline();
            
            // If already loaded this specific model on this device, don't reload
            if (loadedModel === modelName && loadedDevice === targetDevice && transcriber) {
              parentPort.postMessage({ type: 'ready', modelName, success: true });
              return;
            }

            const pipeOptions = {
              local_files_only: action === 'initialize',
              progress_callback: (info) => {
                if (info.total && info.loaded) {
                  parentPort.postMessage({
                    type: 'progress',
                    loaded: info.loaded,
                    total: info.total,
                    file: info.file || modelName
                  });
                }
              }
            };

            // Only pass device if it's not cpu
            if (targetDevice !== 'cpu') {
              pipeOptions.device = targetDevice;
            }

            transcriber = await pipeline('automatic-speech-recognition', modelName, pipeOptions);
            loadedModel = modelName;
            loadedDevice = targetDevice;
            parentPort.postMessage({ type: 'ready', modelName, success: true });
          } catch (e) {
            parentPort.postMessage({ type: 'ready', modelName, success: false, error: e.message || e });
          }
        }

        else if (action === 'transcribe') {
          try {
            if (!transcriber || loadedModel !== modelName) {
              parentPort.postMessage({ type: 'error', error: 'Model ' + modelName + ' is not loaded yet.' });
              return;
            }

            if (!samples) {
              parentPort.postMessage({ type: 'error', error: 'No audio samples provided for transcription.' });
              return;
            }
            
            // Reconstruct Float32Array if it was serialized as an object/buffer across IPC
            let samplesData = samples;
            if (!(samplesData instanceof Float32Array)) {
              if (samplesData.buffer) {
                samplesData = new Float32Array(samplesData.buffer, samplesData.byteOffset, samplesData.byteLength / 4);
              } else if (samplesData instanceof Uint8Array) {
                samplesData = new Float32Array(samplesData.buffer, samplesData.byteOffset, samplesData.byteLength / 4);
              } else {
                // Warning: if it's a giant object, this will be slow, but it's a fallback
                samplesData = new Float32Array(Object.values(samplesData));
              }
            }

            console.log('[BuiltIn-Whisper-Worker] Transcribing ' + samplesData.length + ' samples with model ' + modelName + ' on device ' + targetDevice + '...');

            const result = await transcriber(samplesData, {
              chunk_length_s: 30,
              stride_length_s: 5,
              language: 'russian',
              task: 'transcribe',
              return_timestamps: true,
              chunk_callback: (chunk) => {
                parentPort.postMessage({
                  type: 'transcription_chunk',
                  chunk: {
                    text: chunk.text,
                    timestamp: chunk.timestamp || (chunk.start !== undefined ? [chunk.start, chunk.end] : null),
                    index: chunk.index
                  }
                });
              }
            });

            parentPort.postMessage({ type: 'transcription_complete', result });
          } catch (e) {
            parentPort.postMessage({ type: 'error', error: e.message || e });
          }
        }
      });
    `;

    this.worker = new Worker(workerCode, { eval: true });

    this.worker.on('message', (msg: any) => {
      const { type, success, error, result, loaded, total, file, modelName, chunk } = msg;

      if (type === 'check') {
        const resolve = this.pendingResolves.get(`check-${modelName}`);
        if (resolve) { resolve(result); this.pendingResolves.delete(`check-${modelName}`); }
      } else if (type === 'ready') {
        const resolve = this.pendingResolves.get(`load-${modelName}`);
        const reject = this.pendingRejects.get(`load-${modelName}`);
        if (success) {
          this.isLoaded = true;
          this.currentModelName = modelName;
          if (resolve) resolve(true);
        } else if (reject) {
          reject(new Error(error || 'Failed to load model'));
        }
        this.pendingResolves.delete(`load-${modelName}`);
        this.pendingRejects.delete(`load-${modelName}`);
      } else if (type === 'progress') {
        if (this.progressCallback) this.progressCallback(loaded, total, file);
      } else if (type === 'transcription_chunk') {
        if (this.chunkCallback) this.chunkCallback(chunk);
      } else if (type === 'transcription_complete') {
        const resolve = this.pendingResolves.get('transcribe');
        if (resolve) { resolve(result); this.pendingResolves.delete('transcribe'); }
      } else if (type === 'error') {
        const reject = this.pendingRejects.get('transcribe');
        if (reject) { reject(new Error(error || 'Transcription failed')); this.pendingRejects.delete('transcribe'); }
      }
    });

    this.worker.on('error', (err) => {
      console.error('[BuiltIn-Whisper-Worker] Critical worker error:', err);
      this.terminateWorker();
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[BuiltIn-Whisper-Worker] Worker stopped with exit code ${code}`);
      }
      this.worker = null;
      this.isLoaded = false;
      this.currentModelName = '';
    });

    return this.worker;
  }

  private terminateWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isLoaded = false;
      this.currentModelName = '';
    }
  }

  /**
   * Checks if model is downloaded locally in transformers cache
   */
  public async isModelDownloaded(modelName: string): Promise<boolean> {
    try {
      const cacheDir = this.getCacheDir();
      const mDir = path.join(cacheDir, modelName);
      const mDir2 = path.join(cacheDir, 'models', modelName);
      const mDir3 = path.join(cacheDir, modelName.replace('/', '--'));
      if (
        fs.existsSync(path.join(mDir, 'config.json')) ||
        fs.existsSync(path.join(mDir2, 'config.json')) ||
        fs.existsSync(path.join(mDir, 'onnx', 'config.json')) ||
        fs.existsSync(path.join(mDir3, 'config.json'))
      ) return true;
    } catch {}
    // If worker is not already running, do not spawn a heavy worker thread just for a passive existence check
    if (!this.worker) {
      return false;
    }
    const worker = this.initWorker();
    return new Promise((resolve) => {
      const key = `check-${modelName}`;
      const timeout = setTimeout(() => {
        if (this.pendingResolves.has(key)) {
          this.pendingResolves.delete(key);
          resolve(false);
        }
      }, 1500);
      this.pendingResolves.set(key, (res: boolean) => {
        clearTimeout(timeout);
        resolve(res);
      });
      worker.postMessage({ action: 'check', modelName, cacheDir: this.getCacheDir() });
    });
  }

  /**
   * Downloads or loads the model locally
   */
  public async downloadModel(modelName: string, onProgress: (loaded: number, total: number, file: string) => void, device: string = 'cpu'): Promise<boolean> {
    if (await this.isModelDownloaded(modelName)) return true;
    const worker = this.initWorker();
    this.progressCallback = onProgress;
    return new Promise((resolve, reject) => {
      const loadKey = `load-${modelName}`;
      const timer = setTimeout(() => {
        if (this.pendingResolves.has(loadKey)) {
          this.pendingResolves.delete(loadKey);
          this.pendingRejects.delete(loadKey);
          reject(new Error('offline: network timeout while connecting to model repository'));
        }
      }, 3000);
      this.pendingResolves.set(loadKey, (val: any) => {
        clearTimeout(timer);
        resolve(val);
      });
      this.pendingRejects.set(loadKey, (err: any) => {
        clearTimeout(timer);
        reject(err);
      });
      worker.postMessage({ action: 'download', modelName, cacheDir: this.getCacheDir(), device });
    });
  }

  /**
   * Initializes the model if already downloaded
   */
  public async initializeModel(modelName: string, device: string = 'cpu'): Promise<boolean> {
    const worker = this.initWorker();

    return new Promise((resolve, reject) => {
      const loadKey = `load-${modelName}`;
      this.pendingResolves.set(loadKey, resolve);
      this.pendingRejects.set(loadKey, reject);

      worker.postMessage({
        action: 'initialize',
        modelName,
        cacheDir: this.getCacheDir(),
        device,
      });
    });
  }

  /**
   * Performs the local Whisper speech-to-text transcription
   */
  public async transcribe(modelName: string, samples: Float32Array, device: string = 'cpu', onChunk?: (chunk: any) => void): Promise<WhisperResult> {
    // Ensure model is loaded on the specific device
    await this.initializeModel(modelName, device);
    const worker = this.initWorker();
    
    if (onChunk) {
      this.chunkCallback = onChunk;
    } else {
      this.chunkCallback = null;
    }

    return new Promise((resolve, reject) => {
      this.pendingResolves.set('transcribe', resolve);
      this.pendingRejects.set('transcribe', reject);

      worker.postMessage({
        action: 'transcribe',
        modelName,
        samples,
        device,
      }, [samples.buffer]);
    });
  }

  /**
   * Aborts current running model inference or loading
   */
  public abort() {
    console.log('[BuiltIn-Whisper-Parent] Aborting active Whisper worker thread on user request...');
    this.terminateWorker();
    
    // Also reject any pending transcription promises
    const reject = this.pendingRejects.get('transcribe');
    if (reject) {
      reject(new Error('Transcription was cancelled by user.'));
      this.pendingRejects.delete('transcribe');
    }
    this.pendingResolves.delete('transcribe');
    this.chunkCallback = null;
  }
}

export const builtInWhisperService = BuiltInWhisperService.getInstance();
