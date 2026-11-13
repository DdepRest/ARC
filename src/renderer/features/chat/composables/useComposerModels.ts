import { ref, computed, watch } from 'vue';
import { useAiConfigStore } from '../../../stores/aiConfig';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useUIStore } from '../../../stores/ui.store';
import {
  resolveEffectiveEffort,
  EFFORT_TOKEN_BUDGET,
  EFFORT_ANALYTICAL_SCORE,
  type ComposerMode,
  type EffortLevel,
  type ConcreteEffortLevel,
} from '../../../../shared/utils/auto-workflow';
import {
  ALL_MODES,
  MODE_META,
  CONTEXT_OPTIONS,
  COMPOSER_MODE_STORAGE_KEY,
  FAV_STORAGE_KEY,
  EFFORT_STORAGE_KEY,
  ACTIVE_MODEL_STORAGE_KEY,
  DEFAULT_BUILTIN_GGUF,
  getCanonicalModelId,
  formatReadableModelName,
  buildComposerModelOption,
  collectGgufCandidateFiles,
  assembleConnectedModels,
  type ProviderBadgeType,
  type ModelFilterTab,
  type ModelPingStatus,
  type ComposerModelOption,
  type ContextTagOption,
  type ProviderProbeRecord,
} from '../utils/composer-model-probe';

export {
  ALL_MODES,
  MODE_META,
  CONTEXT_OPTIONS,
  COMPOSER_MODE_STORAGE_KEY,
  getCanonicalModelId,
  formatReadableModelName,
  type ComposerMode,
  type EffortLevel,
  type ConcreteEffortLevel,
  type ProviderBadgeType,
  type ModelFilterTab,
  type ModelPingStatus,
  type ComposerModelOption,
  type ContextTagOption,
};

const mode = ref<ComposerMode>('Auto');
const favIds = ref<string[]>([getCanonicalModelId(DEFAULT_BUILTIN_GGUF, 'builtin')]);
const customEfforts = ref<Record<string, EffortLevel>>({});
const activeModelId = ref<string>('');
const downloadedGgufSet = ref<Set<string>>(new Set());
const ollamaOnline = ref<boolean>(false);
const ollamaLatencyMs = ref<number | undefined>(undefined);
const ollamaInstalledModels = ref<string[]>([]);
const providerProbes = ref<Record<string, ProviderProbeRecord>>({});
const isPingingModels = ref<boolean>(false);
let isInitialized = false;
let lastProbeTimestamp = 0;

function initFromStorage() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;
  try {
    const savedMode = localStorage.getItem(COMPOSER_MODE_STORAGE_KEY) as ComposerMode | null;
    if (savedMode && ALL_MODES.includes(savedMode)) mode.value = savedMode;
    else localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, mode.value);

    const savedFavs = localStorage.getItem(FAV_STORAGE_KEY);
    if (savedFavs) {
      const parsed = JSON.parse(savedFavs);
      if (Array.isArray(parsed) && parsed.length > 0) favIds.value = parsed;
    }
    const savedEfforts = localStorage.getItem(EFFORT_STORAGE_KEY);
    if (savedEfforts) {
      const parsed = JSON.parse(savedEfforts);
      if (parsed && typeof parsed === 'object') customEfforts.value = parsed;
    }
    const savedActive = localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY);
    if (savedActive) activeModelId.value = savedActive;
  } catch {}
}

export function useComposerModels() {
  initFromStorage();
  const aiConfigStore = useAiConfigStore();
  const settingsStore = useSettingsStore();
  const uiStore = useUIStore();

  watch(mode, (val) => {
    try { localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, val); } catch {}
  });

  const autoMode = computed<boolean>({
    get: () => Boolean(settingsStore.useSmartRouting),
    set: (val: boolean) => { settingsStore.useSmartRouting = val; },
  });

  async function refreshConnectedModels(runActivePing = false) {
    if (typeof window === 'undefined' || !window.api) return;
    if (isPingingModels.value && !runActivePing) return;
    isPingingModels.value = true;
    lastProbeTimestamp = Date.now();

    try {
      if (typeof (aiConfigStore as any).loadProviders === 'function') {
        await aiConfigStore.loadProviders();
      }
      const candidateFiles = collectGgufCandidateFiles(settingsStore.builtinLLMModel);

      if (typeof (window.api as any).checkBuiltinModel === 'function') {
        const nextDownloaded = new Set<string>();
        await Promise.all(
          Array.from(candidateFiles.keys()).map(async (file) => {
            try {
              if (await (window.api as any).checkBuiltinModel(file)) nextDownloaded.add(file);
            } catch {}
          })
        );
        downloadedGgufSet.value = nextDownloaded;
      }

      if (typeof (window.api as any).checkOllamaOnline === 'function') {
        const t0 = Date.now();
        try {
          const status = await (window.api as any).checkOllamaOnline();
          ollamaOnline.value = Boolean(status?.online);
          if (ollamaOnline.value) {
            ollamaLatencyMs.value = Math.max(1, Date.now() - t0);
            if (typeof window.api.getAvailableModels === 'function') {
              const res = await window.api.getAvailableModels({
                id: 'ollama',
                name: 'Ollama',
                type: 'local',
                endpoint: 'http://127.0.0.1:11434',
                model: settingsStore.localLLMModel || 'llama3.2',
                priority: 1,
                maxTokens: 4096,
                temperature: 0.7,
                enabled: true,
              } as any);
              const rawList = Array.isArray(res) ? res : (res as any)?.models || [];
              ollamaInstalledModels.value = rawList.map((m: any) => (typeof m === 'string' ? m : m?.name || m?.id)).filter(Boolean);
            }
          } else {
            ollamaInstalledModels.value = [];
            ollamaLatencyMs.value = undefined;
          }
        } catch {
          ollamaOnline.value = false;
          ollamaInstalledModels.value = [];
        }
      }

      const quarantinedIds = new Set(
        (Array.isArray(aiConfigStore.quarantinedProviders) ? aiConfigStore.quarantinedProviders : [])
          .filter((q) => q.quarantineUntil > Date.now())
          .map((q) => q.id)
      );

      await Promise.all(
        (Array.isArray(aiConfigStore.providers) ? aiConfigStore.providers : []).map(async (p) => {
          if (quarantinedIds.has(p.id)) return;
          const hasKey = Boolean(p.apiKey && p.apiKey.trim().length > 0);
          const isKeyless =
            p.type === 'local' ||
            Boolean(p.noAuthHeader) ||
            Boolean(p.name && /free/i.test(p.name)) ||
            Boolean(p.endpoint && /freellm|horde|127\.0\.0\.1|localhost/i.test(p.endpoint));

          if (!hasKey && !isKeyless) return;
          if (!p.enabled && !runActivePing) return;

          const prev = providerProbes.value[p.id];
          providerProbes.value = {
            ...providerProbes.value,
            [p.id]: { online: prev?.online ?? false, checking: true, latencyMs: prev?.latencyMs, discoveredModels: prev?.discoveredModels || [] },
          };

          const start = Date.now();
          try {
            let discovered: string[] = [];
            let pingOk = false;

            if (typeof window.api.getAvailableModels === 'function') {
              const res = await window.api.getAvailableModels(JSON.parse(JSON.stringify(p)));
              const rawList = Array.isArray(res) ? res : (res as any)?.models || [];
              discovered = rawList.map((m: any) => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);
              if (discovered.length > 0) pingOk = true;
            }

            if (runActivePing && !pingOk && typeof (window.api as any).testAiConnection === 'function') {
              const testRes = await aiConfigStore.testConnection(p);
              if (testRes?.success) {
                pingOk = true;
                if (Array.isArray((testRes as any).models)) discovered = (testRes as any).models;
              }
            }

            const elapsed = Math.max(1, Date.now() - start);
            providerProbes.value = {
              ...providerProbes.value,
              [p.id]: {
                online: pingOk || (Boolean(p.enabled) && (hasKey || Boolean(p.modelsUpdatedAt))),
                checking: false,
                latencyMs: pingOk ? elapsed : prev?.latencyMs,
                discoveredModels: discovered.length > 0 ? discovered : prev?.discoveredModels || [],
                verifiedAt: Date.now(),
              },
            };
          } catch {
            providerProbes.value = {
              ...providerProbes.value,
              [p.id]: { online: false, checking: false, discoveredModels: prev?.discoveredModels || [] },
            };
          }
        })
      );
    } finally {
      isPingingModels.value = false;
    }
  }

  if (Date.now() - lastProbeTimestamp > 120000 && !isPingingModels.value) {
    lastProbeTimestamp = Date.now();
    setTimeout(() => { void refreshConnectedModels(false); }, 120);
  }

  const models = computed<ComposerModelOption[]>(() => {
    const quarantinedIds = new Set(
      (Array.isArray(aiConfigStore.quarantinedProviders) ? aiConfigStore.quarantinedProviders : [])
        .filter((q) => q.quarantineUntil > Date.now())
        .map((q) => q.id)
    );
    return assembleConnectedModels({
      downloadedGgufSet: downloadedGgufSet.value,
      useLocalLLM: Boolean(settingsStore.useLocalLLM),
      localLLMModel: settingsStore.localLLMModel || 'builtin',
      builtinLLMModel: settingsStore.builtinLLMModel || DEFAULT_BUILTIN_GGUF,
      ollamaOnline: ollamaOnline.value,
      ollamaInstalledModels: ollamaInstalledModels.value,
      ollamaLatencyMs: ollamaLatencyMs.value,
      providers: Array.isArray(aiConfigStore.providers) ? aiConfigStore.providers : [],
      quarantinedIds,
      providerProbes: providerProbes.value,
      customEfforts: customEfforts.value,
      favIds: favIds.value,
    });
  });

  const fallbackModel = computed<ComposerModelOption>(() => {
    const file = settingsStore.builtinLLMModel || DEFAULT_BUILTIN_GGUF;
    return buildComposerModelOption(
      {
        id: getCanonicalModelId(file, 'builtin'),
        name: formatReadableModelName(file),
        modelKey: file,
        provider: 'local',
        isLocal: true,
        localKind: 'builtin',
        pingStatus: 'standby',
        sourceLabel: 'Локальное ядро A.R.C.',
      },
      customEfforts.value,
      favIds.value
    );
  });

  const activeModel = computed<ComposerModelOption>(() => {
    if (activeModelId.value) {
      const explicit = models.value.find((m) => m.id === activeModelId.value);
      if (explicit) return explicit;
    }
    if (settingsStore.useLocalLLM) {
      const targetId =
        settingsStore.localLLMModel === 'builtin'
          ? getCanonicalModelId(settingsStore.builtinLLMModel || DEFAULT_BUILTIN_GGUF, 'builtin')
          : getCanonicalModelId(settingsStore.localLLMModel || 'llama3.2', 'ollama');
      return models.value.find((m) => m.id === targetId) || models.value[0] || fallbackModel.value;
    }
    const enabledProvider = Array.isArray(aiConfigStore.providers) ? aiConfigStore.providers.find((p) => p.enabled) : null;
    if (enabledProvider) {
      const match =
        models.value.find(
          (m) => m.providerId === enabledProvider.id && m.modelKey.toLowerCase() === (enabledProvider.model || '').toLowerCase()
        ) || models.value.find((m) => m.providerId === enabledProvider.id);
      if (match) return match;
    }
    return models.value[0] || fallbackModel.value;
  });

  function applyEffortToSettings(effort: EffortLevel, target?: ComposerModelOption) {
    const model = target || activeModel.value;
    const resolved = resolveEffectiveEffort(effort, 40, model?.modelKey || '', model?.providerName, model?.isLocal);
    settingsStore.llmMaxContextSize = EFFORT_TOKEN_BUDGET[resolved.effectiveEffort] || 2048;
    if (settingsStore.directives) {
      settingsStore.directives.analytical = EFFORT_ANALYTICAL_SCORE[resolved.effectiveEffort] || 80;
    }
  }

  function toggleFavModel(targetId: string) {
    favIds.value = favIds.value.includes(targetId)
      ? favIds.value.filter((id) => id !== targetId)
      : [...favIds.value, targetId];
    try { localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favIds.value)); } catch {}
  }

  async function selectModel(modelId: string) {
    const target = models.value.find((m) => m.id === modelId);
    if (!target) return;
    activeModelId.value = target.id;
    autoMode.value = false;
    applyEffortToSettings(target.effort, target);
    try { localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, target.id); } catch {}
    uiStore.setActiveModel(target.name);

    if (target.localKind === 'builtin') {
      settingsStore.useLocalLLM = true;
      settingsStore.localLLMModel = 'builtin';
      settingsStore.builtinLLMModel = target.modelKey;
      return;
    }
    if (target.localKind === 'ollama') {
      settingsStore.useLocalLLM = true;
      settingsStore.localLLMModel = target.modelKey;
      return;
    }

    settingsStore.useLocalLLM = false;
    const resolved = resolveEffectiveEffort(target.effort, 40, target.modelKey, target.providerName, target.isLocal);
    if (target.providerId) {
      for (const p of aiConfigStore.providers) {
        p.enabled = p.id === target.providerId;
        if (p.enabled) {
          p.model = target.modelKey;
          p.maxTokens = resolved.maxTokens;
        }
        await aiConfigStore.saveProvider({ ...p });
      }
    }
  }

  function setModelEffort(modelId: string, effort: EffortLevel) {
    const target = models.value.find((m) => m.id === modelId);
    const validEffort = target && target.efforts.includes(effort) ? effort : 'Auto';
    customEfforts.value = { ...customEfforts.value, [modelId]: validEffort };
    try { localStorage.setItem(EFFORT_STORAGE_KEY, JSON.stringify(customEfforts.value)); } catch {}
    applyEffortToSettings(validEffort, target);
    selectModel(modelId);
  }

  return {
    mode,
    autoMode,
    models,
    activeModel,
    activeModelId,
    isPingingModels,
    refreshConnectedModels,
    toggleFavModel,
    selectModel,
    setModelEffort,
  };
}
