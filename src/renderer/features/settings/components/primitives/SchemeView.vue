<template>
  <div 
    class="p-4 overflow-hidden rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] transition-colors"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <div v-if="title" class="flex items-center justify-between text-xs text-[var(--arc-text-hint)] mb-3">
      <span class="font-semibold text-[var(--arc-text-primary)] text-[13px] leading-[1.35]">{{ title }}</span>
      <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-[0.08em]">СХЕМА · ТОЛЬКО ЧТЕНИЕ</span>
    </div>

    <!-- Pipeline items flow -->
    <div class="flex items-center gap-2 overflow-x-auto arc-scroll py-1">
      <template v-for="(node, idx) in nodes" :key="idx">
        <div class="flex flex-col gap-0.5 p-2.5 px-3.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] shrink-0 min-w-[96px]">
          <div class="flex items-center gap-1.5">
            <span v-if="node.dotColor" class="w-1.5 h-1.5 rounded-full" :class="node.dotColor" />
            <span class="text-xs font-semibold text-[var(--arc-text-primary)]">{{ node.title }}</span>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-muted)]">{{ node.subtitle }}</span>
        </div>

        <!-- Arrow separator -->
        <span v-if="idx < nodes.length - 1" class="text-[var(--arc-text-muted)] text-xs font-mono shrink-0 px-0.5">
          {{ node.altArrow || '→' }}
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface SchemeNode {
  title: string;
  subtitle: string;
  dotColor?: string;
  altArrow?: string;
}

defineProps<{
  title?: string;
  nodes: SchemeNode[];
}>();
</script>
