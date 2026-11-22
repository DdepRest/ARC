import axios from 'axios';
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { EdgeTTS } from 'node-edge-tts';
import { logger } from '../utils/logger';
import { cacheService } from './cache.service';

export async function pollPythonTtsReady(
  timeout: number,
  onKnownReadyChange: (ready: boolean) => void,
  wasKnownReady: boolean
): Promise<boolean> {
  const start = Date.now();
  let lastLogged = start;
  let loggedInitial = false;
  while (Date.now() - start < timeout) {
    try {
      const res = await axios.get('http://127.0.0.1:8002/status', { timeout: 3000 });
      if (res.data && res.data.status === 'online') {
        if (!wasKnownReady) {
          console.log(`[TTS] Python TTS server is online and ready (${Math.round((Date.now() - start) / 1000)}s).`);
        }
        onKnownReadyChange(true);
        return true;
      }
    } catch (err: any) {
      if (err?.response?.status === 503) {
        console.warn('[TTS] Python TTS server returned HTTP 503 (model unavailable), falling back immediately.');
        onKnownReadyChange(false);
        return false;
      }
      if (!loggedInitial && timeout > 5000) {
        console.log(`[TTS] Checking Python TTS server (timeout ${timeout / 1000}s)...`);
        loggedInitial = true;
      }
      if (Date.now() - lastLogged >= 5000) {
        console.log(`[TTS] Waiting for Python TTS server to initialize... (${Math.round((Date.now() - start) / 1000)}s / ${timeout / 1000}s)`);
        lastLogged = Date.now();
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  onKnownReadyChange(false);
  return false;
}

export async function synthesizeEdgeTtsFile(text: string): Promise<string> {
  const tempFile = path.join(app.getPath('temp'), `temp_speech_${Date.now()}.mp3`);
  const edge = new EdgeTTS({ voice: 'ru-RU-DmitryNeural', lang: 'ru-RU', pitch: '-10Hz', rate: '+10%', timeout: 60000 });
  const cleanEdgeText = text.replace(/\+([а-яёА-ЯЁ])/g, '$1');
  await edge.ttsPromise(cleanEdgeText, tempFile);
  return tempFile;
}

export async function synthesizeSileroTtsFile(params: {
  text: string;
  cacheKey: string;
  isSpeedTier: boolean;
  speaker: string;
  speed: number;
  pitch: number;
  sampleRate: number;
  putAccent: boolean;
  putYo: boolean;
  speakId: number;
  abortController: AbortController;
  isStale: () => boolean;
}): Promise<string | null> {
  const tempFile = path.join(app.getPath('temp'), `temp_speech_${Date.now()}_${params.speakId}.wav`);
  const payload = {
    text: params.text,
    speaker: params.speaker || 'eugene',
    speed: params.speed,
    pitch: params.pitch,
    sample_rate: params.sampleRate,
    put_accent: params.putAccent,
    put_yo: params.putYo,
  };
  try {
    const response = await axios.post('http://127.0.0.1:8002/tts', payload, {
      responseType: 'arraybuffer',
      timeout: 60000,
      signal: params.abortController.signal,
    });
    if (params.isStale()) {
      logger.info(`[TTS] Silero synthesis finished but request was cancelled (id: ${params.speakId}). Discarding.`);
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      return null;
    }
    if (response.headers['x-dsp-error']) {
      console.warn(`[TTS] DSP skipped: Python server returned X-DSP-Error: ${response.headers['x-dsp-error']}`);
      logger.warn(`[TTS] DSP skipped: Python server returned X-DSP-Error: ${response.headers['x-dsp-error']}`);
      const wins = BrowserWindow.getAllWindows().filter((w: any) => w && !w.isDestroyed?.() && !w.webContents?.isDestroyed?.());
      if (wins.length > 0) {
        wins[0].webContents.send('app:toast', { message: `Голос: без обработки (ошибка: ${response.headers['x-dsp-error']})`, type: 'error' });
      }
    }
    await fs.promises.writeFile(tempFile, Buffer.from(response.data));
    cacheService.put(params.cacheKey, tempFile, params.isSpeedTier);
    return tempFile;
  } catch (err: any) {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
    if (axios.isCancel(err) || params.abortController.signal.aborted || params.isStale()) {
      logger.info(`[TTS] Synthesis aborted for speak ID ${params.speakId}`);
      return null;
    }
    throw err;
  }
}
