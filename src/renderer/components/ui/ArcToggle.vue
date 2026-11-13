<template>
  <div 
    v-if="label || description || $slots.default"
    class="flex items-center justify-between gap-3 select-none"
    :class="[
      disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
      wrapperClass
    ]"
    @click="toggle"
  >
    <div class="flex flex-col pr-2">
      <slot>
        <span v-if="label" class="text-xs font-medium text-[var(--arc-text-primary)]">
          {{ label }}
        </span>
        <span v-if="description" class="text-xs text-[var(--arc-text-hint)] mt-0.5 leading-snug">
          {{ description }}
        </span>
      </slot>
    </div>

    <button
      :id="id"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled || loading"
      @click.stop="toggle"
      @keydown.space.prevent="toggle"
      @keydown.enter.prevent="toggle"
      class="relative inline-flex shrink-0 items-center cursor-pointer rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] border"
      :class="[
        trackSizeClasses,
        modelValue 
          ? 'bg-[var(--accent)] border-[var(--accent)]' 
          : 'bg-[var(--arc-input)] border-[var(--arc-hairline)] hover:border-[var(--arc-text-muted)]',
        (disabled || loading) ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
      ]"
      :style="modelValue 
        ? { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 14px rgba(var(--accent-rgb, 239, 68, 68), 0.40)' } 
        : { boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.85)' }"
    >
      <span
        class="pointer-events-none inline-flex items-center justify-center transform rounded-full ring-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        :class="[
          thumbSizeClasses,
          modelValue ? thumbTranslateClasses : 'translate-x-0.5',
          modelValue ? 'bg-white' : 'bg-[var(--arc-text-secondary)]'
        ]"
        :style="{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.65)' }"
      >
        <svg 
          v-if="loading" 
          class="animate-spin text-[var(--arc-frame)]"
          :class="size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'"
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      </span>
    </button>
  </div>

  <button
    v-else
    :id="id"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled || loading"
    @click="toggle"
    @keydown.space.prevent="toggle"
    @keydown.enter.prevent="toggle"
    class="relative inline-flex shrink-0 items-center cursor-pointer rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] select-none border"
    :class="[
      trackSizeClasses,
      modelValue 
        ? 'bg-[var(--accent)] border-[var(--accent)]' 
        : 'bg-[var(--arc-input)] border-[var(--arc-hairline)] hover:border-[var(--arc-text-muted)]',
      (disabled || loading) ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
    ]"
    :style="modelValue 
      ? { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 14px rgba(var(--accent-rgb, 239, 68, 68), 0.40)' } 
      : { boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.85)' }"
  >
    <span
      class="pointer-events-none inline-flex items-center justify-center transform rounded-full ring-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      :class="[
        thumbSizeClasses,
        modelValue ? thumbTranslateClasses : 'translate-x-0.5',
        modelValue ? 'bg-white' : 'bg-[var(--arc-text-secondary)]'
      ]"
      :style="{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.65)' }"
    >
      <svg 
        v-if="loading" 
        class="animate-spin text-[var(--arc-frame)]"
        :class="size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'"
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  modelValue: boolean;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  description?: string;
  id?: string;
  wrapperClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
  size: 'md',
  label: '',
  description: '',
  id: undefined,
  wrapperClass: ''
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'change', value: boolean): void;
}>();

const toggle = () => {
  if (props.disabled || props.loading) return;
  const next = !props.modelValue;
  emit('update:modelValue', next);
  emit('change', next);
};

const trackSizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-5 w-9';
    case 'lg':
      return 'h-7 w-14';
    case 'md':
    default:
      return 'h-6 w-11';
  }
});

const thumbSizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-4 w-4';
    case 'lg':
      return 'h-6 w-6';
    case 'md':
    default:
      return 'h-5 w-5';
  }
});

const thumbTranslateClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'translate-x-4.5';
    case 'lg':
      return 'translate-x-7.5';
    case 'md':
    default:
      return 'translate-x-5.5';
  }
});
</script>
