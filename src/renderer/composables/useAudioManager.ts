import { ref } from 'vue';
import { useUIStore } from '../stores/ui.store';
import { AudioStreamPlayer } from './audio-stream-player.util';

class AudioManager {
  private static instance: AudioManager;
  
  public audioContext: AudioContext | null = null;
  public activationMode = ref<'click' | 'voice'>('click');
  public isUnlocked = ref(false);
  
  private queue: { base64: string, priority: 'normal' | 'urgent', interrupt: boolean }[] = [];
  private ttsAudioElement: HTMLAudioElement | null = null;
  private ttsMediaSourceNode: MediaElementAudioSourceNode | null = null;
  private currentFallbackSource: AudioBufferSourceNode | null = null;
  private currentObjectUrl: string | null = null;
  private currentBlob: Blob | null = null;
  private streamPlayer = new AudioStreamPlayer();
  private isPlaying = false;
  private analyserNode: AnalyserNode | null = null;
  private visualizerWorkletNode: AudioWorkletNode | null = null;
  
  // Microphone tracking
  private sttMediaStream: MediaStream | null = null;
  private sttAudioContext: AudioContext | null = null;
  private micAnalyserNode: AnalyserNode | null = null;
  private micFrequencyDataArray: Uint8Array<ArrayBuffer> | null = null;

  public currentVolume = ref(0);

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  private releaseActiveAudioUrl() {
    if (this.currentObjectUrl) {
      try { URL.revokeObjectURL(this.currentObjectUrl); } catch (_) {}
      this.currentObjectUrl = null;
    }
    this.currentBlob = null;
  }

  public async initialize() {
    if (this.audioContext) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.35;
    this.analyserNode.connect(this.audioContext.destination);

    this.ttsAudioElement = new Audio();
    this.ttsAudioElement.preload = 'auto';
    this.ttsAudioElement.style.display = 'none';
    if (typeof document !== 'undefined') document.body.appendChild(this.ttsAudioElement);

    try {
      this.ttsMediaSourceNode = this.audioContext.createMediaElementSource(this.ttsAudioElement);
      this.ttsMediaSourceNode.connect(this.analyserNode);
    } catch (e) { console.warn("[AudioManager] Failed to bind persistent MediaElementSource:", e); }
    
    const VISUALIZER_WORKLET_CODE = [
      'class VisualizerWorklet extends AudioWorkletProcessor {',
      '  constructor() { super(); this._lastUpdate = currentTime; this._wasSilent = true; }',
      '  process(inputs) {',
      '    const input = inputs[0];',
      '    if (input && input.length > 0 && currentTime - this._lastUpdate > 0.05) {',
      '      this._lastUpdate = currentTime; const ch = input[0]; let sum = 0;',
      '      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];',
      '      const rms = Math.sqrt(sum / ch.length);',
      '      if (rms > 0.001) { this._wasSilent = false; this.port.postMessage({ volume: rms }); }',
      '      else if (!this._wasSilent) { this._wasSilent = true; this.port.postMessage({ volume: 0 }); }',
      '    }',
      '    return true;',
      '  }',
      '}',
      "registerProcessor('visualizer-worklet', VisualizerWorklet);"
    ].join('\n');

    try {
      if (this.audioContext.audioWorklet) {
        let blob: Blob | null = new Blob([VISUALIZER_WORKLET_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try { await this.audioContext.audioWorklet.addModule(blobUrl); } finally { URL.revokeObjectURL(blobUrl); blob = null; }
        this.visualizerWorkletNode = new AudioWorkletNode(this.audioContext, 'visualizer-worklet');
        this.visualizerWorkletNode.port.onmessage = (event) => { this.currentVolume.value = event.data.volume; };
        if (this.ttsMediaSourceNode) this.ttsMediaSourceNode.connect(this.visualizerWorkletNode);
      }
    } catch (e) { console.warn("Failed to load Visualizer AudioWorklet", e); }
    
    if (this.audioContext.state === 'suspended') {
      this.isUnlocked.value = false;
      this.attachGestureUnlock();
    } else {
      this.isUnlocked.value = true;
    }
    (window as any).sysAudioAnalyser = this.analyserNode;
    (window as any).sysAudioCtx = this.audioContext;
    (window as any).audioManager = this;
  }

  private attachGestureUnlock() {
    if (typeof window === 'undefined') return;
    const unlockHandler = () => { this.resume(); };
    window.addEventListener('pointerdown', unlockHandler, { once: true, passive: true });
    window.addEventListener('keydown', unlockHandler, { once: true, passive: true });
    window.addEventListener('touchstart', unlockHandler, { once: true, passive: true });
  }

  public async resume() {
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume().catch(() => {});
    if (this.sttAudioContext?.state === 'suspended') await this.sttAudioContext.resume().catch(() => {});
    this.isUnlocked.value = (this.audioContext?.state === 'running');
  }

  private notifyStreamFinished = () => {
    this.isPlaying = false;
    this.currentVolume.value = 0;
    const uiStore = useUIStore();
    uiStore.setSoftPaused(false);
    if (uiStore.reactorState === 'speaking') uiStore.setReactorState('idle');
    if ((window as any).api?.audioDone) (window as any).api.audioDone();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arc:tts-finish'));
  };

  public async startStream(sampleRate = 22050) {
    if (!this.audioContext) await this.initialize();
    if (this.audioContext?.state === 'suspended') this.audioContext.resume().catch(() => {});
    this.stopAll(true);
    this.streamPlayer.startStream(sampleRate);
  }

  private emitTtsStart() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('arc:tts-start'));
  }

  public async playStreamChunk(chunk: Uint8Array | ArrayBuffer) {
    if (!this.audioContext) await this.initialize();
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
    this.streamPlayer.feedChunk(
      chunk, this.audioContext, this.analyserNode, this.visualizerWorkletNode,
      () => { this.isPlaying = true; useUIStore().setSoftPaused(true); this.emitTtsStart(); },
      this.notifyStreamFinished
    );
  }

  public endStream() { this.streamPlayer.markStreamEnd(this.notifyStreamFinished); }

  public async playTTS(dataUri: string, options: { priority: 'normal' | 'urgent', interrupt: boolean } = { priority: 'normal', interrupt: true }) {
    if (!this.audioContext) await this.initialize();
    if (this.audioContext?.state === 'suspended') this.audioContext.resume().catch(() => {});
    if (options.interrupt) {
      this.stopAll(true);
      this.queue = [{ base64: dataUri, ...options }];
    } else {
      this.queue.push({ base64: dataUri, ...options });
      if (this.queue.length > 5) this.queue.shift();
    }
    this.processQueue();
  }

  private processQueue() {
    if (this.isPlaying || this.queue.length === 0) return;
    const next = this.queue.shift();
    if (next) this.playAudioElement(next.base64);
  }

  private playAudioElement(dataUri: string) {
    if (this.audioContext?.state === 'suspended') this.audioContext.resume().catch(() => {});
    if (!this.ttsAudioElement) {
      this.ttsAudioElement = new Audio();
      this.ttsAudioElement.style.display = 'none';
      if (typeof document !== 'undefined') document.body.appendChild(this.ttsAudioElement);
      if (this.audioContext && this.analyserNode && !this.ttsMediaSourceNode) {
        try {
          this.ttsMediaSourceNode = this.audioContext.createMediaElementSource(this.ttsAudioElement);
          this.ttsMediaSourceNode.connect(this.analyserNode);
        } catch (e) { console.warn("[AudioManager] MediaElementSource lazy bind failed:", e); }
      }
    }
    this.releaseActiveAudioUrl();
    if (dataUri.startsWith('blob:')) this.currentObjectUrl = dataUri;

    const audio = this.ttsAudioElement;
    if (!audio.paused) audio.pause();
    audio.currentTime = 0;
    audio.src = dataUri;
    this.isPlaying = true;
    console.log(`[TTS] Playing via: persistent-element`);
    this.emitTtsStart();

    const onPlaybackDone = () => {
      this.releaseActiveAudioUrl();
      this.isPlaying = false;
      this.currentVolume.value = 0;
      const uiStore = useUIStore();
      uiStore.setSoftPaused(false);
      if ((window as any).api?.audioDone) (window as any).api.audioDone();
      if (this.queue.length === 0) {
        if (uiStore.reactorState === 'speaking') uiStore.setReactorState('idle');
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arc:tts-finish'));
      }
      audio.onended = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      this.processQueue();
    };

    audio.onended = onPlaybackDone;
    audio.onerror = (e) => {
      console.error("[AudioManager] HTMLAudioElement playback error, trying buffer fallback:", e);
      audio.onended = null; audio.onerror = null;
      this.playAudioFallback(dataUri);
    };

    audio.play().catch((err) => {
      if (!this.isPlaying && err?.name === 'AbortError') return;
      console.warn("[AudioManager] HTMLAudioElement play() rejected, invoking fallback:", err);
      audio.onended = null; audio.onerror = null;
      this.playAudioFallback(dataUri);
    });
  }

  private async playAudioFallback(dataUri: string) {
    if (!this.audioContext) return;
    const finishFallback = () => {
      this.releaseActiveAudioUrl();
      this.currentFallbackSource = null;
      this.isPlaying = false;
      this.currentVolume.value = 0;
      const uiStore = useUIStore();
      uiStore.setSoftPaused(false);
      if ((window as any).api?.audioDone) (window as any).api.audioDone();
      if (this.queue.length === 0) {
        if (uiStore.reactorState === 'speaking') uiStore.setReactorState('idle');
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arc:tts-finish'));
      }
      this.processQueue();
    };
    try {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume().catch(() => {});
      let arrayBuffer: ArrayBuffer;
      if (dataUri.startsWith('data:')) {
        const bin = atob(dataUri.split(',')[1] || '');
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        arrayBuffer = bytes.buffer;
      } else {
        arrayBuffer = await (await fetch(dataUri)).arrayBuffer();
      }
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      this.currentFallbackSource = source;
      this.isPlaying = true;
      console.log(`[TTS] Playing via: fallback-audio (BufferSource)`);
      this.emitTtsStart();
      if (this.visualizerWorkletNode) source.connect(this.visualizerWorkletNode);
      if (this.analyserNode) source.connect(this.analyserNode);
      else source.connect(this.audioContext.destination);
      source.onended = () => {
        try { source.disconnect(); source.buffer = null; } catch (_) {}
        finishFallback();
      };
      source.start();
    } catch (e) {
      console.error("[AudioManager] Audio fallback failed:", e);
      finishFallback();
    }
  }

  public stopAll(isInterrupting = false) {
    const wasPlaying = this.isPlaying || this.streamPlayer.isPlaying() || Boolean(this.currentFallbackSource) || Boolean(this.ttsAudioElement && !this.ttsAudioElement.paused);
    this.queue = [];
    this.isPlaying = false;
    this.streamPlayer.stop();
    this.releaseActiveAudioUrl();
    if (this.ttsAudioElement) {
      this.ttsAudioElement.onended = null;
      this.ttsAudioElement.onerror = null;
      if (!this.ttsAudioElement.paused) this.ttsAudioElement.pause();
      this.ttsAudioElement.currentTime = 0;
      if (!isInterrupting) this.ttsAudioElement.removeAttribute('src');
    }
    if (this.currentFallbackSource) {
      try {
        this.currentFallbackSource.onended = null;
        this.currentFallbackSource.stop();
        this.currentFallbackSource.disconnect();
        this.currentFallbackSource.buffer = null;
      } catch (_) {}
      this.currentFallbackSource = null;
    }
    this.currentVolume.value = 0;
    const uiStore = useUIStore();
    uiStore.setSoftPaused(false);
    if (!isInterrupting && uiStore.reactorState === 'speaking') uiStore.setReactorState('idle');
    if (!isInterrupting && wasPlaying && (window as any).api?.audioDone) {
      try { (window as any).api.audioDone(); } catch (_) { console.error('AudioContext error', _); }
    }
  }

  public isTtsPlaying(): boolean {
    if (this.isPlaying || this.streamPlayer.isPlaying()) return true;
    if (this.ttsAudioElement && !this.ttsAudioElement.paused && !this.ttsAudioElement.ended && this.ttsAudioElement.currentTime > 0) return true;
    return Boolean(this.currentFallbackSource);
  }

  public getVisualizerData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }
  
  public registerSttResources(stream: MediaStream, ctx: AudioContext, existingAnalyser?: AnalyserNode) {
     this.sttMediaStream = stream;
     this.sttAudioContext = ctx;
     try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        if (existingAnalyser) {
           this.micAnalyserNode = existingAnalyser;
        } else {
           const micSource = ctx.createMediaStreamSource(stream);
           this.micAnalyserNode = ctx.createAnalyser();
           this.micAnalyserNode.fftSize = 256;
           micSource.connect(this.micAnalyserNode);
           const muteGain = ctx.createGain();
           muteGain.gain.value = 0;
           this.micAnalyserNode.connect(muteGain);
           muteGain.connect(ctx.destination);
        }
        this.micAnalyserNode.smoothingTimeConstant = 0.4;
        this.micAnalyserNode.minDecibels = -85;
        this.micAnalyserNode.maxDecibels = -20;
     } catch (err) { console.warn('[AudioManager] Failed to bind mic analyser:', err); }
  }
  
  public stopMicrophone() {
     this.micAnalyserNode = null;
     this.micFrequencyDataArray = null;
     if (this.sttMediaStream) {
        try { this.sttMediaStream.getTracks().forEach(track => track.stop()); } catch (_) {}
        this.sttMediaStream = null;
     }
     if (this.sttAudioContext) {
        try {
           const ctx = this.sttAudioContext;
           if (!(ctx as any).__arcClosed && ctx.state !== 'closed') {
              (ctx as any).__arcClosed = true;
              try { const p = ctx.close(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch (_) {}
           }
        } catch (_) {}
        this.sttAudioContext = null;
     }
  }

  private frequencyDataArray: Uint8Array<ArrayBuffer> | null = null;
  private reusableBandsTts = { bass: 0, mid: 0, treble: 0, total: 0 }; private reusableBandsMic = { bass: 0, mid: 0, treble: 0, total: 0 };

  public getFrequencyBands(mode: 'tts' | 'mic' = 'tts'): { bass: number; mid: number; treble: number; total: number } {
    const targetAnalyser = mode === 'mic' ? this.micAnalyserNode : this.analyserNode;
    const result = mode === 'mic' ? this.reusableBandsMic : this.reusableBandsTts;
    if (!targetAnalyser) { result.bass = 0; result.mid = 0; result.treble = 0; result.total = 0; return result; }
    const binCount = targetAnalyser.frequencyBinCount;
    let targetArray = mode === 'mic' ? this.micFrequencyDataArray : this.frequencyDataArray;
    if (!targetArray || targetArray.length !== binCount) {
      targetArray = new Uint8Array(binCount);
      if (mode === 'mic') this.micFrequencyDataArray = targetArray; else this.frequencyDataArray = targetArray;
    }
    targetAnalyser.getByteFrequencyData(targetArray);
    const totalBins = targetArray.length;
    const sumBins = (start: number, end: number) => {
      let sum = 0;
      for (let i = start; i < end; i++) sum += targetArray[i];
      return end > start ? sum / (end - start) / 255.0 : 0;
    };
    if (mode === 'mic') {
      const boost = (v: number) => (v > 0.025 ? Math.min(1.0, (v - 0.025) * 2.6) : 0);
      result.bass = boost(sumBins(1, Math.min(7, totalBins))); result.mid = boost(sumBins(7, Math.min(28, totalBins)));
      result.treble = boost(sumBins(28, Math.min(64, totalBins))); result.total = boost(sumBins(1, Math.min(48, totalBins)));
      return result;
    }
    const bEnd = Math.min(8, totalBins), mEnd = Math.min(36, totalBins), tEnd = Math.min(64, totalBins);
    result.bass = sumBins(0, bEnd); result.mid = sumBins(bEnd, mEnd);
    result.treble = sumBins(mEnd, tEnd); result.total = sumBins(0, totalBins);
    return result;
  }

  public getAudioContextState(): string { return this.audioContext?.state || 'none'; }
}

export const audioManager = AudioManager.getInstance();
export function useAudioManager() { return audioManager; }