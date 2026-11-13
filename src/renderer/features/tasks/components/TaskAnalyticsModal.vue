<template>
  <ArcModal
    :show="show"
    title="Аналитика и статистика задач"
    subtitle="Полная телеметрия нагрузки, распределения по секторам и затраченного времени"
    maxWidth="max-w-2xl"
    @close="$emit('close')"
  >
    <div class="flex flex-col gap-6 select-none font-sans text-[var(--arc-text-primary)]">
      <!-- Progress Cap Meter -->
      <ProgressCapMeter
        :translations="translations"
        :completionRatio="completionRatio"
        :completedCount="completedCount"
        :activeCount="activeCount"
      />

      <!-- Day Load & Time Metrics -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Day Load Indicator -->
        <div class="flex flex-col gap-2 p-3.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-xl">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold">Загрузка дня</span>
          <div class="flex items-center gap-2">
            <span class="text-sm font-mono text-[var(--arc-text-primary)] font-bold" v-if="todayTasks.length > 0">
              На сегодня: {{ Math.floor(todayTotalMinutes / 60) }}ч {{ todayTotalMinutes % 60 }}м
            </span>
            <span class="text-sm font-mono text-[var(--arc-text-muted)]" v-else>
              На сегодня задач нет
            </span>
            <span 
              v-if="todayTasks.length > 0"
              class="text-xs font-mono px-2 py-0.5 rounded border font-semibold ml-auto"
              :class="dayLoadRating.color"
            >
              {{ dayLoadRating.label }}
            </span>
          </div>
          <div class="text-xs font-mono text-[var(--arc-text-secondary)] mt-1">
            Оценка всех задач: {{ Math.floor(totalEstimatedMinutes / 60) }}ч {{ totalEstimatedMinutes % 60 }}м
          </div>
        </div>

        <!-- Time & Effort Metrics -->
        <div class="flex flex-col gap-2.5 p-3.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-xl">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold">Затраты времени (Фокус)</span>
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-[var(--arc-frame)] rounded-lg p-2 flex flex-col items-center justify-center text-center border border-[var(--arc-hairline)]">
              <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase">Затрачено</span>
              <span class="text-base font-mono font-bold text-[var(--arc-text-primary)]">{{ Math.floor(totalSpentMinutes / 60) }}ч {{ totalSpentMinutes % 60 }}м</span>
            </div>
            <div class="bg-[var(--arc-frame)] rounded-lg p-2 flex flex-col items-center justify-center text-center border border-[var(--arc-hairline)]">
              <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase">Оценка</span>
              <span class="text-base font-mono font-bold text-[var(--arc-text-secondary)]">{{ Math.floor(totalEstimatedMinutes / 60) }}ч {{ totalEstimatedMinutes % 60 }}м</span>
            </div>
          </div>
          <div class="h-1 bg-[var(--arc-frame)] rounded-full overflow-hidden w-full mt-1 border border-[var(--arc-hairline)]">
            <div 
              class="h-full bg-[var(--accent)] transition-[width] duration-500"
              :style="{ width: `${Math.min((totalSpentMinutes / (totalEstimatedMinutes || 1)) * 100, 100)}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Priority Distribution Bars -->
      <PriorityDistributionBars
        :translations="translations"
        :getPriorityCount="getPriorityCount"
        :getPriorityRatio="getPriorityRatio"
        :tasksCount="(tasks || []).length"
      />

      <!-- Category Distribution -->
      <CategoryDistribution
        :translations="translations"
        :categories="categories"
        :getCategoryStyles="getCategoryStyles"
        :getCategoryCount="getCategoryCount"
      />

      <!-- Deadlines Widget -->
      <DeadlinesWidget
        :overdueCount="getOverdueCount()"
        :dueTodayCount="getDueTodayCount()"
      />

      <!-- Export & Reset Actions -->
      <div class="flex flex-col gap-2.5 pt-2 border-t border-[var(--arc-hairline)]">
        <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold">{{ translations?.systemActions || "Экспорт и управление" }}</span>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <ArcButton
            variant="secondary"
            size="sm"
            @click="exportTasks"
            class="w-full justify-center"
          >
            <template #icon>
              <FileText class="w-3.5 h-3.5 text-[var(--arc-text-secondary)]" />
            </template>
            Экспорт JSON
          </ArcButton>

          <ArcButton
            variant="secondary"
            size="sm"
            @click="exportTasksCSV"
            class="w-full justify-center"
          >
            <template #icon>
              <FileSpreadsheet class="w-3.5 h-3.5 text-[var(--status-ok)]" />
            </template>
            Экспорт CSV
          </ArcButton>

          <ArcButton
            variant="danger"
            size="sm"
            @click="triggerReset"
            class="w-full justify-center col-span-2 sm:col-span-1"
          >
            <template #icon>
              <RefreshCw class="w-3.5 h-3.5" />
            </template>
            Сброс данных
          </ArcButton>
        </div>
      </div>
    </div>
  </ArcModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';
import { RefreshCw, FileText, FileSpreadsheet } from 'lucide-vue-next';

import ArcModal from '../../../components/ui/ArcModal.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';
import ProgressCapMeter from './ProgressCapMeter.vue';
import PriorityDistributionBars from './PriorityDistributionBars.vue';
import CategoryDistribution from './CategoryDistribution.vue';
import DeadlinesWidget from './DeadlinesWidget.vue';

defineProps<{
  show: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const tasksStore = useTasksStore();
const {
  tasks,
  completedCount,
  activeCount,
  completionRatio,
  totalEstimatedMinutes,
  totalSpentMinutes,
  translations,
  categories,
} = storeToRefs(tasksStore);

const {
  getPriorityCount,
  getPriorityRatio,
  getCategoryStyles,
  getCategoryCount,
  getOverdueCount,
  getDueTodayCount,
  exportTasks,
  exportTasksCSV,
  triggerReset
} = tasksStore;

const todayTasks = computed(() => {
  const todayStr = new Date().toISOString().split('T')[0];
  return (tasks.value || []).filter(t => !t.completed && (t.isMyDay || t.dueDate === todayStr));
});

const todayTotalMinutes = computed(() => {
  return todayTasks.value.reduce((acc, t) => acc + (t.estimatedMinutes || 30), 0);
});

const dayLoadRating = computed(() => {
  const mins = todayTotalMinutes.value;
  if (mins === 0) return { label: 'Нулевая', color: 'text-[var(--arc-text-muted)] bg-[var(--arc-frame)] border-[var(--arc-hairline)]' };
  if (mins <= 60) return { label: 'Низкая', color: 'text-[var(--status-ok)] bg-[var(--arc-frame)] border-[var(--status-ok)]/40' };
  if (mins <= 180) return { label: 'Оптимальная', color: 'text-[var(--status-warn)] bg-[var(--arc-frame)] border-[var(--status-warn)]/40' };
  return { label: 'Высокая (Перегрузка)', color: 'text-[var(--status-err)] bg-[var(--arc-frame)] border-[var(--status-err)]/40' };
});
</script>
