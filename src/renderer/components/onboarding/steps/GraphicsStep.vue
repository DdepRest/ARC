<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../../../features/settings/stores/settings.store';
import {
  GRAPHICS_PRESETS,
  GRAPHICS_PRESET_ORDER,
  GRAPHICS_PRESET_META,
  type GraphicsPreset,
  type GraphicsConfig,
} from '../../../features/settings/logic/graphics-presets';
import { recommendGraphicsPreset } from '../utils/recommend-preset';
import type { StepSaveResult } from '../utils/wizard-save';

const settingsStore = useSettingsStore();

const detectedGpu = ref<string>('Определение GPU...');
const detectedVramMb = ref<number | null>(null);
const recommendedPreset = ref<GraphicsPreset>('Balanced');
const selectedPreset = ref<GraphicsPreset>(settingsStore.graphicsPreset || 'Balanced');

const presets = GRAPHICS_PRESET_ORDER.map((id) => ({
  id,
  meta: GRAPHICS_PRESET_META[id],
  config: GRAPHICS_PRESETS[id],
}));

const formattedVram = computed(() => {
  if (detectedVramMb.value == null || detectedVramMb.value <= 0) {
    return 'VRAM: автопрофиль';
  }
  return `VRAM: ${Math.round(detectedVramMb.value)} МБ`;
});

function formatAa(cfg: GraphicsConfig): string {
  if (cfg.msaaSamples > 0 && cfg.fxaaEnabled) return `MSAA ${cfg.msaaSamples}x + FXAA`;
  if (cfg.msaaSamples > 0) return `MSAA ${cfg.msaaSamples}x`;
  return cfg.fxaaEnabled ? 'FXAA' : 'AA Выкл';
}

function formatScale(scale: GraphicsConfig['renderScale'], dpr: GraphicsConfig['targetDpr']): string {
  const dprStr = dpr === 'auto' ? 'Авто' : `${dpr}x`;
  return `Scale ${Math.round(scale * 100)}% · DPR ${dprStr}`;
}

function formatEffects(cfg: GraphicsConfig): string {
  const ao = cfg.aoMode === 'gtao' ? 'GTAO' : cfg.aoMode === 'light' ? 'Light AO' : 'Без AO';
  const sh = cfg.shadowQuality === 'off' ? 'Без теней' : `Тени ${cfg.shadowQuality}`;
  return `${ao} · ${sh}`;
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

  // Never overwrite an already-saved user choice on mount
  if (!settingsStore.hasUserSelectedGraphicsPreset) {
    selectedPreset.value = recommended;
    settingsStore.applyGraphicsPreset(recommended, { markUserSelected: false });
  } else {
    selectedPreset.value = settingsStore.graphicsPreset;
  }
});

function selectPreset(presetId: GraphicsPreset) {
  selectedPreset.value = presetId;
  settingsStore.applyGraphicsPreset(presetId);
}

defineExpose({
  saveCurrentState: (): StepSaveResult => {
    try {
      settingsStore.applyGraphicsPreset(selectedPreset.value);
      return { ok: true };
    } catch {
      return {
        ok: true,
        optionalWarnings: ['Профиль 3D-рендера не применён (можно выбрать в Настройках)'],
      };
    }
  },
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

    <!-- 3 Permanent Graphics Profiles (No VRAM Locks, No Showcase Card) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div
        v-for="preset in presets"
        :key="preset.id"
        role="radio"
        :aria-checked="selectedPreset === preset.id"
        tabindex="0"
        @click="selectPreset(preset.id)"
        @keydown.enter.prevent="selectPreset(preset.id)"
        @keydown.space.prevent="selectPreset(preset.id)"
        class="p-3.5 rounded-[12px] border transition-colors cursor-pointer flex flex-col justify-between select-none outline-none gap-3"
        :class="selectedPreset === preset.id
          ? 'border-[var(--accent)] bg-[var(--arc-selected)] text-[var(--arc-text-primary)]'
          : 'border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)]'"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="selectedPreset === preset.id ? 'bg-[var(--accent)]' : 'bg-[var(--arc-divider)]'"
              ></span>
              <span class="font-mono text-xs font-bold tracking-wider text-[var(--arc-text-primary)]">
                {{ preset.meta.code }}
              </span>
            </div>

            <span
              v-if="recommendedPreset === preset.id"
              class="px-2 py-0.5 rounded-[6px] border border-[var(--status-ok)] bg-[var(--arc-plane)] font-mono text-xs text-[var(--status-ok)] shrink-0"
            >
              Рекомендуется
            </span>
          </div>

          <div class="text-xs font-medium text-[var(--arc-text-primary)]">
            {{ preset.meta.titleRu }}
          </div>
          <div class="text-xs text-[var(--arc-text-secondary)] leading-snug">
            {{ preset.meta.purposeRu }}
          </div>

          <div class="pt-1 space-y-1 font-mono text-xs text-[var(--arc-text-muted)]">
            <div>{{ formatScale(preset.config.renderScale, preset.config.targetDpr) }}</div>
            <div>{{ formatAa(preset.config) }} · Tex {{ preset.config.textureResolution }}</div>
            <div>{{ formatEffects(preset.config) }}</div>
          </div>
        </div>

        <div class="pt-2 border-t border-[var(--arc-divider)] font-mono text-xs text-[var(--arc-text-secondary)]">
          {{ preset.meta.performanceLevelRu }}
        </div>
      </div>
    </div>
  </div>
</template>
