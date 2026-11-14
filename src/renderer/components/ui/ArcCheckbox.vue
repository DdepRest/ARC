<template>
  <button
    :id="id"
    type="button"
    role="checkbox"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="toggle"
    class="relative inline-flex items-center justify-center shrink-0 border text-sm transition duration-200 outline-none select-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.5)]"
    :class="[
      size === 'sm' ? 'w-4.5 h-4.5 rounded-[5px]' : 'w-6 h-6 rounded-[8px]',
      modelValue
        ? 'bg-[var(--arc-selected)] border-[rgba(var(--status-ok-rgb,34,197,94),0.5)] text-[var(--status-ok)]'
        : 'border-[var(--arc-hairline)] bg-[var(--arc-input)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] text-transparent hover:text-[var(--arc-text-hint)]',
      disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
    ]"
    :style="{
      boxShadow: modelValue
        ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 10px rgba(var(--status-ok-rgb,34,197,94),0.2)'
        : 'inset 0 1px 2px rgba(0,0,0,0.65)'
    }"
  >
    <Check
      class="transition-transform duration-200"
      :class="[size === 'sm' ? 'w-3 h-3' : 'w-4 h-4', modelValue ? 'scale-100' : 'scale-0']"
    />
  </button>
</template>

<script setup lang="ts">
import { Check } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  id?: string;
  modelValue: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
}>(), {
  id: undefined,
  disabled: false,
  size: 'md'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const toggle = () => {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue);
  }
};
</script>
