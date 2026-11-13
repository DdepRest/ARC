import { ref, computed, Ref } from 'vue';
import type { Task } from '../types';

export function useTaskFilters(tasks: Ref<Task[]>) {
  const activeFilter = ref<string>('all');
  const searchQuery = ref<string>('');
  const sortBy = ref<string>('priority-desc');

  // Single-pass O(N) memoized counter aggregation for all filter badges & sidebar widgets
  const filterCountsMap = computed(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const counts: Record<string, number> = {
      all: 0,
      active: 0,
      completed: 0,
      my_day: 0,
      scheduled: 0,
      important: 0,
      inbox: 0,
      overdue: 0,
      blocked: 0,
      deferred: 0,
      no_due: 0
    };

    const list = tasks.value || [];
    counts.all = list.length;

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.completed) {
        counts.completed++;
      } else {
        if (t.status !== 'blocked' && t.status !== 'deferred') {
          counts.active++;
        }
        if (t.status === 'blocked') counts.blocked++;
        if (t.status === 'deferred') counts.deferred++;
        if (!t.dueDate) counts.no_due++;
        if (t.dueDate && t.dueDate < todayStr) counts.overdue++;
      }

      if (t.isMyDay || t.dueDate === todayStr) counts.my_day++;
      if (t.dueDate) counts.scheduled++;
      if (t.priority === 'high' || t.importance === 'urgent-important' || t.importance === 'important') {
        counts.important++;
      }
      if (!t.dueDate && (!t.category || t.category.toLowerCase() === 'general' || t.category.toLowerCase() === 'общее')) {
        counts.inbox++;
      }
      if (t.objectiveId) {
        const key = 'obj_' + t.objectiveId;
        counts[key] = (counts[key] || 0) + 1;
      }
    }

    return counts;
  });

  const completedCount = computed(() => filterCountsMap.value.completed || 0);
  const activeCount = computed(() => filterCountsMap.value.active || 0);

  const completionRatio = computed(() => {
    const total = filterCountsMap.value.all || 0;
    if (total === 0) return 0;
    return completedCount.value / total;
  });

  const filterCount = (f: string): number => {
    return filterCountsMap.value[f] ?? 0;
  };

  const filteredTasks = computed(() => {
    let list = [...(tasks.value || [])];

    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase().trim();
      list = list.filter(t => 
        t.text.toLowerCase().includes(query) || 
        (t.description && t.description.toLowerCase().includes(query)) || 
        (t.category && t.category.toLowerCase().includes(query)) ||
        (t.subtasks && t.subtasks.some(st => st.text.toLowerCase().includes(query)))
      );
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (activeFilter.value === 'active') {
      list = list.filter(t => !t.completed && t.status !== 'blocked' && t.status !== 'deferred');
    } else if (activeFilter.value === 'completed') {
      list = list.filter(t => t.completed);
    } else if (activeFilter.value === 'my_day') {
      list = list.filter(t => t.isMyDay || t.dueDate === todayStr);
    } else if (activeFilter.value.startsWith('obj_')) {
      const objId = activeFilter.value.replace('obj_', '');
      list = list.filter(t => t.objectiveId === objId);
    } else if (activeFilter.value === 'scheduled') {
      list = list.filter(t => !!t.dueDate);
    } else if (activeFilter.value === 'important') {
      list = list.filter(t => t.priority === 'high' || t.importance === 'urgent-important' || t.importance === 'important');
    } else if (activeFilter.value === 'inbox') {
      list = list.filter(t => !t.dueDate && (!t.category || t.category.toLowerCase() === 'general' || t.category.toLowerCase() === 'общее'));
    } else if (activeFilter.value === 'overdue') {
      list = list.filter(t => !t.completed && t.dueDate && t.dueDate < todayStr);
    } else if (activeFilter.value === 'blocked') {
      list = list.filter(t => !t.completed && t.status === 'blocked');
    } else if (activeFilter.value === 'deferred') {
      list = list.filter(t => !t.completed && t.status === 'deferred');
    } else if (activeFilter.value === 'no_due') {
      list = list.filter(t => !t.completed && !t.dueDate);
    }

    list.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      if (sortBy.value === 'priority-desc') {
        const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const weightA = priorityWeight[a.priority] || 2;
        const weightB = priorityWeight[b.priority] || 2;
        if (weightA !== weightB) {
          return weightB - weightA;
        }
        return b.createdAt - a.createdAt;
      }

      if (sortBy.value === 'due-asc') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }

      if (sortBy.value === 'date-desc') {
        return b.createdAt - a.createdAt;
      }

      if (sortBy.value === 'date-asc') {
        return a.createdAt - b.createdAt;
      }

      return b.createdAt - a.createdAt;
    });

    return list;
  });

  return {
    activeFilter,
    searchQuery,
    sortBy,
    completedCount,
    activeCount,
    completionRatio,
    filteredTasks,
    filterCount,
    filterCountsMap
  };
}

export const useTaskFiltering = useTaskFilters;
