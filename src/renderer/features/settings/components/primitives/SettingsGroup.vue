<template>
  <div class="flex flex-col gap-4" :id="id" :style="{ fontFamily: 'var(--font-ui)' }">
    <!-- Functional Group Header (Level 2 Hierarchy — Architectural Section Rail) -->
    <div
      v-if="title || $slots.header || $slots.actions"
      class="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 pb-2.5 select-none relative"
      :style="{
        borderBottom: '1px solid transparent',
        backgroundImage: 'linear-gradient(90deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.05) 55%, transparent 100%)',
        backgroundPosition: '0 100%',
        backgroundSize: '100% 1px',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <div class="flex flex-col gap-1 min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span
            v-if="indexLabel"
            class="px-1.5 py-0.5 rounded-[5px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] text-xs font-mono font-semibold text-[var(--accent)] tracking-wider shrink-0 tabular-nums"
          >
            {{ indexLabel }}
          </span>
          <component
            :is="icon"
            v-if="icon"
            class="w-4 h-4 text-[var(--arc-text-machine)] shrink-0"
          />
          <h3 class="text-[15.5px] sm:text-[16.5px] font-semibold text-[var(--arc-text-primary)] tracking-tight leading-snug">
            {{ title }}
          </h3>
          <span
            v-if="badgeText"
            class="text-xs font-mono text-[var(--arc-text-machine)] tabular-nums"
          >
            · {{ badgeText }}
          </span>
        </div>
        <p v-if="description" class="text-[12.5px] sm:text-[13px] text-[var(--arc-text-hint)] leading-relaxed max-w-[68ch]">
          {{ description }}
        </p>
      </div>

      <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <!-- Functional Group Content -->
    <div class="flex flex-col gap-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  id?: string;
  title?: string;
  description?: string;
  indexLabel?: string;
  badgeText?: string;
  icon?: Component;
}>();
</script>
