import { ref, watch } from 'vue';
import { useUIStore } from '../stores/ui.store';
import { useEcoStore } from '../stores/eco.store';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { useModelDownloadStore } from '../features/modelDownload/stores/modelDownload.store';
import { usePerformanceStore } from '../stores/performance.store';
import { audioManager } from './useAudioManager';
import { THEME_PALETTES } from '../assets/styles/theme-palettes.tokens';
import { logger } from '../utils/logger';
import { recordThemeApplied } from '../utils/arcGhostDetector';

export function useAppRoot() {
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const perfStore = usePerformanceStore();
  const ecoStore = useEcoStore();

  const isAppReady = ref(false);
  const loadingMessages = ref<string[]>(['Инициализация ядра A.R.C...']);
  const showOllamaDialog = ref(false);
  const ollamaModelName = ref('');

  let unsubLoading: any = null;
  let unsubLoaded: any = null;
  let unsubNavigate: any = null;
  let unsubStopAudio: any = null;
  let unsubTimerAction: any = null;
  let unsubModelTelemetry: any = null;
  let unsubModelUnloaded: any = null;
  let unsubOomWarning: any = null;
  let unsubModelLoading: any = null;
  let unsubSttProgress: any = null;

  watch(
    () => settingsStore.darkMode,
    isDark => {
      if (isDark) {
        document.body.classList.add('dark-protocol');
      } else {
        document.body.classList.remove('dark-protocol');
      }
    },
    { immediate: true }
  );

  watch(
    () => ecoStore.isHidden,
    hidden => {
      if (hidden) {
        document.body.classList.add('eco-hidden');
      } else {
        document.body.classList.remove('eco-hidden');
      }
    },
    { immediate: true }
  );

  watch(
    () => perfStore.policy,
    p => {
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
    },
    { immediate: true, deep: true }
  );

  watch(
    () => settingsStore.reactorColorTheme,
    themeKey => {
      const p = THEME_PALETTES[themeKey] || THEME_PALETTES.red;
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
      recordThemeApplied(themeKey);
    },
    { immediate: true }
  );

  const checkOllamaModel = async () => {
    if (settingsStore.useLocalLLM && settingsStore.localLLMModel !== 'builtin') {
      try {
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
          } catch (e) {
            logger.warn('Ignored error in catch', e);
          }
        }
      }
      store.finishDownload();
    } catch (e) {
      console.error('Failed to pull Ollama model', e);
      store.finishDownload();
    }
  };

  const handleAudioUnlock = () => {
    if (!audioManager.isUnlocked.value && (settingsStore as any).audioActivationMode === 'click') {
      audioManager.resume();
    }
  };

  const initAppRoot = () => {
    ecoStore.initActivityListeners();
    audioManager.initialize();
    window.addEventListener('click', handleAudioUnlock);
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
        }, 500);
      });
    } else {
      setTimeout(() => {
        isAppReady.value = true;
      }, 1500);
    }

    setTimeout(() => {
      if (!isAppReady.value) {
        console.debug('App fallback timeout (normal for web dev).');
        isAppReady.value = true;
      }
    }, 2000);

    checkOllamaModel();

    if (window.api?.onAiModelTelemetry) {
      unsubModelTelemetry = window.api.onAiModelTelemetry(data => {
        uiStore.modelTelemetry = data;
      });
    }

    if (window.api?.onAiModelUnloaded) {
      unsubModelUnloaded = window.api.onAiModelUnloaded(() => {
        uiStore.modelTelemetry = null;
        uiStore.modelLoadingStatus = null;
      });
    }

    if (window.api?.onAiOomWarning) {
      unsubOomWarning = window.api.onAiOomWarning(data => {
        alert(
          `ВНИМАНИЕ! КРИТИЧЕСКАЯ НЕХВАТКА ПАМЯТИ!\nЗагрузка модели ${data.modelName} прервана.\nТребуется: ~${data.requiredMb} MB\nДоступно: ${data.availableMb} MB\n\nПожалуйста, закройте другие программы или выберите меньшую модель.`
        );
      });
    }

    if (window.api?.onAiModelLoading) {
      unsubModelLoading = window.api.onAiModelLoading(data => {
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
        audioManager.playTTS(dataUri, { priority: 'normal', interrupt: true });
      });

      if ((window.api as any).onPlayAudioStart) {
        (window.api as any).onPlayAudioStart((sampleRate: number) => {
          audioManager.startStream(sampleRate || 22050);
        });
      }

      if ((window.api as any).onAudioChunk) {
        (window.api as any).onAudioChunk((chunk: Uint8Array) => {
          audioManager.playStreamChunk(chunk);
        });
      } else if ((window.api as any).onPlayAudioChunk) {
        (window.api as any).onPlayAudioChunk((chunk: Uint8Array) => {
          audioManager.playStreamChunk(chunk);
        });
      }

      if ((window.api as any).onPlayAudioEnd) {
        (window.api as any).onPlayAudioEnd(() => {
          audioManager.endStream();
        });
      }

      if ((window.api as any).onPlayAudioStop) {
        (window.api as any).onPlayAudioStop(() => {
          audioManager.stopAll();
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
          audioManager.stopAll();
        });
      }

      if (window.api && (window.api as any).onUiTimerAction) {
        unsubTimerAction = (window.api as any).onUiTimerAction((action: string, minutes?: number) => {
          logger.info('[App] Timer action event received from main process:', action);
          window.dispatchEvent(new CustomEvent('arc:timer-action', { detail: { action, minutes } }));
        });
      }
    }
  };

  const destroyAppRoot = () => {
    ecoStore.destroyListeners();
    window.removeEventListener('click', handleAudioUnlock);
    if (unsubLoading) unsubLoading();
    if (unsubLoaded) unsubLoaded();
    if (unsubNavigate) unsubNavigate();
    if (unsubStopAudio) unsubStopAudio();
    if (unsubTimerAction) unsubTimerAction();
    if (unsubModelTelemetry) unsubModelTelemetry();
    if (unsubModelUnloaded) unsubModelUnloaded();
    if (unsubOomWarning) unsubOomWarning();
    if (unsubModelLoading) unsubModelLoading();
    if (unsubSttProgress) unsubSttProgress();
  };

  return {
    isAppReady,
    loadingMessages,
    showOllamaDialog,
    ollamaModelName,
    settingsStore,
    uiStore,
    downloadOllamaModel,
    initAppRoot,
    destroyAppRoot
  };
}
