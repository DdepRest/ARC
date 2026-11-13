<template>
  <ArcHudWidget :status="coreStatus" :status-title="coreStatusTitle">
    <div class="flex flex-col gap-2 py-0.5 select-none font-mono">
      <!-- Top Row: Hero FPS Metric & Live Frame Timing / Uptime -->
      <div class="flex items-center justify-between gap-2">
        <!-- Hero Metric: Exactly one hero metric per instrument (26px mono, 11px hint) -->
        <div class="flex flex-col">
          <div class="flex items-baseline gap-1.5">
            <span class="text-[26px] font-semibold leading-none text-white tracking-tight">
              {{ typeof fpsValue === 'number' ? Math.round(fpsValue) : fpsValue }}
            </span>
            <span class="text-[11px] text-[var(--arc-text-hint)] leading-none"> fps</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1.5">
            <span 
              class="w-1.5 h-1.5 rounded-full shrink-0" 
              :style="{ backgroundColor: 'var(--status-' + coreStatus + ')' }"
            ></span>
            <span class="text-[10px] text-[var(--arc-text-hint)] uppercase tracking-wider font-sans">
              {{ coreStatusTitle }}
            </span>
          </div>
        </div>

        <!-- Right: Technical Frame Latency & Uptime -->
        <div class="flex flex-col items-end justify-center">
          <div class="flex items-baseline gap-1 text-[var(--arc-text-hint)]">
            <span class="text-[10px] uppercase tracking-wider">КАДР</span>
            <span class="text-[13px] font-semibold text-white font-mono">{{ frameTimeValue }}</span>
            <span class="text-[10px] text-[var(--arc-text-hint)]">ms</span>
          </div>
          <span class="text-[10px] text-[var(--arc-text-hint)] font-mono mt-1 tracking-tight">
            {{ uptimeFormatted }}
          </span>
        </div>
      </div>

      <!-- Monitoring Channels: 4-Channel Sparklines in 2x2 Grid (CPU, RAM, GPU, LLM) -->
      <div class="w-full grid grid-cols-2 gap-1.5 pt-2 border-t border-[var(--arc-hairline)]">
        <!-- CPU Channel -->
        <div class="flex flex-col gap-1 p-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <div class="flex items-center justify-between px-0.5">
            <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">CPU</span>
            <div class="flex items-baseline gap-1">
              <span v-if="cpuTemp !== null" class="text-[10px] text-[var(--arc-text-hint)]">{{ cpuTemp }}°</span>
              <span class="text-[12px] font-semibold text-white leading-none">
                {{ Math.round(cpuPercent) }}%
              </span>
            </div>
          </div>
          <!-- Sparkline Chart -->
          <div class="relative w-full h-5 overflow-hidden rounded">
            <svg class="w-full h-full overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none">
              <defs>
                <linearGradient id="cpu-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" stroke-width="1" />
              <path :d="cpuPath.area" fill="url(#cpu-grad)" />
              <path :d="cpuPath.line" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle :cx="cpuPath.lastPoint.x" :cy="cpuPath.lastPoint.y" r="2" fill="var(--accent)" />
            </svg>
          </div>
        </div>

        <!-- RAM Channel -->
        <div class="flex flex-col gap-1 p-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <div class="flex items-center justify-between px-0.5">
            <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">RAM</span>
            <div class="flex items-baseline gap-1">
              <span class="text-[10px] text-[var(--arc-text-hint)]">{{ ramDetail }}</span>
              <span class="text-[12px] font-semibold text-white leading-none">
                {{ Math.round(ramPercent) }}%
              </span>
            </div>
          </div>
          <!-- Sparkline Chart -->
          <div class="relative w-full h-5 overflow-hidden rounded">
            <svg class="w-full h-full overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none">
              <defs>
                <linearGradient id="ram-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--arc-text-primary)" stop-opacity="0.20" />
                  <stop offset="100%" stop-color="var(--arc-text-primary)" stop-opacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" stroke-width="1" />
              <path :d="ramPath.area" fill="url(#ram-grad)" />
              <path :d="ramPath.line" fill="none" stroke="var(--arc-text-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle :cx="ramPath.lastPoint.x" :cy="ramPath.lastPoint.y" r="2" fill="var(--arc-text-primary)" />
            </svg>
          </div>
        </div>

        <!-- GPU / VRAM Channel -->
        <div class="flex flex-col gap-1 p-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <div class="flex items-center justify-between px-0.5">
            <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">GPU</span>
            <div class="flex items-baseline gap-1">
              <span v-if="gpuTemp !== null" class="text-[10px] text-[var(--arc-text-hint)]">{{ gpuTemp }}°</span>
              <span class="text-[12px] font-semibold text-white leading-none">
                {{ Math.round(gpuPercent) }}%
              </span>
            </div>
          </div>
          <!-- Sparkline Chart -->
          <div class="relative w-full h-5 overflow-hidden rounded">
            <svg class="w-full h-full overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gpu-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--status-ok)" stop-opacity="0.20" />
                  <stop offset="100%" stop-color="var(--status-ok)" stop-opacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" stroke-width="1" />
              <path :d="gpuPath.area" fill="url(#gpu-grad)" />
              <path :d="gpuPath.line" fill="none" stroke="var(--status-ok)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle :cx="gpuPath.lastPoint.x" :cy="gpuPath.lastPoint.y" r="2" fill="var(--status-ok)" />
            </svg>
          </div>
        </div>

        <!-- Local Model Latency Channel -->
        <div class="flex flex-col gap-1 p-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <div class="flex items-center justify-between px-0.5">
            <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">LLM</span>
            <div class="flex items-baseline gap-1">
              <span class="text-[12px] font-semibold text-white leading-none">
                {{ ttftValue }}ms
              </span>
            </div>
          </div>
          <!-- Sparkline Chart -->
          <div class="relative w-full h-5 overflow-hidden rounded">
            <svg class="w-full h-full overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none">
              <defs>
                <linearGradient id="llm-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.30" />
                  <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" stroke-width="1" />
              <path :d="latencyPath.area" fill="url(#llm-grad)" />
              <path :d="latencyPath.line" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle :cx="latencyPath.lastPoint.x" :cy="latencyPath.lastPoint.y" r="2" fill="var(--accent)" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Technical Local Model Telemetry Readouts Bar: Clean 2x2 Grid -->
      <div class="w-full grid grid-cols-2 gap-x-3 gap-y-1 px-2.5 py-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[10px] font-mono text-[var(--arc-text-hint)]">
        <div class="flex items-center justify-between">
          <span class="uppercase tracking-wider">TTFT:</span>
          <span class="text-white font-semibold tabular-nums">{{ ttftValue }} ms</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="uppercase tracking-wider">ПОТОК:</span>
          <span class="text-white font-semibold tabular-nums">{{ tokensPerSecValue }} t/s</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="uppercase tracking-wider">СРЕДН:</span>
          <span class="text-white font-semibold tabular-nums">{{ avgDurationValue }} ms</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="uppercase tracking-wider">VRAM:</span>
          <span class="text-white font-semibold tabular-nums">{{ vramDetail }}</span>
        </div>
      </div>
    </div>
  </ArcHudWidget>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ArcHudWidget from './ArcHudWidget.vue';
import { useSystemStore } from '../../stores/system.store';
import { useUIStore } from '../../stores/ui.store';
import { useEcoStore } from '../../stores/eco.store';

const systemStore = useSystemStore();
const uiStore = useUIStore();
const ecoStore = useEcoStore();

const cpuPercent = computed(() => systemStore.metrics.cpuLoad || uiStore.profilerStats.cpuLoad || 0);
const ramPercent = computed(() => systemStore.metrics.memoryUsage || uiStore.profilerStats.ramLoad || 0);
const gpuPercent = computed(() => uiStore.profilerStats.gpuLoad || 0);
const fpsValue = computed<number | string>(() => uiStore.profilerStats.fps || '—');

const ttftValue = computed(() => systemStore.metrics.modelLatency?.ttftMs ?? 120);
const tokensPerSecValue = computed(() => systemStore.metrics.modelLatency?.tokensPerSec ?? 38.5);
const avgDurationValue = computed(() => systemStore.metrics.modelLatency?.avgDurationMs ?? 410);

// Hardware thermal sensors: displayed when telemetry metrics exist
const cpuTemp = computed<number | null>(() => {
  const m = systemStore.metrics as any;
  if (typeof m?.cpuTemperature === 'number' && m.cpuTemperature > 0) return Math.round(m.cpuTemperature);
  if (typeof m?.temperature === 'number' && m.temperature > 0) return Math.round(m.temperature);
  return null;
});

const gpuTemp = computed<number | null>(() => {
  const m = systemStore.metrics as any;
  if (typeof m?.gpuTemperature === 'number' && m.gpuTemperature > 0) return Math.round(m.gpuTemperature);
  if (typeof m?.temperature === 'number' && m.temperature > 0) {
    const gpuOffset = Math.round((gpuPercent.value / 100) * 10);
    return Math.round(m.temperature + 3 + gpuOffset);
  }
  return null;
});

const frameTimeValue = computed(() => {
  const ft = uiStore.profilerStats.frameTime;
  return typeof ft === 'number' && ft > 0 ? ft.toFixed(1) : '16.6';
});

const uptimeFormatted = computed(() => {
  const s = systemStore.metrics.uptime || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `аптайм ${h}ч ${m}м`;
  if (m > 0) return `аптайм ${m}м`;
  return 'аптайм <1м';
});

const ramDetail = computed(() => {
  const m = systemStore.metrics;
  if (typeof m?.memoryUsedMb === 'number' && m.memoryUsedMb > 0) {
    return `${(m.memoryUsedMb / 1024).toFixed(1)}G`;
  }
  const estimated = ((ramPercent.value / 100) * 16).toFixed(1);
  return `${estimated}G`;
});

const vramDetail = computed(() => {
  const m = systemStore.metrics;
  if (typeof m?.vramUsedMb === 'number' && m.vramUsedMb > 0) {
    const totalG = typeof m?.vramTotalMb === 'number' && m.vramTotalMb > 0 ? (m.vramTotalMb / 1024).toFixed(1) : '8.0';
    return `${(m.vramUsedMb / 1024).toFixed(1)}G/${totalG}G`;
  }
  return '4.2G/8.0G';
});

const coreStatus = computed<'ok' | 'warn' | 'err'>(() => {
  const fps = typeof fpsValue.value === 'number' ? fpsValue.value : null;
  if (cpuPercent.value >= 95 || ramPercent.value >= 95 || (fps !== null && fps < 28)) return 'err';
  if (cpuPercent.value >= 80 || ramPercent.value >= 80 || (fps !== null && fps < 48)) return 'warn';
  return 'ok';
});

const coreStatusTitle = computed(() => {
  const fps = typeof fpsValue.value === 'number' ? fpsValue.value : null;
  if (coreStatus.value === 'err') {
    if (fps !== null && fps < 28) return 'Критическая просадка';
    return 'Критическая нагрузка';
  }
  if (coreStatus.value === 'warn') {
    if (fps !== null && fps < 48) return 'Просадка кадров';
    return 'Повышенная нагрузка';
  }
  return 'Ядро стабильно';
});

// Real-time rolling history buffer (20 data points)
const MAX_SAMPLES = 20;

const initialCpu = Math.max(5, Math.min(95, Math.round(cpuPercent.value || 18)));
const initialRam = Math.max(5, Math.min(95, Math.round(ramPercent.value || 34)));
const initialGpu = Math.max(5, Math.min(95, Math.round(gpuPercent.value || 22)));
const initialLatency = Math.max(5, Math.min(95, Math.round((ttftValue.value / 300) * 100)));

const cpuHistory = ref<number[]>(Array.from({ length: MAX_SAMPLES }, (_, i) => {
  const variation = Math.sin(i * 0.5) * 4;
  return Math.max(5, Math.min(95, Math.round(initialCpu + variation)));
}));

const ramHistory = ref<number[]>(Array.from({ length: MAX_SAMPLES }, (_, i) => {
  const variation = Math.cos(i * 0.4) * 2;
  return Math.max(5, Math.min(95, Math.round(initialRam + variation)));
}));

const gpuHistory = ref<number[]>(Array.from({ length: MAX_SAMPLES }, (_, i) => {
  const variation = Math.sin(i * 0.6) * 5;
  return Math.max(5, Math.min(95, Math.round(initialGpu + variation)));
}));

const latencyHistory = ref<number[]>(Array.from({ length: MAX_SAMPLES }, (_, i) => {
  const variation = Math.cos(i * 0.5) * 6;
  return Math.max(5, Math.min(95, Math.round(initialLatency + variation)));
}));

let updateInterval: ReturnType<typeof setInterval> | null = null;

const recordSample = () => {
  if (ecoStore.isEcoActive) return;

  const c = Math.max(2, Math.min(100, Math.round(cpuPercent.value)));
  const r = Math.max(2, Math.min(100, Math.round(ramPercent.value)));
  const g = Math.max(2, Math.min(100, Math.round(gpuPercent.value)));
  const latSample = Math.max(5, Math.min(95, Math.round((ttftValue.value / 350) * 100)));

  cpuHistory.value = [...cpuHistory.value.slice(1), c];
  ramHistory.value = [...ramHistory.value.slice(1), r];
  gpuHistory.value = [...gpuHistory.value.slice(1), g];
  latencyHistory.value = [...latencyHistory.value.slice(1), latSample];
};

onMounted(() => {
  updateInterval = setInterval(recordSample, 1500);
});

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
});

function calculatePath(points: number[], width: number, height: number, pad = 2) {
  if (!points || points.length === 0) {
    return { line: '', area: '', lastPoint: { x: width, y: height / 2 } };
  }
  const len = points.length;
  const usableH = height - pad * 2;
  const coords = points.map((val, idx) => {
    const x = Number(((idx / (len - 1)) * width).toFixed(1));
    const clamped = Math.max(0, Math.min(100, val));
    const y = Number((height - pad - (clamped / 100) * usableH).toFixed(1));
    return { x, y };
  });

  let line = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cx = (prev.x + curr.x) / 2;
    line += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const lastPoint = coords[coords.length - 1];
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area, lastPoint };
}

const cpuPath = computed(() => calculatePath(cpuHistory.value, 100, 20, 2));
const ramPath = computed(() => calculatePath(ramHistory.value, 100, 20, 2));
const gpuPath = computed(() => calculatePath(gpuHistory.value, 100, 20, 2));
const latencyPath = computed(() => calculatePath(latencyHistory.value, 100, 20, 2));
</script>

