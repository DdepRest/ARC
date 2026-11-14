<template>
  <div
    class="group/block relative overflow-hidden transition-colors rounded-[var(--arc-radius-block,14px)] border border-[var(--arc-edge-strong)] bg-[var(--arc-block)]"
    :class="blockClass"
    :style="{
      fontFamily: 'var(--font-ui)',
      background: 'var(--arc-block-gradient)',
      boxShadow: 'var(--arc-block-elevation)'
    }"
  >
    <!-- Block Header (Optional) -->
    <div
      v-if="title || $slots.header || $slots.actions"
      class="flex items-center justify-between px-5 py-3.5 border-b border-[var(--arc-divider)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex flex-col gap-0.5 min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <component :is="icon" v-if="icon" class="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span class="text-[14px] font-semibold text-[var(--arc-text-primary)] tracking-tight leading-[1.35]">
            {{ title }}
          </span>
          <span v-if="subtitle" class="text-[12.5px] text-[var(--arc-text-hint)] font-normal leading-[1.5]">
            · {{ subtitle }}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 ml-2">
        <slot name="actions" />
      </div>
    </div>

    <!-- Rows Container (Quiet internal dividers) -->
    <div class="divide-y divide-[var(--arc-divider)]">
      <slot />
    </div>

    <!-- Collapsible Technical Details Slot (Level 3 Recessed Well) -->
    <div v-if="$slots.details" class="border-t border-[var(--arc-divider)] bg-[var(--arc-well)]" :style="{ boxShadow: 'var(--arc-well-shadow)' }">
      <details class="group">
        <summary class="flex items-center justify-between px-5 py-2.5 text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer select-none transition-colors">
          <span class="flex items-center gap-1.5">
            <span class="text-xs text-[var(--accent)]">⚙</span>
            <span>{{ detailsLabel || 'Технические детали' }}</span>
          </span>
          <span class="text-xs text-[var(--arc-text-muted)] transition-transform duration-200 group-open:rotate-180">▼</span>
        </summary>
        <div class="px-5 py-3.5 border-t border-[var(--arc-divider)] bg-[var(--arc-well)] text-xs">
          <slot name="details" />
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: Component;
  detailsLabel?: string;
  blockClass?: string;
}>();
</script>
