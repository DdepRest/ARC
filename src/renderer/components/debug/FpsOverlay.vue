<template>
  <ArcHudWidget
    title="КАДРЫ"
    :status="status"
    :status-title="statusTitle"
    :has-menu="true"
    :show-header="true"
    @menu="showDetailsModal = true"
  >
    <template #header-action>
      <div class="flex items-center gap-1">
        <button 
          type="button" 
          @click.stop="resetStats" 
          class="min-w-[28px] min-h-[28px] p-1.5 rounded flex items-center justify-center text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] transition cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)]" 
          title="Сбросить статистику"
          aria-label="Сбросить статистику"
        >
          <RotateCcw class="w-3 h-3" />
        </button>
        <button 
          type="button" 
          @click.stop="showDetailsModal = true" 
          class="min-w-[28px] min-h-[28px] p-1.5 rounded flex items-center justify-center text-[var(--arc-text-muted)] hover:text-white hover:bg-[var(--arc-hover)] transition cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)]" 
          title="Диагностика WebGL"
          aria-label="Диагностика WebGL"
        >
          <Gauge class="w-3 h-3" />
        </button>
      </div>
    </template>

    <div class="flex flex-col gap-2 py-0.5 select-none font-mono">
      <!-- Top Row: Real FPS & Min/Max Frame Window -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex flex-col">
          <div class="flex items-baseline gap-1.5">
            <span class="text-[18px] font-semibold leading-none text-white tracking-tight">
              {{ realFps }}
            </span>
            <span class="text-[11px] text-[var(--arc-text-hint)] leading-none">fps</span>
            <span 
              class="ml-1 text-[10px] font-medium px-1 py-0.5 rounded leading-none"
              :class="isUncapped ? 'bg-[var(--arc-plane)] text-[var(--status-warn)]' : 'bg-[var(--arc-plane)] text-[var(--status-ok)]'"
            >
              {{ isUncapped ? 'RAF' : 'SYNC' }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span 
              class="w-1.5 h-1.5 rounded-full shrink-0" 
              :style="{ backgroundColor: statusColorVar }"
            ></span>
            <span class="text-[10px] text-[var(--arc-text-hint)] uppercase tracking-wider font-sans">
              {{ statusTitle }}
            </span>
          </div>
        </div>

        <!-- Right: Frame Interval & 10s Window -->
        <div class="flex flex-col items-end justify-center">
          <div class="flex items-baseline gap-1 text-[var(--arc-text-hint)]">
            <span class="text-[10px] uppercase tracking-wider">КАДР</span>
            <span class="text-[12px] font-semibold text-white font-mono">{{ frameDurationMs }}</span>
            <span class="text-[10px] text-[var(--arc-text-hint)]">ms</span>
          </div>
          <div class="flex items-center gap-1 text-[10px] text-[var(--arc-text-hint)] font-mono mt-0.5 tracking-tight">
            <span>MIN {{ minFps === 999 ? 0 : minFps }}</span>
            <span>·</span>
            <span>MAX {{ maxFps }}</span>
          </div>
        </div>
      </div>

      <!-- Sparkline: 60-Second Real-Time Frame Rate Timeline -->
      <div class="flex flex-col gap-1 p-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between px-0.5 text-[10px] text-[var(--arc-text-hint)] font-mono">
          <span class="uppercase font-semibold">ИСТОРИЯ (60S)</span>
          <span>{{ stabilityScore }}% СТАБИЛЬНОСТЬ</span>
        </div>
        <div class="relative w-full h-7 overflow-hidden rounded">
          <svg class="w-full h-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fps-spark-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="statusColorVar" stop-opacity="0.28" />
                <stop offset="100%" :stop-color="statusColorVar" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="12" x2="100" y2="12" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" stroke-width="1" />
            <path :d="fpsSparkPath.area" fill="url(#fps-spark-grad)" />
            <path :d="fpsSparkPath.line" fill="none" :stroke="statusColorVar" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle :cx="fpsSparkPath.lastPoint.x" :cy="fpsSparkPath.lastPoint.y" r="2" :fill="statusColorVar" />
          </svg>
        </div>
      </div>

      <!-- 3-Channel Technical Diagnostic Grid -->
      <div class="w-full grid grid-cols-3 gap-1.5 pt-1 border-t border-[var(--arc-hairline)]">
        <!-- Channel 1: Stability / SD -->
        <div class="flex flex-col gap-0.5 p-1 rounded-md bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">ДЕВИАЦИЯ</span>
          <span class="text-[11px] font-semibold text-white leading-none">
            {{ standardDeviation }} <span class="text-[10px] font-normal text-[var(--arc-text-hint)]">sd</span>
          </span>
        </div>

        <!-- Channel 2: Long Animation Frames (LoAF > 50ms) -->
        <div class="flex flex-col gap-0.5 p-1 rounded-md bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">LoAF</span>
          <span 
            class="text-[11px] font-semibold leading-none"
            :class="longFramesCount > 0 ? 'text-[var(--status-warn)]' : 'text-white'"
          >
            {{ longFramesCount }} <span class="text-[10px] font-normal text-[var(--arc-text-hint)]">лаг</span>
          </span>
        </div>

        <!-- Channel 3: Stutter Drops -->
        <div class="flex flex-col gap-0.5 p-1 rounded-md bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">ДРОПЫ</span>
          <span 
            class="text-[11px] font-semibold leading-none"
            :class="totalSharpDropsCount > 0 ? 'text-[var(--status-err)]' : 'text-white'"
          >
            {{ totalSharpDropsCount }} <span class="text-[10px] font-normal text-[var(--arc-text-hint)]">сбоев</span>
          </span>
        </div>
      </div>
    </div>
  </ArcHudWidget>

  <!-- Deep Diagnostic Audit Modal -->
  <FpsDetailsModal
    v-model="showDetailsModal"
    :is-ru="settingsStore.language === 'RU'"
    :gpu-info="gpuInfo"
    @apply-preset="applyPreset"
    @export-csv="exportCsvPerformanceData"
    @reset-stats="resetStats"
  />
</template>

<script setup lang="ts">
import { ref, computed, shallowRef, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import ArcHudWidget from '../widgets/ArcHudWidget.vue';
import FpsDetailsModal from './FpsDetailsModal.vue';
import { Gauge, RotateCcw } from 'lucide-vue-next';

const settingsStore = useSettingsStore();

// State
const showDetailsModal = ref(false);
const currentFps = ref(60), realFps = ref(60), minFps = ref(60), maxFps = ref(60);
const totalSharpDropsCount = ref(0), monitorHz = ref(60);
const sessionHistory = shallowRef<{ time: string; fps: number; realFps: number; delta: number }[]>([]);
const longFrames = shallowRef<number[]>([]);

const isUncapped = computed(() => settingsStore.targetFps === 'unlimited');

const frameDurationMs = computed(() => {
  if (realFps.value <= 0) return '0.0';
  return (1000 / realFps.value).toFixed(1);
});

const status = computed<'ok' | 'warn' | 'err'>(() => {
  if (realFps.value < 28) return 'err';
  return (realFps.value < 48 || totalSharpDropsCount.value > 5) ? 'warn' : 'ok';
});

const statusTitle = computed(() => {
  return status.value === 'err' ? 'КРИТИЧНО' : status.value === 'warn' ? 'ПРОСАДКА' : 'НОРМА';
});

const statusColorVar = computed(() => `var(--status-${status.value})`);

// GPU Detection
const gpuInfo = ref({
  renderer: 'Определение...',
  vendor: 'Определение...',
  webglVersion: 'WebGL 2.0',
  isHardwareAccelerated: true
});

const detectGpuHardware = () => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuInfo.value.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Generic GPU';
        gpuInfo.value.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Direct3D11 / OpenGL';
      }
      gpuInfo.value.webglVersion = gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0';
      const rLower = gpuInfo.value.renderer.toLowerCase();
      gpuInfo.value.isHardwareAccelerated = !rLower.includes('swiftshader') && !rLower.includes('software');

      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) loseContext.loseContext();
    }
  } catch (e) {
    console.warn('GPU hardware detection fallback:', e);
  }
};

// Ring buffer for FPS history
const FPS_BUFFER_SIZE = 60;
const realFpsRing = new Float32Array(FPS_BUFFER_SIZE);
let realFpsRingHead = 0;
let realFilledCount = 0;

const resetStats = () => {
  minFps.value = 999; maxFps.value = 0; realFpsRingHead = 0; realFilledCount = 0;
  totalSharpDropsCount.value = 0; sessionHistory.value = []; longFrames.value = [];
};

// Deviation & Stability
const standardDeviation = computed(() => {
  if (realFilledCount === 0) return '0.0';
  let sum = 0;
  for (let i = 0; i < realFilledCount; i++) sum += realFpsRing[i];
  const avg = sum / realFilledCount;
  let squareDiffs = 0;
  for (let i = 0; i < realFilledCount; i++) squareDiffs += Math.pow(realFpsRing[i] - avg, 2);
  return Math.sqrt(squareDiffs / realFilledCount).toFixed(1);
});

const longFramesCount = computed(() => longFrames.value.filter(d => d > 50).length);

const stabilityScore = computed(() => {
  const sd = parseFloat(standardDeviation.value);
  const score = 100 - (sd * 3.5) - (totalSharpDropsCount.value * 4) - (longFramesCount.value * 2);
  return Math.max(10, Math.min(100, Math.round(score)));
});

// Sparkline SVG path generation
const fpsSparkPath = computed(() => {
  const count = Math.min(60, Math.max(2, realFilledCount));
  const points: { x: number; y: number }[] = [];
  const maxScale = Math.max(60, monitorHz.value * 1.1);

  for (let i = 0; i < count; i++) {
    const idx = (realFpsRingHead - count + i + FPS_BUFFER_SIZE) % FPS_BUFFER_SIZE;
    const val = realFilledCount > 0 ? realFpsRing[idx] : 60;
    const x = (i / (count - 1)) * 100;
    const ratio = Math.max(0, Math.min(val, maxScale)) / maxScale;
    const y = 22 - (ratio * 20);
    points.push({ x, y });
  }

  if (points.length < 2) {
    return { line: 'M 0 12 L 100 12', area: 'M 0 12 L 100 12 L 100 24 L 0 24 Z', lastPoint: { x: 100, y: 12 } };
  }

  const line = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L 100 24 L 0 24 Z`;
  return { line, area, lastPoint: points[points.length - 1] };
});

// CSV Export
const exportCsvPerformanceData = () => {
  if (sessionHistory.value.length === 0) return;
  const rows = sessionHistory.value.map(row => `"${row.time}",${row.fps},${row.realFps},${row.delta}`).join('\n');
  const csvContent = 'Timestamp,RAF,RealFPS,Delta\n' + rows;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arc_fps_metrics_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Presets
const applyPreset = (preset: 'eco' | 'balanced' | 'ultra') => {
  const configs = {
    eco: { targetFps: '30', renderScale: 0.5, graphicsQuality: 'Low' as const },
    balanced: { targetFps: '60', renderScale: 0.75, graphicsQuality: 'Medium' as const },
    ultra: { targetFps: 'unlimited', renderScale: 1.0, graphicsQuality: 'High' as const }
  };
  Object.assign(settingsStore, configs[preset]);
};

// Measurement Loop
let animeFrameId: number | null = null;
let perfObserver: PerformanceObserver | null = null;
let frameCount = 0;
let lastTime = performance.now();
let lastRealTime = performance.now();

const isHidden = () => typeof document !== 'undefined' && document.hidden;

const stopMeasureLoop = () => {
  if (animeFrameId !== null) {
    cancelAnimationFrame(animeFrameId);
    animeFrameId = null;
  }
};

const resumeMeasureLoop = () => {
  if (animeFrameId === null && !isHidden()) {
    lastTime = performance.now();
    lastRealTime = performance.now();
    frameCount = 0;
    animeFrameId = requestAnimationFrame(measureLoop);
  }
};

const measureLoop = () => {
  if (isHidden()) {
    stopMeasureLoop();
    return;
  }
  frameCount++;
  const now = performance.now();

  if (now - lastTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastTime));
    currentFps.value = fps;
    frameCount = 0;
    lastTime = now;
  }

  if (now - lastRealTime >= 1000) {
    const elapsed = (now - lastRealTime) / 1000;
    const reactorFrames = (window as any).__reactorFrameCount;
    let rfps = Math.round(frameCount * 1000 / (now - lastRealTime));
    if (typeof reactorFrames === 'number') {
      rfps = Math.round(reactorFrames / elapsed);
      (window as any).__reactorFrameCount = 0;
    }
    const prev = realFps.value;
    const delta = prev > 0 ? rfps - prev : 0;
    realFps.value = rfps;

    realFpsRing[realFpsRingHead] = rfps;
    realFpsRingHead = (realFpsRingHead + 1) % FPS_BUFFER_SIZE;
    if (realFilledCount < FPS_BUFFER_SIZE) realFilledCount++;

    if (prev > 0 && delta < -18) {
      totalSharpDropsCount.value++;
    }

    // Min / Max over filled window
    let cMin = 999;
    let cMax = 0;
    const searchLimit = Math.min(10, realFilledCount);
    for (let i = 1; i <= searchLimit; i++) {
      const v = realFpsRing[(realFpsRingHead - i + FPS_BUFFER_SIZE) % FPS_BUFFER_SIZE];
      if (v < cMin) cMin = v;
      if (v > cMax) cMax = v;
    }
    minFps.value = cMin;
    maxFps.value = cMax;

    sessionHistory.value.push({ time: new Date().toLocaleTimeString(), fps: currentFps.value, realFps: rfps, delta });
    if (sessionHistory.value.length > 60) sessionHistory.value.shift();

    lastRealTime = now;
  }

  animeFrameId = requestAnimationFrame(measureLoop);
};

const handleVisibilityChange = () => {
  if (isHidden()) {
    stopMeasureLoop();
  } else {
    resumeMeasureLoop();
  }
};

onMounted(() => {
  detectGpuHardware();
  if (window.screen && (window.screen as any).refreshRate) {
    monitorHz.value = (window.screen as any).refreshRate;
  }
  resumeMeasureLoop();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', resumeMeasureLoop);

  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
    perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longFrames.value.push(entry.duration);
        if (longFrames.value.length > 60) longFrames.value.shift();
      }
    });
    perfObserver.observe({ type: 'long-animation-frame', buffered: true });
  }
});

onUnmounted(() => {
  stopMeasureLoop();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', resumeMeasureLoop);
  if (perfObserver) {
    perfObserver.disconnect();
    perfObserver = null;
  }
});
</script>
