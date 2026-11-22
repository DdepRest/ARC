<template>
  <div
    class="rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] p-4 sm:p-5 flex flex-col gap-4"
    data-setting-id="system.gfx.preset"
    data-search="пресеты профиль качества графики eco balanced cinematic showcase экономичный сбалансированный кинематографичный демонстрация"
  >
    <!-- Header Row: Active Profile + Modified Reset + Live Telemetry -->
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="flex flex-col gap-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-[var(--arc-text-primary)]">
            Профиль графического движка
          </span>
          <span class="px-2 py-0.5 rounded-[6px] text-xs font-mono uppercase tracking-wider border bg-[var(--arc-input)] text-[var(--arc-text-primary)] border-[var(--arc-hairline)]">
            {{ activeMeta.code }} · {{ activeMeta.titleRu }}
          </span>
          <span
            v-if="store.isGraphicsModified"
            class="px-2 py-0.5 rounded-[6px] text-xs font-mono uppercase tracking-wider border bg-[var(--arc-selected)] text-[var(--accent)] border-[rgba(var(--accent-rgb),0.45)]"
          >
            Изменён
          </span>
          <button
            v-if="store.isGraphicsModified"
            type="button"
            @click="store.resetGraphicsPresetToDefault()"
            class="px-2.5 py-0.5 rounded-[6px] text-xs font-mono border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer"
          >
            Сбросить профиль
          </button>
        </div>
        <span class="text-xs text-[var(--arc-text-muted)] leading-relaxed">
          Единый графический движок WebGL2. Постоянные профили управляют PBR-текстурами, студийным светом, GTAO, тенями и пост-обработкой без пересоздания сцены.
        </span>
      </div>

      <!-- Compact Live Telemetry & Benchmark Trigger -->
      <div class="flex flex-wrap items-center self-start shrink-0 gap-2">
        <button
          type="button"
          :disabled="isSweepRunning || store.showcaseActive"
          @click="runPresetBenchmark()"
          class="px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[rgba(var(--accent-rgb),0.45)] text-xs font-mono font-semibold text-[var(--accent)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50"
        >
          {{ isSweepRunning && sweepCurrentPreset ? `Тест: ${sweepCurrentPreset} (${sweepRemainingSec} с)` : 'Автоподбор 3 профилей (12 с)' }}
        </button>

        <div class="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] bg-[var(--arc-input)] border border-[var(--arc-hairline)] text-xs font-mono tabular-nums">
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">FPS</span>
            <span class="text-[var(--arc-text-primary)] font-semibold">{{ uiStore.profilerStats?.fps || 60 }}</span>
          </div>
          <span class="text-[var(--arc-hairline)]">·</span>
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">SCALE</span>
            <span class="text-[var(--arc-text-primary)]">{{ effectiveScalePct }}%</span>
          </div>
          <span class="text-[var(--arc-hairline)]">·</span>
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">AA</span>
            <span class="text-[var(--accent)] font-semibold">{{ formattedAa }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3 Permanent Graphics Profile Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <button
        v-for="presetId in presetOrder"
        :key="presetId"
        type="button"
        @click="handlePresetClick(presetId)"
        class="flex flex-col justify-between gap-2.5 p-4 rounded-[12px] border text-left transition cursor-pointer"
        :class="store.graphicsPreset === presetId
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.55)] text-[var(--arc-text-primary)]'
          : 'bg-[var(--arc-input)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
      >
        <div class="w-full flex flex-col gap-2">
          <div class="w-full flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="text-xs font-mono font-bold tracking-wider whitespace-nowrap"
                :class="store.graphicsPreset === presetId ? 'text-[var(--accent)]' : 'text-[var(--arc-text-primary)]'"
              >
                {{ presetMeta[presetId].code }}
              </span>
              <span class="text-xs font-medium text-[var(--arc-text-secondary)] truncate">
                {{ presetMeta[presetId].titleRu }}
              </span>
            </div>

            <div class="inline-flex items-center gap-1 shrink-0">
              <span
                v-for="step in 3"
                :key="step"
                class="w-1.5 h-2.5 rounded-[1px] transition-colors"
                :style="{
                  backgroundColor: step <= presetMeta[presetId].level
                    ? (store.graphicsPreset === presetId ? 'var(--accent)' : 'var(--arc-text-secondary)')
                    : 'var(--arc-hairline)'
                }"
              />
            </div>
          </div>

          <div class="text-xs text-[var(--arc-text-primary)] leading-snug">
            {{ presetMeta[presetId].purposeRu }}
          </div>
          <div class="text-xs text-[var(--arc-text-muted)] leading-snug">
            {{ presetMeta[presetId].visualHighlightsRu }}
          </div>
        </div>

        <div class="w-full pt-2.5 border-t border-[var(--arc-hairline)] flex flex-col gap-1">
          <span class="text-xs font-mono text-[var(--arc-text-secondary)]">
            {{ presetMeta[presetId].performanceLevelRu }}
          </span>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate">
            {{ presetMeta[presetId].specsRu }}
          </span>
        </div>
      </button>
    </div>

    <!-- Dedicated Temporary Showcase Mode Card -->
    <div
      class="rounded-[12px] border p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
      :class="store.showcaseActive
        ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.55)]'
        : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)]'"
    >
      <div class="flex flex-col gap-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-mono font-bold tracking-wider text-[var(--accent)]">
            SHOWCASE · ВРЕМЕННЫЙ РЕЖИМ
          </span>
          <span class="px-2 py-0.5 rounded-[5px] text-xs font-mono border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-secondary)]">
            {{ store.showcaseActive ? `Активен (${store.showcaseRemainingSec} с)` : 'До 120 с · Автовозврат' }}
          </span>
        </div>
        <span class="text-xs text-[var(--arc-text-secondary)] leading-snug">
          Пиковое демонстрационное качество: 2048 PBR, Soft Shadows 2048, GTAO, объёмные лучи, деликатный DOF и кинематографичная последовательность ядра. Не перезаписывает постоянный профиль.
        </span>
      </div>

      <button
        type="button"
        @click="handleShowcaseToggle"
        class="shrink-0 px-4 py-2 rounded-[10px] text-xs font-mono font-semibold uppercase tracking-wider border transition cursor-pointer"
        :class="store.showcaseActive
          ? 'bg-[var(--arc-block)] border-[rgba(var(--accent-rgb),0.6)] text-[var(--accent)] hover:bg-[var(--arc-hover)]'
          : 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.55)] text-[var(--accent)] hover:bg-[var(--arc-hover)]'"
      >
        {{ store.showcaseActive ? 'ОСТАНОВИТЬ SHOWCASE' : 'ЗАПУСТИТЬ SHOWCASE' }}
      </button>
    </div>

    <!-- GPU Load & Adaptive Status Bar -->
    <div class="flex flex-col gap-2 pt-2 border-t border-[var(--arc-hairline)]">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[var(--arc-text-muted)]">ОЦЕНКА НАГРУЗКИ GPU</span>
          <span class="text-[var(--arc-text-secondary)]">· {{ store.adaptiveRuntimeState.gpuName }}</span>
          <span
            v-if="store.adaptiveRuntimeState.isSoftwareGl"
            class="px-1.5 py-0.5 rounded-[5px] border border-[var(--arc-hairline)] bg-[var(--arc-input)] text-[var(--status-warn)]"
          >
            Software WebGL
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[var(--arc-text-secondary)]">{{ gpuLoad.labelRu }}</span>
          <span class="text-[var(--accent)] font-semibold">{{ gpuLoad.percent }}%</span>
        </div>
      </div>

      <div class="w-full h-2 rounded-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] overflow-hidden p-0.5">
        <div
          class="h-full rounded-full transition-all duration-300"
          :style="{ width: `${gpuLoad.percent}%`, backgroundColor: gpuBarColor }"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[var(--arc-text-muted)]">
        <span>
          Адаптивное качество:
          <strong class="text-[var(--arc-text-primary)]">{{ store.autoAdjustGraphics ? 'Авто (защита 60 FPS)' : 'Фиксированное' }}</strong>
          <template v-if="store.adaptiveRuntimeState.degradationStep > 0">
            · Активна ступень {{ store.adaptiveRuntimeState.degradationStep }}
          </template>
        </span>
        <span v-if="store.adaptiveRuntimeState.gpuFrameTimeMs !== null">
          GPU: {{ store.adaptiveRuntimeState.gpuFrameTimeMs.toFixed(1) }} ms
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';
import {
  GRAPHICS_PRESET_ORDER,
  GRAPHICS_PRESET_META,
  estimateGpuLoadScore,
  type GraphicsPreset,
} from '../../../logic/graphics-presets';
import { useRenderBottleneckDiag } from '../../../composables/useRenderBottleneckDiag';

const store = useSettingsStore();
const uiStore = useUIStore();
const { isSweepRunning, sweepCurrentPreset, sweepRemainingSec, runPresetBenchmark } = useRenderBottleneckDiag();

const presetOrder = GRAPHICS_PRESET_ORDER;
const presetMeta = GRAPHICS_PRESET_META;

const activeMeta = computed(() => presetMeta[store.graphicsPreset] || presetMeta.Balanced);

const effectiveScalePct = computed(() =>
  Math.round((store.adaptiveRuntimeState.effectiveRenderScale || store.graphicsConfig.renderScale) * 100)
);

const formattedAa = computed(() => {
  const { msaaSamples, fxaaEnabled } = store.graphicsConfig;
  if (msaaSamples > 0 && fxaaEnabled) return `${msaaSamples}x+FXAA`;
  if (msaaSamples > 0) return `MSAA ${msaaSamples}x`;
  if (fxaaEnabled) return 'FXAA';
  return 'Выкл';
});

const gpuLoad = computed(() => estimateGpuLoadScore(store.graphicsConfig));

const gpuBarColor = computed(() => {
  const tier = gpuLoad.value.tier;
  if (tier === 'low') return 'var(--status-ok)';
  if (tier === 'moderate') return 'var(--arc-text-primary)';
  if (tier === 'high') return 'var(--status-warn)';
  return 'var(--accent)';
});

function handlePresetClick(id: GraphicsPreset) {
  store.applyGraphicsPreset(id);
}

function handleShowcaseToggle() {
  if (store.showcaseActive) {
    store.requestShowcaseStop();
    return;
  }
  store.requestShowcaseStart(uiStore.activeTab);
  uiStore.activeTab = 'core';
}
</script>
