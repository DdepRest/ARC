<template>
  <div class="flex flex-col gap-2.5 border-b border-[var(--arc-hairline)] pb-4">
    <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest">{{ translations?.sectorDistribution || 'РАСПРЕДЕЛЕНИЕ ПО КАТЕГОРИЯМ' }}</span>
    <div class="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
      <div v-for="cat in (categories || [])" :key="cat.id" class="flex items-center justify-between text-xs font-mono uppercase">
        <span :class="typeof getCategoryStyles === 'function' ? getCategoryStyles(cat.id) : ''" class="px-1.5 py-0.5 rounded font-bold text-[var(--arc-text-secondary)]">
          {{ cat.name }}
        </span>
        <span class="text-[var(--arc-text-primary)] font-bold">
          {{ formatTaskPlural(typeof getCategoryCount === 'function' ? getCategoryCount(cat.id) : 0) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskCategory } from '../types';

withDefaults(defineProps<{
  translations?: any;
  categories?: TaskCategory[];
  getCategoryStyles?: (catId: string) => string;
  getCategoryCount?: (catId: string) => number;
}>(), {
  translations: () => ({}),
  categories: () => [],
  getCategoryStyles: () => '',
  getCategoryCount: () => 0
});

const formatTaskPlural = (count: number) => {
  if (count === 1) return '1 Узел';
  if (count >= 2 && count <= 4) return `${count} Узла`;
  return `${count} Узлов`;
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--arc-hairline);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--arc-border);
}
</style>
