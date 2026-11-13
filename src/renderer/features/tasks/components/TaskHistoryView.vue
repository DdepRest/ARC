<template>
  <div class="flex flex-col gap-4 select-none font-sans">
    <!-- Top Retrospective Summary & 7-Day Activity Bar Chart -->
    <div class="flex flex-col gap-3.5 p-4 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)]">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <History class="w-4 h-4 text-[var(--accent)]" />
          <h2 class="text-sm font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-primary)]">
            Ретроспектива и журнал активности
          </h2>
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-secondary)]">
          Событий в журнале: <strong class="text-[var(--arc-text-primary)]">{{ totalEventsCount }}</strong>
        </span>
      </div>

      <!-- 7-Day Activity Chart -->
      <div class="grid grid-cols-7 gap-2 pt-2 border-t border-[var(--arc-divider)]">
        <div 
          v-for="day in weekActivityBars" 
          :key="day.dateStr"
          class="flex flex-col items-center gap-1.5 p-2 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]"
          :class="{ 'border-[var(--arc-hairline-top)] bg-[var(--arc-selected)]': day.isToday }"
        >
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase">{{ day.dayShort }}</span>
          <div class="w-full h-14 flex items-end justify-center px-1">
            <div 
              class="w-full max-w-[20px] rounded-t-[4px] transition-all duration-300"
              :class="day.minutes > 0 || day.events > 0 ? 'bg-[var(--accent)]' : 'bg-[var(--arc-divider)]'"
              :style="{ height: `${Math.max(12, day.heightPercent)}%` }"
              :title="`${day.label}: ${day.minutes}м в фокусе, событий: ${day.events}`"
            ></div>
          </div>
          <span class="text-[10px] font-mono font-semibold" :class="day.minutes > 0 ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)]'">
            {{ day.minutes > 0 ? `${day.minutes}м` : day.events > 0 ? `${day.events} д.` : '0м' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Chronological Activity Timeline (Sprints + Completed Subtasks + Completed Tasks) -->
    <div v-if="historyGroups.length > 0" class="flex flex-col gap-5 pb-2">
      <div v-for="group in historyGroups" :key="group.date" class="flex flex-col gap-2.5">
        <!-- Date Group Header -->
        <div class="flex items-center gap-3 sticky top-0 z-10 bg-[var(--arc-plane)] py-1.5">
          <div class="w-2 h-2 rounded-full bg-[var(--accent)]"></div>
          <span class="text-xs font-mono font-bold uppercase tracking-wider text-[var(--arc-text-primary)]">{{ group.label }}</span>
          <div class="h-px flex-1 bg-[var(--arc-divider)]"></div>
          <span class="text-xs font-mono text-[var(--arc-text-secondary)]">
            Событий: {{ group.events.length }} · В фокусе: {{ formatMinutes(group.totalMinutes) }}
          </span>
        </div>
        
        <!-- Events for the Day -->
        <div class="flex flex-col gap-2 pl-4 border-l border-[var(--arc-divider)] ml-1">
          <div 
            v-for="ev in group.events" 
            :key="ev.id" 
            @click="tasksStore.toggleExpand(ev.taskId)"
            class="p-3 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] hover:bg-[var(--arc-hover)] transition cursor-pointer flex flex-col gap-1.5 relative overflow-hidden"
            :class="{ 'bg-[var(--arc-selected)] border-[var(--arc-hairline-top)]': tasksStore.expandedTaskId === ev.taskId }"
          >
            <!-- Left Event Type Accent Stripe -->
            <div 
              class="absolute left-0 top-0 bottom-0 w-[3px]"
              :class="ev.type === 'task_done' ? 'bg-[var(--status-ok)]' : ev.type === 'sprint' ? 'bg-[var(--status-warn)]' : 'bg-[var(--accent)]'"
            ></div>

            <div class="flex items-start justify-between gap-3 pl-1">
              <div class="flex items-start gap-2.5 min-w-0 flex-1">
                <div class="pt-0.5 shrink-0">
                  <CheckCircle2 v-if="ev.type === 'task_done'" class="w-4 h-4 text-[var(--status-ok)]" />
                  <Timer v-else-if="ev.type === 'sprint'" class="w-4 h-4 text-[var(--status-warn)]" />
                  <CheckSquare v-else class="w-4 h-4 text-[var(--accent)]" />
                </div>

                <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span 
                      class="text-[10px] font-mono px-1.5 py-0.2 rounded-[4px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] font-semibold uppercase"
                      :class="ev.type === 'task_done' ? 'text-[var(--status-ok)]' : ev.type === 'sprint' ? 'text-[var(--status-warn)]' : 'text-[var(--accent)]'"
                    >
                      {{ ev.badge }}
                    </span>
                    <span class="text-xs font-sans font-medium text-[var(--arc-text-primary)] leading-snug">
                      {{ ev.title }}
                    </span>
                  </div>

                  <p v-if="ev.subtitle" class="text-xs font-sans text-[var(--arc-text-secondary)] truncate">
                    {{ ev.subtitle }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="ev.type === 'sprint' && !ev.isTaskCompleted"
                  type="button"
                  @click.stop="tasksStore.startFocusSprint(ev.taskId)"
                  class="px-2 py-1 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] text-[10px] font-mono text-[var(--arc-text-primary)] flex items-center gap-1 transition cursor-pointer"
                  title="Продолжить спринт по этой задаче"
                >
                  <Play class="w-2.5 h-2.5 text-[var(--status-warn)] fill-current" />
                  <span>Продолжить</span>
                </button>
                <span class="text-[11px] font-mono px-2 py-0.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-machine)] whitespace-nowrap">
                  {{ formatTime(ev.timestamp) }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 pl-7 text-[11px] font-mono text-[var(--arc-text-machine)]">
              <span class="uppercase">{{ getCategoryName(ev.category) }}</span>
              <template v-if="ev.minutes > 0">
                <span>·</span>
                <span class="text-[var(--status-warn)] font-medium">В фокусе: {{ ev.minutes }}м / {{ ev.estimatedMinutes || 30 }}м</span>
              </template>
              <template v-if="ev.subtasksProgress">
                <span>·</span>
                <span>Шаги: {{ ev.subtasksProgress }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="flex flex-col items-center justify-center py-12 gap-3 text-center opacity-60 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)]">
      <History class="w-10 h-10 text-[var(--arc-text-muted)]" />
      <span class="text-sm font-mono text-[var(--arc-text-secondary)]">Журнал активности пуст</span>
      <span class="text-xs text-[var(--arc-text-machine)] max-w-xs">Запущенные спринты фокуса, выполненные шаги и закрытые задачи автоматически отобразятся здесь.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { History, Timer, CheckCircle2, CheckSquare, Play } from 'lucide-vue-next';
import { Task, SelectOption } from '../types';
import { useTasksStore } from '../stores/tasks.store';

const tasksStore = useTasksStore();

const props = defineProps<{
  tasks: Task[];
  categoryOptions: SelectOption[];
}>();

interface TimelineEventItem {
  id: string;
  taskId: string;
  type: 'sprint' | 'subtask' | 'task_done';
  badge: string;
  title: string;
  subtitle?: string;
  timestamp: number;
  category: string;
  minutes: number;
  estimatedMinutes?: number;
  subtasksProgress?: string;
  isTaskCompleted: boolean;
}

const getCategoryName = (catId: string) => {
  const cat = props.categoryOptions.find(c => c.value === catId);
  return cat ? cat.label : tasksStore.getCategoryName(catId);
};

const formatTime = (ts: any) => {
  if (!ts) return '';
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (!d || isNaN(d.getTime()) || typeof d.toLocaleTimeString !== 'function') return '';
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
};

// Build unified timeline events from completed tasks, logged focus sprints (spentMinutes > 0), and completed subtasks
const allEvents = computed<TimelineEventItem[]>(() => {
  const events: TimelineEventItem[] = [];
  const now = Date.now();

  (props.tasks || []).forEach((task) => {
    const doneSubs = (task.subtasks || []).filter(s => s.completed);
    const subProg = task.subtasks?.length ? `${doneSubs.length}/${task.subtasks.length}` : undefined;

    // 1. Completed root task event
    if (task.completed || task.status === 'done') {
      events.push({
        id: `done-${task.id}`,
        taskId: task.id,
        type: 'task_done',
        badge: 'Задача закрыта',
        title: task.text,
        subtitle: task.description || undefined,
        timestamp: task.completedAt || task.createdAt || now,
        category: task.category,
        minutes: task.spentMinutes || 0,
        estimatedMinutes: task.estimatedMinutes,
        subtasksProgress: subProg,
        isTaskCompleted: true
      });
    }

    // 2. Focus Sprint session event (for tasks with spentMinutes > 0 that aren't already counted as completed root tasks, or shown as a distinct sprint log)
    if ((task.spentMinutes || 0) > 0 && !task.completed) {
      events.push({
        id: `sprint-${task.id}`,
        taskId: task.id,
        type: 'sprint',
        badge: `Спринт · ${task.spentMinutes} мин`,
        title: `Фокус-сессия по задаче «${task.text}»`,
        subtitle: `Наработано ${task.spentMinutes} мин из запланированных ${task.estimatedMinutes || 30} мин`,
        timestamp: now - 1000 * 60 * 15, // Recent today session
        category: task.category,
        minutes: task.spentMinutes || 0,
        estimatedMinutes: task.estimatedMinutes,
        subtasksProgress: subProg,
        isTaskCompleted: false
      });
    }

    // 3. Completed subtasks events
    doneSubs.forEach((sub, idx) => {
      events.push({
        id: `sub-${task.id}-${sub.id}`,
        taskId: task.id,
        type: 'subtask',
        badge: 'Шаг выполнен',
        title: sub.text,
        subtitle: `В рамках задачи: ${task.text}`,
        timestamp: (task.completedAt || now) - (idx + 1) * 1000 * 60 * 25,
        category: task.category,
        minutes: 0,
        estimatedMinutes: task.estimatedMinutes,
        subtasksProgress: subProg,
        isTaskCompleted: !!task.completed
      });
    });
  });

  return events.sort((a, b) => b.timestamp - a.timestamp);
});

const totalEventsCount = computed(() => allEvents.value.length);

const historyGroups = computed(() => {
  const groups: Record<string, { date: string; label: string; events: TimelineEventItem[]; totalMinutes: number }> = {};
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  allEvents.value.forEach((ev) => {
    let d = new Date(ev.timestamp);
    if (isNaN(d.getTime())) d = new Date();
    const dateStr = d.toISOString().split('T')[0];

    if (!groups[dateStr]) {
      let label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      if (dateStr === todayStr) label = 'Сегодня';
      else if (dateStr === yesterday) label = 'Вчера';

      groups[dateStr] = {
        date: dateStr,
        label,
        events: [],
        totalMinutes: 0
      };
    }

    groups[dateStr].events.push(ev);
    groups[dateStr].totalMinutes += ev.minutes;
  });

  return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
});

const weekActivityBars = computed(() => {
  const days: Array<{ dateStr: string; dayShort: string; label: string; minutes: number; events: number; heightPercent: number; isToday: boolean }> = [];
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const group = historyGroups.value.find(g => g.date === dateStr);
    const minutes = group ? group.totalMinutes : 0;
    const evCount = group ? group.events.length : 0;
    days.push({
      dateStr,
      dayShort: dayNames[d.getDay()],
      label: dateStr === todayStr ? 'Сегодня' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      minutes,
      events: evCount,
      heightPercent: 0,
      isToday: dateStr === todayStr
    });
  }

  const maxScore = Math.max(30, ...days.map(d => d.minutes + d.events * 10));
  return days.map(d => ({
    ...d,
    heightPercent: d.minutes === 0 && d.events === 0 ? 12 : Math.min(100, Math.round(((d.minutes + d.events * 10) / maxScore) * 100))
  }));
});
</script>
