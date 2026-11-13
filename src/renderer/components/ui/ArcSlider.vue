<template>
  <div class="flex flex-col gap-1.5 w-full select-none" :class="{ 'opacity-40 pointer-events-none': disabled }">
    <div v-if="label || showValue" class="flex items-center justify-between text-xs font-mono">
      <span v-if="label" class="text-[var(--arc-text-secondary)] font-medium text-xs">{{ label }}</span>
      <span 
        v-if="showValue" 
        class="text-[var(--arc-text-primary)] font-semibold text-xs bg-[var(--arc-input)] px-2 py-0.5 rounded-md border border-[var(--arc-hairline)] font-mono tabular-nums"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
      >
        {{ displayFormattedValue }}
      </span>
    </div>

    <div class="relative flex items-center w-full h-6">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        @input="onInput"
        class="custom-range w-full h-1.5 rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed transition-[background,box-shadow,opacity] duration-200 border border-[var(--arc-hairline)]"
        :style="trackStyle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  disabled?: boolean;
  showValue?: boolean;
  formatValue?: (val: number) => string;
}>(), {
  min: 0,
  max: 100,
  step: 1,
  unit: '',
  disabled: false,
  showValue: true
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const displayFormattedValue = computed(() => {
  if (props.formatValue) {
    return props.formatValue(props.modelValue);
  }
  if (props.step && props.step < 1) {
    const decimals = props.step.toString().split('.')[1]?.length || 1;
    return `${props.modelValue.toFixed(decimals)}${props.unit}`;
  }
  return `${Math.round(props.modelValue)}${props.unit}`;
});

const trackStyle = computed(() => {
  const percentage = Math.min(100, Math.max(0, ((props.modelValue - props.min) / (props.max - props.min)) * 100));
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percentage}%, var(--arc-input) ${percentage}%, var(--arc-input) 100%)`,
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.75)'
  };
});

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const val = parseFloat(target.value);
  if (!isNaN(val)) {
    emit('update:modelValue', val);
  }
};
</script>

<style scoped>
.custom-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 15px;
  width: 15px;
  border-radius: 9999px;
  background: var(--arc-text-primary);
  cursor: pointer;
  box-shadow: 0 0 10px rgba(var(--accent-rgb, 239, 68, 68), 0.55), 0 1px 3px rgba(0, 0, 0, 0.8);
  border: 2px solid var(--accent);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), 
              background-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.custom-range::-webkit-slider-thumb:hover {
  transform: scale(1.14);
  background: #ffffff;
  box-shadow: 0 0 14px rgba(var(--accent-rgb, 239, 68, 68), 0.85);
}

.custom-range::-webkit-slider-thumb:active {
  transform: scale(1.06);
}

.custom-range::-moz-range-thumb {
  height: 15px;
  width: 15px;
  border-radius: 9999px;
  background: var(--arc-text-primary);
  cursor: pointer;
  box-shadow: 0 0 10px rgba(var(--accent-rgb, 239, 68, 68), 0.55), 0 1px 3px rgba(0, 0, 0, 0.8);
  border: 2px solid var(--accent);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), 
              background-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.custom-range::-moz-range-thumb:hover {
  transform: scale(1.14);
  background: #ffffff;
  box-shadow: 0 0 14px rgba(var(--accent-rgb, 239, 68, 68), 0.85);
}

.custom-range::-moz-range-thumb:active {
  transform: scale(1.06);
}
</style>
