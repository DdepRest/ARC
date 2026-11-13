<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useVoice } from '../../composables/useVoice';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { RefreshCw, Check, HardDrive, Download, ChevronDown, ChevronUp, Loader2 } from 'lucide-vue-next';
const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const onAfterEnter = (el: Element) => { (el as HTMLElement).style.willChange = "auto"; (el as HTMLElement).style.transform = "none"; };
const { isListening, isModelLoaded, isTranscribing, transcribeProgress, isSpeakingVAD, rmsLevel } = useVoice();
const showDone = ref(false);
const showModelMenu = ref(false);
interface STTModelItem {
  id: string; name: string; provider: string; downloaded: boolean; expectedSize: string; sizeBytes: number; incompatible?: boolean;
}
const availableModels = ref<STTModelItem[]>([]);
const sherpaAvailable = ref(true);
const liveModels = computed(() => availableModels.value);
const sherpaModels = computed(() => availableModels.value.filter(m => m.provider === 'sherpa' && m.id !== 'silero-vad'));
const whisperModels = computed(() => availableModels.value.filter(m => m.provider === 'whisper'));
const downloadStateMap = ref<Record<string, { status: 'idle' | 'downloading' | 'error', percent: number, errorMsg?: string }>>({});
const sttStatus = ref<{ ready: boolean }>({ ready: false });
const sttEngineReady = ref(false);
const activeEngineName = ref('');
let unsubscribeProgress: (() => void) | null = null, unsubscribeModelsUpdated: (() => void) | null = null, unsubscribeFallback: (() => void) | null = null, unsubscribeReady: (() => void) | null = null, unsubscribeEngineReady: (() => void) | null = null;
const quarantinedProviders = ref<{id: string, name: string, quarantineUntil: number}[]>([]);
let quarantineInterval: any = null;
const fetchModels = async () => {
  if (typeof window === 'undefined') return;
  try {
    if (window.api?.listSttModels) {
      const res = await window.api.listSttModels();
      if (Array.isArray(res)) { availableModels.value = res; sherpaAvailable.value = true; }
      else if (res && Array.isArray(res.models)) {
        availableModels.value = res.models;
        if (!res.isPending) sherpaAvailable.value = !!res.sherpaAvailable;
      }
    }
    if (window.api?.getQuarantinedAiProviders) quarantinedProviders.value = await window.api.getQuarantinedAiProviders();
  } catch (e) { console.warn('[VoiceQuickPanel] fetchModels failed:', e); }
};
const setupProgressSubscription = () => {
  if (!unsubscribeProgress && typeof window !== 'undefined' && window.api?.onSttDownloadProgress) {
    unsubscribeProgress = window.api.onSttDownloadProgress((data: any) => {
      if (!data?.modelId) return;
      if (!downloadStateMap.value[data.modelId]) downloadStateMap.value[data.modelId] = { status: 'idle', percent: 0 };
      if (typeof data.percent === 'number') downloadStateMap.value[data.modelId].percent = data.percent;
      if (data.status === 'completed') {
        downloadStateMap.value[data.modelId].status = 'idle';
        fetchModels();
        const target = liveModels.value.find(m => m.id === data.modelId);
        if (target) { target.downloaded = true; selectModel(target); }
      } else if (data.status === 'error') {
        downloadStateMap.value[data.modelId].status = 'error';
        downloadStateMap.value[data.modelId].errorMsg = data.error || 'Ошибка сети';
        fetchModels();
      } else if (data.status === 'downloading') {
        downloadStateMap.value[data.modelId].status = 'downloading';
      }
    });
  }
};
const downloadModel = async (model: STTModelItem) => {
  if (typeof window !== 'undefined' && window.api?.downloadSttModel) {
    downloadStateMap.value[model.id] = { status: 'downloading', percent: 0 };
    setupProgressSubscription();
    try { await window.api.downloadSttModel({ modelId: model.id, provider: model.provider }); }
    catch (err) { console.error('[VoiceQuickPanel] Download error:', err); }
    finally {
      if (downloadStateMap.value[model.id]?.status === 'downloading') downloadStateMap.value[model.id].status = 'idle';
      fetchModels();
    }
  }
};
const selectModel = async (model: STTModelItem) => {
  if (model.provider === 'whisper' || model.id.startsWith('Xenova/')) return;
  if (!model.downloaded) return downloadModel(model);
  if (model.provider === 'sherpa' && !sherpaAvailable.value) {
    uiStore.showToast('Движок Sherpa недоступен. Активен резервный Whisper.', 'error');
    return;
  }
  const isAlreadyGigaActive = model.id === 'gigaam-ctc' && activeEngineName.value === 'gigaam' && (sttStatus.value.ready || isModelLoaded.value);
  if ((model.id === settingsStore.sttModel && (sttStatus.value.ready || isModelLoaded.value)) || isAlreadyGigaActive) {
    settingsStore.sttModel = model.id;
    settingsStore.sttEngine = model.id === 'gigaam-ctc' ? 'gigaam' : 'legacy';
    sttStatus.value.ready = true;
    sttEngineReady.value = true;
    uiStore.setSttError(null);
    return;
  }
  if (model.provider === 'sherpa') settingsStore.sttProvider = 'sherpa';
  settingsStore.sttModel = model.id;
  settingsStore.sttEngine = model.id === 'gigaam-ctc' ? 'gigaam' : 'legacy';
  if (typeof window !== 'undefined' && window.api?.setSttEngine) {
    try { await window.api.setSttEngine(settingsStore.sttEngine); } catch {}
  }
  if (typeof window !== 'undefined' && (window.api?.switchSttModel || window.api?.reloadStt)) {
    const fn = window.api.switchSttModel ? window.api.switchSttModel.bind(window.api) : window.api.reloadStt.bind(window.api);
    const res = await fn(model.id);
    if (res?.ready) {
      sttStatus.value.ready = true;
      sttEngineReady.value = true;
      if (model.id === 'gigaam-ctc') activeEngineName.value = 'gigaam';
      uiStore.setSttError(null);
    }
    if (res?.fallback) {
      settingsStore.sttModel = res.activeModel || 'zipformer-ru';
      uiStore.showToast(res.message || 'Выбранная модель нестабильна, выполнен откат к базовой', 'warning');
      uiStore.setSttError(null);
    } else if (res && !res.ready && res.error) {
      uiStore.setSttLoading(null);
      const isDegraded = /config|degraded|fallback/i.test(res.error);
      const errText = /4294967295|-1|worker process exited/i.test(res.error)
        ? 'Критический сбой движка STT. Попробуйте другую модель или перезапустите приложение'
        : res.error;
      uiStore.setSttError(isDegraded ? null : errText);
      if (!isDegraded) console.error('STT Reload Error:', errText);
    } else {
      uiStore.setSttError(null);
    }
  }
};
const displayModelLabel = computed(() => {
  const currentId = settingsStore.sttModel;
  const found = liveModels.value.find(m => m.id === currentId);
  if (found) return found.name.split(' (')[0];
  if (currentId === 'gigaam-ctc' || activeEngineName.value === 'gigaam') return 'GigaAM RU CTC 220M';
  return currentId === 'large-v3-turbo-ru' ? 'Whisper Turbo' : (currentId || 'Zipformer RU');
});
const toggleModelMenu = () => { showModelMenu.value = !showModelMenu.value; if (showModelMenu.value) fetchModels(); };
onMounted(() => {
  fetchModels();
  setupProgressSubscription();
  if (typeof window !== 'undefined') {
    if (window.api?.getSttStatus) {
      window.api.getSttStatus().then((s: any) => {
        if (s?.ready) {
          sttStatus.value.ready = true;
          sttEngineReady.value = true;
          if (s.activeEngine) {
            activeEngineName.value = s.activeEngine;
            if (s.activeEngine === 'gigaam') { settingsStore.sttEngine = 'gigaam'; settingsStore.sttModel = 'gigaam-ctc'; }
          }
        }
      }).catch(() => {});
    }
    if (window.api?.onSttReady) {
      unsubscribeReady = window.api.onSttReady((data: any) => {
        sttStatus.value.ready = true;
        if (data?.engine === 'gigaam') { activeEngineName.value = 'gigaam'; settingsStore.sttEngine = 'gigaam'; settingsStore.sttModel = 'gigaam-ctc'; }
        uiStore.setSttError(null);
      });
    }
    if (window.api?.onSttEngineReady) {
      unsubscribeEngineReady = window.api.onSttEngineReady((data: any) => {
        sttEngineReady.value = true;
        sttStatus.value.ready = true;
        activeEngineName.value = data?.engine || '';
        if (data?.engine === 'gigaam') { settingsStore.sttEngine = 'gigaam'; settingsStore.sttModel = 'gigaam-ctc'; }
        uiStore.setSttError(null);
      });
    }
    if (window.api?.onSttModelsUpdated) {
      unsubscribeModelsUpdated = window.api.onSttModelsUpdated((res: any) => {
        if (res?.models && Array.isArray(res.models)) { availableModels.value = res.models; if (!res.isPending) sherpaAvailable.value = !!res.sherpaAvailable; }
      });
    }
    if (window.api?.onSttFallback) {
      unsubscribeFallback = window.api.onSttFallback((info: any) => {
        if (info?.model) { settingsStore.sttModel = info.model; uiStore.showToast(info.message || 'Выбранная модель нестабильна, выполнен откат к базовой', 'warning'); uiStore.setSttError(null); }
      });
    }
  }
  quarantineInterval = setInterval(fetchModels, 30000);
});
onUnmounted(() => {
  if (unsubscribeProgress) { unsubscribeProgress(); unsubscribeProgress = null; }
  if (unsubscribeModelsUpdated) { unsubscribeModelsUpdated(); unsubscribeModelsUpdated = null; }
  if (unsubscribeFallback) { unsubscribeFallback(); unsubscribeFallback = null; }
  if (unsubscribeReady) { unsubscribeReady(); unsubscribeReady = null; }
  if (unsubscribeEngineReady) { unsubscribeEngineReady(); unsubscribeEngineReady = null; }
  if (quarantineInterval) { clearInterval(quarantineInterval); quarantineInterval = null; }
});
watch(isTranscribing, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    showDone.value = true;
    setTimeout(() => { showDone.value = false; }, 2000);
  }
});
const soundBars = computed(() => {
  const count = 9;
  if (uiStore.isSoftPaused) {
    const time = Date.now() * 0.004;
    return Array.from({ length: count }, (_, i) => {
      const wave = Math.sin(time + i * 0.5) * 0.5 + 0.5;
      return Math.max(3, Math.round(wave * 12));
    });
  }
  const rms = rmsLevel.value || 0;
  return Array.from({ length: count }, () => {
    const minHeight = 3;
    const peakHeight = Math.min(14, Math.round(rms * 50));
    const noise = rms > 0.05 ? Math.floor(Math.random() * 2) : 0;
    return Math.max(minHeight, peakHeight + noise);
  });
});
const statusText = computed(() => {
  const isRU = settingsStore.language === 'RU';
  if (uiStore.sttLoadingProgress !== null) return isRU ? `STT ЗАГРУЖАЕТСЯ ${uiStore.sttLoadingProgress}%` : `STT LOADING ${uiStore.sttLoadingProgress}%`;
  if (uiStore.sttErrorText) return isRU ? 'ОШИБКА: ' + uiStore.sttErrorText : 'ERROR: ' + uiStore.sttErrorText;
  if (!isModelLoaded.value) return isRU ? 'STT ОШИБКА' : 'STT ERROR';
  if (uiStore.isSoftPaused) return isRU ? 'МЯГКАЯ ПАУЗА' : 'SOFT PAUSE';
  if (isTranscribing.value) return isRU ? `ОБРАБОТКА ${transcribeProgress.value}%` : `RECOGNIZING ${transcribeProgress.value}%`;
  if (showDone.value) return isRU ? 'ГОТОВО' : 'DONE';
  if (isSpeakingVAD.value) return isRU ? 'ГОЛОС ЗАФИКСИРОВАН' : 'VOICE DETECTED';
  return isRU ? 'STT ЗАГРУЖЕНА • ВВОД...' : 'STT LOADED • INTAKE...';
});
const statusDotClass = computed(() => {
  if (uiStore.sttErrorText || (!isModelLoaded.value && uiStore.sttLoadingProgress === null)) {
    return { ping: '', dot: 'bg-[var(--status-err)]' };
  }
  if (uiStore.sttLoadingProgress !== null || isTranscribing.value) {
    return { ping: 'bg-[var(--status-warn)] animate-ping', dot: 'bg-[var(--status-warn)] animate-pulse' };
  }
  if (uiStore.isSoftPaused) return { ping: 'bg-[var(--status-warn)] animate-pulse', dot: 'bg-[var(--status-warn)]' };
  if (showDone.value) return { ping: '', dot: 'bg-[var(--status-ok)]' };
  return { ping: 'bg-[var(--accent)] animate-ping', dot: 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]' };
});
</script>
<template>
  <transition name="fade-slide" @after-enter="onAfterEnter">
    <div 
      v-if="isListening || isTranscribing || showDone || uiStore.isSoftPaused"
      class="z-40 mb-1 relative flex flex-col items-center"
      id="voice-quick-panel-overlay"
    >
      <!-- STT Model Popover Dropdown -->
      <transition name="fade-slide" @after-enter="onAfterEnter">
        <div 
          v-if="showModelMenu" 
          class="absolute bottom-full mb-2 w-80 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[16px] p-3.5 shadow-2xl flex flex-col gap-2.5 z-50 text-[var(--arc-text-primary)] font-sans text-xs"
          :style="{
            background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 20px 48px rgba(0, 0, 0, 0.85)'
          }"
        >
          <div class="flex items-center justify-between pb-2.5 border-b border-[var(--arc-divider)] text-xs font-mono tracking-wider uppercase text-[var(--arc-text-secondary)]">
            <span class="flex items-center gap-1.5">
              <HardDrive class="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Модели STT (Распознавание)</span>
            </span>
            <button @click="fetchModels" class="hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer" title="Обновить">
              <RefreshCw class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
            <div v-if="sherpaModels.length > 0" class="flex items-center justify-between mb-1 mt-1">
              <span class="text-xs font-mono tracking-wider uppercase text-[var(--arc-text-muted)]">Live Speech (Sherpa)</span>
              <span v-if="!sherpaAvailable" class="px-2 py-0.5 rounded-[6px] text-xs font-bold tracking-wider uppercase bg-[var(--arc-block)] text-[var(--status-err)] border border-[var(--status-err)]">
                Fallback-режим
              </span>
            </div>
            <div 
              v-for="m in sherpaModels" 
              :key="m.id"
              class="p-2.5 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] flex items-center justify-between gap-2 transition"
              :class="{ 'border-[var(--status-ok)] bg-[var(--arc-selected)]': settingsStore.sttModel === m.id }"
            >
              <div class="flex flex-col gap-0.5 overflow-hidden">
                <div class="flex items-center gap-1">
                  <span class="font-bold text-xs truncate text-[var(--arc-text-primary)]">{{ m.name }}</span>
                </div>
                <span class="text-xs font-mono text-[var(--arc-text-muted)]">
                  {{ m.expectedSize }} • {{ m.downloaded ? 'Скачана' : 'Не скачана' }}
                </span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <div v-if="!m.downloaded" class="flex flex-col items-end gap-1">
                  <button @click="downloadModel(m)" :disabled="downloadStateMap[m.id]?.status === 'downloading'"
                    class="px-2.5 py-1 rounded-[8px] text-xs font-mono font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border"
                    :class="downloadStateMap[m.id]?.status === 'error' ? 'text-[var(--status-err)] border-[var(--status-err)]' : 'text-[var(--status-warn)] border-[var(--status-warn)]'">
                    <Loader2 v-if="downloadStateMap[m.id]?.status === 'downloading'" class="w-3 h-3 animate-spin" />
                    <Download v-else class="w-3 h-3" />
                    <span v-if="downloadStateMap[m.id]?.status === 'downloading'">{{ downloadStateMap[m.id]?.percent || 0 }}%</span>
                    <span v-else-if="downloadStateMap[m.id]?.status === 'error'">Повторить</span>
                    <span v-else>Скачать</span>
                  </button>
                  <span v-if="downloadStateMap[m.id]?.status === 'error'" class="text-xs text-[var(--status-err)] font-mono max-w-[100px] truncate">
                    {{ downloadStateMap[m.id]?.errorMsg }}
                  </span>
                </div>
                <span v-else-if="m.incompatible" class="px-2 py-0.5 rounded-[6px] text-xs font-mono text-[var(--status-err)] bg-[var(--arc-plane)] border border-[var(--status-err)] cursor-not-allowed select-none" title="Модель несовместима">Недоступна</span>
                <button v-else @click="selectModel(m)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition border" :class="settingsStore.sttModel === m.id && sttEngineReady ? 'bg-[var(--arc-selected)] text-[var(--status-ok)] border-[var(--status-ok)]' : 'bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] border-[var(--arc-hairline)]'">
                  <Check v-if="settingsStore.sttModel === m.id && sttEngineReady" class="w-3 h-3" />
                  <span>{{ settingsStore.sttModel === m.id ? (sttEngineReady ? 'Активна' : 'Загрузка...') : 'Выбрать' }}</span>
                </button>
              </div>
            </div>
            <div v-if="whisperModels.length > 0" class="text-xs font-mono tracking-wider uppercase text-[var(--arc-text-muted)] mb-1 mt-2">File Transcription (Whisper)</div>
            <div v-for="m in whisperModels" :key="m.id" class="p-2.5 rounded-[10px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-between gap-2 transition opacity-85">
              <div class="flex flex-col gap-0.5 overflow-hidden">
                <div class="flex items-center gap-1"><span class="font-bold text-xs truncate text-[var(--arc-text-primary)]">{{ m.name }}</span></div>
                <span class="text-xs font-mono text-[var(--arc-text-muted)]">{{ m.expectedSize }} • {{ m.downloaded ? 'Скачана' : 'Не скачана' }}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <div v-if="!m.downloaded" class="flex flex-col items-end gap-1">
                  <button @click="downloadModel(m)" :disabled="downloadStateMap[m.id]?.status === 'downloading'" class="px-2.5 py-1 rounded-[8px] text-xs font-mono font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border" :class="downloadStateMap[m.id]?.status === 'error' ? 'text-[var(--status-err)] border-[var(--status-err)]' : 'text-[var(--status-warn)] border-[var(--status-warn)]'">
                    <Loader2 v-if="downloadStateMap[m.id]?.status === 'downloading'" class="w-3 h-3 animate-spin" />
                    <Download v-else class="w-3 h-3" />
                    <span v-if="downloadStateMap[m.id]?.status === 'downloading'">{{ downloadStateMap[m.id]?.percent || 0 }}%</span>
                    <span v-else-if="downloadStateMap[m.id]?.status === 'error'">Повторить</span>
                    <span v-else>Скачать</span>
                  </button>
                </div>
                <span v-else class="px-2.5 py-1 rounded-[8px] text-xs font-mono text-[var(--arc-text-muted)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] select-none">Для файлов</span>
              </div>
            </div>
          </div>
          <div v-if="quarantinedProviders.length > 0" class="mt-2 pt-2 border-t border-[var(--arc-divider)] flex flex-col gap-1.5">
            <div class="text-xs font-mono tracking-wider uppercase text-[var(--status-err)] flex items-center gap-1.5"><span>Карантин LLM</span></div>
            <div v-for="p in quarantinedProviders" :key="p.id" class="p-2 rounded-[10px] bg-[var(--arc-block)] border border-[var(--status-err)] flex flex-col gap-0.5">
              <span class="text-xs font-bold text-[var(--status-err)]">{{ p.name }}: в карантине</span>
              <span class="text-xs font-mono text-[var(--arc-text-muted)]">(осталось {{ Math.max(0, Math.ceil((p.quarantineUntil - Date.now()) / 60000)) }} мин)</span>
            </div>
          </div>
        </div>
      </transition>
      <div 
        class="relative inline-flex items-center gap-2.5 px-3.5 py-1 rounded-full bg-[var(--arc-block)] border border-[var(--arc-hairline)]"
        :style="{
          backgroundImage: 'var(--arc-sheen)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.7)'
        }"
      >
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full relative">
            <div class="absolute inset-0 rounded-full opacity-70" :class="statusDotClass.ping"></div>
            <div class="w-2 h-2 rounded-full" :class="statusDotClass.dot"></div>
          </div>
          <!-- Status text -->
          <span class="text-xs font-mono tracking-[0.12em] font-medium text-[var(--arc-text-primary)] uppercase inline-block text-center w-[170px] antialiased transition-opacity duration-300">
            {{ statusText }}
          </span>
          <!-- STT Model Selector Toggle Button -->
          <button 
            @click="toggleModelMenu" 
            class="text-xs font-mono font-medium bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] px-2.5 py-0.5 rounded-full border border-[var(--arc-hairline)] flex items-center gap-1 transition cursor-pointer"
            title="Управление моделями STT"
          >
            <span>{{ displayModelLabel }}</span>
            <ChevronUp v-if="showModelMenu" class="w-3 h-3 text-[var(--arc-text-muted)]" />
            <ChevronDown v-else class="w-3 h-3 text-[var(--arc-text-muted)]" />
          </button>
          <!-- Active Conversation Countdown Badge -->
          <span 
            v-if="uiStore.conversationCountdown > 0"
            class="text-xs font-mono font-semibold bg-[var(--arc-plane)] text-[var(--status-warn)] px-2 py-0.5 rounded-full border border-[var(--status-warn)] flex items-center gap-1"
            title="10s Active Dialogue Window"
          >
            <span>ACTIVE</span>
            <span class="font-bold tabular-nums">{{ uiStore.conversationCountdown }}s</span>
          </span>
        </div>
        <!-- Inline Waveform / Progress icon -->
        <div class="flex items-center justify-center h-4 w-[48px]">
          <RefreshCw v-if="isTranscribing" class="w-3.5 h-3.5 text-[var(--status-warn)] animate-spin" />
          <Check v-else-if="showDone" class="w-3.5 h-3.5 text-[var(--status-ok)]" />
          <div v-else-if="isListening || uiStore.isSoftPaused" class="flex items-center gap-0.5 h-full">
            <div 
              v-for="(h, i) in soundBars" 
              :key="i"
              class="w-0.5 rounded-full bg-[var(--arc-hairline)]"
              :class="[uiStore.isSoftPaused ? '!bg-[var(--status-warn)]' : '', !uiStore.isSoftPaused && isSpeakingVAD ? '!bg-[var(--accent)]' : '']"
              style="height: 14px; transform-origin: center; transition: background-color 0.3s ease;"
              :style="{ transform: `scaleY(${Math.max(0.1, h / 16)})` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}
</style>
