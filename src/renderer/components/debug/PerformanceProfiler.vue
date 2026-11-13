<template>
  <div 
    v-if="settingsStore.showPerformanceWidget ?? true"
    ref="widgetRef"
    class="performance-profiler z-50 select-none pointer-events-auto"
    :style="positionStyle()"
  >
    <HudWidgetShell
      title="КАДРОВАЯ ЧАСТОТА"
      tag="GPU"
      category="system"
      side="right"
      :icon="Activity"
      :show-close="true"
      :force-visible="isDragging"
      :size="settingsStore.widgetSizes['profiler']"
      :mode="settingsStore.getWidgetMode('profiler')"
      @update:mode="(m) => settingsStore.setWidgetMode('profiler', m)"
      @close="closeWidget"
      @drag-start="onDragStart"
    >
      <!-- 1. Ambient Mode: Single-Row 32px Capsule Strip -->
      <template #ambient>
        <div class="flex items-center gap-1.5 font-mono text-xs truncate">
          <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="perfStatusColor"></span>
          <span class="text-white font-medium truncate">{{ uiStore.profilerStats.fps }} FPS</span>
          <span class="text-white/40">·</span>
          <span class="text-white/70">{{ uiStore.profilerStats.frameTime }} ms</span>
        </div>
      </template>

      <!-- 2. Compact Mode: Minimal Monolith FPS + Frametime -->
      <template #compact>
        <div class="row-data">
          <span class="txt-val-main">
            {{ uiStore.profilerStats.fps >= 55 ? 'Нагрузка WebGL' : 'Нагрузка на GPU' }}
          </span>
          <span class="txt-val-num" :class="uiStore.profilerStats.fps < 30 ? 'text-[var(--status-err)]' : 'text-[var(--status-ok)]'">
            {{ uiStore.profilerStats.fps }} FPS · {{ uiStore.profilerStats.frameTime }}ms
          </span>
        </div>
      </template>

      <!-- Full Telemetry Content (Expanded on Request) -->
      <div class="flex flex-col w-full gap-2 font-mono text-xs">
        <!-- 1. Dominant Metrics Strip -->
        <div class="grid grid-cols-2 gap-2 py-0.5 border-b border-white/[0.04]">
          <!-- FPS Metric -->
          <div class="flex flex-col">
            <div class="flex items-center justify-between text-white/40 text-xs uppercase tracking-wider">
              <span>ЧАСТОТА FPS</span>
              <span class="w-1.5 h-1.5 rounded-full" :class="perfStatusColor"></span>
            </div>
            <div class="flex items-baseline gap-1 mt-0.5">
              <span class="text-lg font-bold text-white tracking-tight">
                {{ uiStore.profilerStats.fps }}
              </span>
              <span class="text-white/30 text-xs">/ {{ settingsStore.targetFps || 60 }}</span>
            </div>
          </div>

          <!-- Frame Time Metric -->
          <div class="flex flex-col">
            <div class="flex items-center justify-between text-white/40 text-xs uppercase tracking-wider">
              <span>ВРЕМЯ КАДРА</span>
              <span class="text-white/30 text-xs">{{ uiStore.profilerStats.dpr }}X DPR</span>
            </div>
            <div class="flex items-baseline gap-1 mt-0.5">
              <span class="text-lg font-bold text-white tracking-tight">
                {{ uiStore.profilerStats.frameTime }}
              </span>
              <span class="text-white/30 text-xs">MS</span>
            </div>
          </div>
        </div>

        <!-- 2. Real-Time FPS Sparkline Graph -->
        <div class="flex flex-col gap-1 py-0.5">
          <div class="flex items-center justify-between text-xs text-white/35">
            <span>ГРАФИК FPS (60 СЕК)</span>
            <div class="flex items-center gap-1.5">
              <span>MIN: {{ minFps }}</span>
              <span>MAX: {{ maxFps }}</span>
            </div>
          </div>
          <canvas 
            ref="canvasRef" 
            width="260" 
            height="36" 
            class="w-full h-[36px] rounded-none bg-black/40 border border-white/[0.08]"
          ></canvas>
        </div>

        <!-- 3. Quality Profile Selector -->
        <div class="flex items-center justify-between py-1 border-t border-white/[0.08] text-xs">
          <span class="text-white/40 uppercase">ПРОФИЛЬ:</span>
          <div class="flex gap-1">
            <button
              v-for="profile in graphicsProfiles"
              :key="profile.key"
              @click.stop="applyGraphicsProfile(profile.key)"
              class="py-0.5 px-1.5 rounded-none transition cursor-pointer text-xs"
              :class="settingsStore.graphicsQuality === profile.key
                ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                : 'bg-[var(--arc-block)] border border-white/[0.08] text-white/40 hover:text-white/80'"
            >
              {{ profile.label }}
            </button>
          </div>
        </div>

        <!-- 4. Collapsible Technical Accordion -->
        <div class="border-t border-white/[0.08] pt-1">
          <button 
            @click="isDetailsOpen = !isDetailsOpen"
            class="w-full py-0.5 flex items-center justify-between text-white/40 hover:text-white transition cursor-pointer"
          >
            <span class="text-xs uppercase tracking-wider">ТЕХНИЧЕСКИЙ СТЕК</span>
            <ChevronDown 
              class="w-2.5 h-2.5 transition-transform duration-200"
              :class="isDetailsOpen ? 'rotate-180 text-[var(--accent)]' : 'text-white/30'"
            />
          </button>
          
          <div v-show="isDetailsOpen" class="pt-1 flex flex-col gap-1 text-xs">
            <div class="flex justify-between items-center text-white/50">
              <span>Draw Calls:</span>
              <span class="text-white/80">{{ uiStore.profilerStats.drawCalls }}</span>
            </div>
            <div class="flex justify-between items-center text-white/50">
              <span>Geometries:</span>
              <span class="text-white/80">{{ uiStore.profilerStats.geometries }}</span>
            </div>
            <div class="flex justify-between items-center text-white/50">
              <span>Textures:</span>
              <span class="text-white/80">{{ uiStore.profilerStats.textures }}</span>
            </div>
            <div class="flex justify-between items-center text-white/50">
              <span>Reactor GPU Load:</span>
              <span class="text-white/80">{{ uiStore.profilerStats.reactorLoad }}%</span>
            </div>
          </div>
        </div>

        <!-- 5. Cache Clear Action -->
        <div class="pt-1 border-t border-white/[0.04] flex justify-end">
          <button 
            @click="purgeRenderCache" 
            class="text-xs uppercase tracking-wider text-white/30 hover:text-white hover:bg-[var(--arc-hover)] px-1.5 py-0.5 rounded transition cursor-pointer"
          >
            [ {{ cachePurged ? 'ОЧИЩЕНО' : 'СБРОС КЭША' }} ]
          </button>
        </div>
      </div>
    </HudWidgetShell>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { Activity, ChevronDown } from 'lucide-vue-next';
import { useDraggableWidget } from '../../composables/useDraggableWidget';
import HudWidgetShell from '../ui/HudWidgetShell.vue';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const isDev = ref(true);
const widgetRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDetailsOpen = ref(false);
const cachePurged = ref(false);

const { onDragStart, positionStyle, isDragging } = useDraggableWidget('performance_profiler', { x: 24, y: 310, isRight: true }, widgetRef);

const graphicsProfiles = [
  { key: 'Low', label: 'НИЗКОЕ' },
  { key: 'Medium', label: 'СРЕДНЕЕ' },
  { key: 'High', label: 'ВЫСОКОЕ' }
];

const perfStatusColor = computed(() => {
  const fps = uiStore.profilerStats.fps;
  if (fps >= 55) return 'bg-[var(--status-ok)] shadow-[0_0_6px_var(--status-ok)]';
  if (fps >= 30) return 'bg-[var(--status-warn)] shadow-[0_0_6px_var(--status-warn)]';
  return 'bg-[var(--status-err)] shadow-[0_0_6px_var(--status-err)] animate-pulse';
});

const perfStatusColorText = computed(() => {
  const fps = uiStore.profilerStats.fps;
  if (fps >= 55) return 'text-[var(--status-ok)]';
  if (fps >= 30) return 'text-[var(--status-warn)]';
  return 'text-[var(--status-err)]';
});

const minFps = computed(() => {
  const history = uiStore.profilerStats.history;
  if (!history || history.length === 0) return 0;
  return Math.min(...history);
});

const maxFps = computed(() => {
  const history = uiStore.profilerStats.history;
  if (!history || history.length === 0) return 60;
  return Math.max(...history);
});

function closeWidget() {
  settingsStore.showPerformanceWidget = false;
  uiStore.showProfiler = false;
  settingsStore.showFpsOverlay = false;
}

function applyGraphicsProfile(quality: string) {
  settingsStore.graphicsQuality = quality as any;
}

function purgeRenderCache() {
  cachePurged.value = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('arc_purge_render_cache'));
  }
  setTimeout(() => {
    cachePurged.value = false;
  }, 2000);
}

// Sparkline Canvas Rendering Helper
function renderCanvasSparkline(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const history = uiStore.profilerStats.history || [];

  ctx.clearRect(0, 0, w, h);

  if (history.length < 2) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    return;
  }

  const step = w / Math.max(1, history.length - 1);
  const max = Math.max(60, ...history);
  const min = Math.max(0, Math.min(...history) - 5);
  const range = Math.max(1, max - min);

  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    const val = history[i];
    const x = i * step;
    const y = h - ((val - min) / range) * (h - 4) - 2;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.strokeStyle = 'var(--accent)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

onMounted(() => {
  if (settingsStore.widgetLayoutMode === 'dock') {
    settingsStore.setWidgetMode('profiler', 'compact');
  }
  const interval = setInterval(() => {
    renderCanvasSparkline(canvasRef.value);
  }, 500);
  onUnmounted(() => clearInterval(interval));
});
</script>
