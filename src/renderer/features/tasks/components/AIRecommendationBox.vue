<template>
  <div class="flex flex-col gap-2 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-xl p-3">
    <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-machine)] font-bold uppercase tracking-wider">
      <div class="flex items-center gap-1.5">
        <Compass class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>РЕКОМЕНДАЦИЯ A.R.C.</span>
      </div>
      <span class="text-xs text-[var(--arc-text-machine)] font-normal">СЛЕДУЮЩИЙ ШАГ</span>
    </div>
    <div class="text-xs font-semibold text-[var(--arc-text-primary)] line-clamp-2">
      {{ recommendedTask.text }}
    </div>
    <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-muted)] pt-1">
      <span class="text-[var(--arc-text-primary)] font-bold uppercase">
        {{ recommendedTask.priority === 'high' ? 'P1 Высокий' : recommendedTask.priority === 'medium' ? 'P2 Средний' : 'P3 Низкий' }}
        · {{ recommendedTask.estimatedMinutes || 30 }} мин
      </span>
      <button 
        @click="$emit('startFocusSprint', recommendedTask.id)"
        class="px-2 py-0.5 rounded bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        aria-label="Запустить спринт фокуса для задачи"
      >
        <Timer class="w-3 h-3 text-[var(--accent)]" />
        ФОКУС
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Compass, Timer } from 'lucide-vue-next';
import type { Task } from '../types';

defineProps<{
  recommendedTask: Task;
}>();

defineEmits(['startFocusSprint']);
</script>
