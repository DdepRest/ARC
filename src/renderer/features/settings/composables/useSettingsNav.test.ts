import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsNav, SETTINGS_MENU } from './useSettingsNav';
import {
  getQuantCompatibility,
  useModelHubSession,
  resetModelHubSessionForTests
} from './useModelHubSession';
import { useLocalAIEngine, getLocalEngineSessionState } from './useLocalAIEngine';
import {
  useAiConfigStore,
  buildProviderFingerprint,
  hashSecretFingerprint,
  type AIProvider
} from '../../../stores/aiConfig';
import { useSettingsStore } from '../stores/settings.store';
import { validateProviderEndpoint } from '../logic/provider-validation';
import { getFallbackContourStatus, computeAiSectionStatuses } from '../logic/ai-status';

describe('useSettingsNav Infrastructure & Intelligence Telemetry Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetModelHubSessionForTests();
    const localSession = getLocalEngineSessionState();
    localSession.isOllamaOnline.value = false;
    localSession.isBuiltinDownloaded.value = false;
    localSession.builtinCheckError.value = null;
    localSession.verifiedInference.value = null;

    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString();
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        }
      };
    })();
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize with default activeTab and activeSection', () => {
    const { activeTab, activeSection, SETTINGS_MENU: menu } = useSettingsNav();
    expect(activeTab.value).toBe('core');
    expect(activeSection.value).toBe(menu[0].sections[0].id);
  });

  it('should select tab and set activeSection to first section of that category', () => {
    const { activeTab, activeSection, selectTab } = useSettingsNav();
    selectTab('intelligence');
    expect(activeTab.value).toBe('intelligence');
    expect(activeSection.value).toBe('section-router');
  });

  it('should navigate to specific section across tabs', async () => {
    const { activeTab, activeSection, navigateToSection } = useSettingsNav();
    await navigateToSection('intelligence', 'section-providers');
    expect(activeTab.value).toBe('intelligence');
    expect(activeSection.value).toBe('section-providers');
  });

  it('should filter menu and calculate matchCount per category when searching', () => {
    const { searchQuery, filteredMenu, clearSearch } = useSettingsNav();
    searchQuery.value = 'voice';
    const voiceCat = filteredMenu.value.find(c => c.id === 'voice');
    expect(voiceCat).toBeDefined();
    expect(voiceCat?.matchCount).toBeGreaterThan(0);
    clearSearch();
    expect(searchQuery.value).toBe('');
  });

  it('should toggle sidebar collapsed state', () => {
    const { isSidebarCollapsed, toggleSidebar } = useSettingsNav();
    const initial = isSidebarCollapsed.value;
    toggleSidebar();
    expect(isSidebarCollapsed.value).toBe(!initial);
    toggleSidebar();
    expect(isSidebarCollapsed.value).toBe(initial);
  });

  it('should format category and section labels correctly according to language', () => {
    const { categoryLabel, sectionLabel } = useSettingsNav();
    const cat = SETTINGS_MENU[0];
    const sec = cat.sections[0];
    expect(categoryLabel(cat, false)).toBe(cat.labelRu);
    expect(categoryLabel(cat, true)).toBe(cat.labelEn);
    expect(sectionLabel(sec, false)).toBe(sec.labelRu);
    expect(sectionLabel(sec, true)).toBe(sec.labelEn);
  });

  it('should jump to first result when searching', async () => {
    const { searchQuery, jumpToFirstResult, activeTab, activeSection } = useSettingsNav();
    searchQuery.value = 'stt';
    jumpToFirstResult();
    expect(activeTab.value).toBe('voice');
    expect(activeSection.value).toBe('section-stt');
  });

  it('should enable split navigation exclusively for intelligence category in Stage 2-4', () => {
    const { isSplitNavigationTab } = useSettingsNav();
    expect(isSplitNavigationTab('intelligence')).toBe(true);
    expect(isSplitNavigationTab('core')).toBe(false);
    expect(isSplitNavigationTab('voice')).toBe(false);
    expect(isSplitNavigationTab('system')).toBe(false);
    expect(isSplitNavigationTab('updates')).toBe(false);
  });

  it('should persist and retrieve per-section scroll positions independently', () => {
    const { saveSectionScroll, getSectionScroll } = useSettingsNav();
    expect(getSectionScroll('section-router')).toBe(0);
    saveSectionScroll('section-router', 240);
    saveSectionScroll('section-providers', 512);
    saveSectionScroll('section-local', -20);
    expect(getSectionScroll('section-router')).toBe(240);
    expect(getSectionScroll('section-providers')).toBe(512);
    expect(getSectionScroll('section-local')).toBe(0);
  });

  it('should return UNKNOWN memory compatibility when RAM/VRAM is not detected', () => {
    expect(getQuantCompatibility(2.0, null)).toBe('UNKNOWN');
    expect(getQuantCompatibility(2.0, 0)).toBe('UNKNOWN');
    expect(getQuantCompatibility(2.0, 8)).toBe('COMPATIBLE');
    expect(getQuantCompatibility(12.0, 8)).toBe('INCOMPATIBLE');
  });

  it('should never use navigator.deviceMemory and only read RAM from getSystemMetrics', async () => {
    vi.stubGlobal('navigator', { deviceMemory: 8 });
    vi.stubGlobal('window', {});
    const hub = useModelHubSession();
    await hub.initializeSession();
    expect(hub.systemRamGb.value).toBeNull();

    resetModelHubSessionForTests();
    vi.stubGlobal('window', {
      api: {
        getSystemMetrics: vi.fn().mockResolvedValue({ memoryTotalMb: 32768, vramTotalMb: 8192 }),
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        listSttModels: vi.fn().mockResolvedValue([]),
        getTtsServerStatus: vi.fn().mockResolvedValue({ status: 'stopped' })
      }
    });
    await hub.initializeSession();
    expect(hub.systemRamGb.value).toBe(32);
    expect(hub.systemVramGb.value).toBe(8);
  });

  it('should require serverStatus.status === "ready" for TTS ACTIVE status and count canonical quants without duplicate STT aliases', async () => {
    const hub = useModelHubSession();

    // Case 1: activeEngine is 'silero', but serverStatus is 'starting' -> must stay BUNDLED_UNVERIFIED
    vi.stubGlobal('window', {
      api: {
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        listSttModels: vi.fn().mockResolvedValue([
          { id: 'zipformer-ru', downloaded: true },
          { id: 'whisper-small', downloaded: true }
        ]),
        getTtsServerStatus: vi.fn().mockResolvedValue({ status: 'starting' }),
        getTtsActiveEngine: vi.fn().mockResolvedValue({ activeEngine: 'silero' })
      }
    });
    await hub.checkAllStatuses();
    expect(hub.diskCheckStatus.value).toBe('SYNCED');
    expect(hub.ttsVerificationStatus.value).toBe('BUNDLED_UNVERIFIED');
    expect(hub.downloadState.value['v5_6_ru.pt']?.downloaded).toBe(false);
    // Only 2 canonical STT quants ('zipformer-ru' and 'whisper-small'), no extra alias inflation
    expect(hub.installedQuantsCount.value).toBe(2);

    // Case 2: serverStatus.status === 'ready' -> TTS becomes ACTIVE and adds 1 canonical quant
    vi.stubGlobal('window', {
      api: {
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        listSttModels: vi.fn().mockResolvedValue([
          { id: 'zipformer-ru', downloaded: true },
          { id: 'whisper-small', downloaded: true }
        ]),
        getTtsServerStatus: vi.fn().mockResolvedValue({ status: 'ready' }),
        getTtsActiveEngine: vi.fn().mockResolvedValue({ activeEngine: 'silero' })
      }
    });
    await hub.checkAllStatuses();
    expect(hub.ttsVerificationStatus.value).toBe('ACTIVE');
    expect(hub.downloadState.value['v5_6_ru.pt']?.downloaded).toBe(true);
    expect(hub.installedQuantsCount.value).toBe(3);
  });

  it('should invalidate provider test state when API key is replaced with another key of the exact same length', async () => {
    const store = useAiConfigStore();
    const keyA = 'AIzaSyA11111111111111111111111111111111';
    const keyB = 'AIzaSyB22222222222222222222222222222222';
    expect(keyA.length).toBe(keyB.length);
    expect(hashSecretFingerprint(keyA)).not.toBe(hashSecretFingerprint(keyB));

    const provider: AIProvider = {
      id: 'gemini-main',
      name: 'Google Gemini',
      type: 'cloud',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKey: keyA,
      model: 'gemini-2.5-flash',
      priority: 1,
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true
    };

    const fpA = buildProviderFingerprint(provider);
    const fpB = buildProviderFingerprint({ ...provider, apiKey: keyB });
    expect(fpA).not.toBe(fpB);
    expect(fpA).not.toContain(keyA);
    expect(fpB).not.toContain(keyB);

    vi.stubGlobal('window', {
      api: {
        testAiConnection: vi.fn().mockResolvedValue({ success: true }),
        saveAiProvider: vi.fn().mockResolvedValue(true),
        getAiProviders: vi.fn().mockResolvedValue([
          { ...provider, apiKey: '••••••••••••••••' }
        ])
      }
    });

    await store.testConnection(provider);
    expect(store.getProviderTestState(provider)?.status).toBe('success');

    // Reloading providers masks the key to '••••••••••••••••', which must preserve verification for the same key
    await store.loadProviders();
    expect(store.getProviderTestState(store.providers[0])?.status).toBe('success');

    // Saving a new key of the EXACT same length via saveProvider (e.g. from GeminiKeyModal) must invalidate verification
    await store.saveProvider({ ...provider, apiKey: keyB });
    expect(store.getProviderTestState(store.providers[0])).toBeNull();
    expect(store.getProviderTestState({ ...provider, apiKey: keyB })).toBeNull();
  });

  it('should validate provider endpoint protocols strictly', () => {
    expect(validateProviderEndpoint('https://api.openai.com/v1/chat/completions').valid).toBe(true);
    expect(validateProviderEndpoint('http://127.0.0.1:11434/v1/chat/completions').valid).toBe(true);
    expect(validateProviderEndpoint('ftp://example.com').valid).toBe(false);
    expect(validateProviderEndpoint('not a url').valid).toBe(false);
    expect(validateProviderEndpoint('').valid).toBe(false);
  });

  it('should scope verified local inference strictly to active {engine, model} and invalidate when GGUF weights disappear', async () => {
    const settings = useSettingsStore();
    settings.localLLMModel = 'builtin';
    settings.builtinLLMModel = 'LFM3-1.7B-Q4_K_M.gguf';

    const local = useLocalAIEngine();
    const session = getLocalEngineSessionState();
    session.isBuiltinDownloaded.value = true;
    session.builtinCheckError.value = null;
    session.verifiedInference.value = {
      engine: 'builtin',
      model: 'LFM3-1.7B-Q4_K_M.gguf',
      checkedAt: Date.now()
    };

    expect(local.isCurrentTargetVerified.value).toBe(true);

    // Switching GGUF model invalidates verification of the new target
    settings.builtinLLMModel = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
    expect(local.isCurrentTargetVerified.value).toBe(false);

    // Switching back to LFM3 while weights are present keeps verification
    settings.builtinLLMModel = 'LFM3-1.7B-Q4_K_M.gguf';
    expect(local.isCurrentTargetVerified.value).toBe(true);

    // If re-checking builtin reports file missing on disk, verifiedInference must be invalidated
    vi.stubGlobal('window', {
      api: {
        checkBuiltinModel: vi.fn().mockResolvedValue(false)
      }
    });
    await local.checkBuiltin();
    expect(session.isBuiltinDownloaded.value).toBe(false);
    expect(session.verifiedInference.value).toBeNull();
    expect(local.isCurrentTargetVerified.value).toBe(false);
  });

  it('should compute honest fallback contour and intelligence section statuses', () => {
    const statuses = computeAiSectionStatuses({
      forcedOfflineMode: false,
      useLocalLLM: true,
      useSmartRouting: false,
      localLLMPriority: 'fallback',
      localLLMModel: 'llama3.2',
      builtinLLMModel: 'LFM3-1.7B-Q4_K_M.gguf',
      providers: [],
      getProviderTestState: () => null,
      isBuiltinDownloaded: false,
      isOllamaOnline: true,
      verifiedInference: null,
      diskCheckStatus: 'IDLE',
      installedQuantsCount: 0,
      hasActiveDownload: false
    });

    expect(statuses['section-router'].tone).toBe('warn');
    expect(statuses['section-router'].label).toContain('НЕ ПРОВЕРЕН');
    expect(statuses['section-local'].tone).toBe('warn');
    expect(statuses['section-local'].label).toBe('СЕРВЕР ОНЛАЙН');
    expect(statuses['section-providers'].tone).toBe('warn');
    expect(statuses['section-models'].tone).toBe('off');

    const disabledFallback = getFallbackContourStatus({
      forcedOfflineMode: false,
      useLocalLLM: false,
      useSmartRouting: false,
      localLLMPriority: 'fallback',
      localLLMModel: 'builtin',
      builtinLLMModel: 'LFM3-1.7B-Q4_K_M.gguf',
      providers: [],
      getProviderTestState: () => null,
      isBuiltinDownloaded: false,
      isOllamaOnline: false,
      verifiedInference: null
    });
    expect(disabledFallback.tone).toBe('off');
  });

  it('should expose live aiSectionStatuses reactive summary via useSettingsNav', () => {
    const { aiSectionStatuses } = useSettingsNav();
    expect(aiSectionStatuses.value).not.toBeNull();
    expect(aiSectionStatuses.value?.['section-router']).toBeDefined();
    expect(aiSectionStatuses.value?.['section-providers']).toBeDefined();
    expect(aiSectionStatuses.value?.['section-local']).toBeDefined();
    expect(aiSectionStatuses.value?.['section-models']).toBeDefined();
  });
});
