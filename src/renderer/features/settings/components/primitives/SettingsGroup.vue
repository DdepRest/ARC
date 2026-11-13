<template>
  <div class="flex flex-col gap-3.5" :id="id">
    <!-- Functional Group Header (Level 2 Hierarchy) -->
    <div 
      v-if="title || $slots.header || $slots.actions"
      class="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-2.5 border-b border-[var(--arc-hairline)] select-none"
    >
      <div class="flex flex-col gap-0.5 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span 
            v-if="indexLabel" 
            class="text-xs font-mono font-semibold text-[var(--accent)] tracking-wider uppercase shrink-0 tabular-nums"
          >
            {{ indexLabel }}
          </span>
          <component 
            :is="icon" 
            v-if="icon" 
            class="w-3.5 h-3.5 text-[var(--arc-text-machine)] shrink-0" 
          />
          <h3 class="text-sm font-semibold text-[var(--arc-text-primary)] tracking-tight leading-snug">
            {{ title }}
          </h3>
          <span 
            v-if="badgeText" 
            class="text-xs font-mono text-[var(--arc-text-machine)] px-2 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] tabular-nums"
          >
            {{ badgeText }}
          </span>
        </div>
        <p v-if="description" class="text-xs text-[var(--arc-text-hint)] leading-relaxed max-w-2xl">
          {{ description }}
        </p>
      </div>

      <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <!-- Functional Group Content -->
    <div class="flex flex-col gap-3.5">
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
