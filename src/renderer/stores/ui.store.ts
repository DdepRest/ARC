import { defineStore } from 'pinia';
import type { ReactorState, TabName } from '../../shared/types/ui';
import { useSettingsStore } from '../features/settings/stores/settings.store';

export interface ToastNotification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

const loadSavedMusicVolume = (): number => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_vk_volume') : null;
    if (raw !== null) {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
  } catch (_) {}
  return 0.5;
};

let speakingWatchdog: ReturnType<typeof setTimeout> | null = null;
let ttsFinishBound = false;

export const useUIStore = defineStore('ui', {
  state: () => ({
    activeTab: 'core' as TabName,
    reactorState: 'idle' as ReactorState,
    isListening: false,
    isSoftPaused: false,
    hoveredModule: null as string | null,
    pulseTrigger: 0,
    toasts: [] as ToastNotification[],
    sttLoadingProgress: null as number | null,
    sttLoadingModel: null as string | null,
    sttErrorText: null as string | null,
    rollbackProgress: null as { current: number; total: number; text: string } | null,
    musicState: 'stopped' as 'playing' | 'paused' | 'stopped',
    musicTitle: '' as string,
    musicVolume: loadSavedMusicVolume() as number,
    vkActive: false as boolean,
    vkConnectedClientsCount: 0 as number,
    vkServerPort: null as number | null,
    vkServerError: null as string | null,
    vkServerRunning: false as boolean,
    musicCurrentTime: 0 as number,
    musicDuration: 0 as number,
    musicCover: '' as string,
    modelTelemetry: null as any,
    modelLoadingStatus: null as { modelName: string; status: 'loading' | 'ready' | 'error' } | null,
    musicNextTrack: '' as string,
    musicLyrics: '' as string,
    musicShuffled: false as boolean,
    musicRepeated: 'off' as 'off' | 'track' | 'playlist' | boolean,
    musicLiked: false as boolean,
    musicManualState: null as 'playing' | 'paused' | null,
    musicLikedOverride: null as boolean | null,
    musicVolumeOverride: null as number | null,
    musicLastVkRawVolume: null as number | null,
    musicLastSeekTime: 0 as number,
    musicLastLocalCommandAt: 0 as number,
    musicLastVolumeCommandAt: 0 as number,
    
    // Assistant Execution Timeline & Routing State
    timelineStep: null as 'VOICE_INPUT' | 'CLASSIFIER' | 'ROUTER' | 'TOOL_API' | 'RESPONSE' | 'TTS' | null,
    timelineLatency: 0 as number,
    activeModel: 'Qwen 2.5 7B Local' as string,
    activeRoute: null as { target: 'local' | 'cloud'; cause: string; hasError?: boolean; errorBadge?: string; errorNode?: 'cloud' | 'local'; lastRouterError?: string } | null,
    lastRouterError: null as string | null,
    lastSpokenResponse: '' as string,
    lastSpokenTime: 0 as number,

    // Voice Dialogue Countdown (10s continuous interaction window)
    conversationCountdown: 0 as number,

    // High Compute Load (caps 3D scene FPS to 20 during heavy downloads/local LLM inference)
    isHighComputeLoad: false as boolean,

    // Performance Profiler Diagnostics
    profilerStats: {
      fps: 60,
      frameTime: 16.6,
      drawCalls: 12,
      particleCount: 1200,
      dpr: 1.0,
      cpuLoad: 18,
      ramLoad: 34,
      gpuLoad: 22,
      threeUpdateTime: 2.1,
      vueRenderTime: 1.4
    }
  }),
  actions: {
    showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 4500) {
      const existing = this.toasts.find(t => t.message === message && t.type === type);
      if (existing) return existing.id;
      const id = Math.random().toString(36).substring(2, 9);
      this.toasts.push({ id, message, type, duration });
      setTimeout(() => this.removeToast(id), duration);
      return id;
    },
    removeToast(id: string) {
      this.toasts = this.toasts.filter(t => t.id !== id);
    },
    setTimelineStep(step: 'VOICE_INPUT' | 'CLASSIFIER' | 'ROUTER' | 'TOOL_API' | 'RESPONSE' | 'TTS' | null, latency: number = 0) {
      this.timelineStep = step;
      if (latency > 0) this.timelineLatency = latency;
    },
    setActiveModel(model: string) { this.activeModel = model; },
    setActiveRoute(route: { target: 'local' | 'cloud'; cause: string; hasError?: boolean; errorBadge?: string; errorNode?: 'cloud' | 'local'; lastRouterError?: string } | null) {
      this.activeRoute = route;
      if (route?.lastRouterError) this.lastRouterError = route.lastRouterError;
    },
    setLastRouterError(err: string | null) { this.lastRouterError = err; },
    setConversationCountdown(seconds: number) { this.conversationCountdown = Math.max(0, seconds); },
    setHighComputeLoad(value: boolean) { this.isHighComputeLoad = value; },
    updateProfilerStats(stats: Partial<typeof this.profilerStats>) {
      this.profilerStats = { ...this.profilerStats, ...stats };
    },
    setMusicTime(current: number, duration: number) {
      this.musicCurrentTime = current;
      this.musicDuration = duration;
    },
    tickMusicTime() {
      if (this.musicState !== 'playing' || this.musicDuration <= 0) return;
      if (this.musicCurrentTime < this.musicDuration) {
        this.musicCurrentTime = Math.min(this.musicDuration, Math.floor(this.musicCurrentTime) + 1);
      } else if (this.musicRepeated === 'track') {
        this.musicCurrentTime = 0;
      }
    },
    setMusicCover(url: string) { this.musicCover = url; },
    setMusicNextTrack(track: string) { this.musicNextTrack = track; },
    setMusicLyrics(lyrics: string) { this.musicLyrics = lyrics; },
    setVkActive(active: boolean) { this.vkActive = active; },
    setVkConnectionStatus(status: { connectedClientsCount: number; serverPort: number | null; serverError: string | null; serverRunning: boolean }) {
      this.vkConnectedClientsCount = status.connectedClientsCount;
      this.vkServerPort = status.serverPort;
      this.vkServerError = status.serverError;
      this.vkServerRunning = status.serverRunning;
      this.vkActive = status.connectedClientsCount > 0;
    },
    setMusicState(state: 'playing' | 'paused' | 'stopped') {
      this.musicState = state;
      this.musicManualState = state === 'stopped' ? null : state;
      if (state !== 'stopped') {
        this.musicLastLocalCommandAt = Date.now();
      }
    },
    setMusicTitle(title: string) { this.musicTitle = title; },
    setMusicVolume(volume: number) {
      const clamped = Math.min(1, Math.max(0, volume));
      this.musicVolume = clamped;
      this.musicVolumeOverride = clamped;
      this.musicLastVolumeCommandAt = Date.now();
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('arc_vk_volume', String(clamped));
      } catch (_) {}
    },
    setMusicShuffled(val: boolean) { this.musicShuffled = val; },
    setMusicRepeated(val: 'off' | 'track' | 'playlist' | boolean) {
      if (val === true) this.musicRepeated = 'track';
      else if (val === false) this.musicRepeated = 'off';
      else this.musicRepeated = val;
    },
    setMusicLiked(val: boolean) {
      this.musicLiked = val;
      this.musicLikedOverride = val;
      this.musicLastLocalCommandAt = Date.now();
    },
    applyVkStatus(data: any) {
      if (!data || data.closed) {
        this.musicState = 'stopped';
        this.musicManualState = null;
        this.musicLikedOverride = null;
        this.musicVolumeOverride = null;
        this.musicLastVkRawVolume = null;
        this.musicTitle = '';
        this.musicCurrentTime = 0;
        this.musicDuration = 0;
        return;
      }

      const nextTitle = data.title || 'ВКонтакте';
      const isTrackChanged = Boolean(data.title && nextTitle !== this.musicTitle);
      const hasValidTrack = Boolean(data.title && nextTitle !== 'ВКонтакте');
      const isLocalCmdCooldown = Date.now() - this.musicLastLocalCommandAt <= 2000;
      const isVolumeCooldown = Date.now() - this.musicLastVolumeCommandAt <= 2500;

      this.musicTitle = nextTitle;

      if (isTrackChanged) {
        this.musicLikedOverride = null;
        this.musicCurrentTime = typeof data.currentTime === 'number' && data.currentTime > 0 ? data.currentTime : 0;
        if (hasValidTrack && data.playing !== false && this.musicManualState !== 'paused') {
          this.musicState = 'playing';
          this.musicManualState = 'playing';
        }
      } else if (hasValidTrack && this.musicManualState === null && data.playing !== false) {
        this.musicState = 'playing';
        this.musicManualState = 'playing';
      }

      if (typeof data.duration === 'number' && data.duration > 0) {
        this.musicDuration = data.duration;
      }

      const rawTime = typeof data.currentTime === 'number' ? data.currentTime : 0;
      const resolvedTime = rawTime < 0 && this.musicDuration > 0
        ? Math.max(0, this.musicDuration + rawTime)
        : rawTime;

      const seekCooldownActive = Date.now() - this.musicLastSeekTime < 2500;
      if (!seekCooldownActive) {
        if (resolvedTime > 0) {
          this.musicCurrentTime = resolvedTime;
        } else if (isTrackChanged && resolvedTime === 0) {
          this.musicCurrentTime = 0;
        }
      }

      if (data.playing === true) {
        if (!isLocalCmdCooldown || this.musicManualState !== 'paused') {
          this.musicState = 'playing';
          this.musicManualState = 'playing';
        }
      } else if (data.playing === false) {
        if (!isLocalCmdCooldown || this.musicManualState === 'paused') {
          this.musicState = 'paused';
          this.musicManualState = 'paused';
        } else if (this.musicManualState === null && !hasValidTrack) {
          this.musicState = 'paused';
        }
      }

      if (data.cover !== undefined) this.musicCover = data.cover;
      if (data.nextTrack !== undefined) this.musicNextTrack = data.nextTrack;
      if (data.lyrics !== undefined) this.musicLyrics = data.lyrics;
      if (data.shuffled !== undefined) this.musicShuffled = data.shuffled;
      if (data.repeated !== undefined) this.setMusicRepeated(data.repeated);
      if (data.liked !== undefined && (!isLocalCmdCooldown || this.musicLikedOverride === null)) {
        this.musicLiked = data.liked;
        this.musicLikedOverride = null;
      }
      if (typeof data.volume === 'number') {
        const incomingVol = Math.min(1, Math.max(0, data.volume));
        const prevRaw = this.musicLastVkRawVolume;
        this.musicLastVkRawVolume = incomingVol;
        const isInitialReal = prevRaw === null && incomingVol < 1;
        const isBogusJumpToMax = incomingVol === 1 && (isTrackChanged || prevRaw === null || prevRaw < 0.75);
        const isVkSideChange = prevRaw !== null && Math.abs(incomingVol - prevRaw) >= 0.01 && !isBogusJumpToMax;
        if (!isVolumeCooldown && (isInitialReal || isVkSideChange)) {
          this.musicVolume = incomingVol;
          this.musicVolumeOverride = incomingVol;
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('arc_vk_volume', String(incomingVol));
          } catch (_) {}
        }
      }
    },
    setActiveTab(tab: TabName) {
      if (tab === 'settings' && typeof window !== 'undefined') (window as any).__arcSettingsOpenStart = performance.now();
      this.activeTab = tab;
    },
    setReactorState(state: ReactorState) {
      if (speakingWatchdog) { clearTimeout(speakingWatchdog); speakingWatchdog = null; }
      if (!ttsFinishBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        ttsFinishBound = true;
        const resetIfSpeaking = () => { if (this.reactorState === 'speaking') this.setReactorState('idle'); };
        window.addEventListener('arc:tts-finish', resetIfSpeaking);
        window.addEventListener('arc:stop-audio', resetIfSpeaking);
      }
      this.reactorState = state;
      if (state === 'speaking') {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('arc:tts-start'));
        speakingWatchdog = setTimeout(() => { if (this.reactorState === 'speaking') this.setReactorState('idle'); }, 30000);
      } else if (state === 'idle') {
        this.timelineStep = null; this.activeRoute = null; this.activeModel = '';
      }
    },
    setListening(value: boolean) { this.isListening = value; },
    setSoftPaused(value: boolean) { this.isSoftPaused = value; },
    setHoveredModule(moduleName: string | null) { this.hoveredModule = moduleName; },
    triggerPulse() { this.pulseTrigger++; },
    setSttError(error: string | null) { this.sttErrorText = error; },
    setSttLoading(progress: number | null, model: string | null = null) {
      this.sttLoadingProgress = progress;
      this.sttLoadingModel = model;
      if (progress !== null) this.sttErrorText = null;
      if (progress !== null && progress < 100) {
        this.setReactorState('loading_whisper');
      } else if (progress === 100 || progress === null) {
        this.sttLoadingProgress = null;
        this.sttLoadingModel = null;
        if (this.reactorState === 'loading_whisper') this.setReactorState('idle');
      }
    },
    setRollbackProgress(progress: { current: number; total: number; text: string } | null) {
      this.rollbackProgress = progress;
      if (progress !== null) this.setReactorState('rollback_in_progress');
      else if (this.reactorState === 'rollback_in_progress') this.setReactorState('idle');
    },
    stopTTS() {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arc:stop-audio'));
      this.setReactorState('idle');
      this.setSoftPaused(false);
      this.setTimelineStep(null);
    },
    async speak(text: string, style?: string, options?: { force?: boolean; queryId?: string }) {
      if (!text) return;
      const lowerText = text.toLowerCase();
      if (lowerText.includes('failed to load') || lowerText.includes('error:') || lowerText.includes('database disk image is malformed')) {
        console.warn(`[TTS] Technical error suppressed from speech (${text.length} chars)`);
        return;
      }
      const normalized = text.trim();
      const now = Date.now();
      if (!options?.force && this.lastSpokenResponse === normalized && (now - this.lastSpokenTime < 45000)) {
        console.warn(`[TTS] Duplicate speak request suppressed in UI (${normalized.length} chars)`);
        return;
      }
      this.lastSpokenResponse = normalized;
      this.lastSpokenTime = now;
      if (typeof window !== 'undefined' && window.api && typeof (window.api as any).speak === 'function') {
        this.setReactorState('speaking');
        const settings = useSettingsStore();
        void Promise.resolve(
          (window.api as any).speak(
            String(text || ''),
            style ? String(style) : undefined,
            Number(settings.ttsSpeed ?? 1.0),
            Number(settings.ttsPitch ?? 0),
            String(settings.f5ttsServerUrl || ''),
            Number(settings.ttsSampleRate ?? 48000),
            Boolean(settings.ttsPutAccent ?? true),
            Boolean(settings.ttsPutYo ?? true),
            String(settings.voicePresetId || 'eugene'),
            Boolean(settings.voiceAutoClearCache),
            Boolean(options?.force),
            options?.queryId ? String(options.queryId) : undefined
          )
        )
          .then((res: any) => {
            if (res && res.success === false) {
              this.setReactorState('idle');
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('arc:tts-finish'));
              }
            }
          })
          .catch((err) => {
            console.warn('IPC speak failed:', err);
            this.setReactorState('idle');
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('arc:tts-finish'));
            }
          });
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          this.setReactorState('speaking');
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'ru-RU';
          const settings = useSettingsStore();
          utterance.rate = settings.ttsSpeed || 1.0;
          utterance.pitch = 1.0;
          utterance.onend = () => {
            this.setReactorState('idle');
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('arc:tts-finish'));
            }
          };
          utterance.onerror = () => this.setReactorState('idle');
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Web SpeechSynthesis error:', e);
          this.setReactorState('idle');
        }
      }
    },
    initializeVoice() {
      if (window.api) {
        window.api.onWake(() => {
          this.setReactorState('listening');
          this.setListening(true);
        });
      }
    },
    toggleSpotlight() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-spotlight'));
      }
    }
  },
});
