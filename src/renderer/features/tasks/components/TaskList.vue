<template>
  <div class="w-full flex flex-col gap-3">
    <template v-if="(tasks || []).length > 0">
      <!-- Active Tasks (or all filtered tasks when not in 'all' split mode) -->
      <TransitionGroup 
        v-if="primaryList.length > 0"
        name="list" 
        tag="div" 
        class="flex flex-col gap-2.5"
      >
        <TaskItem
          v-for="task in primaryList"
          :key="task.id"
          :task="task"
        />
      </TransitionGroup>

      <!-- Collapsible Completed Section (Shown in 'all' filter when completed tasks exist) -->
      <div v-if="completedList.length > 0" class="flex flex-col gap-2 pt-1">
        <button
          type="button"
          @click="showCompletedGroup = !showCompletedGroup"
          class="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer select-none"
        >
          <span class="flex items-center gap-2">
            <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ '-rotate-90': !showCompletedGroup }" />
            <span>Выполненные задачи</span>
          </span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--status-ok)] font-semibold">
            {{ completedList.length }}
          </span>
        </button>

        <TransitionGroup
          v-if="showCompletedGroup"
          name="list"
          tag="div"
          class="flex flex-col gap-2"
        >
          <TaskItem
            v-for="task in completedList"
            :key="task.id"
            :task="task"
          />
        </TransitionGroup>
      </div>
    </template>

    <EmptyState
      v-else
      :title="translations?.emptyTitle || 'Нет задач'"
      :description="activeFilter === 'completed' ? (translations?.emptyCompletedDesc || 'Выполненных задач нет') : activeFilter === 'active' ? (translations?.emptyActiveDesc || 'Все задачи выполнены!') : (translations?.emptyAllDesc || 'Список задач пуст')"
      icon="inbox"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import TaskItem from './TaskItem.vue';
import EmptyState from '../../../components/ui/EmptyState.vue';
import { ChevronDown } from 'lucide-vue-next';
import type { Task } from '../types';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  tasks: Task[];
}>();

const tasksStore = useTasksStore();
const { activeFilter, translations } = storeToRefs(tasksStore);

const showCompletedGroup = ref(true);

const shouldSplitCompleted = computed(() => {
  if (activeFilter.value === 'completed') return false;
  const list = props.tasks || [];
  return list.some(t => !t.completed) && list.some(t => t.completed);
});

const primaryList = computed(() => {
  const list = props.tasks || [];
  if (!shouldSplitCompleted.value) return list;
  return list.filter(t => !t.completed);
});

const completedList = computed(() => {
  const list = props.tasks || [];
  if (!shouldSplitCompleted.value) return [];
  return list.filter(t => t.completed);
});
</script>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
