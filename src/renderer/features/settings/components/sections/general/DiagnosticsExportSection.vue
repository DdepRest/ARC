<template>
  <section id="section-diagnostics-export" class="scroll-mt-14 flex flex-col gap-5 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Системная диагностика" 
      description="Экспорт полного обезличенного отчёта о конфигурации, статусах сервисов, БД и аппаратных метриках."
      blockCountText="1 блок · диагностика"
      :icon="Activity" 
    />

    <SettingsBlock title="Инженерный экспорт" subtitle="Диагностический JSON-снапшот">
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
    </SettingsBlock>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Activity, Download } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import { useUIStore } from '../../../../../stores/ui.store';

const uiStore = useUIStore();
const isExporting = ref(false);

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
