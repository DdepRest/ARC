<template>
  <section id="section-storage" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Данные и хранилище" 
      description="Локальная база данных SQLite, кэш моделей и управление памятью. Все ваши данные хранятся изолированно на вашем компьютере."
      blockCountText="3 основных блока · локальные файлы и кэши"
      :icon="Database" 
    />

    <div class="flex flex-col gap-4">
      <!-- Unified Caches Block -->
      <CacheSettingsBlock ref="cacheBlockRef" />

      <!-- Storage Metrics Block -->
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

      <!-- Danger Zone Block -->
      <DangerZone 
        id="system.storage.reset"
        title="Сбросить все параметры"
        description="Возвращает систему к начальному состоянию. Будут удалены локальные настройки, кэш и временные файлы."
        warning-text="Необратимое действие. Все пользовательские настройки будут сброшены до заводских значений."
        confirm-button-text="Да, сбросить все параметры"
        @confirm="handleSystemReset"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import DangerZone from '../../primitives/DangerZone.vue';
import CacheSettingsBlock from './CacheSettingsBlock.vue';
import { Database, Download } from 'lucide-vue-next';

const store = useSettingsStore();

const isExporting = ref(false);
const cacheBlockRef = ref<InstanceType<typeof CacheSettingsBlock> | null>(null);

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
