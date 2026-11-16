<template>
  <div
    class="px-2.5 py-2 border-b border-[var(--arc-divider)] bg-[var(--arc-block)] flex flex-col gap-2 font-sans"
    role="region"
    aria-label="Массовые действия с диалогами"
  >
    <div class="flex items-center justify-between gap-2 text-xs">
      <div class="flex flex-col min-w-0">
        <span class="font-semibold text-[var(--arc-text-primary)] truncate">
          Выбрано: <span class="font-mono text-[var(--accent)]">{{ selectedCount }}</span>
        </span>
        <span v-if="isSearchActive" class="text-[10px] font-mono text-[var(--arc-text-hint)] truncate">
          из {{ visibleCount }} найденных
        </span>
      </div>

      <button
        type="button"
        @click="$emit('selectAll')"
        :disabled="isOperating || visibleCount === 0"
        class="px-2 py-1 rounded-md text-[11px] font-mono bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        Выбрать все
      </button>
    </div>

    <div v-if="isOperating" class="flex items-center gap-1.5 text-[11px] font-mono text-[var(--arc-text-hint)]">
      <Loader2 class="w-3 h-3 animate-spin text-[var(--accent)] shrink-0" />
      <span>Выполняется операция...</span>
    </div>

    <div v-if="errorMessage" class="px-2 py-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--status-err)] text-[11px] text-[var(--status-err)] leading-snug">
      {{ errorMessage }}
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <template v-if="viewMode === 'trash'">
        <button
          type="button"
          @click="$emit('restore')"
          :disabled="isOperating || selectedCount === 0"
          class="px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--status-ok)] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">Восстановить</span>
        </button>
        <button
          type="button"
          @click="$emit('permanentDelete')"
          :disabled="isOperating || selectedCount === 0"
          class="px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] text-[var(--status-err)] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">Удалить</span>
        </button>
      </template>

      <template v-else-if="viewMode === 'archived'">
        <button
          type="button"
          @click="$emit('unarchive')"
          :disabled="isOperating || selectedCount === 0"
          class="col-span-2 px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArchiveRestore class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">Вернуть из архива</span>
        </button>
      </template>

      <template v-else>
        <button
          type="button"
          @click="$emit('archive')"
          :disabled="isOperating || selectedCount === 0"
          class="px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Archive class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">В архив</span>
        </button>
        <button
          type="button"
          @click="$emit('trash')"
          :disabled="isOperating || selectedCount === 0"
          class="px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] text-[var(--status-err)] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">Удалить</span>
        </button>
      </template>

      <button
        type="button"
        @click="$emit('cancelSelection')"
        :disabled="isOperating"
        class="col-span-2 px-2 py-1 rounded-lg text-[11px] font-medium bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Отмена выбора
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Archive, ArchiveRestore, Loader2, RotateCcw, Trash2 } from 'lucide-vue-next';

defineProps<{
  viewMode: 'active' | 'archived' | 'trash';
  selectedCount: number;
  visibleCount: number;
  isSearchActive: boolean;
  isOperating: boolean;
  errorMessage?: string | null;
}>();

defineEmits<{
  (e: 'selectAll'): void;
  (e: 'archive'): void;
  (e: 'unarchive'): void;
  (e: 'trash'): void;
  (e: 'restore'): void;
  (e: 'permanentDelete'): void;
  (e: 'cancelSelection'): void;
}>();
</script>
