<template>
  <div 
    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono tracking-wide border bg-[var(--arc-block)] select-none"
    :class="variantClasses[variant]"
    :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
  >
    <span 
      v-if="pulse" 
      class="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" 
      :class="dotClasses[variant]" 
    />
    <span><slot /></span>
  </div>
</template>

<script setup lang="ts">
type Variant = 'online' | 'offline' | 'warning' | 'danger' | 'indigo';

withDefaults(defineProps<{
  variant?: Variant;
  pulse?: boolean;
}>(), {
  variant: 'indigo',
  pulse: false
});

const variantClasses: Record<Variant, string> = {
  online: 'text-[var(--status-ok)] border-[var(--status-ok)]/30',
  offline: 'text-[var(--arc-text-muted)] border-[var(--arc-hairline)]',
  warning: 'text-[var(--status-warn)] border-[var(--status-warn)]/30',
  danger: 'text-[var(--status-err)] border-[var(--status-err)]/30',
  indigo: 'text-[var(--accent)] border-[var(--accent)]/35'
};

const dotClasses: Record<Variant, string> = {
  online: 'bg-[var(--status-ok)]',
  offline: 'bg-[var(--arc-text-muted)]',
  warning: 'bg-[var(--status-warn)]',
  danger: 'bg-[var(--status-err)]',
  indigo: 'bg-[var(--accent)]'
};
</script>
