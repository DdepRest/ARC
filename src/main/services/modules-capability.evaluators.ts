import type {
  CapabilityAvailability,
  CapabilityHealth
} from '../../shared/config/modules-capability.registry';
import type { DatabaseHealthStatus } from './database-recovery.types';
import type { EcoState } from './eco.service';
import type { ProviderHealthState } from './llm/providers/provider-health';
import type { AiProvider } from './llm/providers/provider.interface';
import type { DependencyCheckResult } from './python_deps.contract';
import type { PythonBundleIntegrityReport } from '../../shared/types/model-integrity';
import type { TtsEngineState } from './tts.service';

export interface CapabilityProbeOutcome {
  availability: CapabilityAvailability;
  health: CapabilityHealth;
  reason: string | null;
}

export interface SttStatusSnapshot {
  ready: boolean;
  modelLoaded: boolean;
  engine: string;
  activeEngine: string;
  lastError: string | null;
  modelsInstalled: boolean;
  missingReason: string | null;
  setupState: string;
}

export interface CapabilityRuntimeAdapters {
  now: () => string;
  getDbStatus: () => { hasDb: boolean; status: DatabaseHealthStatus };
  getProviders: () => AiProvider[];
  getProviderHealth: (id: string) => ProviderHealthState;
  getSttStatus: () => SttStatusSnapshot;
  getTtsState: () => TtsEngineState;
  getPythonReadiness: (refresh?: boolean) => {
    deps: DependencyCheckResult | null;
    integrity: PythonBundleIntegrityReport | null;
    pythonPid: number | null;
    hasLocalModel: boolean | null;
    hasPythonExe: boolean | null;
  };
  getSkillsSummary: () => { total: number; enabled: number; loadedFromDisk: boolean };
  getMacrosSummary: () => { schedulerRunning: boolean; macrosDirAccessible: boolean; macroCount: number };
  getEcoState: () => EcoState;
  getTelemetryStatus: () => { ok: boolean; detail: string };
}

export function evaluateAiProviders(adapters: CapabilityRuntimeAdapters, isOrchestrator: boolean): CapabilityProbeOutcome {
  const providers = adapters.getProviders();
  const enabledProviders = providers.filter((p) => Boolean(p.enabled));
  if (enabledProviders.length === 0) {
    return {
      availability: 'unavailable',
      health: 'unavailable',
      reason: 'Нет включённых AI-провайдеров'
    };
  }

  const configured = enabledProviders.filter((p) => {
    if (p.type !== 'cloud' || p.noAuthHeader) return true;
    return p.apiKeyStatus === 'ok' && Boolean(p.hasApiKey);
  });

  if (configured.length === 0) {
    const hasUnreadable = enabledProviders.some((p) => p.apiKeyStatus === 'unreadable');
    return {
      availability: 'unavailable',
      health: hasUnreadable ? 'error' : 'unavailable',
      reason: hasUnreadable
        ? 'API-ключи провайдеров не удалось расшифровать'
        : 'Не настроен ни один API-ключ для включённых облачных провайдеров'
    };
  }

  const healthy: AiProvider[] = [];
  const quarantined: AiProvider[] = [];
  const cooldown: AiProvider[] = [];
  const nowMs = Date.now();

  for (const p of configured) {
    const h = adapters.getProviderHealth(p.id);
    if (h.inQuarantineUntil > nowMs) quarantined.push(p);
    else if (!h.healthy || h.inCooldownUntil > nowMs) cooldown.push(p);
    else healthy.push(p);
  }

  if (healthy.length === 0) {
    return {
      availability: 'unavailable',
      health: 'error',
      reason: `Все активные шлюзы (${configured.length}) в карантине или недоступны`
    };
  }

  if (quarantined.length > 0 || cooldown.length > 0) {
    const blocked = quarantined.length + cooldown.length;
    return {
      availability: 'degraded',
      health: 'degraded',
      reason: `Доступно шлюзов: ${healthy.length}, в карантине/паузе: ${blocked}`
    };
  }

  return {
    availability: 'available',
    health: 'ready',
    reason: isOrchestrator
      ? `Маршрутизация готова (шлюзов: ${healthy.length})`
      : `Активно AI-шлюзов: ${healthy.length}`
  };
}

export function evaluateDatabaseModule(adapters: CapabilityRuntimeAdapters, label: string): CapabilityProbeOutcome {
  const { hasDb, status } = adapters.getDbStatus();
  if (!hasDb) {
    return {
      availability: 'unavailable',
      health: 'unavailable',
      reason: `${label}: база данных не инициализирована`
    };
  }

  if (status.mode === 'DB_SAFE_MODE' || status.isSafeMode) {
    return {
      availability: 'degraded',
      health: 'degraded',
      reason: `DB_SAFE_MODE (только чтение, без персиста): ${status.errorCode || status.errorMessage || status.lastRecovery?.reason || status.engine}`
    };
  }

  if (status.mode === 'DEGRADED' || status.engine === 'json-degraded') {
    return {
      availability: 'degraded',
      health: 'degraded',
      reason: 'JSON fallback без транзакций SQLite (PERSISTENT_JSON_DEGRADED)'
    };
  }

  if (status.engine === 'sqlite' || status.engine === 'sqlite-memory') {
    return {
      availability: 'available',
      health: 'ready',
      reason: status.schemaVersion
        ? `SQLite активен (схема v${status.schemaVersion})`
        : 'SQLite активен'
    };
  }

  return {
    availability: 'degraded',
    health: 'degraded',
    reason: `Ограниченный режим хранилища (${status.engine})`
  };
}

export function evaluateVoiceModule(adapters: CapabilityRuntimeAdapters, refresh?: boolean): CapabilityProbeOutcome {
  const stt = adapters.getSttStatus();
  const tts = adapters.getTtsState();
  const py = adapters.getPythonReadiness(refresh);

  const sttHasError = Boolean(stt.lastError) || stt.setupState === 'failed';
  const sttReady = stt.modelsInstalled && !sttHasError;

  const integrityFailed = py.integrity?.state === 'ERROR';
  const depsFailed = py.deps?.state === 'ERROR';
  const depsDegraded = py.deps?.state === 'DEGRADED';

  const ttsUnavailable = tts.activeEngine === 'unavailable' || integrityFailed || (tts.provider === 'silero' && depsFailed);
  const ttsConfirmedActive = tts.activeEngine !== null && tts.activeEngine !== 'unavailable';
  const ttsHasStaticSilero = Boolean(py.hasLocalModel && py.hasPythonExe);
  const ttsReady = !ttsUnavailable && (ttsConfirmedActive || ttsHasStaticSilero || tts.provider === 'native');

  const sttPart = sttHasError
    ? `STT: ошибка (${stt.lastError || 'сбой'})`
    : stt.modelsInstalled
    ? `STT: ${stt.ready ? `активен (${stt.activeEngine})` : 'модели готовы'}`
    : 'STT: модели не установлены';

  const ttsPart = ttsUnavailable
    ? `TTS: недоступен (${tts.lastErrorReason || py.integrity?.reason || py.deps?.reason || 'ошибка'})`
    : ttsConfirmedActive
    ? `TTS: ${tts.activeEngine}${depsDegraded ? ' (degraded)' : ''}`
    : ttsHasStaticSilero
    ? 'TTS: Silero готов к запуску'
    : `TTS: профиль ${tts.provider} (не активирован)`;

  if ((sttHasError && ttsUnavailable) || (integrityFailed && !sttReady)) {
    return {
      availability: 'unavailable',
      health: 'error',
      reason: `${sttPart}; ${ttsPart}`
    };
  }

  if (sttReady && ttsReady && !depsDegraded && !tts.lastErrorReason) {
    return {
      availability: 'available',
      health: 'ready',
      reason: `${sttPart}; ${ttsPart}`
    };
  }

  if (sttReady || ttsReady) {
    return {
      availability: 'degraded',
      health: 'degraded',
      reason: `${sttPart}; ${ttsPart}`
    };
  }

  return {
    availability: 'unavailable',
    health: 'unavailable',
    reason: `${sttPart}; ${ttsPart}`
  };
}

export function evaluateSkillsModule(adapters: CapabilityRuntimeAdapters): CapabilityProbeOutcome {
  const { total, enabled, loadedFromDisk } = adapters.getSkillsSummary();
  if (total === 0 && !loadedFromDisk) {
    return {
      availability: 'unavailable',
      health: 'unavailable',
      reason: 'Реестр навыков ещё не загружен'
    };
  }
  if (enabled === 0) {
    return {
      availability: 'degraded',
      health: 'degraded',
      reason: `Все навыки отключены (${total})`
    };
  }
  return {
    availability: 'available',
    health: 'ready',
    reason: `Активных навыков: ${enabled} из ${total}`
  };
}

export function evaluateScenariosModule(adapters: CapabilityRuntimeAdapters): CapabilityProbeOutcome {
  const { schedulerRunning, macrosDirAccessible, macroCount } = adapters.getMacrosSummary();
  if (!schedulerRunning) {
    return {
      availability: 'degraded',
      health: 'degraded',
      reason: macrosDirAccessible
        ? `Планировщик остановлен (сценариев: ${macroCount})`
        : 'Планировщик остановлен, каталог сценариев не инициализирован'
    };
  }
  return {
    availability: 'available',
    health: 'ready',
    reason: macrosDirAccessible
      ? `Планировщик активен (сценариев: ${macroCount})`
      : 'Планировщик активен (пользовательских сценариев: 0)'
  };
}
