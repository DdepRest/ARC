export type ComposerMode = 'Auto' | 'Plan' | 'Ask' | 'Build';
export type ConcreteEffortLevel = 'Low' | 'Medium' | 'High' | 'Max';
export type EffortLevel = 'Auto' | ConcreteEffortLevel;
export type WorkflowStrategy = 'Ask' | 'Build' | 'Plan' | 'Sequential';

export interface ModelThinkingCapability {
  efforts: EffortLevel[];
  defaultEffort: EffortLevel;
  maxKnownEffort: ConcreteEffortLevel | null;
  isThinkingCapKnown: boolean;
  supportsNativeReasoning: boolean;
  capabilityLabel: string;
}

export interface EffectiveEffortResolution {
  configuredEffort: EffortLevel;
  effectiveEffort: ConcreteEffortLevel;
  isAutoResolved: boolean;
  maxTokens: number;
  analyticalScore: number;
  reasoningEffortParam?: 'low' | 'medium' | 'high';
  thinkingLabel: string;
}

export interface AutoWorkflowResolution {
  configuredMode: ComposerMode;
  strategy: WorkflowStrategy;
  complexityScore: number;
  configuredEffort: EffortLevel;
  effectiveEffort: ConcreteEffortLevel;
  thinkingLabel: string;
  maxTokens: number;
  analyticalScore: number;
  routeCause: string;
  statusLabel: string;
  promptPrefix: string;
  systemDirective: string;
}

export const EFFORT_TOKEN_BUDGET: Record<ConcreteEffortLevel, number> = {
  Low: 1024,
  Medium: 2048,
  High: 4096,
  Max: 8192,
};

export const EFFORT_ANALYTICAL_SCORE: Record<ConcreteEffortLevel, number> = {
  Low: 45,
  Medium: 65,
  High: 85,
  Max: 100,
};

const EFFORT_RANK: Record<ConcreteEffortLevel, number> = { Low: 1, Medium: 2, High: 3, Max: 4 };

const HEAVY_TASK_PATTERNS =
  /(архитектур|спроектир|рефактор|оптимизир|пошагов|последовательн|комплексн|миграц|интегрир|систему|модул|аудит|перепиш|разработай|директив|пайплайн|оркестрац|pipeline|architecture|refactor|full|@codebase|@architecture)/i;

const BUILD_ACTION_PATTERNS =
  /(напиш|создай|сделай|добавь|исправь|почини|реализуй|код|функци|компонент|скрипт|кнопк|стил|верстк|генерир|настрой|собер|write|create|build|fix|implement|add|update)/i;

const QUESTION_PATTERNS =
  /(\?$|^(что|как|почему|зачем|где|кто|когда|какой|какие|сколько|объясни|расскажи|подскажи|в чем|можно ли|проверь|покажи|what|how|why|where|when|explain|tell)\b)/i;

const NATIVE_REASONING_MODEL_PATTERNS =
  /(deepseek-r1|deepseek-reasoner|qwq|o1\b|o3\b|o4-mini|qwen3|claude-3-7|claude-3\.7|claude-sonnet-4|claude-opus-4|gemini-2\.5|thinking|r1-distill)/i;

const COMPACT_SMALL_MODEL_PATTERNS =
  /(\b0\.5b\b|\b1b\b|\b1\.5b\b|\b1\.8b\b|\b2b\b|qwen2\.5-0\.5b|qwen2\.5-1\.5b|qwen1\.5-0\.5b|qwen3\.5-2b|tiny|nano|mini-1b)/i;

const STANDARD_KNOWN_MODEL_PATTERNS =
  /(\b2\.6b\b|\b3b\b|\b4b\b|\b7b\b|\b8b\b|\b9b\b|\b14b\b|\b32b\b|\b70b\b|lfm2\.5|qwen2\.5|llama|mistral|gemma|gpt-4o|claude-3-5|claude-3\.5|deepseek-chat|deepseek-v3|phi-3|phi-4)/i;

export function inferModelThinkingCapabilities(
  modelKey: string,
  providerName?: string,
  isLocal?: boolean
): ModelThinkingCapability {
  const key = (modelKey || '').trim().toLowerCase();
  const prov = (providerName || '').trim().toLowerCase();

  if (!key || key === 'auto' || key === 'default' || key === 'openrouter/auto' || key === 'free') {
    return {
      efforts: ['Auto'],
      defaultEffort: 'Auto',
      maxKnownEffort: null,
      isThinkingCapKnown: false,
      supportsNativeReasoning: false,
      capabilityLabel: 'Auto (A.R.C. сам определяет глубину)',
    };
  }
  if (NATIVE_REASONING_MODEL_PATTERNS.test(key)) {
    return {
      efforts: ['Auto', 'Low', 'Medium', 'High', 'Max'],
      defaultEffort: 'Auto',
      maxKnownEffort: 'Max',
      isThinkingCapKnown: true,
      supportsNativeReasoning: true,
      capabilityLabel: 'Deep Reasoning (до Max)',
    };
  }
  if (COMPACT_SMALL_MODEL_PATTERNS.test(key)) {
    return {
      efforts: ['Auto', 'Low', 'Medium'],
      defaultEffort: 'Auto',
      maxKnownEffort: 'Medium',
      isThinkingCapKnown: true,
      supportsNativeReasoning: false,
      capabilityLabel: 'Компактное ядро (до Medium)',
    };
  }
  if (STANDARD_KNOWN_MODEL_PATTERNS.test(key)) {
    return {
      efforts: ['Auto', 'Low', 'Medium', 'High'],
      defaultEffort: 'Auto',
      maxKnownEffort: 'High',
      isThinkingCapKnown: true,
      supportsNativeReasoning: false,
      capabilityLabel: isLocal ? 'Локальный контур (до High)' : 'Стандартный контур (до High)',
    };
  }
  return {
    efforts: ['Auto'],
    defaultEffort: 'Auto',
    maxKnownEffort: null,
    isThinkingCapKnown: false,
    supportsNativeReasoning: prov.includes('deepseek') || prov.includes('openai'),
    capabilityLabel: 'Auto (потолок определяется A.R.C.)',
  };
}

function clampToMaxEffort(target: ConcreteEffortLevel, maxCap: ConcreteEffortLevel | null): ConcreteEffortLevel {
  if (!maxCap) return target;
  return EFFORT_RANK[target] > EFFORT_RANK[maxCap] ? maxCap : target;
}

export function resolveEffectiveEffort(
  configuredEffort: EffortLevel = 'Auto',
  complexityScore: number = 30,
  modelKey: string = '',
  providerName?: string,
  isLocal?: boolean
): EffectiveEffortResolution {
  const cap = inferModelThinkingCapabilities(modelKey, providerName, isLocal);
  const isAutoResolved = configuredEffort === 'Auto' || !cap.isThinkingCapKnown;
  let effectiveEffort: ConcreteEffortLevel;

  if (isAutoResolved) {
    const rawAuto: ConcreteEffortLevel =
      complexityScore < 22
        ? 'Low'
        : complexityScore < 50
          ? 'Medium'
          : complexityScore < 78
            ? 'High'
            : cap.supportsNativeReasoning
              ? 'Max'
              : 'High';
    effectiveEffort = clampToMaxEffort(rawAuto, cap.maxKnownEffort);
  } else {
    effectiveEffort = clampToMaxEffort(configuredEffort as ConcreteEffortLevel, cap.maxKnownEffort);
  }

  const reasoningEffortParam: 'low' | 'medium' | 'high' | undefined = cap.supportsNativeReasoning
    ? effectiveEffort === 'Low'
      ? 'low'
      : effectiveEffort === 'Medium'
        ? 'medium'
        : 'high'
    : undefined;

  return {
    configuredEffort: cap.isThinkingCapKnown ? configuredEffort : 'Auto',
    effectiveEffort,
    isAutoResolved,
    maxTokens: EFFORT_TOKEN_BUDGET[effectiveEffort],
    analyticalScore: EFFORT_ANALYTICAL_SCORE[effectiveEffort],
    reasoningEffortParam,
    thinkingLabel: isAutoResolved ? `Auto→${effectiveEffort}` : effectiveEffort,
  };
}

export function stripModePrefix(rawText: string): string {
  return (rawText || '').replace(/^\[Режим[^\]]*\]\s*/i, '').trim();
}

export function computeInputComplexity(text: string, attachmentCount: number = 0): number {
  const clean = stripModePrefix(text);
  let score = Math.min(45, Math.floor(clean.length / 4));
  const lines = clean.split('\n').filter((l) => l.trim().length > 0).length;
  if (lines >= 3) score += 25;
  if (attachmentCount > 0) score += attachmentCount * 20;
  if (HEAVY_TASK_PATTERNS.test(clean)) score += 40;
  if (BUILD_ACTION_PATTERNS.test(clean)) score += 15;
  if (/@(codebase|architecture|memory|docs|files|terminal)/i.test(clean)) score += 20;
  return Math.min(100, score);
}

export function resolveAutoWorkflow(
  rawText: string,
  mode: ComposerMode = 'Auto',
  effort: EffortLevel = 'Auto',
  attachmentCount: number = 0,
  modelKey: string = '',
  providerName?: string,
  isLocal?: boolean
): AutoWorkflowResolution {
  const clean = stripModePrefix(rawText);
  const complexityScore = computeInputComplexity(clean, attachmentCount);
  const effortRes = resolveEffectiveEffort(effort, complexityScore, modelKey, providerName, isLocal);
  const effortHint = ` [Мышление: ${effortRes.thinkingLabel}]`;

  const depthDirective =
    effortRes.effectiveEffort === 'Max'
      ? 'ГЛУБИНА МЫШЛЕНИЯ: MAX. Проведи глубокую многошаговую верификацию, проверь краевые случаи и архитектурные инварианты.'
      : effortRes.effectiveEffort === 'High'
        ? 'ГЛУБИНА МЫШЛЕНИЯ: HIGH. Тщательно структурируй решение и проверь ключевые зависимости.'
        : effortRes.effectiveEffort === 'Medium'
          ? 'ГЛУБИНА МЫШЛЕНИЯ: MEDIUM. Сбалансируй скорость и полноту ответа.'
          : 'ГЛУБИНА МЫШЛЕНИЯ: LOW. Отвечай максимально лаконично и быстро без избыточных рассуждений.';

  const base = {
    complexityScore,
    configuredEffort: effortRes.configuredEffort,
    effectiveEffort: effortRes.effectiveEffort,
    thinkingLabel: effortRes.thinkingLabel,
    maxTokens: effortRes.maxTokens,
    analyticalScore: effortRes.analyticalScore,
  };

  if (mode === 'Plan') {
    return {
      ...base,
      configuredMode: 'Plan',
      strategy: 'Plan',
      routeCause: `Режим Plan${effortHint}`,
      statusLabel: `Режим Plan (${effortRes.thinkingLabel}): Построение архитектурного плана...`,
      promptPrefix: `[Режим: PLAN | Мышление: ${effortRes.thinkingLabel} — сформируй четкий пошаговый план и декомпозицию задачи]\n`,
      systemDirective: `РЕЖИМ РАБОТЫ: PLAN. ${depthDirective} Сформируй структурированный архитектурный план, декомпозицию этапов и оценку рисков.`,
    };
  }
  if (mode === 'Ask') {
    return {
      ...base,
      configuredMode: 'Ask',
      strategy: 'Ask',
      routeCause: `Режим Ask${effortHint}`,
      statusLabel: `Режим Ask (${effortRes.thinkingLabel}): Быстрый аналитический ответ...`,
      promptPrefix: `[Режим: ASK | Мышление: ${effortRes.thinkingLabel} — дай точный аналитический ответ на вопрос без лишних прелюдий]\n`,
      systemDirective: `РЕЖИМ РАБОТЫ: ASK. ${depthDirective} Дай точный, лаконичный аналитический ответ на вопрос пользователя без лишних прелюдий.`,
    };
  }
  if (mode === 'Build') {
    return {
      ...base,
      configuredMode: 'Build',
      strategy: 'Build',
      routeCause: `Режим Build${effortHint}`,
      statusLabel: `Режим Build (${effortRes.thinkingLabel}): Прямая сборка и реализация решения...`,
      promptPrefix: `[Режим: BUILD | Мышление: ${effortRes.thinkingLabel} — сразу переходи к реализации и готовому решению]\n`,
      systemDirective: `РЕЖИМ РАБОТЫ: BUILD. ${depthDirective} Сразу переходи к написанию кода, конфигурации или готового практического решения.`,
    };
  }

  const isHeavyTask =
    complexityScore >= 45 ||
    HEAVY_TASK_PATTERNS.test(clean) ||
    clean.length > 150 ||
    clean.split('\n').length >= 3 ||
    attachmentCount > 1 ||
    (attachmentCount === 1 && BUILD_ACTION_PATTERNS.test(clean));

  if (isHeavyTask) {
    return {
      ...base,
      configuredMode: 'Auto',
      strategy: 'Sequential',
      routeCause: `Auto → Plan + Build (${complexityScore}%)${effortHint}`,
      statusLabel: `Auto → Plan + Build (${effortRes.thinkingLabel}): Тяжёлая задача...`,
      promptPrefix: `[Режим A.R.C. AUTO → ПОСЛЕДОВАТЕЛЬНЫЙ (PLAN → BUILD → VALIDATE) | Мышление: ${effortRes.thinkingLabel}: Задача определена как комплексная. Выполни последовательно: 1) Краткий архитектурный план; 2) Полная реализация (Build); 3) Итоговая проверка.]\n`,
      systemDirective: `РЕЖИМ РАБОТЫ: AUTO → SEQUENTIAL (PLAN → BUILD → VALIDATE). ${depthDirective} Задача классифицирована как комплексная. Выполни последовательно: 1) Архитектурный план; 2) Практическая реализация (Build); 3) Самопроверка.`,
    };
  }

  if ((QUESTION_PATTERNS.test(clean) || !BUILD_ACTION_PATTERNS.test(clean)) && !HEAVY_TASK_PATTERNS.test(clean)) {
    return {
      ...base,
      configuredMode: 'Auto',
      strategy: 'Ask',
      routeCause: `Auto → Ask (лёгкий запрос)${effortHint}`,
      statusLabel: `Auto → Ask (${effortRes.thinkingLabel}): Лёгкий вопрос...`,
      promptPrefix: `[Режим A.R.C. AUTO → ASK | Мышление: ${effortRes.thinkingLabel}: Задача определена как быстрый вопрос. Дай сразу точный и лаконичный ответ без предварительного планирования.]\n`,
      systemDirective: `РЕЖИМ РАБОТЫ: AUTO → ASK. ${depthDirective} Отвечай строго по существу реплики, лаконично и естественно, без навязчивых дежурных вопросов в конце ответа.`,
    };
  }

  return {
    ...base,
    configuredMode: 'Auto',
    strategy: 'Build',
    routeCause: `Auto → Build (прямая сборка)${effortHint}`,
    statusLabel: `Auto → Build (${effortRes.thinkingLabel}): Лёгкая задача...`,
    promptPrefix: `[Режим A.R.C. AUTO → BUILD | Мышление: ${effortRes.thinkingLabel}: Задача определена как прямое действие. Сразу выдай готовое решение/код без лишних прелюдий.]\n`,
    systemDirective: `РЕЖИМ РАБОТЫ: AUTO → BUILD. ${depthDirective} Запрос классифицирован как лёгкая практическая задача. Сразу выдай готовое решение или код без лишних этапов планирования и без навязчивых дежурных вопросов.`,
  };
}

export function synthesizeMockWorkflowChunks(
  rawText: string,
  settings?: any
): {
  routeInfo: { modelName: string; target: 'local' | 'cloud'; cause: string; workflowMode: WorkflowStrategy };
  chunks: string[];
} {
  const mode: ComposerMode = settings?.composerMode || 'Auto';
  const effort: EffortLevel = settings?.composerEffort || 'Auto';
  const attachmentCount: number = Number(settings?.attachmentCount || 0);
  const isLocal = Boolean(settings?.useLocalLLM);
  const modelKey =
    settings?.activeModelKey ||
    (isLocal ? (settings?.localLLMModel === 'builtin' ? settings?.builtinLLMModel : settings?.localLLMModel) : 'auto');
  const clean = stripModePrefix(rawText).replace(/\n\n\[Прикрепленные файлы\]:[\s\S]*$/i, '').trim();
  const resolution = resolveAutoWorkflow(clean, mode, effort, attachmentCount, modelKey, settings?.activeModelName, isLocal);

  const modelName =
    settings?.activeModelName ||
    (isLocal
      ? settings?.localLLMModel === 'builtin'
        ? settings?.builtinLLMModel || 'Qwen 2.5 (1.5B)'
        : settings?.localLLMModel || 'Llama 3.2 (Ollama)'
      : 'FreeAPILLM · Auto');

  const routeInfo = {
    modelName,
    target: (isLocal ? 'local' : 'cloud') as 'local' | 'cloud',
    cause: resolution.routeCause,
    workflowMode: resolution.strategy,
  };

  if (resolution.strategy === 'Ask') {
    const tag = resolution.configuredMode === 'Auto' ? 'Auto → Ask' : 'Ask';
    return {
      routeInfo,
      chunks: [
        `**[${tag}] Прямой аналитический ответ**\n\n`,
        `Запрос: «*${clean.slice(0, 120)}*» классифицирован как лёгкий информационный вопрос (сложность: ${resolution.complexityScore}%).\n\n`,
        `A.R.C. пропустил избыточные этапы декомпозиции и сразу сформировал ответ через подключённый узел **${modelName}** (мышление: **${resolution.thinkingLabel}**, бюджет: ${resolution.maxTokens} токенов).`,
      ],
    };
  }
  if (resolution.strategy === 'Build') {
    const tag = resolution.configuredMode === 'Auto' ? 'Auto → Build' : 'Build';
    return {
      routeInfo,
      chunks: [
        `**[${tag}] Прямая сборка решения**\n\n`,
        `Директива: «*${clean.slice(0, 120)}*» распознана как прикладная задача малой сложности (${resolution.complexityScore}%).\n\n`,
        `Выполнено прямое построение решения (Build) на проверенной модели **${modelName}** [Мышление: **${resolution.thinkingLabel}**] без промежуточного планирования.`,
      ],
    };
  }
  if (resolution.strategy === 'Plan') {
    return {
      routeInfo,
      chunks: [
        `**[Plan] Архитектурная декомпозиция директивы**\n\n`,
        `1. **Анализ входного контура**: «*${clean.slice(0, 120)}*».\n`,
        `2. **План реализации**: выделение целевых модулей, проверка инвариантов A.R.C. и пошаговая верификация (**${modelName}**, Мышление: **${resolution.thinkingLabel}**).`,
      ],
    };
  }
  return {
    routeInfo,
    chunks: [
      `**[Auto → Plan + Build] Последовательное выполнение комплексной задачи** (сложность: ${resolution.complexityScore}%)\n\n`,
      `### Этап 1 · Plan (Декомпозиция)\nЗапрос «*${clean.slice(0, 120)}*» содержит архитектурные или многошаговые требования. Сформирован контур изменений и проверены зависимости.\n\n`,
      `### Этап 2 · Build (Реализация)\nВыполнена последовательная сборка и интеграция изменений через **${modelName}** [Мышление: **${resolution.thinkingLabel}**, лимит: ${resolution.maxTokens} ток.].\n\n`,
      `### Этап 3 · Validate (Контроль)\nПроверены ограничения модульности и целостность моста IPC.`,
    ],
  };
}
