import { Ref } from 'vue';
import { Task } from '../types';
import { useSettingsStore } from '../../settings/stores/settings.store';

export function useTaskCloning(tasks: Ref<Task[]>, saveTasks: () => void) {
  const settingsStore = useSettingsStore();

  const duplicateTask = (id: string) => {
    const task = tasks.value.find(t => t.id === id);
    if (!task) return;

    const isEn = settingsStore.language === 'EN';
    const copySuffix = isEn ? ' (Copy)' : ' (Копия)';
    const clonedTask: Task = {
      ...task,
      id: 'task-' + Math.random().toString(36).substring(2, 9),
      text: task.text + copySuffix,
      createdAt: Date.now(),
      completed: false,
      completedAt: undefined,
      spentMinutes: 0,
      subtasks: task.subtasks ? task.subtasks.map(st => ({
        ...st,
        id: 'sub-' + Math.random().toString(36).substring(2, 9),
        completed: false
      })) : []
    };

    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index + 1, 0, clonedTask);
    } else {
      tasks.value.push(clonedTask);
    }

    saveTasks();
    settingsStore.triggerSyncToast(
      isEn ? '✦ Task duplicated' : '✦ Задача дублирована',
      undefined,
      false
    );
  };

  return {
    duplicateTask
  };
}
