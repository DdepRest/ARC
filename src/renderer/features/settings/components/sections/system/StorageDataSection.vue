<template>
  <section id="section-storage" class="scroll-mt-14 flex flex-col gap-6 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Система · Подсистема 05"
      title="Данные и хранилище"
      description="Локальная база данных SQLite, кэш моделей и управление памятью. Все ваши данные хранятся изолированно на вашем компьютере."
      statusLabel="SQLITE ЛОКАЛЬНО"
      statusTone="ok"
      blockCountText="3 функциональные группы"
      :icon="Database"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <div class="flex flex-col gap-7">
      <SettingsGroup
        indexLabel="01"
        title="Оперативные кэши ИИ и синтеза речи"
        description="Управление временными буферами ответов LLM, аудиофайлов Silero TTS и векторов памяти"
        badgeText="Кэши подсистем"
      >
        <CacheSettingsBlock ref="cacheBlockRef" />
      </SettingsGroup>

      <SettingsGroup
        indexLabel="02"
        title="Локальная база данных и резервный архив"
        description="Статистика дискового пространства SQLite и создание полной резервной копии профиля"
        badgeText="~14.2 МБ"
      >
        <SettingsBlock title="Объём используемой памяти" subtitle="Дисковое пространство">
          <SettingsRow
            id="system.storage.db"
            label="База данных SQLite (диалоги, задачи, история)"
            description="Файлы базы данных в локальной директории данных приложения."
            tech="~14.2 МБ"
            data-search="база данных sqlite диалоги задачи история storage db"
          />

          <SettingsRow
            id="system.storage.export"
            label="Экспорт полного архива данных"
            description="Создать zip-архив с диалогами, задачами и профилями для переноса на другое устройство."
            data-search="экспорт полного архива данных zip бэкап перенос export backup"
          >
            <button
              type="button"
              @click="exportArchive"
              class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
            >
              <Download class="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{{ isExporting ? 'Экспорт...' : 'Экспорт zip-архива' }}</span>
            </button>
          </SettingsRow>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        indexLabel="03"
        title="Сброс к заводским параметрам"
        description="Полная очистка пользовательских настроек и возврат конфигурации A.R.C. к исходному состоянию"
        badgeText="Опасная зона"
      >
        <DangerZone
          id="system.storage.reset"
          title="Сбросить все параметры"
          description="Возвращает систему к начальному состоянию. Будут удалены локальные настройки, кэш и временные файлы."
          warning-text="Необратимое действие. Все пользовательские настройки будут сброшены до заводских значений."
          confirm-button-text="Да, сбросить все параметры"
          @confirm="handleSystemReset"
        />
      </SettingsGroup>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsSummaryStrip, { type SummaryItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import DangerZone from '../../primitives/DangerZone.vue';
import CacheSettingsBlock from './CacheSettingsBlock.vue';
import { Database, Download } from 'lucide-vue-next';

const store = useSettingsStore();

const isExporting = ref(false);
const cacheBlockRef = ref<InstanceType<typeof CacheSettingsBlock> | null>(null);

const summaryItems = computed<SummaryItem[]>(() => [
  { label: 'Движок хранения', value: 'SQLite 3', tone: 'ok', sublabel: 'Локальная изоляция' },
  { label: 'Объём базы данных', value: '~14.2 МБ', sublabel: 'Диалоги, задачи, память' },
  { label: 'Резервный архив', value: isExporting.value ? 'Сборка...' : 'ZIP Бэкап', sublabel: 'Полный перенос профиля' },
  { label: 'Сброс конфигурации', value: 'Защищён', tone: 'ok', sublabel: 'Требует подтверждения' },
]);

function exportArchive() {
  isExporting.value = true;
  setTimeout(() => {
    isExporting.value = false;
  }, 600);
}

function handleSystemReset() {
  cacheBlockRef.value?.clearAllCaches();
  store.resetToDefaults();
}
</script>
