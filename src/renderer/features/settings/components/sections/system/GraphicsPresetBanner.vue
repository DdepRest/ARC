<template>
  <div
    class="rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] p-4 sm:p-5 flex flex-col gap-4"
    data-setting-id="system.gfx.preset"
    data-search="пресеты шаблон качества графики низкие средние высокие ультра ультра плюс пользовательский preset low medium high ultra custom"
  >
    <!-- Header Row: Title + Live Hardware Config Strip -->
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="flex flex-col gap-1 min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="text-sm font-semibold text-[var(--arc-text-primary)]">
            Профиль графического движка
          </span>
          <span
            class="px-2 py-0.5 rounded-[6px] text-xs font-mono uppercase tracking-wider border"
            :class="store.graphicsPreset === 'Custom'
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[rgba(var(--accent-rgb),0.45)]'
              : 'bg-[var(--arc-input)] text-[var(--arc-text-primary)] border-[var(--arc-hairline)]'"
          >
            {{ activePresetTitle }}
          </span>
        </div>
        <span class="text-xs text-[var(--arc-text-muted)] leading-relaxed">
          В каждом профиле приоритет отдан чёткости кольца и эталонному свечению ядра; на младших уровнях отключаются только вторичные эффекты и частицы.
        </span>
      </div>

      <!-- Compact Telemetry & Preset Benchmark Trigger -->
      <div class="flex flex-wrap items-center self-start shrink-0 gap-2">
        <button
          type="button"
          :disabled="isSweepRunning"
          @click="runPresetBenchmark()"
          class="px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[rgba(var(--accent-rgb),0.45)] text-xs font-mono font-semibold text-[var(--accent)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50"
        >
          {{ isSweepRunning && sweepCurrentPreset ? `Тест: ${sweepCurrentPreset} (${sweepRemainingSec} с)` : 'Автоподбор 5 пресетов (20 с)' }}
        </button>

        <div class="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] bg-[var(--arc-input)] border border-[var(--arc-hairline)] text-xs font-mono">
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">FPS</span>
            <span class="text-[var(--arc-text-primary)] font-semibold">{{ uiStore.profilerStats?.fps || 60 }}</span>
          </div>
          <span class="text-[var(--arc-hairline)]">·</span>
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">DPR</span>
            <span class="text-[var(--arc-text-primary)]">{{ formattedDpr }}</span>
          </div>
          <span class="text-[var(--arc-hairline)]">·</span>
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">AF</span>
            <span class="text-[var(--arc-text-primary)]">{{ store.graphicsConfig.anisotropy }}x</span>
          </div>
          <span class="text-[var(--arc-hairline)]">·</span>
          <div class="flex items-center gap-1">
            <span class="text-[var(--arc-text-muted)]">AA</span>
            <span class="text-[var(--accent)] font-semibold">{{ formattedMsaa }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3x2 Balanced Preset Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
      <button
        v-for="item in presetCards"
        :key="item.id"
        type="button"
        @click="handlePresetClick(item.id)"
        :disabled="item.id === 'Custom' && store.graphicsPreset !== 'Custom'"
        class="flex flex-col justify-between gap-2 p-3.5 rounded-[12px] border text-left transition cursor-pointer disabled:opacity-45 disabled:cursor-default"
        :class="store.graphicsPreset === item.id
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.55)] text-[var(--arc-text-primary)]'
          : 'bg-[var(--arc-input)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
      >
        <div class="w-full flex flex-col gap-1.5">
          <!-- Card Top Header: Single-line Title + Tier Bars + Tag -->
          <div class="w-full flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="text-xs font-semibold whitespace-nowrap"
                :class="store.graphicsPreset === item.id ? 'text-[var(--accent)]' : 'text-[var(--arc-text-primary)]'"
              >
                {{ item.label }}
              </span>
              <!-- 5-Step Quality Tier Bars -->
              <div v-if="item.level > 0" class="inline-flex items-center gap-0.5 shrink-0">
                <span
                  v-for="step in 5"
                  :key="step"
                  class="w-1 h-2.5 rounded-[1px] transition-colors"
                  :style="{
                    backgroundColor: step <= item.level
                      ? (store.graphicsPreset === item.id ? 'var(--accent)' : 'var(--arc-text-secondary)')
                      : 'var(--arc-hairline)'
                  }"
                />
              </div>
            </div>
            <span
              class="px-1.5 py-0.5 rounded-[5px] text-xs font-mono whitespace-nowrap shrink-0 border"
              :class="store.graphicsPreset === item.id
                ? 'bg-[var(--arc-block)] text-[var(--accent)] border-[rgba(var(--accent-rgb),0.35)]'
                : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)]'"
            >
              {{ item.tag }}
            </span>
          </div>

          <!-- Concise Human Description -->
          <span class="text-xs leading-snug text-[var(--arc-text-secondary)]">
            {{ item.desc }}
          </span>
        </div>

        <!-- Bottom Machine Spec Line -->
        <div class="w-full pt-2 border-t border-[var(--arc-hairline)] flex items-center justify-between gap-1 text-xs font-mono text-[var(--arc-text-muted)]">
          <span class="truncate">{{ item.specs }}</span>
        </div>
      </button>
    </div>

    <!-- GPU Load Impact Meter -->
    <div class="flex flex-col gap-1.5 pt-1 border-t border-[var(--arc-hairline)]">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-[var(--arc-text-muted)] font-mono">
          ОЦЕНКА НАГРУЗКИ НА GPU (FILLRATE &amp; SHADERS)
        </span>
        <div class="flex items-center gap-2 font-mono">
          <span class="text-[var(--arc-text-secondary)]">{{ gpuLoad.labelRu }}</span>
          <span class="text-[var(--accent)] font-semibold">{{ gpuLoad.percent }}%</span>
        </div>
      </div>
      <div class="w-full h-2 rounded-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] overflow-hidden p-0.5">
        <div
          class="h-full rounded-full transition-all duration-300"
          :style="{
            width: `${gpuLoad.percent}%`,
            backgroundColor: gpuBarColor
          }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';
import { estimateGpuLoadScore, type GraphicsPreset } from '../../../logic/graphics-presets';
import { useRenderBottleneckDiag } from '../../../composables/useRenderBottleneckDiag';

const store = useSettingsStore();
const uiStore = useUIStore();
const { isSweepRunning, sweepCurrentPreset, sweepRemainingSec, runPresetBenchmark } = useRenderBottleneckDiag();

const formattedDpr = computed(() => {
  const dpr = store.graphicsConfig.targetDpr;
  return dpr === 'auto' ? 'Авто' : `${dpr}x`;
});

const formattedMsaa = computed(() => {
  const samples = store.graphicsConfig.msaaSamples;
  return samples === 0 ? 'Выкл' : `${samples}x`;
});

const presetCards: Array<{
  id: GraphicsPreset;
  label: string;
  level: number;
  tag: string;
  desc: string;
  specs: string;
}> = [
  {
    id: 'Low',
    label: 'Низкий',
    level: 1,
    tag: 'ЭКО · 1.0x',
    desc: 'Чёткое кольцо и свечение ядра без частиц и тяжёлых шейдеров',
    specs: 'AA Выкл · AF 1x · Scale 75% · Пыль 0%',
  },
  {
    id: 'Medium',
    label: 'Средний',
    level: 2,
    tag: '2x MSAA',
    desc: 'Сбалансированное сглаживание, базовые отражения и инерция колец',
    specs: 'MSAA 2x · AF 4x · Scale 100% · Пыль 25%',
  },
  {
    id: 'High',
    label: 'Высокий',
    level: 3,
    tag: '4x + FXAA',
    desc: 'Повышенная чёткость 1.25x, GLSL-плазма, HDR-буфер и полный свет',
    specs: 'MSAA 4x · AF 8x · DPR 1.25x · Пыль 60%',
  },
  {
    id: 'Ultra',
    label: 'Ультра',
    level: 4,
    tag: '8x MSAA',
    desc: 'Суперсэмплинг 1.5x, HD-отражения, гармоники и плотный поток искр',
    specs: 'MSAA 8x · AF 16x · DPR 1.5x · Пыль 100%',
  },
  {
    id: 'UltraPlus',
    label: 'Ультра плюс',
    level: 5,
    tag: 'MAX 2.0x',
    desc: 'Абсолютный максимум: все ползунки и буферы рендера на 100%',
    specs: 'MSAA 8x · SSAA 2.0x · Scale 150% · 150%',
  },
  {
    id: 'Custom',
    label: 'Свой профиль',
    level: 0,
    tag: 'РУЧНОЙ',
    desc: 'Индивидуальная комбинация ползунков и шейдерных параметров',
    specs: 'Авто-активация при ручной правке ниже',
  },
];

const activePresetTitle = computed(() => {
  const found = presetCards.find((p) => p.id === store.graphicsPreset);
  return found ? found.label : 'Высокий';
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
  if (id === 'Custom') return;
  store.applyGraphicsPreset(id);
}
</script>
