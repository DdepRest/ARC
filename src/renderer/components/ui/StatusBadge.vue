<template>
  <span 
    :id="id"
    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-xs font-semibold tracking-wider uppercase border bg-[var(--arc-block)]"
    :class="classes"
    :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
  >
    <span class="w-1.5 h-1.5 rounded-full" :class="dotClasses"></span>
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  id?: string;
  status: string;
}>();

const label = computed(() => props.status);

const classes = computed(() => {
  const s = props.status.toUpperCase();
  switch (s) {
    case 'ACTIVE':
    case 'RUNNING':
    case 'IN_PROGRESS':
      return 'border-[var(--accent)]/35 text-[var(--accent)]';
    case 'COMPLETED':
    case 'DONE':
    case 'SUCCESS':
      return 'border-[var(--status-ok)]/35 text-[var(--status-ok)]';
    case 'BLOCKED':
    case 'FAILED':
    case 'ERROR':
      return 'border-[var(--status-err)]/35 text-[var(--status-err)]';
    case 'DUE':
    case 'WARNING':
    case 'PENDING':
      return 'border-[var(--status-warn)]/35 text-[var(--status-warn)]';
    case 'DRAFT':
    case 'BACKLOG':
    case 'IDLE':
    default:
      return 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)]';
  }
});

const dotClasses = computed(() => {
  const s = props.status.toUpperCase();
  switch (s) {
    case 'ACTIVE':
    case 'RUNNING':
    case 'IN_PROGRESS':
      return 'bg-[var(--accent)] animate-pulse';
    case 'COMPLETED':
    case 'DONE':
    case 'SUCCESS':
      return 'bg-[var(--status-ok)]';
    case 'BLOCKED':
    case 'FAILED':
    case 'ERROR':
      return 'bg-[var(--status-err)]';
    case 'DUE':
    case 'WARNING':
    case 'PENDING':
      return 'bg-[var(--status-warn)]';
    case 'DRAFT':
    case 'BACKLOG':
    case 'IDLE':
    default:
      return 'bg-[var(--arc-text-muted)]';
  }
});
</script>
