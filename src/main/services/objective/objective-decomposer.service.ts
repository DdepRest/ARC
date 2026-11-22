import { aiService } from '../ai.service';
import {
  extractJsonFromText,
  validateDecompositionPayload,
  normalizeString,
  type DecompositionDraft,
  type DecomposedOutcomeItem,
  type DecomposedDecisionItem,
  type DecomposedTaskItem,
  type DecomposedRiskItem
} from './decomposition-validator';
import type {
  TaskDecompositionFallbackReason,
  TaskDecompositionResult
} from '../../../shared/types/models/task';

const SYSTEM_DECOMPOSITION_PROMPT = `Ты — системный аналитик автономного ядра A.R.C. Твоя задача: декомпозировать цель оператора на проверяемые результаты (outcomes, 1..5), решения с действиями (decisions, 1..5), операционные задачи (tasks, 1..7) и системные риски (risks, 1..5).

Выходной формат: ТОЛЬКО валидный JSON без markdown-обёрток и пояснений, строго следующей структуры:
{
  "outcomes": [
    {
      "title": "Краткое название проверяемого результата (3..160 символов)",
      "metric_name": "имя_метрики",
      "metric_source": { "type": "CLI_OUTPUT", "target_uri": "npm run lint" },
      "baseline_value": 0,
      "target_value": 1
    }
  ],
  "decisions": [
    {
      "title": "Принимаемое архитектурное решение (3..160 символов)",
      "rationale": "Обоснование решения (5..500 символов)",
      "action": { "type": "CLI_CMD", "target": "system", "cmd": "npm test" }
    }
  ],
  "tasks": [
    {
      "text": "Формулировка операционной задачи (3..200 символов)",
      "estimatedMinutes": 30,
      "priority": "medium"
    }
  ],
  "risks": [
    {
      "description": "Описание системного риска (3..200 символов)",
      "likelihood": 0.3,
      "impact": 0.5
    }
  ]
}`;

export class ObjectiveDecomposerService {
  private static instance: ObjectiveDecomposerService;

  public static getInstance(): ObjectiveDecomposerService {
    if (!ObjectiveDecomposerService.instance) {
      ObjectiveDecomposerService.instance = new ObjectiveDecomposerService();
    }
    return ObjectiveDecomposerService.instance;
  }

  /**
   * Generates a deterministic offline fallback draft when AI is offline or failed.
   */
  public generateFallbackDraft(objectiveId: string, objectiveTitle: string, taskDesc?: string): DecompositionDraft {
    const cleanDesc = (taskDesc || objectiveTitle || 'Оптимизация подсистемы').slice(0, 60);

    const outcomes: DecomposedOutcomeItem[] = [
      {
        title: `[Локальный шаблон — ИИ офлайн] Достичь базовой траектории: ${cleanDesc}`,
        metric_name: 'system_baseline_delta',
        metric_source: { type: 'CLI_OUTPUT', target_uri: 'npm run lint' },
        baseline_value: 0,
        target_value: 1
      }
    ];

    const decisions: DecomposedDecisionItem[] = [
      {
        title: `[Локальный шаблон — ИИ офлайн] Согласовать контур выполнения: ${objectiveTitle.slice(0, 50)}`,
        rationale: 'Автоматический fallback при отсутствии связи с моделями ИИ. Верификация окружения и компиляции.',
        action: { type: 'CLI_CMD', target: 'system', cmd: 'npm run build' }
      }
    ];

    const tasks: DecomposedTaskItem[] = [
      {
        text: `[Локальный шаблон — ИИ офлайн] Провести диагностику модулей: ${cleanDesc}`,
        estimatedMinutes: 30,
        priority: 'medium'
      },
      {
        text: `[Локальный шаблон — ИИ офлайн] Верифицировать результат тестами`,
        estimatedMinutes: 20,
        priority: 'high'
      }
    ];

    const risks: DecomposedRiskItem[] = [
      {
        description: '[Локальный шаблон — ИИ офлайн] Отклонение окружения или недоступность провайдера моделей',
        likelihood: 0.35,
        impact: 0.5
      }
    ];

    return {
      objectiveId,
      source: 'fallback',
      outcomes,
      decisions,
      tasks,
      risks,
      rawPromptText: taskDesc,
      createdAt: Date.now()
    };
  }

  private async requestLlmText(prompt: string, context: any[] = []): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let fullResponse = '';
      const timer = setTimeout(() => {
        reject(new Error('LLM decomposition request timed out (15s)'));
      }, 15000);

      aiService.request(
        prompt,
        context,
        (chunk: string, done: boolean) => {
          fullResponse += chunk;
          if (done) {
            clearTimeout(timer);
            resolve(fullResponse);
          }
        },
        (err: Error) => {
          clearTimeout(timer);
          reject(err);
        }
      ).catch((err: any) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Generates a validated decomposition draft for a given objective.
   */
  public async generateDraft(
    objectiveId: string,
    objectiveTitle: string,
    taskDescriptionText?: string
  ): Promise<DecompositionDraft> {
    const prompt = `Цель: "${objectiveTitle}"\nКонтекст / описание: "${taskDescriptionText || ''}"\n\nСформируй декомпозицию строго в формате JSON.`;
    const context = [{ role: 'system', content: SYSTEM_DECOMPOSITION_PROMPT }];

    try {
      let rawText = await this.requestLlmText(prompt, context);
      let parsed = null;
      let valResult = null;

      try {
        parsed = extractJsonFromText(rawText);
        valResult = validateDecompositionPayload(parsed);
      } catch (e: any) {
        valResult = { valid: false, errors: [e.message] };
      }

      // Single retry if JSON parsing or schema validation failed
      if (!valResult.valid || !valResult.data) {
        console.warn('[ObjectiveDecomposer] First attempt invalid:', valResult.errors, 'Retrying...');
        const retryPrompt = `Предыдущий ответ содержал ошибки: ${valResult.errors.join('; ')}.\nВерни ТОЛЬКО валидный JSON без markdown-разметки:`;
        const retryContext = [
          ...context,
          { role: 'user', content: prompt },
          { role: 'assistant', content: rawText },
          { role: 'user', content: retryPrompt }
        ];

        rawText = await this.requestLlmText(retryPrompt, retryContext);
        parsed = extractJsonFromText(rawText);
        valResult = validateDecompositionPayload(parsed);
      }

      if (valResult.valid && valResult.data) {
        return {
          objectiveId,
          source: 'ai',
          outcomes: valResult.data.outcomes,
          decisions: valResult.data.decisions,
          tasks: valResult.data.tasks,
          risks: valResult.data.risks,
          rawPromptText: taskDescriptionText,
          createdAt: Date.now()
        };
      }

      throw new Error(`Validation failed after retry: ${valResult.errors.join(', ')}`);
    } catch (err) {
      console.warn('[ObjectiveDecomposer] AI decomposition failed or unavailable, using fallback template:', err);
      return this.generateFallbackDraft(objectiveId, objectiveTitle, taskDescriptionText);
    }
  }

  /**
   * Decomposes a single task into actionable subtasks (steps) with explicit source attribution.
   */
  public async decomposeTask(taskText: string): Promise<TaskDecompositionResult> {
    const cleanText = (taskText || '').trim();
    if (!cleanText) {
      return {
        steps: [],
        source: 'local_template',
        fallbackReason: 'empty_task_text'
      };
    }

    const prompt = `Декомпозируй задачу оператора на 3-5 конкретных подшагов. Задача: "${cleanText}"\nВерни ТОЛЬКО JSON массив строк: ["Шаг 1", "Шаг 2", "Шаг 3"]`;
    const context = [{ role: 'system', content: 'Ты помощник по декомпозиции задач. Отвечай ТОЛЬКО JSON-массивом строк без пояснений.' }];

    let fallbackReason: TaskDecompositionFallbackReason = 'llm_error';

    try {
      const raw = await this.requestLlmText(prompt, context);
      try {
        const parsed = extractJsonFromText(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const steps: string[] = [];
          for (const item of parsed) {
            const s = typeof item === 'string' ? item.trim() : String(item?.text || '').trim();
            if (s.length >= 3) {
              steps.push(s.slice(0, 150));
            }
          }
          if (steps.length > 0) {
            return {
              steps: steps.slice(0, 7),
              source: 'llm'
            };
          }
          fallbackReason = 'llm_empty_steps';
        } else {
          fallbackReason = 'llm_invalid_response';
        }
      } catch (parseErr) {
        console.warn('[ObjectiveDecomposer] Task AI decomp response invalid, using offline fallback:', parseErr);
        fallbackReason = 'llm_invalid_response';
      }
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      fallbackReason = msg.includes('timed out') || msg.includes('timeout') ? 'llm_timeout' : 'llm_error';
      console.warn('[ObjectiveDecomposer] Task AI decomp failed, using offline fallback:', err);
    }

    // Offline deterministic fallback by category
    const lower = cleanText.toLowerCase();
    let templateSteps: string[] = [];
    if (lower.includes('код') || lower.includes('dev') || lower.includes('разработ') || lower.includes('фич') || lower.includes('компонент')) {
      templateSteps = [
        'Спроектировать интерфейсы и типы данных',
        'Реализовать основную логику модуля',
        'Провести модульное тестирование и линтинг',
        'Проверить обработку краевых случаев',
        'Обновить документацию и зафиксировать версию'
      ];
    } else if (lower.includes('безопасн') || lower.includes('sec') || lower.includes('аудит') || lower.includes('доступ')) {
      templateSteps = [
        'Сканирование уязвимостей и точек входа',
        'Проверка валидации токенов и прав доступа',
        'Аудит правил безопасности конфигурации',
        'Фиксация протокола безопасности в журнале'
      ];
    } else if (lower.includes('оптимиз') || lower.includes('скорост') || lower.includes('памят') || lower.includes('производительн')) {
      templateSteps = [
        'Профилирование узких мест и замеров времени отклика',
        'Кеширование повторных вычислений и запросов',
        'Оптимизация критических путей выполнения',
        'Сравнение показателей до и после оптимизации'
      ];
    } else {
      templateSteps = [
        'Анализ требований и подготовка рабочего контекста',
        'Выполнение ключевого этапа операции',
        'Проверка результатов на соответствие стандарту A.R.C.',
        'Фиксация завершения шага'
      ];
    }

    return {
      steps: templateSteps.map(step => `[Локальный шаблон — ИИ офлайн] ${step}`),
      source: 'local_template',
      fallbackReason
    };
  }
}

export const objectiveDecomposerService = ObjectiveDecomposerService.getInstance();
