<template>
  <Teleport to="body">
    <!-- Context Menu Backdrop -->
    <div 
      v-if="contextMenu.isOpen" 
      class="fixed inset-0 z-[99999] arc-glass-veil"
      @click="close"
      @contextmenu.prevent="close"
    >
      <!-- Context Menu Content -->
      <div 
        class="fixed z-[100000] bg-[var(--arc-popover)] arc-glass-pop border border-[var(--arc-hairline)] rounded-xl shadow-[var(--arc-glass-edge)] py-1.5 min-w-[200px] text-xs font-sans animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
        <div class="px-3 py-2 text-xs text-[var(--arc-text-hint)] border-b border-[var(--arc-divider)] flex items-center justify-between gap-2">
          <span class="truncate font-sans font-bold text-[var(--arc-text-primary)] text-xs">{{ contextMenu.session?.name || 'Диалог' }}</span>
          <span class="text-[10px] text-[var(--arc-text-machine)] shrink-0 font-mono">{{ contextMenu.session?.message_count || 0 }} сообщ.</span>
        </div>

        <div class="p-1 flex flex-col gap-0.5">
          <button 
            @click="togglePinFromContext" 
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] flex items-center gap-2.5 transition text-xs cursor-pointer"
          >
            <PinOff v-if="contextMenu.session?.is_pinned" class="w-3.5 h-3.5 text-[var(--status-warn)]" />
            <Pin v-else class="w-3.5 h-3.5 text-[var(--status-warn)]" />
            <span>{{ contextMenu.session?.is_pinned ? 'Открепить диалог' : 'Закрепить диалог' }}</span>
          </button>

          <button 
            @click="openRenameModal" 
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] flex items-center gap-2.5 transition text-xs cursor-pointer"
          >
            <Edit3 class="w-3.5 h-3.5 text-[var(--arc-text-hint)]" />
            <span>Переименовать</span>
          </button>

          <button 
            @click="duplicateFromContext" 
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] flex items-center gap-2.5 transition text-xs cursor-pointer"
          >
            <Copy class="w-3.5 h-3.5 text-[var(--status-info)]" />
            <span>Создать копию</span>
          </button>

          <button 
            @click="toggleArchiveFromContext" 
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] flex items-center gap-2.5 transition text-xs cursor-pointer"
          >
            <ArchiveRestore v-if="contextMenu.session?.is_archived" class="w-3.5 h-3.5 text-[var(--arc-text-secondary)]" />
            <Archive v-else class="w-3.5 h-3.5 text-[var(--arc-text-secondary)]" />
            <span>{{ contextMenu.session?.is_archived ? 'Разархивировать' : 'Переместить в архив' }}</span>
          </button>

          <button 
            @click="exportFromContext" 
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] flex items-center gap-2.5 transition text-xs cursor-pointer"
          >
            <Download class="w-3.5 h-3.5 text-[var(--arc-text-secondary)]" />
            <span>Экспорт в Markdown</span>
          </button>

          <div class="h-px bg-[var(--arc-divider)] my-1"></div>

          <button 
            @click="promptDeleteFromContext" 
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--arc-hover)] text-[var(--status-err)] flex items-center gap-2.5 transition text-xs cursor-pointer"
          >
            <Trash2 class="w-3.5 h-3.5 text-[var(--status-err)]" />
            <span>Удалить диалог</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { Pin, PinOff, Edit3, Copy, Archive, ArchiveRestore, Download, Trash2 } from 'lucide-vue-next';

defineProps<{
  contextMenu: { isOpen: boolean; x: number; y: number; session: any };
}>();

const emit = defineEmits<{
  (e: 'togglePin'): void;
  (e: 'openRenameModal'): void;
  (e: 'duplicate'): void;
  (e: 'toggleArchive'): void;
  (e: 'export'): void;
  (e: 'promptDelete'): void;
  (e: 'close'): void;
}>();

const close = () => emit('close');
const togglePinFromContext = () => emit('togglePin');
const openRenameModal = () => emit('openRenameModal');
const duplicateFromContext = () => emit('duplicate');
const toggleArchiveFromContext = () => emit('toggleArchive');
const exportFromContext = () => emit('export');
const promptDeleteFromContext = () => emit('promptDelete');
</script>
