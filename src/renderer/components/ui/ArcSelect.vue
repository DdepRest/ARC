<template>
  <div class="flex flex-col gap-1.5 w-full min-w-0">
    <label v-if="label" :for="id" class="text-xs font-mono text-[var(--arc-text-muted)]" :title="label">
      {{ label }}
    </label>

    <div class="relative w-full min-w-0" :title="selectedOptionLabel">
      <select
        :id="id"
        :value="modelValue"
        :disabled="disabled"
        :title="selectedOptionLabel"
        class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] hover:border-[var(--arc-text-muted)] rounded-[10px] pl-3 pr-8 text-xs font-mono text-[var(--arc-text-primary)] transition duration-200 outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed truncate"
        :class="sizeClasses[size]"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        @change="onChange"
      >
        <option
          v-for="option in options"
          :key="String(option.value)"
          :value="option.value"
          :title="option.label"
          class="bg-[var(--arc-popover)] text-[var(--arc-text-primary)] py-2"
        >
          {{ option.label }}
        </option>
      </select>

      <div class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--arc-text-muted)]">
        <ChevronDown class="w-3.5 h-3.5" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

interface SelectOption {
  label: string;
  value: string | number | boolean;
}

type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  id?: string;
  modelValue: string | number | boolean;
  options: SelectOption[];
  label?: string;
  disabled?: boolean;
  size?: Size;
}>(), {
  disabled: false,
  size: 'md'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const selectedOptionLabel = computed(() => {
  const found = props.options.find(o => String(o.value) === String(props.modelValue));
  return found ? found.label : String(props.modelValue || '');
});

const sizeClasses: Record<Size, string> = {
  sm: 'py-1.5 text-xs h-8',
  md: 'py-2 text-xs h-9',
  lg: 'py-2.5 text-sm h-11'
};

const onChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
};
</script>
