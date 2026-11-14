<template>
  <div class="inline-flex items-center gap-2.5">
    <!-- Unboxed inline status text with semantic dot -->
    <span
      class="inline-flex items-center gap-1.5 text-xs font-mono tracking-wide font-semibold tabular-nums"
      :class="textClasses"
    >
      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="dotClasses" />
      <span><slot>{{ label }}</slot></span>
    </span>

    <!-- Interactive action button keeps border & surface -->
    <button
      v-if="actionLabel"
      type="button"
      @click="$emit('action')"
      class="px-2.5 py-0.5 rounded-[8px] border border-[var(--arc-edge-strong)] bg-[var(--arc-input)] hover:bg-[var(--arc-hover)] text-xs font-mono text-[var(--arc-text-primary)] transition-colors cursor-pointer"
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

const textClasses = computed(() => {
  switch (props.status) {
    case 'ok':
      return 'text-[var(--status-ok)]';
    case 'warn':
      return 'text-[var(--status-warn)]';
    case 'err':
      return 'text-[var(--status-err)]';
    case 'off':
    default:
      return 'text-[var(--arc-text-secondary)]';
  }
});

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
