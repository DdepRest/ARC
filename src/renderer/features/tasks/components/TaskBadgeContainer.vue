<template>
  <div class="flex items-center gap-2 flex-wrap text-xs font-mono">
    <!-- Status Badge (Shown ONLY for special non-default states: Blocked, Deferred, Review) -->
    <span 
      v-if="shouldShowStatusBadge"
      class="text-[10px] font-mono px-2 py-0.5 rounded-[var(--radius-pill,999px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] font-medium flex items-center gap-1 shrink-0"
      :class="statusTextClass"
    >
      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="statusDotClass"></span>
      <span>{{ statusLabel }}</span>
    </span>

    <!-- Clean Unboxed Metadata: Category · Time Tracking · Recurrence · Objective -->
    <span class="text-[11px] font-mono text-[var(--arc-text-secondary)] flex items-center gap-1.5 flex-wrap">
      <span :title="`Категория: ${categoryName}`" class="text-[var(--arc-text-machine)] uppercase tracking-wider">{{ categoryName }}</span>

      <template v-if="task.spentMinutes || task.estimatedMinutes">
        <span class="text-[var(--arc-Muted,var(--arc-text-muted))]">·</span>
        <span 
          v-if="task.spentMinutes && task.estimatedMinutes" 
          :class="task.spentMinutes > task.estimatedMinutes ? 'text-[var(--status-err)] font-semibold' : 'text-[var(--status-warn)] font-medium'"
          :title="`Затрачено / Оценка: ${task.spentMinutes}м из ${task.estimatedMinutes}м`"
        >
          {{ task.spentMinutes }} / {{ task.estimatedMinutes }}м
        </span>
        <span v-else-if="task.spentMinutes" class="text-[var(--status-warn)] font-medium">
          {{ task.spentMinutes }}м
        </span>
        <span v-else-if="task.estimatedMinutes" class="text-[var(--arc-text-hint)]" :title="`Оценка: ${task.estimatedMinutes}м`">
          {{ task.estimatedMinutes }}м
        </span>
      </template>

      <template v-if="task.recurrence && task.recurrence.type !== 'none'">
        <span class="text-[var(--arc-text-muted)]">·</span>
        <span class="inline-flex items-center gap-1 text-[var(--arc-text-hint)]" title="Повторяемость">
          <Repeat class="w-2.5 h-2.5" />
          {{ recurrenceBadgeLabel }}
        </span>
      </template>

      <template v-if="task.attachments && task.attachments.length > 0">
        <span class="text-[var(--arc-text-muted)]">·</span>
        <span class="inline-flex items-center gap-1 text-[var(--arc-text-hint)]" :title="`Вложения (${task.attachments.length})`">
          <Paperclip class="w-2.5 h-2.5" />
          {{ task.attachments.length }}
        </span>
      </template>

      <template v-if="task.objectiveId && objectiveName">
        <span class="text-[var(--arc-text-muted)]">·</span>
        <span class="inline-flex items-center gap-1 text-[var(--arc-text-secondary)]" :title="`Цель: ${objectiveName}`">
          <Target class="w-2.5 h-2.5 text-[var(--accent)]" />
          <span class="truncate max-w-[160px]">{{ objectiveName }}</span>
        </span>
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { Task } from '../types';
import { Repeat, Paperclip, Target } from 'lucide-vue-next';

const props = defineProps<{
  task: Task;
}>();

const tasksStore = useTasksStore();

const objectiveName = computed(() => {
  if (!props.task.objectiveId) return null;
  const obj = tasksStore.objectives.find((o: any) => o.id === props.task.objectiveId);
  return obj ? obj.title : null;
});

const shouldShowStatusBadge = computed(() => {
  if (props.task.completed) return false;
  return (
    props.task.status === 'in_progress' ||
    props.task.status === 'blocked' ||
    props.task.status === 'deferred' ||
    props.task.status === 'review'
  );
});

const statusLabel = computed(() => {
  switch (props.task.status) {
    case 'in_progress': return 'В работе';
    case 'blocked': return 'Блок';
    case 'deferred': return 'Отложено';
    case 'review': return 'Проверка';
    default: return '';
  }
});

const statusTextClass = computed(() => {
  switch (props.task.status) {
    case 'in_progress': return 'text-[var(--status-warn)]';
    case 'blocked': return 'text-[var(--status-err)] font-semibold';
    case 'deferred': return 'text-[var(--arc-text-muted)]';
    case 'review': return 'text-[var(--arc-text-primary)]';
    default: return 'text-[var(--arc-text-secondary)]';
  }
});

const statusDotClass = computed(() => {
  switch (props.task.status) {
    case 'in_progress': return 'bg-[var(--status-warn)]';
    case 'blocked': return 'bg-[var(--status-err)]';
    case 'deferred': return 'bg-[var(--status-off)]';
    case 'review': return 'bg-[var(--status-ok)]';
    default: return 'bg-[var(--status-off)]';
  }
});

const categoryName = computed(() => tasksStore.getCategoryName(props.task.category));

const recurrenceBadgeLabel = computed(() => {
  const rule = props.task.recurrence;
  if (!rule || rule.type === 'none') return '';
  const interval = rule.interval || 1;
  const prefix = interval > 1 ? `${interval} ` : '';
  if (rule.type === 'daily') return `${prefix}дн.`;
  if (rule.type === 'weekly') return `${prefix}нед.`;
  if (rule.type === 'monthly') return `${prefix}мес.`;
  if (rule.type === 'yearly') return `${prefix}г.`;
  return `${prefix}повт.`;
});
</script>
