<template>
  <button 
    :id="id"
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
    :class="[
      variantClasses[variant],
      sizeClasses[size]
    ]"
    :style="buttonElevationStyle"
    @click="handleClick"
  >
    <Loader2 v-if="loading" class="w-4 h-4 animate-spin shrink-0" />
    <slot name="icon" v-else-if="$slots.icon" />
    <span><slot /></span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from 'lucide-vue-next';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const props = withDefaults(defineProps<{
  id?: string;
  variant?: Variant;
  size?: Size;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
}>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] hover:opacity-95 text-[var(--accent-ink,#0A0A0A)] border border-[var(--accent)] font-semibold',
  secondary: 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)]',
  ghost: 'bg-transparent hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border border-transparent',
  danger: 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-err)] border border-[var(--status-err)]/35 font-semibold',
  warning: 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-warn)] border border-[var(--status-warn)]/35 font-semibold'
};

const buttonElevationStyle = computed(() => {
  if (props.variant === 'primary') {
    return {
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 4px 14px rgba(var(--accent-rgb, 239, 68, 68), 0.35)'
    };
  }
  if (props.variant === 'ghost') {
    return {};
  }
  return {
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 4px 12px rgba(0, 0, 0, 0.55)'
  };
});

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-xs min-h-[34px]',
  md: 'px-4 py-2 text-xs sm:text-sm min-h-[40px]',
  lg: 'px-5 py-2.5 text-sm min-h-[44px]',
  icon: 'w-9 h-9 p-0'
};

const handleClick = (e: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', e);
  }
};
</script>
