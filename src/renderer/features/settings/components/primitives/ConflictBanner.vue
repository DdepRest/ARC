<template>
  <div 
    v-if="show"
    class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-[14px] border border-[var(--status-warn)]/40 bg-[var(--arc-block)] transition-all"
  >
    <div class="flex items-start gap-2.5">
      <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)] ring-1 ring-[var(--status-warn)]/30 shrink-0 mt-1.5"></span>
      <div class="flex flex-col">
        <span class="text-[13px] font-semibold text-[var(--arc-text-primary)] leading-[1.35]">
          {{ title || 'Противоречие в настройках' }}
        </span>
        <span class="text-xs text-[var(--arc-text-secondary)] leading-[1.50] mt-0.5 max-w-xl">
          <slot>{{ message }}</slot>
        </span>
      </div>
    </div>

    <button
      v-if="actionLabel"
      type="button"
      @click="$emit('resolve')"
      class="px-3 py-1.5 rounded-xl border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] bg-[var(--arc-plane)] text-[var(--arc-text-primary)] hover:text-white text-xs font-mono font-medium transition cursor-pointer self-start sm:self-center shrink-0"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  show?: boolean;
  title?: string;
  message?: string;
  actionLabel?: string;
  type?: 'warn' | 'error';
}>(), {
  show: true,
  type: 'warn'
});

defineEmits<{
  (e: 'resolve'): void;
}>();
</script>
