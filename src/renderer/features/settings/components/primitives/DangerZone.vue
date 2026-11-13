<template>
  <div 
    :id="id"
    :data-setting-id="id || 'system.storage.reset'"
    class="overflow-hidden rounded-[16px] border border-[rgba(var(--status-err-rgb,239,68,68),0.3)] bg-[var(--arc-block)] transition-colors"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <!-- Header -->
    <div 
      class="flex items-center justify-between px-4 py-3 border-b border-[rgba(var(--status-err-rgb,239,68,68),0.25)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-2 text-[var(--status-err)]">
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-err)] ring-1 ring-[rgba(var(--status-err-rgb,239,68,68),0.3)] shrink-0"></span>
        <span class="text-[13px] font-semibold leading-[1.35]">{{ title || 'Опасная зона' }}</span>
      </div>
      <span class="text-xs font-mono px-2.5 py-0.5 rounded-[8px] border border-[rgba(var(--status-err-rgb,239,68,68),0.3)] bg-[var(--arc-plane)] text-[var(--status-err)] font-semibold uppercase tracking-[0.08em]">
        НЕОБРАТИМО
      </span>
    </div>

    <!-- Actions List -->
    <div class="divide-y divide-[var(--arc-hairline)]">
      <slot>
        <div v-if="description" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
          <div class="flex flex-col gap-1 max-w-lg">
            <span class="text-xs font-semibold text-[var(--arc-text-primary)]">{{ title || 'Сбросить параметры' }}</span>
            <span class="text-xs text-[var(--arc-text-muted)] leading-relaxed">{{ description }}</span>
          </div>
          <button
            type="button"
            @click="triggerDefaultAction"
            class="px-4 py-1.5 text-xs font-mono font-medium rounded-[10px] bg-[var(--arc-plane)] text-[var(--status-err)] border border-[rgba(var(--status-err-rgb,239,68,68),0.35)] hover:bg-[var(--arc-hover)] transition-all duration-200 shrink-0 cursor-pointer self-start sm:self-auto"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
          >
            Сбросить
          </button>
        </div>
      </slot>
    </div>

    <!-- Confirmation Modal Dialog -->
    <div 
      v-if="modalVisible" 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 arc-glass-veil animate-fade-in"
      @click.self="cancelAction"
    >
      <div 
        class="w-full max-w-md rounded-[16px] border border-[rgba(var(--status-err-rgb,239,68,68),0.4)] bg-[var(--arc-block)] p-5 flex flex-col gap-4"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 60px rgba(0, 0, 0, 0.75)' }"
      >
        <div class="flex items-start gap-3">
          <div class="p-2 rounded-xl bg-[var(--arc-plane)] border border-[rgba(var(--status-err-rgb,239,68,68),0.3)] text-[var(--status-err)] shrink-0">
            <AlertTriangle class="w-5 h-5" />
          </div>
          <div class="flex flex-col">
            <h3 class="text-sm font-semibold text-[var(--arc-text-primary)]">{{ activeModalTitle }}</h3>
            <p class="text-xs text-[var(--arc-text-muted)] leading-relaxed mt-1">
              {{ activeModalDescription }}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-[var(--arc-hairline)]">
          <button
            type="button"
            @click="cancelAction"
            class="px-4 py-1.5 rounded-[10px] text-xs font-mono font-medium bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-all duration-200 cursor-pointer"
          >
            ОТМЕНА
          </button>
          <button
            type="button"
            @click="confirmAction"
            class="px-4 py-1.5 rounded-[10px] text-xs font-mono font-semibold bg-[var(--status-err)] text-[var(--arc-frame)] hover:opacity-90 transition-all duration-200 cursor-pointer"
          >
            {{ activeModalConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { AlertTriangle } from 'lucide-vue-next';

export interface DangerAction {
  id: string;
  title: string;
  description: string;
  confirmButtonText?: string;
  onConfirm: () => void;
}

const props = defineProps<{
  id?: string;
  title?: string;
  description?: string;
  warningText?: string;
  confirmButtonText?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
}>();

const modalVisible = ref(false);
const pendingAction = ref<DangerAction | null>(null);

const activeModalTitle = computed(() => {
  return pendingAction.value?.title || props.title || 'Подтверждение действия';
});

const activeModalDescription = computed(() => {
  return pendingAction.value?.description || props.warningText || props.description || 'Вы уверены, что хотите выполнить это действие?';
});

const activeModalConfirmText = computed(() => {
  return pendingAction.value?.confirmButtonText || props.confirmButtonText || 'ПОДТВЕРДИТЬ';
});

function triggerDefaultAction() {
  modalVisible.value = true;
}

function requestConfirmation(action: DangerAction) {
  pendingAction.value = action;
  modalVisible.value = true;
}

function cancelAction() {
  modalVisible.value = false;
  pendingAction.value = null;
}

function confirmAction() {
  if (pendingAction.value) {
    pendingAction.value.onConfirm();
  } else {
    emit('confirm');
  }
  cancelAction();
}

defineExpose({
  requestConfirmation
});
</script>
