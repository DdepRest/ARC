export type SubsystemTone = 'ok' | 'warn' | 'err' | 'off' | 'accent' | 'default';

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
}

export interface SttStatusResult {
  headerLabel: string;
  headerTone: 'ok' | 'warn' | 'err' | 'off' | 'accent' | 'default';
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
    input.sttProvider === 'sherpa'
      ? 'Sherpa ONNX (Локальный)'
      : input.sttProvider === 'whisper'
      ? 'OpenAI Whisper'
      : input.sttProvider === 'native'
      ? 'Native Web Speech'
      : 'Не выбран';

  const providerDetail =
    input.sttProvider === 'sherpa'
      ? `Контур: ${input.sttEngine === 'gigaam' ? 'GigaAM CTC' : 'Legacy'}`
      : input.sttProvider === 'whisper'
      ? (input.isElectronAvailable ? 'IPC Sherpa Fallback в Desktop' : 'Локальный Web Worker')
      : input.sttProvider === 'native'
      ? 'Системный / Web API'
      : 'Выберите провайдер';

  if (!input.sttProvider) {
    return {
      headerLabel: 'НЕ ВЫБРАН',
      headerTone: 'off',
      badgeLabel: 'НЕ ВЫБРАН',
      badgeTone: 'off',
      readinessLabel: 'Не выбран',
      readinessDetail: 'Провайдер STT не задан',
      readinessTone: 'off',
      providerDisplay,
      providerDetail
    };
  }

  if (input.loadingProgress !== null && input.loadingProgress !== undefined) {
    return {
      headerLabel: `ПРОВЕРКА · ${input.loadingProgress}%`,
      headerTone: 'warn',
      badgeLabel: `Инициализация · ${input.loadingProgress}%`,
      badgeTone: 'warn',
      readinessLabel: `Проверка (${input.loadingProgress}%)`,
      readinessDetail: 'Загрузка весов нейросети',
      readinessTone: 'warn',
      providerDisplay,
      providerDetail
    };
  }

  if (input.lastError) {
    return {
      headerLabel: 'ОШИБКА STT',
      headerTone: 'err',
      badgeLabel: 'Ошибка контура',
      badgeTone: 'err',
      readinessLabel: 'Ошибка',
      readinessDetail: input.lastError,
      readinessTone: 'err',
      providerDisplay,
      providerDetail
    };
  }

  if (input.sttProvider === 'sherpa') {
    if (input.sttEngineReady) {
      const engineTag = (input.activeEngineName || input.sttEngine || 'gigaam').toUpperCase();
      return {
        headerLabel: `ГОТОВ · ${engineTag}`,
        headerTone: 'ok',
        badgeLabel: `Готов (${engineTag})`,
        badgeTone: 'ok',
        readinessLabel: `Готов (${engineTag})`,
        readinessDetail: 'Подтверждено воркером IPC',
        readinessTone: 'ok',
        providerDisplay,
        providerDetail
      };
    }

    if (!input.isElectronAvailable) {
      return {
        headerLabel: 'НЕИЗВЕСТНО · БЕЗ IPC',
        headerTone: 'off',
        badgeLabel: 'Нет IPC-канала',
        badgeTone: 'off',
        readinessLabel: 'Неизвестно',
        readinessDetail: 'Локальный воркер недоступен в браузере',
        readinessTone: 'off',
        providerDisplay,
        providerDetail
      };
    }

    if (input.sttStatusChecking) {
      return {
        headerLabel: 'ПРОВЕРКА STT...',
        headerTone: 'warn',
        badgeLabel: 'Проверка статуса...',
        badgeTone: 'warn',
        readinessLabel: 'Проверка...',
        readinessDetail: 'Запрос состояния воркера',
        readinessTone: 'warn',
        providerDisplay,
        providerDetail
      };
    }

    return {
      headerLabel: 'ВЫБРАН · НЕ ПРОВЕРЕН',
      headerTone: 'warn',
      badgeLabel: input.sttStatusChecked ? 'Ожидание запуска' : 'Выбран · не проверен',
      badgeTone: 'warn',
      readinessLabel: input.sttStatusChecked ? 'Не запущен' : 'Не проверен',
      readinessDetail: 'Готовность не подтверждена воркером',
      readinessTone: 'warn',
      providerDisplay,
      providerDetail
    };
  }

  // Whisper or Native Web Speech: config choice never guarantees runtime readiness
  return {
    headerLabel: 'ВЫБРАН · НЕ ПРОВЕРЕН',
    headerTone: 'warn',
    badgeLabel: 'Выбран · не проверен',
    badgeTone: 'warn',
    readinessLabel: 'Выбран · не проверен',
    readinessDetail: input.isElectronAvailable && input.sttProvider === 'whisper'
      ? 'Desktop перенаправляет в Sherpa IPC'
      : 'Проверка при запуске распознавания',
    readinessTone: 'warn',
    providerDisplay,
    providerDetail
  };
}

export type TtsEngineKind = 'silero' | 'edge' | 'system';
export type TtsServerStatusKind = 'unknown' | 'checking' | 'online' | 'offline';

export interface TtsStatusInput {
  configuredProvider: 'auto' | 'silero' | 'edge' | 'native' | string;
  sileroServerStatus: TtsServerStatusKind;
  confirmedActiveEngine: TtsEngineKind | null;
  isElectronAvailable: boolean;
}

export interface TtsStatusResult {
  headerLabel: string;
  headerTone: 'ok' | 'warn' | 'err' | 'off' | 'accent' | 'default';
  configuredDisplay: string;
  serverStatusLabel: string;
  serverStatusTone: SubsystemTone;
  activeEngineLabel: string;
  activeEngineDetail: string;
  activeEngineTone: SubsystemTone;
}

export function formatTtsEngineName(engine: string | null | undefined): string {
  if (!engine) return 'Не подтверждён';
  const map: Record<string, string> = {
    silero: 'Silero',
    edge: 'Edge TTS',
    system: 'Native SAPI'
  };
  return map[engine] ?? engine;
}

export function formatTtsProviderSetting(provider: string): string {
  switch (provider) {
    case 'auto':
      return 'Auto';
    case 'silero':
      return 'Silero v5.6';
    case 'edge':
      return 'Edge TTS';
    case 'native':
      return 'Native SAPI';
    default:
      return provider ? provider.toUpperCase() : 'Не выбран';
  }
}

export function computeTtsSubsystemStatus(input: TtsStatusInput): TtsStatusResult {
  const configuredDisplay = formatTtsProviderSetting(input.configuredProvider);

  const serverStatusLabel =
    !input.isElectronAvailable
      ? 'IPC недоступен'
      : input.sileroServerStatus === 'online'
      ? 'Сервер Silero: Онлайн'
      : input.sileroServerStatus === 'offline'
      ? 'Сервер Silero: Офлайн'
      : input.sileroServerStatus === 'checking'
      ? 'Сервер Silero: Проверка...'
      : 'Сервер Silero: Не проверен';

  const serverStatusTone: SubsystemTone =
    !input.isElectronAvailable
      ? 'off'
      : input.sileroServerStatus === 'online'
      ? 'ok'
      : input.sileroServerStatus === 'offline'
      ? 'err'
      : 'warn';

  if (input.confirmedActiveEngine) {
    const engineName = formatTtsEngineName(input.confirmedActiveEngine);
    return {
      headerLabel: `АКТИВЕН: ${engineName.toUpperCase()}`,
      headerTone: 'ok',
      configuredDisplay,
      serverStatusLabel,
      serverStatusTone,
      activeEngineLabel: engineName,
      activeEngineDetail: `Подтверждено бэкендом (${configuredDisplay})`,
      activeEngineTone: 'ok'
    };
  }

  if (!input.isElectronAvailable) {
    return {
      headerLabel: 'НЕИЗВЕСТНО · БЕЗ IPC',
      headerTone: 'off',
      configuredDisplay,
      serverStatusLabel,
      serverStatusTone,
      activeEngineLabel: 'Не подтверждён',
      activeEngineDetail: 'IPC-канал недоступен в браузере',
      activeEngineTone: 'off'
    };
  }

  const expectsSilero = input.configuredProvider === 'auto' || input.configuredProvider === 'silero';

  if (expectsSilero && input.sileroServerStatus === 'online') {
    return {
      headerLabel: 'СЕРВЕР ОНЛАЙН · ОЖИДАНИЕ',
      headerTone: 'warn',
      configuredDisplay,
      serverStatusLabel,
      serverStatusTone,
      activeEngineLabel: 'Ожидание синтеза',
      activeEngineDetail: 'Silero онлайн, синтез не подтверждался',
      activeEngineTone: 'warn'
    };
  }

  if (expectsSilero && input.sileroServerStatus === 'offline') {
    return {
      headerLabel: input.configuredProvider === 'auto' ? 'SILERO ОФЛАЙН · АВТО-РЕЗЕРВ' : 'СЕРВЕР SILERO ОФЛАЙН',
      headerTone: input.configuredProvider === 'silero' ? 'err' : 'warn',
      configuredDisplay,
      serverStatusLabel,
      serverStatusTone,
      activeEngineLabel: 'Не подтверждён',
      activeEngineDetail:
        input.configuredProvider === 'auto'
          ? 'При синтезе сработает Edge / SAPI'
          : 'Фоновый сервер Silero недоступен',
      activeEngineTone: input.configuredProvider === 'silero' ? 'err' : 'warn'
    };
  }

  return {
    headerLabel: 'ВЫБРАН · НЕ ПРОВЕРЕН',
    headerTone: 'warn',
    configuredDisplay,
    serverStatusLabel,
    serverStatusTone,
    activeEngineLabel: 'Не подтверждён',
    activeEngineDetail: 'Движок активируется при первом синтезе',
    activeEngineTone: 'warn'
  };
}
