<template>
  <ArcHudWidget :status="voiceStatus" :status-title="voiceStatusTitle">
    <div class="flex flex-col gap-3">
      <!-- Status row: Mic status & Wake word -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <!-- Circular Mic Icon with Pulse -->
          <div 
            class="w-8 h-8 rounded-full flex items-center justify-center border transition-all"
            :style="{
              borderColor: voiceStatus === 'ok' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.15)',
              backgroundColor: voiceStatus === 'ok' ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
              boxShadow: voiceStatus === 'ok' ? '0 0 14px rgba(var(--accent-rgb), 0.45)' : 'none'
            }"
          >
            <Mic class="w-4 h-4" :style="{ color: voiceStatus === 'ok' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.6)' }" />
          </div>
          <div class="flex flex-col">
            <span class="text-[13px] font-medium text-white leading-tight">
              {{ micStatusText }}
            </span>
            <span class="text-[10px] text-[var(--arc-text-muted)] font-mono">
              Канал STT
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 text-[10px] font-mono">
          <span class="text-[var(--arc-text-muted)] uppercase">СЛОВО:</span>
          <span class="px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-white font-semibold tracking-wider shadow-sm">
            {{ wakeWord }}
          </span>
        </div>
      </div>

      <!-- Last phrase row with Accent Quote Bar -->
      <div class="flex items-start gap-2.5 pt-2 border-t border-[rgba(255,255,255,0.06)] text-[12px]">
        <div class="w-1 h-3.5 rounded-full mt-0.5 shrink-0" :style="{ backgroundColor: 'var(--accent)' }"></div>
        <span class="text-white/60 truncate leading-snug">
          {{ lastPhraseText }}
        </span>
      </div>
    </div>
  </ArcHudWidget>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ArcHudWidget from './ArcHudWidget.vue';
import { useVoice } from '../../composables/useVoice';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { Mic } from 'lucide-vue-next';

const { voiceState, isListening, isTranscribing } = useVoice();
const settingsStore = useSettingsStore();
const uiStore = useUIStore();

const voiceStatus = computed<'ok' | 'err' | 'off'>(() => {
  if (voiceState.value === 'ERROR' || uiStore.sttErrorText) return 'err';
  if (isListening.value || isTranscribing.value) return 'ok';
  return 'off';
});

const voiceStatusTitle = computed(() => {
  if (voiceStatus.value === 'err') return 'Ошибка распознавания речи';
  if (voiceStatus.value === 'ok') return 'Идёт захват звука';
  return 'Ожидание кодового слова';
});

const micStatusText = computed(() => {
  if (voiceStatus.value === 'err') return 'Сбой STT';
  if (voiceStatus.value === 'ok') return 'Активен';
  return 'Ожидание';
});

const wakeWord = computed(() => {
  return settingsStore.wakeWords?.[0] || 'A.R.C.';
});

const lastPhraseText = computed(() => {
  return uiStore.lastSpokenResponse || 'Готов к голосовым командам';
});
</script>
