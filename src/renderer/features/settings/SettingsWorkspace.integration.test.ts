import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSSRApp, compile, ref, computed, watch, nextTick, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsNav, type SettingsTab } from './composables/useSettingsNav';
import {
  useModelHubSession,
  resetModelHubSessionForTests,
  getQuantCompatibility
} from './composables/useModelHubSession';
import { getLocalEngineSessionState } from './composables/useLocalAIEngine';
import { useSettingsStore } from './stores/settings.store';
import { useAiConfigStore, type AIProvider } from '../../stores/aiConfig';
import { useModelDownloadStore } from '../modelDownload/stores/modelDownload.store';
import { useSettingsVisibility } from './composables/useSettingsVisibility';
import { MODEL_REGISTRY, type ModelType } from './components/sections/model-hub.registry';
import { ProviderManager } from '../../../main/services/llm/providers/provider-manager';
import { SecretVaultService } from '../../../main/services/security/secret-vault.service';

function compileSfcTemplate(relativeVuePath: string) {
  const fullPath = path.resolve(__dirname, relativeVuePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const { descriptor } = parseSfc(source, { filename: fullPath });
  if (!descriptor.template) {
    throw new Error(`No <template> found in ${relativeVuePath}`);
  }
  return compile(descriptor.template.content);
}

const StubIcon = defineComponent({
  render() {
    return h('span', { class: 'stub-icon' });
  }
});

describe('SettingsWorkspace Integration Tests (Split Navigation, Telemetry, IPC & ARIA)', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    resetModelHubSessionForTests();

    const localSession = getLocalEngineSessionState();
    localSession.isOllamaOnline.value = false;
    localSession.checkingOllama.value = false;
    localSession.isBuiltinDownloaded.value = false;
    localSession.checkingBuiltin.value = false;
    localSession.builtinCheckError.value = null;
    localSession.verifiedInference.value = null;

    const storageMap: Record<string, string> = {};
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (k: string) => storageMap[k] ?? null,
        setItem: (k: string, v: string) => {
          storageMap[k] = String(v);
        },
        removeItem: (k: string) => {
          delete storageMap[k];
        },
        clear: () => {
          for (const k of Object.keys(storageMap)) delete storageMap[k];
        }
      },
      writable: true
    });

    const nav = useSettingsNav();
    nav.clearSearch();
    nav.activeTab.value = 'intelligence';
    nav.activeSection.value = 'section-router';
    nav.sectionScrollPositions.value = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders only one active Intelligence subsection page at a time via real AiSettings.vue and ModelManagerSection.vue templates (Split Navigation)', async () => {
    const nav = useSettingsNav();
    nav.activeTab.value = 'intelligence';

    const aiSettingsRender = compileSfcTemplate('./components/AiSettings.vue');
    const modelManagerRender = compileSfcTemplate('./components/sections/ModelManagerSection.vue');

    const ModelManagerHarness = defineComponent({
      components: {
        SettingsSectionHeader: defineComponent({
          props: ['title', 'statusLabel'],
          setup(props, { slots }) {
            return () =>
              h('header', { 'data-header': props.title }, [
                slots.default ? slots.default() : null,
                slots.summary ? slots.summary() : null
              ]);
          }
        }),
        SettingsGroup: defineComponent({
          props: ['title'],
          setup(props, { slots }) {
            return () => h('div', { 'data-group': props.title }, slots.default ? slots.default() : []);
          }
        }),
        CrossLink: StubIcon,
        ModelCard: defineComponent({
          props: ['model'],
          setup(props) {
            return () => h('article', { 'data-model-id': props.model?.id });
          }
        }),
        Cpu: StubIcon,
        CheckCircle: StubIcon,
        Loader2: StubIcon,
        HardDrive: StubIcon,
        RefreshCw: StubIcon,
        AlertTriangle: StubIcon,
        FolderOpen: StubIcon
      },
      setup() {
        const session = useModelHubSession();
        const activeFilter = ref<ModelType | 'all'>('all');
        const searchQuery = ref('');
        const sortBy = ref<'quality' | 'speed' | 'size'>('quality');
        const sizeFilter = ref<'all' | '<1' | '1-4' | '4-8' | '>8'>('all');
        const onlyCompatible = ref(false);
        const filters = [
          { id: 'all', name: 'Все' },
          { id: 'llm-gguf', name: 'LLM' },
          { id: 'stt-streaming', name: 'STT' },
          { id: 'tts', name: 'TTS' }
        ];
        const totalModelsCount = computed(() => MODEL_REGISTRY.length);
        const filteredModels = computed(() =>
          MODEL_REGISTRY.filter((m) =>
            !onlyCompatible.value || session.targetMemoryGb.value === null
              ? true
              : m.quants.some(
                  (q) => getQuantCompatibility(q.minRamGb, session.targetMemoryGb.value) === 'COMPATIBLE'
                )
          )
        );
        return {
          ...session,
          activeFilter,
          searchQuery,
          sortBy,
          sizeFilter,
          onlyCompatible,
          filters,
          resetFilters: () => {},
          totalModelsCount,
          canOpenDataFolder: computed(() => false),
          openDataFolder: () => {},
          hasAnyActiveDownload: computed(() => session.downloadStore.isDownloading),
          activeDownloadLabel: computed(() => session.downloadStore.currentFilename || 'модель'),
          activeDownloadPercent: computed(() => session.downloadStore.progressPercent),
          modelsHeaderStatus: computed(() => ({ label: 'НА ДИСКЕ: 0', tone: 'ok' })),
          diskBannerStyle: computed(() => ({
            iconCls: '',
            title: 'Хранилище синхронизировано',
            subtitle: 'Ожидание'
          })),
          filteredModels,
          HardDrive: StubIcon
        };
      },
      render: modelManagerRender
    });

    const AiSettingsHarness = defineComponent({
      components: {
        RoutingSection: defineComponent({
          setup() {
            return () => h('section', { id: 'section-router' }, 'Routing Workspace');
          }
        }),
        ProvidersSection: defineComponent({
          setup() {
            return () => h('section', { id: 'section-providers' }, 'Providers Workspace');
          }
        }),
        LocalAISection: defineComponent({
          setup() {
            return () => h('section', { id: 'section-local' }, 'Local AI Workspace');
          }
        }),
        ModelManagerSection: ModelManagerHarness
      },
      setup() {
        const VALID_SECTIONS = [
          'section-router',
          'section-providers',
          'section-local',
          'section-models'
        ] as const;
        const currentSectionId = computed(() =>
          nav.activeSection.value &&
          (VALID_SECTIONS as readonly string[]).includes(nav.activeSection.value)
            ? nav.activeSection.value
            : 'section-router'
        );
        return {
          scrollContainer: ref(null),
          currentSectionId,
          onScroll: () => {}
        };
      },
      render: aiSettingsRender
    });

    const renderAiWorkspace = async () => {
      const app = createSSRApp(AiSettingsHarness);
      app.use(pinia);
      return await renderToString(app);
    };

    nav.activeSection.value = 'section-router';
    const routerHtml = await renderAiWorkspace();
    expect(routerHtml).toContain('id="section-router"');
    expect(routerHtml).not.toContain('id="section-providers"');
    expect(routerHtml).not.toContain('id="section-local"');
    expect(routerHtml).not.toContain('id="section-models"');

    nav.activeSection.value = 'section-providers';
    const providersHtml = await renderAiWorkspace();
    expect(providersHtml).toContain('id="section-providers"');
    expect(providersHtml).not.toContain('id="section-router"');
    expect(providersHtml).not.toContain('id="section-local"');

    nav.activeSection.value = 'section-local';
    const localHtml = await renderAiWorkspace();
    expect(localHtml).toContain('id="section-local"');
    expect(localHtml).not.toContain('id="section-providers"');
    expect(localHtml).not.toContain('id="section-models"');

    nav.activeSection.value = 'section-models';
    const modelsHtml = await renderAiWorkspace();
    expect(modelsHtml).toContain('id="section-models"');
    expect(modelsHtml).toContain('Установлено ОЗУ');
    expect(modelsHtml).toContain('Поиск модели или вендора...');
    expect(modelsHtml).not.toContain('id="section-router"');
  });

  it('persists and restores scrollTop independently per Intelligence subsection page', async () => {
    const nav = useSettingsNav();
    nav.activeTab.value = 'intelligence';
    nav.activeSection.value = 'section-router';

    const mockContainer: any = {
      scrollTop: 345,
      scrollHeight: 1600,
      clientHeight: 800,
      scrollTo: vi.fn(({ top }: { top: number }) => {
        mockContainer.scrollTop = top;
      }),
      getBoundingClientRect: () => ({ top: 0, height: 800 })
    };

    const mockSectionEl: any = {
      id: 'section-router',
      closest: (sel: string) => (sel === '.settings-scroll-container' ? mockContainer : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      classList: { add: vi.fn(), remove: vi.fn() },
      getBoundingClientRect: () => ({ top: 0, height: 600 })
    };

    vi.stubGlobal('document', {
      getElementById: (id: string) => {
        mockSectionEl.id = id;
        return mockSectionEl;
      },
      querySelector: (sel: string) => (sel === '.settings-scroll-container' ? mockContainer : null),
      querySelectorAll: () => []
    });

    // User scrolls on section-router to 345px
    nav.handleViewScroll('intelligence', { currentTarget: mockContainer } as unknown as Event);
    expect(nav.getSectionScroll('section-router')).toBe(345);

    // Navigate to section-providers (starts at 0px) and scroll to 610px
    await nav.navigateToSection('intelligence', 'section-providers');
    expect(mockContainer.scrollTop).toBe(0);
    mockContainer.scrollTop = 610;
    nav.handleViewScroll('intelligence', { currentTarget: mockContainer } as unknown as Event);
    expect(nav.getSectionScroll('section-providers')).toBe(610);

    // Navigate back to section-router -> scrollTop is restored to 345px
    await nav.navigateToSection('intelligence', 'section-router');
    expect(mockContainer.scrollTop).toBe(345);
  });

  it('executes search jump to matching subsection and highlights target setting DOM node', async () => {
    vi.useFakeTimers();
    try {
      const nav = useSettingsNav();
      const settingsStore = useSettingsStore();

      const mockContainer: any = {
        scrollTop: 0,
        scrollTo: vi.fn(),
        getBoundingClientRect: () => ({ top: 0, height: 800 })
      };

      const highlightedRow: any = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        closest: () => mockContainer,
        getBoundingClientRect: () => ({ top: 180, height: 48 })
      };

      const mockSectionEl: any = {
        closest: () => mockContainer,
        querySelector: () => highlightedRow,
        querySelectorAll: () => [highlightedRow],
        classList: { add: vi.fn(), remove: vi.fn() },
        getBoundingClientRect: () => ({ top: 0, height: 600 })
      };

      vi.stubGlobal('document', {
        getElementById: () => mockSectionEl,
        querySelector: () => highlightedRow,
        querySelectorAll: () => [highlightedRow]
      });

      nav.searchQuery.value = 'smart routing';
      expect(nav.detailedSearchResults.value.length).toBeGreaterThan(0);

      nav.jumpToFirstResult();
      await nextTick();
      vi.advanceTimersByTime(60);

      expect(nav.activeTab.value).toBe('intelligence');
      expect(nav.activeSection.value).toBe('section-router');
      expect(highlightedRow.classList.add).toHaveBeenCalledWith('search-highlight');

      // Highlight cleans up after 2000ms
      vi.advanceTimersByTime(2100);
      expect(highlightedRow.classList.remove).toHaveBeenCalledWith('search-highlight');
      expect(settingsStore.pendingHighlightId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates provider verification on same-length API key replacement across masked reloads (P0.1 + GeminiKeyModal flow)', async () => {
    const aiStore = useAiConfigStore();
    const nav = useSettingsNav();

    // Verify GeminiKeyModal.vue explicitly clears provider test state before saveProvider
    const geminiModalSource = fs.readFileSync(
      path.resolve(__dirname, './components/sections/providers/GeminiKeyModal.vue'),
      'utf8'
    );
    expect(geminiModalSource).toContain('aiStore.clearProviderTestState(providerId)');

    const vaultSecrets = new Map<string, string>();
    const savedProviders = new Map<string, AIProvider>();

    const initialKey = 'AIzaSyKeyVersion1_0000000000000000000000';
    const replacedSameLenKey = 'AIzaSyKeyVersion2_9999999999999999999999';
    expect(initialKey.length).toBe(replacedSameLenKey.length);

    const baseProvider: AIProvider = {
      id: 'gemini-cloud',
      name: 'Google Gemini',
      type: 'cloud',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKey: initialKey,
      model: 'gemini-2.5-flash',
      priority: 1,
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true
    };
    savedProviders.set(baseProvider.id, { ...baseProvider });
    vaultSecrets.set(`ai_provider_key_${baseProvider.id}`, initialKey);

    vi.stubGlobal('window', {
      api: {
        getAiProviders: vi.fn(async () => {
          return Array.from(savedProviders.values()).map((p) => ({
            ...p,
            apiKey: vaultSecrets.has(`ai_provider_key_${p.id}`) ? '••••••••••••••••' : ''
          }));
        }),
        saveAiProvider: vi.fn(async (p: AIProvider) => {
          if (p.apiKey && p.apiKey !== '••••••••••••••••') {
            vaultSecrets.set(`ai_provider_key_${p.id}`, p.apiKey);
          }
          savedProviders.set(p.id, { ...p, apiKey: '' });
          return true;
        }),
        testAiConnection: vi.fn(async () => ({ success: true }))
      }
    });

    // 1. Test connection with initialKey -> verified
    await aiStore.saveProvider({ ...baseProvider, apiKey: initialKey });
    const testedRes = await aiStore.testConnection(aiStore.providers[0]);
    expect(testedRes.success).toBe(true);
    expect(aiStore.getProviderTestState(aiStore.providers[0])?.status).toBe('success');
    expect(nav.aiSectionStatuses.value?.['section-providers'].label).toBe('ПРОВЕРЕНО: 1');

    // 2. Reloading providers returns '••••••••••••••••' -> verification remains intact for unchanged key
    await aiStore.loadProviders();
    expect(aiStore.providers[0].apiKey).toBe('••••••••••••••••');
    expect(aiStore.getProviderTestState(aiStore.providers[0])?.status).toBe('success');

    // 3. Replace API key with another key of the EXACT same length (via GeminiKeyModal saveProvider)
    aiStore.clearProviderTestState(baseProvider.id);
    await aiStore.saveProvider({
      ...aiStore.providers[0],
      apiKey: replacedSameLenKey
    });

    expect(aiStore.providers[0].apiKey).toBe('••••••••••••••••');
    expect(aiStore.getProviderTestState(aiStore.providers[0])).toBeNull();
    expect(nav.aiSectionStatuses.value?.['section-providers'].label).toBe('НЕ ПРОВЕРЕНО');

    // 4. Even if clearProviderTestState was NOT called before saveProvider, digest change invalidates state
    await aiStore.testConnection(aiStore.providers[0]);
    expect(aiStore.getProviderTestState(aiStore.providers[0])?.status).toBe('success');

    const thirdSameLenKey = 'AIzaSyKeyVersion3_7777777777777777777777';
    expect(thirdSameLenKey.length).toBe(replacedSameLenKey.length);
    await aiStore.saveProvider({
      ...aiStore.providers[0],
      apiKey: thirdSameLenKey
    });
    expect(aiStore.getProviderTestState(aiStore.providers[0])).toBeNull();
  });

  it('preserves GGUF and STT download progress across subsection unmounts and handles completion, error, and cancellation (P0.2)', async () => {
    let ggufProgressCallback: ((data: any) => void) | null = null;
    let sttProgressCallback: ((data: any) => void) | null = null;
    let resolveGgufDownload: ((val: any) => void) | null = null;

    vi.stubGlobal('window', {
      api: {
        getSystemMetrics: vi.fn().mockResolvedValue({ memoryTotalMb: 16384, vramTotalMb: 0 }),
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        listSttModels: vi.fn().mockResolvedValue([]),
        getTtsServerStatus: vi.fn().mockResolvedValue({ status: 'stopped' }),
        onModelDownloadProgress: vi.fn((cb: (data: any) => void) => {
          ggufProgressCallback = cb;
          return () => {};
        }),
        onSttDownloadProgress: vi.fn((cb: (data: any) => void) => {
          sttProgressCallback = cb;
          return () => {};
        }),
        downloadBuiltinModel: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveGgufDownload = resolve;
            })
        ),
        cancelBuiltinModelDownload: vi.fn().mockResolvedValue({ success: true }),
        downloadSttModel: vi.fn().mockResolvedValue({ success: true })
      }
    });

    const hub = useModelHubSession();
    const downloadStore = useModelDownloadStore();
    const nav = useSettingsNav();

    await hub.initializeSession();
    expect(ggufProgressCallback).toBeTypeOf('function');
    expect(sttProgressCallback).toBeTypeOf('function');

    // Start GGUF download on section-models
    nav.activeSection.value = 'section-models';
    const ggufQuantId = 'qwen1.5-0.5b-chat-q4_k_m.gguf';
    const downloadPromise = hub.downloadQuant('llm-gguf', ggufQuantId);

    // User switches away from section-models to section-router and section-providers (unmounting ModelManagerSection & LocalAISection)
    nav.activeSection.value = 'section-router';
    await nextTick();
    nav.activeSection.value = 'section-providers';
    await nextTick();

    // Emit GGUF progress while on section-providers
    ggufProgressCallback!({
      filename: ggufQuantId,
      bytes_done: 195 * 1024 * 1024,
      total_bytes: 390 * 1024 * 1024
    });

    expect(downloadStore.isDownloading).toBe(true);
    expect(hub.isQuantDownloading(ggufQuantId)).toBe(true);
    expect(hub.getQuantProgress(ggufQuantId)).toBe(50);
    expect(nav.aiSectionStatuses.value?.['section-models'].label).toBe('ЗАГРУЗКА...');

    // Emit STT progress while still on section-providers
    sttProgressCallback!({
      modelId: 'sherpa-zipformer-ru',
      status: 'downloading',
      percent: 65
    });
    expect(hub.isQuantDownloading('zipformer-ru')).toBe(true);
    expect(hub.getQuantProgress('zipformer-ru')).toBe(65);

    // Cancel active download and verify cleanup
    await hub.cancelActiveDownload();
    expect(downloadStore.isDownloading).toBe(false);
    expect(hub.isQuantDownloading('zipformer-ru')).toBe(false);

    resolveGgufDownload!({ success: false, cancelled: true });
    await downloadPromise;

    // Emit GGUF download error and verify error propagation
    ggufProgressCallback!({
      filename: ggufQuantId,
      bytes_done: 0,
      total_bytes: 0,
      error: 'Сетевой сбой при скачивании весов'
    });
    expect(hub.downloadActionError.value).toBe('Сетевой сбой при скачивании весов');
  });

  it('maintains valid ARIA tablist/tab/tabpanel attributes across desktop, active search, and mobile content modes via real SettingsPanel.vue & SettingsMenu.vue templates (P1.7)', async () => {
    const nav = useSettingsNav();
    const store = useSettingsStore();
    const { isCompactMode, toggleCompactMode } = useSettingsVisibility();

    const settingsMenuRender = compileSfcTemplate('./components/SettingsMenu.vue');
    const settingsPanelRender = compileSfcTemplate('./components/SettingsPanel.vue');

    const SettingsMenuHarness = defineComponent({
      components: {
        Sliders: StubIcon,
        Search: StubIcon,
        X: StubIcon,
        ChevronDown: StubIcon,
        ArrowLeft: StubIcon
      },
      setup() {
        return {
          store,
          isCompactMode,
          toggleCompactMode,
          searchInputRef: ref(null),
          searchQuery: nav.searchQuery,
          detailedSearchResults: nav.detailedSearchResults,
          isIndexReady: ref(true),
          SETTINGS_MENU: nav.SETTINGS_MENU.map((c) => ({ ...c, icon: StubIcon })),
          activeTab: nav.activeTab,
          activeSection: nav.activeSection,
          aiSectionStatuses: nav.aiSectionStatuses,
          categoryLabel: nav.categoryLabel,
          sectionLabel: nav.sectionLabel,
          clearSearch: nav.clearSearch,
          handleSearchEnter: () => {},
          selectSearchResult: () => {},
          handleCategoryClick: (id: SettingsTab) => nav.selectTab(id),
          onTabKeydown: () => {},
          handleSectionClick: (tab: SettingsTab, secId: string) => nav.navigateToSection(tab, secId),
          isSectionActive: (tab: SettingsTab, secId: string) =>
            nav.activeTab.value === tab && nav.activeSection.value === secId,
          statusDotClass: () => 'bg-[var(--status-ok)]',
          exitToCore: () => {}
        };
      },
      render: settingsMenuRender
    });

    const createPanelHarness = (isMobileVal: boolean, initialMobileView: 'menu' | 'content') => {
      return defineComponent({
        components: {
          SettingsMenu: SettingsMenuHarness,
          ChevronLeft: StubIcon,
          ConflictBanner: StubIcon,
          GeneralSettingsSection: StubIcon,
          VoiceSettings: StubIcon,
          AiSettings: StubIcon,
          PerformanceSettings: StubIcon,
          UpdatesHistorySection: StubIcon,
          SettingsSkeleton: StubIcon
        },
        setup() {
          const isMobile = ref(isMobileVal);
          const mobileView = ref<'menu' | 'content'>(initialMobileView);
          const isTablistRendered = computed(
            () => (!isMobile.value || mobileView.value === 'menu') && !nav.searchQuery.value.trim()
          );
          const currentActiveCategoryLabel = computed(() => {
            const cat = nav.SETTINGS_MENU.find((c) => c.id === nav.activeTab.value);
            if (!cat) return store.language === 'EN' ? 'Settings' : 'Настройки';
            return store.language === 'EN' ? cat.labelEn : cat.labelRu;
          });
          const currentActiveSectionLabel = computed(() => 'Маршрутизация моделей');
          watch(nav.activeSection, () => {
            if (isMobile.value) mobileView.value = 'content';
          });
          return {
            store,
            activeTab: nav.activeTab,
            activeSection: nav.activeSection,
            searchQuery: nav.searchQuery,
            isCompactMode,
            isMobile,
            mobileView,
            isTablistRendered,
            currentActiveCategoryLabel,
            currentActiveSectionLabel,
            activeConflicts: computed(() => []),
            onSearchNavigate: () => {
              if (isMobile.value) mobileView.value = 'content';
            }
          };
        },
        render: settingsPanelRender
      });
    };

    nav.activeTab.value = 'intelligence';
    nav.activeSection.value = 'section-router';
    nav.searchQuery.value = '';

    // 1. Desktop mode with no search query -> tablist is rendered, tabpanel uses aria-labelledby="tab-intelligence"
    const desktopApp = createSSRApp(createPanelHarness(false, 'menu'));
    desktopApp.use(pinia);
    const desktopHtml = await renderToString(desktopApp);

    expect(desktopHtml).toContain('role="tablist"');
    expect(desktopHtml).toContain('id="tab-intelligence"');
    expect(desktopHtml).toContain('aria-selected="true"');
    expect(desktopHtml).toContain('aria-controls="panel-intelligence"');
    expect(desktopHtml).toContain('role="tabpanel"');
    expect(desktopHtml).toContain('aria-labelledby="tab-intelligence"');

    // 2. Active search mode -> tablist is hidden by search results, so tabpanel must use aria-label instead of dangling aria-labelledby
    nav.searchQuery.value = 'маршрутизация';
    const searchApp = createSSRApp(createPanelHarness(false, 'menu'));
    searchApp.use(pinia);
    const searchHtml = await renderToString(searchApp);

    expect(searchHtml).not.toContain('role="tablist"');
    expect(searchHtml).toContain('role="tabpanel"');
    expect(searchHtml).not.toContain('aria-labelledby="tab-intelligence"');
    expect(searchHtml).toContain('aria-label="Интеллект"');

    // 3. Mobile content mode (isMobile = true, mobileView = 'content') -> SettingsMenu is unmounted, no dangling aria-labelledby
    nav.searchQuery.value = '';
    const mobileContentApp = createSSRApp(createPanelHarness(true, 'content'));
    mobileContentApp.use(pinia);
    const mobileHtml = await renderToString(mobileContentApp);

    expect(mobileHtml).not.toContain('role="tablist"');
    expect(mobileHtml).toContain('role="tabpanel"');
    expect(mobileHtml).not.toContain('aria-labelledby="tab-intelligence"');
    expect(mobileHtml).toContain('aria-label="Интеллект"');
  });

  it('integrates renderer useAiConfigStore with real main-process ProviderManager and SecretVaultService (P2.11)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-settings-ipc-test-'));
    const vaultPath = path.join(tmpDir, 'secrets.vault.json');
    const providersPath = path.join(tmpDir, 'ai-providers.json');

    try {
      const realVault = new SecretVaultService(vaultPath);
      const realProviderManager = new ProviderManager(providersPath, realVault);
      const aiStore = useAiConfigStore();

      const key1 = 'sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const key2 = 'sk-or-v1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      expect(key1.length).toBe(key2.length);

      vi.stubGlobal('window', {
        api: {
          getAiProviders: async () => realProviderManager.getProviders(),
          saveAiProvider: async (p: any) => realProviderManager.saveProvider(p),
          deleteAiProvider: async (id: string) => realProviderManager.deleteProvider(id),
          testAiConnection: async (p: any) => {
            const resolved = realProviderManager.resolveProviderKey(p.id, p.apiKey);
            return {
              success: Boolean(resolved.status === 'ok' && resolved.value?.startsWith('sk-or-v1-'))
            };
          }
        }
      });

      await aiStore.loadProviders();
      expect(aiStore.providers.length).toBeGreaterThan(0);
      const openrouter = aiStore.providers[0];

      // Save key1 through real ProviderManager + SecretVaultService
      await aiStore.saveProvider({ ...openrouter, apiKey: key1 });
      expect(aiStore.providers[0].apiKey).toBe('••••••••••••••••');
      expect(realVault.resolveProviderApiKey(openrouter.id).value).toBe(key1);

      // Test connection using masked provider in UI -> resolves real secret in main process
      const testedRes = await aiStore.testConnection(aiStore.providers[0]);
      expect(testedRes.success).toBe(true);
      expect(aiStore.getProviderTestState(aiStore.providers[0])?.status).toBe('success');

      // Replace with key2 of the exact same length -> updates vault and invalidates verified state in renderer
      await aiStore.saveProvider({ ...aiStore.providers[0], apiKey: key2 });
      expect(realVault.resolveProviderApiKey(openrouter.id).value).toBe(key2);
      expect(aiStore.providers[0].apiKey).toBe('••••••••••••••••');
      expect(aiStore.getProviderTestState(aiStore.providers[0])).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
