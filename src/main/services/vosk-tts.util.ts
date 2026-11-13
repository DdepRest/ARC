import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { app, BrowserWindow } from 'electron';
import { logger } from '../utils/logger';

export const VOSK_PACKAGED_MODEL_REL_PATH = path.join('resources', 'models', 'vosk-tts');

export function resolveVoskModelPath(getPath: (rel: string) => string): string | null {
  const envModel = process.env.ARC_VOSK_MODEL_PATH?.trim();
  if (envModel && fs.existsSync(envModel)) return envModel;

  const relCandidates = [
    VOSK_PACKAGED_MODEL_REL_PATH,
    path.join('models', 'vosk-tts'),
    path.join('Voice', 'models', 'vosk-model-tts-ru-0.9-multi'),
    path.join('Voice', 'models', 'vosk-model-tts-ru-0.10-multi'),
    'vosk-model-tts-ru-0.9-multi',
    'vosk-model-tts-ru-0.10-multi'
  ];

  for (const rel of relCandidates) {
    const resolved = getPath(rel);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }

  try {
    if (app?.getPath) {
      const userDataVosk = path.join(app.getPath('userData'), 'models', 'vosk-tts', 'vosk-model-tts-ru-0.9-multi');
      if (fs.existsSync(userDataVosk)) return userDataVosk;
    }
  } catch {}

  return null;
}

export function resolvePreferredTtsScript(getPath: (rel: string) => string): {
  scriptPath: string;
  isVosk: boolean;
  voskModelPath: string | null;
} {
  const voskScript = getPath('vosk_server.py');
  const sileroScript = getPath('silero_server.py');
  const voskModelPath = resolveVoskModelPath(getPath);
  const forceVosk = process.env.ARC_TTS_ENGINE?.toLowerCase() === 'vosk';
  const forceSilero = process.env.ARC_TTS_ENGINE?.toLowerCase() === 'silero';

  if (!forceSilero && fs.existsSync(voskScript) && (forceVosk || Boolean(voskModelPath))) {
    return { scriptPath: voskScript, isVosk: true, voskModelPath };
  }
  return { scriptPath: sileroScript, isVosk: false, voskModelPath };
}

export function switchPythonTtsEngine(targetEngine: 'silero' | 'vosk'): void {
  const prevEngine = process.env.ARC_TTS_ENGINE?.toLowerCase();
  process.env.ARC_TTS_ENGINE = targetEngine;
  if (prevEngine === targetEngine) return;
  try {
    const wins = BrowserWindow.getAllWindows();
    const activeWin = wins.find((w) => !w.isDestroyed());
    if (activeWin) {
      const { PythonServerService } = require('./python_server.service');
      PythonServerService.stop();
      setTimeout(() => {
        if (!activeWin.isDestroyed()) {
          void PythonServerService.start(activeWin);
        }
      }, 300);
    }
  } catch {}
}

export function notifyPythonTtsStop(): void {
  axios.post('http://127.0.0.1:8002/stop', {}, { timeout: 1500 }).catch(() => {
    // Non-fatal if Python server is offline or running legacy Silero without /stop
  });
}

export interface StreamTtsOptions {
  text: string;
  speakerId?: number;
  speechRate?: number;
  abortController: AbortController;
  isCancelled: () => boolean;
}

export async function streamFromVoskServer(options: StreamTtsOptions): Promise<void> {
  const { text, speakerId = 2, speechRate = 0.95, abortController, isCancelled } = options;

  const response = await axios.post(
    'http://127.0.0.1:8002/tts_stream',
    {
      text,
      speaker_id: speakerId,
      speech_rate: speechRate
    },
    {
      responseType: 'stream',
      timeout: 60000,
      signal: abortController.signal
    }
  );

  if (isCancelled() || abortController.signal.aborted) {
    notifyPythonTtsStop();
    return;
  }

  const sampleRateHeader = Number(response.headers?.['x-sample-rate'] || 22050) || 22050;
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('voice:play-audio-start', sampleRateHeader);
    }
  });

  return new Promise<void>((resolve, reject) => {
    const stream = response.data;
    if (!stream || typeof stream.on !== 'function') {
      resolve();
      return;
    }

    const onAbort = () => {
      try {
        if (typeof stream.destroy === 'function') stream.destroy();
      } catch {}
      notifyPythonTtsStop();
      resolve();
    };

    abortController.signal.addEventListener('abort', onAbort, { once: true });

    stream.on('data', (chunk: Buffer | Uint8Array) => {
      if (isCancelled() || abortController.signal.aborted) {
        onAbort();
        return;
      }
      const bytes = chunk instanceof Uint8Array ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength) : new Uint8Array(chunk);
      const activeWins = BrowserWindow.getAllWindows();
      activeWins.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('voice:audio-chunk', bytes);
          win.webContents.send('voice:play-audio-chunk', bytes);
        }
      });
    });

    stream.on('end', () => {
      abortController.signal.removeEventListener('abort', onAbort);
      if (!isCancelled() && !abortController.signal.aborted) {
        const activeWins = BrowserWindow.getAllWindows();
        activeWins.forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('voice:play-audio-end');
          }
        });
      }
      logger.info('[TTS Stream] Stream completed.');
      resolve();
    });

    stream.on('error', (err: any) => {
      abortController.signal.removeEventListener('abort', onAbort);
      if (isCancelled() || abortController.signal.aborted || axios.isCancel(err)) {
        resolve();
        return;
      }
      reject(err);
    });
  });
}
