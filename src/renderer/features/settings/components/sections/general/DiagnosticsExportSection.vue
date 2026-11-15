<template>
  <section id="section-diagnostics-export" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 07"
      title="Системная диагностика"
      description="Экспорт полного обезличенного отчёта о конфигурации, статусах сервисов, БД и аппаратных метриках."
      :statusLabel="headerStatus.label"
      :statusTone="headerStatus.tone"
      blockCountText="1 функциональная группа"
      :icon="Activity"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Инженерный экспорт -->
    <SettingsGroup
      indexLabel="01"
      title="Инженерный экспорт снапшота"
      description="Формирование диагностического JSON-пакета без ключей и персональных данных."
      badgeText="JSON · Санитизирован"
    >
      <SettingsBlock>
        <SettingsRow
          id="general.diagnostics.export"
          label="Экспорт диагностического отчёта (JSON)"
          description="Формирует безопасный отчёт без паролей и персональных данных для анализа неполадок и отправки разработчикам."
          data-search="диагностика экспорт отчет json system:export-diagnostics логи"
        >
          <button
            type="button"
            :disabled="isExporting"
            @click="runExportDiagnostics"
            class="px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono font-medium text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[rgba(var(--accent-rgb),0.4)] transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Download class="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{{ isExporting ? 'Экспорт...' : 'Экспорт отчёта JSON' }}</span>
          </button>
        </SettingsRow>

        <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
          <span class="text-xs font-mono text-[var(--arc-text-machine)]">
            Бенчмарк пресетов графики и детальные логи рендера:
          </span>
          <CrossLink tab="system" sectionId="section-diagnostics" label="Открыть раздел Система → Диагностика" />
        </div>
      </SettingsBlock>
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Activity, Download } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import { useUIStore } from '../../../../../stores/ui.store';

const uiStore = useUIStore();
const isExporting = ref(false);
const hasExportApi = computed(() => typeof window !== 'undefined' && typeof (window as any).api?.exportDiagnostics === 'function');

const headerStatus = computed(() => {
  if (!hasExportApi.value) return { label: 'БЕЗ IPC', tone: 'off' as const };
  if (isExporting.value) return { label: 'ВЫГРУЗКА...', tone: 'warn' as const };
  return { label: 'ЭКСПОРТ JSON', tone: 'accent' as const };
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Формат пакета',
    value: 'JSON Snapshot',
    detail: 'Структурированный дампер',
    tone: 'accent'
  },
  {
    label: 'Защита секретов',
    value: 'Маскирование ВКЛ',
    detail: 'API-ключи исключены',
    tone: 'default'
  },
  {
    label: 'Состав отчёта',
    value: 'ОС · GPU · БД · ИИ',
    detail: 'Метрики и конфигурация',
    tone: 'default'
  },
  {
    label: 'Статус канала',
    value: !hasExportApi.value ? 'Недоступен' : isExporting.value ? 'Сборка...' : 'Доступен',
    detail: !hasExportApi.value ? 'Требуется Electron IPC' : 'Локальная выгрузка на диск',
    tone: !hasExportApi.value ? 'off' : isExporting.value ? 'warn' : 'accent'
  }
]);

async function runExportDiagnostics() {
  if (isExporting.value) return;
  if (!window.api || typeof (window.api as any).exportDiagnostics !== 'function') {
    uiStore.showToast('Интерфейс экспорта диагностики недоступен', 'error', 4000);
    return;
  }

  isExporting.value = true;
  try {
    const res = await (window.api as any).exportDiagnostics();
    if (res.canceled) {
      return;
    }
    if (res.success && res.filePath) {
      uiStore.showToast(`Диагностический отчёт сохранён: ${res.filePath}`, 'success', 5000);
    } else {
      uiStore.showToast(res.error || 'Ошибка экспорта диагностики', 'error', 5000);
    }
  } catch (err: any) {
    uiStore.showToast(`Сбой экспорта: ${err?.message || String(err)}`, 'error', 5000);
  } finally {
    isExporting.value = false;
  }
}
</script>
