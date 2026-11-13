import { Ref } from 'vue';
import { Task } from '../types';
import { useSettingsStore } from '../../settings/stores/settings.store';

export function usePresetTemplates(tasks: Ref<Task[]>, saveTasks: () => void) {
  const settingsStore = useSettingsStore();

  const loadPresetTemplate = (presetType: string) => {
    let title = '';
    let category = 'ops';
    let priority: 'low' | 'medium' | 'high' = 'high';
    let subtasksText: string[] = [];

    if (presetType === 'audit') {
      title = 'Аудит когнитивных подсистем и протоколов A.R.C.';
      category = 'sec';
      priority = 'high';
      subtasksText = [
        'Проверка целостности моделей',
        'Аудит ролей и токенов',
        'Верификация журналов ошибок'
      ];
    } else if (presetType === 'refactor') {
      title = 'Оптимизация рендеринга и декомпозиция компонентов';
      category = 'dev';
      priority = 'medium';
      subtasksText = [
        'Замер времени рендера FPS',
        'Вынос тяжелой UI-логики в composables',
        'Проверка использования мемоизации'
      ];
    } else if (presetType === 'backup') {
      title = 'Синхронизация и бэкап системной памяти A.R.C.';
      category = 'data';
      priority = 'medium';
      subtasksText = [
        'Экспорт векторной базы данных',
        'Сжатие дампа логов',
        'Шифрование и заливка в облачный узел'
      ];
    } else if (presetType === 'weekly_review') {
      title = 'Еженедельный обзор и планирование (Weekly Review)';
      category = 'ops';
      priority = 'high';
      subtasksText = [
        'Очистить входящие задачи (Inbox Zero)',
        'Проверить выполнение планов за неделю',
        'Спланировать фокус на следующую неделю',
        'Обновить приоритеты активных проектов'
      ];
    }

    if (!title) return;

    const task: Task = {
      id: 'task-' + Math.random().toString(36).substring(2, 9),
      text: title,
      description: 'Автоматически сформированный шаблон операционного плана.',
      completed: false,
      createdAt: Date.now(),
      priority,
      category,
      dueDate: new Date().toISOString().split('T')[0],
      status: 'todo',
      importance: 'important',
      estimatedMinutes: subtasksText.length * 20,
      spentMinutes: 0,
      subtasks: subtasksText.map((st) => ({
        id: 'sub-' + Math.random().toString(36).substring(2, 9),
        text: st,
        completed: false
      }))
    };

    tasks.value.unshift(task);
    saveTasks();
    settingsStore.triggerSyncToast(
      settingsStore.language === 'EN' ? '✦ Preset operational task generated' : '✦ Операционный шаблон задачи загружен',
      undefined,
      false
    );
  };

  return {
    loadPresetTemplate
  };
}
