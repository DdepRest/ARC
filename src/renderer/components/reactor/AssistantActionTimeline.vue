<template>
  <div 
    v-if="settingsStore.showTimelineWidget"
    ref="widgetRef"
    class="assistant-timeline z-20 select-none pointer-events-auto"
    :style="positionStyle()"
  >
    <HudWidgetShell
      title="02. АКТИВНОСТЬ"
      tag="PIPELINE"
      category="workspace"
      :has-dot="true"
      :icon="Activity"
      :show-close="true"
      :force-visible="isDragging"
      :size="settingsStore.widgetSizes['timeline']"
      :mode="settingsStore.getWidgetMode('timeline')"
      @update:mode="(m) => settingsStore.setWidgetMode('timeline', m)"
      @close="settingsStore.showTimelineWidget = false"
      @drag-start="onDragStart"
    >
      <template #header-actions>
        <button 
          @click.stop="runPipelineDemo" 
          class="text-white/40 hover:text-white transition cursor-pointer text-[8px] uppercase font-mono px-1.5 py-0.5 rounded-none bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-red-500/40"
          title="Запустить тест пайплайна ИИ"
        >
          <span>[ {{ isRunningDemo ? '...' : 'ТЕСТ' }} ]</span>
        </button>
      </template>

      <!-- 1. Ambient Mode: Single-Row 32px Capsule Strip -->
      <template #ambient>
        <div class="flex items-center gap-1.5 font-mono text-[9px] truncate">
          <span 
            class="w-1.5 h-1.5 rounded-full shrink-0" 
            :class="uiStore.timelineStep ? 'bg-red-400 shadow-[0_0_6px_#ef4444] animate-pulse' : 'bg-emerald-400/80'"
          ></span>
          <span class="text-white font-medium truncate">
            {{ activeEventTitle }}
          </span>
          <span class="text-white/40">·</span>
          <span class="text-white/70">
            {{ uiStore.timelineLatency || 18 }} ms
          </span>
        </div>
      </template>

      <!-- 2. Compact Mode: Minimal Monolith Activity + Latency -->
      <template #compact>
        <div class="row-data cursor-pointer" @click.stop="runPipelineDemo" title="Нажмите для проверки отклика пайплайна ИИ">
          <span class="txt-val-main" :title="activeEventTitle">
            {{ activeEventTitle }}
          </span>
          <span class="txt-val-num hover:text-emerald-400 transition-colors">
            {{ uiStore.timelineLatency || 1813 }} ms
          </span>
        </div>
      </template>

      <!-- Full Pipeline Nodes Flow (Expanded on Request) -->
      <div class="flex flex-col gap-2 w-full font-mono text-[9px]">
        <!-- Pipeline Track -->
        <div class="flex items-center justify-between py-1 relative w-full">
          <!-- Laser Progress Line -->
          <div class="absolute top-3.5 left-2 right-2 h-[1px] bg-white/[0.06] z-0">
            <div 
              class="h-full bg-gradient-to-r from-red-500 to-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)] transition-all duration-300"
              :style="{ width: `${activeRailPercent}%` }"
            ></div>
          </div>

          <div 
            v-for="step in steps" 
            :key="step.key"
            class="flex flex-col items-center gap-1 relative z-10 group flex-1 cursor-pointer select-none py-0.5"
            @mouseenter="hoveredStep = step.key"
            @mouseleave="hoveredStep = null"
            @click="selectStep(step.key)"
          >
            <div 
              class="w-5 h-5 rounded-none flex items-center justify-center border transition-all duration-150"
              :class="[
                uiStore.timelineStep === step.key 
                  ? 'bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] font-bold'
                  : isPastStep(step.key)
                    ? 'bg-white/[0.06] border-white/20 text-white/80'
                    : 'bg-[#06070a] border-white/10 text-white/30 group-hover:border-white/25 group-hover:text-white/60'
              ]"
            >
              <component :is="step.icon" class="w-2.5 h-2.5" />
            </div>

            <span 
              class="text-[7.5px] uppercase tracking-tighter transition-colors text-center"
              :class="uiStore.timelineStep === step.key ? 'text-red-400 font-bold' : isPastStep(step.key) ? 'text-white/60' : 'text-white/25'"
            >
              {{ step.label }}
            </span>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="flex items-center justify-between pt-1 border-t border-white/[0.08] text-[8.5px] text-white/40">
          <div class="flex items-center gap-1.5 truncate">
            <span class="dot" :class="uiStore.timelineStep ? 'dot-err' : 'dot-ok'"></span>
            <span class="truncate">{{ activeDetailText }}</span>
          </div>
          <span class="text-white/30 shrink-0 ml-1">{{ uiStore.timelineLatency || 18 }}MS</span>
        </div>
      </div>
    </HudWidgetShell>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { Mic, Brain, GitBranch, Wrench, MessageSquare, Volume2, Activity } from 'lucide-vue-next';
import { useDraggableWidget } from '../../composables/useDraggableWidget';
import HudWidgetShell from '../ui/HudWidgetShell.vue';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const widgetRef = ref<HTMLElement | null>(null);
const { onDragStart, positionStyle, isDragging } = useDraggableWidget('assistant_timeline', { x: 24, y: 100, isBottom: true }, widgetRef);

const hoveredStep = ref<string | null>(null);
const isRunningDemo = ref(false);
let demoTimer: any = null;

function selectStep(stepKey: string) {
  if (uiStore.timelineStep === stepKey) {
    uiStore.setTimelineStep(null as any);
  } else {
    uiStore.setTimelineStep(stepKey as any);
  }
}

function runPipelineDemo() {
  if (isRunningDemo.value) return;
  isRunningDemo.value = true;
  let currentIdx = 0;
  
  function next() {
    if (currentIdx < stepOrder.length) {
      uiStore.setTimelineStep(stepOrder[currentIdx] as any);
      currentIdx++;
      demoTimer = setTimeout(next, 500);
    } else {
      uiStore.setTimelineStep(null as any);
      isRunningDemo.value = false;
    }
  }
  next();
}

const steps = [
  { key: 'voice', label: '01.ГОЛОС', title: 'ГОЛОС // ЗАХВАТ', icon: Mic, detail: 'Распознавание речи STT' },
  { key: 'intent', label: '02.ИНТЕНТ', title: 'ИНТЕНТ // КЛАССИФИКАЦИЯ', icon: Brain, detail: 'Смысловой анализ намерения' },
  { key: 'router', label: '03.РОУТЕР', title: 'РОУТЕР // МАРШРУТ', icon: GitBranch, detail: 'Выбор LLM процессора' },
  { key: 'utility', label: '04.УТИЛИТА', title: 'УТИЛИТА // ВЫПОЛНЕНИЕ', icon: Wrench, detail: 'Вызов инструментов системы' },
  { key: 'response', label: '05.ОТВЕТ', title: 'ОТВЕТ // НЕЙРОСЕТЬ', icon: MessageSquare, detail: 'Генерация ответа моделью' },
  { key: 'synthesis', label: '06.СИНТЕЗ', title: 'СИНТЕЗ // СИЛЕРО', icon: Volume2, detail: 'Синтез аудиопотока речи' },
];

const stepOrder = ['voice', 'intent', 'router', 'utility', 'response', 'synthesis'];

function isPastStep(stepKey: string) {
  if (!uiStore.timelineStep) return false;
  const currentIdx = stepOrder.indexOf(uiStore.timelineStep);
  const targetIdx = stepOrder.indexOf(stepKey);
  return targetIdx !== -1 && currentIdx !== -1 && targetIdx < currentIdx;
}

const activeRailPercent = computed(() => {
  if (!uiStore.timelineStep) return 0;
  const idx = stepOrder.indexOf(uiStore.timelineStep);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / stepOrder.length) * 100);
});

const activeEventTitle = computed(() => {
  if (hoveredStep.value) {
    const s = steps.find(x => x.key === hoveredStep.value);
    return s ? s.title : 'ПАЙПЛАЙН';
  }
  if (uiStore.timelineStep) {
    const s = steps.find(x => x.key === uiStore.timelineStep);
    return s ? s.title : 'ОБРАБОТКА';
  }
  return 'ГОТОВ К ПРИЕМУ';
});

const activeDetailText = computed(() => {
  if (hoveredStep.value) {
    const s = steps.find(x => x.key === hoveredStep.value);
    return s ? s.detail : 'Пайплайн готов';
  }
  if (uiStore.timelineStep) {
    const s = steps.find(x => x.key === uiStore.timelineStep);
    return s ? s.detail : 'Выполнение задачи';
  }
  return 'Ожидание голосового или текстового ввода';
});
</script>
