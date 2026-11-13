<template>
  <div class="flex flex-col gap-2.5 border-b border-[var(--arc-hairline)] pb-4">
    <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest">{{ translations?.priorityDistribution || 'РАСПРЕДЕЛЕНИЕ ПО ПРИОРИТЕТАМ' }}</span>
    <div class="flex flex-col gap-2">
      <div v-for="p in ['high', 'medium', 'low']" :key="p" class="flex flex-col gap-1">
        <div class="flex justify-between text-xs font-mono uppercase tracking-wide">
          <span class="text-[var(--arc-text-primary)] font-semibold">
            {{ p === 'high' ? 'Высокий (P1)' : p === 'medium' ? 'Средний (P2)' : 'Низкий (P3)' }}
          </span>
          <span class="text-[var(--arc-text-muted)]">{{ typeof getPriorityCount === 'function' ? getPriorityCount(p) : 0 }} / {{ tasksCount || 0 }}</span>
        </div>
        <div class="h-1 bg-[var(--arc-plane)] rounded-full overflow-hidden w-full">
          <div 
            class="h-full bg-[var(--accent)] transition-[width] duration-300"
            :style="{ width: `${(typeof getPriorityRatio === 'function' ? getPriorityRatio(p) : 0) * 100}%` }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  translations?: any;
  getPriorityCount?: (p: string) => number;
  getPriorityRatio?: (p: string) => number;
  tasksCount?: number;
}>(), {
  translations: () => ({}),
  getPriorityCount: () => 0,
  getPriorityRatio: () => 0,
  tasksCount: 0
});
</script>
