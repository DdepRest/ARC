<template>
  <div 
    class="group/block relative overflow-hidden transition-colors rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)]"
    :class="blockClass"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 10px 28px rgba(0, 0, 0, 0.60)'
    }"
  >
    <!-- Block Header (Optional) -->
    <div 
      v-if="title || $slots.header || $slots.actions" 
      class="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--arc-hairline)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex flex-col gap-0.5 min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <component :is="icon" v-if="icon" class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
          <span class="text-[13px] font-semibold text-[var(--arc-text-primary)] tracking-tight leading-[1.35]">
            {{ title }}
          </span>
          <span v-if="subtitle" class="text-xs text-[var(--arc-text-hint)] font-normal leading-[1.5]">
            · {{ subtitle }}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 ml-2">
        <slot name="actions" />
      </div>
    </div>

    <!-- Rows Container -->
    <div class="divide-y divide-[var(--arc-hairline)]">
      <slot />
    </div>

    <!-- Collapsible Technical Details Slot -->
    <div v-if="$slots.details" class="border-t border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
      <details class="group">
        <summary class="flex items-center justify-between px-4 sm:px-5 py-2.5 text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer select-none transition-colors">
          <span class="flex items-center gap-1.5">
            <span class="text-xs text-[var(--accent)]">⚙</span>
            <span>{{ detailsLabel || 'Технические детали' }}</span>
          </span>
          <span class="text-xs text-[var(--arc-text-muted)] transition-transform duration-200 group-open:rotate-180">▼</span>
        </summary>
        <div class="px-4 sm:px-5 py-3.5 border-t border-[var(--arc-hairline)] bg-[var(--arc-frame)] text-xs">
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
