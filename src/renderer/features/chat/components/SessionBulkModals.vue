<template>
  <Teleport to="body">
    <!-- Confirm Move to Trash Modal -->
    <ArcModal
      :show="trashModalOpen"
      title="Перемещение в корзину"
      max-width="max-w-md"
      @close="!isOperating && $emit('closeTrash')"
    >
      <div class="flex flex-col gap-4 font-sans">
        <div class="flex items-start gap-3.5">
          <div class="p-2.5 rounded-xl bg-[var(--arc-block)] text-[var(--status-warn)] border border-[var(--arc-hairline)] shrink-0 mt-0.5">
            <Trash2 class="w-5 h-5" />
          </div>
          <div class="flex flex-col gap-1.5 text-xs text-[var(--arc-text-secondary)]">
            <p class="font-bold text-[var(--arc-text-primary)] text-sm">
              <template v-if="trashTargetName && trashCount === 1">
                Переместить «{{ trashTargetName }}» в корзину?
              </template>
              <template v-else>
                Переместить выбранные диалоги в корзину ({{ trashCount }})?
              </template>
            </p>
            <p class="text-[var(--arc-text-hint)] text-xs leading-relaxed">
              Выбранные диалоги ({{ trashCount }}) будут перемещены в корзину. Вы сможете восстановить их или удалить окончательно позже.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-[var(--arc-divider)]">
          <button
            type="button"
            :disabled="isOperating"
            @click="$emit('closeTrash')"
            class="px-4 py-2 rounded-full text-xs font-medium text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition cursor-pointer disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            :disabled="isOperating"
            @click="$emit('confirmTrash')"
            class="px-4 py-2 rounded-full text-xs font-bold text-[var(--status-warn)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--status-warn)] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Loader2 v-if="isOperating" class="w-3.5 h-3.5 animate-spin" />
            <Trash2 v-else class="w-3.5 h-3.5" />
            <span>В корзину ({{ trashCount }})</span>
          </button>
        </div>
      </div>
    </ArcModal>

    <!-- Confirm Permanent Deletion from Trash Modal -->
    <ArcModal
      :show="permanentDeleteModalOpen"
      title="Окончательное удаление"
      max-width="max-w-md"
      @close="!isOperating && $emit('closePermanentDelete')"
    >
      <div class="flex flex-col gap-4 font-sans">
        <div class="flex items-start gap-3.5">
          <div class="p-2.5 rounded-xl bg-[var(--arc-block)] text-[var(--status-err)] border border-[var(--arc-hairline)] shrink-0 mt-0.5">
            <AlertTriangle class="w-5 h-5" />
          </div>
          <div class="flex flex-col gap-1.5 text-xs text-[var(--arc-text-secondary)]">
            <p class="font-bold text-[var(--arc-text-primary)] text-sm">
              <template v-if="permanentTargetName && permanentCount === 1">
                Удалить «{{ permanentTargetName }}» навсегда?
              </template>
              <template v-else>
                Удалить навсегда выбранные записи ({{ permanentCount }})?
              </template>
            </p>
            <p class="text-[var(--arc-text-hint)] text-xs leading-relaxed">
              Будет безвозвратно удалено записей: <span class="font-mono font-semibold text-[var(--status-err)]">{{ permanentCount }}</span>. История сообщений и данные этих диалогов восстановлению не подлежат.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-[var(--arc-divider)]">
          <button
            type="button"
            :disabled="isOperating"
            @click="$emit('closePermanentDelete')"
            class="px-4 py-2 rounded-full text-xs font-medium text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition cursor-pointer disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            :disabled="isOperating"
            @click="$emit('confirmPermanentDelete')"
            class="px-4 py-2 rounded-full text-xs font-bold text-[var(--status-err)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Loader2 v-if="isOperating" class="w-3.5 h-3.5 animate-spin" />
            <Trash2 v-else class="w-3.5 h-3.5" />
            <span>Удалить навсегда ({{ permanentCount }})</span>
          </button>
        </div>
      </div>
    </ArcModal>

    <!-- Rename Modal -->
    <ArcModal
      :show="renameModalOpen"
      title="Переименовать диалог"
      max-width="max-w-md"
      @close="$emit('closeRename')"
    >
      <div class="flex flex-col gap-4 font-sans">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-[var(--arc-text-hint)] font-medium font-sans">Новое название</label>
          <input
            :value="renameValue"
            @input="$emit('update:renameValue', ($event.target as HTMLInputElement).value)"
            placeholder="Введите название диалога..."
            @keyup.enter="$emit('confirmRename')"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-xl px-3.5 py-2 text-xs text-[var(--arc-text-primary)] placeholder-[var(--arc-text-disabled)] focus:outline-none focus:border-[var(--accent)] transition"
            :style="{ boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.65)' }"
            autofocus
          />
        </div>

        <div class="flex justify-end gap-2.5 mt-2 pt-2 border-t border-[var(--arc-divider)]">
          <button
            type="button"
            @click="$emit('closeRename')"
            class="px-4 py-2 rounded-full text-xs font-medium text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            @click="$emit('confirmRename')"
            class="px-4 py-2 rounded-full text-xs font-bold text-[var(--accent-ink,#ffffff)] bg-[var(--accent)] hover:bg-[var(--accent)]/90 border border-[var(--accent)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 class="w-3.5 h-3.5" />
            <span>Сохранить</span>
          </button>
        </div>
      </div>
    </ArcModal>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle, Edit3, Loader2, Trash2 } from 'lucide-vue-next';
import ArcModal from '../../../components/ui/ArcModal.vue';

defineProps<{
  trashModalOpen: boolean;
  trashCount: number;
  trashTargetName?: string;
  permanentDeleteModalOpen: boolean;
  permanentCount: number;
  permanentTargetName?: string;
  renameModalOpen: boolean;
  renameValue: string;
  isOperating: boolean;
}>();

defineEmits<{
  (e: 'closeTrash'): void;
  (e: 'confirmTrash'): void;
  (e: 'closePermanentDelete'): void;
  (e: 'confirmPermanentDelete'): void;
  (e: 'closeRename'): void;
  (e: 'confirmRename'): void;
  (e: 'update:renameValue', value: string): void;
}>();
</script>
