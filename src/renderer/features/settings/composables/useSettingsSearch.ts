import { ref } from 'vue';
import settingsRegistry from '../../../../../docs/ui-inventory/settings-registry.json';
import type { SettingsTab } from './useSettingsNav';

export interface RegistrySettingItem {
  id: string;
  path: string;
  label: string;
  type: string;
  storeKey?: string;
  defaultValue?: any;
  description?: string;
  file?: string;
  docFile?: string;
  docSection?: string;
  duplicates?: string[];
  frequency: string;
  synonyms?: string[];
}

export interface DetailedSearchResult {
  id: string;
  categoryTab: SettingsTab;
  categoryLabelRu: string;
  categoryLabelEn: string;
  sectionId: string;
  sectionLabelRu: string;
  sectionLabelEn: string;
  settingLabel: string;
  description?: string;
  searchData: string;
  storeKey?: string;
  synonyms?: string[];
}

export function getSectionMapping(docSec?: string, itemPath?: string): {
  tab: SettingsTab;
  sectionId: string;
  catRu: string;
  catEn: string;
  secRu: string;
  secEn: string;
} | null {
  const sec = docSec || '';
  const path = itemPath || '';

  if (sec.includes('1.1 Секция quick') || path.startsWith('settings/general/quick')) {
    return { tab: 'core', sectionId: 'section-general', catRu: 'Общие', catEn: 'General', secRu: 'Быстрые настройки', secEn: 'Quick Settings' };
  }
  if (sec.includes('1.2 Секция appearance') || path.startsWith('settings/general/appearance')) {
    return { tab: 'core', sectionId: 'section-appearance', catRu: 'Общие', catEn: 'General', secRu: 'Внешний вид', secEn: 'Appearance' };
  }
  if (sec.includes('1.3 Секция widgets') || path.startsWith('settings/general/widgets')) {
    return { tab: 'core', sectionId: 'section-widgets', catRu: 'Общие', catEn: 'General', secRu: 'Панели и виджеты', secEn: 'Panels & Widgets' };
  }
  if (sec.includes('1.5 Секция navigation') || path.startsWith('settings/general/navigation')) {
    return { tab: 'core', sectionId: 'section-navigation', catRu: 'Общие', catEn: 'General', secRu: 'Навигация', secEn: 'Navigation' };
  }
  if (sec.includes('1.4 Секция shortcuts') || path.startsWith('settings/general/shortcuts')) {
    return { tab: 'core', sectionId: 'section-shortcuts', catRu: 'Общие', catEn: 'General', secRu: 'Горячие клавиши', secEn: 'Shortcuts' };
  }
  if (sec.includes('1.6 Секция integrations') || path.startsWith('settings/general/integrations')) {
    return { tab: 'core', sectionId: 'section-integrations', catRu: 'Общие', catEn: 'General', secRu: 'Интеграции', secEn: 'Integrations' };
  }
  if (sec.includes('2.1 Секция routing') || path.startsWith('settings/intelligence/routing')) {
    return { tab: 'intelligence', sectionId: 'section-router', catRu: 'Интеллект', catEn: 'Intelligence', secRu: 'Маршрутизация моделей', secEn: 'Model Routing' };
  }
  if (sec.includes('2.2 Секция providers') || path.startsWith('settings/intelligence/providers')) {
    return { tab: 'intelligence', sectionId: 'section-providers', catRu: 'Интеллект', catEn: 'Intelligence', secRu: 'Облачные провайдеры', secEn: 'Cloud Providers' };
  }
  if (sec.includes('2.3 Секция localAI') || path.startsWith('settings/intelligence/localAI')) {
    return { tab: 'intelligence', sectionId: 'section-local', catRu: 'Интеллект', catEn: 'Intelligence', secRu: 'Локальный ИИ', secEn: 'Local AI' };
  }
  if (sec.includes('2.4 Секция models') || path.startsWith('settings/intelligence/models')) {
    return { tab: 'intelligence', sectionId: 'section-models', catRu: 'Интеллект', catEn: 'Intelligence', secRu: 'Модели и загрузки', secEn: 'Models & Downloads' };
  }
  if (sec.includes('3.1 Секция stt') || path.startsWith('settings/voice/stt')) {
    return { tab: 'voice', sectionId: 'section-stt', catRu: 'Голос', catEn: 'Voice', secRu: 'Распознавание речи', secEn: 'Speech Recognition' };
  }
  if (sec.includes('3.2 Секция tts') || path.startsWith('settings/voice/tts')) {
    return { tab: 'voice', sectionId: 'section-tts', catRu: 'Голос', catEn: 'Voice', secRu: 'Синтез речи', secEn: 'Speech Synthesis' };
  }
  if (sec.includes('3.3 Секция hotwords') || path.startsWith('settings/voice/audio')) {
    return { tab: 'voice', sectionId: 'section-audio', catRu: 'Голос', catEn: 'Voice', secRu: 'Микрофон и активация', secEn: 'Microphone & Activation' };
  }
  if (sec.includes('4.1 Секция system') || path.startsWith('settings/system/perf')) {
    return { tab: 'system', sectionId: 'section-performance', catRu: 'Система', catEn: 'System', secRu: 'Производительность', secEn: 'Performance' };
  }
  if (sec.includes('4.2 Секция safety') || path.startsWith('settings/system/safety')) {
    return { tab: 'system', sectionId: 'section-safety', catRu: 'Система', catEn: 'System', secRu: 'Безопасность', secEn: 'Safety & Security' };
  }
  if (sec.includes('4.3 Секция diagnostics') || path.startsWith('settings/system/diag')) {
    return { tab: 'system', sectionId: 'section-diagnostics', catRu: 'Система', catEn: 'System', secRu: 'Диагностика', secEn: 'Diagnostics' };
  }
  if (sec.includes('4.4 Секция storage') || path.startsWith('settings/system/storage')) {
    return { tab: 'system', sectionId: 'section-storage', catRu: 'Система', catEn: 'System', secRu: 'Данные и хранилище', secEn: 'Data & Storage' };
  }
  return null;
}

export function getSectionIdFromDocSection(docSec?: string): string | null {
  return getSectionMapping(docSec)?.sectionId ?? null;
}

// Explicit fallback entries synchronized 1:1 with real DOM IDs (synonyms only in searchData)
const quickEntries: DetailedSearchResult[] = [
  { id: 'quick.autospeak', categoryTab: 'core', categoryLabelRu: 'Общие', categoryLabelEn: 'General', sectionId: 'section-general', sectionLabelRu: 'Быстрые настройки', sectionLabelEn: 'Quick Settings', settingLabel: 'Авто-озвучка ответов', description: 'Автоматически озвучивать входящие текстовые сообщения ИИ в диалоге', searchData: 'auto speak voice tts озвучивание диалог speech' },
  { id: 'tts.volume', categoryTab: 'voice', categoryLabelRu: 'Голос', categoryLabelEn: 'Voice', sectionId: 'section-tts', sectionLabelRu: 'Синтез речи', sectionLabelEn: 'Speech Synthesis', settingLabel: 'Громкость синтеза речи', description: 'Уровень громкости озвучивания ответов диктором Silero TTS', searchData: 'volume voice tts sound звук speech' },
  { id: 'quick.autostart', categoryTab: 'core', categoryLabelRu: 'Общие', categoryLabelEn: 'General', sectionId: 'section-general', sectionLabelRu: 'Быстрые настройки', sectionLabelEn: 'Quick Settings', settingLabel: 'Автозапуск A.R.C.', description: 'Запускать среду A.R.C. при входе в систему Windows (HKCU\\Run)', searchData: 'autostart startup windows boot' },
  { id: 'quick.ecomode', categoryTab: 'core', categoryLabelRu: 'Общие', categoryLabelEn: 'General', sectionId: 'section-general', sectionLabelRu: 'Быстрые настройки', sectionLabelEn: 'Quick Settings', settingLabel: 'Эко-режим', description: 'Снижение частоты кадров реактора до 30 FPS для экономии ресурсов GPU', searchData: 'eco energy saving battery' },
  { id: 'quick.background', categoryTab: 'core', categoryLabelRu: 'Общие', categoryLabelEn: 'General', sectionId: 'section-general', sectionLabelRu: 'Быстрые настройки', sectionLabelEn: 'Quick Settings', settingLabel: 'Работа в фоне', description: 'Поддержание голосового канала и горячих клавиш при сворачивании в системный трей', searchData: 'background tray фоновый' },
  { id: 'system.gfx.preset', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Профиль графического движка (Шаблон)', description: 'Игровые пресеты Низкие, Средние, Высокие, Ультра и Пользовательский для 3D-ядра', searchData: 'пресеты шаблон качества графики низкие средние высокие ультра пользовательский preset low medium high ultra custom' },
  { id: 'system.gfx.msaa', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Аппаратное сглаживание (WebGL2 MSAA)', description: 'Мультисэмплинг геометрических граней колец и центрального треугольника (Выкл, 2x, 4x, 8x)', searchData: 'msaa сглаживание антиалиасинг мультисэмплинг 2x 4x 8x грани лесенки' },
  { id: 'system.gfx.fxaa', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Экранное пост-сглаживание (FXAA ShaderPass)', description: 'Дополнительный проход сглаживания субпиксельных бликов после Bloom', searchData: 'fxaa пост сглаживание шейдер блики контуры' },
  { id: 'system.gfx.dpr', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Плотность пикселей и суперсэмплинг (DPR / SSAA)', description: 'Рендер в повышенном разрешении (1.0x, 1.25x, 1.5x, 2.0x SSAA, Авто)', searchData: 'dpr ssaa суперсэмплинг плотность пикселей четкость мыло разрешение' },
  { id: 'system.gfx.anisotropy', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Анизотропная фильтрация декалей (Anisotropic 1x–16x)', description: 'Чёткость центрального штампа A.R.C. и сеток под острыми углами наклона', searchData: 'анизотропная фильтрация текстур декали логотип четкость 1x 4x 8x 16x' },
  { id: 'system.gfx.bloom', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Оптическое свечение (Unreal Bloom Pass)', description: 'Настройка свечения, силы ореола и радиуса рассеивания неоновых трубок', searchData: 'unreal bloom свечение неон ореол пост обработка засветка' },
  { id: 'system.gfx.glsl_plasma', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-graphics', sectionLabelRu: 'Графика и 3D-Ядро', sectionLabelEn: 'Graphics & 3D Core', settingLabel: 'Процедурный GLSL-шейдер плазмы и физика ядра', description: 'GLSL-плазма Френеля, сферические гармоники, пружинная физика и плотность частиц', searchData: 'glsl шейдер плазма френель гармоники физика пружина частицы' },
  { id: 'system.storage.trash', categoryTab: 'system', categoryLabelRu: 'Система', categoryLabelEn: 'System', sectionId: 'section-storage', sectionLabelRu: 'Данные и хранилище', sectionLabelEn: 'Data & Storage', settingLabel: 'Автоматическая очистка корзины диалогов', description: 'Срок хранения удалённых в корзину диалогов (7, 30, 90 дней или вручную)', searchData: 'корзина диалогов автоочистка срок хранения удаление trash retention' }
];

export const isIndexReady = ref(false);
export const isIndexBuilding = ref(false);

let cachedIndex: DetailedSearchResult[] = [];

function compileIndex() {
  const index: DetailedSearchResult[] = [];
  const items: RegistrySettingItem[] = (settingsRegistry as any)?.settings || [];

  for (const item of items) {
    const mapping = getSectionMapping(item.docSection, item.path);
    if (mapping) {
      if (!index.some(r => r.id === item.id || (r.sectionId === mapping.sectionId && r.settingLabel === item.label))) {
        index.push({
          id: item.id,
          categoryTab: mapping.tab,
          categoryLabelRu: mapping.catRu,
          categoryLabelEn: mapping.catEn,
          sectionId: mapping.sectionId,
          sectionLabelRu: mapping.secRu,
          sectionLabelEn: mapping.secEn,
          settingLabel: item.label,
          description: item.description,
          searchData: (item.synonyms || []).join(' ').toLowerCase(),
          storeKey: item.storeKey,
          synonyms: item.synonyms
        });
      }
    }
  }

  for (const qItem of quickEntries) {
    if (!index.some(r => r.id === qItem.id)) {
      index.push(qItem);
    }
  }

  cachedIndex = index;
  isIndexReady.value = true;
  isIndexBuilding.value = false;
}

export function buildSearchIndexAsync() {
  if (isIndexReady.value || isIndexBuilding.value) return;
  isIndexBuilding.value = true;
  compileIndex();
}

// Build index immediately so search is always ready and complete
compileIndex();

const TOP_LIMIT = 10;

function getRussianStem(word: string): string {
  if (word.length >= 6 && /^[а-яё]+$/i.test(word)) {
    const stemmed = word.replace(
      /(?:остями|остей|остях|остям|остью|ости|ением|ениям|ениями|ениях|ение|ения|ений|ование|ования|ований|ами|ями|ов|ев|ей|ам|ям|ах|ях|ом|ем|ую|юю|ый|ий|ой|ая|яя|ое|ее|ые|ие|ых|их|ым|им|ы|и|а|я|е|у|ю|ь)$/i,
      ''
    );
    if (stemmed.length >= 4) return stemmed;
  }
  return word;
}

export function searchSettingsInRegistry(rawQuery: string): {
  matchingSectionIds: Set<string>;
  matchingSettingIds: Set<string>;
  detailedResults: DetailedSearchResult[];
  totalMatches: number;
} {
  const query = rawQuery.trim().toLowerCase();
  const matchingSectionIds = new Set<string>();
  const matchingSettingIds = new Set<string>();
  const detailedResults: DetailedSearchResult[] = [];

  if (!query) {
    return { matchingSectionIds, matchingSettingIds, detailedResults, totalMatches: 0 };
  }

  if (cachedIndex.length === 0) {
    compileIndex();
  }

  const dataset = cachedIndex.length > 0 ? cachedIndex : quickEntries;
  const words = query.split(/\s+/).filter(Boolean);
  const scoredResults: { item: DetailedSearchResult; score: number; allWordsMatchLabel: boolean }[] = [];

  for (const item of dataset) {
    const labelLower = item.settingLabel.toLowerCase();
    const descLower = (item.description || '').toLowerCase();
    const synLower = (item.searchData || '').toLowerCase();
    const idLower = item.id.toLowerCase();
    const skLower = (item.storeKey || '').toLowerCase();

    let allWordsMatch = true;
    let allWordsMatchLabel = true;
    let score = 0;

    for (const word of words) {
      const stem = getRussianStem(word);
      const matchLabelExact = labelLower.includes(word);
      const matchLabelStem = !matchLabelExact && stem !== word && labelLower.includes(stem);
      const matchLabel = matchLabelExact || matchLabelStem;
      const matchDesc = descLower.includes(word);
      const matchSyn = synLower.includes(word);
      const matchId = idLower.includes(word) || skLower.includes(word);
      const isTechnicalQuery = /[._]/.test(word) || (skLower.length > 0 && skLower === word);

      const isMatch = matchLabel || matchDesc || matchSyn || (isTechnicalQuery && matchId);
      if (!isMatch) {
        allWordsMatch = false;
        break;
      }
      if (!matchLabel) {
        allWordsMatchLabel = false;
      }

      if (matchLabelExact) score += 120;
      else if (matchLabelStem) score += 100;
      if (matchDesc) score += 50;
      if (matchSyn) score += 20;
      if (matchId && isTechnicalQuery) score += 10;
    }

    if (allWordsMatch && score > 0) {
      scoredResults.push({ item, score, allWordsMatchLabel });
    }
  }

  // If any settings match all query words directly in their visible title (settingLabel),
  // filter out noisy items that only matched incidentally via description or synonyms.
  const hasDirectLabelMatches = scoredResults.some(r => r.allWordsMatchLabel);
  const relevantResults = hasDirectLabelMatches
    ? scoredResults.filter(r => r.allWordsMatchLabel)
    : scoredResults;

  relevantResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.settingLabel.localeCompare(b.item.settingLabel);
  });

  const topResults = relevantResults.slice(0, TOP_LIMIT);

  for (const { item } of topResults) {
    matchingSettingIds.add(item.id);
    matchingSectionIds.add(item.sectionId);
    detailedResults.push(item);
  }

  return {
    matchingSectionIds,
    matchingSettingIds,
    detailedResults,
    totalMatches: detailedResults.length
  };
}


