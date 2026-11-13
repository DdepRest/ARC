<template>
  <div
    class="z-10 pointer-events-none flex flex-col items-center gap-1 opacity-95 bg-black/90 backdrop-blur-xl px-8 py-3 rounded-b-2xl border-b border-x border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_16px_36px_rgba(0,0,0,0.7)] transition duration-75"
  >
    <div class="flex items-center gap-4">
      <!-- Status Indicators -->
      <div class="flex gap-1.5 h-3 items-end">
        <div
          class="w-1.5 rounded-sm transition duration-75" :style="{ backgroundColor: themeColor, boxShadow: `0 0 6px ${themeColor}` }"
          :class="uiStore.reactorState !== 'idle' ? 'h-full' : 'h-1.5 opacity-60'"
        ></div>
        <div
          class="w-1.5 rounded-sm transition duration-75" :style="{ backgroundColor: themeColor, boxShadow: `0 0 6px ${themeColor}` }"
          :class="['processing', 'speaking', 'alert', 'error'].includes(uiStore.reactorState) ? 'h-[80%]' : 'h-1.5 opacity-40'"
        ></div>
        <div
          class="w-1.5 rounded-sm transition duration-75" :style="{ backgroundColor: themeColor, boxShadow: `0 0 6px ${themeColor}` }"
          :class="['speaking', 'alert', 'error'].includes(uiStore.reactorState) ? 'h-[60%]' : 'h-1.5 opacity-20'"
        ></div>
      </div>
      
      <!-- Text -->
      <div class="flex flex-col">
        <div
          class="text-[12px] font-black font-sans tracking-[0.3em] uppercase min-w-[140px] text-center transition duration-75 text-white/90"
          :class="stateConfig.pulseClass"
        >
          {{ stateConfig.label }}
        </div>
        <div class="h-[1px] w-full bg-gradient-to-r from-transparent via-white/40 to-transparent mt-1 transition"></div>
      </div>

      <!-- Hex ID -->
      <div class="flex items-center gap-2 text-xs font-mono text-white/30 tracking-[0.1em]">
        <svg v-if="ecoStore.isEcoActive" class="w-3 h-3" :style="{ color: themeColor }" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.284.446-.574 1.054-.925 1.76A10.875 10.875 0 008 4c-3.145 0-5.753 1.954-7.009 5.372a1 1 0 001.077 1.34c1.173-.186 2.457-.36 3.655-.429a13.31 13.31 0 011.644.024 1 1 0 001.378-1.076A13.435 13.435 0 017 6c1.155 0 2.222.186 3.019.5a1 1 0 001.075-1.579c-.198-.184-.421-.365-.67-.54-.366-.255-.742-.486-1.127-.69a8.966 8.966 0 01.921-1.353c.241-.301.53-.616.923-.88z" clip-rule="evenodd" />
        </svg>
        {{ hexId }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useEcoStore } from '../../stores/eco.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { themeAccentHex } from '../reactor/modules/reactor-theme';

const settingsStore = useSettingsStore();
const themeColor = computed(() => {
  const hexNum = themeAccentHex(settingsStore.reactorColorTheme);
  return '#' + hexNum.toString(16).padStart(6, '0');
});


const uiStore = useUIStore();
const ecoStore = useEcoStore();

const stateConfig = computed(() => {
  if (uiStore.activeRoute && uiStore.activeRoute.cause) {
    const causeLC = uiStore.activeRoute.cause.toLowerCase();
    if (causeLC.includes('недоступен') || causeLC.includes('восстанавливается') || causeLC.includes('ошибка')) {
      return {
        label: uiStore.activeRoute.cause.toUpperCase(),
        pulseClass: 'animate-pulse',
      };
    }
  }

  const rState = uiStore.reactorState;
  switch (rState) {
    case 'listening':
      return { label: 'СЛУШАЮ', pulseClass: 'animate-pulse' };
    case 'processing':
      return { label: 'ДУМАЮ', pulseClass: 'animate-pulse' };
    case 'speaking':
      return { label: 'ГОВОРЮ', pulseClass: 'animate-pulse' };
    case 'alert':
      return { label: 'ПЕРЕГРУЗКА', pulseClass: 'animate-[pulse_0.2s_ease-in-out_infinite]' };
    case 'error':
      return { label: 'ОШИБКА', pulseClass: 'animate-[pulse_0.2s_ease-in-out_infinite]' };
    case 'success':
      return { label: 'ГОТОВО', pulseClass: '' };
    case 'idle':
    default:
      return { label: 'ГОТОВ', pulseClass: '' };
  }
});

const hexId = ref('0x0000');
let interval: number;

onMounted(() => {
  interval = setInterval(() => {
    hexId.value = '0x' + Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
  }, 1000);
});

onUnmounted(() => clearInterval(interval));
</script>

