<template>
  <div class="flex items-center gap-3 bg-[var(--arc-block)] border border-[var(--arc-hairline)] px-3.5 py-2 rounded-xl">
    <div class="flex flex-col text-right">
      <span class="text-[10px] font-mono text-[var(--arc-text-machine)] tracking-wider">{{ translations.completed || 'ГОТОВО' }}</span>
      <span class="text-xs font-mono font-bold text-[var(--arc-text-primary)]">{{ completedCount }} <span class="text-[var(--arc-text-muted)]">/ {{ tasks.length }}</span></span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-full border border-[var(--arc-hairline)] flex items-center justify-center relative bg-[var(--arc-plane)]">
        <svg class="w-full h-full transform -rotate-90 p-0.5">
          <circle cx="14" cy="14" r="11" stroke="var(--arc-hairline)" stroke-width="2.5" fill="transparent" />
          <circle
            cx="14"
            cy="14"
            r="11"
            stroke="var(--accent)"
            stroke-width="2.5"
            fill="transparent"
            :stroke-dasharray="2 * Math.PI * 11"
            :stroke-dashoffset="2 * Math.PI * 11 * (1 - completionRatio)"
            class="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
      </div>
      <span class="text-[22px] font-mono font-bold text-[var(--arc-text-primary)] tabular-nums leading-none">{{ Math.round(completionRatio * 100) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';
const tasksStore = useTasksStore();
const { translations, completedCount, tasks, completionRatio } = storeToRefs(tasksStore);
</script>