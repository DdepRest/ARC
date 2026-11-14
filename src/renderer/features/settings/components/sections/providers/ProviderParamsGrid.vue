<script setup lang="ts">
import { computed, ref } from 'vue';
import { Sliders, Sparkles } from 'lucide-vue-next';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';

interface Params {
  priority: number;
  temperature: number;
  maxTokens: number;
}

interface Props {
  modelValue?: Params;
  modelName?: string;
  providerType?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({ priority: 1, temperature: 0.7, maxTokens: 4096 }),
  modelName: '',
  providerType: 'local'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: Params): void;
}>();

const isAutoPriority = ref(false);
const isAutoTemp = ref(false);
const isAutoTokens = ref(false);

const PRIORITY_PRESETS = [
  { label: '1 · Высший', value: 1 },
  { label: '5 · Базовый', value: 5 },
  { label: '25 · Резерв', value: 25 }
];

const TEMP_PRESETS = [
  { label: '0.2 · Точно', value: 0.2 },
  { label: '0.7 · Баланс', value: 0.7 },
  { label: '1.2 · Креатив', value: 1.2 }
];

const TOKEN_PRESETS = [
  { label: '4K', value: 4096 },
  { label: '16K', value: 16384 },
  { label: '64K', value: 65536 },
  { label: '256K', value: 262144 }
];

const updateField = <K extends keyof Params>(field: K, val: number, fromAuto = false) => {
  if (field === 'priority') isAutoPriority.value = fromAuto;
  if (field === 'temperature') isAutoTemp.value = fromAuto;
  if (field === 'maxTokens') isAutoTokens.value = fromAuto;

  emit('update:modelValue', {
    ...props.modelValue,
    [field]: val
  });
};

const computeAutoPriority = (): number => {
  const m = (props.modelName || '').toLowerCase();
  if (props.providerType === 'local') return 1;
  if (m.includes('flash') || m.includes('mini') || m === 'auto' || m.includes('fast')) return 2;
  return 5;
};

const computeAutoTemperature = (): number => {
  const m = (props.modelName || '').toLowerCase();
  if (m.includes('r1') || m.includes('reasoner') || m.includes('o1') || m.includes('o3') || m.includes('coder') || m.includes('code') || m.includes('math')) {
    return 0.2;
  }
  if (m.includes('creative') || m.includes('roleplay')) {
    return 0.9;
  }
  return 0.7;
};

const computeAutoTokens = (): number => {
  const m = (props.modelName || '').toLowerCase();
  const provider = (props.providerType || '').toLowerCase();

  if (provider === 'local') return 4096;
  if (m === 'openrouter/free' || m === 'free') return 16384;
  if (m === 'openrouter/auto' || m === 'auto') return 16384;
  if (m === 'openrouter/fusion' || m === 'fusion') return 16384;
  if (m === 'openrouter/pareto-code' || m === 'pareto-code') return 16384;
  if (m.includes('1m') || m.includes('1000k') || m.includes('2m')) return 32768;
  if (m.includes('gemini-2.5') || m.includes('gemini-2.0') || m.includes('gemini-1.5')) return 32768;
  if (m.includes('claude-3-7') || m.includes('claude-4') || m.includes('gpt-4.1')) return 32768;
  if (m.includes('gpt-4o') || m.includes('o1') || m.includes('o3') || m.includes('deepseek') || m.includes('qwen') || m.includes('128k')) return 16384;
  if (m.includes('claude-3-5') || m.includes('llama-3.3') || m.includes('llama-3.1') || m.includes('70b')) return 8192;
  if (provider === 'local') return 4096;
  return 16384;
};

const applyAutoAll = () => {
  isAutoPriority.value = true;
  isAutoTemp.value = true;
  isAutoTokens.value = true;
  emit('update:modelValue', {
    priority: computeAutoPriority(),
    temperature: computeAutoTemperature(),
    maxTokens: computeAutoTokens()
  });
};

const sliderToTokens = (sliderVal: number): number => {
  const raw = Math.round(Math.pow(2, (sliderVal / 100) * 12) * 256);
  const snapped = Math.round(raw / 256) * 256;
  return Math.max(256, Math.min(1048576, snapped));
};

const tokensToSlider = (tokens: number): number => {
  const clamped = Math.max(256, Math.min(1048576, tokens || 4096));
  return Math.round((Math.log2(clamped / 256) / 12) * 100);
};

const sliderPosition = computed(() => tokensToSlider(props.modelValue.maxTokens));

const formatTokens = (tokens: number): string => {
  const t = tokens || 256;
  if (t >= 1048576) return '1M';
  if (t < 1000) return `${t}`;
  return `${(t / 1024).toFixed(0)}K`;
};

const onTokensSliderUpdate = (sliderVal: number) => {
  updateField('maxTokens', sliderToTokens(sliderVal), false);
};

const onManualPriorityInput = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  updateField('priority', Math.max(1, Math.min(99, Math.round(raw))), false);
};

const onManualTempInput = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const clamped = Math.max(0, Math.min(2, Math.round(raw * 100) / 100));
  updateField('temperature', clamped, false);
};

const onManualTokensInput = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const clamped = Math.max(64, Math.min(1048576, Math.round(raw)));
  updateField('maxTokens', clamped, false);
};
</script>

<template>
  <div class="flex flex-col gap-3.5 min-w-0" :style="{ fontFamily: 'var(--font-ui)' }">
    <!-- Header with Global Auto-Calculate Button -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <Sliders class="w-4 h-4 text-[var(--accent)] shrink-0" />
        <span class="text-[13.5px] font-semibold text-[var(--arc-text-primary)] tracking-tight truncate">
          Параметры генерации и приоритет
        </span>
      </div>

      <button
        type="button"
        @click="applyAutoAll"
        class="px-3 py-1.5 rounded-[8px] text-xs font-mono bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
        title="Автоматически подобрать оптимальный приоритет, температуру и лимит токенов под выбранную модель"
      >
        <Sparkles class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <span>Авто-подбор под модель</span>
      </button>
    </div>

    <!-- 3 Horizontal Instrument Wells (Zero Overflow, Aligned Presets) -->
    <div class="flex flex-col gap-3 min-w-0">
      <!-- 1. Priority (1–99) -->
      <div
        class="flex flex-col gap-3 p-3.5 sm:p-4 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] min-w-0 overflow-hidden"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      >
        <div class="flex items-center justify-between gap-3 min-w-0">
          <div class="flex flex-col gap-0.5 min-w-0">
            <label class="text-[13px] font-semibold text-[var(--arc-text-primary)] truncate" title="Приоритет маршрутизации (1 — высший)">
              Приоритет маршрутизации
            </label>
            <span class="text-xs text-[var(--arc-text-hint)] truncate">Очередь выбора шлюза в роутере (1 — высший, 99 — резерв)</span>
          </div>
          <input
            type="number"
            min="1"
            max="99"
            step="1"
            :value="modelValue.priority"
            @input="onManualPriorityInput"
            class="w-24 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-edge-strong)] focus:border-[var(--accent)] rounded-[8px] px-2.5 py-1.5 text-right text-xs font-mono font-bold text-[var(--arc-text-primary)] tabular-nums focus:outline-none transition-colors"
            title="Ручной ввод приоритета (1–99)"
          />
        </div>

        <ArcSlider
          :model-value="modelValue.priority"
          :min="1"
          :max="99"
          :step="1"
          :show-value="false"
          @update:model-value="val => updateField('priority', val, false)"
        />

        <div class="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            v-for="preset in PRIORITY_PRESETS"
            :key="preset.value"
            type="button"
            @click="updateField('priority', preset.value, false)"
            class="px-2.5 py-1 rounded-[7px] text-xs font-mono tabular-nums border transition-colors cursor-pointer"
            :class="!isAutoPriority && modelValue.priority === preset.value
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- 2. Temperature (0.0–2.0) -->
      <div
        class="flex flex-col gap-3 p-3.5 sm:p-4 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] min-w-0 overflow-hidden"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      >
        <div class="flex items-center justify-between gap-3 min-w-0">
          <div class="flex flex-col gap-0.5 min-w-0">
            <label class="text-[13px] font-semibold text-[var(--arc-text-primary)] truncate" title="Температура генерации (0.0 — точность, 2.0 — креативность)">
              Температура (Temperature)
            </label>
            <span class="text-xs text-[var(--arc-text-hint)] truncate">Вариативность ответа: от строгого анализа (0.2) до креатива (1.2+)</span>
          </div>
          <input
            type="number"
            min="0"
            max="2"
            step="0.05"
            :value="modelValue.temperature"
            @input="onManualTempInput"
            class="w-24 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-edge-strong)] focus:border-[var(--accent)] rounded-[8px] px-2.5 py-1.5 text-right text-xs font-mono font-bold text-[var(--arc-text-primary)] tabular-nums focus:outline-none transition-colors"
            title="Ручной ввод температуры (0.0–2.0)"
          />
        </div>

        <ArcSlider
          :model-value="modelValue.temperature"
          :min="0"
          :max="2"
          :step="0.05"
          :show-value="false"
          @update:model-value="val => updateField('temperature', val, false)"
        />

        <div class="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            v-for="preset in TEMP_PRESETS"
            :key="preset.value"
            type="button"
            @click="updateField('temperature', preset.value, false)"
            class="px-2.5 py-1 rounded-[7px] text-xs font-mono tabular-nums border transition-colors cursor-pointer"
            :class="!isAutoTemp && modelValue.temperature === preset.value
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- 3. Max Tokens (256–1M, Logarithmic Slider + Manual Input) -->
      <div
        class="flex flex-col gap-3 p-3.5 sm:p-4 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] min-w-0 overflow-hidden"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      >
        <div class="flex items-center justify-between gap-3 min-w-0">
          <div class="flex flex-col gap-0.5 min-w-0">
            <label class="text-[13px] font-semibold text-[var(--arc-text-primary)] truncate" title="Максимальное число токенов ответа">
              Макс. токенов ответа (Max Tokens)
            </label>
            <span class="text-xs font-mono text-[var(--arc-text-hint)] tabular-nums truncate">
              Текущий лимит: {{ formatTokens(modelValue.maxTokens) }} ({{ modelValue.maxTokens }} tok)
            </span>
          </div>
          <input
            type="number"
            min="64"
            max="1048576"
            step="256"
            :value="modelValue.maxTokens"
            @input="onManualTokensInput"
            class="w-24 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-edge-strong)] focus:border-[var(--accent)] rounded-[8px] px-2.5 py-1.5 text-right text-xs font-mono font-bold text-[var(--arc-text-primary)] tabular-nums focus:outline-none transition-colors"
            title="Ручной ввод точного количества токенов"
          />
        </div>

        <ArcSlider
          :model-value="sliderPosition"
          :min="0"
          :max="100"
          :step="1"
          :show-value="false"
          @update:model-value="onTokensSliderUpdate"
        />

        <div class="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            v-for="preset in TOKEN_PRESETS"
            :key="preset.value"
            type="button"
            @click="updateField('maxTokens', preset.value, false)"
            class="px-2.5 py-1 rounded-[7px] text-xs font-mono tabular-nums border transition-colors cursor-pointer"
            :class="!isAutoTokens && modelValue.maxTokens === preset.value
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
