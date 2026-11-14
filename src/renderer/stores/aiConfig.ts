import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export interface AIProvider {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  endpoint: string;
  apiKey?: string;
  model: string;
  selectedModels?: string[];
  routingStrategy?: 'smart_route' | 'fallback' | 'ensemble';
  priority: number;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
  isExclusive?: boolean;
  modelsUpdatedAt?: number;
  modelsFetchError?: string;
  lastModelsFetchAt?: number;
  noAuthHeader?: boolean;
}

export interface ProviderTestState {
  status: 'untested' | 'loading' | 'success' | 'error';
  message?: string;
  checkedAt?: number;
  configFingerprint: string;
}

const MASKED_KEY_VALUE = '••••••••••••••••';

export function hashSecretFingerprint(secret: string): string {
  if (!secret) return 'empty';
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < secret.length; i++) {
    const code = secret.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code ^ ((i + 1) * 0x85ebca6b);
    h2 = Math.imul(h2, 0xc2b2ae35);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${secret.length}:${hex1}${hex2}`;
}

export function buildProviderFingerprint(
  provider: Partial<AIProvider>,
  knownKeyDigest?: string
): string {
  const endpoint = (provider.endpoint || '').trim();
  const noAuth = Boolean(provider.noAuthHeader);
  const rawKey = (provider.apiKey || '').trim();
  const keyDigest =
    rawKey === MASKED_KEY_VALUE
      ? knownKeyDigest || hashSecretFingerprint(MASKED_KEY_VALUE)
      : hashSecretFingerprint(rawKey);
  const type = provider.type || 'cloud';
  const model = (provider.model || '').trim();
  return `${type}|${endpoint}|model:${model}|noAuth:${noAuth}|keyHash:${keyDigest}`;
}

export const useAiConfigStore = defineStore('aiConfig', () => {
  const providers = ref<AIProvider[]>([]);
  const quarantinedProviders = ref<{ id: string; name: string; quarantineUntil: number }[]>([]);
  const providerTestStates = ref<Record<string, ProviderTestState>>({});
  const providerKeyDigests = ref<Record<string, string>>({});
  const isLoading = ref(false);
  const isSafeStorageAvailable = ref(false);
  const smartCacheEnabled = ref<boolean>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('arc_smart_cache_enabled') === 'true' : false
  );

  watch(smartCacheEnabled, (val) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('arc_smart_cache_enabled', String(val));
    }
  });

  async function checkSafeStorage() {
    if (typeof window !== 'undefined' && (window.api as any)?.settingsIsSafeStorageAvailable) {
      try {
        const res = await (window.api as any).settingsIsSafeStorageAvailable();
        isSafeStorageAvailable.value = res?.available ?? false;
      } catch {
        isSafeStorageAvailable.value = false;
      }
    }
  }

  async function refreshQuarantine() {
    if (typeof window === 'undefined' || !window.api || !(window.api as any).getQuarantinedAiProviders) return;
    try {
      quarantinedProviders.value = await (window.api as any).getQuarantinedAiProviders();
    } catch (e) {
      console.error('Failed to get quarantined AI providers', e);
    }
  }

  async function resetQuarantine(id: string) {
    if (typeof window === 'undefined' || !window.api || !(window.api as any).resetAiProviderHealth) return;
    try {
      await (window.api as any).resetAiProviderHealth(id);
      await refreshQuarantine();
    } catch (e) {
      console.error('Failed to reset AI provider health', e);
    }
  }

  async function migrateLegacyApiKeys() {
    if (typeof window === 'undefined' || !window.api || !(window.api as any).settingsSetKey) return;
    try {
      const openAiKey = localStorage.getItem('arc_openai_api_key') || localStorage.getItem('openai_api_key');
      if (openAiKey) {
        await (window.api as any).settingsSetKey('openai_api_key', openAiKey);
        localStorage.removeItem('arc_openai_api_key');
        localStorage.removeItem('openai_api_key');
      }
      const openRouterKey = localStorage.getItem('arc_openrouter_api_key') || localStorage.getItem('openrouter_api_key');
      if (openRouterKey) {
        await (window.api as any).settingsSetKey('openrouter_api_key', openRouterKey);
        localStorage.removeItem('arc_openrouter_api_key');
        localStorage.removeItem('openrouter_api_key');
      }
    } catch (e) {
      console.warn('Failed to migrate legacy API keys to safeStorage:', e);
    }
  }

  async function loadProviders() {
    if (typeof window === 'undefined' || !window.api) return;
    isLoading.value = true;
    try {
      await checkSafeStorage();
      await migrateLegacyApiKeys();
      providers.value = await window.api.getAiProviders();
      await refreshQuarantine();
    } catch (e) {
      console.error('Failed to load AI providers', e);
    } finally {
      isLoading.value = false;
    }
  }

  function setProviderTestState(id: string, state: ProviderTestState) {
    providerTestStates.value = {
      ...providerTestStates.value,
      [id]: state
    };
  }

  function clearProviderTestState(id: string) {
    if (!providerTestStates.value[id]) return;
    const next = { ...providerTestStates.value };
    delete next[id];
    providerTestStates.value = next;
  }

  function syncProviderKeyDigest(provider: Partial<AIProvider> & { id: string }): boolean {
    const rawKey = (provider.apiKey || '').trim();
    if (!rawKey) {
      const changed = Boolean(providerKeyDigests.value[provider.id]);
      if (changed) {
        const next = { ...providerKeyDigests.value };
        delete next[provider.id];
        providerKeyDigests.value = next;
      }
      return changed;
    }
    if (rawKey === MASKED_KEY_VALUE) {
      return false;
    }
    const newDigest = hashSecretFingerprint(rawKey);
    const prevDigest = providerKeyDigests.value[provider.id];
    if (prevDigest !== newDigest) {
      providerKeyDigests.value = {
        ...providerKeyDigests.value,
        [provider.id]: newDigest
      };
      return true;
    }
    return false;
  }

  function getProviderTestState(provider: Partial<AIProvider> & { id: string }): ProviderTestState | null {
    const entry = providerTestStates.value[provider.id];
    if (!entry) return null;
    const fp = buildProviderFingerprint(provider, providerKeyDigests.value[provider.id]);
    if (entry.configFingerprint !== fp) {
      return null;
    }
    return entry;
  }

  async function saveProvider(provider: AIProvider) {
    const keyChanged = syncProviderKeyDigest(provider);
    const existingTest = providerTestStates.value[provider.id];
    const currentFp = buildProviderFingerprint(provider, providerKeyDigests.value[provider.id]);
    if (keyChanged || (existingTest && existingTest.configFingerprint !== currentFp)) {
      clearProviderTestState(provider.id);
    }
    if (typeof window === 'undefined' || !window.api) {
      return { success: false, error: 'Интерфейс Electron API недоступен' };
    }
    try {
      const res = await window.api.saveAiProvider(JSON.parse(JSON.stringify(provider)));
      if (res && res.success === false) {
        console.error('Failed to save AI provider:', res.error);
        return res;
      }
      await loadProviders();
      return res || { success: true };
    } catch (e) {
      console.error('Failed to save AI provider', e);
      return { success: false, error: (e as any)?.message || String(e) };
    }
  }

  async function testConnection(provider: AIProvider): Promise<{ success: boolean; error?: string }> {
    const existingSaved = providers.value.find((p) => p.id === provider.id);
    if (!existingSaved || existingSaved.apiKey !== MASKED_KEY_VALUE) {
      syncProviderKeyDigest(provider);
    }
    const fp = buildProviderFingerprint(provider, providerKeyDigests.value[provider.id]);
    setProviderTestState(provider.id, { status: 'loading', configFingerprint: fp });
    if (typeof window === 'undefined' || !window.api) {
      const errMsg = 'Интерфейс API недоступен';
      setProviderTestState(provider.id, {
        status: 'error',
        message: errMsg,
        checkedAt: Date.now(),
        configFingerprint: fp
      });
      return { success: false, error: errMsg };
    }
    try {
      const res = await (window.api as any).testAiConnection(JSON.parse(JSON.stringify(provider)));
      setProviderTestState(provider.id, {
        status: res?.success ? 'success' : 'error',
        message: res?.success ? undefined : (res?.error || 'Ошибка связи с сервером'),
        checkedAt: Date.now(),
        configFingerprint: fp
      });
      return res;
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      setProviderTestState(provider.id, {
        status: 'error',
        message: errMsg,
        checkedAt: Date.now(),
        configFingerprint: fp
      });
      return { success: false, error: errMsg };
    }
  }

  async function deleteProvider(id: string) {
    clearProviderTestState(id);
    if (typeof window === 'undefined' || !window.api) return;
    try {
      await (window.api as any).deleteAiProvider(id);
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete AI provider', e);
    }
  }

  async function scanFreeLlm(host?: string) {
    if (typeof window === 'undefined' || !window.api) return { found: false };
    try {
      return await (window.api as any).scanFreeLlm(host);
    } catch (e: any) {
      console.error('Failed to scan FreeLLM', e);
      return { found: false, error: e?.message || String(e) };
    }
  }

  return {
    providers,
    quarantinedProviders,
    providerTestStates,
    isLoading,
    isSafeStorageAvailable,
    smartCacheEnabled,
    checkSafeStorage,
    refreshQuarantine,
    resetQuarantine,
    loadProviders,
    saveProvider,
    deleteProvider,
    testConnection,
    setProviderTestState,
    clearProviderTestState,
    getProviderTestState,
    scanFreeLlm
  };
});
