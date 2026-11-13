<template>
  <div class="relative h-screen w-screen overflow-hidden bg-black">
    <TitleBar />
    <!-- Main App Content -->
    <main 
      class="absolute inset-0 flex selection:bg-[var(--accent)] selection:text-white transition-opacity duration-1000"
      :class="isAppReady ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    >
      <CommandCenter />
      <MacroEditorView />
      <ModelDownloadOverlay />
      <DownloadNotificationDock />
      <SyncToast />
      <ApprovalDialog />
      <ReactorTerminalOverlay />
    </main>

    <!-- First-Run Wizard Modal Layer (Root Level Isolation) -->
    <FirstRunWizardModal v-if="wizardOpen" />
    
    <!-- Audio Unlock Overlay -->
    <div 
      v-if="isAppReady && !wizardOpen && !audioManager.isUnlocked.value"
      class="absolute bottom-16 right-6 z-30 flex flex-col items-end pointer-events-auto"
      @click="audioManager.resume()"
    >
      <div 
        class="bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[16px] p-4 cursor-pointer hover:bg-[var(--arc-hover)] transition-colors shadow-2xl group flex items-center gap-3"
        :style="{ backgroundImage: 'var(--arc-sheen)' }"
      >
        <div class="w-10 h-10 rounded-full bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center group-hover:scale-110 transition-transform">
          <svg v-if="settingsStore.audioActivationMode === 'click'" class="w-5 h-5 text-[var(--status-ok)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 19h4l5 5V0L9 5H5v14z" /></svg>
          <svg v-else class="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
        </div>
        <div class="flex flex-col">
          <span v-if="settingsStore.audioActivationMode === 'click'" class="text-[var(--arc-text-primary)] text-sm font-medium">Включить звук</span>
          <span v-else class="text-[var(--arc-text-primary)] text-sm font-medium">Скажите 'АРК'</span>
          <span v-if="settingsStore.audioActivationMode === 'click'" class="text-[var(--arc-text-muted)] text-xs tracking-wider uppercase font-mono">Кликните для разблокировки</span>
          <span v-else class="text-[var(--arc-text-muted)] text-xs tracking-wider uppercase font-mono">Для активации аудио</span>
        </div>
      </div>
    </div>
    
    <!-- Loading Screen Overlay -->
    <div 
      class="absolute inset-0 flex flex-col items-center justify-center bg-black transition-opacity duration-1000 z-[9999]"
      :class="isAppReady ? 'opacity-0 pointer-events-none' : 'opacity-100'"
    >
      <div class="flex flex-col items-center max-w-lg text-center px-4">
        <!-- Logo / Spinner -->
        <div class="relative w-24 h-24 mb-8">
          <div class="absolute inset-0 border-t-2 border-[var(--accent)] rounded-full animate-spin"></div>
          <div class="absolute inset-2 border-r-2 border-white/30 rounded-full animate-[spin_2s_reverse_infinite]"></div>
          <div class="absolute inset-4 border-l-2 border-white/10 rounded-full animate-[spin_3s_linear_infinite]"></div>
          <div class="absolute inset-0 flex items-center justify-center text-white font-mono text-xl font-bold tracking-widest">
            ARC
          </div>
        </div>
        
        <h1 class="text-white text-2xl font-mono tracking-widest uppercase mb-4 opacity-80">Инициализация систем</h1>
        
        <div class="w-full h-1 bg-[var(--arc-block)] rounded-full overflow-hidden mb-4 relative">
          <div class="absolute top-0 bottom-0 left-0 bg-[var(--accent)] w-1/3 animate-[pulse_2s_ease-in-out_infinite] rounded-full shadow-[0_0_10px_var(--accent)]"></div>
        </div>
        
        <!-- Status text -->
        <p class="text-[var(--arc-text-muted)] font-mono text-xs max-w-md h-12 overflow-hidden flex flex-col justify-end">
          <span v-for="(msg, i) in loadingMessages" :key="i" class="block animate-[fade-in_0.3s_ease-out]" :style="{ opacity: 1 - ((loadingMessages.length - 1 - i) * 0.3) }">
            {{ msg }}
          </span>
        </p>
      </div>
    </div>
    <!-- Ollama Dialog -->
    <div 
      v-if="showOllamaDialog"
      class="fixed inset-0 arc-glass-veil flex items-center justify-center z-[100000] font-sans"
    >
      <div 
        class="border border-[var(--arc-hairline)] rounded-[20px] w-full max-w-md p-6 overflow-hidden shadow-2xl bg-[var(--arc-popover)]"
        :style="{
          background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 64px rgba(0, 0, 0, 0.85)'
        }"
      >
        <h3 class="font-bold text-lg text-[var(--arc-text-primary)] mb-2">Отсутствует модель Ollama</h3>
        <p class="text-sm text-[var(--arc-text-secondary)] mb-6">LLM-модель {{ ollamaModelName }} не найдена. Скачать её сейчас?</p>
        <div class="flex justify-end gap-3">
          <button @click="showOllamaDialog = false" class="px-4 py-2 rounded-[10px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] text-xs font-medium cursor-pointer">Позже</button>
          <button @click="downloadOllamaModel" class="px-4 py-2 rounded-[10px] bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer shadow-[0_0_16px_rgba(var(--accent-rgb),0.3)]">Скачать</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { logger } from './utils/logger';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useUIStore } from './stores/ui.store';
import { useEcoStore } from './stores/eco.store';
import { audioManager } from './composables/useAudioManager';
import { useSettingsStore } from './features/settings/stores/settings.store';
import CommandCenter from './layouts/CommandCenter.vue';
import MacroEditorView from './features/commands/components/MacroEditorView.vue';
import ModelDownloadOverlay from './components/ui/ModelDownloadOverlay.vue';
import DownloadNotificationDock from './components/ui/DownloadNotificationDock.vue';
import SyncToast from './components/ui/SyncToast.vue';
import ApprovalDialog from './components/security/ApprovalDialog.vue';
import TitleBar from './components/ui/TitleBar.vue';
import ReactorTerminalOverlay from './components/terminal/ReactorTerminalOverlay.vue';
import FirstRunWizardModal from './components/onboarding/FirstRunWizardModal.vue';
import { useModelDownloadStore } from './features/modelDownload/stores/modelDownload.store';
import { usePerformanceStore } from './stores/performance.store';
import { THEME_PALETTES } from './assets/styles/theme-palettes.tokens';
import { recordThemeApplied } from './utils/arcGhostDetector';
import { audioDuckingManager } from './audio/audio-ducking-manager';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const perfStore = usePerformanceStore();
const isAppReady = ref(false);
const wizardOpen = computed(() => isAppReady.value && !settingsStore.firstRunCompleted);


const loadingMessages = ref<string[]>(['Система активна...']);
const showOllamaDialog = ref(false);
const ollamaModelName = ref('');
let hasShownStartupIntegrityToast = false;

const checkStartupIntegrityStatus = async () => {
  if (hasShownStartupIntegrityToast) return;
  if (!window.api || typeof window.api.getDbStatus !== 'function') return;
  hasShownStartupIntegrityToast = true;
  try {
    const status = await window.api.getDbStatus();
    if (!status) return;
    if (status.mode === 'DB_SAFE_MODE' || status.isSafeMode) {
      uiStore.showToast(
        'БД повреждена, копия сохранена в quarantine, запись отключена (DB_SAFE_MODE).',
        'error',
        8000
      );
    } else if (status.lastRecovery?.quarantined) {
      uiStore.showToast(
        'Обнаружено повреждение БД: повреждённые файлы перенесены в карантин, база пересоздана.',
        'info',
        8000
      );
    }

    if (status.security?.secretsStorageMode === 'session_memory_only') {
      uiStore.showToast(
        'DPAPI недоступен: секреты работают только в оперативной памяти текущей сессии.',
        'warning',
        7000
      );
    } else if ((status.security?.unreadableKeysCount || 0) > 0) {
      uiStore.showToast(
        `Не удалось расшифровать сохранённые ключи (${status.security?.unreadableKeysCount}): введите API-ключи заново в настройках.`,
        'warning',
        7000
      );
    }
  } catch (err) {
    logger.warn('Failed to poll startup DB/security status:', err);
  }
};

const checkResize = () => {
  // Focus mode resize check
};

const checkOllamaModel = async () => {
  if (settingsStore.useLocalLLM && settingsStore.localLLMModel !== 'builtin') {
    try {
      // Check if Ollama is online first using our silent main process IPC check
      if (window.api && (window.api as any).checkOllamaOnline) {
        const status = await (window.api as any).checkOllamaOnline();
        if (!status || !status.online) {
          logger.info('App: Ollama is offline. Skipping detailed model check.');
          return;
        }
      }

      const model = settingsStore.localLLMModel || 'llama3.2';
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        const hasModel = models.some((m: any) => m.name === model || m.name === `${model}:latest`);
        if (!hasModel) {
          ollamaModelName.value = model;
          showOllamaDialog.value = true;
        }
      }
    } catch (e) {
      console.warn('Failed to connect to Ollama', e);
    }
  }
};

const downloadOllamaModel = async () => {
  showOllamaDialog.value = false;
  const store = useModelDownloadStore();
  store.updateProgress(0, 100, `Ollama: ${ollamaModelName.value}`);
  
  try {
    const response = await fetch('http://127.0.0.1:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ollamaModelName.value })
    });
    
    if (!response.body) return;
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.total && data.completed) {
            store.updateProgress(data.completed, data.total, `Ollama: ${ollamaModelName.value}`);
          } else if (data.status === 'success') {
            store.finishDownload();
          }
        } catch (e) { logger.warn('Ignored error in catch', e); }
      }
    }
    store.finishDownload();
  } catch (e) {
    console.error('Failed to pull Ollama model', e);
    store.finishDownload();
  }
};

watch(() => settingsStore.darkMode, (isDark) => {
  if (isDark) {
    document.body.classList.add('dark-protocol');
  } else {
    document.body.classList.remove('dark-protocol');
  }
}, { immediate: true });

watch(
  () => settingsStore.reactorColorTheme,
  (themeKey) => {
    const key = (themeKey || 'red') as keyof typeof THEME_PALETTES;
    const p = THEME_PALETTES[key] || THEME_PALETTES.red;
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--accent', p.color);
      root.style.setProperty('--color-accent', p.color);
      root.style.setProperty('--color-accent-hover', p.hover);
      root.style.setProperty('--color-accent-glow', p.bgAlpha);
      root.style.setProperty('--accent-rgb', p.rgb);
      root.style.setProperty('--accent-color', p.color);
      root.style.setProperty('--accent-text', p.text);
      root.style.setProperty('--accent-border', p.border);
      root.style.setProperty('--accent-border-hover', p.borderHover);
      root.style.setProperty('--accent-bg-alpha', p.bgAlpha);
      root.style.setProperty('--accent-bg-alpha-hover', p.bgAlphaHover);
      root.style.setProperty('--accent-glow', p.glow);
      root.style.setProperty('--accent-glow-strong', p.glowStrong);
      root.style.setProperty('--core-glow', p.rgb);
      recordThemeApplied(key);
    }
  },
  { immediate: true }
);

watch(() => useEcoStore().isHidden, (hidden) => {
  if (hidden) {
    document.body.classList.add('eco-hidden');
  } else {
    document.body.classList.remove('eco-hidden');
  }
}, { immediate: true });

watch(() => useEcoStore().isEcoActive, (active) => {
  if (active) {
    document.body.classList.add('eco-mode-active');
  } else {
    document.body.classList.remove('eco-mode-active');
  }
}, { immediate: true });

watch(() => perfStore.policy, (p) => {
  if (p.mode === 'GAME_MODE') {
    document.body.classList.add('perf-mode-game');
  } else {
    document.body.classList.remove('perf-mode-game');
  }

  if (p.blurLevel === 'OFF') {
    document.body.classList.add('perf-blur-off');
  } else {
    document.body.classList.remove('perf-blur-off');
  }
}, { immediate: true, deep: true });

let currentAudio: HTMLAudioElement | null = null;
let musicAudio: HTMLAudioElement | null = null;
let ambientAudioCtx: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let ambientOscillators: OscillatorNode[] = [];
let isAmbientPlaying = false;
let unsubLoading: any = null;
let unsubLoaded: any = null;
let unsubNavigate: any = null;
let unsubStopAudio: any = null;
let unsubTimerAction: any = null;
let unsubVkConnectionStatus: (() => void) | null = null;
let unsubVkStatus: (() => void) | null = null;

const stopAmbientSoundscape = () => {
  if (ambientOscillators.length > 0) {
    ambientOscillators.forEach(osc => {
      try { 
        osc.stop(); 
        osc.disconnect(); 
      } catch (_) { logger.warn('Ignored error in catch', _); }
    });
    ambientOscillators = [];
  }
  isAmbientPlaying = false;
};

const pauseAmbientSoundscape = () => {
  if (ambientAudioCtx && ambientAudioCtx.state === 'running') {
    ambientAudioCtx.suspend().catch(() => {});
  }
  isAmbientPlaying = false;
};

const resumeAmbientSoundscape = () => {
  if (ambientAudioCtx && ambientAudioCtx.state === 'suspended') {
    ambientAudioCtx.resume().catch(() => {});
    isAmbientPlaying = true;
  } else if (!isAmbientPlaying) {
    startAmbientSoundscape();
  }
};

const startAmbientSoundscape = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!ambientAudioCtx) {
      ambientAudioCtx = new AudioCtx();
    }
    if (ambientAudioCtx.state === 'suspended') {
      ambientAudioCtx.resume().catch(() => {});
    }

    stopAmbientSoundscape();

    ambientGain = ambientAudioCtx.createGain();
    const vol = uiStore.musicVolume !== undefined ? uiStore.musicVolume : 0.5;
    ambientGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)) * 0.12, ambientAudioCtx.currentTime);

    const filter = ambientAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, ambientAudioCtx.currentTime);

    // Warm chord harmonics: 108Hz, 162Hz, 216Hz, 324Hz
    const freqs = [108, 162, 216, 324];
    ambientOscillators = freqs.map((freq, idx) => {
      const osc = ambientAudioCtx!.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, ambientAudioCtx!.currentTime);
      
      const subGain = ambientAudioCtx!.createGain();
      subGain.gain.setValueAtTime(0.25 / freqs.length, ambientAudioCtx!.currentTime);
      
      osc.connect(subGain);
      subGain.connect(filter);
      try { osc.start(); } catch (_) { logger.warn('Ignored error in catch', _); }
      return osc;
    });

    filter.connect(ambientGain);
    ambientGain.connect(ambientAudioCtx.destination);
    isAmbientPlaying = true;
    uiStore.setMusicState('playing');
    uiStore.setMusicTitle('A.R.C. Quantum Soundscape');
  } catch (err) {
    console.warn('[Soundscape] Ambient soundscape notice:', err);
    uiStore.setMusicState('playing');
    uiStore.setMusicTitle('A.R.C. Media Stream');
  }
};

watch(() => uiStore.musicVolume, (newVol) => {
  const clampedVol = Math.max(0, Math.min(1, newVol));
  if (musicAudio) {
    musicAudio.volume = clampedVol;
  }
  if (ambientGain && ambientAudioCtx) {
    try {
      ambientGain.gain.setValueAtTime(clampedVol * 0.12, ambientAudioCtx.currentTime);
    } catch (_) { logger.warn('Ignored error in catch', _); }
  }
});

const handleStopAudio = () => {
  if (window.api && (window.api as any).stopSpeak) {
    (window.api as any).stopSpeak().catch((e: any) => console.error('Failed to call stopSpeak', e));
  }
  if (window.api && (window.api as any).abortAiRequest) {
    (window.api as any).abortAiRequest().catch((e: any) => console.error('Failed to abort ai request', e));
  }
  if (audioManager) {
    audioManager.stopAll();
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (_) { logger.warn('Ignored error in catch', _); }
  }
  if (musicAudio) {
    try {
      musicAudio.pause();
      musicAudio.currentTime = 0;
    } catch (_) { logger.warn('Ignored error in catch', _); }
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    if (window.api && (window.api as any).audioDone) {
      (window.api as any).audioDone();
    }
  }
  uiStore.setSoftPaused(false);
  uiStore.setReactorState('idle');
};

const handlePauseAudio = () => {
  if (currentAudio) {
    currentAudio.pause();
    uiStore.setSoftPaused(true);
  }
};

const handleResumeAudio = () => {
  if (currentAudio) {
    currentAudio.play().catch(e => console.error('Failed to resume audio', e));
    uiStore.setSoftPaused(false);
  }
};

onMounted(() => {
  const ecoStore = useEcoStore();
  ecoStore.initActivityListeners();
  
  audioManager.initialize();
  window.addEventListener('click', () => { if (!audioManager.isUnlocked.value && settingsStore.audioActivationMode === 'click') audioManager.resume(); }, { once: false });
  (window as any).audioManager = audioManager;
  if (window.api && (window.api as any).onAppLoadingProgress) {
    unsubLoading = (window.api as any).onAppLoadingProgress((msg: string) => {
      loadingMessages.value.push(msg);
      if (loadingMessages.value.length > 3) {
        loadingMessages.value.shift();
      }
    });
    
    if ((window.api as any).onModelDownloadProgress) {
      (window.api as any).onModelDownloadProgress((data: any) => {
        const store = useModelDownloadStore();
        store.updateProgress(data.bytes_done, data.total_bytes, data.filename, data.error);
      });
    }

    if ((window.api as any).onLlmFallbackRequired) {
      (window.api as any).onLlmFallbackRequired((data: any) => {
        const store = useModelDownloadStore();
        if (store.isConsentOpen) return;
        store.showConsentDialog(data);
      });
    }

    const downloadStore = useModelDownloadStore();
    downloadStore.checkActiveDownload();

    if ((window.api as any)?.onShowToast) {
      (window.api as any).onShowToast((data: any) => {
        if (data && data.message) {
          uiStore.showToast(data.message, data.type || 'info', data.duration);
        }
      });
    }

    unsubLoaded = (window.api as any).onAppModulesLoaded(() => {
      loadingMessages.value.push('Все модули загружены. Запуск A.R.C...');
      setTimeout(() => {
        isAppReady.value = true;
        void checkStartupIntegrityStatus();
      }, 500);
    });
  } else {
    // Fallback if no IPC loaded yet
    setTimeout(() => {
      isAppReady.value = true;
      void checkStartupIntegrityStatus();
    }, 1500);
  }

  // Global safety fallback: Always start the app after a reasonable maximum time (e.g. 2s)
  // to ensure users never get stuck on a broken loading screen.
  setTimeout(() => {
    if (!isAppReady.value) {
      console.debug('App fallback timeout (normal for web dev).');
      isAppReady.value = true;
      void checkStartupIntegrityStatus();
    }
  }, 2000);

  window.addEventListener('resize', checkResize);
  window.addEventListener('arc:stop-audio', handleStopAudio);
  window.addEventListener('arc:pause-audio', handlePauseAudio);
  window.addEventListener('arc:resume-audio', handleResumeAudio);
  checkResize();
  checkOllamaModel();

  let unsubModelTelemetry = () => {};
  if (window.api?.onAiModelTelemetry) {
    unsubModelTelemetry = window.api.onAiModelTelemetry((data) => {
      uiStore.modelTelemetry = data;
    });
  }

  let unsubModelUnloaded = () => {};
  if (window.api?.onAiModelUnloaded) {
    unsubModelUnloaded = window.api.onAiModelUnloaded(() => {
      uiStore.modelTelemetry = null;
      uiStore.modelLoadingStatus = null;
    });
  }

  let unsubOomWarning = () => {};
  if (window.api?.onAiOomWarning) {
    unsubOomWarning = window.api.onAiOomWarning((data) => {
      alert(`ВНИМАНИЕ! КРИТИЧЕСКАЯ НЕХВАТКА ПАМЯТИ!\nЗагрузка модели ${data.modelName} прервана.\nТребуется: ~${data.requiredMb} MB\nДоступно: ${data.availableMb} MB\n\nПожалуйста, закройте другие программы или выберите меньшую модель.`);
    });
  }

  let unsubModelLoading = () => {};
  let unsubSttProgress = () => {};
  if (window.api?.onAiModelLoading) {
    unsubModelLoading = window.api.onAiModelLoading((data) => {
      uiStore.modelLoadingStatus = data;
      useModelDownloadStore().updateLoadingStatus(data);
      if (data.status === 'ready' || data.status === 'error') {
        setTimeout(() => {
          if (uiStore.modelLoadingStatus?.status !== 'loading') {
            uiStore.modelLoadingStatus = null;
          }
        }, 3000);
      }
    });
  }

  if ((window.api as any)?.onSttDownloadProgress) {
    unsubSttProgress = (window.api as any).onSttDownloadProgress((data: any) => {
      useModelDownloadStore().updateSttProgress(data);
    });
  }

  
  if (window.api && window.api.onPlayAudio) {
    window.api.onPlayAudio((dataUri: string) => {
      uiStore.setSoftPaused(true);
      window.audioManager.playTTS(dataUri, { priority: 'normal', interrupt: true });
    });

    if ((window.api as any).onPlayAudioStop) {
      (window.api as any).onPlayAudioStop(() => {
        window.audioManager.stopAll();
      });
    }

    if (window.api && (window.api as any).onUiNavigate) {
      unsubNavigate = (window.api as any).onUiNavigate((tab: string) => {
        logger.info('[App] Navigation event received from main process:', tab);
        uiStore.setActiveTab(tab as any);
      });
    }

    if (window.api && (window.api as any).onUiStopAudio) {
      unsubStopAudio = (window.api as any).onUiStopAudio(() => {
        logger.info('[App] Stop audio event received from main process');
        window.audioManager.stopAll();
      });
    }

    if (window.api && (window.api as any).onUiTimerAction) {
      unsubTimerAction = (window.api as any).onUiTimerAction((action: string, minutes?: number) => {
        logger.info('[App] Timer action event received from main process:', action);
        window.dispatchEvent(new CustomEvent('arc:timer-action', { detail: { action, minutes } }));
      });
    }
  }

  if (window.api && (window.api as any).onMediaPlay) {
    (window.api as any).onMediaPlay((data: { url: string; title: string }) => {
      logger.info('Music play triggered:', data);
      if (!musicAudio) {
        musicAudio = new Audio(data.url);
        musicAudio.loop = true;
        musicAudio.crossOrigin = 'anonymous';
      } else {
        if (musicAudio.src !== data.url) {
          musicAudio.src = data.url;
        }
      }
      musicAudio.volume = uiStore.musicVolume;
      musicAudio.play().then(() => {
        uiStore.setMusicState('playing');
        uiStore.setMusicTitle(data.title || 'Атмосферный Эмбиент');
      }).catch(e => {
        console.error('Music playback failed:', e);
      });
    });
  }

  if (window.api && (window.api as any).onMediaPause) {
    (window.api as any).onMediaPause(() => {
      logger.info('Music pause triggered');
      if (musicAudio) {
        musicAudio.pause();
        uiStore.setMusicState('paused');
      }
    });
  }


  if (window.api?.getVkConnectionStatus) {
    window.api.getVkConnectionStatus().then((status) => {
      if (status) uiStore.setVkConnectionStatus(status);
    }).catch((e) => console.warn('Failed to get initial VK connection status:', e));
  }

  if (window.api?.onMediaVkConnectionStatus) {
    unsubVkConnectionStatus = window.api.onMediaVkConnectionStatus((status) => {
      if (status) uiStore.setVkConnectionStatus(status);
    });
  }

  if (window.api?.onMediaVkStatus) {
    unsubVkStatus = window.api.onMediaVkStatus((data) => {
      uiStore.applyVkStatus(data);
    });
  }

  if (window.api && (window.api as any).onMediaVolume) {
    (window.api as any).onMediaVolume((data: any) => {
      const newVol = typeof data === 'number' ? data : data?.volume;
      if (typeof newVol === 'number') {
        uiStore.setMusicVolume(newVol);
        if (musicAudio) musicAudio.volume = newVol;
      }
    });
  }

  if (window.api && (window.api as any).onMediaQuieter) {
    (window.api as any).onMediaQuieter((data?: any) => {
      const hasExplicitVol = typeof data?.volume === 'number';
      const newVol = hasExplicitVol ? data.volume : Math.max(0, uiStore.musicVolume - 0.15);
      uiStore.setMusicVolume(newVol);
      if (musicAudio) musicAudio.volume = newVol;
      if (!hasExplicitVol && uiStore.vkActive && window.api?.vkControl) {
        window.api.vkControl('volume', { value: newVol }).catch((e: unknown) => console.error(e));
      }
    });
  }

  if (window.api && (window.api as any).onMediaLouder) {
    (window.api as any).onMediaLouder((data?: any) => {
      const hasExplicitVol = typeof data?.volume === 'number';
      const newVol = hasExplicitVol ? data.volume : Math.min(1.0, uiStore.musicVolume + 0.15);
      uiStore.setMusicVolume(newVol);
      if (musicAudio) musicAudio.volume = newVol;
      if (!hasExplicitVol && uiStore.vkActive && window.api?.vkControl) {
        window.api.vkControl('volume', { value: newVol }).catch((e: unknown) => console.error(e));
      }
    });
  }

  window.addEventListener('arc:music-play', handleLocalMusicPlay);
  window.addEventListener('arc:music-pause', handleLocalMusicPause);
  audioDuckingManager.init();
});

const RADIO_STREAMS = [
  'https://coderadio-relay-ffm.freecodecamp.org/radio/8010/radio.mp3',
  'https://coderadio-relay-ams.freecodecamp.org/radio/8010/radio.mp3',
  'https://coderadio-admin.freecodecamp.org/radio/8010/radio.mp3'
];
let currentRadioStreamIdx = 0;
let isActivatingAmbientFallback = false;

// DEPRECATED: CodeRadio fallback отключён по UX-решению. Оставлено для ручного тестирования/будущего использования.
const playRadioStream = (index: number) => {
  if (index >= RADIO_STREAMS.length) {
    if (!isActivatingAmbientFallback) {
      isActivatingAmbientFallback = true;
      console.warn('[Media] All CodeRadio stream relays unreachable, activating Quantum Soundscape.');
      if (musicAudio) {
        try { musicAudio.pause(); } catch (_) { logger.warn('Ignored error in catch', _); }
        musicAudio = null;
      }
      startAmbientSoundscape();
      setTimeout(() => { isActivatingAmbientFallback = false; }, 1200);
    }
    return;
  }

  const url = RADIO_STREAMS[index];
  try {
    if (musicAudio) {
      try { musicAudio.pause(); } catch (_) { logger.warn('Ignored error in catch', _); }
      musicAudio = null;
    }
    musicAudio = new Audio(url);
    musicAudio.loop = true;
    musicAudio.crossOrigin = 'anonymous';
    musicAudio.volume = Math.max(0, Math.min(1, uiStore.musicVolume));

    let hasHandledFailure = false;
    // DEPRECATED: CodeRadio fallback отключён по UX-решению. Оставлено для ручного тестирования/будущего использования.
    const onStreamFailed = (errReason?: any) => {
      if (hasHandledFailure) return;
      hasHandledFailure = true;
      console.warn(`[Media] CodeRadio relay [${index}] failed (${errReason?.message || errReason || 'offline'}), attempting next relay...`);
      playRadioStream(index + 1);
    };

    musicAudio.onerror = () => {
      onStreamFailed('network/connection reset');
    };

    musicAudio.play().then(() => {
      currentRadioStreamIdx = index;
      uiStore.setMusicState('playing');
      uiStore.setMusicTitle('FreeCodeCamp Code Radio');
    }).catch(e => {
      onStreamFailed(e);
    });
  } catch (err) {
    playRadioStream(index + 1);
  }
};

const handleLocalMusicPlay = () => {
  if (!uiStore.vkActive) {
    console.warn('[Media] Blocked local play: VK not active');
    return;
  }
  if (isAmbientPlaying && ambientAudioCtx && ambientAudioCtx.state === 'suspended') {
    resumeAmbientSoundscape();
    return;
  }

  if (musicAudio && musicAudio.src) {
    musicAudio.play().then(() => {
      uiStore.setMusicState('playing');
    }).catch(e => {
      console.warn('[Media] Stream playback failed, retrying relays:', e?.message || e);
      playRadioStream(0);
    });
  } else {
    currentRadioStreamIdx = 0;
    playRadioStream(0);
  }
};

const handleLocalMusicPause = () => {
  if (musicAudio) {
    try { musicAudio.pause(); } catch (_) { logger.warn('Ignored error in catch', _); }
  }
  if (isAmbientPlaying) {
    pauseAmbientSoundscape();
  }
  uiStore.setMusicState('paused');
};

onUnmounted(() => {
  useEcoStore().destroyListeners();
  window.removeEventListener('resize', checkResize);
  window.removeEventListener('arc:stop-audio', handleStopAudio);
  window.removeEventListener('arc:pause-audio', handlePauseAudio);
  window.removeEventListener('arc:resume-audio', handleResumeAudio);
  window.removeEventListener('arc:music-play', handleLocalMusicPlay);
  window.removeEventListener('arc:music-pause', handleLocalMusicPause);
  if (unsubLoading) unsubLoading();
  if (unsubLoaded) unsubLoaded();
  if (unsubNavigate) unsubNavigate();
  if (unsubStopAudio) unsubStopAudio();
  if (unsubTimerAction) unsubTimerAction();
  if (unsubVkConnectionStatus) unsubVkConnectionStatus();
    unsubModelTelemetry();
    unsubModelUnloaded();
    unsubOomWarning();
    unsubModelLoading();
    if (unsubSttProgress) unsubSttProgress();
  if (unsubVkStatus) unsubVkStatus();
  if (musicAudio) {
    try { musicAudio.pause(); } catch (_) { logger.warn('Ignored error in catch', _); }
    musicAudio = null;
  }
  stopAmbientSoundscape();
  audioDuckingManager.cleanup();
});
</script>
