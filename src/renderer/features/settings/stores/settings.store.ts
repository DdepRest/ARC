import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { TabName } from '../../../../shared/types/ui';
import { useAiConfigStore } from '../../../stores/aiConfig';
import {
  GRAPHICS_PRESETS,
  cloneGraphicsConfig,
  detectMatchingPreset,
  presetToLegacyQuality,
  type GraphicsPreset,
  type GraphicsConfig
} from '../logic/graphics-presets';

export const useSettingsStore = defineStore('settings', () => {
  const language = ref<'RU' | 'EN'>('RU');
  const darkMode = ref(true);
  const ecoMode = ref<'auto' | 'always' | 'off'>('auto');
  const voiceVolume = ref(1.0); // Volume control
  const sttVolumeThreshold = ref(0.003); // Voice activity detection threshold (0.003 for clear pickup)
  const sttSelectedMic = ref(''); // Selected microphone deviceId
  
  // Tab Bar settings
  const tabBarPosition = ref<'top' | 'bottom'>('bottom');
  const pinnedTabs = ref<TabName[]>(['core', 'chat', 'objectives', 'settings']);
  
  // Tactical Directives (AI Behavior)
  const directives = ref({
    creativity: 50,
    analytical: 80,
    aggression: 10,
    empathy: 30
  });
  
  // Reactor Control States
  const reactorPower = ref(1.0);
  const reactorSpeed = ref(1.0);
  const reactorColorTheme = ref<'red' | 'blue' | 'purple' | 'green' | 'gold'>('red');
  const isAudioReactive = ref(true);

  // Advanced features
  const autoStart = ref(false);
  const runInBackground = ref(true);
  const graphicsQuality = ref<'Low' | 'Medium' | 'High'>('Medium');
  const autoAdjustGraphics = ref(true);

  // Onboarding / First-Run Wizard (Task 4.1)
  const firstRunCompleted = ref(false);
  const onboardingVersion = ref(1);
  
  const voiceFeedback = ref(true);
  const requireConfirm = ref(true);

  // New Performance & STT parameters for Phase 4
  const forcedOfflineMode = ref(false);
  const useLocalLLM = ref(false);
  const cloudLlmInGameMode = ref(true);
  const cloudLlmInBackgroundEco = cloudLlmInGameMode;
  const localLLMPriority = ref<'fallback' | 'primary'>('fallback');
  const localLLMModel = ref('llama3.2');
  const builtinLLMModel = ref('LFM3-1.7B-Q4_K_M.gguf');
  const llmAutoUnloadMinutes = ref(10);
  const llmMaxContextSize = ref(2048);
  const llmGpuOffloadMode = ref<'auto' | 'cpu' | 'gpu' | 'split'>('auto');
  const llmGpuLayers = ref(-1);
  const llmContextSummarization = ref(true);
  const useSmartRouting = ref(false);
  const smartRoutingThreshold = ref(30); // complexity threshold (e.g. prompt length or character count)
  const sttModel = ref('whisper-small');
  const sttEngine = ref<'gigaam' | 'legacy'>('gigaam');
  const sttProvider = ref<'sherpa' | 'native' | 'whisper'>(typeof window !== 'undefined' && (window as any).api ? 'sherpa' : 'native');
  const sttKeywordsEnabled = ref(true);
  const sttKeyword = ref('A.R.C.');
  const sttNoiseReduction = ref(true);
  const wakeWords = ref<string[]>(['A.R.C.', 'Арк', 'Алекс', 'Джарвис', 'Компьютер']);
  const sttCorrections = ref<Record<string, string>>({});
  const autoSpeak = ref(true);
  const autoDuckMusic = ref<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('arc_auto_duck_music') !== 'false' : true);
  watch(autoDuckMusic, (val) => { if (typeof localStorage !== 'undefined') localStorage.setItem('arc_auto_duck_music', String(val)); });
  const audioDuckingPercentage = ref<number>(
    typeof localStorage !== 'undefined' && localStorage.getItem('arc_audio_ducking_pct')
      ? Math.max(10, Math.min(95, Number(localStorage.getItem('arc_audio_ducking_pct')) || 70))
      : 70
  );
  watch(audioDuckingPercentage, (val) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('arc_audio_ducking_pct', String(val));
  });
  const aiPreprocessEnabled = ref(false); // Отключено по умолчанию для стабильности
  const llmStreamingEnabled = ref(true); // Streaming ответов LLM (Блок А ТЗ v7.0)
  const smartCacheEnabled = ref<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('arc_smart_cache_enabled') === 'true' : false);
  watch(smartCacheEnabled, (val) => { if (typeof localStorage !== 'undefined') localStorage.setItem('arc_smart_cache_enabled', String(val)); });
  const autoDownloadLargeModels = ref(false); // Запрет автоскачивания файлов > 500 МБ без согласия (Блок В ТЗ v7.0)
  const ollamaKeepAlive = ref<'5m' | '15m' | '30m' | '1h' | 'never'>('5m');
  const initialTtsProviderRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_tts_provider') : null;
  let persistedTtsProvider: string = initialTtsProviderRaw || 'auto';
  if (!['auto', 'silero', 'edge', 'native'].includes(persistedTtsProvider)) {
    persistedTtsProvider = 'auto';
  }
  const ttsProvider = ref<'auto' | 'silero' | 'edge' | 'native' | 'piper' | 'kokoro'>(persistedTtsProvider as any);
  if (typeof window !== 'undefined' && (window as any).api?.setTtsProvider) {
    (window as any).api.setTtsProvider(ttsProvider.value).catch(() => {});
  }
  watch(ttsProvider, (val) => {
    const safeVal = !['auto', 'silero', 'edge', 'native'].includes(val as string) ? 'auto' : val;
    if (safeVal !== val) { ttsProvider.value = safeVal as any; return; }
    if (typeof localStorage !== 'undefined') localStorage.setItem('arc_tts_provider', safeVal);
    if (typeof window !== 'undefined' && (window as any).api?.setTtsProvider) {
      (window as any).api.setTtsProvider(safeVal).catch(() => {});
    }
  });
  const enableWebSearch = ref(true);
  const searchProvider = ref<'duckduckgo' | 'tavily' | 'serper'>('duckduckgo');
  const pendingHighlightId = ref<string | null>(null);
  const pendingHighlightQuery = ref<string | null>(null);
  const setPendingHighlight = (id: string | null, query: string | null = null) => {
    pendingHighlightId.value = id;
    pendingHighlightQuery.value = query;
  };

  // Neural TTS Voice Synth settings (Voice Rework v2)
  const voicePresetId = ref('eugene');
  const voiceCalibratedPitch = ref(0);
  const f5ttsServerUrl = ref('http://localhost:8002');
  const voiceAdaptiveEnabled = ref(true);
  const voiceManualTier = ref<'turbo'|'standard'|'eco'|'auto'>('auto');
  const voiceCalibratedProcessList = ref<string[]>([]);
  const voiceAutoDetectExe = ref(true);
  const voiceTurboGpuThreshold = ref(50);
  const voiceCacheEnabled = ref(true);
  const voiceAutoClearCache = ref(false);
  const voiceDspEnabled = ref(false); // Robotic voice effect (DSP)
  const voiceCacheRamLimit = ref(100);
  const voiceCacheDiskLimitMb = ref(250);
  const voiceCalibrationStatus = ref<'absent'|'in_progress'|'ready'>('absent');
  const voiceStreamingEnabled = ref(true);
  const voiceMaxSentenceLen = ref(120);
  const voiceSentenceSplitHonour = ref(true);
  const voiceRuITN = ref(true);
  const voiceRuRawCodeMode = ref(true);

  // Legacy (Keep for migration)
  const ttsSpeed = ref(0.95);
  const ttsPitch = ref(-5);
  const ttsSampleRate = ref(48000);
  const ttsPutAccent = ref(true);
  const ttsPutYo = ref(true);

  // Performance & FPS overlay settings
  const showFpsOverlay = ref(false);
  const fpsGraphInterval = ref<1 | 2 | 5>(1);
  const logFpsToConsole = ref(false);

  // Advanced FPS and rendering control settings
  const targetFps = ref<'auto' | '30' | '60' | '120' | '144' | 'unlimited'>('auto');
  const disableVsync = ref(false);
  const renderScale = ref<0.5 | 0.75 | 1.0 | 1.25 | 1.5>(1.0);

  // Granular 3D Reactor Graphics Engine Settings
  const loadInitialGraphicsConfig = (): { preset: GraphicsPreset; config: GraphicsConfig } => {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedPreset =
          localStorage.getItem('arc_graphics_preset_v9') ||
          localStorage.getItem('arc_graphics_preset_v8') ||
          localStorage.getItem('arc_graphics_preset_v7') ||
          localStorage.getItem('arc_graphics_preset_v6') ||
          localStorage.getItem('arc_graphics_preset_v5') ||
          localStorage.getItem('arc_graphics_preset_v4') ||
          localStorage.getItem('arc_graphics_preset_v3') ||
          localStorage.getItem('arc_graphics_preset_v2') ||
          localStorage.getItem('arc_graphics_preset_v1');
        if (
          savedPreset === 'Low' ||
          savedPreset === 'Medium' ||
          savedPreset === 'High' ||
          savedPreset === 'Ultra' ||
          savedPreset === 'UltraPlus'
        ) {
          return {
            preset: savedPreset,
            config: cloneGraphicsConfig(GRAPHICS_PRESETS[savedPreset])
          };
        }
        const raw = localStorage.getItem('arc_graphics_config_v9');
        if (raw) {
          const parsed = JSON.parse(raw);
          const merged: GraphicsConfig = { ...GRAPHICS_PRESETS.High, ...parsed };
          const preset = detectMatchingPreset(merged);
          return { preset, config: merged };
        }
      }
    } catch {
      // Fallback to default High preset
    }
    return { preset: 'High', config: cloneGraphicsConfig(GRAPHICS_PRESETS.High) };
  };

  const initialGfx = loadInitialGraphicsConfig();
  const graphicsPreset = ref<GraphicsPreset>(initialGfx.preset);
  const graphicsConfig = ref<GraphicsConfig>(initialGfx.config);
  let isSyncingGraphics = false;

  const persistGraphicsConfig = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('arc_graphics_config_v9', JSON.stringify(graphicsConfig.value));
        localStorage.setItem('arc_graphics_preset_v9', graphicsPreset.value);
      }
    } catch {
      // Ignore storage quota errors
    }
  };

  function applyGraphicsPreset(preset: Exclude<GraphicsPreset, 'Custom'>) {
    isSyncingGraphics = true;
    graphicsPreset.value = preset;
    graphicsConfig.value = cloneGraphicsConfig(GRAPHICS_PRESETS[preset]);
    graphicsQuality.value = presetToLegacyQuality(preset, graphicsConfig.value);
    renderScale.value = graphicsConfig.value.renderScale;
    persistGraphicsConfig();
    isSyncingGraphics = false;
  }

  function updateGraphicsParam<K extends keyof GraphicsConfig>(key: K, value: GraphicsConfig[K]) {
    isSyncingGraphics = true;
    graphicsConfig.value = {
      ...graphicsConfig.value,
      [key]: value,
    };
    const matched = detectMatchingPreset(graphicsConfig.value);
    graphicsPreset.value = matched;
    graphicsQuality.value = presetToLegacyQuality(matched, graphicsConfig.value);
    if (key === 'renderScale') {
      renderScale.value = value as 0.5 | 0.75 | 1.0 | 1.25 | 1.5;
    }
    persistGraphicsConfig();
    isSyncingGraphics = false;
  }

  // Persistence of Tasks fullscreen mode
  const tasksFullscreen = ref(true);

  // VK Music custom audio page URL
  const vkAudioUrl = ref('https://vk.ru/audios553297430');
  const showMusicWidget = ref(true);
  const autoHideMusicWidget = ref(false);

  // Widget Controls (HUD Toggle & Lock)
  const showTechnicalHUD = ref(true);
  const showTimelineWidget = ref(true);
  const showSmartRouterWidget = ref(true);
  const showEnvironmentWidget = ref(false);
  const showVoiceWidget = ref(true);

  // Aliases for the 6 core HUD instruments (ТЗ S3 v3.2)
  const showTelemetryWidget = computed({
    get: () => showTechnicalHUD.value,
    set: (val: boolean) => { showTechnicalHUD.value = val; }
  });
  const showRoutingDiagramWidget = computed({
    get: () => showSmartRouterWidget.value,
    set: (val: boolean) => { showSmartRouterWidget.value = val; }
  });
  const showActionTimelineWidget = computed({
    get: () => showTimelineWidget.value,
    set: (val: boolean) => { showTimelineWidget.value = val; }
  });

  const widgetsLocked = ref(false);
  const widgetsDim = ref(true);
  const widgetDimOpacity = ref(50);

  // Modular Dock Panels Architecture
  const widgetLayoutMode = ref<'dock' | 'float'>('dock');
  const leftDockCollapsed = ref(false);
  const rightDockCollapsed = ref(false);

  function toggleLeftDock() {
    leftDockCollapsed.value = !leftDockCollapsed.value;
  }

  function toggleRightDock() {
    rightDockCollapsed.value = !rightDockCollapsed.value;
  }

  function toggleCleanCenter() {
    if (!leftDockCollapsed.value || !rightDockCollapsed.value) {
      leftDockCollapsed.value = true;
      rightDockCollapsed.value = true;
    } else {
      leftDockCollapsed.value = false;
      rightDockCollapsed.value = false;
    }
  }

  // Widget Sizes & States (Task #6)
  const widgetSizes = ref<Record<string, 'S' | 'M' | 'L'>>({
    'tech-hud': 'L',
    'timeline': 'L',
    'smart-router': 'L',
    'profiler': 'L',
    'music': 'L',
    'fps': 'L'
  });
  const widgetCompact = ref<Record<string, boolean>>({
    'tech-hud': true,
    'timeline': true,
    'smart-router': true,
    'profiler': true,
    'music': true,
    'fps': true
  });
  const widgetModes = ref<Record<string, 'ambient' | 'compact' | 'expanded'>>({
    'tech-hud': 'compact',
    'timeline': 'compact',
    'smart-router': 'compact',
    'profiler': 'compact',
    'music': 'compact',
    'fps': 'compact'
  });

  function getWidgetMode(key: string): 'ambient' | 'compact' | 'expanded' {
    if (widgetLayoutMode.value === 'dock') {
      return 'compact';
    }
    if (widgetModes.value[key]) return widgetModes.value[key];
    return widgetCompact.value[key] === false ? 'expanded' : 'compact';
  }

  function setWidgetMode(key: string, mode: 'ambient' | 'compact' | 'expanded') {
    widgetModes.value[key] = mode;
    widgetCompact.value[key] = mode !== 'expanded';
  }
  const widgetPreset = ref<'minimal' | 'standard' | 'full' | 'custom'>('standard');

  function resetWidgetPositions() {
    const keys = [
      'technical_hud',
      'music_capsule',
      'assistant_timeline',
      'smart_router_diagram',
      'fps_overlay'
    ];
    keys.forEach(key => {
      localStorage.removeItem('arc_widget_v8_' + key);
      localStorage.removeItem('arc_widget_v7_' + key);
      localStorage.removeItem('arc_widget_v6_' + key);
      localStorage.removeItem('arc_widget_v5_' + key);
      localStorage.removeItem('arc_widget_v4_' + key);
      localStorage.removeItem('arc_widget_v3_' + key);
      localStorage.removeItem('arc_widget_v2_' + key);
      localStorage.removeItem('arc_widget_' + key);
      localStorage.removeItem('arc_widget_arc_widget_' + key);
      localStorage.removeItem('arc_widget_v6_arc_widget_' + key);
      localStorage.removeItem(key);
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('arc_widgets_reset_positions'));
    }
  }

  // Migration function for user settings (Phase 1.6)
  const isMigrated = ref(false);

  function migrateSettings() {
    try {
      // Миграция: если у пользователя llmStreamingEnabled === false, но есть облачный провайдер — включить стриминг
      if (llmStreamingEnabled.value === false) {
        const aiConfig = useAiConfigStore();
        const hasCloudProvider = (aiConfig.providers || []).some((p: any) => p.type === 'cloud' && p.enabled !== false);
        if (hasCloudProvider) {
          llmStreamingEnabled.value = true;
          console.info('[Settings] Auto-enabled llmStreamingEnabled for cloud providers (migration)');
        }
      }

      if (typeof localStorage === 'undefined') {
        isMigrated.value = true;
        return;
      }

      const migratedFlag = localStorage.getItem('arc_settings_v4_migrated');
      if (migratedFlag === 'true') {
        isMigrated.value = true;
        return;
      }

      // Safe normalization for volume
      if (voiceVolume.value > 1.0 && voiceVolume.value <= 100) {
        voiceVolume.value = voiceVolume.value / 100;
      } else if (voiceVolume.value < 0) {
        voiceVolume.value = 1.0;
      }

      // Safe normalization for STT threshold
      if (sttVolumeThreshold.value < 0.001) {
        sttVolumeThreshold.value = 0.001;
      } else if (sttVolumeThreshold.value > 0.1) {
        sttVolumeThreshold.value = 0.1;
      }

      localStorage.setItem('arc_settings_v4_migrated', 'true');
      
      // Minimal Monolith reset migration
      if (!localStorage.getItem('arc_settings_v9_monolith_migrated')) {
        widgetModes.value = {
          'tech-hud': 'compact',
          'timeline': 'compact',
          'smart-router': 'compact',
          'profiler': 'compact',
          'music': 'compact',
          'fps': 'compact'
        };
        widgetCompact.value = {
          'tech-hud': true,
          'timeline': true,
          'smart-router': true,
          'profiler': true,
          'music': true,
          'fps': true
        };
        widgetPreset.value = 'standard';
        localStorage.setItem('arc_settings_v9_monolith_migrated', 'true');
      }

      isMigrated.value = true;
      console.log('A.R.C. Settings v4 migration applied successfully.');
    } catch (e) {
      console.warn('A.R.C. Settings migration skipped or unsupported:', e);
    }
  }

  // Run migration on store initialization
  migrateSettings();

  // Sync Toast State (Phase 3.3 Feedback)
  const lastChangedState = ref<{
    label: string;
    undo: () => void;
    isCritical?: boolean;
  } | null>(null);
  const lastChangedToastVisible = ref(false);
  let toastTimer: any = null;

  function triggerSyncToast(label: string, undoFn: () => void, isCritical = false) {
    if (toastTimer) clearTimeout(toastTimer);
    lastChangedState.value = {
      label,
      undo: () => {
        undoFn();
        lastChangedToastVisible.value = false;
      },
      isCritical
    };
    lastChangedToastVisible.value = true;
    const duration = isCritical ? 5000 : 3000;
    toastTimer = setTimeout(() => {
      lastChangedToastVisible.value = false;
    }, duration);
  }

  function dismissSyncToast() {
    lastChangedToastVisible.value = false;
  }

  // Watchers for settings feedback
  watch(language, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      triggerSyncToast(
        newVal === 'RU' ? 'Язык интерфейса: RU' : 'Interface Language: EN',
        () => { language.value = oldVal; }
      );
    }
  });

  watch(autoStart, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      triggerSyncToast(
        newVal ? 'Автозапуск включен' : 'Автозапуск отключен',
        () => { autoStart.value = oldVal; },
        true
      );
    }
  });

  watch(runInBackground, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      triggerSyncToast(
        newVal ? 'Фоновый режим включен' : 'Фоновый режим отключен',
        () => { runInBackground.value = oldVal; },
        true
      );
    }
  });

  watch(graphicsQuality, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      if (!isSyncingGraphics) {
        const mappedPreset: Exclude<GraphicsPreset, 'Custom'> =
          newVal === 'Low' ? 'Low' : newVal === 'Medium' ? 'Medium' : 'High';
        applyGraphicsPreset(mappedPreset);
      }
      triggerSyncToast(
        `Качество графики: ${newVal}`,
        () => { graphicsQuality.value = oldVal; }
      );
    }
  });

  watch(renderScale, (newScale) => {
    if (!isSyncingGraphics && graphicsConfig.value.renderScale !== newScale) {
      updateGraphicsParam('renderScale', newScale);
    }
  });

  // Automatically sync performance settings to Electron's JSON config
  watch([targetFps, disableVsync], () => {
    if (typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.savePerfConfig === 'function') {
      (window as any).api.savePerfConfig({
        targetFps: targetFps.value,
        disableVsync: disableVsync.value
      }).catch((e: any) => console.error('[Store] Failed to save performance config:', e));
    }
  }, { deep: true });

  // Load initial settings from Electron config on startup if available
  if (typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.loadPerfConfig === 'function') {
    (window as any).api.loadPerfConfig().then((config: any) => {
      if (config) {
        const migratedVsync = typeof localStorage !== 'undefined' && localStorage.getItem('arc_perf_vsync_v4_migrated') === 'true';
        if (!migratedVsync && (config.targetFps === '65' || config.targetFps === '60')) {
          targetFps.value = 'auto';
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('arc_perf_vsync_v4_migrated', 'true');
          }
        } else if (config.targetFps) {
          targetFps.value = config.targetFps === '65' ? 'auto' : config.targetFps;
        }
        if (typeof config.disableVsync === 'boolean') disableVsync.value = config.disableVsync;
      }
    }).catch((e: any) => console.error('[Store] Failed to load initial performance config:', e));
  }

  const addWakeWord = (word: string) => {
    if (word && word.trim() && !wakeWords.value.includes(word.trim())) {
      wakeWords.value.push(word.trim());
    }
  };

  const removeWakeWord = (index: number) => {
    if (index >= 0 && index < wakeWords.value.length) {
      wakeWords.value.splice(index, 1);
    }
  };

  const addSttCorrection = (wrong: string, correct: string) => {
    const w = wrong?.trim();
    const c = correct?.trim();
    if (w && c) {
      sttCorrections.value = {
        ...sttCorrections.value,
        [w]: c
      };
    }
  };

  const removeSttCorrection = (wrong: string) => {
    const updated = { ...sttCorrections.value };
    delete updated[wrong];
    sttCorrections.value = updated;
  };

  const clearSttCorrections = () => {
    sttCorrections.value = {};
  };

  const themeColors = computed(() => {
    return {
      text: 'text-[var(--accent-color,#ef4444)]',
      textLight: 'text-[var(--accent-text,#f87171)]',
      bg: 'bg-[var(--accent-color,#ef4444)]',
      border: 'border-[var(--accent-border,rgba(239,68,68,0.3))]',
      dropShadow: 'drop-shadow-[var(--accent-glow,0_0_8px_rgba(239,68,68,0.8))]',
      shadow: 'shadow-[var(--accent-glow,0_0_8px_rgba(239,68,68,0.8))]',
      shadowGlow: 'shadow-[var(--accent-glow,0_0_12px_rgba(239,68,68,0.8))]',
      bgGlow: 'bg-[var(--accent-bg-alpha,rgba(239,68,68,0.5))]',
      gradientFrom: 'from-[var(--accent-color,#ef4444)]',
      gradientB: 'from-[var(--accent-text,#f87171)] to-[var(--accent-color,#ef4444)]'
    };
  });

  function resetToDefaults() {
    const keepFirstRun = firstRunCompleted.value;
    const keepOnboardingVer = onboardingVersion.value;
    const previous = {
      language: language.value,
      darkMode: darkMode.value,
      voiceVolume: voiceVolume.value,
      sttVolumeThreshold: sttVolumeThreshold.value,
      sttSelectedMic: sttSelectedMic.value,
      tabBarPosition: tabBarPosition.value,
      pinnedTabs: [...pinnedTabs.value],
      directives: { ...directives.value },
      reactorPower: reactorPower.value,
      reactorSpeed: reactorSpeed.value,
      reactorColorTheme: reactorColorTheme.value,
      isAudioReactive: isAudioReactive.value,
      autoStart: autoStart.value,
      runInBackground: runInBackground.value,
      graphicsQuality: graphicsQuality.value,
      autoAdjustGraphics: autoAdjustGraphics.value,
      voiceFeedback: voiceFeedback.value,
      requireConfirm: requireConfirm.value,
      forcedOfflineMode: forcedOfflineMode.value,
      useLocalLLM: useLocalLLM.value,
      cloudLlmInGameMode: cloudLlmInGameMode.value,
      cloudLlmInBackgroundEco: cloudLlmInBackgroundEco.value,
      localLLMPriority: localLLMPriority.value,
      localLLMModel: localLLMModel.value,
      builtinLLMModel: builtinLLMModel.value, llmAutoUnloadMinutes: llmAutoUnloadMinutes.value, llmMaxContextSize: llmMaxContextSize.value, llmGpuOffloadMode: llmGpuOffloadMode.value, llmGpuLayers: llmGpuLayers.value, llmContextSummarization: llmContextSummarization.value,
      useSmartRouting: useSmartRouting.value,
      smartRoutingThreshold: smartRoutingThreshold.value,
      sttModel: sttModel.value,
      sttProvider: sttProvider.value,
      sttKeywordsEnabled: sttKeywordsEnabled.value,
      sttKeyword: sttKeyword.value,
      sttNoiseReduction: sttNoiseReduction.value,
      wakeWords: [...wakeWords.value],
      sttCorrections: { ...sttCorrections.value },
      autoSpeak: autoSpeak.value,
      autoDuckMusic: autoDuckMusic.value,
      audioDuckingPercentage: audioDuckingPercentage.value,
      aiPreprocessEnabled: aiPreprocessEnabled.value,
      llmStreamingEnabled: llmStreamingEnabled.value,
      smartCacheEnabled: smartCacheEnabled.value,
      autoDownloadLargeModels: autoDownloadLargeModels.value,
      voicePresetId: voicePresetId.value,
      voiceCalibratedPitch: voiceCalibratedPitch.value,
      f5ttsServerUrl: f5ttsServerUrl.value,
      voiceAdaptiveEnabled: voiceAdaptiveEnabled.value,
      voiceManualTier: voiceManualTier.value,
      voiceCalibratedProcessList: [...voiceCalibratedProcessList.value],
      voiceAutoDetectExe: voiceAutoDetectExe.value,
      voiceTurboGpuThreshold: voiceTurboGpuThreshold.value,
      voiceCacheEnabled: voiceCacheEnabled.value,
      voiceAutoClearCache: voiceAutoClearCache.value,
      voiceDspEnabled: voiceDspEnabled.value,
      voiceCacheRamLimit: voiceCacheRamLimit.value,
      voiceCacheDiskLimitMb: voiceCacheDiskLimitMb.value,
      voiceCalibrationStatus: voiceCalibrationStatus.value,
      voiceStreamingEnabled: voiceStreamingEnabled.value,
      voiceMaxSentenceLen: voiceMaxSentenceLen.value,
      voiceSentenceSplitHonour: voiceSentenceSplitHonour.value,
      voiceRuITN: voiceRuITN.value,
      voiceRuRawCodeMode: voiceRuRawCodeMode.value,
      ttsSpeed: ttsSpeed.value,
      ttsPitch: ttsPitch.value,
      ttsSampleRate: ttsSampleRate.value,
      ttsPutAccent: ttsPutAccent.value,
      ttsPutYo: ttsPutYo.value,
      showFpsOverlay: showFpsOverlay.value,
      fpsGraphInterval: fpsGraphInterval.value,
      logFpsToConsole: logFpsToConsole.value,
      targetFps: targetFps.value,
      disableVsync: disableVsync.value,
      renderScale: renderScale.value,
      tasksFullscreen: tasksFullscreen.value,
      vkAudioUrl: vkAudioUrl.value,
      showMusicWidget: showMusicWidget.value,
      autoHideMusicWidget: autoHideMusicWidget.value,
      showTechnicalHUD: showTechnicalHUD.value,
      showTimelineWidget: showTimelineWidget.value,
      showSmartRouterWidget: showSmartRouterWidget.value,
      widgetsLocked: widgetsLocked.value,
      widgetsDim: widgetsDim.value,
      widgetDimOpacity: widgetDimOpacity.value,
      widgetSizes: { ...widgetSizes.value },
      widgetCompact: { ...widgetCompact.value },
      widgetPreset: widgetPreset.value
    };

    language.value = 'RU';
    darkMode.value = true;
    voiceVolume.value = 1.0;
    sttVolumeThreshold.value = 0.003;
    sttSelectedMic.value = '';
    tabBarPosition.value = 'bottom';
    pinnedTabs.value = ['core', 'chat', 'objectives', 'settings'];
    directives.value = { creativity: 50, analytical: 80, aggression: 10, empathy: 30 };
    reactorPower.value = 1.0;
    reactorSpeed.value = 1.0;
    reactorColorTheme.value = 'red';
    isAudioReactive.value = true;
    autoStart.value = false;
    runInBackground.value = true;
    graphicsQuality.value = 'High';
    applyGraphicsPreset('High');
    autoAdjustGraphics.value = true;
    voiceFeedback.value = true;
    requireConfirm.value = true;
    forcedOfflineMode.value = false;
    useLocalLLM.value = false;
    cloudLlmInGameMode.value = true;
    localLLMPriority.value = 'fallback';
    localLLMModel.value = 'llama3.2';
    builtinLLMModel.value = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
    llmAutoUnloadMinutes.value = 10;
    llmMaxContextSize.value = 2048;
    llmGpuOffloadMode.value = 'auto';
    llmGpuLayers.value = -1;
    llmContextSummarization.value = true;
    useSmartRouting.value = false;
    smartRoutingThreshold.value = 30;
    sttModel.value = 'whisper-small';
    sttProvider.value = typeof window !== 'undefined' && (window as any).api ? 'sherpa' : 'native';
    sttKeywordsEnabled.value = true;
    sttKeyword.value = 'A.R.C.';
    sttNoiseReduction.value = true;
    wakeWords.value = ['A.R.C.', 'Арк', 'Hey ARC'];
    sttCorrections.value = {};
    autoSpeak.value = true;
    autoDuckMusic.value = true;
    audioDuckingPercentage.value = 70;
    aiPreprocessEnabled.value = false;
    llmStreamingEnabled.value = true;
    smartCacheEnabled.value = false;
    autoDownloadLargeModels.value = false;
    voicePresetId.value = 'eugene';
    voiceCalibratedPitch.value = 0;
    f5ttsServerUrl.value = 'http://localhost:8002';
    voiceAdaptiveEnabled.value = true;
    voiceManualTier.value = 'auto';
    voiceCalibratedProcessList.value = [];
    voiceAutoDetectExe.value = true;
    voiceTurboGpuThreshold.value = 50;
    voiceCacheEnabled.value = true;
    voiceAutoClearCache.value = false;
    voiceDspEnabled.value = false;
    voiceCacheRamLimit.value = 100;
    voiceCacheDiskLimitMb.value = 250;
    voiceCalibrationStatus.value = 'absent';
    voiceStreamingEnabled.value = true;
    voiceMaxSentenceLen.value = 120;
    voiceSentenceSplitHonour.value = true;
    voiceRuITN.value = true;
    voiceRuRawCodeMode.value = true;
    ttsSpeed.value = 0.95;
    ttsPitch.value = -5;
    ttsSampleRate.value = 48000;
    ttsPutAccent.value = true;
    ttsPutYo.value = true;
    showFpsOverlay.value = false;
    fpsGraphInterval.value = 1;
    logFpsToConsole.value = false;
    targetFps.value = 'auto';
    disableVsync.value = false;
    renderScale.value = 1.0;
    tasksFullscreen.value = true;
    vkAudioUrl.value = 'https://vk.ru/audios553297430';
    showMusicWidget.value = true;
    autoHideMusicWidget.value = false;
    showTechnicalHUD.value = true;
    showTimelineWidget.value = true;
    showSmartRouterWidget.value = true;
    widgetsLocked.value = false;
    widgetsDim.value = true;
    widgetDimOpacity.value = 50;
    widgetSizes.value = {
      'tech-hud': 'L',
      'timeline': 'L',
      'smart-router': 'L',
      'profiler': 'L',
      'music': 'L',
      'fps': 'L'
    };
    widgetCompact.value = {
      'tech-hud': true,
      'timeline': true,
      'smart-router': true,
      'profiler': true,
      'music': true,
      'fps': true
    };
    widgetModes.value = {
      'tech-hud': 'compact',
      'timeline': 'compact',
      'smart-router': 'compact',
      'profiler': 'compact',
      'music': 'compact',
      'fps': 'compact'
    };
    widgetPreset.value = 'custom';
    firstRunCompleted.value = keepFirstRun;
    onboardingVersion.value = keepOnboardingVer;

    triggerSyncToast(
      previous.language === 'EN' ? 'All settings reset to factory defaults' : 'Все настройки сброшены до заводских',
      () => {
        language.value = previous.language;
        darkMode.value = previous.darkMode;
        voiceVolume.value = previous.voiceVolume;
        sttVolumeThreshold.value = previous.sttVolumeThreshold;
        sttSelectedMic.value = previous.sttSelectedMic;
        tabBarPosition.value = previous.tabBarPosition;
        pinnedTabs.value = previous.pinnedTabs;
        directives.value = previous.directives;
        reactorPower.value = previous.reactorPower;
        reactorSpeed.value = previous.reactorSpeed;
        reactorColorTheme.value = previous.reactorColorTheme;
        isAudioReactive.value = previous.isAudioReactive;
        autoStart.value = previous.autoStart;
        runInBackground.value = previous.runInBackground;
        graphicsQuality.value = previous.graphicsQuality;
        autoAdjustGraphics.value = previous.autoAdjustGraphics;
        voiceFeedback.value = previous.voiceFeedback;
        requireConfirm.value = previous.requireConfirm;
        forcedOfflineMode.value = previous.forcedOfflineMode;
        useLocalLLM.value = previous.useLocalLLM; 
        cloudLlmInGameMode.value = previous.cloudLlmInBackgroundEco ?? previous.cloudLlmInGameMode ?? true;
        localLLMPriority.value = previous.localLLMPriority ?? "fallback";
        localLLMModel.value = previous.localLLMModel;
        builtinLLMModel.value = previous.builtinLLMModel;
        llmAutoUnloadMinutes.value = previous.llmAutoUnloadMinutes ?? 10;
        llmMaxContextSize.value = previous.llmMaxContextSize ?? 2048;
        llmGpuOffloadMode.value = previous.llmGpuOffloadMode ?? 'auto';
        llmGpuLayers.value = previous.llmGpuLayers ?? -1;
        llmContextSummarization.value = previous.llmContextSummarization ?? true;
        useSmartRouting.value = previous.useSmartRouting;
        smartRoutingThreshold.value = previous.smartRoutingThreshold;
        sttModel.value = previous.sttModel;
        sttProvider.value = previous.sttProvider;
        sttKeywordsEnabled.value = previous.sttKeywordsEnabled;
        sttKeyword.value = previous.sttKeyword;
        sttNoiseReduction.value = previous.sttNoiseReduction;
        wakeWords.value = previous.wakeWords;
        sttCorrections.value = previous.sttCorrections;
        if (previous.autoSpeak !== undefined) autoSpeak.value = previous.autoSpeak;
        if (previous.autoDuckMusic !== undefined) autoDuckMusic.value = previous.autoDuckMusic;
        if (previous.audioDuckingPercentage !== undefined) audioDuckingPercentage.value = previous.audioDuckingPercentage;
        aiPreprocessEnabled.value = previous.aiPreprocessEnabled;
        if (previous.llmStreamingEnabled !== undefined) llmStreamingEnabled.value = previous.llmStreamingEnabled;
        if (previous.smartCacheEnabled !== undefined) smartCacheEnabled.value = previous.smartCacheEnabled;
        if (previous.autoDownloadLargeModels !== undefined) autoDownloadLargeModels.value = previous.autoDownloadLargeModels;
        voicePresetId.value = previous.voicePresetId;
        voiceCalibratedPitch.value = previous.voiceCalibratedPitch;
        f5ttsServerUrl.value = previous.f5ttsServerUrl;
        voiceAdaptiveEnabled.value = previous.voiceAdaptiveEnabled;
        voiceManualTier.value = previous.voiceManualTier;
        voiceCalibratedProcessList.value = previous.voiceCalibratedProcessList;
        voiceAutoDetectExe.value = previous.voiceAutoDetectExe;
        voiceTurboGpuThreshold.value = previous.voiceTurboGpuThreshold;
        voiceCacheEnabled.value = previous.voiceCacheEnabled;
        voiceAutoClearCache.value = previous.voiceAutoClearCache;
        voiceDspEnabled.value = previous.voiceDspEnabled;
        voiceCacheRamLimit.value = previous.voiceCacheRamLimit;
        voiceCacheDiskLimitMb.value = previous.voiceCacheDiskLimitMb;
        voiceCalibrationStatus.value = previous.voiceCalibrationStatus;
        voiceStreamingEnabled.value = previous.voiceStreamingEnabled;
        voiceMaxSentenceLen.value = previous.voiceMaxSentenceLen;
        voiceSentenceSplitHonour.value = previous.voiceSentenceSplitHonour;
        voiceRuITN.value = previous.voiceRuITN;
        voiceRuRawCodeMode.value = previous.voiceRuRawCodeMode;
        ttsSpeed.value = previous.ttsSpeed;
        ttsPitch.value = previous.ttsPitch;
        ttsSampleRate.value = previous.ttsSampleRate;
        ttsPutAccent.value = previous.ttsPutAccent;
        ttsPutYo.value = previous.ttsPutYo;
        showFpsOverlay.value = previous.showFpsOverlay;
        fpsGraphInterval.value = previous.fpsGraphInterval;
        logFpsToConsole.value = previous.logFpsToConsole;
        targetFps.value = previous.targetFps;
        disableVsync.value = previous.disableVsync;
        renderScale.value = previous.renderScale;
        tasksFullscreen.value = previous.tasksFullscreen;
        vkAudioUrl.value = previous.vkAudioUrl;
        showMusicWidget.value = previous.showMusicWidget;
        autoHideMusicWidget.value = previous.autoHideMusicWidget;
        showTechnicalHUD.value = previous.showTechnicalHUD;
        showTimelineWidget.value = previous.showTimelineWidget;
        showSmartRouterWidget.value = previous.showSmartRouterWidget;
        widgetsLocked.value = previous.widgetsLocked;
        widgetsDim.value = previous.widgetsDim;
        widgetDimOpacity.value = previous.widgetDimOpacity;
        widgetSizes.value = previous.widgetSizes;
        widgetCompact.value = previous.widgetCompact;
        widgetPreset.value = previous.widgetPreset;
      },
      true
    );
  }

  return {
    language,
    darkMode,
    ecoMode,
    voiceVolume,
    sttVolumeThreshold,
    sttSelectedMic,
    directives,
    reactorPower,
    reactorSpeed,
    reactorColorTheme,
    isAudioReactive,
    autoStart,
    runInBackground,
    graphicsQuality,
    autoAdjustGraphics,
    voiceFeedback,
    requireConfirm,
    forcedOfflineMode,
    useLocalLLM,
    cloudLlmInGameMode,
    cloudLlmInBackgroundEco,
    localLLMPriority,
    localLLMModel,
    builtinLLMModel,
    llmAutoUnloadMinutes,
    llmMaxContextSize,
    llmGpuOffloadMode,
    llmGpuLayers,
    llmContextSummarization,
    useSmartRouting,
    smartRoutingThreshold,
    sttModel,
    sttEngine,
    sttProvider,
    sttKeywordsEnabled,
    sttKeyword,
    sttNoiseReduction,
    wakeWords,
    addWakeWord,
    removeWakeWord,
    sttCorrections,
    addSttCorrection,
    removeSttCorrection,
    clearSttCorrections,
    autoSpeak,
    autoDuckMusic,
    audioDuckingPercentage,
    aiPreprocessEnabled,
    llmStreamingEnabled,
    smartCacheEnabled,
    autoDownloadLargeModels,
    ollamaKeepAlive,
    ttsProvider,
    enableWebSearch,
    searchProvider,
    ttsSpeed,
    ttsPitch,
    ttsSampleRate,
    ttsPutAccent,
    ttsPutYo,
    voicePresetId,
    voiceCalibratedPitch,
    f5ttsServerUrl,
    voiceAdaptiveEnabled,
    voiceManualTier,
    voiceCalibratedProcessList,
    voiceAutoDetectExe,
    voiceTurboGpuThreshold,
    voiceCacheEnabled,
    voiceAutoClearCache,
    voiceDspEnabled,
    voiceCacheRamLimit,
    voiceCacheDiskLimitMb,
    voiceCalibrationStatus,
    voiceStreamingEnabled,
    voiceMaxSentenceLen,
    voiceSentenceSplitHonour,
    voiceRuITN,
    voiceRuRawCodeMode,
    showFpsOverlay,
    fpsGraphInterval,
    logFpsToConsole,
    targetFps,
    disableVsync,
    renderScale,
    graphicsPreset,
    graphicsConfig,
    applyGraphicsPreset,
    updateGraphicsParam,
    tasksFullscreen,
    vkAudioUrl,
    showMusicWidget,
    autoHideMusicWidget,
    showTechnicalHUD,
    showTimelineWidget,
    showSmartRouterWidget,
    showEnvironmentWidget,
    showVoiceWidget,
    showTelemetryWidget,
    showRoutingDiagramWidget,
    showActionTimelineWidget,
    widgetsLocked,
    widgetsDim,
    widgetDimOpacity,
    widgetLayoutMode,
    leftDockCollapsed,
    rightDockCollapsed,
    toggleLeftDock,
    toggleRightDock,
    toggleCleanCenter,
    widgetSizes,
    widgetCompact,
    widgetModes,
    getWidgetMode,
    setWidgetMode,
    widgetPreset,
    resetWidgetPositions,
    lastChangedState,
    lastChangedToastVisible,
    triggerSyncToast,
    dismissSyncToast,
    resetToDefaults,
    themeColors,
    tabBarPosition,
    pinnedTabs,
    pendingHighlightId,
    pendingHighlightQuery,
    setPendingHighlight,
    firstRunCompleted,
    onboardingVersion
  };
});
