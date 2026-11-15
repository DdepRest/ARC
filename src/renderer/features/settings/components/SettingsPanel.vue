<template>
  <div 
    class="flex w-full h-full min-h-0 overflow-hidden bg-transparent select-none"
    :class="{ 'arc-settings-compact': isCompactMode && !searchQuery && !store.pendingHighlightId }"
  >
    <!-- Left Navigation Rail (Desktop: 240px, Mobile: Full width when mobileView === 'menu') -->
    <SettingsMenu 
      v-if="!isMobile || mobileView === 'menu'" 
      @navigate-to-section="onSearchNavigate"
      class="h-full shrink-0" 
    />

    <!-- Right Settings Content Panel (Desktop: flex-1, Mobile: Full width when mobileView === 'content') -->
    <div 
      v-if="!isMobile || mobileView === 'content'" 
      class="flex-1 min-h-0 h-full overflow-hidden flex flex-col relative bg-transparent w-full"
    >
      <!-- Mobile Back Bar -->
      <div v-if="isMobile" class="px-3 pt-2 pb-1 shrink-0 flex items-center justify-between border-b border-[var(--arc-hairline)] bg-[var(--arc-rail)]">
        <button
          @click="mobileView = 'menu'"
          class="flex items-center gap-1 px-2.5 py-1 rounded-[var(--arc-radius-btn,8px)] bg-[var(--arc-hover)] text-[var(--arc-text-primary)] text-xs font-mono transition cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeft class="w-3.5 h-3.5" />
          <span>Разделы</span>
        </button>
        <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate max-w-[200px]">
          {{ currentActiveSectionLabel }}
        </span>
      </div>

      <!-- Top Global Conflict Banner if any active rules triggered -->
      <div v-if="activeConflicts.length > 0" class="px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-14 lg:pr-12 pt-4 pb-0 shrink-0 max-w-[1040px] w-full mx-auto">
        <ConflictBanner 
          v-for="c in activeConflicts" 
          :key="c.id"
          :title="c.title"
          :message="c.message"
          :action-label="c.actionLabel"
          @resolve="c.resolve"
          class="mb-3"
        />
      </div>

      <!-- General Tab Content -->
      <div 
        v-if="activeTab === 'core'" 
        role="tabpanel"
        id="panel-core"
        :aria-labelledby="isTablistRendered ? 'tab-core' : undefined"
        :aria-label="!isTablistRendered ? currentActiveCategoryLabel : undefined"
        class="flex-1 min-h-0 h-full overflow-hidden flex flex-col"
      >
        <GeneralSettingsSection class="w-full h-full min-h-0 text-[var(--arc-text-primary)]" />
      </div>

      <!-- Hub Tab Content -->
      <div 
        v-else-if="activeTab === 'voice'" 
        role="tabpanel"
        id="panel-voice"
        :aria-labelledby="isTablistRendered ? 'tab-voice' : undefined"
        :aria-label="!isTablistRendered ? currentActiveCategoryLabel : undefined"
        class="flex-1 min-h-0 h-full overflow-hidden flex flex-col"
      >
        <VoiceSettings class="w-full h-full min-h-0 text-[var(--arc-text-primary)]" />
      </div>

      <!-- AI Logic Tab Content -->
      <div 
        v-else-if="activeTab === 'intelligence'" 
        role="tabpanel"
        id="panel-intelligence"
        :aria-labelledby="isTablistRendered ? 'tab-intelligence' : undefined"
        :aria-label="!isTablistRendered ? currentActiveCategoryLabel : undefined"
        class="flex-1 min-h-0 h-full overflow-hidden flex flex-col"
      >
        <AiSettings class="w-full h-full min-h-0 text-[var(--arc-text-primary)]" />
      </div>

      <!-- Resources Tab Content -->
      <div 
        v-else-if="activeTab === 'system'" 
        role="tabpanel"
        id="panel-system"
        :aria-labelledby="isTablistRendered ? 'tab-system' : undefined"
        :aria-label="!isTablistRendered ? currentActiveCategoryLabel : undefined"
        class="flex-1 min-h-0 h-full overflow-hidden flex flex-col"
      >
        <PerformanceSettings class="w-full h-full min-h-0 text-[var(--arc-text-primary)]" />
      </div>

      <!-- Updates History Tab Content -->
      <div 
        v-else-if="activeTab === 'updates'" 
        role="tabpanel"
        id="panel-updates"
        :aria-labelledby="isTablistRendered ? 'tab-updates' : undefined"
        :aria-label="!isTablistRendered ? currentActiveCategoryLabel : undefined"
        class="flex-1 min-h-0 h-full overflow-hidden flex flex-col"
      >
        <UpdatesHistorySection class="w-full h-full min-h-0 text-[var(--arc-text-primary)]" />
      </div>

      <!-- Instant Skeleton Fallback: Zero black void! -->
      <div v-else class="flex-1 min-h-0 h-full overflow-y-auto p-4 sm:p-6 md:pl-10 md:pr-8 lg:pl-14 lg:pr-12">
        <SettingsSkeleton class="max-w-[1040px] w-full mx-auto" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useSettingsNav } from '../composables/useSettingsNav';
import { useSettingsVisibility } from '../composables/useSettingsVisibility';
import { useSettingsStore } from '../stores/settings.store';
import { evaluateConflicts, type ActiveConflict } from '../logic/conflict-rules';
import { ChevronLeft } from 'lucide-vue-next';
import ConflictBanner from './primitives/ConflictBanner.vue';
import SettingsMenu from './SettingsMenu.vue';
import SettingsSkeleton from './SettingsSkeleton.vue';
import GeneralSettingsSection from './sections/GeneralSettingsSection.vue';
import AiSettings from './AiSettings.vue';
import VoiceSettings from './VoiceSettings.vue';
import PerformanceSettings from './PerformanceSettings.vue';
import UpdatesHistorySection from './UpdatesHistorySection.vue';

const store = useSettingsStore();
const { 
  activeTab, 
  activeSection, 
  searchQuery, 
  SETTINGS_MENU, 
  isSplitNavigationTab,
  saveTabScroll,
  getTabScroll,
  saveTabSection,
  consumeSkipTabScrollRestore,
  isProgrammaticScroll, 
  setProgrammaticScroll 
} = useSettingsNav();
const { isCompactMode } = useSettingsVisibility();

const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
const mobileView = ref<'menu' | 'content'>('menu');

const isTablistRendered = computed(
  () => (!isMobile.value || mobileView.value === 'menu') && !searchQuery.value.trim()
);

const currentActiveCategoryLabel = computed(() => {
  const cat = SETTINGS_MENU.find((c) => c.id === activeTab.value);
  if (!cat) return store.language === 'EN' ? 'Settings' : 'Настройки';
  return store.language === 'EN' ? cat.labelEn : cat.labelRu;
});

let sectionObserver: IntersectionObserver | null = null;
let currentScrollContainer: HTMLElement | null = null;

const handleResize = () => {
  isMobile.value = window.innerWidth < 768;
};

function setupIntersectionObserver() {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

  if (sectionObserver) {
    sectionObserver.disconnect();
    sectionObserver = null;
  }

  // Split-navigation tabs render one standalone subsection page at a time; no scroll spy needed
  if (isSplitNavigationTab(activeTab.value)) return;

  const container = document.querySelector('.settings-scroll-container') as HTMLElement | null;
  currentScrollContainer = container;

  if (!container) return;

  const onScrollEnd = () => {
    setProgrammaticScroll(false);
  };
  container.removeEventListener('scrollend', onScrollEnd);
  container.addEventListener('scrollend', onScrollEnd);

  sectionObserver = new IntersectionObserver((entries) => {
    if (isProgrammaticScroll.value) return;

    const visibleEntries = entries.filter(e => e.isIntersecting);
    if (visibleEntries.length > 0) {
      visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const topEntry = visibleEntries[0];
      if (topEntry.target.id) {
        saveTabSection(activeTab.value, topEntry.target.id);
        if (topEntry.target.id !== activeSection.value) {
          activeSection.value = topEntry.target.id;
        }
      }
    }
  }, {
    root: container,
    rootMargin: '-5% 0px -65% 0px',
    threshold: [0, 0.2, 0.5]
  });

  const sections = container.querySelectorAll('section[id^="section-"]');
  sections.forEach((sec) => sectionObserver?.observe(sec));
}

onMounted(() => {
  const mountTime = performance.now();
  if (typeof window !== 'undefined') {
    const start = (window as any).__arcSettingsOpenStart || mountTime;
    const elapsed = Math.max(1, mountTime - start);
    console.log(`[PERF] SettingsPanel:first-rail-paint: ${elapsed.toFixed(2)}ms`);
    (window as any).__arcLastSettingsOpenMs = elapsed;
  }
  window.addEventListener('resize', handleResize);
  if (!SETTINGS_MENU.some(c => c.id === activeTab.value)) {
    activeTab.value = 'core';
  }
  if (!activeSection.value) {
    activeSection.value = firstSectionOf(activeTab.value);
  }
  nextTick(() => {
    setupIntersectionObserver();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (!isSplitNavigationTab(activeTab.value) && currentScrollContainer) {
    saveTabScroll(activeTab.value, currentScrollContainer.scrollTop);
    if (activeSection.value) {
      saveTabSection(activeTab.value, activeSection.value);
    }
  }
  if (sectionObserver) {
    sectionObserver.disconnect();
    sectionObserver = null;
  }
});

function onSearchNavigate() {
  if (isMobile.value) {
    mobileView.value = 'content';
  }
}

watch(activeSection, () => {
  if (isMobile.value) {
    mobileView.value = 'content';
  }
});

const currentActiveSectionLabel = computed(() => {
  for (const cat of SETTINGS_MENU) {
    const sec = cat.sections.find(s => s.id === activeSection.value);
    if (sec) {
      return store.language === 'EN' ? sec.labelEn : sec.labelRu;
    }
  }
  return '';
});

const activeConflicts = computed<ActiveConflict[]>(() => {
  const ctx = {
    forcedOfflineMode: store.forcedOfflineMode,
    useLocalLLM: store.useLocalLLM,
    exclusiveMode: false,
    exclusiveProvider: null,
    microphoneEnabled: store.voiceVolume > 0,
    wakeWordEnabled: store.sttKeywordsEnabled
  };
  return evaluateConflicts(ctx, {
    enableLocalAI: () => { store.useLocalLLM = true; },
    openProviderCard: () => { activeTab.value = 'intelligence'; activeSection.value = 'section-providers'; },
    enableMicrophone: () => { store.voiceVolume = 1.0; }
  });
});

const firstSectionOf = (tab: string) => SETTINGS_MENU.find((c) => c.id === tab)?.sections[0]?.id ?? null;

watch(activeTab, async (tab, oldTab) => {
  if (oldTab && oldTab !== tab && !isSplitNavigationTab(oldTab) && currentScrollContainer) {
    saveTabScroll(oldTab, currentScrollContainer.scrollTop);
    if (activeSection.value) {
      saveTabSection(oldTab, activeSection.value);
    }
  }

  const cat = SETTINGS_MENU.find((c) => c.id === tab);
  if (!cat) {
    activeTab.value = 'core';
    return;
  }
  if (!cat.sections.some((s) => s.id === activeSection.value)) {
    activeSection.value = firstSectionOf(tab);
  }
  const skipRestore = consumeSkipTabScrollRestore();
  await nextTick();
  const container = document.querySelector('.settings-scroll-container') as HTMLElement | null;
  if (container && !isSplitNavigationTab(tab) && !skipRestore && !store.pendingHighlightId && !store.pendingHighlightQuery) {
    const savedScroll = getTabScroll(tab);
    setProgrammaticScroll(true);
    container.scrollTop = savedScroll;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: savedScroll, behavior: 'auto' });
    }
    setTimeout(() => setProgrammaticScroll(false), 120);
  }
  setupIntersectionObserver();
}, { flush: 'pre' });
</script>

<style scoped>
:deep(.arc-settings-compact [data-frequency="setup-once"]:not(.search-highlight)),
:deep(.arc-settings-compact [data-frequency="debug-only"]:not(.search-highlight)) {
  display: none !important;
}
</style>
