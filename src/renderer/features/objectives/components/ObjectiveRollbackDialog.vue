<template>
  <ArcModal
    :show="show"
    title="ПРОТОКОЛ АТОМАРНОГО ОТКАТА // ATOMIC ROLLBACK"
    subtitle="Восстановление целевого состояния и транзакционный возврат изменений"
    max-width="max-w-xl"
    :close-on-backdrop="!isRollingBack"
    @close="handleClose"
  >
    <template #title-prefix>
      <ShieldAlert class="w-4 h-4 text-[var(--status-err)]" />
    </template>

    <div class="flex flex-col gap-4 text-sm select-none">
      <!-- Target Objective Information -->
      <div class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-xl p-4 flex flex-col gap-1.5">
        <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-widest">ЦЕЛЕВОЙ ОБЪЕКТ ОТКАТА</span>
        <div class="text-sm font-sans font-medium text-[var(--arc-text-primary)] leading-snug">
          {{ objectiveTitle }}
        </div>
        <div class="text-xs font-mono text-[var(--arc-text-hint)] mt-0.5">
          ID: {{ objectiveId }}
        </div>
      </div>

      <!-- Warning & Consequence description -->
      <div class="border border-[var(--status-err)]/30 bg-[var(--arc-block)] rounded-xl p-4 flex gap-3 text-xs leading-relaxed">
        <AlertTriangle class="w-5 h-5 text-[var(--status-err)] shrink-0 mt-0.5" />
        <div class="flex flex-col gap-1">
          <span class="font-semibold text-[var(--status-err)]">Внимание: деструктивная операция</span>
          <p class="text-[var(--arc-text-secondary)]">
            Движок A.R.C. инициирует пошаговый откат всех зафиксированных действий (<span class="font-mono font-semibold">Actions</span>) и решений (<span class="font-mono font-semibold">Decisions</span>). Файловые модификации будут восстановлены из теневых копий.
          </p>
        </div>
      </div>

      <!-- Active Rollback Progress Bar (if in progress) -->
      <div v-if="isRollingBack" class="p-4 border border-[var(--status-err)]/40 bg-[var(--arc-block)] rounded-xl flex flex-col gap-3">
        <div class="flex justify-between items-center text-xs font-mono">
          <div class="flex items-center gap-2 text-[var(--status-err)] font-semibold">
            <span class="w-2 h-2 rounded-full bg-[var(--status-err)] animate-ping"></span>
            <span>Выполняется откат...</span>
          </div>
          <span v-if="progress" class="text-[var(--status-err)] font-semibold">
            {{ progress.current }} / {{ progress.total }}
          </span>
        </div>

        <div class="w-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-full h-1.5 overflow-hidden">
          <div 
            class="bg-[var(--status-err)] h-full rounded-full transition-all duration-300 ease-out"
            :style="{ width: progress ? `${(progress.current / Math.max(1, progress.total)) * 100}%` : '40%' }"
          ></div>
        </div>

        <div v-if="progress?.text" class="text-xs font-mono text-[var(--arc-text-hint)] truncate">
          {{ progress.text }}
        </div>
      </div>

      <!-- Result summary (if finished) -->
      <div v-if="resultSummary" class="border rounded-xl p-4 flex flex-col gap-2" :class="resultSummary.success ? 'border-[var(--status-ok)]/40 bg-[var(--arc-block)] text-[var(--status-ok)]' : 'border-[var(--status-err)]/40 bg-[var(--arc-block)] text-[var(--status-err)]'">
        <div class="font-semibold flex items-center gap-2">
          <span>{{ resultSummary.success ? '✓ Откат успешно завершен' : '⚠ Откат завершен с ошибками' }}</span>
        </div>
        <p class="text-xs leading-relaxed text-[var(--arc-text-secondary)]">
          {{ resultSummary.message }}
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-3 w-full">
        <ArcButton
          v-if="!isRollingBack && !resultSummary"
          @click="handleClose"
          variant="secondary"
          size="sm"
        >
          Отмена
        </ArcButton>

        <ArcButton
          v-if="!isRollingBack && !resultSummary"
          @click="$emit('confirm')"
          variant="danger"
          size="sm"
        >
          <template #icon>
            <RotateCcw class="w-3.5 h-3.5" />
          </template>
          Подтвердить откат цели
        </ArcButton>

        <ArcButton
          v-if="resultSummary"
          @click="handleClose"
          variant="primary"
          size="sm"
        >
          Закрыть
        </ArcButton>
      </div>
    </template>
  </ArcModal>
</template>

<script setup lang="ts">
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-vue-next';
import ArcModal from '../../../components/ui/ArcModal.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';

defineProps<{
  show: boolean;
  objectiveId: string;
  objectiveTitle: string;
  isRollingBack: boolean;
  progress: { current: number; total: number; text: string } | null;
  resultSummary: { success: boolean; message: string } | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm'): void;
}>();

const handleClose = () => {
  emit('close');
};
</script>
