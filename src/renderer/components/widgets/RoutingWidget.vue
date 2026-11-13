<template>
  <ArcHudWidget :status="routingStatus" :status-title="activeModelTitle">
    <div class="flex flex-col gap-3">
      <!-- Top: Active Model & Hero Latency -->
      <div class="flex items-baseline justify-between gap-3">
        <div class="flex flex-col min-w-0 flex-1">
          <span class="text-[15px] font-semibold text-white truncate font-mono tracking-tight">
            {{ activeModelName }}
          </span>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[11px] font-mono text-white/50">
              {{ executionEnv }}
            </span>
            <div class="w-1 h-1 rounded-full bg-[var(--arc-hairline)]"></div>
            <span class="text-[10px] font-mono text-[var(--accent)] font-semibold uppercase tracking-wider">
              ONLINE
            </span>
          </div>
        </div>

        <!-- Hero Latency (Single latency number on entire screen) -->
        <div class="flex flex-col items-end shrink-0">
          <div class="flex items-baseline gap-1">
            <span class="text-[26px] font-semibold leading-none text-white font-mono">
              {{ latencyValue }}
            </span>
            <span class="text-[11px] font-mono text-white/50 leading-none"> ms</span>
          </div>
          <!-- Red Accent Dash matching Screenshot -->
          <div class="w-7 h-[2px] rounded-full mt-2" :style="{ backgroundColor: 'var(--accent)' }"></div>
        </div>
      </div>

      <!-- Pipeline Chain: VAD -> STT -> LLM -> TTS with Circular Nodes -->
      <div class="flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/40 border border-white/[0.05]">
        <!-- VAD -->
        <div class="flex items-center gap-1.5" title="Голосовой детектор активности (VAD)">
          <span 
            class="w-2 h-2 rounded-full transition-shadow" 
            :style="{ 
              backgroundColor: getStatusColor(vadStatus),
              boxShadow: vadStatus === 'ok' ? '0 0 8px var(--status-ok)' : 'none'
            }"
          ></span>
          <span class="text-[11px] font-mono text-white/70">VAD</span>
        </div>
        <span class="text-[11px] text-white/20 select-none">→</span>

        <!-- STT -->
        <div class="flex items-center gap-1.5" title="Распознавание речи (STT)">
          <span 
            class="w-2 h-2 rounded-full transition-shadow" 
            :style="{ 
              backgroundColor: getStatusColor(sttStatus),
              boxShadow: sttStatus === 'ok' ? '0 0 8px var(--status-ok)' : 'none'
            }"
          ></span>
          <span class="text-[11px] font-mono text-white/70">STT</span>
        </div>
        <span class="text-[11px] text-white/20 select-none">→</span>

        <!-- LLM -->
        <div class="flex items-center gap-1.5" title="Нейросетевая логика (LLM)">
          <span 
            class="w-2 h-2 rounded-full transition-shadow" 
            :style="{ 
              backgroundColor: getStatusColor(llmStatus),
              boxShadow: llmStatus === 'ok' ? '0 0 8px var(--status-ok)' : 'none'
            }"
          ></span>
          <span class="text-[11px] font-mono text-white/70">LLM</span>
        </div>
        <span class="text-[11px] text-white/20 select-none">→</span>

        <!-- TTS -->
        <div class="flex items-center gap-1.5" title="Синтез речи (TTS)">
          <span 
            class="w-2 h-2 rounded-full transition-shadow" 
            :style="{ 
              backgroundColor: getStatusColor(ttsStatus),
              boxShadow: ttsStatus === 'ok' ? '0 0 8px var(--status-ok)' : 'none'
            }"
          ></span>
          <span class="text-[11px] font-mono text-white/70">TTS</span>
        </div>
      </div>

      <!-- Fallback info if active -->
      <div v-if="fallbackActive" class="flex items-center gap-1.5 text-[10px] font-mono px-1">
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
        <span class="text-[var(--status-warn)]">РЕЗЕРВНЫЙ КАНАЛ АКТИВЕН</span>
      </div>
    </div>
  </ArcHudWidget>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ArcHudWidget from './ArcHudWidget.vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useVoice } from '../../composables/useVoice';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const { voiceState, isListening, isTranscribing, isModelLoaded } = useVoice();

const activeModelName = computed(() => {
  if (uiStore.modelTelemetry?.modelName) {
    return uiStore.modelTelemetry.modelName;
  }
  return settingsStore.selectedModel || 'SILERO v5.6';
});

const executionEnv = computed(() => {
  if (isModelLoaded.value || settingsStore.selectedModel?.includes('local')) {
    return 'Локально';
  }
  return 'Облако';
});

const latencyValue = computed(() => {
  return uiStore.modelTelemetry?.latencyMs || 14;
});

const vadStatus = computed<'ok' | 'off'>(() => {
  return isListening.value ? 'ok' : 'off';
});

const sttStatus = computed<'ok' | 'warn' | 'err' | 'off'>(() => {
  if (voiceState.value === 'ERROR' || uiStore.sttErrorText) return 'err';
  if (isTranscribing.value || isListening.value) return 'ok';
  return 'off';
});

const llmStatus = computed<'ok' | 'off'>(() => {
  const isRecent = Date.now() - (uiStore.lastSpokenTime || 0) < 60000;
  if (isModelLoaded.value || isRecent) return 'ok';
  return 'off';
});

const ttsStatus = computed<'ok' | 'off'>(() => {
  return voiceState.value === 'SPEAKING' ? 'ok' : 'off';
});

const fallbackActive = computed(() => {
  return Boolean(uiStore.modelTelemetry?.fallbackUsed);
});

const routingStatus = computed<'ok' | 'warn' | 'err' | 'off'>(() => {
  if (sttStatus.value === 'err') return 'err';
  if (fallbackActive.value) return 'warn';
  return 'ok';
});

const activeModelTitle = computed(() => {
  return `${activeModelName.value} (${executionEnv.value})`;
});

const getStatusColor = (status: 'ok' | 'warn' | 'err' | 'off') => {
  switch (status) {
    case 'ok': return 'var(--status-ok)';
    case 'warn': return 'var(--status-warn)';
    case 'err': return 'var(--status-err)';
    default: return 'var(--status-off)';
  }
};
</script>
