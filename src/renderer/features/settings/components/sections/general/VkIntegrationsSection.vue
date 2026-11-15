<template>
  <section id="section-integrations" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 06"
      :icon="Globe"
      title="Интеграции и веб-поиск"
      description="Поисковый контур для проверки актуальных фактов в сети и внешние медиа-интеграции."
      :statusLabel="store.forcedOfflineMode ? 'ОФЛАЙН-ЛИМИТ' : store.enableWebSearch ? 'ПОИСК ВКЛЮЧЁН' : 'ПОИСК ОТКЛЮЧЁН'"
      :statusTone="store.forcedOfflineMode ? 'warn' : store.enableWebSearch ? 'accent' : 'off'"
      blockCountText="1 функциональная группа"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Поисковый контур и внешние сервисы -->
    <SettingsGroup
      indexLabel="01"
      title="Поисковые провайдеры и внешние сервисы"
      description="Настройка поискового движка для проверки фактов в реальном времени и связь с медиа-виджетами."
      :badgeText="providerLabel"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Enable Web Search Toggle -->
          <SettingsRow
            id="integrations.web_search.enabled"
            data-setting-id="integrations.web_search.enabled"
            label="Веб-поиск для ассистента"
            description="Разрешить ИИ обращаться к поисковым системам для получения актуальных данных из интернета."
            data-search="веб-поиск web search интернет поиск актуальные данные"
          >
            <ArcToggle v-model="store.enableWebSearch" class="shrink-0" />
          </SettingsRow>

          <!-- Search Provider Select -->
          <SettingsRow
            id="integrations.web_search.provider"
            data-setting-id="integrations.web_search.provider"
            label="Провайдер веб-поиска"
            description="Выберите поисковый движок для выполнения веб-запросов (DuckDuckGo / Tavily / Serper)."
            data-search="провайдер веб-поиска search provider duckduckgo tavily serper"
          >
            <div class="w-56 shrink-0">
              <ArcSelect
                size="sm"
                :model-value="store.searchProvider"
                :options="[
                  { label: 'DuckDuckGo (Без ключа)', value: 'duckduckgo' },
                  { label: 'Tavily AI Search', value: 'tavily' },
                  { label: 'Serper (Google Search)', value: 'serper' }
                ]"
                @update:model-value="setSearchProvider"
              />
            </div>
          </SettingsRow>
        </div>

        <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
          <span class="text-xs font-mono text-[var(--arc-text-machine)]">
            Плейлист VK Музыки и габариты медиа-капсулы:
          </span>
          <CrossLink tab="core" sectionId="section-widgets" label="Музыкальный хаб и VK Музыка — в разделе Панели и виджеты" />
        </div>
      </SettingsBlock>
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { Globe } from 'lucide-vue-next';

const store = useSettingsStore();
const setSearchProvider = (val: string | number | boolean) => {
  store.searchProvider = String(val) as 'duckduckgo' | 'tavily' | 'serper';
};

const providerLabel = computed(() => {
  if (store.searchProvider === 'tavily') return 'Tavily AI';
  if (store.searchProvider === 'serper') return 'Serper Google';
  return 'DuckDuckGo';
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Контур веб-поиска',
    value: store.forcedOfflineMode ? 'Заблокирован' : store.enableWebSearch ? 'Включён' : 'Отключён',
    detail: store.forcedOfflineMode ? 'Активен строгий офлайн-режим' : 'Настройка доступа в сеть',
    tone: store.forcedOfflineMode ? 'warn' : store.enableWebSearch ? 'accent' : 'off'
  },
  {
    label: 'Поисковый движок',
    value: providerLabel.value,
    detail: store.searchProvider === 'duckduckgo' ? 'Не требует API-ключа' : 'Облачный поисковый API',
    tone: 'accent'
  },
  {
    label: 'Медиа-поток VK',
    value: store.vkAudioUrl ? 'Настроен URL' : 'По умолчанию',
    detail: 'В разделе Панели и виджеты',
    tone: 'default'
  },
  {
    label: 'Сетевой периметр',
    value: store.forcedOfflineMode ? 'Строгий офлайн' : 'Онлайн разрешён',
    detail: 'Глобальная политика роутера',
    tone: store.forcedOfflineMode ? 'warn' : 'default'
  }
]);
</script>
