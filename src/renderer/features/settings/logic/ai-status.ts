import type { AIProvider, ProviderTestState } from '../../../stores/aiConfig';
import type { DiskCheckStatus } from '../composables/useModelHubSession';
import type { VerifiedLocalInference } from '../composables/useLocalAIEngine';
import { validateProviderEndpoint } from './provider-validation';

export type StatusTone = 'ok' | 'warn' | 'err' | 'off';

export interface SubsystemStatusSummary {
  label: string;
  tone: StatusTone;
  detail: string;
}

export interface AiStatusSnapshot {
  forcedOfflineMode: boolean;
  useLocalLLM: boolean;
  useSmartRouting: boolean;
  localLLMPriority: 'primary' | 'fallback';
  localLLMModel: string;
  builtinLLMModel: string;
  providers: AIProvider[];
  getProviderTestState: (p: AIProvider) => ProviderTestState | null;
  isBuiltinDownloaded: boolean;
  builtinCheckError?: string | null;
  checkingBuiltin?: boolean;
  hasProbedBuiltin?: boolean;
  isOllamaOnline: boolean;
  checkingOllama?: boolean;
  hasProbedOllama?: boolean;
  verifiedInference: VerifiedLocalInference | null;
  diskCheckStatus: DiskCheckStatus;
  installedQuantsCount: number;
  hasActiveDownload: boolean;
}

export function isProviderConfigured(p: AIProvider): boolean {
  if (!p.enabled) return false;
  if (!validateProviderEndpoint(p.endpoint).valid) return false;
  if (p.type !== 'local' && !p.noAuthHeader && !(p.apiKey && p.apiKey.trim().length > 0)) {
    return false;
  }
  return true;
}

export function getLocalContourStatus(
  ctx: Pick<
    AiStatusSnapshot,
    | 'useLocalLLM'
    | 'localLLMModel'
    | 'builtinLLMModel'
    | 'isBuiltinDownloaded'
    | 'builtinCheckError'
    | 'checkingBuiltin'
    | 'hasProbedBuiltin'
    | 'isOllamaOnline'
    | 'checkingOllama'
    | 'hasProbedOllama'
    | 'verifiedInference'
  >
): SubsystemStatusSummary {
  if (!ctx.useLocalLLM) {
    return { label: 'ВЫКЛЮЧЕН', tone: 'off', detail: 'Локальный контур выключен' };
  }

  if (ctx.localLLMModel === 'builtin') {
    if (ctx.checkingBuiltin) {
      return { label: 'ПРОВЕРКА...', tone: 'warn', detail: 'Проверка весов GGUF' };
    }
    if (
      ctx.isBuiltinDownloaded &&
      !ctx.builtinCheckError &&
      ctx.verifiedInference?.engine === 'builtin' &&
      ctx.verifiedInference?.model === ctx.builtinLLMModel
    ) {
      return { label: 'ПРОВЕРЕН (GGUF)', tone: 'ok', detail: 'Инференс подтверждён' };
    }
    if (ctx.isBuiltinDownloaded && !ctx.builtinCheckError) {
      return { label: 'ВЕСА ГОТОВЫ', tone: 'warn', detail: 'Веса на диске, тест не выполнен' };
    }
    if (ctx.hasProbedBuiltin === false) {
      return {
        label: 'ВКЛЮЧЕН В КОНФИГУРАЦИИ',
        tone: 'warn',
        detail: 'Активен флаг конфигурации; наличие весов GGUF не проверялось'
      };
    }
    return {
      label: 'НЕТ ВЕСОВ',
      tone: 'err',
      detail: ctx.builtinCheckError ? `Ошибка проверки GGUF: ${ctx.builtinCheckError}` : 'Модель не скачана'
    };
  }

  if (ctx.checkingOllama) {
    return { label: 'ПРОВЕРКА...', tone: 'warn', detail: 'Опрос сервера Ollama' };
  }
  if (
    ctx.isOllamaOnline &&
    ctx.verifiedInference?.engine === 'ollama' &&
    ctx.verifiedInference?.model === ctx.localLLMModel
  ) {
    return { label: 'ПРОВЕРЕН (OLLAMA)', tone: 'ok', detail: 'Инференс подтверждён' };
  }
  if (ctx.isOllamaOnline) {
    return { label: 'СЕРВЕР ОНЛАЙН', tone: 'warn', detail: 'Модель не тестировалась' };
  }
  if (ctx.hasProbedOllama === false) {
    return {
      label: 'ВКЛЮЧЕН В КОНФИГУРАЦИИ',
      tone: 'warn',
      detail: 'Активен флаг конфигурации; доступность Ollama не проверялась'
    };
  }
  return { label: 'OLLAMA ОФЛАЙН', tone: 'err', detail: 'Сервер недоступен' };
}

export function getFallbackContourStatus(ctx: Pick<
  AiStatusSnapshot,
  | 'forcedOfflineMode'
  | 'useLocalLLM'
  | 'useSmartRouting'
  | 'localLLMPriority'
  | 'localLLMModel'
  | 'builtinLLMModel'
  | 'providers'
  | 'getProviderTestState'
  | 'isBuiltinDownloaded'
  | 'builtinCheckError'
  | 'hasProbedBuiltin'
  | 'isOllamaOnline'
  | 'hasProbedOllama'
  | 'verifiedInference'
>): SubsystemStatusSummary {
  if (ctx.forcedOfflineMode) {
    return {
      label: 'ИЗОЛЯЦИЯ (БЕЗ РЕЗЕРВА)',
      tone: 'warn',
      detail: 'Облачный резерв заблокирован принудительным офлайн-режимом'
    };
  }

  // Primary route = Local -> backup = Cloud providers
  if (ctx.useLocalLLM && ctx.localLLMPriority === 'primary' && !ctx.useSmartRouting) {
    const configuredCloud = ctx.providers.filter(isProviderConfigured);
    const verifiedCloud = configuredCloud.filter(
      (p) => ctx.getProviderTestState(p)?.status === 'success'
    );
    if (verifiedCloud.length > 0) {
      return {
        label: 'РЕЗЕРВ ПОДТВЕРЖДЁН',
        tone: 'ok',
        detail: `Облачный резерв проверен (${verifiedCloud[0].name})`
      };
    }
    if (configuredCloud.length > 0) {
      return {
        label: 'РЕЗЕРВ НАСТРОЕН (НЕ ПРОВЕРЕН)',
        tone: 'warn',
        detail: 'Облачный шлюз настроен, но тест соединения не выполнялся'
      };
    }
    return {
      label: 'РЕЗЕРВ НЕ ГОТОВ',
      tone: 'err',
      detail: 'Нет настроенных облачных провайдеров для резервного переключения'
    };
  }

  // Primary route = Cloud or Smart Routing -> backup = Local engine
  if (!ctx.useLocalLLM) {
    return {
      label: 'РЕЗЕРВ ОТКЛЮЧЁН',
      tone: 'off',
      detail: 'Локальный контур выключен; отказ облака не перехватывается локально'
    };
  }

  if (ctx.localLLMModel === 'builtin') {
    const isVerified =
      ctx.isBuiltinDownloaded &&
      !ctx.builtinCheckError &&
      ctx.verifiedInference?.engine === 'builtin' &&
      ctx.verifiedInference?.model === ctx.builtinLLMModel;
    if (isVerified) {
      return {
        label: 'РЕЗЕРВ ПОДТВЕРЖДЁН',
        tone: 'ok',
        detail: `Встроенная модель ${ctx.builtinLLMModel} проверена в сессии`
      };
    }
    if (ctx.isBuiltinDownloaded && !ctx.builtinCheckError) {
      return {
        label: 'РЕЗЕРВ НАСТРОЕН (НЕ ПРОВЕРЕН)',
        tone: 'warn',
        detail: 'Веса GGUF на диске; тест инференса ещё не запускался'
      };
    }
    if (ctx.hasProbedBuiltin === false) {
      return {
        label: 'ВКЛЮЧЕН В КОНФИГУРАЦИИ',
        tone: 'warn',
        detail: 'Локальный GGUF-резерв включён в конфигурации; веса ещё не проверялись'
      };
    }
    return {
      label: 'РЕЗЕРВ НЕ ГОТОВ',
      tone: 'err',
      detail: ctx.builtinCheckError
        ? `Ошибка проверки GGUF: ${ctx.builtinCheckError}`
        : 'Локальный GGUF-резерв выбран, но веса модели не скачаны'
    };
  }

  const isOllamaVerified =
    ctx.verifiedInference?.engine === 'ollama' &&
    ctx.verifiedInference?.model === ctx.localLLMModel;
  if (isOllamaVerified && ctx.isOllamaOnline) {
    return {
      label: 'РЕЗЕРВ ПОДТВЕРЖДЁН',
      tone: 'ok',
      detail: `Ollama (${ctx.localLLMModel}) проверен в текущей сессии`
    };
  }
  if (ctx.isOllamaOnline) {
    return {
      label: 'СЕРВЕР ДОСТУПЕН (НЕ ПРОВЕРЕН)',
      tone: 'warn',
      detail: 'Сервер Ollama в сети, но инференс выбранной модели не тестировался'
    };
  }
  if (ctx.hasProbedOllama === false) {
    return {
      label: 'ВКЛЮЧЕН В КОНФИГУРАЦИИ',
      tone: 'warn',
      detail: 'Резерв Ollama включён в конфигурации; доступность сервера ещё не проверялась'
    };
  }
  return {
    label: 'РЕЗЕРВ НЕ ГОТОВ',
    tone: 'err',
    detail: 'Сервер Ollama недоступен на порту 11434'
  };
}

export function computeAiSectionStatuses(
  ctx: AiStatusSnapshot
): Record<'section-router' | 'section-providers' | 'section-local' | 'section-models', SubsystemStatusSummary> {
  // 1. Router
  const fallback = getFallbackContourStatus(ctx);
  const routerStatus: SubsystemStatusSummary = ctx.forcedOfflineMode && !ctx.useLocalLLM
    ? { label: 'КОНФЛИКТ ОФЛАЙН', tone: 'err', detail: 'Офлайн-режим без локального ИИ' }
    : fallback;

  // 2. Providers
  const enabled = ctx.providers.filter((p) => p.enabled);
  const configured = enabled.filter(isProviderConfigured);
  const verified = configured.filter((p) => ctx.getProviderTestState(p)?.status === 'success');
  let providersStatus: SubsystemStatusSummary;
  if (ctx.providers.length === 0) {
    providersStatus = { label: 'НЕТ ШЛЮЗОВ', tone: 'warn', detail: 'Провайдеры не добавлены' };
  } else if (verified.length > 0) {
    providersStatus = { label: `ПРОВЕРЕНО: ${verified.length}`, tone: 'ok', detail: 'Есть проверенный шлюз' };
  } else if (configured.length > 0) {
    providersStatus = { label: 'НЕ ПРОВЕРЕНО', tone: 'warn', detail: 'Шлюз настроен, тест не выполнен' };
  } else if (enabled.length > 0) {
    providersStatus = { label: 'НУЖНА НАСТРОЙКА', tone: 'warn', detail: 'Отсутствует ключ или URL' };
  } else {
    providersStatus = { label: 'ОТКЛЮЧЕНО', tone: 'off', detail: 'Все шлюзы выключены' };
  }

  // 3. Local AI (SSOT)
  const localContour = getLocalContourStatus(ctx);
  const localStatus: SubsystemStatusSummary = !ctx.useLocalLLM
    ? { label: 'ОТКЛЮЧЕН', tone: 'off', detail: 'Локальный контур выключен' }
    : localContour;

  // 4. Models Hub
  let modelsStatus: SubsystemStatusSummary;
  if (ctx.hasActiveDownload) {
    modelsStatus = { label: 'ЗАГРУЗКА...', tone: 'warn', detail: 'Идёт скачивание модели' };
  } else if (ctx.diskCheckStatus === 'CHECKING') {
    modelsStatus = { label: 'ПРОВЕРКА ДИСКА', tone: 'warn', detail: 'Сканирование каталога' };
  } else if (ctx.diskCheckStatus === 'ERROR') {
    modelsStatus = { label: 'ОШИБКА ДИСКА', tone: 'err', detail: 'Сбой чтения каталога' };
  } else if (ctx.diskCheckStatus === 'UNAVAILABLE') {
    modelsStatus = { label: 'IPC НЕДОСТУПЕН', tone: 'warn', detail: 'Предпросмотр без диска' };
  } else if (ctx.diskCheckStatus === 'SYNCED') {
    modelsStatus = {
      label: `НА ДИСКЕ: ${ctx.installedQuantsCount}`,
      tone: 'ok',
      detail: 'Каталог синхронизирован'
    };
  } else {
    modelsStatus = { label: 'НЕ ПРОВЕРЕНО', tone: 'off', detail: 'Проверка не запускалась' };
  }

  return {
    'section-router': routerStatus,
    'section-providers': providersStatus,
    'section-local': localStatus,
    'section-models': modelsStatus
  };
}
