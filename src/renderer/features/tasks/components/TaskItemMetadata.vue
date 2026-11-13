<template>
  <div class="flex flex-col gap-2.5">
    <!-- Description & Notes Section -->
    <div class="flex flex-col gap-1.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] p-2.5">
      <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-widest flex items-center gap-1.5">
        <FileText class="w-3 h-3 text-[var(--accent)]" /> Заметки и описание
      </span>
      <textarea
        v-model="localDescription"
        @blur="saveDescription"
        rows="2"
        placeholder="Добавьте контекст, детали или заметки..."
        class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] p-2 text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none focus:border-[var(--accent)] transition resize-y min-h-[48px]"
      ></textarea>
    </div>

    <!-- Core Parameters Grid (2 columns tailored for Inspector width, 1-line aligned labels) -->
    <div class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] p-2.5 flex flex-col gap-2.5 select-none">
      <div class="grid grid-cols-2 gap-2">
        <!-- Status -->
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate">Статус</span>
          <ArcSelect 
            :model-value="normalizedStatus"
            @update:model-value="tasksStore.updateTaskStatus(task.id, $event as any)"
            :options="statusOptions"
            size="sm"
            class="w-full"
          />
        </div>

        <!-- Priority -->
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate">Приоритет</span>
          <ArcSelect 
            :model-value="task.priority || 'medium'"
            @update:model-value="onPriorityChange($event)"
            :options="priorityOptions"
            size="sm"
            class="w-full"
          />
        </div>

        <!-- Category -->
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate">Категория</span>
          <ArcSelect 
            :model-value="normalizedCategory"
            @update:model-value="onCategorySelect($event)"
            :options="categoryOptions"
            size="sm"
            class="w-full"
          />
        </div>

        <!-- Due Date -->
        <div class="flex flex-col gap-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate">Срок</span>
            <span v-if="isOverdue" class="text-[10px] font-mono text-[var(--status-err)] font-semibold">Просрочено</span>
          </div>
          <ArcDatePicker 
            :model-value="task.dueDate"
            @update:model-value="task.dueDate = $event || ''; tasksStore.saveTasks()"
            placeholder="Без срока"
            size="sm"
            align="right"
          />
        </div>
      </div>

      <!-- Time & Recurrence Row (Strictly 1-line labels so inputs align horizontally) -->
      <div class="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--arc-divider)]">
        <!-- Time tracking -->
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate" title="Фактическое и плановое время (в минутах)">
            Факт / План (м)
          </span>
          <div class="flex items-center gap-1 h-8">
            <input 
              v-model.number="task.spentMinutes"
              type="number"
              min="0"
              placeholder="0"
              class="w-full min-w-0 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] text-xs font-mono text-[var(--accent)] px-1.5 py-1 outline-none text-center h-8 focus:border-[var(--accent)] transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              @change="tasksStore.saveTasks()"
              title="Затрачено минут"
            />
            <span class="text-[var(--arc-text-muted)] text-xs font-mono shrink-0">/</span>
            <input 
              v-model.number="task.estimatedMinutes"
              type="number"
              min="0"
              placeholder="30"
              class="w-full min-w-0 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] text-xs font-mono text-[var(--arc-text-secondary)] px-1.5 py-1 outline-none text-center h-8 focus:border-[var(--accent)] transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              @change="tasksStore.saveTasks()"
              title="Оценка в минутах"
            />
          </div>
        </div>

        <!-- Recurrence -->
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate">Повторение</span>
          <ArcSelect 
            :model-value="task.recurrence?.type || 'none'"
            @update:model-value="updateRecurrence($event)"
            :options="recurrenceOptions"
            size="sm"
            class="w-full"
          />
        </div>
      </div>

      <!-- Linked System Objective Row -->
      <div class="flex flex-col gap-1 pt-2 border-t border-[var(--arc-divider)]">
        <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-wider truncate">Связанная цель</span>
        <ArcSelect 
          :model-value="task.objectiveId || ''"
          @update:model-value="onObjectiveChange($event)"
          :options="objectiveOptions"
          size="sm"
          class="w-full"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { FileText } from 'lucide-vue-next';
import { Task } from '../types';
import ArcSelect from '../../../components/ui/ArcSelect.vue';
import ArcDatePicker from '../../../components/ui/ArcDatePicker.vue';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  task: Task;
}>();

const emit = defineEmits<{
  (e: 'openCategoryModal'): void;
}>();

const tasksStore = useTasksStore();
const { categoryOptions, objectives } = storeToRefs(tasksStore);

const localDescription = ref(props.task.description || '');

watch(() => props.task.description, (newVal) => {
  localDescription.value = newVal || '';
});

const saveDescription = () => {
  if (localDescription.value !== (props.task.description || '')) {
    tasksStore.updateTaskDescription(props.task.id, localDescription.value);
  }
};

const normalizedStatus = computed(() => {
  if (props.task.completed || props.task.status === 'done') return 'done';
  const s = props.task.status;
  if (!s || s === 'backlog') {
    return (props.task.spentMinutes || 0) > 0 ? 'in_progress' : 'todo';
  }
  return s;
});

const normalizedCategory = computed(() => {
  const c = props.task.category;
  if (!c || c === 'manage_categories') return 'ops';
  return c;
});

const isOverdue = computed(() => {
  if (props.task.completed || !props.task.dueDate) return false;
  const todayStr = new Date().toISOString().split('T')[0];
  return props.task.dueDate < todayStr;
});

const priorityOptions = [
  { label: 'P1 · Высокий', value: 'high' },
  { label: 'P2 · Средний', value: 'medium' },
  { label: 'P3 · Обычный', value: 'low' }
];

const statusOptions = [
  { label: 'К выполнению', value: 'todo' },
  { label: 'В работе', value: 'in_progress' },
  { label: 'Проверка', value: 'review' },
  { label: 'Отложено', value: 'deferred' },
  { label: 'Заблокировано', value: 'blocked' },
  { label: 'Выполнено', value: 'done' }
];

const recurrenceOptions = [
  { label: 'Без повторов', value: 'none' },
  { label: 'Ежедневно', value: 'daily' },
  { label: 'Еженедельно', value: 'weekly' },
  { label: 'Ежемесячно', value: 'monthly' },
  { label: 'Ежегодно', value: 'yearly' }
];

const fallbackObjectives = [
  { id: 'obj-core-01', title: 'Автономная стабилизация ядра A.R.C.' },
  { id: 'obj-core-02', title: 'Атомарный отказоустойчивый контур (Rollback Engine)' }
];

const objectiveOptions = computed(() => {
  const list = objectives.value && objectives.value.length > 0 ? objectives.value : fallbackObjectives;
  return [
    { label: 'Без привязки к цели', value: '' },
    ...list.map((o: any) => ({ label: o.title, value: o.id }))
  ];
});

const onPriorityChange = (val: any) => {
  const p = val as 'low' | 'medium' | 'high';
  props.task.priority = p;
  props.task.importance = p === 'high' ? 'urgent-important' : p === 'medium' ? 'important' : 'regular';
  tasksStore.saveTasks();
};

const updateRecurrence = (val: any) => {
  const r = String(val);
  if (r === 'none') {
    props.task.recurrence = undefined;
  } else {
    props.task.recurrence = { type: r as any };
  }
  tasksStore.saveTasks();
};

const onCategorySelect = (val: any) => {
  const str = String(val);
  if (str === 'manage_categories' || str === '__ADD_NEW__') {
    emit('openCategoryModal');
    return;
  }
  props.task.category = str;
  tasksStore.saveTasks();
};

const onObjectiveChange = (val: any) => {
  const str = String(val || '');
  props.task.objectiveId = str ? str : undefined;
  tasksStore.saveTasks();
};
</script>
