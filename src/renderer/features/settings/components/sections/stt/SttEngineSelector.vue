<script setup lang="ts">
import { computed, watch } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';
import { useSttStatus } from '../../../composables/useSttStatus';
import { computeSttSubsystemStatus } from '../../../logic/voice-status';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import { RefreshCw } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const isElectronMode = typeof window !== 'undefined' && Boolean((window as any).api);

const {
  sttEngineReady,
  activeEngineName,
  sttStatusChecked,
  sttStatusChecking,
  sttLastError,
  sttModelsInstalled,
  sttMissingReason,
  sttSetupState,
  refreshSttStatus,
  applyEnginePayload
} = useSttStatus();

const sttStatus = computed(() =>
  computeSttSubsystemStatus({
    sttProvider: settingsStore.sttProvider,
    sttEngine: settingsStore.sttEngine,
    sttModel: settingsStore.sttModel,
    isElectronAvailable: isElectronMode,
    sttStatusChecked: sttStatusChecked.value,
    sttStatusChecking: sttStatusChecking.value,
    sttEngineReady: sttEngineReady.value,
    activeEngineName: activeEngineName.value,
    loadingProgress: uiStore.sttLoadingProgress,
    lastError: sttLastError.value,
    modelsInstalled: sttModelsInstalled.value,
    missingReason: sttMissingReason.value,
    setupState: sttSetupState.value
  })
);

const badgeClasses = computed(() => {
  switch (sttStatus.value.badgeTone) {
    case 'ok':
      return {
        pill: 'bg-[var(--arc-plane)] text-[var(--status-ok)] border-[var(--status-ok)]/30',
        dot: 'bg-[var(--status-ok)]'
      };
    case 'err':
      return {
        pill: 'bg-[var(--arc-plane)] text-[var(--status-err)] border-[var(--status-err)]/30',
        dot: 'bg-[var(--status-err)]'
      };
    case 'off':
      return {
        pill: 'bg-[var(--arc-plane)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)]',
        dot: 'bg-[var(--arc-text-muted)]'
      };
    default:
      return {
        pill: 'bg-[var(--arc-plane)] text-[var(--status-warn)] border-[var(--status-warn)]/30',
        dot: 'bg-[var(--status-warn)]'
      };
  }
});

const setSttEngineAction = async (engine: 'gigaam' | 'legacy') => {
  settingsStore.sttEngine = engine;
  if (engine === 'gigaam') {
    settingsStore.sttModel = 'gigaam-ctc';
  } else if (settingsStore.sttModel === 'gigaam-ctc') {
    settingsStore.sttModel = 'zipformer-ru';
  }
  applyEnginePayload({ ready: false, activeEngine: engine });
  if ((window as any).api?.setSttEngine) {
    try { await (window as any).api.setSttEngine(engine); } catch (err) {
      console.error('Failed to update STT engine mode:', err);
    }
  }
  if ((window as any).api?.switchSttModel) {
    try {
      const res = await (window as any).api.switchSttModel(settingsStore.sttModel);
      applyEnginePayload(res);
    } catch (err) {
      console.error('Failed to switch STT model:', err);
    }
  }
  await refreshSttStatus();
};

const reloadSttAction = async () => {
  const isGiga = settingsStore.sttModel === 'gigaam-ctc';
  const nextEngine = isGiga ? 'gigaam' : 'legacy';
  settingsStore.sttEngine = nextEngine;
  applyEnginePayload({ ready: false, activeEngine: nextEngine });
  if ((window as any).api?.setSttEngine) {
    try { await (window as any).api.setSttEngine(nextEngine); } catch {}
  }
  if ((window as any).api?.switchSttModel) {
    try {
      const res = await (window as any).api.switchSttModel(settingsStore.sttModel);
      applyEnginePayload(res);
    } catch (err) {
      console.error('Failed to switch STT model:', err);
    }
  } else if ((window as any).api?.reloadStt) {
    try {
      const res = await (window as any).api.reloadStt(settingsStore.sttModel);
      applyEnginePayload(res);
    } catch (err) {
      console.error('Failed to reload STT:', err);
    }
  }
  await refreshSttStatus();
};

watch(() => settingsStore.sttProvider, (newProvider) => {
  if (newProvider === 'sherpa') {
    if (!['gigaam-ctc', 'zipformer-ru', 'whisper-small', 'large-v3-turbo-ru'].includes(settingsStore.sttModel)) {
      settingsStore.sttModel = settingsStore.sttEngine === 'gigaam' ? 'gigaam-ctc' : 'zipformer-ru';
    }
  } else if (newProvider === 'whisper') {
    const validWhisperModels = ['tiny', 'base', 'small', 'onnx-community/whisper-large-v3-turbo'];
    if (!validWhisperModels.includes(settingsStore.sttModel)) {
      settingsStore.sttModel = 'tiny';
    }
  }
});
</script>

<template>
  <div class="p-4 sm:p-5 flex flex-col gap-5">
    <!-- STT Loading Progress Indicator -->
    <div 
      v-if="uiStore.sttLoadingProgress !== null" 
      class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-xl p-3.5 flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-3">
        <RefreshCw class="w-4 h-4 text-[var(--accent)] animate-spin" />
        <div class="flex flex-col">
          <span class="text-xs font-semibold font-mono text-[var(--accent)]">Подготовка нейросети распознавания...</span>
          <span class="text-xs font-mono text-[var(--arc-text-muted)]">Модель: {{ uiStore.sttLoadingModel }}</span>
        </div>
      </div>
      <span class="text-xs font-mono font-bold text-[var(--accent)] tabular-nums">{{ uiStore.sttLoadingProgress }}%</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <!-- STT Provider Selection -->
      <div id="settings.stt.engine_select" data-setting-id="settings.stt.engine_select" class="flex flex-col gap-2" data-search="движок распознавания stt provider engine sherpa native whisper">
        <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider">Провайдер распознавания</span>
        <div class="flex p-1 bg-[var(--arc-plane)] rounded-xl border border-[var(--arc-hairline)] gap-1">
          <button 
            type="button"
            @click="settingsStore.sttProvider = 'sherpa'"
            class="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            :class="settingsStore.sttProvider === 'sherpa' ? 'bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]' : 'text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] border border-transparent'"
            title="Sherpa ONNX — локальный офлайн-модуль"
          >
            Локальный
          </button>
          <button 
            type="button"
            @click="settingsStore.sttProvider = 'native'"
            class="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            :class="settingsStore.sttProvider === 'native' ? 'bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]' : 'text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] border border-transparent'"
            title="Native Web Speech API — системный модуль"
          >
            Системный
          </button>
          <button 
            type="button"
            @click="settingsStore.sttProvider = 'whisper'"
            class="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            :class="settingsStore.sttProvider === 'whisper' ? 'bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]' : 'text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] border border-transparent'"
            title="OpenAI Whisper — нейросетевой модуль"
          >
            Whisper
          </button>
        </div>
        <div v-if="settingsStore.sttProvider === 'whisper' && isElectronMode" class="mt-1 p-2.5 bg-[var(--arc-plane)] border border-[var(--status-warn)]/30 rounded-lg">
          <span class="text-xs text-[var(--status-warn)] font-mono leading-relaxed block">
            В десктопной версии Web Worker Whisper заменён на быстрый локальный контур Sherpa (GigaAM) через IPC.
          </span>
        </div>
      </div>

      <!-- STT Pipeline Architecture Mode -->
      <div v-if="settingsStore.sttProvider === 'sherpa'" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider">Архитектура конвейера</span>
          <span 
            class="text-xs font-mono px-2 py-0.5 rounded border flex items-center gap-1.5"
            :class="badgeClasses.pill"
          >
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="badgeClasses.dot"></span>
            <span>{{ sttStatus.badgeLabel }}</span>
          </span>
        </div>
        <div class="flex p-1 bg-[var(--arc-plane)] rounded-xl border border-[var(--arc-hairline)] gap-1">
          <button 
            type="button"
            @click="setSttEngineAction('gigaam')"
            class="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
            :class="settingsStore.sttEngine === 'gigaam' ? 'bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]' : 'text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] border border-transparent'"
            title="GigaAM — русскоязычная модель Сбера + VAD фильтр"
          >
            <span>Быстрый (GigaAM)</span>
          </button>
          <button 
            type="button"
            @click="setSttEngineAction('legacy')"
            class="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            :class="settingsStore.sttEngine === 'legacy' ? 'bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]' : 'text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] border border-transparent'"
            title="Whisper Fallback — резервная архитектура"
          >
            Резервный
          </button>
        </div>
      </div>

      <!-- Whisper Engine selector -->
      <div v-if="settingsStore.sttProvider === 'whisper'" class="flex flex-col gap-2">
        <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider">Модель Whisper</span>
        <ArcSelect
          :model-value="settingsStore.sttModel"
          :options="[
            { label: 'Ультрабыстрая (tiny, 70 МБ)', value: 'tiny' },
            { label: 'Сбалансированная (base, 140 МБ)', value: 'base' },
            { label: 'Высокая точность (small, 460 МБ)', value: 'small' },
            { label: 'Максимальная точность (large-v3-turbo, 800 МБ)', value: 'onnx-community/whisper-large-v3-turbo' }
          ]"
          @update:model-value="val => { settingsStore.sttModel = val; }"
        />
      </div>

      <!-- Sherpa Engine selector -->
      <div v-if="settingsStore.sttProvider === 'sherpa'" class="flex flex-col gap-2 lg:col-span-2">
        <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider">Активная модель Sherpa</span>
        <ArcSelect
          :model-value="settingsStore.sttModel"
          :options="[
            { label: 'Быстрая (GigaAM RU CTC 220M, 235 МБ)', value: 'gigaam-ctc' },
            { label: 'Стандартная (Whisper Small, 375 МБ)', value: 'whisper-small' },
            { label: 'Потоковая (Zipformer RU, 95 МБ)', value: 'zipformer-ru' }
          ]"
          @update:model-value="val => { settingsStore.sttModel = val; reloadSttAction(); }"
        />
      </div>
    </div>
  </div>
</template>
