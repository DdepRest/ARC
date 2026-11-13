<template>
  <div 
    v-if="settingsStore.showSmartRouterWidget"
    ref="widgetRef"
    class="smart-router-diagram z-20 select-none pointer-events-auto"
    :style="positionStyle()"
  >
    <HudWidgetShell
      title="03. РОУТЕР"
      tag="LLM"
      category="workspace"
      :icon="GitBranch"
      :show-close="true"
      :force-visible="isDragging"
      :size="settingsStore.widgetSizes['smart-router']"
      :mode="settingsStore.getWidgetMode('smart-router')"
      @update:mode="(m) => settingsStore.setWidgetMode('smart-router', m)"
      @close="settingsStore.showSmartRouterWidget = false"
      @drag-start="onDragStart"
    >
      <!-- 1. Ambient Mode: Single-Row 32px Capsule Strip -->
      <template #ambient>
        <div class="flex items-center gap-1.5 font-mono text-[9px] truncate">
          <span 
            class="w-1.5 h-1.5 rounded-full shrink-0" 
            :class="uiStore.activeRoute?.target === 'cloud' ? 'bg-amber-400' : 'bg-red-400 shadow-[0_0_6px_#ef4444]'"
          ></span>
          <span class="text-white font-medium truncate">
            {{ uiStore.activeRoute?.target === 'cloud' ? 'ОБЛАКО' : 'ЛОКАЛЬНО' }}
          </span>
          <span class="text-white/40">·</span>
          <span class="text-white/70">
            {{ uiStore.activeRoute?.target === 'cloud' ? '380 ms' : '12 ms' }}
          </span>
        </div>
      </template>

      <!-- 2. Compact Mode: Minimal Monolith Router + Latency -->
      <template #compact>
        <div 
          class="row-data cursor-pointer" 
          @click.stop="toggleRouting" 
          title="Нажмите для переключения роутера: Локально / Облако"
        >
          <span class="txt-val-main">
            {{ uiStore.activeRoute?.target === 'cloud' ? 'Gemini 2.5 Flash' : (uiStore.activeRoute?.model || 'Qwen 2.5 7B') }}
          </span>
          <span 
            class="txt-val-num transition-colors" 
            :class="uiStore.activeRoute?.target === 'cloud' ? 'text-amber-400' : 'text-emerald-400'"
          >
            {{ uiStore.activeRoute?.target === 'cloud' ? '380 ms' : '12 ms' }}
          </span>
        </div>
      </template>

      <!-- Full Telemetry Schematic (Expanded on Request) -->
      <div class="flex flex-col w-full gap-2 font-mono text-[9px]">
        <!-- 1. Schematic Line -->
        <div class="flex items-center justify-between text-[8px] text-white/40 py-0.5 border-b border-white/[0.04]">
          <span>QUERY</span>
          <span class="text-white/20">⟶</span>
          <span>CLASSIFIER</span>
          <span class="text-white/20">⟶</span>
          <span class="text-red-400">ROUTER</span>
        </div>

        <!-- 2. Dual Routes Branches Switcher -->
        <div class="grid grid-cols-2 gap-1.5 py-0.5">
          <!-- Local Target -->
          <div 
            class="p-2 rounded-none border transition-all cursor-pointer flex flex-col justify-between"
            :class="[
              uiStore.activeRoute?.target === 'local'
                ? 'bg-red-500/10 border-red-500/40 text-white shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                : 'bg-white/[0.015] border-white/[0.08] text-white/40 hover:border-white/20 hover:text-white/70'
            ]"
            @click="simulateRoute('local')"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-[9.5px]">ЛОКАЛЬНО</span>
              <span class="text-[8px] text-white/40">12MS</span>
            </div>
            <div class="flex items-center justify-between text-[7.5px] text-white/35 pt-1.5">
              <span>ОФФЛАЙН</span>
              <span>ПРИВАТНО</span>
            </div>
          </div>

          <!-- Cloud Target -->
          <div 
            class="p-2 rounded-none border transition-all cursor-pointer flex flex-col justify-between"
            :class="[
              uiStore.activeRoute?.target === 'cloud'
                ? 'bg-red-500/10 border-red-500/40 text-white shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                : 'bg-white/[0.015] border-white/[0.08] text-white/40 hover:border-white/20 hover:text-white/70'
            ]"
            @click="simulateRoute('cloud')"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-[9.5px]">ОБЛАКО</span>
              <span class="text-[8px] text-white/40">380MS</span>
            </div>
            <div class="flex items-center justify-between text-[7.5px] text-white/35 pt-1.5">
              <span>DEEP REASON</span>
              <span>ОНЛАЙН</span>
            </div>
          </div>
        </div>

        <!-- 3. Decision Reason -->
        <div v-if="uiStore.activeRoute?.cause" class="text-white/50 py-1 border-t border-white/[0.08] truncate text-[8px]">
          <span class="text-white/30 uppercase">ПРИЧИНА:</span> {{ uiStore.activeRoute.cause }}
        </div>
      </div>
    </HudWidgetShell>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { GitBranch } from 'lucide-vue-next';
import { useDraggableWidget } from '../../composables/useDraggableWidget';
import HudWidgetShell from '../ui/HudWidgetShell.vue';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const widgetRef = ref<HTMLElement | null>(null);
const { onDragStart, positionStyle, isDragging } = useDraggableWidget('smart_router_diagram', { x: 24, y: 310 }, widgetRef);

function simulateRoute(target: 'local' | 'cloud') {
  uiStore.setActiveRoute({
    target,
    model: target === 'local' ? (uiStore.activeModel || 'Qwen 2.5 7B') : 'Gemini 2.5 Flash',
    latency: target === 'local' ? 12 : 380,
    cause: target === 'local' ? 'Низкая сложность / оффлайн кэш' : 'Сложный запрос / рассуждения'
  });
}

function toggleRouting() {
  const nextTarget = uiStore.activeRoute?.target === 'cloud' ? 'local' : 'cloud';
  simulateRoute(nextTarget);
}
</script>
