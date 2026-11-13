import type { ExecutionStep, FileAttachment } from '../../../../shared/types/models/chat';
import { COMPOSER_MODE_STORAGE_KEY, type ComposerMode, type EffortLevel } from '../composables/useComposerModels';
import { resolveAutoWorkflow, type WorkflowStrategy } from '../../../../shared/utils/auto-workflow';

export type ResolvedDirectiveStrategy = WorkflowStrategy;

export interface DirectiveResolution {
  configuredMode: ComposerMode;
  strategy: ResolvedDirectiveStrategy;
  complexityScore: number;
  routeCause: string;
  statusLabel: string;
  promptPrefix: string;
}

export function getSavedComposerMode(): ComposerMode {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(COMPOSER_MODE_STORAGE_KEY) as ComposerMode | null;
      if (saved === 'Auto' || saved === 'Plan' || saved === 'Ask' || saved === 'Build') {
        return saved;
      }
    }
  } catch {
    // ignore storage access errors
  }
  return 'Auto';
}

export function resolveDirectiveStrategy(
  text: string,
  attachments?: FileAttachment[],
  explicitMode?: ComposerMode,
  effort: EffortLevel = 'Auto',
  modelKey?: string,
  providerName?: string,
  isLocal?: boolean
): DirectiveResolution {
  const configuredMode = explicitMode || getSavedComposerMode();
  const fileCount = attachments?.length || 0;
  const resolved = resolveAutoWorkflow(text || '', configuredMode, effort, fileCount, modelKey, providerName, isLocal);
  return {
    configuredMode: resolved.configuredMode,
    strategy: resolved.strategy,
    complexityScore: resolved.complexityScore,
    routeCause: resolved.routeCause,
    statusLabel: resolved.statusLabel,
    promptPrefix: resolved.promptPrefix,
  };
}

export function buildFileAttachmentPrompt(text: string, attachments?: FileAttachment[]): string {
  const baseText = text || '';
  if (!attachments || attachments.length === 0) return baseText;
  const resolution = resolveDirectiveStrategy(text, attachments);

  const fileDescriptions = attachments
    .map((f) => {
      if (f.content) {
        return `--- ФАЙЛ: ${f.name} (${f.size} B) ---\n${f.content}\n--- КОНЕЦ ФАЙЛА ---`;
      }
      return `[Файл: ${f.name}, размер: ${f.size} B, тип: ${f.type || 'данные'}]`;
    })
    .join('\n\n');

  if (baseText.trim()) {
    return `${resolution.promptPrefix}${baseText}\n\n[Прикрепленные файлы]:\n${fileDescriptions}`;
  }
  return `${resolution.promptPrefix}[Проанализируй прикрепленные файлы]:\n${fileDescriptions}`;
}

export function createInitialExecutionSteps(text?: string, attachments?: FileAttachment[]): ExecutionStep[] {
  const resolution = resolveDirectiveStrategy(text || '', attachments);

  if (resolution.strategy === 'Sequential') {
    return [
      {
        id: 'step-plan',
        description: 'Auto [1/2 Plan]: Декомпозиция тяжёлой задачи и построение плана',
        status: 'running',
        executor: 'A.R.C. Auto Planner',
      },
      {
        id: 'step-exec',
        description: 'Auto [2/2 Build]: Последовательная сборка и реализация',
        status: 'pending',
        executor: 'A.R.C. Auto Builder',
      },
    ];
  }

  if (resolution.strategy === 'Ask') {
    return [
      {
        id: 'step-plan',
        description:
          resolution.configuredMode === 'Auto'
            ? 'Auto → Ask: Быстрый анализ вопроса'
            : 'Ask: Анализ вопроса и контекста',
        status: 'running',
        executor: 'A.R.C. Ask Engine',
      },
    ];
  }

  if (resolution.strategy === 'Build') {
    return [
      {
        id: 'step-plan',
        description:
          resolution.configuredMode === 'Auto'
            ? 'Auto → Build: Прямое выполнение лёгкой задачи'
            : 'Build: Прямая сборка решения',
        status: 'running',
        executor: 'A.R.C. Direct Builder',
      },
    ];
  }

  return [
    {
      id: 'step-plan',
      description: 'Plan: Архитектурное планирование и декомпозиция директивы',
      status: 'running',
      executor: 'Planner',
    },
  ];
}

export function createValidatorStep(_latencyMs: number = 15): ExecutionStep {
  return {
    id: 'step-val',
    description: 'Валидация точности и форматирования',
    status: 'success',
    executor: 'Validator',
  };
}

export function getGratitudeResponse(lang: string = 'RU'): string {
  const responses =
    lang === 'EN'
      ? ['Glad to help.', 'Always glad to assist.', 'Anytime.', 'You are welcome.']
      : ['Рад помочь.', 'Пожалуйста.', 'Всегда рад.', 'Обращайтесь.', 'На связи.'];
  return responses[Math.floor(Math.random() * responses.length)];
}

export function createGratitudeAssistantMessage(lang: string = 'RU'): { reply: string; message: any } {
  const reply = getGratitudeResponse(lang);
  const message = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    blockType: 'final_answer',
    timestamp: Date.now(),
    content: reply,
    meta: { provider: 'Локальный ответ', latency: 15, isCache: false, source: 'local' },
  };
  return { reply, message };
}

let ttsMetaSubscribed = false;
const pendingByQueryId = new Map<string, { engine: 'silero' | 'edge' | 'sapi'; isCached: boolean; timestamp: number }>();
let pendingTtsMeta: { engine: 'silero' | 'edge' | 'sapi'; isCached: boolean; timestamp: number } | null = null;

export function ensureTtsMetaSubscription(
  storeOrGetter: { messages: any[]; updateMessageTtsMeta?: (data: any) => boolean } | (() => any[])
) {
  if (ttsMetaSubscribed || typeof window === 'undefined' || !window.api || typeof window.api.onTtsMeta !== 'function') return;
  ttsMetaSubscribed = true;
  window.api.onTtsMeta((data) => {
    if (!data || !data.engine) return;
    if (typeof storeOrGetter === 'object' && typeof storeOrGetter.updateMessageTtsMeta === 'function') {
      const updated = storeOrGetter.updateMessageTtsMeta(data);
      if (updated) {
        if (data.queryId) pendingByQueryId.delete(data.queryId);
        pendingTtsMeta = null;
        return;
      }
    } else if (typeof storeOrGetter === 'function') {
      const messages = storeOrGetter();
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if ((msg.role === 'assistant' || msg.role === 'system') && (!data.queryId || msg.id === data.queryId || msg.meta?.reqId === data.queryId)) {
          msg.meta = {
            ...(msg.meta || { source: 'system' }),
            ttsEngine: data.engine,
            ttsCached: Boolean(data.isCached),
          };
          pendingTtsMeta = null;
          return;
        }
      }
    }
    const entry = { engine: data.engine, isCached: Boolean(data.isCached), timestamp: Date.now() };
    if (data.queryId) {
      pendingByQueryId.set(data.queryId, entry);
    }
    pendingTtsMeta = entry;
  });
}

export function consumePendingTtsMeta(reqId?: string): { reqId?: string; ttsEngine?: 'silero' | 'edge' | 'sapi'; ttsCached?: boolean } {
  const base = reqId ? { reqId } : {};
  if (reqId && pendingByQueryId.has(reqId)) {
    const entry = pendingByQueryId.get(reqId)!;
    pendingByQueryId.delete(reqId);
    if (pendingTtsMeta === entry) pendingTtsMeta = null;
    if (Date.now() - entry.timestamp < 30000) {
      return { ...base, ttsEngine: entry.engine, ttsCached: entry.isCached };
    }
  }
  if (pendingTtsMeta && Date.now() - pendingTtsMeta.timestamp < 15000) {
    const res = { ...base, ttsEngine: pendingTtsMeta.engine, ttsCached: pendingTtsMeta.isCached };
    pendingTtsMeta = null;
    return res;
  }
  pendingTtsMeta = null;
  return base;
}


