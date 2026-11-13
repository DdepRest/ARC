<template>
  <div class="flex flex-col gap-6 h-full">
    <!-- Next Action / Focus -->
    <div class="glass-panel p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse"></div>
        <span class="text-label text-[var(--color-accent)] uppercase">Next Action</span>
      </div>
      <div v-if="recommendedTask" class="flex flex-col gap-2">
        <span class="text-title text-white leading-snug">{{ recommendedTask.text }}</span>
        <div class="flex items-center gap-2 mt-2">
          <button @click="$emit('startFocus', recommendedTask.id)" class="glass-btn px-3 py-1.5 text-xs text-[var(--color-accent)]">Начать Спринт</button>
        </div>
      </div>
      <div v-else class="text-body text-white/50">
        Нет приоритетных задач для фокусировки.
      </div>
    </div>

    <!-- System Insight / Problem Detection -->
    <div class="glass-panel p-4 flex flex-col gap-3 flex-1 min-h-[200px]">
      <div class="flex items-center gap-2 mb-1">
        <Sparkles class="w-4 h-4 text-emerald-400" />
        <span class="text-label text-emerald-400 uppercase">System Insight</span>
      </div>
      <div class="flex flex-col gap-3">
        <p class="text-body text-white/80 leading-relaxed text-sm">
          Анализ текущего бэклога завершен.
        </p>
        <ul class="flex flex-col gap-2 mt-2">
          <li v-for="(insight, idx) in systemInsights" :key="idx" class="flex items-start gap-2">
            <component :is="insight.icon" class="w-3.5 h-3.5 shrink-0 mt-0.5" :class="insight.colorClass" />
            <span class="text-sm text-white/70">{{ insight.text }}</span>
          </li>
          
          <li v-if="systemInsights.length === 0" class="flex items-start gap-2">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span class="text-sm text-white/70">Баланс распределения задач оптимален. Проблем не обнаружено.</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Telemetry Summary -->
    <div class="glass-panel p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-label uppercase">Telemetry</span>
        <button @click="$emit('openAnalytics')" class="text-xs text-white/40 hover:text-white transition-colors cursor-pointer">Детали</button>
      </div>
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center">
          <span class="text-sm text-white/60">Completion Rate</span>
          <span class="text-sm font-mono text-white">{{ completionRatio }}%</span>
        </div>
        <div class="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
          <div class="h-full bg-emerald-500" :style="{ width: completionRatio + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Sparkles, AlertCircle, CheckCircle2, Info } from 'lucide-vue-next';
import { useTasksStore } from '../stores/tasks.store';

const props = defineProps<{
  recommendedTask: any;
  completionRatio: number;
}>();

defineEmits<{
  (e: 'startFocus', taskId: string): void;
  (e: 'openAnalytics'): void;
}>();

const tasksStore = useTasksStore();

const systemInsights = computed(() => {
  const insights = [];
  
  if (tasksStore.noDueDateCount > 3) {
    insights.push({
      text: `${tasksStore.noDueDateCount} задач не имеют срока выполнения. Риск потери фокуса.`,
      icon: AlertCircle,
      colorClass: 'text-amber-400'
    });
  }
  
  const overdue = tasksStore.getOverdueCount;
  if (overdue > 0) {
    insights.push({
      text: `Обнаружено ${overdue} просроченных задач. Требуется ревизия расписания.`,
      icon: AlertCircle,
      colorClass: 'text-[var(--color-danger)]'
    });
  }
  
  if (tasksStore.largeNoPlanCount > 0) {
    insights.push({
      text: `Задач без подзадач, но с большой оценкой: ${tasksStore.largeNoPlanCount}. Рекомендуется декомпозиция.`,
      icon: Info,
      colorClass: 'text-blue-400'
    });
  }
  
  return insights;
});
</script>
