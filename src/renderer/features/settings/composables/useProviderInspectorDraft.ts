import { computed, getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue';
import type { AIProvider, ProviderTestState } from '../../../stores/aiConfig';
import { validateProviderEndpoint } from '../logic/provider-validation';

export type SaveLifecycleState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export type ProviderListStatusCode =
  | 'quarantined'
  | 'disabled'
  | 'testing'
  | 'test_error'
  | 'unconfigured'
  | 'verified'
  | 'configured_untested';

export interface ProviderListStatusBadge {
  state: ProviderListStatusCode;
  label: string;
  dot: string;
  text: string;
}

export interface InspectorDraftFields {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  endpoint: string;
  apiKey: string;
  noAuthHeader: boolean;
  model: string;
  selectedModels: string[];
  routingStrategy: 'smart_route' | 'fallback' | 'ensemble';
  isExclusive: boolean;
  priority: number;
  temperature: number;
  maxTokens: number;
  modelsUpdatedAt?: number;
  modelsFetchError?: string;
  lastModelsFetchAt?: number;
}

const MASKED_KEY = '••••••••••••••••';

export function cloneProviderToDraft(provider: AIProvider): InspectorDraftFields {
  return {
    id: provider.id,
    name: provider.name || '',
    type: provider.type === 'local' ? 'local' : 'cloud',
    endpoint: provider.endpoint || '',
    apiKey: provider.apiKey ?? '',
    noAuthHeader: Boolean(provider.noAuthHeader),
    model: provider.model || '',
    selectedModels: Array.isArray(provider.selectedModels)
      ? [...provider.selectedModels]
      : provider.model ? [provider.model] : [],
    routingStrategy: provider.routingStrategy || 'smart_route',
    isExclusive: Boolean(provider.isExclusive),
    priority: Number.isFinite(provider.priority) ? provider.priority : 1,
    temperature: Number.isFinite(provider.temperature) ? provider.temperature : 0.7,
    maxTokens: Number.isFinite(provider.maxTokens) ? provider.maxTokens : 2048,
    modelsUpdatedAt: provider.modelsUpdatedAt,
    modelsFetchError: provider.modelsFetchError,
    lastModelsFetchAt: provider.lastModelsFetchAt
  };
}

/** Serializes editable inspector fields ONLY (excludes `enabled`). */
export function buildDraftSnapshot(draft: Partial<InspectorDraftFields> | null | undefined): string {
  if (!draft) return '';
  const selectedModels = Array.isArray(draft.selectedModels)
    ? [...draft.selectedModels]
    : draft.model ? [draft.model] : [];
  return JSON.stringify({
    name: (draft.name || '').trim(),
    type: draft.type === 'local' ? 'local' : 'cloud',
    endpoint: (draft.endpoint || '').trim(),
    apiKey: draft.apiKey ?? '',
    noAuthHeader: Boolean(draft.noAuthHeader),
    model: (draft.model || '').trim(),
    selectedModels,
    routingStrategy: draft.routingStrategy || 'smart_route',
    isExclusive: Boolean(draft.isExclusive),
    priority: Number(draft.priority ?? 1),
    temperature: Number(draft.temperature ?? 0.7),
    maxTokens: Number(draft.maxTokens ?? 2048)
  });
}

/** 7-state classification for the provider registry list (P2 4.3). */
export function getProviderListStatus(
  provider: AIProvider,
  savedTestState: ProviderTestState | null | undefined,
  isQuarantined: boolean
): ProviderListStatusBadge {
  if (isQuarantined) {
    return { state: 'quarantined', label: 'КАРАНТИН', dot: 'bg-[var(--status-err)]', text: 'text-[var(--status-err)]' };
  }
  if (!provider.enabled) {
    return { state: 'disabled', label: 'ОТКЛ', dot: 'bg-[var(--status-off)]', text: 'text-[var(--arc-text-hint)]' };
  }
  if (savedTestState?.status === 'loading') {
    return { state: 'testing', label: 'ТЕСТ...', dot: 'bg-[var(--status-warn)]', text: 'text-[var(--status-warn)]' };
  }
  if (savedTestState?.status === 'error') {
    return { state: 'test_error', label: 'ОШИБКА', dot: 'bg-[var(--status-err)]', text: 'text-[var(--status-err)]' };
  }
  const endpointValid = validateProviderEndpoint(provider.endpoint).valid;
  const missingKey = provider.type !== 'local' && !provider.noAuthHeader && !(provider.apiKey && provider.apiKey.trim().length > 0);
  if (!endpointValid || missingKey) {
    return { state: 'unconfigured', label: 'НЕ НАСТРОЕН', dot: 'bg-[var(--status-warn)]', text: 'text-[var(--status-warn)]' };
  }
  if (savedTestState?.status === 'success') {
    return { state: 'verified', label: 'ПОДТВЕРЖДЁН', dot: 'bg-[var(--status-ok)]', text: 'text-[var(--status-ok)]' };
  }
  return { state: 'configured_untested', label: 'НЕ ПРОВЕРЕН', dot: 'bg-[var(--status-warn)]', text: 'text-[var(--arc-text-secondary)]' };
}

/** Targeted quarantine expiration watcher (P2 4.1). */
export function useQuarantineWatch(
  quarantinedProviders: Ref<{ id: string; name: string; quarantineUntil: number }[]>,
  onExpire?: () => void | Promise<void>
) {
  const nowTick = ref(Date.now());
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearExpiryTimer = () => {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  };

  const scheduleNext = () => {
    clearExpiryTimer();
    const now = Date.now();
    nowTick.value = now;
    const futureTimes = (quarantinedProviders.value || [])
      .map((q) => q.quarantineUntil)
      .filter((until) => typeof until === 'number' && until > now);
    if (futureTimes.length === 0) return;

    const earliestUntil = Math.min(...futureTimes);
    const delayMs = Math.max(0, earliestUntil - now) + 25;
    expiryTimer = setTimeout(async () => {
      expiryTimer = null;
      nowTick.value = Date.now();
      if (onExpire) {
        try { await onExpire(); } catch { /* ignore */ }
      }
      scheduleNext();
    }, delayMs);
  };

  const stopWatch = watch(quarantinedProviders, () => { scheduleNext(); }, { deep: true, immediate: true });
  const dispose = () => { clearExpiryTimer(); stopWatch(); };
  if (getCurrentScope()) onScopeDispose(dispose);

  const isProviderQuarantined = (id: string): boolean =>
    (quarantinedProviders.value || []).some((q) => q.id === id && q.quarantineUntil > nowTick.value);

  const getQuarantineMinutesLeft = (id: string): number => {
    const entry = (quarantinedProviders.value || []).find((q) => q.id === id && q.quarantineUntil > nowTick.value);
    return entry ? Math.max(1, Math.ceil((entry.quarantineUntil - nowTick.value) / 60000)) : 0;
  };

  const activeQuarantineCount = computed(
    () => (quarantinedProviders.value || []).filter((q) => q.quarantineUntil > nowTick.value).length
  );

  return { nowTick, activeQuarantineCount, isProviderQuarantined, getQuarantineMinutesLeft, scheduleNext, dispose };
}

export interface InspectorDraftStoreAdapter {
  providers: Ref<AIProvider[]>;
  saveProvider: (provider: AIProvider) => Promise<{ success?: boolean; error?: string } | any>;
}

/** Manages isolated draft state, save lifecycle, enabled merge, and switch guard. */
export function useProviderInspectorDraft(
  store: InspectorDraftStoreAdapter,
  onSelectConfirmed?: (provider: AIProvider) => void
) {
  const selectedProviderId = ref<string | null>(null);
  const draftProvider = ref<InspectorDraftFields | null>(null);
  const savedBaselineSnapshot = ref<string>('');
  const isSaving = ref(false);
  const isRecentlySaved = ref(false);
  const saveError = ref<string | null>(null);
  const pendingSwitchProviderId = ref<string | null>(null);
  let savedFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSavedFeedbackTimer = () => {
    if (savedFeedbackTimer !== null) {
      clearTimeout(savedFeedbackTimer);
      savedFeedbackTimer = null;
    }
  };
  if (getCurrentScope()) onScopeDispose(clearSavedFeedbackTimer);

  const selectedStoreProvider = computed<AIProvider | null>(() => {
    const list = store.providers.value || [];
    if (!list.length) return null;
    return list.find((p) => p.id === selectedProviderId.value) || list[0];
  });

  const pendingSwitchProvider = computed<AIProvider | null>(() => {
    if (!pendingSwitchProviderId.value) return null;
    return (store.providers.value || []).find((p) => p.id === pendingSwitchProviderId.value) || null;
  });

  const loadDraftFromProvider = (provider: AIProvider | null) => {
    clearSavedFeedbackTimer();
    isRecentlySaved.value = false;
    saveError.value = null;
    pendingSwitchProviderId.value = null;
    if (!provider) {
      draftProvider.value = null;
      savedBaselineSnapshot.value = '';
      return;
    }
    selectedProviderId.value = provider.id;
    const cloned = cloneProviderToDraft(provider);
    draftProvider.value = cloned;
    savedBaselineSnapshot.value = buildDraftSnapshot(cloned);
  };

  const isDirty = computed<boolean>(() => {
    if (!draftProvider.value) return false;
    return buildDraftSnapshot(draftProvider.value) !== savedBaselineSnapshot.value;
  });

  watch(isDirty, (dirty) => { if (dirty) isRecentlySaved.value = false; });

  watch(
    () => store.providers.value,
    (list) => {
      if (!list || list.length === 0) {
        loadDraftFromProvider(null);
        return;
      }
      const current = list.find((p) => p.id === selectedProviderId.value);
      if (!current) {
        loadDraftFromProvider(list[0]);
        return;
      }
      if (!isDirty.value && !isSaving.value) {
        const cloned = cloneProviderToDraft(current);
        draftProvider.value = cloned;
        savedBaselineSnapshot.value = buildDraftSnapshot(cloned);
      }
    },
    { immediate: true, deep: true }
  );

  const saveLifecycleState = computed<SaveLifecycleState>(() => {
    if (isSaving.value) return 'saving';
    if (saveError.value) return 'error';
    if (isDirty.value) return 'dirty';
    if (isRecentlySaved.value) return 'saved';
    return 'clean';
  });

  const buildMergedProviderPayload = (): AIProvider | null => {
    if (!draftProvider.value) return null;
    const liveStoreEntry = (store.providers.value || []).find((p) => p.id === draftProvider.value!.id);
    const liveEnabled = liveStoreEntry ? Boolean(liveStoreEntry.enabled) : true;
    const rawKey = (draftProvider.value.apiKey ?? '').trim();
    const hasNewCustomKey = rawKey.length > 0 && rawKey !== MASKED_KEY;
    return {
      ...(liveStoreEntry ? JSON.parse(JSON.stringify(liveStoreEntry)) : {}),
      ...JSON.parse(JSON.stringify(draftProvider.value)),
      apiKey: draftProvider.value.apiKey ?? '',
      noAuthHeader: hasNewCustomKey ? false : Boolean(draftProvider.value.noAuthHeader),
      enabled: liveEnabled
    };
  };

  const saveDraft = async (): Promise<{ success: boolean; skipped?: boolean; error?: string }> => {
    if (!draftProvider.value) return { success: false, error: 'Профиль не выбран' };
    if (isSaving.value) return { success: false, skipped: true };

    saveError.value = null;
    const endpointCheck = validateProviderEndpoint(draftProvider.value.endpoint);
    if (!endpointCheck.valid) {
      saveError.value = endpointCheck.error || 'Некорректный URL эндпоинта';
      return { success: false, error: saveError.value };
    }

    const payload = buildMergedProviderPayload();
    if (!payload) return { success: false };
    if (payload.noAuthHeader !== draftProvider.value.noAuthHeader) {
      draftProvider.value.noAuthHeader = Boolean(payload.noAuthHeader);
    }

    isSaving.value = true;
    try {
      const res = await store.saveProvider(payload);
      if (res && res.success === false) {
        saveError.value = res.error || 'Ошибка сохранения настроек провайдера';
        return { success: false, error: saveError.value };
      }
      const reloaded = (store.providers.value || []).find((p) => p.id === payload.id);
      if (reloaded) {
        const synced = cloneProviderToDraft(reloaded);
        draftProvider.value = synced;
        savedBaselineSnapshot.value = buildDraftSnapshot(synced);
      } else {
        savedBaselineSnapshot.value = buildDraftSnapshot(draftProvider.value);
      }
      clearSavedFeedbackTimer();
      isRecentlySaved.value = true;
      savedFeedbackTimer = setTimeout(() => { isRecentlySaved.value = false; }, 2000);
      return { success: true };
    } catch (e: any) {
      saveError.value = e?.message || 'Ошибка сохранения настроек провайдера';
      return { success: false, error: saveError.value };
    } finally {
      isSaving.value = false;
    }
  };

  const requestSelectProvider = (provider: AIProvider): boolean => {
    if (!provider) return false;
    if (selectedProviderId.value === provider.id) {
      pendingSwitchProviderId.value = null;
      return true;
    }
    if (isDirty.value) {
      pendingSwitchProviderId.value = provider.id;
      return false;
    }
    loadDraftFromProvider(provider);
    if (onSelectConfirmed) onSelectConfirmed(provider);
    return true;
  };

  const confirmSaveAndSwitch = async (): Promise<boolean> => {
    const target = pendingSwitchProvider.value;
    if (!target) return false;
    const res = await saveDraft();
    if (!res.success) return false;
    loadDraftFromProvider(target);
    if (onSelectConfirmed) onSelectConfirmed(target);
    return true;
  };

  const discardAndSwitch = (): boolean => {
    const target = pendingSwitchProvider.value;
    if (!target) return false;
    loadDraftFromProvider(target);
    if (onSelectConfirmed) onSelectConfirmed(target);
    return true;
  };

  const cancelSwitch = () => { pendingSwitchProviderId.value = null; };
  const resetDraft = () => { if (selectedStoreProvider.value) loadDraftFromProvider(selectedStoreProvider.value); };

  return {
    selectedProviderId, selectedStoreProvider, draftProvider, isDirty, isSaving, isRecentlySaved,
    saveError, saveLifecycleState, pendingSwitchProviderId, pendingSwitchProvider,
    loadDraftFromProvider, buildMergedProviderPayload, saveDraft, resetDraft,
    requestSelectProvider, confirmSaveAndSwitch, discardAndSwitch, cancelSwitch
  };
}
