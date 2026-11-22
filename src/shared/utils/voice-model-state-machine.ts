import type { ModelIntegrityStatus } from '../types/model-integrity';

export type VoiceModelSetupState =
  | 'unknown'
  | 'checking'
  | 'missing'
  | 'consent_required'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'cancelled'
  | 'degraded'
  | 'unavailable'
  | 'failed'
  | 'incompatible';

export type ResourceReadinessLayer =
  | 'none'
  | 'downloaded'
  | 'verified'
  | 'loaded'
  | 'active';

export type ResourceComponentKind =
  | 'python_env'
  | 'tts_model'
  | 'stt_model'
  | 'llm_model'
  | 'voice_subsystem';

export type SetupStateTone = 'ok' | 'warn' | 'err' | 'off' | 'accent' | 'default';

export const ALLOWED_SETUP_STATE_TRANSITIONS: Record<VoiceModelSetupState, readonly VoiceModelSetupState[]> = {
  unknown: ['checking', 'missing', 'consent_required', 'ready', 'degraded', 'unavailable', 'failed', 'incompatible'],
  checking: ['missing', 'consent_required', 'downloading', 'verifying', 'ready', 'degraded', 'unavailable', 'failed', 'incompatible'],
  missing: ['checking', 'consent_required', 'downloading', 'degraded', 'unavailable', 'failed'],
  consent_required: ['checking', 'missing', 'downloading', 'cancelled', 'degraded', 'unavailable'],
  downloading: ['verifying', 'cancelled', 'failed', 'degraded', 'missing'],
  verifying: ['ready', 'degraded', 'failed', 'incompatible', 'cancelled', 'missing'],
  ready: ['checking', 'verifying', 'degraded', 'unavailable', 'failed', 'incompatible', 'missing'],
  cancelled: ['checking', 'missing', 'consent_required', 'downloading', 'degraded'],
  degraded: ['checking', 'consent_required', 'downloading', 'verifying', 'ready', 'unavailable', 'failed'],
  unavailable: ['checking', 'missing', 'consent_required', 'downloading', 'degraded', 'failed'],
  // Failed must re-pass checking or downloading -> verifying; never jumps directly to ready.
  failed: ['checking', 'missing', 'consent_required', 'downloading', 'cancelled', 'degraded', 'unavailable', 'incompatible'],
  incompatible: ['checking', 'missing', 'downloading', 'degraded', 'unavailable']
};

export const COMPONENT_ALLOWED_STATES: Record<ResourceComponentKind, ReadonlySet<VoiceModelSetupState>> = {
  python_env: new Set<VoiceModelSetupState>([
    'unknown', 'checking', 'missing', 'consent_required', 'downloading',
    'verifying', 'ready', 'cancelled', 'degraded', 'unavailable', 'failed', 'incompatible'
  ]),
  tts_model: new Set<VoiceModelSetupState>([
    'unknown', 'checking', 'missing', 'consent_required', 'downloading',
    'verifying', 'ready', 'cancelled', 'degraded', 'unavailable', 'failed'
  ]),
  stt_model: new Set<VoiceModelSetupState>([
    'unknown', 'checking', 'missing', 'consent_required', 'downloading',
    'verifying', 'ready', 'cancelled', 'degraded', 'unavailable', 'failed', 'incompatible'
  ]),
  llm_model: new Set<VoiceModelSetupState>([
    'unknown', 'checking', 'missing', 'consent_required', 'downloading',
    'verifying', 'ready', 'cancelled', 'unavailable', 'failed', 'incompatible'
  ]),
  voice_subsystem: new Set<VoiceModelSetupState>([
    'unknown', 'checking', 'missing', 'consent_required', 'downloading',
    'verifying', 'ready', 'cancelled', 'degraded', 'unavailable', 'failed'
  ])
};

export function canTransitionSetupState(from: VoiceModelSetupState, to: VoiceModelSetupState): boolean {
  if (from === to) return true;
  return ALLOWED_SETUP_STATE_TRANSITIONS[from].includes(to);
}

export function transitionSetupState(from: VoiceModelSetupState, to: VoiceModelSetupState): VoiceModelSetupState {
  if (!canTransitionSetupState(from, to)) {
    throw new Error(`Invalid voice/model setup transition: ${from} -> ${to}`);
  }
  return to;
}

export function isStateApplicableToComponent(kind: ResourceComponentKind, state: VoiceModelSetupState): boolean {
  return COMPONENT_ALLOWED_STATES[kind].has(state);
}

export function mapVoiceHealthToSetupState(
  healthState: string,
  mode?: 'setup_now' | 'later' | 'system_fallback'
): VoiceModelSetupState {
  switch (healthState) {
    case 'checking':
      return 'checking';
    case 'runtime_missing':
    case 'dependencies_missing':
    case 'model_missing':
      return mode === 'later' ? 'consent_required' : 'missing';
    case 'downloading':
      return 'downloading';
    case 'verifying':
      return 'verifying';
    case 'ready':
      return 'ready';
    case 'degraded':
      return 'degraded';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    case 'unavailable':
      return 'unavailable';
    case 'incompatible':
      return 'incompatible';
    default:
      return 'unknown';
  }
}

export interface DeriveResourceStateInput {
  kind: ResourceComponentKind;
  checking?: boolean;
  verificationPending?: boolean;
  downloaded?: boolean;
  integrityStatus?: ModelIntegrityStatus | null;
  loaded?: boolean;
  active?: boolean;
  downloading?: boolean;
  verifying?: boolean;
  cancelled?: boolean;
  incompatible?: boolean;
  unavailable?: boolean;
  consentRequired?: boolean;
  degraded?: boolean;
  error?: string | null;
  missingReason?: string | null;
}

export interface ResourceStateSnapshot {
  setupState: VoiceModelSetupState;
  readinessLayer: ResourceReadinessLayer;
  badgeLabel: string;
  badgeTone: SetupStateTone;
  detail: string;
  requiresConsent: boolean;
  canActivate: boolean;
}

export function deriveResourceStateSnapshot(input: DeriveResourceStateInput): ResourceStateSnapshot {
  if (input.incompatible) {
    return {
      setupState: 'incompatible',
      readinessLayer: 'none',
      badgeLabel: 'Несовместимо',
      badgeTone: 'err',
      detail: input.error || 'Модель несовместима с текущим окружением',
      requiresConsent: false,
      canActivate: false
    };
  }

  if (input.integrityStatus === 'tampered') {
    return {
      setupState: 'failed',
      readinessLayer: 'none',
      badgeLabel: 'Нарушена целостность',
      badgeTone: 'err',
      detail: input.error || 'Контрольная сумма SHA-256 не совпадает с манифестом',
      requiresConsent: false,
      canActivate: false
    };
  }

  if (input.downloading && !input.cancelled) {
    return {
      setupState: 'downloading',
      readinessLayer: 'none',
      badgeLabel: 'Загрузка...',
      badgeTone: 'warn',
      detail: 'Выполняется загрузка ресурса',
      requiresConsent: false,
      canActivate: false
    };
  }

  if (input.verifying && !input.cancelled) {
    return {
      setupState: 'verifying',
      readinessLayer: 'downloaded',
      badgeLabel: 'Проверка SHA-256...',
      badgeTone: 'warn',
      detail: 'Выполняется проверка целостности загруженных файлов',
      requiresConsent: false,
      canActivate: false
    };
  }

  if (input.cancelled) {
    const verifiedOnDisk = Boolean(input.downloaded) && input.integrityStatus === 'verified';
    return {
      setupState: 'cancelled',
      readinessLayer: verifiedOnDisk ? 'verified' : input.downloaded ? 'downloaded' : 'none',
      badgeLabel: 'Отменено',
      badgeTone: 'warn',
      detail: 'Загрузка отменена пользователем',
      requiresConsent: false,
      canActivate: Boolean(input.downloaded)
    };
  }

  if (input.error) {
    return {
      setupState: 'failed',
      readinessLayer: 'none',
      badgeLabel: 'Ошибка',
      badgeTone: 'err',
      detail: input.error,
      requiresConsent: false,
      canActivate: false
    };
  }

  if (input.unavailable) {
    return {
      setupState: 'unavailable',
      readinessLayer: 'none',
      badgeLabel: 'Недоступно',
      badgeTone: 'err',
      detail: input.missingReason || 'Компонент недоступен в текущей конфигурации',
      requiresConsent: false,
      canActivate: false
    };
  }

  if (input.checking || input.verificationPending) {
    return {
      setupState: 'checking',
      readinessLayer: 'none',
      badgeLabel: 'Проверка...',
      badgeTone: 'warn',
      detail: 'Проверка наличия и целостности файлов на диске',
      requiresConsent: false,
      canActivate: false
    };
  }

  const onDisk = Boolean(input.downloaded) || input.integrityStatus === 'verified' || input.integrityStatus === 'unverified_manual';
  if (!onDisk) {
    if (input.consentRequired) {
      return {
        setupState: 'consent_required',
        readinessLayer: 'none',
        badgeLabel: 'Требуется установка',
        badgeTone: 'warn',
        detail: input.missingReason || 'Требуется подтверждение пользователя на установку',
        requiresConsent: true,
        canActivate: false
      };
    }
    return {
      setupState: 'missing',
      readinessLayer: 'none',
      badgeLabel: 'Не скачано',
      badgeTone: 'off',
      detail: input.missingReason || 'Ресурс отсутствует на диске',
      requiresConsent: false,
      canActivate: false
    };
  }

  const isVerified = input.integrityStatus === 'verified';
  if (input.active && input.loaded) {
    return {
      setupState: isVerified && !input.degraded ? 'ready' : 'degraded',
      readinessLayer: 'active',
      badgeLabel: isVerified ? 'Активен' : 'Активен · Не проверен',
      badgeTone: isVerified ? 'ok' : 'warn',
      detail: isVerified ? 'Модель проверена, загружена и активно используется' : 'Активна без подтверждённого SHA-256 манифеста',
      requiresConsent: false,
      canActivate: true
    };
  }

  if (input.loaded) {
    return {
      setupState: isVerified && !input.degraded ? 'ready' : 'degraded',
      readinessLayer: 'loaded',
      badgeLabel: isVerified ? 'Загружена' : 'Загружена · Не проверена',
      badgeTone: isVerified ? 'ok' : 'warn',
      detail: isVerified ? 'Загружена в память (не выбрана активной)' : 'Загружена в память без SHA-256 проверки',
      requiresConsent: false,
      canActivate: true
    };
  }

  if (isVerified) {
    return {
      setupState: input.degraded ? 'degraded' : 'ready',
      readinessLayer: 'verified',
      badgeLabel: input.degraded ? 'Ограничено' : 'Проверена (на диске)',
      badgeTone: input.degraded ? 'warn' : 'ok',
      detail: 'SHA-256 подтверждён на диске; ещё не загружена в рантайм',
      requiresConsent: false,
      canActivate: true
    };
  }

  return {
    setupState: 'degraded',
    readinessLayer: 'downloaded',
    badgeLabel: 'Скачана · Не проверена',
    badgeTone: 'warn',
    detail: 'Присутствует на диске без доверенного SHA-256 (ручной или неподтверждённый источник)',
    requiresConsent: false,
    canActivate: true
  };
}
