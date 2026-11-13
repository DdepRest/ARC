import { pipeline, env } from '@xenova/transformers';

// Configure transformers
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx) {
  env.backends.onnx.logLevel = 'error'; // Set log level to error to suppress onnxruntime warnings
  if (env.backends.onnx.wasm) {
    // Use multiple threads for Whisper STT performance (up to max concurrency)
    env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  }
}

// Suppress Xenova and ONNX Runtime WASM warnings in worker
const isBenignMessage = (msg: string) => (
  msg.includes('Removing initializer') || 
  msg.includes('ort-wasm') || 
  msg.includes('onnxruntime') || 
  msg.includes('Unable to determine content-length')
);

const originalWarn = console.warn;
console.warn = function(...args) {
  if (isBenignMessage(args.join(' '))) return;
  originalWarn.apply(console, args);
};

const originalInfo = console.info;
console.info = function(...args) {
  if (isBenignMessage(args.join(' '))) return;
  originalInfo.apply(console, args);
};

const originalLog = console.log;
console.log = function(...args) {
  if (isBenignMessage(args.join(' '))) return;
  originalLog.apply(console, args);
};

let transcriber: any = null;
let currentModelName: string | null = null;

// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
  const { type, payload } = e.data;

  if (type === 'load') {
    try {
      const modelSize = payload?.sttModel || 'tiny';
      const modelName = modelSize.includes('/') ? modelSize : `Xenova/whisper-${modelSize}`;
      
      if (transcriber && currentModelName === modelName) {
        console.log(`[Worker] Whisper model is already cached in memory. Skipping reload.`);
        self.postMessage({ type: 'loaded' });
        return;
      }
      
      if (transcriber && currentModelName !== modelName) {
        console.log(`[Whisper] Model changed, reloading...`);
        transcriber = null;
      }
      
      currentModelName = modelName;

      console.log(`[Worker] Loading Whisper model: ${modelName}`);
      const hasGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const device = hasGPU ? 'webgpu' : 'wasm';
      console.log(`[Worker] Preferred ORT device: ${device} (WebGPU support: ${hasGPU})`);

      const loadPipeline = async (deviceType: string) => {
        return await pipeline('automatic-speech-recognition', modelName, {
          quantized: true,
          progress_callback: (data: any) => {
            self.postMessage({ type: 'progress', payload: data });
          },
          device: deviceType
        } as any);
      };

      try {
        try {
          transcriber = await loadPipeline(device);
        } catch (firstErr: any) {
          console.warn(`[Worker] Primary load attempt failed (${firstErr?.message || firstErr}), trying wasm fallback...`);
          transcriber = await loadPipeline('wasm');
        }
      } catch (err: any) {
        const errStr = String(err?.message || err);
        if (errStr.includes('401') || errStr.includes('Unauthorized') || errStr.includes('Failed to fetch') || errStr.includes('NetworkError') || errStr.includes('fetch failed')) {
          console.warn(`[Worker] HuggingFace blocked or 401 (${errStr}), switching env.remoteHost to hf-mirror.com and retrying...`);
          env.remoteHost = 'https://hf-mirror.com/';
          transcriber = await loadPipeline('wasm');
        } else {
          throw err;
        }
      }

      self.postMessage({ type: 'loaded' });
    } catch (err: any) {
      if (err instanceof SyntaxError || (err.message && err.message.includes('JSON'))) {
        self.postMessage({ type: 'error_cache_corrupted', payload: err.message });
      } else {
        self.postMessage({ type: 'error', payload: err.message });
      }
    }
  }

    if (type === 'unload') {
    console.log('[Worker] Unloading model...');
    transcriber = null;
    currentModelName = null;
    self.postMessage({ type: 'unloaded' });
  }
  if (type === 'clear_cache') {
    await caches.delete('transformers-cache');
    self.postMessage({ type: 'cache_cleared' });
  }

  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', payload: 'Transcriber not loaded' });
      return;
    }

    try {
      const result = await transcriber(payload.audio, {
        language: payload.language || 'russian',
        task: 'transcribe',
        return_timestamps: false,
        beam_size: 1, // Greedy decoding for speed
        num_beams: 1,
        patience: 1.0,
      });
      self.postMessage({ type: 'result', payload: result });
    } catch (err: any) {
      self.postMessage({ type: 'error', payload: err.message });
    }
  }
});
