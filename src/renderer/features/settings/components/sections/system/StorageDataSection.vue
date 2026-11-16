<template>
  <section id="section-storage" class="scroll-mt-14 flex flex-col gap-6 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Система · Подсистема 05"
      title="Данные и хранилище"
      description="Локальная база данных SQLite, кэш моделей и управление памятью. Все ваши данные хранятся изолированно на вашем компьютере."
      :statusLabel="headerStatus.label"
      :statusTone="headerStatus.tone"
      blockCountText="4 функциональные группы"
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
        description="Статистика дискового пространства SQLite и создание согласованного архива без секретов Vault"
        :badgeText="dbSizeDisplay"
      >
        <SettingsBlock title="Объём используемой памяти" subtitle="Дисковое пространство">
          <SettingsRow
            id="system.storage.db"
            label="База данных SQLite (диалоги, задачи, история)"
            description="Файлы базы данных в локальной директории данных приложения."
            :tech="dbRowTech"
            data-search="база данных sqlite диалоги задачи история storage db"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-1.5 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-well)] text-xs font-mono tabular-nums text-[var(--arc-text-primary)]">
                {{ dbSizeDisplay }}
              </span>
              <button
                type="button"
                @click="loadStorageStats"
                :disabled="!canReadStorage || measureState === 'loading'"
                class="px-2.5 py-1.5 text-xs font-mono rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:bg-[var(--arc-hover)] hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                title="Обновить замер размера"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': measureState === 'loading' }" />
                <span>Обновить</span>
              </button>
            </div>
          </SettingsRow>

          <SettingsRow
            id="system.storage.export"
            label="Экспорт архива данных (без секретов)"
            description="Создать zip-архив со снимком базы данных, конфигурацией и макросами. API-ключи и Secret Vault (DPAPI) в архив не включаются и после переноса вводятся повторно."
            data-search="экспорт архива данных zip бэкап перенос секреты ключи export backup"
          >
            <button
              type="button"
              @click="exportArchive"
              :disabled="isExporting || !canExportArchive"
              class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] transition-all duration-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
            >
              <Download class="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{{ exportButtonLabel }}</span>
            </button>
          </SettingsRow>

          <div
            v-if="exportFeedback"
            class="px-5 py-3 border-t border-[var(--arc-divider)] bg-[var(--arc-well)] text-xs font-mono"
            :class="exportFeedbackClass"
          >
            {{ exportFeedback.message }}
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        indexLabel="03"
        title="Корзина диалогов и автоочистка"
        description="Срок хранения удалённых диалогов перед их автоматическим безвозвратным удалением"
        badgeText="История диалогов"
      >
        <DialogTrashRetentionBlock />
      </SettingsGroup>

      <SettingsGroup
        indexLabel="04"
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
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import DangerZone from '../../primitives/DangerZone.vue';
import CacheSettingsBlock from './CacheSettingsBlock.vue';
import DialogTrashRetentionBlock from './DialogTrashRetentionBlock.vue';
import { Database, Download, RefreshCw } from 'lucide-vue-next';

const store = useSettingsStore();
const uiStore = useUIStore();

type MeasureState = 'idle' | 'loading' | 'measured' | 'error' | 'unavailable';

const measureState = ref<MeasureState>('idle');
const dbSizeBytes = ref<number | null>(null);
const configSizeBytes = ref<number | null>(null);
const storageDataDir = ref<string>('');
const dbEngineInfo = ref<{ engine?: string; isSafeMode?: boolean; storageStatus?: string } | null>(null);
const isExporting = ref(false);
const exportFeedback = ref<{ tone: 'ok' | 'warn' | 'err'; message: string } | null>(null);
const cacheBlockRef = ref<InstanceType<typeof CacheSettingsBlock> | null>(null);

const canReadStorage = computed(() => typeof window !== 'undefined' && typeof (window as any).api?.getStorageInfo === 'function');
const canExportArchive = computed(() => typeof window !== 'undefined' && typeof (window as any).api?.exportDataArchive === 'function');

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} МБ`;
  return `${(mb / 1024).toFixed(2)} ГБ`;
}

const dbSizeDisplay = computed(() => {
  if (measureState.value === 'loading' || measureState.value === 'idle') return 'Замер...';
  if (measureState.value === 'unavailable') return 'Недоступно';
  if (measureState.value === 'error' || dbSizeBytes.value === null) return 'Ошибка замера';
  return formatBytes(dbSizeBytes.value);
});

const dbRowTech = computed(() => {
  if (measureState.value === 'measured') {
    const cfg = configSizeBytes.value !== null ? ` · Конфиги: ${formatBytes(configSizeBytes.value)}` : '';
    return storageDataDir.value ? `Каталог: ${storageDataDir.value}${cfg}` : `Точный замер: ${dbSizeDisplay.value}`;
  }
  if (measureState.value === 'unavailable') return 'IPC system:get-storage-info недоступен';
  if (measureState.value === 'error') return 'Не удалось получить размер файлов БД';
  return 'Ожидание ответа файловой системы';
});

const headerStatus = computed<{ label: string; tone: 'ok' | 'warn' | 'err' | 'off' }>(() => {
  if (measureState.value === 'unavailable' && !canReadStorage.value) {
    return { label: 'НЕИЗВЕСТНО · БЕЗ IPC', tone: 'off' };
  }
  if (measureState.value === 'error') {
    return { label: 'ОШИБКА ЗАМЕРА', tone: 'err' };
  }
  if (dbEngineInfo.value?.isSafeMode) {
    return { label: 'SAFE MODE (JSON)', tone: 'warn' };
  }
  if (dbEngineInfo.value?.engine === 'sqlite' && measureState.value === 'measured') {
    return { label: 'SQLITE ЛОКАЛЬНО', tone: 'ok' };
  }
  if (measureState.value === 'measured') {
    return { label: `ОБЪЁМ: ${dbSizeDisplay.value.toUpperCase()}`, tone: 'ok' };
  }
  return { label: 'ЗАМЕР...', tone: 'warn' };
});

const exportButtonLabel = computed(() => {
  if (!canExportArchive.value) return 'Недоступно (нет IPC)';
  if (isExporting.value) return 'Сборка архива...';
  return 'Экспорт zip-архива';
});

const exportFeedbackClass = computed(() => {
  if (!exportFeedback.value) return '';
  if (exportFeedback.value.tone === 'ok') return 'text-[var(--status-ok)]';
  if (exportFeedback.value.tone === 'err') return 'text-[var(--status-err)]';
  return 'text-[var(--status-warn)]';
});

const summaryItems = computed<SummaryStripItem[]>(() => {
  const isSqlite = dbEngineInfo.value?.engine === 'sqlite' && !dbEngineInfo.value?.isSafeMode;
  const dbEngineTone: SummaryStripItem['tone'] = !canReadStorage.value
    ? 'off'
    : dbEngineInfo.value?.isSafeMode
    ? 'warn'
    : isSqlite
    ? 'ok'
    : 'default';

  const dbSizeTone: SummaryStripItem['tone'] =
    measureState.value === 'measured'
      ? 'accent'
      : measureState.value === 'error'
      ? 'err'
      : measureState.value === 'unavailable'
      ? 'off'
      : 'warn';

  return [
    {
      label: 'Движок хранения',
      value: !canReadStorage.value ? 'Нет IPC' : dbEngineInfo.value?.isSafeMode ? 'JSON Safe Mode' : isSqlite ? 'SQLite 3' : 'Локальный',
      detail: 'Локальная изоляция',
      tone: dbEngineTone
    },
    {
      label: 'Объём базы данных',
      value: dbSizeDisplay.value,
      detail: 'Диалоги, задачи, память',
      tone: dbSizeTone
    },
    {
      label: 'Резервный архив',
      value: isExporting.value ? 'Сборка...' : canExportArchive.value ? 'ZIP Бэкап' : 'Без IPC',
      detail: 'Снимок БД (без секретов)',
      tone: canExportArchive.value ? 'default' : 'off'
    },
    {
      label: 'Сброс конфигурации',
      value: 'Защищён',
      detail: 'Требует подтверждения',
      tone: 'default'
    }
  ];
});

async function loadStorageStats() {
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (!api?.getStorageInfo) {
    measureState.value = 'unavailable';
    return;
  }

  measureState.value = 'loading';
  try {
    const [info, dbStat] = await Promise.all([
      api.getStorageInfo(),
      typeof api.getDbStatus === 'function' ? api.getDbStatus().catch(() => null) : Promise.resolve(null)
    ]);
    dbEngineInfo.value = dbStat;

    const rawDbBytes = info?.folders?.database?.sizeBytes;
    if (typeof rawDbBytes === 'number' && Number.isFinite(rawDbBytes)) {
      dbSizeBytes.value = rawDbBytes;
      configSizeBytes.value = typeof info?.folders?.config?.sizeBytes === 'number' ? info.folders.config.sizeBytes : null;
      storageDataDir.value = info?.dataDir || '';
      measureState.value = 'measured';
    } else {
      measureState.value = 'error';
    }
  } catch {
    measureState.value = 'error';
  }
}

async function exportArchive() {
  if (isExporting.value) return;
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (typeof api?.exportDataArchive !== 'function') {
    exportFeedback.value = { tone: 'warn', message: 'IPC-канал экспорта архива недоступен в текущей среде.' };
    uiStore.showToast('Экспорт архива недоступен без IPC', 'warning', 4000);
    return;
  }

  isExporting.value = true;
  exportFeedback.value = null;
  try {
    const res = await api.exportDataArchive();
    if (res?.canceled) {
      exportFeedback.value = { tone: 'warn', message: 'Экспорт архива отменён пользователем.' };
      uiStore.showToast('Экспорт архива отменён', 'info', 3000);
      return;
    }
    if (res?.success) {
      const sizeStr = typeof res.sizeBytes === 'number' ? ` (${formatBytes(res.sizeBytes)})` : '';
      exportFeedback.value = { tone: 'ok', message: `Архив сохранён: ${res.filePath}${sizeStr}` };
      uiStore.showToast(`Резервный архив сохранён${sizeStr}`, 'success', 5000);
    } else {
      const errMsg = res?.error || 'Не удалось создать архив';
      exportFeedback.value = { tone: 'err', message: `Ошибка экспорта: ${errMsg}` };
      uiStore.showToast(errMsg, 'error', 5000);
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    exportFeedback.value = { tone: 'err', message: `Сбой экспорта: ${msg}` };
    uiStore.showToast(`Сбой экспорта: ${msg}`, 'error', 5000);
  } finally {
    isExporting.value = false;
  }
}

function handleSystemReset() {
  cacheBlockRef.value?.clearAllCaches();
  store.resetToDefaults();
  void loadStorageStats();
}

onMounted(() => {
  void loadStorageStats();
});
</script>
