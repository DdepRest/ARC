<template>
  <div class="flex flex-col gap-2 border-b border-[var(--arc-hairline)] pb-4">
    <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest">{{ translations?.cognitiveLoad || 'ПРОГРЕСС ЗАДАЧ' }}</span>
    <div class="flex justify-between items-end">
      <span class="text-xs font-mono text-[var(--arc-text-muted)] font-bold">ТЕКУЩЕЕ ВЫПОЛНЕНИЕ</span>
      <span class="text-2xl font-mono font-bold text-[var(--arc-text-primary)]">{{ Math.round((completionRatio || 0) * 100) }}%</span>
    </div>
    <div class="h-1.5 bg-[var(--arc-plane)] rounded-full overflow-hidden w-full relative">
      <div 
        class="h-full bg-[var(--accent)] transition-[width] duration-500"
        :style="{ width: `${Math.min(Math.max((completionRatio || 0) * 100, 0), 100)}%` }"
      ></div>
    </div>
    <div class="flex justify-between text-xs font-mono text-[var(--arc-text-machine)] uppercase mt-0.5">
      <span>Завершено: {{ completedCount || 0 }}</span>
      <span>Ожидает: {{ activeCount || 0 }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  translations?: any;
  completionRatio?: number;
  completedCount?: number;
  activeCount?: number;
}>(), {
  translations: () => ({}),
  completionRatio: 0,
  completedCount: 0,
  activeCount: 0
});
</script>
