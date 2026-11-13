<template>
  <div class="flex flex-col gap-3 select-none font-sans">
    
    <!-- MODE A: RETROSPECTIVE SUMMARY (When on 'history' tab) -->
    <template v-if="viewMode === 'history'">
      <!-- 1. ИТОГИ ФОКУСА И ТЕМП -->
      <div class="flex flex-col gap-2.5 p-3 rounded-[var(--radius-card,12px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between text-xs font-mono">
          <span class="text-[10px] uppercase tracking-wider text-[var(--arc-text-machine)] font-semibold flex items-center gap-1.5">
            <Timer class="w-3.5 h-3.5 text-[var(--status-warn)]" /> Сводка за неделю
          </span>
          <span class="text-[10px] font-mono text-[var(--status-ok)] font-semibold">Активна</span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs font-mono">
          <div class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2.5">
            <span class="text-[var(--arc-text-machine)] text-[10px]">Всего в фокусе</span>
            <span class="text-[var(--status-warn)] font-bold text-sm">{{ totalSpentMinutes }}м</span>
          </div>
          <div class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2.5">
            <span class="text-[var(--arc-text-machine)] text-[10px]">Закрыто подзадач</span>
            <span class="text-[var(--arc-text-primary)] font-bold text-sm">{{ completedSubtasksTotal }} / {{ allSubtasksTotal }}</span>
          </div>
          <div class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2.5">
            <span class="text-[var(--arc-text-machine)] text-[10px]">Закрыто задач</span>
            <span class="text-[var(--status-ok)] font-bold text-sm">{{ completedCount }} / {{ (tasks || []).length }}</span>
          </div>
          <div class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2.5">
            <span class="text-[var(--arc-text-machine)] text-[10px]">Средний темп</span>
            <span class="text-[var(--arc-text-primary)] font-bold text-sm">{{ averagePaceMinutes }}м / зад.</span>
          </div>
        </div>
      </div>

      <!-- 2. РАСПРЕДЕЛЕНИЕ ПО КАТЕГОРИЯМ -->
      <div class="flex flex-col gap-2 p-3 rounded-[var(--radius-card,12px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <span class="text-[10px] font-mono uppercase tracking-wider text-[var(--arc-text-machine)] font-semibold flex items-center gap-1.5">
          <Activity class="w-3.5 h-3.5 text-[var(--accent)]" /> Вклад по секторам
        </span>
        <div class="flex flex-col gap-2 pt-0.5">
          <div 
            v-for="cat in categoryBreakdown" 
            :key="cat.id"
            class="flex flex-col gap-1 p-2 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-xs font-mono"
          >
            <div class="flex items-center justify-between">
              <span class="text-[var(--arc-text-primary)] font-medium uppercase text-[10px]">{{ cat.name }}</span>
              <span class="text-[10px] text-[var(--arc-text-secondary)]">
                {{ cat.spent }} / {{ cat.estimated }}м · {{ cat.count }} зад.
              </span>
            </div>
            <div class="h-1 w-full bg-[var(--arc-plane)] rounded-full overflow-hidden">
              <div 
                class="h-full bg-[var(--accent)]" 
                :style="{ width: `${Math.max(8, Math.min(100, Math.round((cat.spent / (cat.estimated || 30)) * 100)))}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- MODE B: OPERATIONAL QUEUE SUMMARY (Default for List) -->
    <template v-else>
      <!-- 1. АКТИВНЫЙ СПРИНТ / РЕКОМЕНДУЕМЫЙ ФОКУС -->
      <div 
        v-if="focusCardTask" 
        class="flex flex-col gap-2.5 p-3 rounded-[var(--radius-card,12px)] bg-[var(--arc-plane)] border shadow-sm transition-colors"
        :class="isFocusTaskStarted ? 'border-[var(--arc-hairline-top)]' : 'border-[var(--arc-hairline)]'"
      >
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-mono font-semibold text-[var(--arc-text-machine)] uppercase tracking-wider flex items-center gap-1.5">
            <Timer v-if="isFocusTaskStarted" class="w-3.5 h-3.5 text-[var(--status-warn)]" />
            <Compass v-else class="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{{ isFocusTaskStarted ? 'Активный спринт' : 'Рекомендуемый фокус' }}</span>
          </span>
          <span class="text-[10px] font-mono text-[var(--arc-text-secondary)] font-medium inline-flex items-center gap-1.5">
            <span 
              class="w-1.5 h-1.5 rounded-full" 
              :class="focusCardTask.priority === 'high' ? 'bg-[var(--status-err)]' : focusCardTask.priority === 'medium' ? 'bg-[var(--status-warn)]' : 'bg-[var(--arc-text-muted)]'"
            ></span>
            <span>
              {{ focusCardTask.priority === 'high' ? 'P1' : focusCardTask.priority === 'medium' ? 'P2' : 'P3' }}
              <template v-if="!isFocusTaskStarted"> · {{ focusCardTask.estimatedMinutes || 30 }}м</template>
            </span>
          </span>
        </div>

        <p 
          @click="tasksStore.toggleExpand(focusCardTask.id)"
          class="text-xs font-medium text-[var(--arc-text-primary)] hover:text-[var(--accent)] transition line-clamp-2 leading-relaxed cursor-pointer"
          title="Открыть задачу в инспекторе"
        >
          {{ focusCardTask.text }}
        </p>

        <!-- Active Sprint Progress Bar (15 / 45м) when task is already in progress -->
        <div v-if="isFocusTaskStarted" class="flex flex-col gap-1 pt-0.5">
          <div class="flex items-center justify-between text-[11px] font-mono">
            <span class="text-[var(--status-warn)] font-semibold">
              {{ focusCardTask.spentMinutes || 0 }} / {{ focusCardTask.estimatedMinutes || 30 }}м
            </span>
            <span class="text-[var(--arc-text-machine)]">{{ sprintProgressPercent }}%</span>
          </div>
          <div class="h-1.5 w-full bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-full overflow-hidden">
            <div 
              class="h-full bg-[var(--accent)] transition-[width] duration-300"
              :style="{ width: `${sprintProgressPercent}%` }"
            ></div>
          </div>
        </div>

        <button 
          type="button"
          @click="handleFocusAction(focusCardTask.id)"
          class="w-full mt-0.5 py-1.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] hover:bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] hover:border-[var(--accent)] text-xs font-mono font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
          :title="isFocusTaskRunningNow ? 'Поставить спринт на паузу' : isFocusTaskStarted ? 'Продолжить выполнение задачи' : 'Запустить спринт фокуса'"
        >
          <Pause v-if="isFocusTaskRunningNow" class="w-3 h-3 text-[var(--status-warn)]" />
          <Play v-else class="w-3 h-3 fill-current" :class="isFocusTaskStarted ? 'text-[var(--status-warn)]' : 'text-[var(--accent)]'" />
          <span>{{ isFocusTaskRunningNow ? 'Пауза' : isFocusTaskStarted ? 'Продолжить' : 'Начать спринт' }}</span>
        </button>
      </div>

      <!-- 2. ПЛАНИРОВАНИЕ И СРОКИ -->
      <div class="flex flex-col gap-2 p-3 rounded-[var(--radius-card,12px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
        <div class="flex items-center justify-between text-xs font-mono">
          <span class="text-[10px] uppercase tracking-wider text-[var(--arc-text-machine)] font-semibold flex items-center gap-1.5">
            <Calendar class="w-3.5 h-3.5 text-[var(--accent)]" /> Контроль сроков
          </span>
          <span 
            class="w-2 h-2 rounded-full" 
            :class="overdueCount > 0 ? 'bg-[var(--status-err)]' : 'bg-[var(--status-ok)]'"
            :title="overdueCount > 0 ? 'Есть просроченные задачи' : 'Все задачи в графике'"
          ></span>
        </div>

        <div class="flex flex-col gap-1.5 text-xs font-mono">
          <button 
            v-if="overdueCount > 0"
            type="button"
            @click="tasksStore.activeFilter = 'overdue'" 
            class="flex items-center justify-between py-1.5 px-2.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] cursor-pointer transition text-left"
          >
            <span class="flex items-center gap-2 text-[var(--status-err)] font-medium">
              <AlertTriangle class="w-3 h-3 shrink-0" />
              <span>Просрочено</span>
            </span>
            <span class="text-[var(--status-err)] font-bold">{{ overdueCount }} →</span>
          </button>

          <button 
            type="button"
            @click="tasksStore.activeFilter = 'my_day'"
            class="flex items-center justify-between py-1.5 px-2.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] cursor-pointer transition text-left"
          >
            <span class="text-[var(--arc-text-secondary)]">План на сегодня</span>
            <span class="text-[var(--arc-text-primary)] font-semibold">
              {{ todayTasks.length }}
            </span>
          </button>

          <button 
            type="button"
            @click="tasksStore.activeFilter = 'no_due'"
            class="flex items-center justify-between py-1.5 px-2.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] cursor-pointer transition text-left"
          >
            <span class="text-[var(--arc-text-secondary)]">Без срока</span>
            <span class="text-[var(--arc-text-secondary)] font-medium">
              {{ noDueDateCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- 3. ОБЪЕМ ОЧЕРЕДИ -->
      <div class="flex flex-col gap-2 p-3 rounded-[var(--radius-card,12px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between text-xs font-mono">
          <span class="text-[10px] uppercase tracking-wider text-[var(--arc-text-machine)] font-semibold flex items-center gap-1.5">
            <Activity class="w-3.5 h-3.5 text-[var(--accent)]" /> Оценка нагрузки
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs font-mono">
          <div class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2">
            <span class="text-[var(--arc-text-machine)] text-[10px]">Активно в пуле</span>
            <span class="text-[var(--arc-text-primary)] font-semibold text-sm">{{ activeCount }}</span>
          </div>
          <div class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2">
            <span class="text-[var(--arc-text-machine)] text-[10px]">План времени</span>
            <span class="text-[var(--arc-text-primary)] font-semibold text-sm truncate">{{ formattedTotalEstimate }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 4. ЦЕЛИ (System Objectives in lower sidebar) -->
    <div 
      v-if="displayObjectives.length > 0"
      class="flex flex-col gap-2 p-3 rounded-[var(--radius-card,12px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]"
    >
      <div class="flex items-center justify-between text-xs font-mono">
        <span class="text-[10px] uppercase tracking-wider text-[var(--arc-text-machine)] font-semibold flex items-center gap-1.5">
          <Target class="w-3.5 h-3.5 text-[var(--accent)]" /> Цели
        </span>
        <button
          v-if="activeFilter.startsWith('obj_')"
          type="button"
          @click="tasksStore.activeFilter = 'all'"
          class="text-[10px] font-mono text-[var(--accent)] hover:underline cursor-pointer"
        >
          Сбросить
        </button>
      </div>

      <div class="flex flex-col gap-1.5">
        <button
          v-for="obj in displayObjectives"
          :key="obj.id"
          type="button"
          @click="toggleObjectiveFilter(obj.id)"
          class="flex items-start justify-between gap-2 py-2 px-2.5 rounded-[var(--radius-control,8px)] border transition cursor-pointer text-left"
          :class="activeFilter === `obj_${obj.id}`
            ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]'
            : 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'"
          :title="obj.description || obj.title"
        >
          <span class="text-xs font-sans leading-snug break-words flex-1">
            {{ obj.title }}
          </span>
          <span 
            class="text-[10px] font-mono px-1.5 py-0.5 rounded-[var(--radius-pill,999px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] shrink-0 mt-0.5"
            :class="filterCount(`obj_${obj.id}`) > 0 ? 'text-[var(--arc-text-primary)] font-semibold' : 'text-[var(--arc-text-machine)]'"
          >
            {{ filterCount(`obj_${obj.id}`) }}
          </span>
        </button>
      </div>
    </div>

    <!-- 5. ЭКСПОРТ ОЧЕРЕДИ -->
    <div class="grid grid-cols-2 gap-2 pt-0.5">
      <button 
        type="button"
        @click="exportTasks"
        class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control,8px)] text-xs font-mono font-medium border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer"
        title="Экспорт задач в JSON"
      >
        <FileText class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" />
        <span>JSON</span>
      </button>

      <button 
        type="button"
        @click="exportTasksCSV"
        class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control,8px)] text-xs font-mono font-medium border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer"
        title="Экспорт задач в CSV"
      >
        <FileSpreadsheet class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" />
        <span>CSV</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';
import { Activity, Compass, Timer, Play, Pause, Calendar, AlertTriangle, FileText, FileSpreadsheet, Target } from 'lucide-vue-next';

const emit = defineEmits<{ (e: 'startFocusSprint', taskId: string): void }>();

const tasksStore = useTasksStore();
const {
  tasks, objectives, viewMode, recommendedTask, activeFocusTaskId, activeFocusTask,
  isSprintRunning, activeFilter, activeCount, completedCount, totalSpentMinutes, noDueDateCount
} = storeToRefs(tasksStore);

const { getOverdueCount, startFocusSprint, toggleSprintTimer, filterCount, getCategoryName, exportTasks, exportTasksCSV } = tasksStore;

const overdueCount = computed(() => getOverdueCount());
const allSubtasksTotal = computed(() => (tasks.value || []).reduce((acc, t) => acc + (t.subtasks?.length || 0), 0));
const completedSubtasksTotal = computed(() => (tasks.value || []).reduce((acc, t) => acc + (t.subtasks || []).filter(s => s.completed).length, 0));

const averagePaceMinutes = computed(() => {
  const workedTasks = (tasks.value || []).filter(t => (t.spentMinutes || 0) > 0 || t.completed);
  return workedTasks.length === 0 ? 0 : Math.round((totalSpentMinutes.value || 0) / workedTasks.length);
});

const categoryBreakdown = computed(() => {
  const map: Record<string, { id: string; name: string; count: number; spent: number; estimated: number }> = {};
  (tasks.value || []).forEach(t => {
    const cid = t.category || 'general';
    if (!map[cid]) map[cid] = { id: cid, name: getCategoryName(cid), count: 0, spent: 0, estimated: 0 };
    map[cid].count++;
    map[cid].spent += (t.spentMinutes || 0);
    map[cid].estimated += (t.estimatedMinutes || 30);
  });
  return Object.values(map).sort((a, b) => b.spent - a.spent);
});

const focusCardTask = computed(() => {
  if (activeFocusTask.value && !activeFocusTask.value.completed) return activeFocusTask.value;
  const inProgress = (tasks.value || []).find(t => !t.completed && (t.status === 'in_progress' || (t.spentMinutes || 0) > 0));
  return inProgress || recommendedTask.value;
});

const isFocusTaskStarted = computed(() => {
  const t = focusCardTask.value;
  return Boolean(t && !t.completed && (t.status === 'in_progress' || (t.spentMinutes || 0) > 0 || activeFocusTaskId.value === t.id));
});

const isFocusTaskRunningNow = computed(() => {
  const t = focusCardTask.value;
  return Boolean(t && activeFocusTaskId.value === t.id && isSprintRunning.value);
});

const sprintProgressPercent = computed(() => {
  const t = focusCardTask.value;
  if (!t) return 0;
  return Math.min(100, Math.round(((t.spentMinutes || 0) / (t.estimatedMinutes || 30)) * 100));
});

const handleFocusAction = (taskId: string) => {
  if (isFocusTaskRunningNow.value) toggleSprintTimer();
  else {
    emit('startFocusSprint', taskId);
    startFocusSprint(taskId);
  }
};

const fallbackObjectives = [
  { id: 'obj-core-01', title: 'Автономная стабилизация ядра A.R.C.', description: 'Калибровка фоновых циклов когерентности и оптимизация рендеринга.' },
  { id: 'obj-core-02', title: 'Атомарный отказоустойчивый контур (Rollback Engine)', description: 'Целостность файловых транзакций и откат изменений.' }
];

const displayObjectives = computed(() => (objectives.value && objectives.value.length > 0 ? objectives.value : fallbackObjectives));

const toggleObjectiveFilter = (objId: string) => {
  const target = `obj_${objId}`;
  tasksStore.activeFilter = tasksStore.activeFilter === target ? 'all' : target;
  if (viewMode.value === 'history') tasksStore.viewMode = 'list';
};

const todayTasks = computed(() => {
  const todayStr = new Date().toISOString().split('T')[0];
  return (tasks.value || []).filter(t => !t.completed && (t.isMyDay || t.dueDate === todayStr));
});

const totalEstimateMinutes = computed(() => (tasks.value || []).filter(t => !t.completed).reduce((acc, t) => acc + (t.estimatedMinutes || 30), 0));

const formattedTotalEstimate = computed(() => {
  const mins = totalEstimateMinutes.value;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h > 0 ? h + 'ч ' : ''}${m}м`;
});
</script>
