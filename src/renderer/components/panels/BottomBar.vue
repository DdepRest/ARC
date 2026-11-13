<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useSystemStore } from '../../stores/system.store';
import { useModelDownloadStore } from '../../features/modelDownload/stores/modelDownload.store';
import { useKeyboard } from '../../composables/useKeyboard';
import { useReactor } from '../../composables/useReactor';
import { useChat } from '../../features/chat/composables/useChat';
import { useVoice } from '../../composables/useVoice';
import { Mic, Cpu, Zap, MicOff, Upload, LayoutGrid } from 'lucide-vue-next';
import ModelContextIndicator from './ModelContextIndicator.vue';
import { registerSingleton } from '../../utils/arcGhostDetector';

const props = withDefaults(defineProps<{
  isWorkspacesExpanded?: boolean;
}>(), {
  isWorkspacesExpanded: false
});

const emit = defineEmits<{
  (e: 'toggle-workspaces'): void;
}>();

const uiStore = useUIStore();
const settingsStore = useSettingsStore();

let unregisterSingleton: (() => void) | null = null;

onMounted(() => {
  unregisterSingleton = registerSingleton('BottomBar');
});

onUnmounted(() => {
  if (unregisterSingleton) {
    unregisterSingleton();
    unregisterSingleton = null;
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (unregisterSingleton) {
      unregisterSingleton();
      unregisterSingleton = null;
    }
  });
} 
const systemStore = useSystemStore();
const downloadStore = useModelDownloadStore();
const reactor = useReactor();
const { sendMessage, isSearching } = useChat();

const handleSend = () => {
  if (!chatInput.value.trim()) return;
  if (uiStore.modelLoadingStatus?.status === 'loading') {
    uiStore.showToast('Модель инициализируется. Запрос будет обработан сразу после готовности.', 'info', 3000);
    return;
  }
  sendMessage(chatInput.value);
  chatInput.value = '';
};

const ramUsedGb = computed(() => {
  if (systemStore.metrics?.memoryUsedMb) {
    return (systemStore.metrics.memoryUsedMb / 1024).toFixed(1);
  }
  return ((systemStore.metrics?.memoryUsage || 0) * 0.08).toFixed(1);
});

const ramTotalGb = computed(() => {
  if (systemStore.metrics?.memoryTotalMb) {
    return (systemStore.metrics.memoryTotalMb / 1024).toFixed(1);
  }
  return '8.0';
});

const { isListening: isVoiceActive, startListening: startVoice, stopListening: stopVoice, transcript, partialTranscript, isModelLoaded, isTranscribing, transcribeProgress, modelProgress, isSpeakingVAD, rmsLevel } = useVoice();
const isContinuouslyListening = ref(false);

watch(isVoiceActive, (newVal) => {
  if (newVal !== isContinuouslyListening.value) {
    isContinuouslyListening.value = newVal;
    if (newVal) {
      uiStore.setListening(true);
      reactor.startListening();
    } else {
      uiStore.setListening(false);
      reactor.stopListening();
    }
  }
});

watch(transcript, (newText) => {
  if (newText) {
    transcript.value = ''; // Reset transcript ref without double-firing sendMessage
  }
});

const toggleContinuousListening = async () => {
  isContinuouslyListening.value = !isContinuouslyListening.value;
  if (isContinuouslyListening.value) {
    uiStore.setListening(true);
    reactor.startListening();
    try {
      await startVoice();
      if (!isVoiceActive.value) {
        isContinuouslyListening.value = false;
        uiStore.setListening(false);
        reactor.stopListening();
      }
    } catch (err) {
      console.warn('Voice start prevented:', err);
      isContinuouslyListening.value = false;
      uiStore.setListening(false);
      reactor.stopListening();
    }
  } else {
    uiStore.setListening(false);
    reactor.stopListening();
    stopVoice();
  }
};

const handleVoiceCommand = (e: any) => {
  const text = e.detail?.text;
  if (text) {
    sendMessage(text, undefined, true);
  }
};

onMounted(() => {
  window.addEventListener('arc:voice-command', handleVoiceCommand);
});

onUnmounted(() => {
  window.removeEventListener('arc:voice-command', handleVoiceCommand);
});

useKeyboard({
  'Space': (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    if (!isContinuouslyListening.value) toggleContinuousListening();
  }
});

const isFocused = ref(false);

const chatInput = ref('');
const placeholderText = computed(() => {
  if (partialTranscript.value) return partialTranscript.value;
  if (isSearching.value) return settingsStore.language === 'EN' ? 'A.R.C. IS ACCESSING DATABASES...' : 'A.R.C. ИЩЕТ В БАЗАХ ДАННЫХ...';
  if (!isModelLoaded.value && isContinuouslyListening.value) return settingsStore.language === 'EN' ? `LOADING A.R.C. VOICE MODEL... ${modelProgress.value}%` : `ЗАГРУЗКА ГОЛОСОВОЙ МОДЕЛИ... ${modelProgress.value}%`;
  if (isTranscribing.value) return settingsStore.language === 'EN' ? `PROCESSING VOICE... ${transcribeProgress.value}%` : `РАСПОЗНАВАНИЕ... ${transcribeProgress.value}%`;
  if (uiStore.reactorState === 'listening') return settingsStore.language === 'EN' ? 'A.R.C. IS LISTENING...' : 'СЛУШАЮ...';
  return settingsStore.language === 'EN' ? 'SPEAK WITH A.R.C....' : 'ГОВОРИТЕ С A.R.C....';
});
const openSpotlight = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-spotlight'));
  }
};

const sttStatus = computed<'idle' | 'ok' | 'err'>(() => {
  if (uiStore.sttErrorText) return 'err';
  if (isContinuouslyListening.value || isVoiceActive.value || isSpeakingVAD.value) return 'ok';
  return 'idle';
});

const sttLedClass = computed(() => {
  if (sttStatus.value === 'err') {
    return 'bg-[var(--status-err)] shadow-[0_0_8px_var(--status-err)]';
  }
  if (sttStatus.value === 'ok') {
    return 'bg-[var(--status-ok)] shadow-[0_0_8px_var(--status-ok)]';
  }
  return 'bg-[var(--status-off)]';
});

const sttLedTitle = computed(() => {
  if (sttStatus.value === 'err') return 'STT: Ошибка';
  if (sttStatus.value === 'ok') return 'STT: Захват речи';
  return 'STT: Ожидание';
});
</script>

<template>
  <div class="w-full relative pointer-events-auto group/bottom flex justify-center">
    
    <!-- Clean Command Console Container -->
    <div class="relative w-full flex flex-col items-center">
      
      <!-- Focused Input & Voice Bar -->
      <div 
        class="w-full relative z-20 flex items-center justify-between transition-all duration-300 h-13 select-none px-3.5 gap-2.5"
        :style="{
          background: isFocused ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.005) 100%)' : 'transparent',
          boxShadow: isFocused ? 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' : 'none'
        }"
        id="arc-speak-channel"
      >
        <!-- Cluster 1: Voice (SPACE chip + Mic + STT LED) -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- SPACE chip: widget-styled tech badge -->
          <div class="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[var(--arc-text-hint)] text-[10px] font-mono select-none shrink-0">
            <span class="text-white/80 font-semibold">SPACE</span>
            <span class="text-[var(--arc-text-hint)]">ГОЛОС</span>
          </div>

          <!-- Mic button + STT LED -->
          <div class="flex items-center gap-1.5">
            <button 
              type="button"
              data-arc-dock-btn="voice"
              class="w-8 h-8 rounded-full flex items-center justify-center outline-none group/mic relative cursor-pointer transition duration-200 shrink-0"
              @click="toggleContinuousListening"
              :class="isContinuouslyListening 
                ? 'bg-[rgba(var(--accent-rgb),0.20)] border border-[var(--accent)] text-[var(--accent)] shadow-[0_0_14px_rgba(var(--accent-rgb),0.45)]' 
                : 'bg-[var(--arc-plane)] hover:bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:border-white/15 text-white/70 hover:text-white'"
              title="Голосовой ввод (Пробел)"
            >
              <Mic v-if="isContinuouslyListening" class="w-3.5 h-3.5 text-[var(--accent)] animate-pulse pointer-events-none" />
              <MicOff v-else class="w-3.5 h-3.5 transition duration-150 pointer-events-none" />
            </button>
            <!-- STT State LED -->
            <span 
              class="w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200" 
              :class="sttLedClass" 
              :title="sttLedTitle"
            ></span>
          </div>
        </div>

        <!-- Vertical hairline divider 1 -->
        <div class="w-[1px] h-5 bg-[var(--arc-hairline)] shrink-0 select-none"></div>

        <!-- Cluster 2: Input Field with internal hairline border & focus ring -->
        <div 
          class="flex-1 min-w-0 flex items-center px-3 py-1.5 rounded-xl border border-[var(--arc-hairline)] bg-[var(--arc-plane)] transition-all duration-200"
          :class="isFocused ? 'ring-1 ring-[rgba(var(--accent-rgb),0.35)] border-[rgba(var(--accent-rgb),0.45)]' : 'hover:border-white/10'"
        >
          <input 
            v-model="chatInput"
            @keyup.enter="handleSend"
            @focus="isFocused = true; uiStore.setReactorState('listening')"
            @blur="isFocused = false; uiStore.setReactorState('idle')"
            type="text"
            :placeholder="placeholderText"
            class="flex-1 bg-transparent border-none text-white text-xs font-sans tracking-wider focus:outline-none placeholder:text-[var(--arc-text-hint)] placeholder:font-sans uppercase px-1 transition min-w-0"
          />

          <!-- Send Action Button -->
          <button 
            v-if="chatInput.trim()"
            @click="handleSend"
            class="ml-2 px-2.5 py-1 rounded-md bg-[rgba(var(--accent-rgb),0.20)] hover:bg-[rgba(var(--accent-rgb),0.30)] border border-[rgba(var(--accent-rgb),0.40)] text-[var(--accent)] text-[10px] font-mono font-bold tracking-wider uppercase transition cursor-pointer shrink-0 shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)]"
          >
            ВВОД
          </button>
        </div>

        <!-- Vertical hairline divider 2 -->
        <div class="w-[1px] h-5 bg-[var(--arc-hairline)] shrink-0 select-none"></div>

        <!-- Cluster 3: Workspaces + Search -->
        <div class="flex items-center gap-2 select-none shrink-0">
          <button 
            type="button"
            data-arc-dock-btn="workspaces"
            @click="$emit('toggle-workspaces')"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[10px] font-mono text-white/70 hover:text-white hover:bg-[var(--arc-block)] hover:border-white/15 transition cursor-pointer shrink-0"
            :class="isWorkspacesExpanded ? '!text-[var(--accent)] !border-[rgba(var(--accent-rgb),0.35)] !bg-[rgba(var(--accent-rgb),0.12)] font-bold shadow-[0_0_10px_rgba(var(--accent-rgb),0.25)]' : ''"
            title="Переключить панель пространств (Задачи, Файлы, Память, Модули)"
          >
            <LayoutGrid class="w-3.5 h-3.5 text-[var(--accent)]" />
            <span class="hidden sm:inline">РАЗДЕЛЫ</span>
          </button>

          <button 
            type="button"
            @click="openSpotlight"
            class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[10px] font-mono text-white/70 hover:text-white hover:bg-[var(--arc-block)] hover:border-white/15 transition cursor-pointer select-none shrink-0"
            title="Быстрый поиск (Ctrl+K / Cmd+K)"
          >
            <!-- ⌘K chip: machine-mono 10px, hairline-рамка, фон block -->
            <kbd class="px-1.5 py-0.5 rounded font-mono text-[10px] text-[var(--arc-text-hint)] border border-[var(--arc-hairline)] bg-[var(--arc-block)]">⌘K</kbd>
            <span>ПОИСК</span>
          </button>
        </div>
      </div>
      
      <!-- Energy beam connecting to the core, rising vertically from center input when focused -->
      <div 
        class="absolute bottom-11 left-1/2 -translate-x-1/2 w-[2px] bg-gradient-to-t from-white via-[var(--accent-bg-alpha,rgba(255,255,255,0.5))] to-transparent transition duration-700 ease-out z-10"
        :style="{
          height: isFocused ? '24vh' : '0px',
          opacity: isFocused ? '0.6' : '0',
          boxShadow: isFocused ? '0 0 16px var(--accent-bg-alpha, rgba(255,255,255,0.4)), 0 0 8px rgba(255, 255, 255, 0.6)' : 'none'
        }"
      ></div>

    </div>

  </div>
</template>
