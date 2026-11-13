<template>
  <div 
    class="flex flex-col w-full md:w-[248px] bg-[var(--arc-rail)] md:border-r border-[var(--arc-hairline)] relative h-full shrink-0 select-none"
  >
    <!-- Sidebar Header with Compact Mode Toggle -->
    <div class="px-3.5 py-3 border-b border-[var(--arc-hairline)] shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span 
            class="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--accent)]"
          ></span>
          <span class="text-xs font-mono font-semibold tracking-[0.14em] uppercase text-[var(--arc-text-primary)]">
            {{ store.language === 'EN' ? 'Settings' : 'Настройки' }}
          </span>
        </div>
        <!-- Toggle: All / Compact -->
        <button
          @click="toggleCompactMode"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--arc-radius-btn,8px)] border text-xs font-mono font-semibold tracking-wider uppercase transition cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          :class="isCompactMode 
            ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--arc-hairline)]' 
            : 'bg-transparent text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          :title="isCompactMode ? 'Показать все параметры' : 'Скрыть второстепенные параметры'"
        >
          <Sliders class="w-3 h-3 text-[var(--accent)]" />
          <span>{{ isCompactMode ? 'ОСНОВНЫЕ' : 'ВСЕ' }}</span>
        </button>
      </div>
    </div>

    <!-- Pinned Search Header (Recessed Instrument Well) -->
    <div class="p-3 shrink-0 flex flex-col gap-1.5 border-b border-[var(--arc-hairline)]">
      <div class="relative group w-full">
        <input 
          ref="searchInputRef"
          type="text" 
          v-model="searchQuery" 
          @keydown.enter="handleSearchEnter"
          @keydown.esc="clearSearch"
          :placeholder="store.language === 'EN' ? 'Search settings (/)...' : 'Поиск параметров (/)...'" 
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--arc-hairline-top)] rounded-[10px] pl-8 pr-7 py-2 text-xs text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none focus:outline-none transition font-mono"
          :style="{ boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.45)' }"
        />
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--arc-text-muted)] group-focus-within:text-[var(--arc-text-primary)] transition-colors" />
        <button 
          v-show="searchQuery" 
          @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition cursor-pointer outline-none focus:outline-none"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Mode A: Detailed Search Results with Breadcrumb -->
    <div v-if="searchQuery.trim()" class="flex-1 min-h-0 overflow-y-auto arc-scroll px-2.5 py-2.5 flex flex-col gap-1.5">
      <div class="px-2 py-1 flex items-center justify-between text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider">
        <span>Результаты поиска</span>
        <span class="text-[var(--arc-text-primary)] tabular-nums">{{ detailedSearchResults.length }}</span>
      </div>

      <!-- Honest indexing status if index is still preparing -->
      <div v-if="!isIndexReady" class="text-xs font-mono text-[var(--arc-text-muted)] p-3 text-center border border-[var(--arc-hairline)] rounded-lg bg-[var(--arc-hover)]">
        {{ store.language === 'EN' ? 'Index preparing...' : 'Индекс готовится...' }}
      </div>

      <!-- No results found -->
      <div v-else-if="detailedSearchResults.length === 0" class="text-xs font-mono text-[var(--status-warn)] border border-[var(--status-warn)]/20 bg-[var(--arc-hover)] p-2.5 rounded-lg text-center mt-2">
        {{ store.language === 'EN' ? 'No matching settings found' : 'Параметры не найдены' }}
      </div>

      <!-- Results list -->
      <button
        v-for="item in detailedSearchResults"
        :key="item.id"
        @click="selectSearchResult(item)"
        class="settings-search-result-item flex flex-col gap-1 p-2.5 rounded-[10px] text-left transition cursor-pointer border border-transparent hover:bg-[var(--arc-hover)] outline-none focus:outline-none group"
        :class="{ 'bg-[var(--arc-selected)]': isSectionActive(item.categoryTab, item.sectionId) }"
      >
        <div class="flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)]">
          <span>{{ store.language === 'EN' ? item.categoryLabelEn : item.categoryLabelRu }}</span>
          <span class="opacity-40">→</span>
          <span class="text-[var(--accent)]">{{ store.language === 'EN' ? item.sectionLabelEn : item.sectionLabelRu }}</span>
        </div>
        <div class="text-xs font-sans font-medium text-[var(--arc-text-primary)] group-hover:text-white truncate">
          {{ item.settingLabel }}
        </div>
        <div v-if="item.description" class="text-xs font-sans text-[var(--arc-text-hint)] line-clamp-1">
          {{ item.description }}
        </div>
      </button>
    </div>

    <!-- Mode B: Hierarchical Navigation Tree -->
    <nav 
      v-else 
      role="tablist"
      aria-orientation="vertical"
      aria-label="Настройки"
      class="flex-1 min-h-0 overflow-y-auto arc-scroll px-2.5 py-2.5 flex flex-col gap-1.5"
    >
      <div v-for="(cat, catIdx) in SETTINGS_MENU" :key="cat.id" class="flex flex-col" role="presentation">
        <!-- Category Header Tab -->
        <button
          type="button"
          role="tab"
          :id="`tab-${cat.id}`"
          :aria-selected="cat.id === activeTab"
          :aria-controls="`panel-${cat.id}`"
          :tabindex="cat.id === activeTab ? 0 : -1"
          @click="handleCategoryClick(cat.id)"
          @keydown="onTabKeydown(catIdx, $event)"
          class="flex items-center justify-between w-full min-h-[40px] px-3 py-2 rounded-[10px] text-xs font-sans font-medium transition text-left cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] group"
          :class="cat.id === activeTab
            ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)]' 
            : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          :style="cat.id === activeTab ? { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' } : {}"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <component 
              :is="cat.icon" 
              class="w-4 h-4 shrink-0 transition-colors"
              :class="cat.id === activeTab ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)]'"
            />
            <span class="truncate uppercase font-mono tracking-[0.06em] text-xs font-semibold">
              {{ categoryLabel(cat, store.language === 'EN') }}
            </span>
          </div>

          <div class="flex items-center gap-1.5 shrink-0 ml-1">
            <span class="text-xs font-mono text-[var(--arc-text-hint,#7A7A7A)] tabular-nums">
              {{ cat.sections.length }}
            </span>
            <ChevronDown 
              class="w-3.5 h-3.5 text-[var(--arc-text-muted)] transition-transform duration-200"
              :class="cat.id === activeTab ? 'rotate-180 text-[var(--accent)]' : 'opacity-60'"
            />
          </div>
        </button>

        <!-- Submenu Sections List (Accordion: only for active category) -->
        <div 
          v-if="cat.id === activeTab"
          :id="`submenu-${cat.id}`"
          role="group"
          :aria-label="categoryLabel(cat, store.language === 'EN')"
          class="flex flex-col gap-0.5 mt-1.5 mb-1 ml-3 pl-2.5 border-l border-[var(--arc-hairline)]"
        >
          <button
            v-for="sec in cat.sections"
            :key="sec.id"
            type="button"
            :aria-current="isSectionActive(cat.id, sec.id) ? 'page' : undefined"
            @click="handleSectionClick(cat.id, sec.id)"
            class="flex items-center justify-between w-full min-h-[34px] py-1.5 px-2.5 text-xs font-sans transition text-left group cursor-pointer relative rounded-[8px] outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            :class="isSectionActive(cat.id, sec.id) 
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] font-medium' 
              : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] font-normal'"
            :style="isSectionActive(cat.id, sec.id) ? { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' } : {}"
          >
            <!-- Left Accent Indicator Bar on Active Section -->
            <div 
              v-if="isSectionActive(cat.id, sec.id)" 
              class="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--accent)] rounded-r-full"
            ></div>
            <div class="flex items-center justify-between gap-2 truncate w-full pl-1">
              <span class="truncate">
                {{ sectionLabel(sec, store.language === 'EN') }}
              </span>
              <span
                v-if="cat.id === 'intelligence' && aiSectionStatuses?.[sec.id]"
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="statusDotClass(aiSectionStatuses[sec.id].tone)"
                :title="`${aiSectionStatuses[sec.id].label}: ${aiSectionStatuses[sec.id].detail}`"
              ></span>
            </div>
          </button>
        </div>
      </div>
    </nav>

    <!-- Pinned Footer: Exit to Core Button -->
    <div
      v-if="store.firstRunCompleted"
      class="p-3 border-t border-[var(--arc-hairline)] shrink-0 bg-[var(--arc-rail)]"
    >
      <button
        @click="exitToCore"
        type="button"
        class="flex items-center justify-between w-full h-9 px-3 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition-all cursor-pointer text-left group outline-none focus:outline-none"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
        :title="store.language === 'EN' ? 'Return to 3D Reactor (Esc)' : 'Вернуться к 3D-Ядру (Esc)'"
        data-testid="settings-exit-to-core"
      >
        <div class="flex items-center gap-2">
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase tracking-wider">
            {{ store.language === 'EN' ? 'Back to Core' : 'К 3D-Ядру' }}
          </span>
        </div>
        <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-hint)]">
          Esc
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../stores/settings.store';
import { useSettingsNav, type SettingsTab } from '../composables/useSettingsNav';
import { Search, X, Sliders, ChevronDown, ArrowLeft } from 'lucide-vue-next';
import { useSettingsVisibility } from '../composables/useSettingsVisibility';
import { isIndexReady, type DetailedSearchResult } from '../composables/useSettingsSearch';
import { useUIStore } from '../../../stores/ui.store';
import type { StatusTone } from '../logic/ai-status';

const emit = defineEmits<{
  (e: 'navigate-to-section'): void;
}>();

const store = useSettingsStore();
const uiStore = useUIStore();
const { isCompactMode, toggleCompactMode } = useSettingsVisibility();

function exitToCore() {
  uiStore.setActiveTab('core');
}

const searchInputRef = ref<HTMLInputElement | null>(null);

const {
  activeTab,
  activeSection,
  searchQuery,
  SETTINGS_MENU,
  detailedSearchResults,
  aiSectionStatuses,
  categoryLabel,
  sectionLabel,
  selectTab,
  navigateToSection,
  jumpToFirstResult,
  clearSearch
} = useSettingsNav();

function statusDotClass(tone: StatusTone): string {
  if (tone === 'ok') return 'bg-[var(--status-ok)]';
  if (tone === 'warn') return 'bg-[var(--status-warn)]';
  if (tone === 'err') return 'bg-[var(--status-err)]';
  return 'bg-[var(--status-off)]';
}

function isSectionActive(tab: string, sectionId: string) {
  return activeTab.value === tab && activeSection.value === sectionId;
}

function selectSearchResult(item: DetailedSearchResult) {
  navigateToSection(item.categoryTab, item.sectionId, item.searchData, item.id);
  emit('navigate-to-section');
}

function handleSearchEnter() {
  jumpToFirstResult();
  emit('navigate-to-section');
}

function handleCategoryClick(tab: SettingsTab) {
  if (activeTab.value !== tab) {
    selectTab(tab);
    emit('navigate-to-section');
  } else {
    const cat = SETTINGS_MENU.find(c => c.id === tab);
    if (cat?.sections?.[0]) {
      navigateToSection(tab, cat.sections[0].id);
      emit('navigate-to-section');
    }
  }
}

async function onTabKeydown(idx: number, e: KeyboardEvent) {
  const len = SETTINGS_MENU.length;
  let nextIdx = -1;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = (idx + 1) % len;
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = (idx - 1 + len) % len;
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = len - 1;
  if (nextIdx === -1) return;

  e.preventDefault();
  const targetCat = SETTINGS_MENU[nextIdx];
  if (!targetCat) return;
  handleCategoryClick(targetCat.id);
  await nextTick();
  document.getElementById(`tab-${targetCat.id}`)?.focus();
}

function handleSectionClick(tab: SettingsTab, sectionId: string) {
  navigateToSection(tab, sectionId);
  emit('navigate-to-section');
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault();
    searchInputRef.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});
</script>
