<template>
  <div class="flex flex-col h-full bg-[var(--arc-rail)] border-r border-[var(--arc-hairline)] w-[260px] shrink-0 font-mono transition duration-300 relative select-none">
    <!-- Top Action Bar -->
    <div class="p-2.5 border-b border-[var(--arc-divider)] flex flex-col gap-2">
      <!-- New Dialog Button (Capsule) -->
      <button
        type="button"
        @click="createNew"
        class="w-full bg-white/5 hover:bg-[var(--arc-hover)] active:scale-[0.98] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] rounded-full py-1.5 px-3 text-xs flex items-center justify-center gap-2 transition font-sans font-medium cursor-pointer shadow-sm group"
      >
        <Plus class="w-3.5 h-3.5 text-[var(--accent)] transition-colors" />
        <span>Новый диалог</span>
      </button>

      <!-- Search Input + Selection Mode + Archive + Trash Toggles -->
      <div class="flex gap-1 items-center">
        <div class="flex-1 min-w-0">
          <SessionSearch />
        </div>
        <button
          type="button"
          @click="sessionsStore.toggleSelectionMode()"
          class="shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer"
          :class="sessionsStore.isSelectionMode ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] shadow-sm' : 'bg-white/5 text-[var(--arc-text-hint)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          :aria-pressed="sessionsStore.isSelectionMode"
          :title="sessionsStore.isSelectionMode ? 'Выйти из режима выбора' : 'Выбрать несколько диалогов'"
          aria-label="Режим массового выбора"
        >
          <ListChecks class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="toggleArchiveView"
          class="shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer"
          :class="isArchiveView ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] shadow-sm' : 'bg-white/5 text-[var(--arc-text-hint)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          :aria-pressed="isArchiveView"
          :title="isArchiveView ? 'Вернуться к диалогам' : 'Открыть архив диалогов'"
          aria-label="Архив диалогов"
        >
          <Archive class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="toggleTrashView"
          class="shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer"
          :class="isTrashView ? 'bg-[var(--arc-selected)] text-[var(--status-err)] border-[var(--status-err)] shadow-sm' : 'bg-white/5 text-[var(--arc-text-hint)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          :aria-pressed="isTrashView"
          :title="isTrashView ? 'Вернуться к диалогам' : 'Открыть корзину'"
          aria-label="Корзина диалогов"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Trash Retention Info Strip -->
    <div
      v-if="isTrashView && !sessionsStore.isSelectionMode"
      class="px-3 py-1.5 border-b border-[var(--arc-divider)] bg-[var(--arc-block)] flex items-center justify-between gap-2 text-[10px] font-mono text-[var(--arc-text-hint)]"
    >
      <span class="uppercase tracking-wider text-[var(--arc-text-secondary)]">Корзина</span>
      <span class="truncate">{{ trashRetentionBadge }}</span>
    </div>

    <!-- Bulk Action Bar -->
    <SessionBulkBar
      v-if="sessionsStore.isSelectionMode"
      :view-mode="viewMode"
      :selected-count="sessionsStore.selectedCount"
      :visible-count="sessionsStore.sessions.length"
      :is-search-active="Boolean(sessionsStore.searchQuery.trim())"
      :is-operating="sessionsStore.isBulkOperating"
      :error-message="sessionsStore.bulkActionError"
      @select-all="sessionsStore.selectAllVisible()"
      @archive="executeBulkArchive(true)"
      @unarchive="executeBulkArchive(false)"
      @trash="openBulkTrashConfirm"
      @restore="executeBulkRestore"
      @permanent-delete="openBulkPermanentConfirm"
      @cancel-selection="sessionsStore.clearSelection(true)"
    />

    <!-- Sessions List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-2.5">
      <div v-if="sessionsStore.isLoading" class="flex flex-col items-center justify-center gap-2 text-xs text-[var(--arc-text-hint)] py-12 font-sans">
        <Loader2 class="w-4 h-4 animate-spin text-[var(--arc-text-hint)]" />
        <span>Загрузка диалогов...</span>
      </div>

      <template v-else>
        <div v-for="group in groupedSessions" :key="group.title" class="flex flex-col gap-0.5">
          <div class="px-2 py-0.5 text-[10px] font-mono text-[var(--arc-text-machine)] tracking-wider uppercase flex items-center gap-2">
            <span>{{ group.title }}</span>
            <div class="flex-1 h-[1px] bg-[var(--arc-divider)]"></div>
            <span class="text-[10px] font-mono text-[var(--arc-text-machine)]">{{ group.items.length }}</span>
          </div>

          <SessionListItem
            v-for="session in group.items"
            :key="session.id"
            :session="session"
            :is-active="sessionsStore.activeSessionId === session.id"
            :selection-mode="sessionsStore.isSelectionMode"
            :is-selected="selectedSet.has(session.id)"
            :is-trash-view="isTrashView"
            @select="onSelectSession"
            @toggle-select="sessionsStore.toggleSessionSelection"
            @context-menu="openContextMenu"
            @update-name="handleUpdateName"
          />
        </div>

        <!-- Empty States -->
        <div v-if="sessionsStore.sessions.length === 0" class="text-center p-4 py-10 font-sans flex flex-col items-center gap-3 my-auto">
          <div class="w-10 h-10 rounded-xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-hint)]">
            <SearchX v-if="isSearchActive" class="w-5 h-5" />
            <Trash2 v-else-if="isTrashView" class="w-5 h-5" />
            <Archive v-else-if="isArchiveView" class="w-5 h-5" />
            <MessageSquarePlus v-else class="w-5 h-5" />
          </div>

          <div class="flex flex-col gap-1">
            <h4 class="text-xs font-bold text-[var(--arc-text-primary)]">
              {{ emptyStateTitle }}
            </h4>
            <p class="text-xs text-[var(--arc-text-hint)] max-w-[210px] leading-relaxed">
              {{ emptyStateDescription }}
            </p>
          </div>

          <button
            v-if="isSearchActive"
            type="button"
            @click="resetSearch"
            class="mt-1 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] text-xs font-semibold border border-[var(--arc-hairline)] transition cursor-pointer"
          >
            Сбросить поиск
          </button>
          <button
            v-else-if="!isArchiveView && !isTrashView"
            type="button"
            @click="createNew"
            class="mt-1 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] active:scale-95 text-[var(--arc-text-primary)] text-xs font-semibold border border-[var(--arc-hairline)] flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Создать диалог</span>
          </button>
        </div>
      </template>
    </div>

    <!-- Context Menu -->
    <SessionContextMenu
      :context-menu="contextMenu"
      :is-trash-view="isTrashView"
      @toggle-pin="togglePinFromContext"
      @open-rename-modal="openRenameModal"
      @duplicate="duplicateFromContext"
      @toggle-archive="toggleArchiveFromContext"
      @export="exportFromContext"
      @prompt-delete="promptDeleteFromContext"
      @restore-from-trash="restoreSingleFromContext"
      @prompt-permanent-delete="promptPermanentDeleteFromContext"
      @close="closeContextMenu"
    />

    <!-- Confirmation & Rename Modals -->
    <SessionBulkModals
      :trash-modal-open="trashModalOpen"
      :trash-count="pendingTrashIds.length"
      :trash-target-name="pendingTargetName"
      :permanent-delete-modal-open="permanentModalOpen"
      :permanent-count="pendingPermanentIds.length"
      :permanent-target-name="pendingTargetName"
      :rename-modal-open="isRenameModalOpen"
      v-model:rename-value="renameValue"
      :is-operating="sessionsStore.isBulkOperating"
      @close-trash="trashModalOpen = false"
      @confirm-trash="executeConfirmedTrash"
      @close-permanent-delete="permanentModalOpen = false"
      @confirm-permanent-delete="executeConfirmedPermanentDelete"
      @close-rename="isRenameModalOpen = false"
      @confirm-rename="executeRename"
    />

    <!-- Pinned Footer: Exit to Core Button -->
    <div class="p-2.5 border-t border-[var(--arc-hairline)] shrink-0 bg-[var(--arc-rail)]">
      <button
        @click="uiStore.setActiveTab('core')"
        type="button"
        class="flex items-center justify-between w-full h-8 px-3 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition-all cursor-pointer text-left group outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        title="Вернуться к 3D-Ядру (Esc)"
        data-testid="chat-exit-to-core"
      >
        <div class="flex items-center gap-2">
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--arc-text-muted)] group-hover:text-[var(--accent)] transition-colors" />
          <span class="text-xs font-mono font-medium text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)] uppercase tracking-wider">
            К 3D-Ядру
          </span>
        </div>
        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-machine)]">
          Esc
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SessionSearch from './SessionSearch.vue';
import SessionListItem from './SessionListItem.vue';
import SessionContextMenu from './SessionContextMenu.vue';
import SessionBulkBar from './SessionBulkBar.vue';
import SessionBulkModals from './SessionBulkModals.vue';
import { Plus, Archive, Trash2, Loader2, MessageSquarePlus, ArrowLeft, ListChecks, SearchX } from 'lucide-vue-next';
import { useSessionsStore, type Session, type BulkSessionOpResult } from '../stores/sessions.store';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useChatStore } from '../stores/chat.store';
import { useUIStore } from '../../../stores/ui.store';

const sessionsStore = useSessionsStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const uiStore = useUIStore();

const isArchiveView = computed(() => sessionsStore.dateFilter === 'archived');
const isTrashView = computed(() => sessionsStore.dateFilter === 'trash');
const isSearchActive = computed(() => Boolean(sessionsStore.searchQuery.trim()));
const viewMode = computed<'active' | 'archived' | 'trash'>(() =>
  isTrashView.value ? 'trash' : isArchiveView.value ? 'archived' : 'active'
);
const selectedSet = computed(() => new Set(sessionsStore.selectedSessionIds));
const trashRetentionBadge = computed(() =>
  settingsStore.dialogTrashRetentionDays ? `Автоочистка: ${settingsStore.dialogTrashRetentionDays} дн.` : 'Автоочистка выкл.'
);

const emptyStateTitle = computed(() => {
  if (isSearchActive.value) return 'Ничего не найдено';
  if (isTrashView.value) return 'Корзина пуста';
  if (isArchiveView.value) return 'Архив пуст';
  return 'Начните новый диалог';
});

const emptyStateDescription = computed(() => {
  if (isSearchActive.value) return 'Попробуйте изменить запрос или сбросить фильтр поиска.';
  if (isTrashView.value) return 'Удалённые диалоги появятся здесь. Вы сможете восстановить их или удалить навсегда.';
  if (isArchiveView.value) return 'Архивированные сессии появятся здесь для долговременного хранения.';
  return 'Создайте сессию для отправки директив и задач агенту A.R.C.';
});

const toggleArchiveView = () => {
  void sessionsStore.setViewFilter(isArchiveView.value ? 'all' : 'archived');
};

const toggleTrashView = () => {
  void sessionsStore.setViewFilter(isTrashView.value ? 'all' : 'trash');
};

const resetSearch = () => {
  sessionsStore.searchQuery = '';
  void sessionsStore.loadSessions();
};

interface SessionGroup {
  title: string;
  items: Session[];
}

const groupedSessions = computed<SessionGroup[]>(() => {
  if (isTrashView.value) {
    return sessionsStore.sessions.length > 0 ? [{ title: 'Удалённые диалоги', items: sessionsStore.sessions }] : [];
  }
  if (isArchiveView.value) {
    return sessionsStore.sessions.length > 0 ? [{ title: 'Архивированные диалоги', items: sessionsStore.sessions }] : [];
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const todayItems: Session[] = [];
  const yesterdayItems: Session[] = [];
  const weekItems: Session[] = [];
  const earlierItems: Session[] = [];

  for (const session of sessionsStore.sessions) {
    const sDate = new Date(session.updated_at || session.created_at);
    if (isNaN(sDate.getTime())) {
      earlierItems.push(session);
      continue;
    }
    if (sDate.toDateString() === todayStr) todayItems.push(session);
    else if (sDate.toDateString() === yesterdayStr) yesterdayItems.push(session);
    else if (sDate.getTime() >= weekAgo) weekItems.push(session);
    else earlierItems.push(session);
  }

  const groups: SessionGroup[] = [];
  if (todayItems.length > 0) groups.push({ title: 'Сегодня', items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ title: 'Вчера', items: yesterdayItems });
  if (weekItems.length > 0) groups.push({ title: 'На этой неделе', items: weekItems });
  if (earlierItems.length > 0) groups.push({ title: 'Ранее', items: earlierItems });
  return groups;
});

const notifyBulkOutcome = (res: BulkSessionOpResult, successMsg: string, emptyFailMsg: string) => {
  if (res.success) {
    uiStore.showToast(`${successMsg} (${res.processedIds.length})`, 'success', 3500);
  } else if (res.processedIds.length > 0 && res.failed.length > 0) {
    uiStore.showToast(`Частично выполнено: ${res.processedIds.length}, ошибок: ${res.failed.length}`, 'warning', 5000);
  } else {
    uiStore.showToast(res.error || emptyFailMsg, 'error', 5000);
  }
};

const handleUpdateName = async (id: number, newName: string) => {
  try {
    await sessionsStore.updateSession(id, { name: newName });
  } catch (e: any) {
    uiStore.showToast(e?.message || 'Не удалось переименовать диалог', 'error', 4000);
  }
};

const createNew = async () => {
  try {
    if (sessionsStore.dateFilter !== 'all') {
      await sessionsStore.setViewFilter('all');
    }
    const session = await sessionsStore.createSession('Новый диалог');
    chatStore.clearMessages();
    sessionsStore.switchSession(session.id);
  } catch (e: any) {
    uiStore.showToast(e?.message || 'Не удалось создать диалог', 'error', 4000);
  }
};

const onSelectSession = (id: number) => {
  if (sessionsStore.activeSessionId !== id) {
    sessionsStore.switchSession(id);
  }
};

const contextMenu = ref({ isOpen: false, x: 0, y: 0, session: null as Session | null });

const openContextMenu = (e: MouseEvent, session: Session) => {
  const menuWidth = 215;
  const menuHeight = 250;
  let x = e.clientX;
  let y = e.clientY;
  const target = e.currentTarget as HTMLElement | null;
  if (target && target.tagName.toLowerCase() === 'button') {
    const rect = target.getBoundingClientRect();
    x = rect.left - menuWidth + 24;
    y = rect.bottom + 4;
  }
  if (x + menuWidth > window.innerWidth - 12) x = window.innerWidth - menuWidth - 12;
  if (x < 12) x = 12;
  if (y + menuHeight > window.innerHeight - 12) y = Math.max(12, window.innerHeight - menuHeight - 12);
  contextMenu.value = { isOpen: true, x, y, session };
};

const closeContextMenu = () => { contextMenu.value.isOpen = false; };

const togglePinFromContext = async () => {
  if (contextMenu.value.session) {
    try {
      const nextVal = contextMenu.value.session.is_pinned ? 0 : 1;
      await sessionsStore.updateSession(contextMenu.value.session.id, { is_pinned: nextVal });
      uiStore.showToast(nextVal ? 'Диалог закреплён' : 'Диалог откреплён', 'info', 2500);
    } catch (e: any) {
      uiStore.showToast(e?.message || 'Не удалось изменить закрепление диалога', 'error', 4000);
    }
  }
  closeContextMenu();
};

const duplicateFromContext = async () => {
  if (contextMenu.value.session) {
    try {
      const cloned = await sessionsStore.duplicateSession(contextMenu.value.session.id);
      if (cloned) uiStore.showToast('Создана копия диалога', 'success', 2500);
    } catch (e: any) {
      uiStore.showToast(e?.message || 'Не удалось дублировать диалог', 'error', 4000);
    }
  }
  closeContextMenu();
};

const toggleArchiveFromContext = async () => {
  if (contextMenu.value.session) {
    const archiveTarget = !contextMenu.value.session.is_archived;
    const res = await sessionsStore.bulkArchiveSessions([contextMenu.value.session.id], archiveTarget);
    notifyBulkOutcome(
      res,
      archiveTarget ? 'Диалог перемещён в архив' : 'Диалог возвращён из архива',
      'Не удалось изменить статус архива'
    );
  }
  closeContextMenu();
};

const exportFromContext = async () => {
  if (contextMenu.value.session) {
    const res = await sessionsStore.exportSession(contextMenu.value.session.id);
    if (res.success) uiStore.showToast(`Сессия экспортирована: ${res.filePath || 'Markdown'}`, 'success', 3500);
    else uiStore.showToast(`Ошибка экспорта: ${res.error || 'неизвестная ошибка'}`, 'error', 4500);
  }
  closeContextMenu();
};

const executeBulkArchive = async (archived: boolean) => {
  const res = await sessionsStore.bulkArchiveSessions(sessionsStore.selectedSessionIds, archived);
  notifyBulkOutcome(
    res,
    archived ? 'Диалоги перемещены в архив' : 'Диалоги возвращены из архива',
    'Не удалось выполнить операцию архивации'
  );
};

const executeBulkRestore = async () => {
  const res = await sessionsStore.restoreSessionsFromTrash(sessionsStore.selectedSessionIds);
  notifyBulkOutcome(res, 'Восстановлено в активные диалоги', 'Не удалось восстановить диалоги');
};

const restoreSingleFromContext = async () => {
  if (contextMenu.value.session) {
    const res = await sessionsStore.restoreSessionsFromTrash([contextMenu.value.session.id]);
    notifyBulkOutcome(res, 'Диалог восстановлен', 'Не удалось восстановить диалог');
  }
  closeContextMenu();
};

const trashModalOpen = ref(false);
const permanentModalOpen = ref(false);
const pendingTrashIds = ref<number[]>([]);
const pendingPermanentIds = ref<number[]>([]);
const pendingTargetName = ref<string | undefined>(undefined);

const openBulkTrashConfirm = () => {
  if (sessionsStore.selectedCount === 0) return;
  pendingTrashIds.value = [...sessionsStore.selectedSessionIds];
  pendingTargetName.value = undefined;
  trashModalOpen.value = true;
};

const promptDeleteFromContext = () => {
  if (contextMenu.value.session) {
    pendingTrashIds.value = [contextMenu.value.session.id];
    pendingTargetName.value = contextMenu.value.session.name || 'Диалог';
    trashModalOpen.value = true;
  }
  closeContextMenu();
};

const executeConfirmedTrash = async () => {
  const res = await sessionsStore.moveSessionsToTrash(pendingTrashIds.value);
  trashModalOpen.value = false;
  pendingTrashIds.value = [];
  pendingTargetName.value = undefined;
  notifyBulkOutcome(res, 'Перемещено в корзину', 'Не удалось переместить в корзину');
};

const openBulkPermanentConfirm = () => {
  if (sessionsStore.selectedCount === 0) return;
  pendingPermanentIds.value = [...sessionsStore.selectedSessionIds];
  pendingTargetName.value = undefined;
  permanentModalOpen.value = true;
};

const promptPermanentDeleteFromContext = () => {
  if (contextMenu.value.session) {
    pendingPermanentIds.value = [contextMenu.value.session.id];
    pendingTargetName.value = contextMenu.value.session.name || 'Диалог';
    permanentModalOpen.value = true;
  }
  closeContextMenu();
};

const executeConfirmedPermanentDelete = async () => {
  const res = await sessionsStore.permanentlyDeleteSessions(pendingPermanentIds.value);
  permanentModalOpen.value = false;
  pendingPermanentIds.value = [];
  pendingTargetName.value = undefined;
  notifyBulkOutcome(res, 'Окончательно удалено', 'Не удалось удалить диалоги');
};

const targetSession = ref<Session | null>(null);
const isRenameModalOpen = ref(false);
const renameValue = ref('');

const openRenameModal = () => {
  if (contextMenu.value.session) {
    targetSession.value = contextMenu.value.session;
    renameValue.value = contextMenu.value.session.name || '';
    isRenameModalOpen.value = true;
  }
  closeContextMenu();
};

const executeRename = async () => {
  if (targetSession.value && renameValue.value.trim()) {
    try {
      await sessionsStore.updateSession(targetSession.value.id, { name: renameValue.value.trim() });
      uiStore.showToast('Диалог переименован', 'success', 2500);
      isRenameModalOpen.value = false;
      targetSession.value = null;
    } catch (e: any) {
      uiStore.showToast(e?.message || 'Не удалось переименовать диалог', 'error', 4000);
    }
  }
};

onMounted(() => {
  void sessionsStore.loadSessions();
  void settingsStore.syncTrashConfigFromMain?.();
});
</script>

<style scoped>
:deep(.group) {
  padding: 0.45rem 0.6rem !important;
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--arc-hairline); border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--arc-border); }
</style>
