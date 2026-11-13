import { searchSettingsInRegistry, type DetailedSearchResult } from './useSettingsSearch';
import { useCollapsedSections } from './useCollapsedSections';
import { ref, computed, watch, nextTick } from 'vue';
import { useSettingsStore } from '../stores/settings.store';
import { useAiConfigStore } from '../../../stores/aiConfig';
import { getLocalEngineSessionState } from './useLocalAIEngine';
import { useModelHubSession } from './useModelHubSession';
import { computeAiSectionStatuses, type SubsystemStatusSummary } from '../logic/ai-status';
import {
  SlidersHorizontal,
  BrainCircuit,
  Cpu,
  Zap,
  Mic,
  Palette,
  LayoutGrid,
  Server,
  Cloud,
  Layers,
  Database,
  Gauge,
  DownloadCloud,
  Settings,
  Activity,
  History
} from 'lucide-vue-next';

export type SettingsTab = 'core' | 'intelligence' | 'voice' | 'system' | 'updates';

export interface SettingsSectionDef {
  id: string;
  labelRu: string;
  labelEn: string;
  keywords: string[];
}

export interface SettingsCategoryDef {
  id: SettingsTab;
  labelRu: string;
  labelEn: string;
  icon: any;
  sections: SettingsSectionDef[];
}

export interface FilteredCategoryDef extends SettingsCategoryDef {
  matchCount: number;
}

export const SETTINGS_MENU: SettingsCategoryDef[] = [
  {
    id: 'core',
    labelRu: 'Общие',
    labelEn: 'General',
    icon: SlidersHorizontal,
    sections: [
      {
        id: 'section-general',
        labelRu: 'Быстрые настройки',
        labelEn: 'Quick Settings',
        keywords: ['general', 'quick', 'core', 'language', 'volume', 'auto', 'start', 'быстрые', 'параметры', 'настройки', 'язык', 'громкость', 'автозапуск', 'тема', 'эко']
      },
      {
        id: 'section-appearance',
        labelRu: 'Внешний вид',
        labelEn: 'Appearance',
        keywords: ['appearance', 'visuals', 'theme', 'color', 'dark', 'light', 'glass', 'blur', 'scale', 'внешний', 'вид', 'тема', 'цвет', 'оформление', 'стекло', 'масштаб']
      },
      {
        id: 'section-navigation',
        labelRu: 'Навигация',
        labelEn: 'Navigation',
        keywords: ['navigation', 'tabs', 'навигация', 'вкладки', 'панели', 'закрепленные']
      },
      {
        id: 'section-widgets',
        labelRu: 'Панели и виджеты',
        labelEn: 'Panels & Widgets',
        keywords: ['navigation', 'tabs', 'widgets', 'panels', 'dock', 'float', 'hud', 'навигация', 'вкладки', 'виджеты', 'панели', 'док', 'плавающие', 'сброс', 'пресеты']
      },
      {
        id: 'section-shortcuts',
        labelRu: 'Горячие клавиши',
        labelEn: 'Shortcuts',
        keywords: ['shortcuts', 'hotkeys', 'keys', 'клавиши', 'горячие', 'шорткаты', 'space', 'ctrl', 'esc']
      },
      {
        id: 'section-integrations',
        labelRu: 'Интеграции и веб-поиск',
        labelEn: 'Integrations & Web Search',
        keywords: ['integrations', 'vk', 'music', 'auth', 'token', 'интеграции', 'вк', 'музыка', 'авторизация', 'токен', 'web search', 'веб-поиск', 'duckduckgo', 'tavily', 'serper']
      }
    ]
  },
  {
    id: 'intelligence',
    labelRu: 'Интеллект',
    labelEn: 'Intelligence',
    icon: BrainCircuit,
    sections: [
      {
        id: 'section-router',
        labelRu: 'Маршрутизация моделей',
        labelEn: 'Model Routing',
        keywords: ['router', 'routing', 'semantic', 'rules', 'smart', 'exclusive', 'маршрутизация', 'умный', 'маршрут', 'эксклюзивный']
      },
      {
        id: 'section-providers',
        labelRu: 'Облачные провайдеры',
        labelEn: 'Cloud Providers',
        keywords: ['providers', 'cloud', 'api', 'key', 'openai', 'gemini', 'anthropic', 'deepseek', 'провайдеры', 'облако', 'ключ']
      },
      {
        id: 'section-local',
        labelRu: 'Локальный ИИ',
        labelEn: 'Local AI',
        keywords: ['local', 'model', 'ollama', 'gguf', 'offline', 'локальный', 'модель', 'ии', 'офлайн', 'чеклист']
      },
      {
        id: 'section-models',
        labelRu: 'Модели и загрузки',
        labelEn: 'Models & Downloads',
        keywords: ['hub', 'models', 'download', 'manager', 'hardware', 'cuda', 'хаб', 'модели', 'скачать', 'загрузки', 'оборудование']
      }
    ]
  },
  {
    id: 'voice',
    labelRu: 'Голос',
    labelEn: 'Voice',
    icon: Mic,
    sections: [
      {
        id: 'section-stt',
        labelRu: 'Распознавание речи',
        labelEn: 'Speech Recognition',
        keywords: ['stt', 'speech', 'recognition', 'whisper', 'sherpa', 'gigaam', 'vad', 'распознавание', 'речь', 'движок']
      },
      {
        id: 'section-tts',
        labelRu: 'Синтез речи',
        labelEn: 'Speech Synthesis',
        keywords: ['tts', 'speech', 'synthesis', 'voice', 'silero', 'edge', 'sapi', 'синтез', 'голос', 'диктор', 'кэш']
      },
      {
        id: 'section-audio',
        labelRu: 'Микрофон и активация',
        labelEn: 'Microphone & Activation',
        keywords: ['voice', 'audio', 'microphone', 'vad', 'sensitivity', 'wake', 'word', 'арк', 'стоп', 'голос', 'аудио', 'микрофон', 'чувствительность', 'активация']
      }
    ]
  },
  {
    id: 'system',
    labelRu: 'Система',
    labelEn: 'System',
    icon: Cpu,
    sections: [
      {
        id: 'section-graphics',
        labelRu: 'Графика и 3D-Ядро',
        labelEn: 'Graphics & 3D Core',
        keywords: ['graphics', '3d', 'reactor', 'msaa', 'fxaa', 'ssaa', 'dpr', 'render scale', 'anisotropic', 'pmrem', 'bloom', 'hdr', 'halffloat', 'glsl', 'shader', 'particles', 'presets', 'графика', 'ядро', 'сглаживание', 'анизотропная', 'текстуры', 'свечение', 'шейдеры', 'частицы', 'пресеты', 'шаблоны', 'ультра']
      },
      {
        id: 'section-performance',
        labelRu: 'Производительность',
        labelEn: 'Performance',
        keywords: ['system', 'resources', 'graphics', 'quality', 'fps', 'background', 'система', 'ресурсы', 'графика', 'производительность']
      },
      {
        id: 'section-diagnostics',
        labelRu: 'Диагностика',
        labelEn: 'Diagnostics',
        keywords: ['diagnostics', 'monitoring', 'logs', 'fps', 'profiler', 'report', 'диагностика', 'мониторинг', 'логи', 'отчет']
      },
      {
        id: 'section-safety',
        labelRu: 'Безопасность',
        labelEn: 'Safety & Security',
        keywords: ['safety', 'security', 'confirm', 'shell', 'backup', 'безопасность', 'подтверждение', 'команды']
      },
      {
        id: 'section-storage',
        labelRu: 'Данные и хранилище',
        labelEn: 'Data & Storage',
        keywords: ['storage', 'data', 'database', 'sqlite', 'danger', 'reset', 'memory', 'хранилище', 'данные', 'сброс', 'память']
      }
    ]
  },
  {
    id: 'updates',
    labelRu: 'Обновления',
    labelEn: 'Updates',
    icon: History,
    sections: [
      {
        id: 'section-updates-latest',
        labelRu: 'Текущая сборка',
        labelEn: 'Current Build',
        keywords: ['updates', 'version', 'build', 'check', 'обновления', 'версия', 'сборка', 'текущая']
      },
      {
        id: 'section-updates-timeline',
        labelRu: 'История обновлений',
        labelEn: 'Release History',
        keywords: ['changelog', 'history', 'release', 'notes', 'история', 'обновлений', 'релизы', 'журнал', 'изменения']
      }
    ]
  }
];

const TAB_STORAGE_KEY = 'arc_settings_active_tab';
const SECTION_STORAGE_KEY = 'arc_settings_active_section';
const SIDEBAR_COLLAPSED_KEY = 'arc_settings_menu_collapsed';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Module-level reactive state
const activeTab = ref<SettingsTab>('core');
const activeSection = ref<string | null>(null);
const searchQuery = ref('');
const isSidebarCollapsed = ref<boolean>(false);
const isProgrammaticScroll = ref<boolean>(false);
const sectionScrollPositions = ref<Record<string, number>>({});

export function isSplitNavigationTab(tab: SettingsTab): boolean {
  return tab === 'intelligence';
}

// Initialize persisted values
try {
  const storage = getStorage();
  const savedTab = storage?.getItem(TAB_STORAGE_KEY) as SettingsTab | null;
  if (savedTab && SETTINGS_MENU.some(c => c.id === savedTab)) {
    activeTab.value = savedTab;
  }
} catch (e) {
  console.warn('Failed to load saved tab:', e);
}

try {
  const storage = getStorage();
  const savedSection = storage?.getItem(SECTION_STORAGE_KEY);
  if (savedSection) {
    const cat = SETTINGS_MENU.find(c => c.id === activeTab.value);
    if (cat && cat.sections.some(s => s.id === savedSection)) {
      activeSection.value = savedSection;
    } else {
      activeSection.value = cat?.sections[0]?.id || null;
    }
  } else {
    const cat = SETTINGS_MENU.find(c => c.id === activeTab.value);
    activeSection.value = cat?.sections[0]?.id || null;
  }
} catch (e) {
  console.warn('Failed to load saved section:', e);
}

try {
  const storage = getStorage();
  const savedCollapsed = storage?.getItem(SIDEBAR_COLLAPSED_KEY);
  if (savedCollapsed !== null && savedCollapsed !== undefined) {
    isSidebarCollapsed.value = savedCollapsed === 'true';
  }
} catch (e) {
  console.warn('Failed to load sidebar collapsed state:', e);
}

// Watch and persist changes
watch(activeTab, (newTab) => {
  try {
    getStorage()?.setItem(TAB_STORAGE_KEY, newTab);
  } catch (e) {
    console.warn('Failed to save tab state:', e);
  }
});

watch(activeSection, (newSection) => {
  try {
    if (newSection) {
      getStorage()?.setItem(SECTION_STORAGE_KEY, newSection);
    }
  } catch (e) {
    console.warn('Failed to save section state:', e);
  }
});

watch(isSidebarCollapsed, (newCollapsed) => {
  try {
    getStorage()?.setItem(SIDEBAR_COLLAPSED_KEY, String(newCollapsed));
  } catch (e) {
    console.warn('Failed to save sidebar collapse state:', e);
  }
});

export function useSettingsNav() {
  const filteredMenu = computed<FilteredCategoryDef[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) {
      return SETTINGS_MENU.map(cat => ({
        ...cat,
        matchCount: cat.sections.length
      }));
    }

    const { matchingSectionIds } = searchSettingsInRegistry(q);
    return SETTINGS_MENU.map(cat => {
      const filteredSections = cat.sections.filter(s => {
        const labelRuMatch = s.labelRu.toLowerCase().includes(q);
        const labelEnMatch = s.labelEn.toLowerCase().includes(q);
        const catRuMatch = cat.labelRu.toLowerCase().includes(q);
        const catEnMatch = cat.labelEn.toLowerCase().includes(q);
        const keywordMatch = s.keywords.some(k => k.toLowerCase().includes(q));
        const registryMatch = matchingSectionIds.has(s.id);
        return labelRuMatch || labelEnMatch || catRuMatch || catEnMatch || keywordMatch || registryMatch;
      });

      return {
        ...cat,
        sections: filteredSections,
        matchCount: filteredSections.length
      };
    }).filter(cat => cat.sections.length > 0);
  });

  const detailedSearchResults = computed<DetailedSearchResult[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return [];
    const { detailedResults } = searchSettingsInRegistry(q);
    return detailedResults;
  });

  function categoryLabel(cat: SettingsCategoryDef, isEn: boolean) {
    return isEn ? cat.labelEn : cat.labelRu;
  }

  function sectionLabel(sec: SettingsSectionDef, isEn: boolean) {
    return isEn ? sec.labelEn : sec.labelRu;
  }

  function saveSectionScroll(sectionId: string, scrollTop: number) {
    if (!sectionId) return;
    sectionScrollPositions.value[sectionId] = Math.max(0, Math.round(scrollTop));
  }

  function getSectionScroll(sectionId: string): number {
    if (!sectionId) return 0;
    return sectionScrollPositions.value[sectionId] ?? 0;
  }

  function resolveTabAndSection(tab: SettingsTab, sectionId: string): { tab: SettingsTab; sectionId: string } {
    // 1. Check if sectionId exists in any category in SETTINGS_MENU
    for (const cat of SETTINGS_MENU) {
      if (cat.sections.some(s => s.id === sectionId)) {
        return { tab: cat.id, sectionId };
      }
    }
    // 2. Fallback to valid tab and its first section so UI is never blank
    const validCat = SETTINGS_MENU.find(c => c.id === tab) || SETTINGS_MENU[0];
    return {
      tab: validCat.id,
      sectionId: validCat.sections[0]?.id || 'section-general'
    };
  }

  function resolveSectionId(tab: SettingsTab, sectionId: string): string {
    return resolveTabAndSection(tab, sectionId).sectionId;
  }

  function getSection(tab: SettingsTab, sectionId: string) {
    const resolved = resolveTabAndSection(tab, sectionId);
    const cat = SETTINGS_MENU.find(c => c.id === resolved.tab);
    return cat?.sections.find(s => s.id === resolved.sectionId);
  }

  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }

  let activeHighlightTimer: any = null;

  function scrollElementIntoContainer(targetElement: HTMLElement, container: HTMLElement | null, center = false) {
    if (container) {
      const targetRect = targetElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offset = center
        ? Math.max(24, (containerRect.height - Math.min(targetRect.height, containerRect.height * 0.6)) / 3)
        : 24;
      const top = container.scrollTop + (targetRect.top - containerRect.top) - offset;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      targetElement.scrollIntoView({ behavior: 'smooth', block: center ? 'center' : 'start' });
    }
  }

  function applyHighlightWhenScrollSettled(targetElement: HTMLElement, container: HTMLElement | null, onDone?: () => void) {
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
    }
    targetElement.classList.add('search-highlight');
    scrollElementIntoContainer(targetElement, container, true);

    if (activeHighlightTimer) {
      clearTimeout(activeHighlightTimer);
      activeHighlightTimer = null;
    }

    activeHighlightTimer = setTimeout(() => {
      targetElement.classList.remove('search-highlight');
      activeHighlightTimer = null;
      if (onDone) onDone();
    }, 2000);
  }

  function scrollToSectionId(sectionId: string, query?: string, targetId?: string) {
    if (typeof document === 'undefined') return;

    try {
      const { expandSection } = useCollapsedSections();
      expandSection(sectionId);
    } catch (e) {}

    let pollAttempts = 0;
    const pollForElement = () => {
      pollAttempts++;
      const el = document.getElementById(sectionId);
      const container = (el ? (el.closest('.settings-scroll-container') as HTMLElement | null) : null) || (document.querySelector('.settings-scroll-container') as HTMLElement | null);

      if (el && container) {
        if (!query && !targetId) {
          if (isSplitNavigationTab(activeTab.value)) {
            container.scrollTop = getSectionScroll(sectionId);
          } else {
            scrollElementIntoContainer(el, container, false);
          }
        } else {
          const q = (query || '').trim().toLowerCase();
          const words = q.split(/\s+/).filter(Boolean);
          let rowAttempts = 0;

          const findAndHighlight = () => {
            rowAttempts++;
            let matchedRow: HTMLElement | null = null;

            // 1. Direct match by targetId via data-setting-id or id
            if (targetId) {
              const targetLower = targetId.toLowerCase();
              const byExactAttr = el.querySelector(`[data-setting-id="${targetId}"]`) || document.querySelector(`[data-setting-id="${targetId}"]`) || document.getElementById(targetId);
              if (byExactAttr) {
                matchedRow = byExactAttr as HTMLElement;
              } else {
                const searchableRows = el.querySelectorAll('[data-setting-id], [id], [data-search]');
                for (const row of Array.from(searchableRows)) {
                  const settingId = (row.getAttribute('data-setting-id') || row.getAttribute('id') || '').toLowerCase();
                  if (settingId && (settingId === targetLower || settingId.includes(targetLower) || targetLower.includes(settingId))) {
                    matchedRow = row as HTMLElement;
                    break;
                  }
                }
              }
            }

            // 2. Query words match in data-search
            if (!matchedRow && words.length > 0) {
              const searchableRows = el.querySelectorAll('[data-search], [data-setting-id]');
              for (const row of Array.from(searchableRows)) {
                const searchData = (row.getAttribute('data-search') || '').toLowerCase();
                if (words.every(word => searchData.includes(word))) {
                  matchedRow = row as HTMLElement;
                  break;
                }
              }
              if (!matchedRow) {
                let bestScore = 0;
                for (const row of Array.from(searchableRows)) {
                  const searchData = (row.getAttribute('data-search') || '').toLowerCase();
                  const matchedWords = words.filter(word => searchData.includes(word)).length;
                  if (matchedWords > bestScore) {
                    bestScore = matchedWords;
                    matchedRow = row as HTMLElement;
                  }
                }
              }
            }

            if (matchedRow) {
              const scrollContainer = (matchedRow.closest('.settings-scroll-container') as HTMLElement | null) || container;
              applyHighlightWhenScrollSettled(matchedRow, scrollContainer, () => {
                try {
                  const store = useSettingsStore();
                  store.setPendingHighlight(null);
                } catch (e) {}
              });
            } else if (rowAttempts < 12) {
              setTimeout(findAndHighlight, 50);
            } else {
              // Fallback: highlight and scroll to section header/block so user never lands on an empty/lost view
              console.warn(`[SettingsNav] Target control "${targetId || query}" not found in #${sectionId}, falling back to section.`);
              applyHighlightWhenScrollSettled(el, container, () => {
                try {
                  const store = useSettingsStore();
                  store.setPendingHighlight(null);
                } catch (e) {}
              });
            }
          };

          setTimeout(findAndHighlight, 30);
        }
      } else if (pollAttempts < 25) {
        setTimeout(pollForElement, 60);
      } else if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    pollForElement();
  }

  let programmaticScrollTimer: any = null;

  function setProgrammaticScroll(val: boolean) {
    isProgrammaticScroll.value = val;
    if (val) {
      if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
      programmaticScrollTimer = setTimeout(() => {
        isProgrammaticScroll.value = false;
        programmaticScrollTimer = null;
      }, 650);
    } else if (programmaticScrollTimer) {
      clearTimeout(programmaticScrollTimer);
      programmaticScrollTimer = null;
    }
  }

  async function navigateToSection(tab: SettingsTab, sectionId: string, customQuery?: string, targetId?: string) {
    setProgrammaticScroll(true);
    const resolved = resolveTabAndSection(tab, sectionId);
    activeTab.value = resolved.tab;
    activeSection.value = resolved.sectionId;
    const query = customQuery || searchQuery.value;

    try {
      const store = useSettingsStore();
      store.setPendingHighlight(targetId || query || null, query || null);
    } catch (e) {}

    await nextTick();
    scrollToSectionId(resolved.sectionId, query, targetId);
  }

  function selectTab(tab: SettingsTab) {
    const validCat = SETTINGS_MENU.find(c => c.id === tab) || SETTINGS_MENU[0];
    if (activeTab.value === validCat.id && activeSection.value) return;
    setProgrammaticScroll(true);
    activeTab.value = validCat.id;
    const firstSec = validCat.sections[0]?.id ?? null;
    activeSection.value = firstSec;
  }

  function handleViewScroll(tab: SettingsTab, evt: Event) {
    const container = evt.currentTarget as HTMLElement;
    if (!container) return;

    if (isSplitNavigationTab(tab)) {
      if (activeSection.value) {
        saveSectionScroll(activeSection.value, container.scrollTop);
      }
      return;
    }

    if (isProgrammaticScroll.value) return;

    const cat = SETTINGS_MENU.find(c => c.id === tab);
    if (!cat) return;

    // Check bottom boundary rule
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 120) {
      const lastSec = cat.sections[cat.sections.length - 1];
      if (lastSec && activeSection.value !== lastSec.id) {
        activeSection.value = lastSec.id;
      }
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    let current = cat.sections[0]?.id || null;

    for (const sec of cat.sections) {
      const el = document.getElementById(sec.id);
      if (el) {
        const top = el.getBoundingClientRect().top - containerTop;
        if (top <= 80) {
          current = sec.id;
        } else {
          break;
        }
      }
    }

    if (current && current !== activeSection.value) {
      activeSection.value = current;
    }
  }

  function jumpToFirstResult() {
    if (detailedSearchResults.value.length > 0) {
      const first = detailedSearchResults.value[0];
      navigateToSection(first.categoryTab, first.sectionId, first.searchData, first.id);
      return;
    }
    const fm = filteredMenu.value;
    if (!fm.length || !fm[0].sections.length) return;
    navigateToSection(fm[0].id, fm[0].sections[0].id);
  }

  function clearSearch() {
    searchQuery.value = '';
  }

  const aiSectionStatuses = computed<Record<string, SubsystemStatusSummary> | null>(() => {
    try {
      const settingsStore = useSettingsStore();
      const aiStore = useAiConfigStore();
      const localSession = getLocalEngineSessionState();
      const hubSession = useModelHubSession();
      const hasActiveDownload =
        hubSession.downloadStore.isDownloading ||
        Object.values(hubSession.sttDownloadState.value).some((s) => s?.downloading);

      return computeAiSectionStatuses({
        forcedOfflineMode: settingsStore.forcedOfflineMode,
        useLocalLLM: settingsStore.useLocalLLM,
        useSmartRouting: settingsStore.useSmartRouting,
        localLLMPriority: settingsStore.localLLMPriority,
        localLLMModel: settingsStore.localLLMModel,
        builtinLLMModel: settingsStore.builtinLLMModel,
        providers: aiStore.providers,
        getProviderTestState: (p) => aiStore.getProviderTestState(p),
        isBuiltinDownloaded: localSession.isBuiltinDownloaded.value,
        builtinCheckError: localSession.builtinCheckError.value,
        checkingBuiltin: localSession.checkingBuiltin.value,
        isOllamaOnline: localSession.isOllamaOnline.value,
        checkingOllama: localSession.checkingOllama.value,
        verifiedInference: localSession.verifiedInference.value,
        diskCheckStatus: hubSession.diskCheckStatus.value,
        installedQuantsCount: hubSession.installedQuantsCount.value,
        hasActiveDownload
      });
    } catch {
      return null;
    }
  });

  return {
    SETTINGS_MENU,
    activeTab,
    activeSection,
    sectionScrollPositions,
    isSplitNavigationTab,
    saveSectionScroll,
    getSectionScroll,
    aiSectionStatuses,
    isProgrammaticScroll,
    setProgrammaticScroll,
    searchQuery,
    isSidebarCollapsed,
    filteredMenu,
    detailedSearchResults,
    categoryLabel,
    sectionLabel,
    getSection,
    toggleSidebar,
    navigateToSection,
    selectTab,
    handleViewScroll,
    jumpToFirstResult,
    clearSearch
  };
}
