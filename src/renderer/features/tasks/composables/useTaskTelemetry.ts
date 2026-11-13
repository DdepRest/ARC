import { computed, Ref } from 'vue';
import type { Task } from '../types';

export function useTaskTelemetry(tasks: Ref<Task[]>) {
  const totalEstimatedMinutes = computed(() => {
    return tasks.value.reduce((total, task) => total + (task.estimatedMinutes || 0), 0);
  });

  const totalSpentMinutes = computed(() => {
    return tasks.value.reduce((total, task) => total + (task.spentMinutes || 0), 0);
  });

  const getPriorityCount = (p: string) => {
    return tasks.value.filter(t => t.priority === p).length;
  };

  const getPriorityRatio = (p: string) => {
    if (tasks.value.length === 0) return 0;
    return getPriorityCount(p) / tasks.value.length;
  };

  const getCategoryCount = (c: string) => {
    return tasks.value.filter(t => t.category === c).length;
  };

  const getOverdueCount = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    return tasks.value.filter(t => !t.completed && t.dueDate && t.dueDate < todayStr).length;
  };

  const getDueTodayCount = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    return tasks.value.filter(t => !t.completed && t.dueDate === todayStr).length;
  };

  const noDueDateCount = computed(() => {
    return tasks.value.filter(t => !t.completed && !t.dueDate).length;
  });

  const notStartedCount = computed(() => {
    return tasks.value.filter(t => !t.completed && (t.status === 'todo' || t.status === 'backlog')).length;
  });

  const largeNoPlanCount = computed(() => {
    return tasks.value.filter(t => !t.completed && (!t.subtasks || t.subtasks.length === 0) && (t.estimatedMinutes || 0) > 60).length;
  });

  return {
    totalEstimatedMinutes,
    totalSpentMinutes,
    getPriorityCount,
    getPriorityRatio,
    getCategoryCount,
    getOverdueCount,
    getDueTodayCount,
    noDueDateCount,
    notStartedCount,
    largeNoPlanCount
  };
}
