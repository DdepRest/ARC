<template>
  <section id="section-integrations" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      :icon="Globe" 
      title="Интеграции и веб-поиск" 
      description="Поисковый контур для проверки актуальных фактов в сети и внешние медиа-интеграции."
      blockCountText="1 блок · веб-поиск и интеграции"
    />
    <div class="flex flex-col gap-4">
      <SettingsBlock title="Интеграции и веб-поиск" subtitle="Поисковые провайдеры и внешние сервисы">
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
          <div class="w-52 shrink-0">
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

        <div class="px-4 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]/40">
          <span class="text-xs text-[var(--arc-text-muted)]">
            Ссылка на плейлист VK Музыки и настройки музыкального виджета перенесены в раздел виджетов:
          </span>
          <CrossLink tab="core" sectionId="section-widgets" label="Музыкальный хаб и VK Музыка — в разделе Панели и виджеты" />
        </div>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { Globe } from 'lucide-vue-next';

const store = useSettingsStore();
const setSearchProvider = (val: string) => { store.searchProvider = val as 'duckduckgo' | 'tavily' | 'serper'; };
</script>
