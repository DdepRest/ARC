import { logger } from '../utils/logger';
import { app, BrowserWindow, ipcMain } from 'electron';
import axios from 'axios';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import { adaptiveService } from './adaptive.service';
import { cacheService } from './cache.service';
import { computeTtsHash, formatTextForSpeech } from './tts-text.util';
import { pollPythonTtsReady, synthesizeEdgeTtsFile, synthesizeSileroTtsFile } from './tts-engines.util';
import { runSystemTtsProcess, terminateChildProcessTree } from './system-tts.util';
import {
  applyTtsPolicyPatch, loadTtsPolicy, resolveTtsExecutionPlan, resolveTtsFallbackPolicy, saveTtsPolicy,
  type TtsActiveEngine, type TtsEngineState, type TtsExecutionStep, type TtsPolicyConfig, type TtsPolicyPatch, type TtsProviderSetting,
} from './tts-policy.util';

export type { TtsProviderSetting, TtsActiveEngine, TtsPolicyPatch, TtsEngineState };
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
  private policy: TtsPolicyConfig = loadTtsPolicy();
  private lastActiveEngine: TtsActiveEngine | null = null;
  private lastErrorReason: string | null = null;
  private lastTtsMeta: TtsMetaPayload | null = null;

  public getPolicy(): TtsPolicyConfig {
    return { ...this.policy };
  }
  public getActiveEngine(): TtsEngineState {
    return {
      provider: this.policy.provider,
      activeEngine: this.lastActiveEngine,
      allowCloudTtsFallback: this.policy.allowCloudTtsFallback,
      forcedOfflineMode: this.policy.forcedOfflineMode,
      fallbackPolicy: resolveTtsFallbackPolicy(this.policy),
      lastErrorReason: this.lastErrorReason,
    };
  }
  public getLastTtsMeta(): TtsMetaPayload | null { return this.lastTtsMeta; }
  public isBusy(): boolean { return Boolean(this.activeAbortController); }
  public setProvider(p: TtsProviderSetting | string): void {
    this.setPolicy({ provider: String(p) });
  }
  public setPolicy(patch: TtsPolicyPatch): TtsEngineState {
    const res = applyTtsPolicyPatch(this.policy, patch, this.lastActiveEngine, this.lastErrorReason);
    this.policy = res.policy;
    this.lastActiveEngine = res.activeEngine;
    this.lastErrorReason = res.lastErrorReason;
    saveTtsPolicy(this.policy);
    console.log(`[TTS] policy updated: provider=${this.policy.provider}, cloudFallback=${this.policy.allowCloudTtsFallback}, offline=${this.policy.forcedOfflineMode}`);
    this.broadcastEngineState();
    return this.getActiveEngine();
  }
  private setActiveEngine(engine: TtsActiveEngine, errorReason: string | null = null): void {
    this.lastActiveEngine = engine;
    this.lastErrorReason = errorReason;
    console.log(`[TTS] engine active: ${engine} (provider=${this.policy.provider})`);
    this.broadcastEngineState();
  }
  private broadcastEngineState(): void {
    const payload = this.getActiveEngine();
    try { BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('tts:engine-changed', payload); }); } catch {}
  }
  private broadcastTtsMeta(engine: 'silero' | 'edge' | 'sapi', isCached: boolean, queryId?: string, textHash?: string): void {
    const payload: TtsMetaPayload = { engine, isCached, queryId, textHash };
    this.lastTtsMeta = payload;
    try { BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('tts:meta', payload); }); } catch {}
  }
  public notifySileroOnline(): void {
    this.isServerKnownReady = true;
    if ((this.policy.provider === 'auto' || this.policy.provider === 'silero') && (!this.lastActiveEngine || this.lastActiveEngine === 'unavailable')) {
      this.lastActiveEngine = 'silero';
      this.lastErrorReason = null;
      this.broadcastEngineState();
    }
  }
  public computeHash(text: string, queryId?: string): string { return computeTtsHash(text, queryId); }

  private async waitForPythonServer(timeout: number): Promise<boolean> {
    return pollPythonTtsReady(timeout, (ready) => { this.isServerKnownReady = ready; }, this.isServerKnownReady);
  }

  private async runFallbackSteps(
    steps: TtsExecutionStep[], formattedText: string, cacheKey: string, isSpeedTier: boolean,
    currentSpeakId: number, textHash: string, queryId: string | undefined,
    initialReason: string, cloudBlockedReason: string | null, signal: AbortSignal
  ): Promise<void> {
    let lastFailure = initialReason;
    for (const step of steps) {
      if (this.isCancelled || currentSpeakId !== this.activeSpeakId || signal.aborted) return;
      if (step === 'edge') {
        if (this.policy.forcedOfflineMode || (this.policy.provider !== 'edge' && !this.policy.allowCloudTtsFallback)) continue;
        try {
          this.setActiveEngine('edge');
          this.broadcastTtsMeta('edge', false, queryId, textHash);
          await this.speakWithEdgeTTS(formattedText, cacheKey, isSpeedTier, currentSpeakId, textHash);
          return;
        } catch (edgeErr: any) {
          if (this.isCancelled || currentSpeakId !== this.activeSpeakId || signal.aborted) return;
          lastFailure = `Edge TTS недоступен: ${edgeErr?.code || 'ERR'} ${edgeErr?.message || 'Unknown'}`;
          console.warn(`[TTS] Edge TTS failed, falling back to System SAPI... [${edgeErr?.code || 'ERR'} ${edgeErr?.message || 'Unknown'}]`);
          logger.warn('[TTS] DSP skipped: Edge TTS failure, falling back to System SAPI');
        }
      } else if (step === 'system') {
        try {
          const note = this.policy.provider === 'edge' && this.policy.forcedOfflineMode ? cloudBlockedReason : null;
          this.setActiveEngine('system', note);
          this.broadcastTtsMeta('sapi', false, queryId, textHash);
          await this.speakWithSystemTTS(formattedText, currentSpeakId, textHash, signal);
          return;
        } catch (sysErr: any) {
          if (this.isCancelled || currentSpeakId !== this.activeSpeakId || signal.aborted) return;
          const sysDetail = `SAPI недоступен: ${sysErr?.code || 'ERR'} ${sysErr?.message || 'Unknown'}`;
          lastFailure = cloudBlockedReason ? `${initialReason}; ${sysDetail}; ${cloudBlockedReason}` : `${initialReason}; ${sysDetail}`;
          console.error(`All TTS engines failed: [${sysErr?.code || 'ERR'} ${sysErr?.message || 'Unknown'}]`);
        }
      }
    }
    if (!this.isCancelled && currentSpeakId === this.activeSpeakId && !signal.aborted) {
      this.setActiveEngine('unavailable', lastFailure);
    }
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
    const plan = resolveTtsExecutionPlan(this.policy);

    try {
      if (plan.steps[0] !== 'silero') {
        if (this.policy.provider === 'edge' && this.policy.forcedOfflineMode) {
          console.warn(`[TTS] ${plan.cloudBlockedReason}; using local System SAPI.`);
          logger.warn(`[TTS] ${plan.cloudBlockedReason}; using local System SAPI.`);
        }
        await this.runFallbackSteps(plan.steps, formattedText, '', false, currentSpeakId, textHash, queryId, plan.cloudBlockedReason || 'System SAPI unavailable', plan.cloudBlockedReason, abortController.signal);
        return;
      }

      const waitTimeout = this.isServerKnownReady ? 15000 : 35000;
      const isReady = this.isServerKnownReady ? true : await this.waitForPythonServer(waitTimeout);
      if (this.isCancelled || currentSpeakId !== this.activeSpeakId || abortController.signal.aborted) {
        logger.info(`[TTS] Speak request ${currentSpeakId} cancelled during server readiness check`);
        return;
      }
      if (!isReady) {
        const offlineMsg = plan.cloudAllowed
          ? `[TTS] Python server not ready after ${waitTimeout / 1000}s, falling back to Edge/SAPI`
          : `[TTS] Python server not ready after ${waitTimeout / 1000}s; cloud Edge skipped (${plan.cloudBlockedReason}), falling back to System SAPI`;
        console.warn(offlineMsg);
        logger.warn('[TTS] DSP skipped: Python server offline/not ready');
        await this.runFallbackSteps(plan.steps.slice(1), formattedText, '', false, currentSpeakId, textHash, queryId, `Silero сервер недоступен (${waitTimeout / 1000}s)`, plan.cloudBlockedReason, abortController.signal);
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
        const errMsg = `Silero TTS ошибка: ${error?.code || 'ERR'} ${error?.message || 'Unknown'}`;
        const logMsg = plan.cloudAllowed
          ? `[TTS] Silero TTS failed, falling back to Edge TTS... [${error.code || 'ERR'} ${error.message || 'Unknown'}]`
          : `[TTS] Silero TTS failed (${error.message || 'unknown'}); cloud Edge disabled (${plan.cloudBlockedReason}), falling back to System SAPI`;
        console.warn(logMsg);
        logger.warn(logMsg);
        await this.runFallbackSteps(plan.steps.slice(1), formattedText, cacheKey, isSpeedTier, currentSpeakId, textHash, queryId, errMsg, plan.cloudBlockedReason, abortController.signal);
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
    if (this.policy.forcedOfflineMode || (this.policy.provider !== 'edge' && !this.policy.allowCloudTtsFallback)) {
      throw new Error('Cloud Edge TTS blocked by policy');
    }
    if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId)) return;
    console.log('[TTS] Using provider: edge');
    console.warn('[TTS] DSP skipped: Edge TTS provider active (bypasses Silero DSP v2)');
    logger.warn('[TTS] DSP skipped: Edge TTS provider active (bypasses Silero DSP v2)');
    let tempFile: string | null = null;
    try {
      tempFile = await synthesizeEdgeTtsFile(text);
      if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId)) return;
      await this.playAudio(tempFile, speakId, textHash);
    } finally {
      try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { logger.error('Error deleting temp files', e); }
    }
  }

  private async speakWithSystemTTS(
    text: string,
    speakId?: number,
    textHash?: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId) || abortSignal?.aborted) return;
    console.log('[TTS] Using provider: sapi');
    await runSystemTtsProcess({
      text,
      tempDir: app.getPath('temp'),
      speakId,
      abortSignal,
      isStale: () => this.isCancelled || (speakId !== undefined && speakId !== this.activeSpeakId),
      onProcessStarted: (child) => { this.activeProcess = child; },
      onProcessCleared: (child) => { if (this.activeProcess === child) this.activeProcess = null; },
    });
    if (textHash && !this.isCancelled && !abortSignal?.aborted && (speakId === undefined || speakId === this.activeSpeakId)) {
      this.lastSpokenHash = textHash;
      this.lastSpokenTimestamp = Date.now();
    }
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
      const proc = this.activeProcess;
      this.activeProcess = null;
      try {
        logger.info(`ARC TTS: Killing active speech process [PID: ${proc.pid}]`);
        terminateChildProcessTree(proc);
      } catch (e) { console.error('Failed to kill active voice process:', e); }
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
    const tempFile = await synthesizeSileroTtsFile({
      text, cacheKey, isSpeedTier, speaker, speed, pitch, sampleRate, putAccent, putYo, speakId, abortController,
      isStale: () => this.isCancelled || speakId !== this.activeSpeakId,
    });
    if (!tempFile) return;
    try {
      if (this.isCancelled || speakId !== this.activeSpeakId) return;
      await this.playAudio(tempFile, speakId, textHash);
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
