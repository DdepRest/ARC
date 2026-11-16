<template>
  <SettingsBlock title="Корзина диалогов и автоочистка" subtitle="Срок хранения удалённых сессий">
    <SettingsRow
      id="system.storage.trash"
      label="Автоматическая очистка корзины"
      description="Удалённые в корзину диалоги окончательно очищаются вместе с сообщениями по истечении указанного срока с момента удаления. Активные и архивные диалоги не затрагиваются."
      :tech="retentionTechText"
      data-search="корзина диалогов автоочистка срок хранения удаление trash retention"
    >
      <div class="flex flex-col items-end gap-2 w-full sm:w-auto sm:min-w-[260px]">
        <div class="w-full sm:w-[260px]">
          <ArcSelect
            id="dialog-trash-retention-select"
            :model-value="selectedMode"
            :options="presetOptions"
            size="sm"
            :disabled="isSaving"
            @update:model-value="onPresetChange"
          />
        </div>

        <div v-if="selectedMode === 'custom'" class="flex items-center gap-2 w-full sm:w-[260px]">
          <div class="flex-1 min-w-0">
            <ArcInput
              v-model="customDaysInput"
              placeholder="Дней (напр. 14)"
              size="sm"
              inputmode="numeric"
              :disabled="isSaving"
              :error="validationError || undefined"
              @keyup.enter="applyCustomDays"
            />
          </div>
          <button
            type="button"
            @click="applyCustomDays"
            :disabled="isSaving"
            class="h-8 px-3 rounded-[10px] text-xs font-mono font-medium bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            Применить
          </button>
        </div>

        <p v-if="validationError" class="text-xs font-sans text-[var(--status-err)] text-right max-w-[260px]">
          {{ validationError }}
        </p>
      </div>
    </SettingsRow>

    <SettingsRow
      id="system.storage.trashCleanupNow"
      label="Проверка просроченных диалогов"
      description="Запустить очистку корзины сейчас согласно выбранному сроку хранения."
      data-search="очистить корзину просроченные диалоги cleanup trash"
    >
      <button
        type="button"
        @click="runCleanupNow"
        :disabled="isCleaning || store.dialogTrashRetentionDays === null"
        class="px-3.5 py-1.5 text-xs font-mono font-medium rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        <Trash2 class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>{{ isCleaning ? 'Очистка...' : 'Очистить просроченные' }}</span>
      </button>
    </SettingsRow>

    <div
      v-if="feedback"
      class="px-5 py-3 border-t border-[var(--arc-divider)] bg-[var(--arc-well)] text-xs font-mono"
      :class="feedback.tone === 'ok' ? 'text-[var(--status-ok)]' : feedback.tone === 'err' ? 'text-[var(--status-err)]' : 'text-[var(--status-warn)]'"
    >
      {{ feedback.message }}
    </div>
  </SettingsBlock>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import ArcInput from '../../../../../components/ui/ArcInput.vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';

type RetentionMode = 'off' | '7' | '30' | '90' | 'custom';

const store = useSettingsStore();
const uiStore = useUIStore();

const isCustomSelected = ref(false);
const customDaysInput = ref('');
const validationError = ref<string | null>(null);
const isSaving = ref(false);
const isCleaning = ref(false);
const feedback = ref<{ tone: 'ok' | 'warn' | 'err'; message: string } | null>(null);

const presetOptions: Array<{ label: string; value: RetentionMode }> = [
  { label: 'Не очищать автоматически', value: 'off' },
  { label: '7 дней', value: '7' },
  { label: '30 дней', value: '30' },
  { label: '90 дней', value: '90' },
  { label: 'Свой срок (дней)', value: 'custom' }
];

const selectedMode = computed<RetentionMode>(() => {
  if (isCustomSelected.value) return 'custom';
  const days = store.dialogTrashRetentionDays;
  if (days === null) return 'off';
  if (days === 7) return '7';
  if (days === 30) return '30';
  if (days === 90) return '90';
  return 'custom';
});

const retentionTechText = computed(() => {
  const days = store.dialogTrashRetentionDays;
  if (days === null) return 'Статус: автоочистка отключена (по умолчанию)';
  return `Активно правило: удаление через ${days} дн. после помещения в корзину`;
});

watch(
  () => store.dialogTrashRetentionDays,
  (days) => {
    if (days !== null && ![7, 30, 90].includes(days)) {
      customDaysInput.value = String(days);
      isCustomSelected.value = true;
    }
  },
  { immediate: true }
);

async function saveRetention(days: number | null) {
  isSaving.value = true;
  validationError.value = null;
  feedback.value = null;
  try {
    const res = await store.setDialogTrashRetentionDays(days);
    if (!res.success) {
      validationError.value = res.error || 'Некорректное значение срока хранения';
      uiStore.showToast(validationError.value, 'error', 4000);
      return;
    }
    const label = days === null ? 'Автоочистка корзины отключена' : `Срок хранения в корзине: ${days} дн.`;
    feedback.value = { tone: 'ok', message: label };
    uiStore.showToast(label, 'success', 3000);
  } finally {
    isSaving.value = false;
  }
}

function onPresetChange(val: string | number | boolean) {
  const mode = String(val) as RetentionMode;
  validationError.value = null;
  feedback.value = null;
  if (mode === 'custom') {
    isCustomSelected.value = true;
    if (!customDaysInput.value && store.dialogTrashRetentionDays) {
      customDaysInput.value = String(store.dialogTrashRetentionDays);
    }
    return;
  }
  isCustomSelected.value = false;
  if (mode === 'off') {
    void saveRetention(null);
    return;
  }
  const days = Number(mode);
  if (Number.isInteger(days) && days >= 1) {
    void saveRetention(days);
  }
}

function applyCustomDays() {
  const raw = customDaysInput.value.trim();
  if (!/^\d+$/.test(raw)) {
    validationError.value = 'Введите целое положительное число дней (например, 14)';
    return;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    validationError.value = 'Срок хранения должен быть не менее 1 дня';
    return;
  }
  if (parsed > 36500) {
    validationError.value = 'Максимальный срок хранения — 36500 дней';
    return;
  }
  void saveRetention(parsed);
}

async function runCleanupNow() {
  if (isCleaning.value || store.dialogTrashRetentionDays === null) return;
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (typeof api?.dialogRunTrashCleanup !== 'function') {
    feedback.value = { tone: 'warn', message: 'IPC автоочистки недоступен в текущей среде' };
    return;
  }
  isCleaning.value = true;
  feedback.value = null;
  try {
    const res = await api.dialogRunTrashCleanup();
    if (!res?.success) {
      const msg = res?.error || 'Не удалось выполнить очистку корзины';
      feedback.value = { tone: 'err', message: msg };
      uiStore.showToast(msg, 'error', 4000);
      return;
    }
    const msg = res.deletedCount > 0
      ? `Удалено просроченных диалогов: ${res.deletedCount}`
      : 'Просроченных диалогов в корзине не обнаружено';
    feedback.value = { tone: 'ok', message: msg };
    uiStore.showToast(msg, 'info', 3000);
  } catch (e: any) {
    const msg = e?.message || 'Ошибка при очистке корзины';
    feedback.value = { tone: 'err', message: msg };
    uiStore.showToast(msg, 'error', 4000);
  } finally {
    isCleaning.value = false;
  }
}

onMounted(() => {
  void store.syncTrashConfigFromMain();
});
</script>
