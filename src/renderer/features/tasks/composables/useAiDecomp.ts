import { ref, Ref } from 'vue';
import type {
  SubTask,
  Task,
  TaskDecompositionFallbackReason,
  TaskDecompositionSource
} from '../types';
import { useSettingsStore } from '../../settings/stores/settings.store';

export const LOCAL_TEMPLATE_PREFIX = '[Локальный шаблон — ИИ офлайн]';

export type TaskDecomposeActionStatus =
  | 'applied_llm'
  | 'applied_template'
  | 'upgraded_to_llm'
  | 'kept_existing_template'
  | 'skipped_already_decomposed'
  | 'busy'
  | 'not_found';

export interface TaskDecomposeActionResult {
  status: TaskDecomposeActionStatus;
  source: TaskDecompositionSource | null;
  fallbackReason?: TaskDecompositionFallbackReason;
  stepsAdded: number;
}

export function isLocalTemplateSubtask(sub: SubTask): boolean {
  if (sub.source === 'local_template') return true;
  if (sub.source === 'llm') return false;
  return typeof sub.text === 'string' && sub.text.startsWith(LOCAL_TEMPLATE_PREFIX);
}

export function isLlmSubtask(sub: SubTask): boolean {
  if (sub.source === 'llm') return true;
  if (sub.source === 'local_template') return false;
  return typeof sub.text === 'string' && /^\[AI Step \d+\]/.test(sub.text);
}

export function getTaskDecompositionSource(task: Task | null | undefined): TaskDecompositionSource | null {
  if (!task) return null;
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  if (subtasks.some(isLlmSubtask)) return 'llm';
  if (subtasks.some(isLocalTemplateSubtask)) return 'local_template';
  if (task.aiDecomposed && subtasks.length > 0) return 'llm';
  return null;
}

export function formatFallbackReasonLabel(
  reason: TaskDecompositionFallbackReason | undefined,
  lang: string
): string {
  const isEn = lang === 'EN';
  switch (reason) {
    case 'llm_timeout':
      return isEn ? 'AI timed out' : 'ИИ не ответил вовремя';
    case 'llm_invalid_response':
    case 'llm_empty_steps':
      return isEn ? 'invalid model response' : 'некорректный ответ модели';
    case 'ipc_unavailable':
    case 'ipc_error':
    case 'ipc_invalid_response':
      return isEn ? 'AI bridge unavailable' : 'канал ИИ недоступен';
    case 'empty_task_text':
      return isEn ? 'empty task text' : 'пустой текст задачи';
    case 'llm_error':
    default:
      return isEn ? 'AI offline' : 'ИИ офлайн';
  }
}

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

  return rawSteps.map(step => `${LOCAL_TEMPLATE_PREFIX} ${step}`);
}

export function useAiDecomposition(tasks: Ref<Task[]>, saveTasks: () => void) {
  const settingsStore = useSettingsStore();
  const decomposingTaskId = ref<string | null>(null);

  const decomposeTaskWithAI = async (taskId: string): Promise<TaskDecomposeActionResult> => {
    const task = tasks.value.find(t => t.id === taskId);
    if (!task) {
      return { status: 'not_found', source: null, stepsAdded: 0 };
    }
    if (decomposingTaskId.value) {
      return { status: 'busy', source: null, stepsAdded: 0 };
    }

    const existingSource = getTaskDecompositionSource(task);
    const isEn = settingsStore.language === 'EN';

    // Do not duplicate steps when task is already decomposed by LLM
    if (existingSource === 'llm') {
      settingsStore.triggerSyncToast(
        isEn ? 'Task already decomposed by AI (LLM)' : 'Задача уже декомпозирована через ИИ (LLM)',
        () => {},
        false,
        { hideAction: true }
      );
      return { status: 'skipped_already_decomposed', source: 'llm', stepsAdded: 0 };
    }

    decomposingTaskId.value = taskId;

    try {
      let generatedSubtasks: string[] = [];
      let source: TaskDecompositionSource = 'local_template';
      let fallbackReason: TaskDecompositionFallbackReason | undefined;

      // Attempt real AI decomposition via IPC
      if (typeof window !== 'undefined' && window.api?.tasksAiDecompose) {
        try {
          const res = await window.api.tasksAiDecompose({ taskId: task.id, taskText: task.text });
          if (res && res.success && Array.isArray(res.steps) && res.steps.length > 0) {
            generatedSubtasks = res.steps;
            source =
              res.source === 'llm' || res.source === 'local_template'
                ? res.source
                : res.steps.some(s => typeof s === 'string' && s.startsWith(LOCAL_TEMPLATE_PREFIX))
                  ? 'local_template'
                  : 'llm';
            fallbackReason = res.fallbackReason;
          } else {
            source = 'local_template';
            fallbackReason = res?.fallbackReason ?? 'ipc_invalid_response';
          }
        } catch (ipcErr) {
          console.warn('[useAiDecomposition] IPC error, falling back to local template:', ipcErr);
          source = 'local_template';
          fallbackReason = 'ipc_error';
        }
      } else {
        source = 'local_template';
        fallbackReason = 'ipc_unavailable';
      }

      if (!task.subtasks) task.subtasks = [];

      // Retry after local template: if LLM is still unavailable, keep existing steps without duplicating
      if (existingSource === 'local_template' && source === 'local_template') {
        const reasonLabel = formatFallbackReasonLabel(fallbackReason, settingsStore.language);
        settingsStore.triggerSyncToast(
          isEn
            ? `AI still unavailable (${reasonLabel}) — local template kept`
            : `ИИ всё ещё недоступен (${reasonLabel}) — локальный шаблон сохранён`,
          () => {
            void decomposeTaskWithAI(task.id);
          },
          true,
          {
            variant: 'warn',
            actionLabel: isEn ? 'Retry AI' : 'Повторить ИИ'
          }
        );
        return {
          status: 'kept_existing_template',
          source: 'local_template',
          fallbackReason,
          stepsAdded: 0
        };
      }

      // Offline deterministic fallback if AI is unavailable or failed on first attempt
      if (source === 'local_template' && generatedSubtasks.length === 0) {
        generatedSubtasks = getFallbackSteps(task.text);
      }

      // Upgrade from local template -> real LLM: replace only previous template steps, preserve manual subtasks
      const isUpgrade = existingSource === 'local_template' && source === 'llm';
      if (isUpgrade) {
        task.subtasks = task.subtasks.filter(sub => !isLocalTemplateSubtask(sub));
      }

      generatedSubtasks.forEach((rawText, i) => {
        const text =
          source === 'local_template'
            ? (rawText.startsWith(LOCAL_TEMPLATE_PREFIX) ? rawText : `${LOCAL_TEMPLATE_PREFIX} ${rawText}`)
            : (rawText.startsWith('[') ? rawText : `[AI Step ${i + 1}] ${rawText}`);

        task.subtasks.push({
          id: 'ai-sub-' + Math.random().toString(36).substring(2, 9),
          text,
          completed: false,
          source
        });
      });

      task.aiDecomposed = true;
      // Task 1.4-tasks diff-sync contract: saveTasks() performs a two-pass upsert/diff sync
      // persisting updated subtasks without deleting or recreating unmodified tasks.
      saveTasks();

      if (source === 'llm') {
        settingsStore.triggerSyncToast(
          isUpgrade
            ? (isEn ? '✦ Local template replaced by AI (LLM)' : '✦ Локальный шаблон заменён шагами ИИ (LLM)')
            : (isEn ? '✦ AI auto-decomposition complete (LLM)' : '✦ ИИ декомпозиция задачи завершена (LLM)'),
          () => {},
          false,
          { variant: 'synced', hideAction: true }
        );
        return {
          status: isUpgrade ? 'upgraded_to_llm' : 'applied_llm',
          source: 'llm',
          stepsAdded: generatedSubtasks.length
        };
      }

      const reasonLabel = formatFallbackReasonLabel(fallbackReason, settingsStore.language);
      settingsStore.triggerSyncToast(
        isEn
          ? `AI offline (${reasonLabel}) — local template applied`
          : `ИИ недоступен (${reasonLabel}) — применён локальный шаблон`,
        () => {
          void decomposeTaskWithAI(task.id);
        },
        true,
        {
          variant: 'warn',
          actionLabel: isEn ? 'Retry AI' : 'Повторить ИИ'
        }
      );

      return {
        status: 'applied_template',
        source: 'local_template',
        fallbackReason,
        stepsAdded: generatedSubtasks.length
      };
    } catch (err) {
      console.error('[useAiDecomposition] Unexpected error during task decomposition:', err);
      return {
        status: 'kept_existing_template',
        source: getTaskDecompositionSource(task),
        stepsAdded: 0
      };
    } finally {
      decomposingTaskId.value = null;
    }
  };

  return {
    decomposingTaskId,
    decomposeTaskWithAI
  };
}

