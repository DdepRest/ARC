import { Ref } from 'vue';
import { Task } from '../types';

export function useTaskExport(
  tasks: Ref<Task[]>,
  saveTasks: () => void,
  getCategoryName: (catId: string) => string
) {
  const exportTasks = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(tasks.value, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'arc_tasks_telemetry_' + Date.now() + '.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportTasksCSV = () => {
    let csv = 'ID,Text,Category,Priority,Status,DueDate,Completed,IsMyDay,CreatedAt\n';
    tasks.value.forEach(t => {
      const textEscaped = `"${t.text.replace(/"/g, '""')}"`;
      const catEscaped = `"${getCategoryName(t.category).replace(/"/g, '""')}"`;
      csv += `${t.id},${textEscaped},${catEscaped},${t.priority},${t.status || 'todo'},${t.dueDate || ''},${t.completed},${!!t.isMyDay},${new Date(t.createdAt).toISOString()}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `arc_tasks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerReset = (
    isEn: boolean,
    triggerSyncToast: (msg: string, undoCallback: () => void, isCritical?: boolean) => void
  ) => {
    const originalTasks = [...tasks.value];
    if (confirm(isEn ? 'CRITICAL COMMAND: RESET ALL TASK LOGS? THIS CANNOT BE UNDONE!' : 'КРИТИЧЕСКАЯ ОПЕРАЦИЯ: ОЧИСТИТЬ ВСЕ ЗАДАЧИ? ЭТО ДЕЙСТВИЕ НЕОБРАТИМО!')) {
      tasks.value = [];
      saveTasks();
      triggerSyncToast(
        isEn ? '✦ System tasks reset completed' : '✦ Очистка журнала задач выполнена',
        () => {
          tasks.value = originalTasks;
          saveTasks();
        },
        true // critical
      );
    }
  };

  return {
    exportTasks,
    exportTasksCSV,
    triggerReset
  };
}
