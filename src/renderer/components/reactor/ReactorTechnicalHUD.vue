<template>
  <div 
    v-if="settingsStore.showTechnicalHUD"
    ref="widgetRef"
    class="reactor-technical-hud z-20 select-none pointer-events-auto"
    :style="positionStyle()"
  >
    <HudWidgetShell
      title="ТЕКУЩАЯ МОДЕЛЬ"
      tag="MODEL"
      category="system"
      :icon="Activity"
      :show-close="true"
      :force-visible="isDragging"
      :size="settingsStore.widgetSizes['tech-hud']"
      :mode="settingsStore.getWidgetMode('tech-hud')"
      @update:mode="(m) => settingsStore.setWidgetMode('tech-hud', m)"
      @close="settingsStore.showTechnicalHUD = false"
      @drag-start="onDragStart"
    >
      <!-- 1. Ambient Mode: Single-Row 32px Capsule Strip -->
      <template #ambient>
        <div class="flex items-center gap-1.5 font-mono text-[9px] truncate">
          <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="statusBadgeColor"></span>
          <span class="text-white font-medium truncate max-w-[100px]" :title="uiStore.activeModel || 'Qwen 2.5 7B'">
            {{ uiStore.activeModel || 'Qwen 2.5 7B' }}
          </span>
          <span class="text-white/40">·</span>
          <span class="text-white/70" :class="uiStore.isListening ? 'text-red-400 font-bold animate-pulse' : ''">
            {{ uiStore.isListening ? 'СЛУШАЮ' : 'ГОТОВ' }}
          </span>
        </div>
      </template>

      <!-- 2. Compact Mode: Minimal Monolith Model + Readiness -->
      <template #compact>
        <div 
          class="row-data cursor-pointer" 
          @click.stop="ecoStore.toggleEco()" 
          title="Нажмите для переключения режима: Энергосбережение / Активный"
        >
          <span class="txt-val-main" :title="uiStore.activeModel || 'Qwen 2.5 7B'">
            {{ uiStore.activeModel || 'Qwen 2.5 7B' }}
          </span>
          <span 
            class="txt-val-num transition-colors" 
            :class="uiStore.isListening ? 'text-red-400 font-bold animate-pulse' : ecoStore.isEcoActive ? 'text-amber-400/90' : 'text-emerald-400'"
          >
            {{ uiStore.isListening ? 'LISTENING' : ecoStore.isEcoActive ? 'STANDBY' : 'ONLINE' }}
          </span>
        </div>
      </template>

      <!-- Full Diagnostic Level (Expanded on Request) -->
      <div class="flex flex-col w-full gap-2 font-mono text-[9px]">
        <!-- 1. Core State & Model -->
        <div class="flex items-center justify-between py-1 border-b border-white/[0.08]">
          <div class="flex items-center gap-1.5 text-white/40 text-[8.5px] uppercase tracking-wider">
            <span class="text-red-400/80">01</span>
            <span>МОДЕЛЬ</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white font-medium truncate max-w-[130px]" title="Активная модель">
              {{ uiStore.activeModel || 'Qwen 2.5 7B' }}
            </span>
            <button 
              @click="openProviderSettings"
              class="text-[8px] px-1.5 py-0.5 rounded-none bg-white/[0.03] hover:bg-white/[0.08] text-white/40 hover:text-white border border-white/[0.08] transition cursor-pointer"
              title="Настройки провайдеров"
            >
              [CFG]
            </button>
          </div>
        </div>

        <!-- 2. Telemetry Rows (Mic, Sleep, Latency) -->
        <div class="flex flex-col gap-1.5 py-0.5">
          <!-- Voice Channel -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-white/40 text-[8.5px] uppercase tracking-wider">
              <span class="text-red-400/80">02</span>
              <span>ГОЛОС/МИК</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span 
                class="w-1.5 h-1.5 rounded-full"
                :class="uiStore.isListening ? 'bg-red-400 shadow-[0_0_6px_#ef4444] animate-pulse' : 'bg-white/20'"
              ></span>
              <span :class="uiStore.isListening ? 'text-red-400 font-bold' : 'text-white/70'">
                {{ uiStore.isListening ? 'СЛУШАЮ...' : 'ГОТОВ' }}
              </span>
            </div>
          </div>

          <!-- Power State -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-white/40 text-[8.5px] uppercase tracking-wider">
              <span class="text-red-400/80">03</span>
              <span>ЭНЕРГИЯ</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span :class="ecoStore.isEcoActive ? 'text-amber-400' : 'text-white/70'">
                {{ ecoStore.isEcoActive ? 'РЕЖИМ СНА' : '100% АКТИВЕН' }}
              </span>
              <button 
                @click="toggleSleepMode"
                class="text-[8px] px-1 py-0.2 rounded-none text-white/30 hover:text-white border border-white/[0.08] hover:border-white/20 transition cursor-pointer ml-1"
              >
                {{ ecoStore.isEcoActive ? 'БУДИТЬ' : 'СОН' }}
              </button>
            </div>
          </div>

          <!-- Latency -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-white/40 text-[8.5px] uppercase tracking-wider">
              <span class="text-red-400/80">04</span>
              <span>ОТКЛИК ЯДРА</span>
            </div>
            <span class="text-white/70">{{ uiStore.timelineLatency || 18 }} МС</span>
          </div>
        </div>

        <!-- 3. Bottom Minimal Controls -->
        <div class="flex items-center justify-between pt-1.5 border-t border-white/[0.08] text-[8.5px] text-white/40">
          <button 
            @click="copyTelemetrySnapshot" 
            class="hover:text-white transition cursor-pointer flex items-center gap-1 hover:bg-white/[0.03] px-1 rounded-none border border-transparent hover:border-white/[0.08]"
            title="Скопировать сводку телеметрии"
          >
            <span>[ {{ copied ? 'СКОПИРОВАНО' : 'СВОДКА' }} ]</span>
          </button>
          
          <button 
            @click="uiStore.toggleProfiler()" 
            class="hover:text-white transition cursor-pointer flex items-center gap-1 hover:bg-white/[0.03] px-1 rounded-none border border-transparent hover:border-white/[0.08]"
            :class="uiStore.showProfiler ? 'text-red-400 font-semibold' : ''"
            title="Открыть виджет производительности FPS"
          >
            <span>[ ПРОФАЙЛЕР ]</span>
          </button>
        </div>
      </div>
    </HudWidgetShell>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useEcoStore } from '../../stores/eco.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { Activity } from 'lucide-vue-next';
import { useDraggableWidget } from '../../composables/useDraggableWidget';
import HudWidgetShell from '../ui/HudWidgetShell.vue';
import { useSettingsNav } from '../../features/settings/composables/useSettingsNav';

const uiStore = useUIStore();
const ecoStore = useEcoStore();
const settingsStore = useSettingsStore();
const settingsNav = useSettingsNav();

const widgetRef = ref<HTMLElement | null>(null);
const { onDragStart, positionStyle, isDragging } = useDraggableWidget('technical_hud', { x: 24, y: 64 }, widgetRef);

const copied = ref(false);
const copyTelemetrySnapshot = async () => {
  const snapshot = `[A.R.C. Core Telemetry] Model: ${uiStore.activeModel || 'Qwen 2.5 7B'} | State: ${reactorStateRussian.value} | Mic: ${uiStore.isListening ? 'Listening' : 'Ready'} | Sleep: ${ecoStore.isEcoActive ? 'Active' : 'Off'} | Latency: ${uiStore.timelineLatency || 18}ms`;
  try {
    await navigator.clipboard.writeText(snapshot);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy telemetry snapshot', e);
  }
};

const openProviderSettings = () => {
  uiStore.activeTab = 'settings';
  settingsNav.activeTab.value = 'intelligence';
  settingsNav.activeSection.value = 'section-providers';
};

const toggleSleepMode = () => {
  ecoStore.isEcoActive = !ecoStore.isEcoActive;
};

const reactorStateRussian = computed(() => {
  switch (uiStore.reactorState) {
    case 'idle': return 'ГОТОВНОСТЬ';
    case 'thinking': return 'АНАЛИЗ ДАННЫХ';
    case 'executing': return 'ВЫПОЛНЕНИЕ';
    case 'speaking': return 'СИНТЕЗ РЕЧИ';
    case 'listening': return 'ПРИЕМ РЕЧИ';
    case 'error': return 'СБОЙ';
    case 'offline': return 'ОФФЛАЙН';
    default: return 'АКТИВЕН';
  }
});

const statusBadgeColor = computed(() => {
  if (uiStore.isListening) return 'bg-red-400 shadow-[0_0_8px_#ef4444] animate-pulse';
  if (ecoStore.isEcoActive) return 'bg-amber-400 shadow-[0_0_6px_#f59e0b]';
  return 'bg-[var(--status-ok)] shadow-[0_0_6px_var(--status-ok)]';
});
</script>
