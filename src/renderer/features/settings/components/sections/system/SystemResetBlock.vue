<template>
  <div id="system.storage.reset" data-setting-id="system.storage.reset" class="flex flex-col gap-4">
    <!-- Action 1: UI Settings & Operational Caches Reset (No Restart) -->
    <SettingsBlock
      id="system.storage.reset.ui"
      data-setting-id="system.storage.reset.ui"
      :title="uiDisclosure.title"
      subtitle="Без перезапуска · база данных, конфигурации, Secret Vault, логи и модели сохраняются"
    >
      <div
        class="px-5 py-4 flex flex-col gap-4"
        data-search="сброс параметров интерфейса настроек кэш ui reset defaults"
      >
        <p class="text-xs text-[var(--arc-text-secondary)] leading-relaxed">
          {{ uiDisclosure.subtitle }}
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            data-testid="reset-ui-will-delete"
            class="p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-2"
          >
            <span class="text-xs font-mono font-semibold text-[var(--status-warn)]">
              Будет сброшено / очищено
            </span>
            <ul class="space-y-1.5 text-xs text-[var(--arc-text-secondary)]">
              <li v-for="item in uiDisclosure.willDelete" :key="item.id" class="flex flex-col gap-0.5">
                <span class="font-medium text-[var(--arc-text-primary)]">{{ item.label }}</span>
                <span class="text-[var(--arc-text-muted)]">{{ item.detail }}</span>
              </li>
            </ul>
          </div>

          <div
            data-testid="reset-ui-will-preserve"
            class="p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-2"
          >
            <span class="text-xs font-mono font-semibold text-[var(--status-ok)]">
              Сохранится без изменений
            </span>
            <ul class="space-y-1.5 text-xs text-[var(--arc-text-secondary)]">
              <li v-for="item in uiDisclosure.willPreserve" :key="item.id" class="flex flex-col gap-0.5">
                <span class="font-medium text-[var(--arc-text-primary)]">{{ item.label }}</span>
                <span class="text-[var(--arc-text-muted)]">{{ item.detail }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--arc-divider)]">
          <span class="text-xs font-mono text-[var(--arc-text-muted)]">
            Перезапуск не требуется
          </span>
          <button
            type="button"
            data-testid="open-ui-reset-btn"
            :disabled="isResettingUi || isResettingData"
            @click="showUiModal = true"
            class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <RotateCcw class="w-3.5 h-3.5 text-[var(--status-warn)]" />
            <span>{{ isResettingUi ? 'Сброс параметров...' : 'Сбросить параметры UI...' }}</span>
          </button>
        </div>

        <div
          v-if="uiFeedback"
          data-testid="reset-ui-feedback"
          class="px-3.5 py-2.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-xs font-mono"
          :class="uiFeedback.tone === 'ok' ? 'text-[var(--status-ok)]' : 'text-[var(--status-err)]'"
        >
          {{ uiFeedback.message }}
        </div>
      </div>
    </SettingsBlock>

    <!-- Action 2: Application Data & Configuration Reset (Variant A, Restart) -->
    <div
      id="system.storage.reset.data"
      data-setting-id="system.storage.reset.data"
      data-search="сброс данных конфигурации приложения база данных vault логи reset system data"
      class="overflow-hidden rounded-[16px] border border-[var(--status-err)]/30 bg-[var(--arc-block)]"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-[var(--status-err)]/25 bg-[var(--arc-plane)]"
      >
        <div class="flex items-center gap-2 text-[var(--status-err)]">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-err)] shrink-0"></span>
          <span class="text-[13px] font-semibold leading-[1.35]">{{ appDataDisclosure.title }}</span>
        </div>
        <span class="text-xs font-mono px-2.5 py-0.5 rounded-[8px] border border-[var(--status-err)]/30 bg-[var(--arc-block)] text-[var(--status-err)] font-semibold">
          НЕОБРАТИМО · ПЕРЕЗАПУСК
        </span>
      </div>

      <div class="p-5 flex flex-col gap-4">
        <p class="text-xs text-[var(--arc-text-secondary)] leading-relaxed">
          {{ appDataDisclosure.subtitle }}
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            data-testid="reset-data-will-delete"
            class="p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--status-err)]/25 flex flex-col gap-2"
          >
            <span class="text-xs font-mono font-semibold text-[var(--status-err)]">
              Будет удалено
            </span>
            <ul class="space-y-1.5 text-xs text-[var(--arc-text-secondary)]">
              <li v-for="item in appDataDisclosure.willDelete" :key="item.id" class="flex flex-col gap-0.5">
                <span class="font-medium text-[var(--arc-text-primary)]">{{ item.label }}</span>
                <span class="text-[var(--arc-text-muted)] font-mono">{{ item.detail }}</span>
              </li>
            </ul>
          </div>

          <div
            data-testid="reset-data-will-preserve"
            class="p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-2"
          >
            <span class="text-xs font-mono font-semibold text-[var(--status-ok)]">
              Сохранится без изменений
            </span>
            <ul class="space-y-1.5 text-xs text-[var(--arc-text-secondary)]">
              <li v-for="item in appDataDisclosure.willPreserve" :key="item.id" class="flex flex-col gap-0.5">
                <span class="font-medium text-[var(--arc-text-primary)]">{{ item.label }}</span>
                <span class="text-[var(--arc-text-muted)] font-mono">{{ item.detail }}</span>
              </li>
            </ul>
          </div>
        </div>

        <label
          class="flex items-start gap-3 p-3 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] cursor-pointer select-none"
        >
          <ArcCheckbox
            id="system-reset-clear-models"
            v-model="clearModels"
            size="sm"
            :disabled="isResettingData"
          />
          <div class="flex flex-col gap-0.5 text-xs">
            <span class="font-medium text-[var(--arc-text-primary)]">
              Также удалить скачанные локальные модели (каталог models/)
            </span>
            <span class="text-[var(--arc-text-muted)]">
              По умолчанию снято: модели GGUF, STT и TTS не удаляются. Secret Vault и логи сохраняются при любом выборе.
            </span>
          </div>
        </label>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--arc-divider)]">
          <span class="text-xs font-mono text-[var(--arc-text-muted)]">
            {{ canResetSystem ? 'После успешной очистки A.R.C. перезапустится' : 'IPC system:reset-data недоступен в текущей среде' }}
          </span>
          <button
            type="button"
            data-testid="open-data-reset-btn"
            :disabled="!canResetSystem || isResettingData || isResettingUi"
            @click="showDataModal = true"
            class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] bg-[var(--arc-plane)] text-[var(--status-err)] border border-[var(--status-err)]/35 hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <AlertTriangle class="w-3.5 h-3.5" />
            <span>{{ isResettingData ? 'Сброс данных...' : 'Сбросить данные приложения...' }}</span>
          </button>
        </div>

        <div
          v-if="dataFeedback"
          data-testid="reset-data-feedback"
          class="px-3.5 py-2.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-xs font-mono"
          :class="dataFeedback.tone === 'ok' ? 'text-[var(--status-ok)]' : 'text-[var(--status-err)]'"
        >
          {{ dataFeedback.message }}
        </div>
      </div>
    </div>

    <!-- Confirmation Modal 1: UI Settings & Caches Reset -->
    <ArcModal
      :show="showUiModal"
      :title="uiDisclosure.title"
      subtitle="Подтвердите сброс параметров интерфейса и очистку кэшей"
      max-width="max-w-lg"
      :close-on-backdrop="!isResettingUi"
      @close="!isResettingUi && (showUiModal = false)"
    >
      <div class="flex flex-col gap-3 text-xs text-[var(--arc-text-secondary)]">
        <div class="p-3 rounded-[10px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-1.5">
          <span class="font-mono font-semibold text-[var(--status-warn)]">Будет сброшено / очищено:</span>
          <ul class="list-disc pl-4 space-y-1">
            <li v-for="item in uiDisclosure.willDelete" :key="item.id">
              <strong class="text-[var(--arc-text-primary)]">{{ item.label }}</strong> — {{ item.detail }}
            </li>
          </ul>
        </div>

        <div class="p-3 rounded-[10px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-1.5">
          <span class="font-mono font-semibold text-[var(--status-ok)]">Сохранится без изменений:</span>
          <ul class="list-disc pl-4 space-y-1">
            <li v-for="item in uiDisclosure.willPreserve" :key="item.id">
              <strong class="text-[var(--arc-text-primary)]">{{ item.label }}</strong> — {{ item.detail }}
            </li>
          </ul>
        </div>
      </div>

      <template #footer>
        <button
          type="button"
          :disabled="isResettingUi"
          @click="showUiModal = false"
          class="px-4 py-1.5 rounded-[10px] text-xs font-mono font-medium bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          type="button"
          data-testid="confirm-ui-reset-btn"
          :disabled="isResettingUi"
          @click="confirmUiReset"
          class="px-4 py-1.5 rounded-[10px] text-xs font-mono font-semibold bg-[var(--arc-plane)] border border-[var(--status-warn)]/40 text-[var(--status-warn)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50"
        >
          {{ isResettingUi ? 'Сброс...' : 'Да, сбросить параметры UI' }}
        </button>
      </template>
    </ArcModal>

    <!-- Confirmation Modal 2: App Data & Config Reset (Variant A) -->
    <ArcModal
      :show="showDataModal"
      :title="appDataDisclosure.title"
      subtitle="Необратимая очистка локальных данных с последующим перезапуском A.R.C."
      max-width="max-w-lg"
      :close-on-backdrop="!isResettingData"
      @close="!isResettingData && (showDataModal = false)"
    >
      <div class="flex flex-col gap-3 text-xs text-[var(--arc-text-secondary)]">
        <div class="p-3 rounded-[10px] bg-[var(--arc-well)] border border-[var(--status-err)]/30 flex flex-col gap-1.5">
          <span class="font-mono font-semibold text-[var(--status-err)]">Будет безвозвратно удалено:</span>
          <ul class="list-disc pl-4 space-y-1">
            <li v-for="item in appDataDisclosure.willDelete" :key="item.id">
              <strong class="text-[var(--arc-text-primary)]">{{ item.label }}</strong> — {{ item.detail }}
            </li>
          </ul>
        </div>

        <div class="p-3 rounded-[10px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-1.5">
          <span class="font-mono font-semibold text-[var(--status-ok)]">Сохранится без изменений:</span>
          <ul class="list-disc pl-4 space-y-1">
            <li v-for="item in appDataDisclosure.willPreserve" :key="item.id">
              <strong class="text-[var(--arc-text-primary)]">{{ item.label }}</strong> — {{ item.detail }}
            </li>
          </ul>
        </div>
      </div>

      <template #footer>
        <button
          type="button"
          :disabled="isResettingData"
          @click="showDataModal = false"
          class="px-4 py-1.5 rounded-[10px] text-xs font-mono font-medium bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          type="button"
          data-testid="confirm-data-reset-btn"
          :disabled="isResettingData"
          @click="confirmAppDataReset"
          class="px-4 py-1.5 rounded-[10px] text-xs font-mono font-semibold bg-[var(--status-err)] text-[var(--arc-frame)] hover:opacity-90 transition cursor-pointer disabled:opacity-50"
        >
          {{ isResettingData ? 'Очистка и перезапуск...' : 'Да, сбросить данные и перезапустить' }}
        </button>
      </template>
    </ArcModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { AlertTriangle, RotateCcw } from 'lucide-vue-next';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import ArcModal from '../../../../../components/ui/ArcModal.vue';
import ArcCheckbox from '../../../../../components/ui/ArcCheckbox.vue';
import { useUIStore } from '../../../../../stores/ui.store';
import {
  getAppDataResetDisclosure,
  getUiResetDisclosure
} from '../../../../../../shared/config/reset-policy';

const props = defineProps<{
  onResetUi: () => Promise<void> | void;
}>();

const uiStore = useUIStore();

const showUiModal = ref(false);
const showDataModal = ref(false);
const clearModels = ref(false);
const isResettingUi = ref(false);
const isResettingData = ref(false);
const uiFeedback = ref<{ tone: 'ok' | 'err'; message: string } | null>(null);
const dataFeedback = ref<{ tone: 'ok' | 'err'; message: string } | null>(null);

const uiDisclosure = getUiResetDisclosure();
const appDataDisclosure = computed(() =>
  getAppDataResetDisclosure({ clearModels: clearModels.value })
);

const canResetSystem = computed(
  () => typeof window !== 'undefined' && typeof (window as any).api?.resetSystem === 'function'
);

async function confirmUiReset() {
  if (isResettingUi.value) return;
  isResettingUi.value = true;
  uiFeedback.value = null;
  try {
    await props.onResetUi();
    showUiModal.value = false;
    uiFeedback.value = {
      tone: 'ok',
      message: 'Параметры интерфейса и оперативные кэши сброшены. БД, Secret Vault, логи и модели сохранены.'
    };
    uiStore.showToast('Параметры интерфейса и кэши сброшены', 'success', 4000);
  } catch (err: any) {
    const msg = err?.message || String(err);
    uiFeedback.value = { tone: 'err', message: `Ошибка сброса параметров UI: ${msg}` };
    uiStore.showToast(`Ошибка сброса параметров: ${msg}`, 'error', 5000);
  } finally {
    isResettingUi.value = false;
  }
}

async function confirmAppDataReset() {
  if (isResettingData.value) return;
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (typeof api?.resetSystem !== 'function') {
    dataFeedback.value = { tone: 'err', message: 'IPC-канал system:reset-data недоступен в текущей среде.' };
    showDataModal.value = false;
    return;
  }

  isResettingData.value = true;
  dataFeedback.value = null;
  try {
    const res = await api.resetSystem({ clearModels: clearModels.value });
    if (res?.success) {
      showDataModal.value = false;
      dataFeedback.value = {
        tone: 'ok',
        message: res.relaunched
          ? 'Данные очищены. Выполняется перезапуск A.R.C....'
          : 'Данные приложения очищены (Secret Vault и логи сохранены).'
      };
    } else {
      const errMsg = res?.error || 'Не удалось выполнить сброс данных приложения';
      dataFeedback.value = { tone: 'err', message: errMsg };
      uiStore.showToast(errMsg, 'error', 6000);
      showDataModal.value = false;
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    dataFeedback.value = { tone: 'err', message: `Сбой сброса данных: ${msg}` };
    uiStore.showToast(`Сбой сброса данных: ${msg}`, 'error', 6000);
    showDataModal.value = false;
  } finally {
    isResettingData.value = false;
  }
}
</script>
