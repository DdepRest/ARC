<template>
  <div 
    id="global-tabbar"
    role="tablist"
    class="w-full flex items-center justify-between bg-[var(--arc-rail,#080808)] h-11 px-3 select-none relative pointer-events-auto z-50"
  >
    <!-- Left: Pinned tabs section -->
    <div class="flex items-center gap-1 shrink-0 border-r border-[var(--arc-divider)] pr-2 mr-1.5">
      <TabItem
        v-for="tab in pinnedTabsList"
        :key="'pinned-' + tab"
        :name="tab"
        :is-active="activeTab === tab"
        :is-pinned="true"
        @select="selectTab"
        @keydown="onTabKeydown"
        @contextmenu="openContextMenu"
      />
    </div>

    <!-- Center: Scrollable tabs section -->
    <div class="flex-1 min-w-0 flex items-center relative h-full">
      <!-- Left scroll arrow (visible when overflowed & scrolled) -->
      <button 
        v-if="showLeftArrow"
        @click="scroll('left')"
        class="absolute left-0 z-10 h-8 w-6 flex items-center justify-center bg-gradient-to-r from-[var(--arc-rail)] via-[var(--arc-rail)] to-transparent text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors focus-visible:outline-none cursor-pointer"
        aria-label="Scroll left"
      >
        <ChevronLeft class="w-3.5 h-3.5" />
      </button>

      <!-- Scroll container -->
      <div
        ref="scrollContainer"
        @wheel.passive="handleWheel"
        @scroll="checkScroll"
        class="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth px-1.5 h-full"
      >
        <TabItem
          v-for="tab in scrollableTabsList"
          :key="'scroll-' + tab"
          :name="tab"
          :is-active="activeTab === tab"
          :is-pinned="false"
          @select="selectTab"
          @keydown="onTabKeydown"
          @contextmenu="openContextMenu"
        />
      </div>

      <!-- Right scroll arrow (visible when overflowed and not at the end) -->
      <button 
        v-if="showRightArrow"
        @click="scroll('right')"
        class="absolute right-0 z-10 h-8 w-6 flex items-center justify-center bg-gradient-to-l from-[var(--arc-rail)] via-[var(--arc-rail)] to-transparent text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors focus-visible:outline-none cursor-pointer"
        aria-label="Scroll right"
      >
        <ChevronRight class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Right: Modules & Search -->
    <div class="flex items-center gap-1.5 shrink-0 border-l border-[var(--arc-divider)] pl-2 ml-1 relative">
      <!-- Direct Modules System Button with integrated quick-access menu -->
      <div 
        class="relative flex items-center rounded-[10px] border transition-colors duration-150"
        :class="[
          modulesMenuOpen
            ? 'bg-[var(--arc-hover)] border-[var(--arc-hairline)]'
            : 'bg-transparent border-transparent hover:bg-[var(--arc-hover)]'
        ]"
        ref="modulesTriggerRef"
      >
        <button 
          @click="openModulesDashboard"
          class="flex items-center gap-1.5 text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] px-2.5 h-[34px] rounded-l-[10px] text-xs font-mono uppercase font-medium cursor-pointer transition-colors"
          :class="activeTab === 'modules' ? 'text-[var(--accent)] font-semibold' : ''"
          title="Обзор всех модулей и подсистем A.R.C."
        >
          <Cpu class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span>Модули</span>
        </button>

        <!-- Subtle internal vertical divider -->
        <div class="w-[1px] h-3.5 bg-[var(--arc-divider)] shrink-0"></div>

        <!-- Integrated dropdown chevron with comfortable hit area -->
        <button
          @click.stop="toggleModulesMenu"
          class="w-6 h-[34px] flex items-center justify-center text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors rounded-r-[10px] cursor-pointer select-none"
          :class="modulesMenuOpen ? 'text-[var(--arc-text-primary)]' : ''"
          title="Список подсистем"
          aria-label="Подсистемы A.R.C."
        >
          <ChevronDown class="w-3 h-3 transition-transform duration-200" :class="modulesMenuOpen ? 'rotate-180 text-[var(--accent)]' : ''" />
        </button>
      </div>

      <!-- Modules Dropdown Menu -->
      <div 
        v-if="modulesMenuOpen"
        v-click-outside="closeModulesMenu"
        class="absolute right-0 w-72 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[16px] shadow-[0_20px_48px_rgba(0,0,0,0.85)] z-50 overflow-hidden"
        :class="settingsStore.tabBarPosition === 'top' ? 'top-full mt-2' : 'bottom-full mb-2'"
      >
        <div 
          class="p-3 border-b border-[var(--arc-divider)] flex items-center justify-between bg-[var(--arc-plane)]"
        >
          <span class="text-xs font-mono uppercase tracking-[0.14em] text-[var(--accent)] ml-1 font-semibold">Подсистемы A.R.C.</span>
          <button 
            @click="openModulesDashboard"
            class="text-xs font-mono uppercase text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
          >
            Все модули →
          </button>
        </div>
        <div class="max-h-[320px] overflow-y-auto no-scrollbar py-1">
          <button
            v-for="mod in plannedModules"
            :key="mod.id"
            @click="selectModule(mod.id)"
            class="w-full flex items-start gap-3 p-3 text-left hover:bg-[var(--arc-hover)] transition-colors group border-l-2 border-transparent hover:border-[var(--accent)] cursor-pointer"
          >
            <component :is="mod.icon" class="w-4 h-4 text-[var(--arc-text-muted)] group-hover:text-[var(--accent)] mt-0.5 shrink-0 transition-colors" />
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-medium text-[var(--arc-text-primary)]">{{ mod.name }}</span>
              <span class="text-xs text-[var(--arc-text-muted)] font-mono">{{ mod.desc }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Spotlight Search Trigger Button -->
      <button 
        @click="openSearch"
        class="flex items-center gap-1.5 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition px-2.5 h-[34px] rounded-[10px] text-xs font-mono uppercase font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        title="Открыть навигационный прожектор (Ctrl+K / Cmd+K)"
      >
        <Search class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>Поиск</span>
        <span class="text-xs bg-[var(--arc-input)] border border-[var(--arc-hairline)] px-1.5 py-0.5 rounded-[4px] text-[var(--arc-text-muted)] font-mono ml-0.5">⌘K</span>
      </button>
    </div>

    <!-- Context Menu for Pin/Unpin actions -->
    <div
      v-if="contextMenu.show"
      v-click-outside="closeContextMenu"
      class="fixed z-50 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[12px] shadow-2xl py-1.5 w-48"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <button
        @click="togglePin(contextMenu.tab)"
        class="w-full text-left px-3.5 py-2 text-xs font-mono tracking-wider text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition flex items-center gap-2 uppercase cursor-pointer"
      >
        <Pin class="w-3.5 h-3.5 text-[var(--accent)]" />
        {{ isPinned(contextMenu.tab) ? 'ОТКРЕПИТЬ ВКЛАДКУ' : 'ЗАКРЕПИТЬ ВКЛАДКУ' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import type { TabName } from '../../../shared/types/ui';
import TabItem from './TabItem.vue';
import { ChevronLeft, ChevronRight, Pin, Search, ChevronDown, Cpu, Box, Wrench, GraduationCap, Layout, Workflow, Activity, Terminal, History } from 'lucide-vue-next';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const activeTab = computed(() => uiStore.activeTab);
const defaultPinned: TabName[] = ['core', 'chat', 'objectives', 'settings'];
const workingTabs: TabName[] = ['core', 'chat', 'objectives', 'tasks', 'files', 'memory', 'commands', 'transcription', 'vision', 'updates', 'settings'];

const plannedModules: {id: TabName, name: string, icon: any, desc: string}[] = [
  {id: 'updates', name: 'История обновлений', icon: History, desc: 'Журнал релизов и изменений A.R.C.'},
  {id: 'orchestrator', name: 'Оркестратор', icon: Cpu, desc: 'Управление пулом агентов'},
  {id: 'agents', name: 'Агенты', icon: Box, desc: 'Настройка автономных агентов'},
  {id: 'tools', name: 'Утилиты', icon: Wrench, desc: 'Подключение внешних API'},
  {id: 'skills', name: 'Навыки', icon: GraduationCap, desc: 'Обучение нейросети новым паттернам'},
  {id: 'architecture', name: 'Архитектура', icon: Layout, desc: 'Проектирование систем'},
  {id: 'scenarios', name: 'Сценарии', icon: Workflow, desc: 'Визуальный редактор логики'},
  {id: 'observability', name: 'Наблюдаемость', icon: Activity, desc: 'Мониторинг и логи'},
  {id: 'sandbox', name: 'Песочница', icon: Terminal, desc: 'Изолированная среда выполнения'}
];

const modulesMenuOpen = ref(false);
const modulesTriggerRef = ref<HTMLButtonElement | null>(null);

const toggleModulesMenu = () => { modulesMenuOpen.value = !modulesMenuOpen.value; };
const closeModulesMenu = () => { modulesMenuOpen.value = false; };
const openModulesDashboard = () => { modulesMenuOpen.value = false; selectTab('modules'); };
const selectModule = (tab: TabName) => { selectTab(tab); modulesMenuOpen.value = false; };

const pinnedTabsList = computed<TabName[]>(() => {
  return settingsStore.pinnedTabs || defaultPinned;
});

const scrollableTabsList = computed<TabName[]>(() => {
  return workingTabs.filter(tab => !pinnedTabsList.value.includes(tab));
});

const allVisibleTabs = computed<TabName[]>(() => {
  return [...pinnedTabsList.value, ...scrollableTabsList.value];
});

const scrollContainer = ref<HTMLDivElement | null>(null);
const showLeftArrow = ref(false);
const showRightArrow = ref(false);

const handleWheel = (e: WheelEvent) => {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollLeft += e.deltaY;
  checkScroll();
};

const checkScroll = () => {
  const el = scrollContainer.value;
  if (!el) return;
  
  showLeftArrow.value = el.scrollLeft > 2;
  showRightArrow.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
};

const scroll = (direction: 'left' | 'right') => {
  const el = scrollContainer.value;
  if (!el) return;
  
  const scrollAmount = 200;
  el.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth'
  });
  
  setTimeout(checkScroll, 300);
};

const selectTab = (tab: TabName) => {
  uiStore.setActiveTab(tab);
};

const focusTabElement = (tab: TabName) => {
  nextTick(() => {
    const el = document.getElementById(`tab-${tab}`);
    if (el) {
      el.focus();
    }
  });
};

const onTabKeydown = (event: KeyboardEvent, currentTab: TabName) => {
  const tabs = allVisibleTabs.value;
  const currentIndex = tabs.indexOf(currentTab);
  if (currentIndex === -1) return;

  let nextTab: TabName | null = null;

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    nextTab = tabs[(currentIndex + 1) % tabs.length];
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
  } else if (event.key === 'Home') {
    event.preventDefault();
    nextTab = tabs[0];
  } else if (event.key === 'End') {
    event.preventDefault();
    nextTab = tabs[tabs.length - 1];
  }

  if (nextTab) {
    selectTab(nextTab);
    focusTabElement(nextTab);
  }
};

const openSearch = () => {
  window.dispatchEvent(new CustomEvent('open-spotlight'));
};

const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  tab: 'core' as TabName
});

const openContextMenu = (event: MouseEvent, tab: TabName) => {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    tab
  };
};

const closeContextMenu = () => {
  contextMenu.value.show = false;
};

const isPinned = (tab: TabName) => {
  return pinnedTabsList.value.includes(tab);
};

const togglePin = (tab: TabName) => {
  if (!settingsStore.pinnedTabs) {
    settingsStore.pinnedTabs = [...defaultPinned];
  }
  
  const index = settingsStore.pinnedTabs.indexOf(tab);
  if (index >= 0) {
    if (settingsStore.pinnedTabs.length > 1) {
      settingsStore.pinnedTabs.splice(index, 1);
    }
  } else {
    settingsStore.pinnedTabs.push(tab);
  }
  
  closeContextMenu();
  nextTick(() => {
    checkScroll();
  });
};

const vClickOutside = {
  mounted(el: any, binding: any) {
    el._clickOutsideHandler = (event: Event) => {
      const target = event.target as Node;
      if (modulesTriggerRef.value && (modulesTriggerRef.value === target || modulesTriggerRef.value.contains(target))) {
        return;
      }
      if (el && !el.contains(target)) {
        binding.value(event);
      }
    };
    el._timer = setTimeout(() => {
      document.addEventListener('pointerdown', el._clickOutsideHandler);
    }, 50);
  },
  unmounted(el: any) {
    clearTimeout(el._timer);
    if (el._clickOutsideHandler) {
      document.removeEventListener('pointerdown', el._clickOutsideHandler);
    }
  }
};

const scrollActiveIntoView = () => {
  const container = scrollContainer.value;
  if (!container) return;
  const activeEl = container.querySelector(`#tab-${activeTab.value}`) as HTMLElement | null;
  if (activeEl) {
    const rect = activeEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetLeft = rect.left - containerRect.left + container.scrollLeft;
    const targetScrollLeft = offsetLeft - (container.clientWidth / 2) + (rect.width / 2);
    container.scrollTo({
      left: targetScrollLeft,
      behavior: 'smooth'
    });
  }
  checkScroll();
};

watch(activeTab, () => {
  scrollActiveIntoView();
});

onMounted(() => {
  window.addEventListener('resize', checkScroll);
  nextTick(() => {
    checkScroll();
    scrollActiveIntoView();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', checkScroll);
});
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
