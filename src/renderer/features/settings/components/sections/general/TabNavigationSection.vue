<template>
  <section id="section-navigation" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      :icon="LayoutGrid" 
      title="Навигация" 
      description="Расположение главной панели вкладок, режим отображения и закреплённые пространства."
      blockCountText="2 блока · параметры навигации"
    />

    <div class="flex flex-col gap-4">
      <SettingsBlock title="Конфигурация панели вкладок" subtitle="Элементы навигации">
        <!-- Position -->
        <SettingsRow
          id="navigation.position"
          label="Позиция панели вкладок"
          description="Расположение главной строки навигации: сверху или в нижнем командном доке."
          data-search="расположение панелей позиция position tabs вкладки top bottom"
        >
          <div 
            class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)] shrink-0"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
          >
            <button 
              type="button"
              @click="store.tabBarPosition = 'top'"
              class="px-3.5 py-1 rounded-[8px] text-xs font-mono font-semibold transition cursor-pointer"
              :class="store.tabBarPosition === 'top' ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] shadow-sm' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
            >
              СВЕРХУ
            </button>
            <button 
              type="button"
              @click="store.tabBarPosition = 'bottom'"
              class="px-3.5 py-1 rounded-[8px] text-xs font-mono font-semibold transition cursor-pointer"
              :class="store.tabBarPosition === 'bottom' ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] shadow-sm' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
            >
              СНИЗУ
            </button>
          </div>
        </SettingsRow>

        <!-- Pinned Tabs Manager Trigger -->
        <SettingsRow
          id="navigation.pinned"
          label="Закреплённые рабочие пространства"
          description="Выбор активных вкладок для постоянного отображения на панели быстрого доступа."
          data-search="закрепленные вкладки pinned tabs быстрый доступ"
        >
          <template #badge>
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1">
              ({{ store.pinnedTabs.length }}/{{ allTabs.length }})
            </span>
          </template>

          <button 
            type="button"
            @click="isManagingTabs = !isManagingTabs"
            class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] transition border cursor-pointer shrink-0 flex items-center gap-1.5"
            :class="isManagingTabs 
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[rgba(var(--accent-rgb),0.45)] shadow-sm' 
              : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]'"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
          >
            <Star class="w-3.5 h-3.5" :class="isManagingTabs ? 'fill-[var(--accent)] text-[var(--accent)]' : ''" />
            <span>{{ isManagingTabs ? 'Готово' : 'Настроить список' }}</span>
          </button>
        </SettingsRow>
      </SettingsBlock>

      <!-- Pinned Tabs Manager Grid / Preview -->
      <SettingsBlock :title="isManagingTabs ? 'Выбор вкладок для закрепления' : 'Активные пространства'" subtitle="Быстрый запуск">
        <!-- Horizontal List -->
        <div v-if="!isManagingTabs" class="p-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div 
            v-for="tab in store.pinnedTabs" 
            :key="tab"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] shrink-0 text-xs font-medium font-mono"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
          >
            <Star class="w-3 h-3 text-[var(--accent)] fill-[var(--accent)] shrink-0" />
            <span>{{ getTabLabel(tab) }}</span>
          </div>
        </div>

        <!-- Inline Expanded Grid Mode -->
        <div v-else class="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <button 
            v-for="tab in allTabs" 
            :key="tab"
            type="button"
            @click="toggleTabPin(tab)"
            class="flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] border transition cursor-pointer select-none text-left"
            :class="isTabPinned(tab) 
              ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)] font-medium shadow-sm' 
              : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] hover:text-[var(--arc-text-primary)]'"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
          >
            <div class="flex items-center gap-2 truncate">
              <Star 
                class="w-3.5 h-3.5 shrink-0"
                :class="isTabPinned(tab) ? 'fill-[var(--accent)] text-[var(--accent)]' : 'text-[var(--arc-text-muted)]'"
              />
              <span class="text-xs truncate font-mono">{{ getTabLabel(tab) }}</span>
            </div>
            <span class="text-xs font-mono font-bold" :class="isTabPinned(tab) ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)]'">
              {{ isTabPinned(tab) ? 'ВКЛ' : 'ВЫКЛ' }}
            </span>
          </button>
        </div>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { LayoutGrid, Star } from 'lucide-vue-next';
import type { TabName } from '../../../../../../shared/types/ui';

const store = useSettingsStore();
const isManagingTabs = ref(false);

const allTabs: TabName[] = [
  'core', 'chat', 'objectives', 'tasks', 'files', 'orchestrator', 
  'agents', 'memory', 'tools', 'skills', 'architecture', 'scenarios', 
  'commands', 'observability', 'sandbox', 'settings', 'vision'
];

const isTabPinned = (tab: TabName) => {
  return store.pinnedTabs.includes(tab);
};

const toggleTabPin = (tab: TabName) => {
  if (!store.pinnedTabs) {
    store.pinnedTabs = ['core', 'chat', 'objectives', 'settings'];
  }
  const index = store.pinnedTabs.indexOf(tab);
  if (index >= 0) {
    if (store.pinnedTabs.length > 1) {
      store.pinnedTabs.splice(index, 1);
    }
  } else {
    store.pinnedTabs.push(tab);
  }
};

const getTabLabel = (tab: TabName) => {
  if (store.language === 'EN') {
    switch (tab) {
      case 'core': return 'Core';
      case 'chat': return 'Chat';
      case 'objectives': return 'Objectives';
      case 'tasks': return 'Tasks';
      case 'files': return 'Files';
      case 'orchestrator': return 'Orchestrator';
      case 'agents': return 'Agents';
      case 'memory': return 'Memory';
      case 'tools': return 'Tools';
      case 'skills': return 'Skills';
      case 'architecture': return 'Architecture';
      case 'scenarios': return 'Scenarios';
      case 'commands': return 'Macros';
      case 'observability': return 'Observability';
      case 'sandbox': return 'Sandbox';
      case 'settings': return 'Settings';
      case 'vision': return 'Vision';
      default: return String(tab);
    }
  } else {
    switch (tab) {
      case 'core': return 'Ядро';
      case 'chat': return 'Диалог';
      case 'objectives': return 'Цели';
      case 'tasks': return 'Задачи';
      case 'files': return 'Файлы';
      case 'orchestrator': return 'Оркестратор';
      case 'agents': return 'Агенты';
      case 'memory': return 'Память';
      case 'tools': return 'Инструменты';
      case 'skills': return 'Навыки';
      case 'architecture': return 'Архитектура';
      case 'scenarios': return 'Сценарии';
      case 'commands': return 'Макросы';
      case 'observability': return 'Обсерватория';
      case 'sandbox': return 'Песочница';
      case 'settings': return 'Настройки';
      case 'vision': return 'Камера';
      default: return String(tab);
    }
  }
};
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
