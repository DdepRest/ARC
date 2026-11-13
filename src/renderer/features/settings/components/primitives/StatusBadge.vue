<template>
  <div class="inline-flex items-center gap-2">
    <span 
      class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-xs font-mono tracking-[0.08em] uppercase font-semibold text-[var(--arc-text-secondary)]"
      :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
    >
      <span class="w-1.5 h-1.5 rounded-full ring-1 ring-[var(--arc-hairline)] shrink-0" :class="dotClasses" />
      <span><slot>{{ label }}</slot></span>
    </span>

    <button
      v-if="actionLabel"
      type="button"
      @click="$emit('action')"
      class="px-2.5 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-xs font-mono text-[var(--arc-text-primary)] transition-colors cursor-pointer"
      :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  status?: 'off' | 'ok' | 'warn' | 'err';
  label?: string;
  actionLabel?: string;
}>(), {
  status: 'off',
  label: ''
});

defineEmits<{
  (e: 'action'): void;
}>();

const dotClasses = computed(() => {
  switch (props.status) {
    case 'ok':
      return 'bg-[var(--status-ok)]';
    case 'warn':
      return 'bg-[var(--status-warn)]';
    case 'err':
      return 'bg-[var(--status-err)]';
    case 'off':
    default:
      return 'bg-[var(--arc-text-muted)]';
  }
});
</script>
