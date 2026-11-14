<template>
  <div class="flex flex-col gap-1.5 w-full min-w-0">
    <label v-if="label" :for="id" class="text-xs font-mono text-[var(--arc-text-muted)]" :title="label">
      {{ label }}
    </label>

    <div class="relative w-full min-w-0" :title="selectedOptionLabel">
      <select
        :id="id"
        :value="selectedIndex >= 0 ? String(selectedIndex) : ''"
        :disabled="disabled"
        :title="selectedOptionLabel"
        class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] hover:border-[var(--arc-text-muted)] rounded-[10px] pl-3 pr-8 text-xs font-mono text-[var(--arc-text-primary)] transition duration-200 outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed truncate"
        :class="sizeClasses[size]"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        @change="onChange"
      >
        <option
          v-if="selectedIndex === -1"
          value=""
          disabled
          hidden
        >
          {{ placeholder || '' }}
        </option>
        <option
          v-for="(option, index) in options"
          :key="`${index}-${typeof option.value}:${String(option.value)}`"
          :value="String(index)"
          :disabled="option.disabled"
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

<script setup lang="ts" generic="T extends string | number | boolean = string | number | boolean">
import { computed } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

type SelectValue = string | number | boolean;

interface SelectOption<V extends SelectValue = SelectValue> {
  label: string;
  value: V;
  disabled?: boolean;
}

type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  id?: string;
  modelValue: T;
  options: SelectOption<T>[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: Size;
}>(), {
  disabled: false,
  size: 'md',
  placeholder: ''
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
  (e: 'change', value: T): void;
}>();

const selectedIndex = computed(() =>
  props.options.findIndex((o) => Object.is(o.value, props.modelValue))
);

const selectedOptionLabel = computed(() => {
  if (selectedIndex.value >= 0) {
    return props.options[selectedIndex.value].label;
  }
  return props.placeholder || '';
});

const sizeClasses: Record<Size, string> = {
  sm: 'py-1.5 text-xs h-8',
  md: 'py-2 text-xs h-9',
  lg: 'py-2.5 text-sm h-11'
};

const onChange = (event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  if (!target || target.value === '') return;
  const idx = Number(target.value);
  if (!Number.isInteger(idx) || idx < 0 || idx >= props.options.length) return;
  const selected = props.options[idx];
  emit('update:modelValue', selected.value);
  emit('change', selected.value);
};
</script>
