import { safeStringify } from '../../../bootstrap/plugins';
import { completeFirstRunWizard } from './complete-wizard';

export type WizardSavePhase = 'idle' | 'saving' | 'saved' | 'error';
export type WizardActionKind = 'next' | 'finish' | 'skip';

export interface StepSaveResult {
  ok: boolean;
  criticalError?: string;
  optionalWarnings?: string[];
}

export interface WizardStepHandle {
  saveCurrentState: () => Promise<StepSaveResult | void> | StepSaveResult | void;
}

export interface WizardSettingsStoreLike {
  firstRunCompleted: boolean;
  onboardingVersion?: number;
  language?: 'RU' | 'EN';
  triggerSyncToast?: (
    label: string,
    undoFn: () => void,
    isCritical?: boolean,
    options?: {
      variant?: 'synced' | 'error' | 'warn';
      actionLabel?: string;
      hideAction?: boolean;
      badgeLabel?: string;
    }
  ) => void;
  $state?: Record<string, any>;
}

const SETTINGS_STORAGE_KEY = 'arc_state_settings';

export function sanitizeWizardErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const raw = typeof err === 'string' ? err : (err as any)?.message;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

export function normalizeStepSaveResult(raw: StepSaveResult | void): StepSaveResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: true };
  }
  const optionalWarnings = Array.isArray(raw.optionalWarnings)
    ? raw.optionalWarnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    : undefined;
  return {
    ok: raw.ok !== false,
    ...(raw.criticalError ? { criticalError: raw.criticalError } : {}),
    ...(optionalWarnings && optionalWarnings.length > 0 ? { optionalWarnings } : {})
  };
}

export function persistSettingsSnapshotNow(
  store: WizardSettingsStoreLike
): { ok: boolean; error?: string } {
  if (typeof localStorage === 'undefined') {
    return { ok: true };
  }

  try {
    const rawState: Record<string, any> =
      store.$state && typeof store.$state === 'object' ? { ...store.$state } : { ...store };
    rawState.firstRunCompleted = store.firstRunCompleted;
    if (store.onboardingVersion !== undefined) {
      rawState.onboardingVersion = store.onboardingVersion;
    }
    delete rawState.reactorColorTheme;

    const json = safeStringify(rawState);
    if (!json) {
      return { ok: false, error: 'Не удалось сериализовать настройки для сохранения' };
    }

    localStorage.setItem(SETTINGS_STORAGE_KEY, json);
    const readBack = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!readBack) {
      return { ok: false, error: 'Локальное хранилище не подтвердило запись настроек' };
    }

    const parsed = JSON.parse(readBack);
    if (!parsed || parsed.firstRunCompleted !== store.firstRunCompleted) {
      return { ok: false, error: 'Проверка сохранённых настроек не подтвердила завершение мастера' };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeWizardErrorMessage(err, 'Ошибка записи настроек в локальное хранилище')
    };
  }
}

export function completeFirstRunWizardDurably(
  store: WizardSettingsStoreLike
): { ok: boolean; error?: string } {
  const prevCompleted = store.firstRunCompleted;
  const prevVersion = store.onboardingVersion;

  completeFirstRunWizard(store);
  const persistRes = persistSettingsSnapshotNow(store);
  if (!persistRes.ok) {
    store.firstRunCompleted = prevCompleted;
    if (store.onboardingVersion !== undefined && prevVersion !== undefined) {
      store.onboardingVersion = prevVersion;
    }
    return persistRes;
  }

  return { ok: true };
}

export async function saveAiStepSelection(params: {
  contour: 'openrouter' | 'gemini' | 'local';
  isLocalGateway: boolean;
  localRuntime: string;
  trimmedKey: string;
  settingsStore: { useLocalLLM: boolean; localLLMModel: string };
  persistLocalGateway: () => Promise<{ success?: boolean; error?: string }>;
  persistCurrentContour: (trimmedKey: string) => Promise<{ success?: boolean; error?: string }>;
}): Promise<StepSaveResult> {
  try {
    if (params.contour === 'local') {
      if (params.isLocalGateway) {
        const res = await params.persistLocalGateway();
        if (res && res.success === false) {
          return {
            ok: false,
            criticalError: res.error || 'Не удалось сохранить конфигурацию локального шлюза ИИ'
          };
        }
        return { ok: true };
      }

      params.settingsStore.useLocalLLM = true;
      params.settingsStore.localLLMModel =
        params.localRuntime === 'builtin' ? 'builtin' : 'llama3.2';
      return { ok: true };
    }

    params.settingsStore.useLocalLLM = false;
    if (params.trimmedKey) {
      const res = await params.persistCurrentContour(params.trimmedKey);
      if (res && res.success === false) {
        return {
          ok: false,
          criticalError: res.error || 'Не удалось сохранить API-ключ или провайдера ИИ'
        };
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      criticalError: sanitizeWizardErrorMessage(err, 'Ошибка сохранения параметров контура ИИ')
    };
  }
}

export async function syncVoiceModeWithMain(
  mode: 'setup_now' | 'later' | 'system_fallback',
  onSnapshot?: (snap: any) => void
): Promise<string | null> {
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (!api?.setVoiceSetupMode) {
    return null;
  }
  try {
    const snap = await api.setVoiceSetupMode(mode);
    if (snap && onSnapshot) onSnapshot(snap);
    return null;
  } catch (err) {
    return sanitizeWizardErrorMessage(err, 'Не удалось синхронизировать режим голосовой настройки');
  }
}

export async function flushVoiceSetupCardSync(params: {
  mode: 'setup_now' | 'later' | 'system_fallback';
  pendingSync: Promise<string | null> | null;
  lastSyncError: string | null;
  hasSyncedMode: boolean;
  onSnapshot?: (snap: any) => void;
}): Promise<StepSaveResult> {
  let errMsg: string | null = params.lastSyncError;
  if (params.pendingSync) {
    errMsg = await params.pendingSync;
  } else if (!params.hasSyncedMode || errMsg) {
    errMsg = await syncVoiceModeWithMain(params.mode, params.onSnapshot);
  }

  if (errMsg) {
    return {
      ok: true,
      optionalWarnings: [`Режим голоса не синхронизирован: ${errMsg}`]
    };
  }
  return { ok: true };
}
