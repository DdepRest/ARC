<template>
  <div class="flex flex-col gap-1.5 w-full">
    <label v-if="label" :for="id" class="text-xs font-mono text-[var(--arc-text-muted)] flex items-center justify-between">
      <span>{{ label }}</span>
      <span v-if="hint" class="text-xs text-[var(--arc-text-hint)]">{{ hint }}</span>
    </label>
    
    <div class="relative flex items-center w-full">
      <div v-if="$slots.prefix" class="absolute left-3 text-[var(--arc-text-muted)] flex items-center pointer-events-none">
        <slot name="prefix" />
      </div>

      <input
        :id="id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        class="w-full bg-[var(--arc-input)] border rounded-[10px] text-xs sm:text-sm text-[var(--arc-text-primary)] placeholder-[var(--arc-text-muted)] transition duration-200 outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        :class="[
          $slots.prefix ? 'pl-10' : 'pl-3.5',
          $slots.suffix ? 'pr-10' : 'pr-3.5',
          error ? 'border-[var(--status-err)] focus:border-[var(--status-err)] focus:ring-[var(--status-err)]' : 'border-[var(--arc-hairline)] hover:border-[var(--arc-text-muted)]',
          sizeClasses[size]
        ]"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        @input="onInput"
        @focus="$emit('focus', $event)"
        @blur="$emit('blur', $event)"
        @keyup.enter="$emit('enter')"
      />

      <div v-if="$slots.suffix" class="absolute right-3 text-[var(--arc-text-muted)] flex items-center">
        <slot name="suffix" />
      </div>
    </div>

    <span v-if="error" class="text-xs text-[var(--status-err)] font-mono">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  id?: string;
  modelValue: string | number;
  label?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  readonly?: boolean;
  size?: Size;
}>(), {
  type: 'text',
  placeholder: '',
  disabled: false,
  readonly: false,
  size: 'md'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'enter'): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();

const sizeClasses: Record<Size, string> = {
  sm: 'py-1 text-xs h-8',
  md: 'py-2 text-xs sm:text-sm h-10',
  lg: 'py-2.5 text-sm h-12'
};

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};
</script>
