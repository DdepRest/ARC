<script setup lang="ts">
import { computed, ref } from 'vue';
import { Sliders, Sparkles } from 'lucide-vue-next';

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
  { label: '1', value: 1 },
  { label: '3', value: 3 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 }
];

const TEMP_PRESETS = [
  { label: '0.0', value: 0.0 },
  { label: '0.3', value: 0.3 },
  { label: '0.7', value: 0.7 },
  { label: '1.0', value: 1.0 },
  { label: '1.5', value: 1.5 },
  { label: '2.0', value: 2.0 }
];

const TOKEN_PRESETS = [
  { label: '1K', value: 1024 },
  { label: '4K', value: 4096 },
  { label: '16K', value: 16384 },
  { label: '64K', value: 65536 },
  { label: '256K', value: 262144 },
  { label: '1M', value: 1048576 }
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

  // Локальные шлюзы (FreeLLMAPI / FreeAPILLM / Ollama) — 4K (безопасный лимит для всех апстримов)
  if (provider === 'local') return 4096;

  // OpenRouter виртуальные роутеры — известные значения контекста
  if (m === 'openrouter/free' || m === 'free') return 16384;  // 200K context, но max_tokens ответа = 16K
  if (m === 'openrouter/auto' || m === 'auto') return 16384;  // 2M context, max_tokens = 16K
  if (m === 'openrouter/fusion' || m === 'fusion') return 16384;
  if (m === 'openrouter/pareto-code' || m === 'pareto-code') return 16384;

  // Явные большие контексты — max_tokens до 32K
  if (m.includes('1m') || m.includes('1000k') || m.includes('2m')) return 32768;
  if (m.includes('gemini-2.5') || m.includes('gemini-2.0') || m.includes('gemini-1.5')) return 32768;
  if (m.includes('claude-3-7') || m.includes('claude-4') || m.includes('gpt-4.1')) return 32768;

  // Стандартные современные модели — 16K
  if (m.includes('gpt-4o') || m.includes('o1') || m.includes('o3') || m.includes('deepseek') || m.includes('qwen') || m.includes('128k')) return 16384;

  // Крупные open-source (llama, mistral, qwen 70b+) — 8K (архитектурный лимит)
  if (m.includes('claude-3-5') || m.includes('llama-3.3') || m.includes('llama-3.1') || m.includes('70b')) return 8192;

  // Локальные модели — 4K (осторожный дефолт)
  if (provider === 'local') return 4096;

  // Неизвестные облачные модели — 16K (не 8K!)
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

const onTokensSliderInput = (e: Event) => {
  const sliderVal = Number((e.target as HTMLInputElement).value);
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
  <div class="flex flex-col gap-2.5 pt-1">
    <!-- Header with Global Auto-Calculate Button -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <Sliders class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">
          ПАРАМЕТРЫ ЗАПРОСОВ
        </span>
      </div>

      <button
        type="button"
        @click="applyAutoAll"
        class="px-2 py-0.5 rounded-[6px] text-xs font-mono bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] transition-colors flex items-center gap-1 cursor-pointer"
        title="Автоматически подобрать оптимальный приоритет, температуру и лимит токенов под модель"
      >
        <Sparkles class="w-3 h-3 text-[var(--accent)]" />
        <span>АВТО-ПОДБОР</span>
      </button>
    </div>

    <!-- 3-Column Unified Controls Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
      <!-- 1. Priority (1–99) -->
      <div class="flex flex-col justify-between gap-2 p-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between gap-2">
          <label class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider truncate" title="Приоритет маршрутизации (1 — высший)">
            ПРИОРИТЕТ
          </label>
          <input
            type="number"
            min="1"
            max="99"
            step="1"
            :value="modelValue.priority"
            @input="onManualPriorityInput"
            class="w-16 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[6px] px-2 py-0.5 text-right text-xs font-mono font-bold text-[var(--accent)] tabular-nums focus:outline-none transition-colors"
            title="Ручной ввод приоритета (1–99)"
          />
        </div>

        <input
          type="range"
          min="1"
          max="99"
          step="1"
          :value="modelValue.priority"
          @input="e => updateField('priority', Number((e.target as HTMLInputElement).value), false)"
          class="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[var(--arc-input)] accent-[var(--accent)]"
        />

        <div class="flex flex-wrap items-center gap-1 pt-0.5">
          <button
            type="button"
            @click="updateField('priority', computeAutoPriority(), true)"
            class="px-1.5 py-0.5 rounded-[6px] text-xs font-mono border transition-colors cursor-pointer flex items-center gap-0.5"
            :class="isAutoPriority
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--accent)] font-bold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
            title="Автоматически вычислить приоритет"
          >
            АВТО
          </button>
          <button
            v-for="preset in PRIORITY_PRESETS"
            :key="preset.value"
            type="button"
            @click="updateField('priority', preset.value, false)"
            class="px-1.5 py-0.5 rounded-[6px] text-xs font-mono tabular-nums border transition-colors cursor-pointer"
            :class="!isAutoPriority && modelValue.priority === preset.value
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-bold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- 2. Temperature (0.0–2.0) -->
      <div class="flex flex-col justify-between gap-2 p-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between gap-2">
          <label class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider truncate" title="Температура генерации (0.0 — точность, 2.0 — креативность)">
            ТЕМПЕРАТУРА
          </label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.05"
            :value="modelValue.temperature"
            @input="onManualTempInput"
            class="w-16 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[6px] px-2 py-0.5 text-right text-xs font-mono font-bold text-[var(--accent)] tabular-nums focus:outline-none transition-colors"
            title="Ручной ввод температуры (0.0–2.0)"
          />
        </div>

        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          :value="modelValue.temperature"
          @input="e => updateField('temperature', Number((e.target as HTMLInputElement).value), false)"
          class="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[var(--arc-input)] accent-[var(--accent)]"
        />

        <div class="flex flex-wrap items-center gap-1 pt-0.5">
          <button
            type="button"
            @click="updateField('temperature', computeAutoTemperature(), true)"
            class="px-1.5 py-0.5 rounded-[6px] text-xs font-mono border transition-colors cursor-pointer flex items-center gap-0.5"
            :class="isAutoTemp
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--accent)] font-bold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
            title="Автоматически подобрать температуру под тип модели"
          >
            АВТО
          </button>
          <button
            v-for="preset in TEMP_PRESETS"
            :key="preset.value"
            type="button"
            @click="updateField('temperature', preset.value, false)"
            class="px-1.5 py-0.5 rounded-[6px] text-xs font-mono tabular-nums border transition-colors cursor-pointer"
            :class="!isAutoTemp && modelValue.temperature === preset.value
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-bold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- 3. Max Tokens (256–1M, Logarithmic Slider + Manual Input + Auto) -->
      <div class="flex flex-col justify-between gap-2 p-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between gap-2">
          <label class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider truncate" title="Максимальное число токенов ответа">
            МАКС. ТОКЕНОВ
          </label>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-xs font-mono text-[var(--arc-text-hint)] tabular-nums">
              {{ formatTokens(modelValue.maxTokens) }}
            </span>
            <input
              type="number"
              min="64"
              max="1048576"
              step="256"
              :value="modelValue.maxTokens"
              @input="onManualTokensInput"
              class="w-20 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[6px] px-1.5 py-0.5 text-right text-xs font-mono font-bold text-[var(--accent)] tabular-nums focus:outline-none transition-colors"
              title="Ручной ввод точного количества токенов"
            />
          </div>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="sliderPosition"
          @input="onTokensSliderInput"
          class="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[var(--arc-input)] accent-[var(--accent)]"
        />

        <div class="flex flex-wrap items-center gap-1 pt-0.5">
          <button
            type="button"
            @click="updateField('maxTokens', computeAutoTokens(), true)"
            class="px-1.5 py-0.5 rounded-[6px] text-xs font-mono border transition-colors cursor-pointer flex items-center gap-0.5"
            :class="isAutoTokens
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--accent)] font-bold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
            title="Автоматически вычислить оптимальный лимит токенов для выбранной модели"
          >
            АВТО
          </button>
          <button
            v-for="preset in TOKEN_PRESETS"
            :key="preset.value"
            type="button"
            @click="updateField('maxTokens', preset.value, false)"
            class="px-1.5 py-0.5 rounded-[6px] text-xs font-mono tabular-nums border transition-colors cursor-pointer"
            :class="!isAutoTokens && modelValue.maxTokens === preset.value
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-bold'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
