<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import { RefreshCw } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const uiStore = useUIStore();

const sttEngineReady = ref(false);
const activeEngineName = ref('');
let unsubscribeEngineReady: (() => void) | null = null;
const isElectronMode = typeof window !== 'undefined' && Boolean((window as any).api);

onMounted(() => {
  if ((window as any).api?.getSttStatus) {
    (window as any).api.getSttStatus().then((s: any) => {
      if (s?.ready) {
        sttEngineReady.value = true;
        if (s.activeEngine) {
          activeEngineName.value = s.activeEngine;
          if (s.activeEngine === 'gigaam') {
            settingsStore.sttEngine = 'gigaam';
            settingsStore.sttModel = 'gigaam-ctc';
          }
        }
      }
    }).catch(() => {});
  }
  if ((window as any).api?.onSttEngineReady) {
    unsubscribeEngineReady = (window as any).api.onSttEngineReady((data: any) => {
      sttEngineReady.value = true;
      if (data?.engine) {
        activeEngineName.value = data.engine;
        if (data.engine === 'gigaam') {
          settingsStore.sttEngine = 'gigaam';
          settingsStore.sttModel = 'gigaam-ctc';
        }
      }
    });
  }
});

onUnmounted(() => {
  if (unsubscribeEngineReady) {
    unsubscribeEngineReady();
    unsubscribeEngineReady = null;
  }
});

const setSttEngineAction = async (engine: 'gigaam' | 'legacy') => {
  settingsStore.sttEngine = engine;
  if (engine === 'gigaam') {
    settingsStore.sttModel = 'gigaam-ctc';
  } else if (settingsStore.sttModel === 'gigaam-ctc') {
    settingsStore.sttModel = 'zipformer-ru';
  }
  if ((window as any).api?.setSttEngine) {
    try { await (window as any).api.setSttEngine(engine); } catch (err) {
      console.error('Failed to update STT engine mode:', err);
    }
  }
  if ((window as any).api?.switchSttModel) {
    try { await (window as any).api.switchSttModel(settingsStore.sttModel); } catch (err) {
      console.error('Failed to switch STT model:', err);
    }
  }
};

const reloadSttAction = async () => {
  const isGiga = settingsStore.sttModel === 'gigaam-ctc';
  const nextEngine = isGiga ? 'gigaam' : 'legacy';
  settingsStore.sttEngine = nextEngine;
  if ((window as any).api?.setSttEngine) {
    try { await (window as any).api.setSttEngine(nextEngine); } catch {}
  }
  if ((window as any).api?.switchSttModel) {
    try { await (window as any).api.switchSttModel(settingsStore.sttModel); } catch (err) {
      console.error('Failed to switch STT model:', err);
    }
  } else if ((window as any).api?.reloadStt) {
    try { await (window as any).api.reloadStt(settingsStore.sttModel); } catch (err) {
      console.error('Failed to reload STT:', err);
    }
  }
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
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider">Архитектура конвейера</span>
          <span 
            class="text-xs font-mono px-2 py-0.5 rounded border flex items-center gap-1.5"
            :class="sttEngineReady 
              ? 'bg-[var(--arc-plane)] text-[var(--status-ok)] border-[var(--status-ok)]/30' 
              : 'bg-[var(--arc-plane)] text-[var(--status-warn)] border-[var(--status-warn)]/30'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="sttEngineReady ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-warn)]'"></span>
            <span>{{ sttEngineReady ? `Активен (${activeEngineName.toUpperCase() || 'GIGAAM'})` : 'Инициализация...' }}</span>
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
