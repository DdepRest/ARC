<template>
  <!-- Full-Width 4-Column Kanban Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 w-full h-full overflow-x-auto pb-2 flex-1 min-h-0 select-none">
    <div 
      v-for="col in columns" 
      :key="col.id"
      class="flex flex-col min-w-0 h-full bg-[var(--arc-plane)] border border-[var(--arc-divider)] rounded-[12px] overflow-hidden transition-colors"
      :class="{ 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.05)]': dragOverColumn === col.id }"
      @dragover.prevent="dragOverColumn = col.id"
      @dragleave.prevent="dragOverColumn = null"
      @drop.prevent="onDrop($event, col.id)"
    >
      <!-- Column Header -->
      <div class="px-2.5 py-2 border-b border-[var(--arc-divider)] flex items-center justify-between bg-[var(--arc-block)] shrink-0 gap-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <div class="w-1.5 h-1.5 rounded-full shrink-0" :class="col.colorClass"></div>
          <h3 class="text-[11px] font-mono font-semibold uppercase tracking-wide text-[var(--arc-text-primary)] truncate">
            {{ col.title }}
          </h3>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            v-if="col.id !== 'done'"
            type="button"
            @click="openQuickAdd(col.id)"
            class="w-6 h-6 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-secondary)] hover:text-[var(--accent)] transition cursor-pointer"
            :title="`Добавить задачу в «${col.title}»`"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
          <span class="text-[10px] font-mono bg-[var(--arc-plane)] text-[var(--arc-text-secondary)] px-2 py-0.5 rounded-[var(--radius-pill,999px)] border border-[var(--arc-hairline)] font-semibold">
            {{ getTasksForColumn(col.id).length }}
          </span>
        </div>
      </div>

      <!-- Inline Quick Add Input for this Column -->
      <div v-if="quickAddColumn === col.id" class="p-2.5 border-b border-[var(--arc-divider)] bg-[var(--arc-block)] flex items-center gap-1.5 shrink-0">
        <input
          ref="quickAddInputRef"
          v-model="quickAddText"
          @keydown.enter.prevent="submitQuickAdd(col.id)"
          @keydown.esc.prevent="quickAddColumn = null"
          placeholder="Название задачи... (Enter)"
          class="flex-1 min-w-0 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[var(--radius-control,8px)] px-2.5 py-1.5 text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
        />
        <button
          type="button"
          :disabled="!quickAddText.trim()"
          @click="submitQuickAdd(col.id)"
          class="p-1.5 rounded-[var(--radius-control,8px)] bg-[var(--accent)] text-[var(--accent-ink,#0A0A0A)] disabled:opacity-30 transition cursor-pointer shrink-0"
          title="Создать"
        >
          <Check class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="quickAddColumn = null"
          class="p-1.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition cursor-pointer shrink-0"
          title="Отмена"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Column Tasks Container -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2 min-h-0">
        <div 
          v-for="task in getTasksForColumn(col.id)" 
          :key="task.id"
          draggable="true"
          @dragstart="onDragStart($event, task)"
          @dragend="dragOverColumn = null"
          @click="tasksStore.toggleExpand(task.id)"
          class="p-3 pl-3.5 transition cursor-pointer active:cursor-grabbing border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] rounded-[var(--radius-card,12px)] relative overflow-hidden group"
          :class="{ 
            'opacity-50': draggingTaskId === task.id,
            'bg-[var(--arc-selected)] border-[var(--arc-hairline-top)]': tasksStore.expandedTaskId === task.id
          }"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
        >
          <!-- Left Priority / Selection Stripe (3px) -->
          <div 
            class="absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none transition-colors"
            :class="getLeftStripeClass(task)"
          ></div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-start gap-2">
              <div class="pt-0.5 shrink-0" @click.stop>
                <button
                  type="button"
                  role="checkbox"
                  :aria-checked="task.completed"
                  @click="tasksStore.toggleTask(task.id)"
                  class="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors cursor-pointer"
                  :class="getCheckboxClass(task)"
                >
                  <Check class="w-3 h-3 stroke-[2.5]" :class="task.completed ? 'opacity-100' : 'opacity-0'" />
                </button>
              </div>
              <span 
                class="text-xs font-sans font-medium text-[var(--arc-text-primary)] leading-snug line-clamp-2" 
                :title="task.text" 
                :class="{ 'line-through text-[var(--arc-text-muted)]': task.completed }"
              >
                {{ task.text }}
              </span>
            </div>
            
            <!-- Card Footer: Priority · Category · Time (15 / 45м) · Subtasks (1/3) · Due Date · Sprint Action -->
            <div class="flex items-center justify-between gap-1.5 mt-1 pt-1.5 border-t border-[var(--arc-divider)] text-[10px] font-mono flex-wrap">
              <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                <!-- Priority Badge -->
                <span 
                  class="px-1 py-0.2 rounded-[4px] border font-bold shrink-0 leading-tight"
                  :class="getPriorityBadgeClass(task)"
                >
                  {{ task.priority === 'high' ? 'P1' : task.priority === 'medium' ? 'P2' : 'P3' }}
                </span>
                
                <span v-if="task.category" class="text-[var(--arc-text-machine)] uppercase truncate max-w-[85px]">
                  {{ tasksStore.getCategoryName(task.category) }}
                </span>

                <!-- Time Progress (15 / 45м) restored on Kanban Card -->
                <template v-if="task.spentMinutes || task.estimatedMinutes">
                  <span class="text-[var(--arc-text-muted)]">·</span>
                  <span 
                    v-if="task.spentMinutes && task.estimatedMinutes"
                    :class="task.spentMinutes > task.estimatedMinutes ? 'text-[var(--status-err)] font-semibold' : 'text-[var(--status-warn)] font-semibold'"
                  >
                    {{ task.spentMinutes }} / {{ task.estimatedMinutes }}м
                  </span>
                  <span v-else-if="task.estimatedMinutes" class="text-[var(--arc-text-hint)]">
                    {{ task.estimatedMinutes }}м
                  </span>
                </template>

                <!-- Subtasks Counter (1/3) -->
                <template v-if="task.subtasks?.length">
                  <span class="text-[var(--arc-text-muted)]">·</span>
                  <span class="text-[var(--arc-text-secondary)] flex items-center gap-0.5 shrink-0 font-medium">
                    <CheckCircle2 class="w-2.5 h-2.5 text-[var(--accent)]" />
                    {{ tasksStore.getCompletedSubtasksCount(task) }}/{{ task.subtasks.length }}
                  </span>
                </template>
              </div>
              
              <div class="flex items-center gap-1.5 shrink-0 ml-auto">
                <span 
                  v-if="task.dueDate" 
                  class="truncate max-w-[80px] inline-flex items-center gap-1"
                  :class="tasksStore.getDueDateClass(task.dueDate, task.completed)"
                >
                  <Calendar class="w-2.5 h-2.5 shrink-0" />
                  <span>{{ tasksStore.formatDueDateStatus(task.dueDate, task.completed) }}</span>
                </span>
                <button 
                  v-if="col.id !== 'done'" 
                  type="button"
                  @click.stop="tasksStore.startFocusSprint(task.id)" 
                  class="px-1.5 py-0.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer flex items-center gap-1" 
                  :title="isTaskStarted(task) ? 'Продолжить спринт' : 'Запустить фокус-спринт'"
                >
                  <Play class="w-2.5 h-2.5 fill-current" :class="isTaskStarted(task) ? 'text-[var(--status-warn)]' : 'text-[var(--accent)]'" />
                  <span v-if="isTaskStarted(task)" class="text-[10px]">Продолжить</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Bottom Edge Progress Bar (Restored on Kanban cards) -->
          <div 
            v-if="getCardProgressPercent(task) > 0 && !task.completed" 
            class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--arc-plane)] overflow-hidden pointer-events-none"
          >
            <div 
              class="h-full bg-[var(--accent)] transition-[width] duration-300"
              :style="{ width: `${getCardProgressPercent(task)}%` }"
            ></div>
          </div>
        </div>
        
        <div 
          v-if="getTasksForColumn(col.id).length === 0" 
          class="text-xs font-mono text-[var(--arc-text-hint)] italic text-center py-8 pointer-events-none border border-dashed border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] my-1"
        >
          Нет задач
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { Task, TaskStatus } from '../types';
import { Play, Check, Plus, X, Calendar, CheckCircle2 } from 'lucide-vue-next';

const props = defineProps<{
  tasks: Task[];
}>();

const tasksStore = useTasksStore();

const columns: { id: TaskStatus; title: string; colorClass: string }[] = [
  { id: 'todo', title: 'К ВЫПОЛНЕНИЮ', colorClass: 'bg-[var(--arc-text-secondary)]' },
  { id: 'in_progress', title: 'В РАБОТЕ', colorClass: 'bg-[var(--status-warn)]' },
  { id: 'review', title: 'ПРОВЕРКА', colorClass: 'bg-[var(--status-ok)]' },
  { id: 'done', title: 'ВЫПОЛНЕНО', colorClass: 'bg-[var(--status-ok)]' }
];

const isTaskStarted = (task: Task) => {
  return !task.completed && (task.status === 'in_progress' || (task.spentMinutes || 0) > 0);
};

const getLeftStripeClass = (task: Task) => {
  if (task.completed) return 'bg-[var(--status-ok)] opacity-50';
  if (tasksStore.expandedTaskId === task.id) return 'bg-[var(--accent)]';
  if (task.priority === 'high') return 'bg-[var(--status-err)]';
  if (task.priority === 'medium') return 'bg-[var(--status-warn)]';
  return 'bg-[var(--arc-divider)]';
};

const getPriorityBadgeClass = (task: Task) => {
  if (task.priority === 'high') return 'border-[var(--status-err)] text-[var(--status-err)] bg-[var(--arc-plane)]';
  if (task.priority === 'medium') return 'border-[var(--status-warn)] text-[var(--status-warn)] bg-[var(--arc-plane)]';
  return 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-[var(--arc-plane)]';
};

const getCardProgressPercent = (task: Task) => {
  if (task.subtasks && task.subtasks.length > 0) {
    return Math.round((tasksStore.getCompletedSubtasksCount(task) / task.subtasks.length) * 100);
  }
  if (task.spentMinutes && task.estimatedMinutes && task.estimatedMinutes > 0) {
    return Math.min(100, Math.round((task.spentMinutes / task.estimatedMinutes) * 100));
  }
  return 0;
};

const getCheckboxClass = (task: Task) => {
  if (task.completed) {
    return 'border-[var(--status-ok)] bg-[var(--arc-selected)] text-[var(--status-ok)]';
  }
  if (task.priority === 'high') {
    return 'border-[var(--status-err)] bg-[var(--arc-input)] text-[var(--status-err)]';
  }
  if (task.priority === 'medium') {
    return 'border-[var(--status-warn)] bg-[var(--arc-input)] text-[var(--status-warn)]';
  }
  return 'border-[rgba(255,255,255,0.35)] bg-[var(--arc-input)] text-[var(--arc-text-primary)]';
};

const draggingTaskId = ref<string | null>(null);
const dragOverColumn = ref<TaskStatus | null>(null);

const quickAddColumn = ref<TaskStatus | null>(null);
const quickAddText = ref('');
const quickAddInputRef = ref<HTMLInputElement[] | null>(null);

const openQuickAdd = async (colId: TaskStatus) => {
  if (quickAddColumn.value === colId) {
    quickAddColumn.value = null;
    return;
  }
  quickAddColumn.value = colId;
  quickAddText.value = '';
  await nextTick();
  if (Array.isArray(quickAddInputRef.value) && quickAddInputRef.value[0]) {
    quickAddInputRef.value[0].focus();
  }
};

const submitQuickAdd = (colId: TaskStatus) => {
  const text = quickAddText.value.trim();
  if (!text) return;
  tasksStore.newTaskText = text;
  tasksStore.addTask();
  const newest = tasksStore.tasks[0];
  if (newest && colId !== 'todo') {
    tasksStore.updateTaskStatus(newest.id, colId);
  }
  quickAddText.value = '';
  quickAddColumn.value = null;
};

const onDragStart = (event: DragEvent, task: Task) => {
  draggingTaskId.value = task.id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  }
};

const onDrop = (event: DragEvent, columnId: TaskStatus) => {
  dragOverColumn.value = null;
  const taskId = event.dataTransfer?.getData('text/plain');
  if (taskId && taskId === draggingTaskId.value) {
    tasksStore.updateTaskStatus(taskId, columnId);
  }
  draggingTaskId.value = null;
};

const getTasksForColumn = (status: TaskStatus) => {
  if (status === 'todo') {
    return (props.tasks || []).filter(t => !t.completed && (!t.status || t.status === 'todo' || t.status === 'backlog' || t.status === 'deferred'));
  }
  if (status === 'done') {
    return (props.tasks || []).filter(t => t.completed || t.status === 'done');
  }
  return (props.tasks || []).filter(t => !t.completed && t.status === status);
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--arc-hairline);
  border-radius: 4px;
}
</style>
