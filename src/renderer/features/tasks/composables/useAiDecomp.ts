import { ref, Ref } from 'vue';
import { Task } from '../types';
import { useSettingsStore } from '../../settings/stores/settings.store';

function getFallbackSteps(taskText: string): string[] {
  const lower = taskText.toLowerCase();
  let rawSteps: string[] = [];

  if (lower.includes('код') || lower.includes('dev') || lower.includes('разработ') || lower.includes('фич') || lower.includes('компонент')) {
    rawSteps = [
      'Спроектировать интерфейсы и типы данных',
      'Реализовать основную логику модуля',
      'Провести модульное тестирование и линтинг',
      'Проверить адаптивность UI и обработку ошибок',
      'Сформировать пулл-реквест и обновить документацию'
    ];
  } else if (lower.includes('безопасн') || lower.includes('sec') || lower.includes('аудит') || lower.includes('доступ')) {
    rawSteps = [
      'Сканирование уязвимостей и портов системы',
      'Проверка валидации входящих токенов и ключей',
      'Аудит правил безопасности и политик доступа',
      'Тестирование устойчивости к инъекциям',
      'Фиксация протокола безопасности в журнале'
    ];
  } else if (lower.includes('оптимиз') || lower.includes('скорост') || lower.includes('памят') || lower.includes('производительн')) {
    rawSteps = [
      'Профилирование узких мест и замеров FPS/RAM',
      'Кеширование повторных вычислений и запросов',
      'Декомпозиция тяжелых функций в асинхронные потоки',
      'Сравнение показателей до и после оптимизации'
    ];
  } else {
    rawSteps = [
      'Анализ требований и подготовка рабочего контекста',
      'Выполнение ключевого этапа операции',
      'Проверка результатов на соответствие стандарту A.R.C.',
      'Архивация и завершение узла'
    ];
  }

  return rawSteps.map(step => `[Локальный шаблон — ИИ офлайн] ${step}`);
}

export function useAiDecomposition(tasks: Ref<Task[]>, saveTasks: () => void) {
  const settingsStore = useSettingsStore();
  const decomposingTaskId = ref<string | null>(null);

  const decomposeTaskWithAI = async (taskId: string) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (!task || decomposingTaskId.value) return;

    decomposingTaskId.value = taskId;

    try {
      let generatedSubtasks: string[] = [];

      // Attempt real AI decomposition via IPC
      if (typeof window !== 'undefined' && window.api?.tasksAiDecompose) {
        try {
          const res = await window.api.tasksAiDecompose({ taskId: task.id, taskText: task.text });
          if (res && res.success && Array.isArray(res.steps) && res.steps.length > 0) {
            generatedSubtasks = res.steps;
          }
        } catch (ipcErr) {
          console.warn('[useAiDecomposition] IPC error, falling back to local template:', ipcErr);
        }
      }

      // Offline deterministic fallback if AI is unavailable or failed
      if (generatedSubtasks.length === 0) {
        generatedSubtasks = getFallbackSteps(task.text);
      }

      if (!task.subtasks) task.subtasks = [];

      generatedSubtasks.forEach((text, i) => {
        task.subtasks.push({
          id: 'ai-sub-' + Math.random().toString(36).substring(2, 9),
          text: text.startsWith('[') ? text : `[AI Step ${i + 1}] ${text}`,
          completed: false
        });
      });

      task.aiDecomposed = true;
      // Task 1.4-tasks diff-sync contract: saveTasks() performs a two-pass upsert/diff sync
      // persisting updated subtasks without deleting or recreating unmodified tasks.
      saveTasks();
      settingsStore.triggerSyncToast(
        settingsStore.language === 'EN' ? '✦ AI auto-decomposition complete' : '✦ ИИ декомпозиция задачи завершена',
        () => {}
      );
    } catch (err) {
      console.error('[useAiDecomposition] Unexpected error during task decomposition:', err);
    } finally {
      decomposingTaskId.value = null;
    }
  };

  return {
    decomposingTaskId,
    decomposeTaskWithAI
  };
}
