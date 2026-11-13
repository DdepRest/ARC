import { logger } from '../utils/logger';
import { app, BrowserWindow, ipcMain } from 'electron';
import axios from 'axios';
import { exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EdgeTTS } from 'node-edge-tts';
import { adaptiveService } from './adaptive.service';
import { cacheService } from './cache.service';
import { HTTP_TIMEOUT_MS } from '../config/timeouts';
import { computeTtsHash, formatTextForSpeech } from './tts-text.util';

export type TtsProviderSetting = 'auto' | 'silero' | 'edge' | 'native' | 'piper' | 'kokoro';
export type TtsActiveEngine = 'silero' | 'edge' | 'system';
export interface TtsMetaPayload {
  engine: 'silero' | 'edge' | 'sapi';
  isCached: boolean;
  queryId?: string;
  textHash?: string;
}

export class TTSService {
  private voicePresetVersion = 560; // Silero v5.6 version tag for tight broadcast vocal DSP
  private activeProcess: ChildProcess | null = null;
  private isServerKnownReady: boolean = false;
  private activeSpeakId: number = 0;
  private isCancelled: boolean = false;
  private activeAbortController: AbortController | null = null;
  private lastSpokenHash: string | null = null;
  private lastSpokenPlainHash: string | null = null;
  private lastSpokenTimestamp: number = 0;
  private currentPlayAudioResolver: (() => void) | null = null;
  private lastWebPlayedSpeakId: number = 0;
  private currentProvider: 'auto' | 'silero' | 'edge' | 'native' = 'auto';
  private lastActiveEngine: TtsActiveEngine | null = null;
  private lastTtsMeta: TtsMetaPayload | null = null;

  public getActiveEngine(): { provider: 'auto' | 'silero' | 'edge' | 'native'; activeEngine: TtsActiveEngine | null } {
    return { provider: this.currentProvider, activeEngine: this.lastActiveEngine };
  }
  public getLastTtsMeta(): TtsMetaPayload | null { return this.lastTtsMeta; }
  public isBusy(): boolean { return Boolean(this.activeAbortController); }
  public setProvider(p: TtsProviderSetting | string): void {
    if (p === 'piper' || p === 'kokoro') throw new Error('TTS provider not implemented in v1.0');
    if (p !== 'auto' && p !== 'silero' && p !== 'edge' && p !== 'native') throw new Error('Unknown TTS provider: ' + p);
    this.currentProvider = p;
    console.log(`[TTS] engine provider set to: ${p}`);
    this.broadcastEngineState();
  }
  private setActiveEngine(engine: TtsActiveEngine): void {
    this.lastActiveEngine = engine;
    console.log(`[TTS] engine active: ${engine} (provider=${this.currentProvider})`);
    this.broadcastEngineState();
  }
  private broadcastEngineState(): void {
    const payload = { provider: this.currentProvider, activeEngine: this.lastActiveEngine };
    try { BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('tts:engine-changed', payload); }); } catch {}
  }
  private broadcastTtsMeta(engine: 'silero' | 'edge' | 'sapi', isCached: boolean, queryId?: string, textHash?: string): void {
    const payload: TtsMetaPayload = { engine, isCached, queryId, textHash };
    this.lastTtsMeta = payload;
    try { BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('tts:meta', payload); }); } catch {}
  }
  public notifySileroOnline(): void {
    this.isServerKnownReady = true;
    if ((this.currentProvider === 'auto' || this.currentProvider === 'silero') && !this.lastActiveEngine) {
      this.lastActiveEngine = 'silero';
      this.broadcastEngineState();
    }
  }
  public computeHash(text: string, queryId?: string): string { return computeTtsHash(text, queryId); }

  private async waitForPythonServer(timeout: number): Promise<boolean> {
    const start = Date.now();
    let lastLogged = start;
    let loggedInitial = false;
    while (Date.now() - start < timeout) {
      try {
        const res = await axios.get('http://127.0.0.1:8002/status', { timeout: 3000 });
        if (res.data && res.data.status === 'online') {
          if (!this.isServerKnownReady) {
            console.log(`[TTS] Python TTS server is online and ready (${Math.round((Date.now() - start) / 1000)}s).`);
            this.isServerKnownReady = true;
          }
          return true;
        }
      } catch (err: any) {
        if (err?.response?.status === 503) {
          console.warn('[TTS] Python TTS server returned HTTP 503 (model unavailable), falling back immediately.');
          this.isServerKnownReady = false;
          return false;
        }
        if (!loggedInitial && timeout > 5000) { console.log(`[TTS] Checking Python TTS server (timeout ${timeout / 1000}s)...`); loggedInitial = true; }
        if (Date.now() - lastLogged >= 5000) {
          console.log(`[TTS] Waiting for Python TTS server to initialize... (${Math.round((Date.now() - start) / 1000)}s / ${timeout / 1000}s)`);
          lastLogged = Date.now();
        }
        await new Promise(r => setTimeout(r, 400));
      }
    }
    this.isServerKnownReady = false;
    return false;
  }

  async speak(
    text: string, voiceStyle: string = 'default', speaker: string = 'eugene',
    speed: number = 1.0, pitch: number = 0, sampleRate: number = 48000,
    putAccent: boolean = true, putYo: boolean = true, autoClearCache: boolean = false,
    force: boolean = false, queryId?: string
  ): Promise<void> {
    const formattedText = formatTextForSpeech(text);
    if (!formattedText) {
      if (!this.activeAbortController && !this.currentPlayAudioResolver) this.notifyWebStop();
      return;
    }
    const textHash = this.computeHash(formattedText, queryId);
    const plainHash = this.computeHash(formattedText);
    const now = Date.now();
    if (!force && (this.lastSpokenHash === textHash || this.lastSpokenPlainHash === plainHash) && (now - this.lastSpokenTimestamp < 45000)) {
      logger.info(`[TTS] Duplicate speak request suppressed (id: ${textHash})`);
      if (!this.activeAbortController && !this.currentPlayAudioResolver) this.notifyWebStop();
      return;
    }
    if (this.activeAbortController || this.currentPlayAudioResolver) {
      logger.info('[TTS] Preempting previous speak request for new incoming speak.');
      this.stop(false);
    }
    this.lastSpokenHash = textHash;
    this.lastSpokenPlainHash = plainHash;
    this.lastSpokenTimestamp = now;
    const currentSpeakId = ++this.activeSpeakId;
    this.isCancelled = false;
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      if (this.currentProvider === 'edge' || this.currentProvider === 'native') {
        if (this.currentProvider === 'edge') {
          this.setActiveEngine('edge');
          this.broadcastTtsMeta('edge', false, queryId, textHash);
          await this.speakWithEdgeTTS(formattedText, '', false, currentSpeakId, textHash);
        } else {
          this.setActiveEngine('system');
          this.broadcastTtsMeta('sapi', false, queryId, textHash);
          await this.speakWithSystemTTS(formattedText, currentSpeakId, textHash);
        }
        return;
      }

      const waitTimeout = this.isServerKnownReady ? 15000 : 35000;
      const isReady = this.isServerKnownReady ? true : await this.waitForPythonServer(waitTimeout);
      if (this.isCancelled || currentSpeakId !== this.activeSpeakId) {
        logger.info(`[TTS] Speak request ${currentSpeakId} cancelled during server readiness check`);
        return;
      }
      if (!isReady) {
        console.warn(`[TTS] Python server not ready after ${waitTimeout / 1000}s, falling back to Edge`);
        console.warn(`[TTS] DSP skipped: Python server offline/not ready`);
        logger.warn(`[TTS] DSP skipped: Python server offline/not ready`);
        try {
          this.setActiveEngine('edge');
          this.broadcastTtsMeta('edge', false, queryId, textHash);
          await this.speakWithEdgeTTS(formattedText, '', false, currentSpeakId, textHash);
        } catch (edgeErr: any) {
          if (this.isCancelled || currentSpeakId !== this.activeSpeakId) return;
          console.warn(`[TTS] Edge TTS failed while Python offline, falling back to System SAPI... [${edgeErr?.code || 'ERR'} ${edgeErr?.message || 'Unknown'}]`);
          try {
            this.setActiveEngine('system');
            this.broadcastTtsMeta('sapi', false, queryId, textHash);
            await this.speakWithSystemTTS(formattedText, currentSpeakId, textHash);
          } catch (sysErr: any) {
            console.error(`All TTS engines failed: [${sysErr?.code || 'ERR'} ${sysErr?.message || 'Unknown'}]`);
          }
        }
        return;
      }

      logger.info(`ARC TTS: Preparing to speak [${formattedText.length} chars] using speaker [${speaker}], autoClearCache=[${autoClearCache}] (id: ${textHash})`);
      const tier = adaptiveService.getCurrentTier();
      if (tier === 'survival') throw new Error("Survival tier active");

      if (autoClearCache) {
        logger.info(`AUTO-CLEAR CACHE: Purging cache before synthesis...`);
        cacheService.clear();
        void Promise.resolve(axios.post('http://127.0.0.1:8002/clear-cache', {}, { timeout: 200 })).catch(() => {});
      }
      if (this.isCancelled || currentSpeakId !== this.activeSpeakId) return;

      const isSpeedTier = cacheService.isSpeedTier(formattedText);
      const cacheKey = cacheService.generateKey(this.voicePresetVersion, tier, formattedText, speed, pitch, sampleRate, putAccent, putYo, speaker);
      const cachedPath = autoClearCache ? null : cacheService.get(cacheKey);
      if (cachedPath) {
        logger.info(`Cache HIT.`);
        this.setActiveEngine('silero');
        this.broadcastTtsMeta('silero', true, queryId, textHash);
        await this.playAudio(cachedPath, currentSpeakId, textHash);
        return;
      }

      logger.info(`Cache MISS. Generating audio via Silero v5.6 (${speaker}) DSP...`);
      try {
        this.setActiveEngine('silero');
        this.broadcastTtsMeta('silero', false, queryId, textHash);
        await this.speakWithSileroTTS(formattedText, cacheKey, isSpeedTier, speaker, speed, pitch, sampleRate, putAccent, putYo, currentSpeakId, textHash, abortController);
      } catch (error: any) {
        if (this.isCancelled || currentSpeakId !== this.activeSpeakId || abortController.signal.aborted) {
          logger.info(`[TTS] Synthesis aborted for speak ${currentSpeakId}`);
          return;
        }
        console.warn(`[TTS] Silero TTS failed, falling back to Edge TTS... [${error.code || 'ERR'} ${error.message || 'Unknown'}]`);
        console.warn(`[TTS] DSP skipped: Silero execution error (${error.message || 'unknown'}), falling back to Edge TTS`);
        logger.warn(`[TTS] DSP skipped: Silero execution error (${error.message || 'unknown'}), falling back to Edge TTS`);
        try {
          this.setActiveEngine('edge');
          this.broadcastTtsMeta('edge', false, queryId, textHash);
          await this.speakWithEdgeTTS(formattedText, cacheKey, isSpeedTier, currentSpeakId, textHash);
        } catch (edgeErr: any) {
          if (this.isCancelled || currentSpeakId !== this.activeSpeakId) return;
          console.warn(`[TTS] Edge TTS failed, falling back to System SAPI... [${edgeErr.code || 'ERR'} ${edgeErr.message || 'Unknown'}]`);
          console.warn(`[TTS] DSP skipped: Edge TTS failure, falling back to System SAPI`);
          logger.warn(`[TTS] DSP skipped: Edge TTS failure, falling back to System SAPI`);
          try {
            this.setActiveEngine('system');
            this.broadcastTtsMeta('sapi', false, queryId, textHash);
            await this.speakWithSystemTTS(formattedText, currentSpeakId, textHash);
          } catch (sysError: any) {
            console.error(`All TTS engines failed: [${sysError.code || 'ERR'} ${sysError.message || 'Unknown'}]`);
          }
        }
      }
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
      if (!this.isCancelled && currentSpeakId === this.activeSpeakId && this.lastWebPlayedSpeakId !== currentSpeakId) {
        this.notifyWebStop();
      }
    }
  }

  private async speakWithEdgeTTS(text: string, cacheKey: string, isSpeedTier: boolean, speakId?: number, textHash?: string): Promise<void> {
    if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId)) return;
    console.log('[TTS] Using provider: edge');
    console.warn('[TTS] DSP skipped: Edge TTS provider active (bypasses Silero DSP v2)');
    logger.warn('[TTS] DSP skipped: Edge TTS provider active (bypasses Silero DSP v2)');
    const tempFile = path.join(app.getPath('temp'), `temp_speech_${Date.now()}.mp3`);
    try {
      const edge = new EdgeTTS({ voice: 'ru-RU-DmitryNeural', lang: 'ru-RU', pitch: '-10Hz', rate: '+10%', timeout: 60000 });
      const cleanEdgeText = text.replace(/\+([а-яёА-ЯЁ])/g, '$1');
      await edge.ttsPromise(cleanEdgeText, tempFile);
      if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId)) return;
      await this.playAudio(tempFile, speakId, textHash);
    } finally {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { logger.error('Error deleting temp files', e); }
    }
  }

  private async speakWithSystemTTS(text: string, speakId?: number, textHash?: string): Promise<void> {
    if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId)) return;
    console.log('[TTS] Using provider: sapi');
    return new Promise((resolve, reject) => {
      const cleanText = text.replace(/\+([а-яёА-ЯЁ])/g, '$1').replace(/[|"]/g, ' ').replace(/'/g, '');
      const textFile = path.join(app.getPath('temp'), `temp_tts_system_${Date.now()}_${speakId ?? 0}.txt`);
      try {
        fs.writeFileSync(textFile, cleanText, 'utf8');
      } catch (writeErr) {
        return reject(writeErr);
      }
      const command = process.platform === 'win32'
        ? `powershell -Command "Add-Type -AssemblyName System.speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $ruVoices = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -match 'ru' }; if ($ruVoices) { $synth.SelectVoice($ruVoices[0].VoiceInfo.Name) } else { Write-Warning 'No Russian voice found' }; $text = [IO.File]::ReadAllText('${textFile.replace(/\\/g, '\\\\')}', [System.Text.Encoding]::UTF8); $synth.Speak($text)"`
        : process.platform === 'darwin' ? `say "$(cat '${textFile}')"` : `espeak "$(cat '${textFile}')"`;
      this.activeProcess = exec(command, (error) => {
        this.activeProcess = null;
        try { if (fs.existsSync(textFile)) fs.unlinkSync(textFile); } catch (_) {}
        if (textHash && !this.isCancelled && (speakId === undefined || speakId === this.activeSpeakId)) {
          this.lastSpokenHash = textHash;
          this.lastSpokenTimestamp = Date.now();
        }
        if (error) reject(error); else resolve();
      });
    });
  }

  private notifyWebStop(): void {
    try {
      BrowserWindow.getAllWindows().forEach((win: any) => {
        if (win && !win.isDestroyed?.() && !win.webContents?.isDestroyed?.()) win.webContents.send('voice:play-audio-stop');
      });
    } catch (err) { console.error(`Failed to send play-audio-stop to windows: ${(err as any)?.message || 'Unknown'}`); }
  }

  stop(triggerWebStop: boolean = true): void {
    logger.info('ARC TTS: Stop requested.');
    this.isCancelled = true;
    this.activeSpeakId++;
    if (this.activeAbortController) {
      try { this.activeAbortController.abort(); } catch (_) {}
      this.activeAbortController = null;
    }
    if (this.currentPlayAudioResolver) {
      const resolver = this.currentPlayAudioResolver;
      this.currentPlayAudioResolver = null;
      try { resolver(); } catch (_) { logger.error('Error in audio resolver', _); }
    }
    if (this.activeProcess) {
      try {
        logger.info(`ARC TTS: Killing active speech process [PID: ${this.activeProcess.pid}]`);
        if (process.platform === 'win32') exec(`taskkill /pid ${this.activeProcess.pid} /t /f`);
        else this.activeProcess.kill('SIGTERM');
      } catch (e) { console.error('Failed to kill active voice process:', e); }
      this.activeProcess = null;
    }
    if (triggerWebStop) this.notifyWebStop();
  }

  public async speakAndWait(text: string, timeoutMs: number = 5000): Promise<void> {
    let timer: NodeJS.Timeout | null = null;
    try { await Promise.race([this.speak(text), new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); })]); }
    catch (e: any) { logger.warn(`[TTS] speakAndWait error: ${e?.message || e}`); }
    finally { if (timer) clearTimeout(timer); }
  }

  private async speakWithSileroTTS(
    text: string, cacheKey: string, isSpeedTier: boolean, speaker: string,
    speed: number, pitch: number, sampleRate: number, putAccent: boolean,
    putYo: boolean, speakId: number, textHash: string, abortController: AbortController
  ): Promise<void> {
    console.log('[TTS] Using provider: silero');
    const tempFile = path.join(app.getPath('temp'), `temp_speech_${Date.now()}_${speakId}.wav`);
    const payload = { text, speaker: speaker || 'eugene', speed, pitch, sample_rate: sampleRate, put_accent: putAccent, put_yo: putYo };
    try {
      const response = await axios.post('http://127.0.0.1:8002/tts', payload, { responseType: 'arraybuffer', timeout: 60000, signal: abortController.signal });
      if (this.isCancelled || speakId !== this.activeSpeakId) {
        logger.info(`[TTS] Silero synthesis finished but request was cancelled (id: ${speakId}). Discarding.`);
        return;
      }
      if (response.headers['x-dsp-error']) {
        console.warn(`[TTS] DSP skipped: Python server returned X-DSP-Error: ${response.headers['x-dsp-error']}`);
        logger.warn(`[TTS] DSP skipped: Python server returned X-DSP-Error: ${response.headers['x-dsp-error']}`);
        const wins = BrowserWindow.getAllWindows().filter((w: any) => w && !w.isDestroyed?.() && !w.webContents?.isDestroyed?.());
        if (wins.length > 0) wins[0].webContents.send('app:toast', { message: `Голос: без обработки (ошибка: ${response.headers['x-dsp-error']})`, type: 'error' });
      }
      await fs.promises.writeFile(tempFile, Buffer.from(response.data));
      cacheService.put(cacheKey, tempFile, isSpeedTier);
      if (this.isCancelled || speakId !== this.activeSpeakId) return;
      await this.playAudio(tempFile, speakId, textHash);
    } catch (err: any) {
      if (axios.isCancel(err) || abortController.signal.aborted || this.isCancelled) {
        logger.info(`[TTS] Synthesis aborted for speak ID ${speakId}`);
        return;
      }
      throw err;
    } finally {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }
  }

  private async playAudio(filePath: string, speakId?: number, textHash?: string): Promise<void> {
    if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId)) {
      logger.info(`[TTS] Playback skipped: request ${speakId} cancelled.`);
      return;
    }
    if (!fs.existsSync(filePath)) throw new Error(`Audio file not found: ${filePath}`);
    if (textHash && !this.isCancelled && (speakId === undefined || speakId === this.activeSpeakId)) {
      this.lastSpokenHash = textHash;
      this.lastSpokenTimestamp = Date.now();
    }
    const wins = BrowserWindow.getAllWindows().filter((w: any) => w && !w.isDestroyed?.() && !w.webContents?.isDestroyed?.());
    if (wins.length === 0) return;
    if (speakId !== undefined) this.lastWebPlayedSpeakId = speakId;
    const base64Audio = fs.promises?.readFile ? await fs.promises.readFile(filePath, { encoding: 'base64' }) : fs.readFileSync(filePath, { encoding: 'base64' });
    return new Promise((resolve) => {
      const dataUri = `data:${filePath.endsWith('.mp3') ? 'audio/mp3' : 'audio/wav'};base64,${base64Audio}`;
      const cleanup = () => {
        if (this.currentPlayAudioResolver === done) this.currentPlayAudioResolver = null;
        ipcMain.removeListener('voice:play-audio-done', done);
      };
      const done = () => {
        clearTimeout(timeout);
        cleanup();
        if (textHash && !this.isCancelled && (speakId === undefined || speakId === this.activeSpeakId)) {
          this.lastSpokenHash = textHash;
          this.lastSpokenTimestamp = Date.now();
        }
        resolve();
      };
      this.currentPlayAudioResolver = done;
      const timeout = setTimeout(() => { cleanup(); resolve(); }, 30000);
      ipcMain.once('voice:play-audio-done', done);
      wins.forEach((win: any) => {
        if (win && !win.isDestroyed?.() && !win.webContents?.isDestroyed?.()) win.webContents.send('voice:play-audio', dataUri);
      });
    });
  }
}
export const ttsService = new TTSService();
