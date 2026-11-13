<template>
  <div 
    class="flex flex-col justify-between p-4 rounded-[16px] border transition-all cursor-pointer select-none text-left relative overflow-hidden"
    :class="active 
      ? 'bg-[var(--arc-selected)] border-[var(--arc-border-focus,var(--arc-hairline))]' 
      : 'bg-[var(--arc-block)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] hover:bg-[var(--arc-hover)]'"
    :style="{
      backgroundImage: 'var(--arc-sheen)',
      boxShadow: active 
        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 16px rgba(var(--accent-rgb, 239, 68, 68), 0.16), 0 8px 24px rgba(0, 0, 0, 0.55)' 
        : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
    @click="$emit('select')"
  >
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-xs font-semibold text-[var(--arc-text-primary)] tracking-normal truncate">{{ title }}</span>
      <span 
        v-if="role" 
        class="text-xs font-mono px-2 py-0.5 rounded-[6px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] uppercase font-semibold text-[var(--arc-text-muted)] shrink-0 tracking-[0.08em]"
      >
        {{ role }}
      </span>
    </div>

    <p class="text-xs text-[var(--arc-text-secondary)] leading-[1.50] mb-3 flex-1">
      <slot>{{ description }}</slot>
    </p>

    <div v-if="$slots.footer || metaLeft || metaRight" class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-muted)] pt-2.5 border-t border-[var(--arc-divider)]">
      <slot name="footer">
        <span class="truncate">{{ metaLeft }}</span>
        <span class="truncate">{{ metaRight }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  role?: 'ОСНОВНОЙ' | 'ЗАПАСНОЙ' | 'FALLBACK' | 'ЛОКАЛЬНЫЙ' | 'NATIVE' | string;
  metaLeft?: string;
  metaRight?: string;
  active?: boolean;
}>();

defineEmits<{
  (e: 'select'): void;
}>();
</script>
