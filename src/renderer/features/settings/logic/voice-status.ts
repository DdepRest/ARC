import type { VoiceModelSetupState, ResourceReadinessLayer } from '../../../../shared/utils/voice-model-state-machine';
import {
  formatTtsEngineName,
  formatTtsProviderSetting,
  computeDictionariesStatus,
  computeDependenciesStatus,
  type SubsystemTone,
  type TtsEngineKind,
  type TtsServerStatusKind,
  type TtsPronunciationState,
  type TtsDictionariesDiag,
  type TtsDependenciesDiag
} from './tts-status.helper';

export {
  formatTtsEngineName,
  formatTtsProviderSetting,
  computeDictionariesStatus,
  computeDependenciesStatus,
  type SubsystemTone,
  type TtsEngineKind,
  type TtsServerStatusKind,
  type TtsPronunciationState,
  type TtsDictionariesDiag,
  type TtsDependenciesDiag
};

export interface SttStatusInput {
  sttProvider: 'sherpa' | 'whisper' | 'native' | string;
  sttEngine: 'gigaam' | 'legacy' | string;
  sttModel: string;
  isElectronAvailable: boolean;
  sttStatusChecked: boolean;
  sttStatusChecking: boolean;
  sttEngineReady: boolean;
  activeEngineName: string;
  loadingProgress: number | null;
  lastError?: string | null;
  modelsInstalled?: boolean | null;
  missingReason?: string | null;
  setupState?: VoiceModelSetupState | null;
}

export interface SttStatusResult {
  setupState: VoiceModelSetupState;
  readinessLayer: ResourceReadinessLayer;
  headerLabel: string;
  headerTone: SubsystemTone;
  badgeLabel: string;
  badgeTone: SubsystemTone;
  readinessLabel: string;
  readinessDetail: string;
  readinessTone: SubsystemTone;
  providerDisplay: string;
  providerDetail: string;
}

export function computeSttSubsystemStatus(input: SttStatusInput): SttStatusResult {
  const providerDisplay =
    input.sttProvider === 'sherpa' ? 'Sherpa ONNX (Локальный)'
      : input.sttProvider === 'whisper' ? 'OpenAI Whisper'
      : input.sttProvider === 'native' ? 'Native Web Speech'
      : 'Не выбран';

  const providerDetail =
    input.sttProvider === 'sherpa' ? `Контур: ${input.sttEngine === 'gigaam' ? 'GigaAM CTC' : 'Legacy'}`
      : input.sttProvider === 'whisper' ? (input.isElectronAvailable ? 'IPC Sherpa Fallback в Desktop' : 'Локальный Web Worker')
      : input.sttProvider === 'native' ? 'Системный / Web API'
      : 'Выберите провайдер';

  if (!input.sttProvider) {
    return {
      setupState: 'unknown', readinessLayer: 'none', headerLabel: 'НЕ ВЫБРАН', headerTone: 'off',
      badgeLabel: 'НЕ ВЫБРАН', badgeTone: 'off', readinessLabel: 'Не выбран',
      readinessDetail: 'Провайдер STT не задан', readinessTone: 'off', providerDisplay, providerDetail
    };
  }

  if (input.loadingProgress !== null && input.loadingProgress !== undefined) {
    return {
      setupState: 'checking', readinessLayer: 'none', headerLabel: `ПРОВЕРКА · ${input.loadingProgress}%`, headerTone: 'warn',
      badgeLabel: `Инициализация · ${input.loadingProgress}%`, badgeTone: 'warn', readinessLabel: `Проверка (${input.loadingProgress}%)`,
      readinessDetail: 'Загрузка весов нейросети', readinessTone: 'warn', providerDisplay, providerDetail
    };
  }

  const isMissingResource =
    !input.sttEngineReady &&
    (input.modelsInstalled === false || input.setupState === 'missing' || input.setupState === 'consent_required');

  if (isMissingResource && input.sttProvider === 'sherpa') {
    const needsConsent = input.setupState === 'consent_required';
    return {
      setupState: needsConsent ? 'consent_required' : 'missing', readinessLayer: 'none',
      headerLabel: needsConsent ? 'ТРЕБУЕТСЯ УСТАНОВКА' : 'МОДЕЛИ НЕ СКАЧАНЫ', headerTone: 'warn',
      badgeLabel: needsConsent ? 'Требуется установка' : 'Не скачано', badgeTone: 'warn',
      readinessLabel: 'Не скачано',
      readinessDetail: input.missingReason || 'Локальные веса STT не установлены — настройте контур в разделе «Модели»',
      readinessTone: 'warn', providerDisplay, providerDetail
    };
  }

  if (input.lastError) {
    return {
      setupState: 'failed', readinessLayer: 'none', headerLabel: 'ОШИБКА STT', headerTone: 'err',
      badgeLabel: 'Ошибка контура', badgeTone: 'err', readinessLabel: 'Ошибка',
      readinessDetail: input.lastError, readinessTone: 'err', providerDisplay, providerDetail
    };
  }

  if (input.sttProvider === 'sherpa') {
    if (input.sttEngineReady) {
      const engineTag = (input.activeEngineName || input.sttEngine || 'gigaam').toUpperCase();
      return {
        setupState: 'ready', readinessLayer: 'active', headerLabel: `ГОТОВ · ${engineTag}`, headerTone: 'ok',
        badgeLabel: `Готов (${engineTag})`, badgeTone: 'ok', readinessLabel: `Готов (${engineTag})`,
        readinessDetail: 'Подтверждено воркером IPC', readinessTone: 'ok', providerDisplay, providerDetail
      };
    }

    if (!input.isElectronAvailable) {
      return {
        setupState: 'unknown', readinessLayer: 'none', headerLabel: 'НЕИЗВЕСТНО · БЕЗ IPC', headerTone: 'off',
        badgeLabel: 'Нет IPC-канала', badgeTone: 'off', readinessLabel: 'Неизвестно',
        readinessDetail: 'Локальный воркер недоступен в браузере', readinessTone: 'off', providerDisplay, providerDetail
      };
    }

    if (input.sttStatusChecking) {
      return {
        setupState: 'checking', readinessLayer: 'none', headerLabel: 'ПРОВЕРКА STT...', headerTone: 'warn',
        badgeLabel: 'Проверка статуса...', badgeTone: 'warn', readinessLabel: 'Проверка...',
        readinessDetail: 'Запрос состояния воркера', readinessTone: 'warn', providerDisplay, providerDetail
      };
    }

    return {
      setupState: input.modelsInstalled ? 'ready' : 'unknown',
      readinessLayer: input.modelsInstalled ? 'verified' : 'none',
      headerLabel: 'ВЫБРАН · НЕ ПРОВЕРЕН', headerTone: 'warn',
      badgeLabel: input.sttStatusChecked ? 'Ожидание запуска' : 'Выбран · не проверен', badgeTone: 'warn',
      readinessLabel: input.sttStatusChecked ? 'Не запущен' : 'Не проверен',
      readinessDetail: 'Готовность не подтверждена воркером', readinessTone: 'warn', providerDisplay, providerDetail
    };
  }

  return {
    setupState: 'unknown', readinessLayer: 'none', headerLabel: 'ВЫБРАН · НЕ ПРОВЕРЕН', headerTone: 'warn',
    badgeLabel: 'Выбран · не проверен', badgeTone: 'warn', readinessLabel: 'Выбран · не проверен',
    readinessDetail: input.isElectronAvailable && input.sttProvider === 'whisper'
      ? 'Desktop перенаправляет в Sherpa IPC'
      : 'Проверка при запуске распознавания',
    readinessTone: 'warn', providerDisplay, providerDetail
  };
}

export interface TtsStatusInput {
  configuredProvider: 'auto' | 'silero' | 'edge' | 'native' | string;
  sileroServerStatus: TtsServerStatusKind;
  confirmedActiveEngine: TtsEngineKind | null;
  isElectronAvailable: boolean;
  allowCloudTtsFallback?: boolean;
  forcedOfflineMode?: boolean;
  lastErrorReason?: string | null;
  dictionariesDiag?: TtsDictionariesDiag | null;
  dependenciesDiag?: TtsDependenciesDiag | null;
  sileroModelInstalled?: boolean | null;
  voiceSetupState?: VoiceModelSetupState | null;
}

export interface TtsStatusResult {
  setupState: VoiceModelSetupState;
  readinessLayer: ResourceReadinessLayer;
  headerLabel: string;
  headerTone: SubsystemTone;
  configuredDisplay: string;
  serverStatusLabel: string;
  serverStatusTone: SubsystemTone;
  activeEngineLabel: string;
  activeEngineDetail: string;
  activeEngineTone: SubsystemTone;
  dictionariesLabel: string;
  dictionariesTone: SubsystemTone;
  dictionariesDetail: string;
  dependenciesLabel: string;
  dependenciesTone: SubsystemTone;
  dependenciesDetail: string;
}

export function computeTtsSubsystemStatus(input: TtsStatusInput): TtsStatusResult {
  const configuredDisplay = formatTtsProviderSetting(input.configuredProvider);
  const dicts = computeDictionariesStatus(input.dictionariesDiag, input.isElectronAvailable);
  const deps = computeDependenciesStatus(input.dependenciesDiag, input.isElectronAvailable);
  const dictFields = {
    dictionariesLabel: dicts.label, dictionariesTone: dicts.tone, dictionariesDetail: dicts.detail,
    dependenciesLabel: deps.label, dependenciesTone: deps.tone, dependenciesDetail: deps.detail
  };

  const expectsSilero = input.configuredProvider === 'auto' || input.configuredProvider === 'silero';
  const missingSileroOnDisk = expectsSilero && input.sileroModelInstalled === false && input.sileroServerStatus === 'offline';

  const serverStatusLabel = !input.isElectronAvailable ? 'IPC недоступен'
    : input.sileroServerStatus === 'online' ? 'Сервер Silero: Онлайн'
    : missingSileroOnDisk ? 'Silero TTS: Не установлен'
    : input.sileroServerStatus === 'offline' ? 'Сервер Silero: Офлайн'
    : input.sileroServerStatus === 'checking' ? 'Сервер Silero: Проверка...'
    : 'Сервер Silero: Не проверен';

  const serverStatusTone: SubsystemTone = !input.isElectronAvailable ? 'off'
    : input.sileroServerStatus === 'online' ? 'ok'
    : missingSileroOnDisk ? 'warn'
    : input.sileroServerStatus === 'offline' ? 'err'
    : 'warn';

  const base = { configuredDisplay, serverStatusLabel, serverStatusTone, ...dictFields };
  const cloudAllowed = Boolean(input.allowCloudTtsFallback && !input.forcedOfflineMode);

  if (input.confirmedActiveEngine === 'unavailable') {
    return {
      ...base, setupState: 'unavailable', readinessLayer: 'none', headerLabel: 'TTS НЕДОСТУПЕН', headerTone: 'err',
      activeEngineLabel: 'Недоступен',
      activeEngineDetail: input.lastErrorReason || (cloudAllowed ? 'Все движки синтеза недоступны' : 'Локальные движки недоступны · облачный резерв отключён'),
      activeEngineTone: 'err'
    };
  }

  if (input.confirmedActiveEngine) {
    const engineName = formatTtsEngineName(input.confirmedActiveEngine);
    const modeTag = input.confirmedActiveEngine === 'edge'
      ? 'Облачный синтез (Microsoft Edge) · текст отправляется внешнему провайдеру'
      : `Локальный синтез (${configuredDisplay})`;
    return {
      ...base, setupState: 'ready', readinessLayer: 'active', headerLabel: `АКТИВЕН: ${engineName.toUpperCase()}`, headerTone: 'ok',
      activeEngineLabel: engineName, activeEngineDetail: modeTag, activeEngineTone: 'ok'
    };
  }

  if (!input.isElectronAvailable) {
    return { ...base, setupState: 'unknown', readinessLayer: 'none', headerLabel: 'НЕИЗВЕСТНО · БЕЗ IPC', headerTone: 'off', activeEngineLabel: 'Не подтверждён', activeEngineDetail: 'IPC-канал недоступен в браузере', activeEngineTone: 'off' };
  }

  if (input.configuredProvider === 'edge' && input.forcedOfflineMode) {
    return { ...base, setupState: 'degraded', readinessLayer: 'none', headerLabel: 'ОБЛАКО ЗАБЛОКИРОВАНО · SAPI', headerTone: 'warn', activeEngineLabel: 'Локальный резерв (SAPI)', activeEngineDetail: 'Edge TTS отключён принудительным офлайн-режимом', activeEngineTone: 'warn' };
  }

  if (missingSileroOnDisk) {
    const st: VoiceModelSetupState = input.voiceSetupState === 'consent_required' ? 'consent_required' : 'missing';
    return {
      ...base, setupState: st, readinessLayer: 'none',
      headerLabel: st === 'consent_required' ? 'ТРЕБУЕТСЯ УСТАНОВКА' : 'SILERO НЕ УСТАНОВЛЕН', headerTone: 'warn',
      activeEngineLabel: input.configuredProvider === 'auto' ? 'Системный резерв (SAPI)' : 'Не скачан',
      activeEngineDetail: input.configuredProvider === 'auto'
        ? 'Модель Silero v5.6 не установлена · при синтезе используется резерв'
        : 'Модель Silero v5.6 не установлена · скачайте в мастере или разделе моделей',
      activeEngineTone: 'warn'
    };
  }

  if (expectsSilero && input.sileroServerStatus === 'online') {
    return { ...base, setupState: 'ready', readinessLayer: 'loaded', headerLabel: 'СЕРВЕР ОНЛАЙН · ОЖИДАНИЕ', headerTone: 'warn', activeEngineLabel: 'Ожидание синтеза', activeEngineDetail: 'Silero онлайн, синтез не подтверждался', activeEngineTone: 'warn' };
  }

  if (expectsSilero && input.sileroServerStatus === 'offline') {
    const fallbackNote = input.forcedOfflineMode
      ? 'Офлайн-режим · при синтезе сработает только SAPI'
      : cloudAllowed ? 'При синтезе сработает Edge (облако) / SAPI' : 'Облачный резерв отключён · при синтезе сработает только SAPI';
    return {
      ...base,
      setupState: input.configuredProvider === 'silero' ? 'unavailable' : 'degraded',
      readinessLayer: input.sileroModelInstalled ? 'verified' : 'none',
      headerLabel: input.configuredProvider === 'auto' ? 'SILERO ОФЛАЙН · АВТО-РЕЗЕРВ' : 'СЕРВЕР SILERO ОФЛАЙН',
      headerTone: input.configuredProvider === 'silero' ? 'err' : 'warn',
      activeEngineLabel: 'Не подтверждён',
      activeEngineDetail: input.configuredProvider === 'auto' ? fallbackNote : (cloudAllowed ? 'Фоновый сервер Silero недоступен · резерв Edge / SAPI' : 'Фоновый сервер Silero недоступен · резерв только SAPI'),
      activeEngineTone: input.configuredProvider === 'silero' ? 'err' : 'warn'
    };
  }

  return {
    ...base,
    setupState: input.sileroServerStatus === 'checking' ? 'checking' : 'unknown',
    readinessLayer: 'none',
    headerLabel: 'ВЫБРАН · НЕ ПРОВЕРЕН', headerTone: 'warn',
    activeEngineLabel: 'Не подтверждён', activeEngineDetail: 'Движок активируется при первом синтезе', activeEngineTone: 'warn'
  };
}
