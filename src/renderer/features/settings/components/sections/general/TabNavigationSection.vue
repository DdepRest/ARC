<template>
  <section id="section-navigation" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 03"
      :icon="LayoutGrid"
      title="Навигация"
      description="Расположение главной панели вкладок, режим отображения и закреплённые рабочие пространства."
      :statusLabel="`ЗАКРЕПЛЕНО: ${store.pinnedTabs.length}`"
      statusTone="ok"
      blockCountText="2 функциональные группы"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Конфигурация панели вкладок -->
    <SettingsGroup
      indexLabel="01"
      title="Конфигурация панели вкладок"
      description="Геометрия командного дока и управление списком закреплённых пространств."
      :badgeText="store.tabBarPosition === 'top' ? 'Позиция: Сверху' : 'Позиция: Снизу'"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Position -->
          <SettingsRow
            id="navigation.position"
            label="Позиция панели вкладок"
            description="Расположение главной строки навигации: сверху или в нижнем командном доке."
            data-search="расположение панелей позиция position tabs вкладки top bottom"
          >
            <div
              class="inline-flex gap-1 bg-[var(--arc-well)] p-1 rounded-[10px] border border-[var(--arc-hairline)] shrink-0"
              :style="{ boxShadow: 'var(--arc-well-shadow)' }"
            >
              <button
                type="button"
                @click="store.tabBarPosition = 'top'"
                class="px-3.5 py-1 rounded-[7px] text-xs font-mono font-semibold transition cursor-pointer"
                :class="store.tabBarPosition === 'top' ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] shadow-sm' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
              >
                СВЕРХУ
              </button>
              <button
                type="button"
                @click="store.tabBarPosition = 'bottom'"
                class="px-3.5 py-1 rounded-[7px] text-xs font-mono font-semibold transition cursor-pointer"
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
              <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">
                ({{ store.pinnedTabs.length }}/{{ allTabs.length }})
              </span>
            </template>

            <button
              type="button"
              @click="isManagingTabs = !isManagingTabs"
              class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] transition border cursor-pointer shrink-0 flex items-center gap-1.5"
              :class="isManagingTabs
                ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[rgba(var(--accent-rgb),0.45)] shadow-sm'
                : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
            >
              <Star class="w-3.5 h-3.5" :class="isManagingTabs ? 'fill-[var(--accent)] text-[var(--accent)]' : ''" />
              <span>{{ isManagingTabs ? 'Готово' : 'Настроить список' }}</span>
            </button>
          </SettingsRow>
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Группа 02 — Матрица рабочих пространств -->
    <SettingsGroup
      indexLabel="02"
      :title="isManagingTabs ? 'Выбор вкладок для закрепления' : 'Активные пространства быстрого запуска'"
      description="Набор закреплённых модулей, доступных в один клик из главного дока."
      :badgeText="`${store.pinnedTabs.length} активно`"
    >
      <SettingsBlock>
        <!-- Horizontal List -->
        <div v-if="!isManagingTabs" class="p-4 flex flex-wrap items-center gap-2">
          <div
            v-for="tab in store.pinnedTabs"
            :key="tab"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] shrink-0 text-xs font-medium font-mono"
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
              : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
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
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
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
    const mapEn: Record<string, string> = {
      core: 'Core', chat: 'Chat', objectives: 'Objectives', tasks: 'Tasks',
      files: 'Files', orchestrator: 'Orchestrator', agents: 'Agents', memory: 'Memory',
      tools: 'Tools', skills: 'Skills', architecture: 'Architecture', scenarios: 'Scenarios',
      commands: 'Macros', observability: 'Observability', sandbox: 'Sandbox', settings: 'Settings', vision: 'Vision'
    };
    return mapEn[tab] || String(tab);
  }
  const mapRu: Record<string, string> = {
    core: 'Ядро', chat: 'Диалог', objectives: 'Цели', tasks: 'Задачи',
    files: 'Файлы', orchestrator: 'Оркестратор', agents: 'Агенты', memory: 'Память',
    tools: 'Инструменты', skills: 'Навыки', architecture: 'Архитектура', scenarios: 'Сценарии',
    commands: 'Макросы', observability: 'Обсерватория', sandbox: 'Песочница', settings: 'Настройки', vision: 'Камера'
  };
  return mapRu[tab] || String(tab);
};

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Позиция дока',
    value: store.tabBarPosition === 'top' ? 'Верхний рельс' : 'Нижний док',
    detail: 'Главная панель навигации',
    tone: 'ok'
  },
  {
    label: 'Закреплено вкладок',
    value: `${store.pinnedTabs.length} из ${allTabs.length}`,
    detail: 'Быстрый доступ в доке',
    tone: 'accent'
  },
  {
    label: 'Скрытые модули',
    value: `${Math.max(0, allTabs.length - store.pinnedTabs.length)}`,
    detail: 'Доступны через меню',
    tone: 'default'
  },
  {
    label: 'Режим редактора',
    value: isManagingTabs.value ? 'Редактирование' : 'Просмотр',
    detail: 'Конфигурация списка',
    tone: isManagingTabs.value ? 'warn' : 'ok'
  }
]);
</script>
