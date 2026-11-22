<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../../../features/settings/stores/settings.store';
import {
  GRAPHICS_PRESETS,
  type GraphicsPreset,
  type GraphicsConfig
} from '../../../features/settings/logic/graphics-presets';
import { recommendGraphicsPreset, isUltraPlusAvailable } from '../utils/recommend-preset';
import type { StepSaveResult } from '../utils/wizard-save';

const settingsStore = useSettingsStore();

const detectedGpu = ref<string>('Определение GPU...');
const detectedVramMb = ref<number | null>(null);
const recommendedPreset = ref<Exclude<GraphicsPreset, 'Custom'>>('Medium');
const selectedPreset = ref<GraphicsPreset>(settingsStore.graphicsPreset || 'Medium');

interface PresetCardMeta {
  id: Exclude<GraphicsPreset, 'Custom'>;
  code: string;
  title: string;
  vramBucket: string;
  config: GraphicsConfig;
}

const basePresets: PresetCardMeta[] = [
  {
    id: 'Low',
    code: 'LOW',
    title: 'Эко-контур',
    vramBucket: 'до 4 ГБ VRAM',
    config: GRAPHICS_PRESETS.Low
  },
  {
    id: 'Medium',
    code: 'MEDIUM',
    title: 'Базовый баланс',
    vramBucket: '4–8 ГБ VRAM',
    config: GRAPHICS_PRESETS.Medium
  },
  {
    id: 'High',
    code: 'HIGH',
    title: 'Высокая чёткость',
    vramBucket: '8 ГБ VRAM и выше',
    config: GRAPHICS_PRESETS.High
  },
  {
    id: 'Ultra',
    code: 'ULTRA',
    title: 'Полный конвейер',
    vramBucket: 'для дискретных GPU',
    config: GRAPHICS_PRESETS.Ultra
  }
];

const ultraPlusPreset: PresetCardMeta = {
  id: 'UltraPlus',
  code: 'ULTRA+',
  title: 'Суперсэмплинг',
  vramBucket: 'только при ≥ 12 ГБ VRAM',
  config: GRAPHICS_PRESETS.UltraPlus
};

const formattedVram = computed(() => {
  if (detectedVramMb.value == null || detectedVramMb.value <= 0) {
    return 'VRAM: автопрофиль';
  }
  return `VRAM: ${Math.round(detectedVramMb.value)} МБ`;
});

function formatMsaa(samples: GraphicsConfig['msaaSamples']): string {
  return samples > 0 ? `MSAA ${samples}x` : 'MSAA ВЫКЛ';
}

function formatBloom(enabled: boolean, strength: number): string {
  return enabled ? `Bloom ВКЛ (${strength}%)` : 'Bloom ВЫКЛ';
}

function formatScale(scale: GraphicsConfig['renderScale'], dpr: GraphicsConfig['targetDpr']): string {
  return `Scale ${Math.round(scale * 100)}% · DPR ${dpr}x`;
}

onMounted(async () => {
  try {
    if (typeof window !== 'undefined' && (window.api as any)?.getSystemMetrics) {
      const metrics = await (window.api as any).getSystemMetrics();
      if (metrics) {
        detectedGpu.value = metrics.gpuModel || 'Графический адаптер системы';
        if (typeof metrics.vramTotalMb === 'number' && metrics.vramTotalMb > 0) {
          detectedVramMb.value = metrics.vramTotalMb;
        }
      }
    } else {
      detectedGpu.value = 'Графический адаптер системы';
    }
  } catch (err) {
    console.warn('Could not probe GPU metrics:', err);
    detectedGpu.value = 'Графический адаптер системы';
  }

  const recommended = recommendGraphicsPreset(detectedVramMb.value);
  recommendedPreset.value = recommended;
  selectedPreset.value = recommended;
  settingsStore.applyGraphicsPreset(recommended);
});

function selectPreset(presetId: Exclude<GraphicsPreset, 'Custom'>) {
  if (presetId === 'UltraPlus' && !isUltraPlusAvailable(detectedVramMb.value)) {
    return;
  }
  selectedPreset.value = presetId;
  settingsStore.applyGraphicsPreset(presetId);
}

defineExpose({
  saveCurrentState: (): StepSaveResult => {
    try {
      const targetPreset = selectedPreset.value === 'Custom' ? recommendedPreset.value : selectedPreset.value;
      settingsStore.applyGraphicsPreset(targetPreset);
      return { ok: true };
    } catch {
      return {
        ok: true,
        optionalWarnings: ['Профиль 3D-рендера не применён (можно выбрать в Настройках)']
      };
    }
  }
});
</script>

<template>
  <div class="space-y-4">
    <!-- Step Header & GPU Telemetry Strip -->
    <div class="p-3.5 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-2 h-2 rounded-full bg-[var(--status-ok)] shrink-0"></span>
        <div class="min-w-0">
          <div class="text-xs font-mono text-[var(--arc-text-primary)] truncate">
            {{ detectedGpu }}
          </div>
          <div class="text-xs font-mono text-[var(--arc-text-muted)] mt-0.5">
            {{ formattedVram }}
          </div>
        </div>
      </div>
      <div class="px-2.5 py-1 rounded-[6px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] font-mono text-xs uppercase tracking-wider text-[var(--arc-text-secondary)] shrink-0">
        ДЕТЕКТОР GPU
      </div>
    </div>

    <!-- 2x2 Base Presets Grid -->
    <div class="grid grid-cols-2 gap-3">
      <div
        v-for="preset in basePresets"
        :key="preset.id"
        role="radio"
        :aria-checked="selectedPreset === preset.id"
        tabindex="0"
        @click="selectPreset(preset.id)"
        @keydown.enter.prevent="selectPreset(preset.id)"
        @keydown.space.prevent="selectPreset(preset.id)"
        class="p-3.5 rounded-[12px] border transition-colors cursor-pointer flex flex-col justify-between select-none outline-none"
        :class="selectedPreset === preset.id
          ? 'border-[var(--accent)] bg-[var(--arc-selected)] text-[var(--arc-text-primary)]'
          : 'border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)]'"
      >
        <div>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="selectedPreset === preset.id ? 'bg-[var(--accent)]' : 'bg-[var(--arc-divider)]'"
              ></span>
              <span class="font-mono text-xs font-bold tracking-wider text-[var(--arc-text-primary)]">
                {{ preset.code }}
              </span>
              <span class="text-xs text-[var(--arc-text-secondary)]">
                · {{ preset.title }}
              </span>
            </div>

            <span
              v-if="recommendedPreset === preset.id"
              class="px-2 py-0.5 rounded-[6px] border border-[var(--status-ok)] bg-[var(--arc-plane)] font-mono text-xs text-[var(--status-ok)] shrink-0"
            >
              Рекомендуется
            </span>
          </div>

          <div class="mt-2.5 space-y-1 font-mono text-xs text-[var(--arc-text-muted)]">
            <div>{{ formatScale(preset.config.renderScale, preset.config.targetDpr) }}</div>
            <div>{{ formatBloom(preset.config.bloomEnabled, preset.config.bloomStrength) }}</div>
            <div>{{ formatMsaa(preset.config.msaaSamples) }}</div>
          </div>
        </div>

        <div class="mt-3 pt-2 border-t border-[var(--arc-divider)] flex items-center justify-between">
          <span class="font-mono text-xs text-[var(--arc-text-muted)]">Допуск</span>
          <span class="font-mono text-xs text-[var(--arc-text-secondary)]">{{ preset.vramBucket }}</span>
        </div>
      </div>
    </div>

    <!-- 5th Card: UltraPlus (Rendered ONLY when VRAM >= 12 GB) -->
    <div
      v-if="isUltraPlusAvailable(detectedVramMb)"
      role="radio"
      :aria-checked="selectedPreset === ultraPlusPreset.id"
      tabindex="0"
      @click="selectPreset(ultraPlusPreset.id)"
      @keydown.enter.prevent="selectPreset(ultraPlusPreset.id)"
      @keydown.space.prevent="selectPreset(ultraPlusPreset.id)"
      class="p-3.5 rounded-[12px] border transition-colors cursor-pointer flex items-center justify-between gap-4 select-none outline-none"
      :class="selectedPreset === ultraPlusPreset.id
        ? 'border-[var(--accent)] bg-[var(--arc-selected)] text-[var(--arc-text-primary)]'
        : 'border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)]'"
    >
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :class="selectedPreset === ultraPlusPreset.id ? 'bg-[var(--accent)]' : 'bg-[var(--arc-divider)]'"
          ></span>
          <span class="font-mono text-xs font-bold tracking-wider text-[var(--arc-text-primary)]">
            {{ ultraPlusPreset.code }}
          </span>
          <span class="text-xs text-[var(--arc-text-secondary)]">
            · {{ ultraPlusPreset.title }}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-3 font-mono text-xs text-[var(--arc-text-muted)]">
          <span>{{ formatScale(ultraPlusPreset.config.renderScale, ultraPlusPreset.config.targetDpr) }}</span>
          <span>·</span>
          <span>{{ formatBloom(ultraPlusPreset.config.bloomEnabled, ultraPlusPreset.config.bloomStrength) }}</span>
          <span>·</span>
          <span>{{ formatMsaa(ultraPlusPreset.config.msaaSamples) }}</span>
        </div>
      </div>

      <div class="px-2.5 py-1 rounded-[6px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] font-mono text-xs text-[var(--arc-text-secondary)] shrink-0">
        {{ ultraPlusPreset.vramBucket }}
      </div>
    </div>
  </div>
</template>
