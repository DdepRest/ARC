<template>
  <aside class="w-full h-full flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] overflow-hidden select-none shadow-lg font-sans">
    
    <!-- Inspector Header / Mode Indicator -->
    <div class="flex items-center justify-between px-3.5 py-2 border-b border-[var(--arc-divider)] bg-[var(--arc-plane)] shrink-0">
      <div class="flex items-center gap-2">
        <Sliders class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-primary)] uppercase">
          {{ selectedTask ? 'Инспектор задачи' : tasksStore.viewMode === 'history' ? 'Сводка ретроспективы' : 'Сводка очереди' }}
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button 
          v-if="selectedTask"
          type="button"
          @click="closeInspector"
          class="px-2 py-0.5 rounded-[var(--radius-control,8px)] text-[10px] font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition cursor-pointer flex items-center gap-1"
          title="Вернуться к сводке"
        >
          <span>Сводка</span>
        </button>
        <button 
          type="button"
          @click="handleHeaderClose"
          class="p-1 rounded-[var(--radius-control,8px)] text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer"
          :title="selectedTask ? 'Закрыть инспектор' : 'Скрыть боковую панель'"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Scrollable Content Area -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2.5">

      <!-- STATE A: Selected Task Context Inspector -->
      <div v-if="selectedTask" class="flex flex-col gap-2.5">
        <!-- Title & Quick Actions Card -->
        <div class="flex flex-col gap-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] p-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span 
                class="text-[10px] font-mono px-1.5 py-0.2 rounded-[4px] border font-bold leading-tight"
                :class="priorityBadgeClass"
              >
                {{ selectedTask.priority === 'high' ? 'P1' : selectedTask.priority === 'medium' ? 'P2' : 'P3' }}
              </span>
              <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">Задача</span>
            </div>
            <span class="text-[10px] font-mono flex items-center gap-1.5" :class="statusTextClass">
              <span class="w-1.5 h-1.5 rounded-full" :class="statusDotClass"></span>
              {{ statusBadgeLabel }}
            </span>
          </div>

          <!-- Multi-line Editable Task Title (Prevents horizontal clipping of long task titles) -->
          <textarea
            :value="selectedTask.text"
            rows="2"
            @change="onTitleChange($event)"
            @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[var(--radius-control,8px)] px-2.5 py-1.5 font-sans text-xs font-semibold text-[var(--arc-text-primary)] leading-snug outline-none transition resize-none"
            placeholder="Название задачи..."
          ></textarea>

          <!-- Quick Action Buttons Row -->
          <div class="flex items-center gap-1.5">
            <button 
              type="button"
              @click="tasksStore.toggleTask(selectedTask.id)"
              class="flex-1 py-1.5 px-2 rounded-[var(--radius-control,8px)] text-[11px] font-mono font-medium border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer flex items-center justify-center gap-1"
              :class="selectedTask.completed ? 'text-[var(--status-ok)]' : ''"
            >
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
              <span>{{ selectedTask.completed ? 'Вернуть' : 'Завершить' }}</span>
            </button>

            <button 
              v-if="!selectedTask.completed"
              type="button"
              @click="handleFocusAction" 
              class="py-1.5 px-2 rounded-[var(--radius-control,8px)] text-[11px] font-mono font-medium border transition cursor-pointer flex items-center gap-1"
              :class="isSelectedTaskRunningNow || isSelectedTaskStarted
                ? 'bg-[var(--arc-selected)] border-[var(--status-warn)] text-[var(--status-warn)] font-semibold'
                : 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'"
              :title="isSelectedTaskRunningNow ? 'Поставить спринт на паузу' : isSelectedTaskStarted ? 'Продолжить спринт фокуса' : 'Запустить спринт фокуса'"
            >
              <Pause v-if="isSelectedTaskRunningNow" class="w-3 h-3 shrink-0" />
              <Play v-else class="w-3 h-3 fill-current shrink-0" :class="isSelectedTaskStarted ? 'text-[var(--status-warn)]' : 'text-[var(--accent)]'" />
              <span>{{ isSelectedTaskRunningNow ? 'Пауза' : isSelectedTaskStarted ? 'Продолжить' : 'Фокус' }}</span>
            </button>

            <button 
              v-if="!selectedTask.completed"
              type="button"
              @click="tasksStore.decomposeTaskWithAI(selectedTask.id)" 
              class="py-1.5 px-2 rounded-[var(--radius-control,8px)] text-[11px] font-mono font-medium bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer flex items-center gap-1"
              title="AI Декомпозиция на шаги"
            >
              <Zap class="w-3 h-3 text-[var(--accent)] shrink-0" />
              <span>AI</span>
            </button>

            <button 
              type="button"
              @click="handleDeleteSelectedTask" 
              class="p-1.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--status-err)] transition cursor-pointer flex items-center justify-center shrink-0"
              title="Удалить задачу"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Subtasks List (Prominent Hierarchy right under Title) -->
        <div class="flex flex-col gap-1.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] p-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-widest flex items-center gap-1.5">
              <CheckSquare class="w-3.5 h-3.5 text-[var(--accent)]" /> Подзадачи и шаги
            </span>
            <span v-if="selectedTask.subtasks?.length" class="text-[10px] font-mono text-[var(--arc-text-secondary)] font-semibold">
              {{ tasksStore.getCompletedSubtasksCount(selectedTask) }}/{{ selectedTask.subtasks.length }}
            </span>
          </div>
          <TaskSubtasksList :task="selectedTask" />
        </div>

        <!-- Task Metadata / Parameters -->
        <TaskItemMetadata 
          :task="selectedTask" 
          @openCategoryModal="$emit('openCategoryModal', selectedTask.id)"
        />

        <!-- Links & Attachments -->
        <TaskLinksManager :task="selectedTask" />
      </div>

      <!-- STATE B: Operational Summary (When no task is selected) -->
      <div v-else class="flex flex-col gap-3">
        <TaskTelemetry 
          @startFocusSprint="handleStartFocusSprint"
        />
      </div>

    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';
import { Sliders, X, CheckCircle2, Zap, CheckSquare, Play, Pause, Trash2 } from 'lucide-vue-next';
import TaskItemMetadata from './TaskItemMetadata.vue';
import TaskSubtasksList from './TaskSubtasksList.vue';
import TaskLinksManager from './TaskLinksManager.vue';
import TaskTelemetry from './TaskTelemetry.vue';

const emit = defineEmits<{
  (e: 'closeRail'): void;
  (e: 'openCategoryModal', taskId?: string): void;
}>();

const tasksStore = useTasksStore();
const { tasks, expandedTaskId, activeFocusTaskId, isSprintRunning, viewMode } = storeToRefs(tasksStore);

const selectedTask = computed(() => {
  if (!expandedTaskId.value) return null;
  return (tasks.value || []).find(t => t.id === expandedTaskId.value) || null;
});

const isSelectedTaskStarted = computed(() => {
  const t = selectedTask.value;
  if (!t || t.completed) return false;
  return t.status === 'in_progress' || (t.spentMinutes || 0) > 0 || activeFocusTaskId.value === t.id;
});

const isSelectedTaskRunningNow = computed(() => {
  const t = selectedTask.value;
  if (!t || t.completed) return false;
  return activeFocusTaskId.value === t.id && isSprintRunning.value;
});

const priorityBadgeClass = computed(() => {
  const p = selectedTask.value?.priority;
  if (p === 'high') return 'border-[var(--status-err)] text-[var(--status-err)] bg-[var(--arc-block)]';
  if (p === 'medium') return 'border-[var(--status-warn)] text-[var(--status-warn)] bg-[var(--arc-block)]';
  return 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-[var(--arc-block)]';
});

const statusBadgeLabel = computed(() => {
  const t = selectedTask.value;
  if (!t) return '';
  if (t.completed || t.status === 'done') return 'Выполнено';
  if (isSelectedTaskRunningNow.value) return 'Идёт спринт';
  if (t.status === 'in_progress' || (t.spentMinutes || 0) > 0) return 'В работе';
  if (t.status === 'review') return 'Проверка';
  if (t.status === 'blocked') return 'Блок';
  if (t.status === 'deferred') return 'Отложено';
  return 'К выполнению';
});

const statusDotClass = computed(() => {
  const t = selectedTask.value;
  if (!t) return 'bg-[var(--arc-text-muted)]';
  if (t.completed || t.status === 'done' || t.status === 'review') return 'bg-[var(--status-ok)]';
  if (t.status === 'blocked') return 'bg-[var(--status-err)]';
  if (t.status === 'in_progress' || (t.spentMinutes || 0) > 0 || isSelectedTaskRunningNow.value) return 'bg-[var(--status-warn)]';
  return 'bg-[var(--arc-text-secondary)]';
});

const statusTextClass = computed(() => {
  const t = selectedTask.value;
  if (!t) return 'text-[var(--arc-text-secondary)]';
  if (t.completed || t.status === 'done') return 'text-[var(--status-ok)] font-semibold';
  if (t.status === 'in_progress' || (t.spentMinutes || 0) > 0 || isSelectedTaskRunningNow.value) return 'text-[var(--status-warn)] font-semibold';
  return 'text-[var(--arc-text-secondary)]';
});

const handleFocusAction = () => {
  const t = selectedTask.value;
  if (!t) return;
  if (isSelectedTaskRunningNow.value) {
    tasksStore.toggleSprintTimer();
  } else if (viewMode.value === 'sprint' && activeFocusTaskId.value === t.id) {
    tasksStore.toggleSprintTimer();
  } else {
    tasksStore.startFocusSprint(t.id);
  }
};

const handleDeleteSelectedTask = () => {
  const t = selectedTask.value;
  if (!t) return;
  const id = t.id;
  tasksStore.expandedTaskId = null;
  tasksStore.deleteTask(id);
};

const closeInspector = () => {
  tasksStore.expandedTaskId = null;
};

const handleHeaderClose = () => {
  if (selectedTask.value) {
    tasksStore.expandedTaskId = null;
  } else {
    emit('closeRail');
  }
};

const onTitleChange = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  if (selectedTask.value && target.value.trim()) {
    tasksStore.updateTaskTitle(selectedTask.value.id, target.value.trim());
  }
};

const handleStartFocusSprint = (taskId: string) => {
  tasksStore.startFocusSprint(taskId);
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
</style>
