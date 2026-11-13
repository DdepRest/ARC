<template>
  <div class="flex flex-col h-full bg-[var(--arc-rail)] border-r border-[var(--arc-hairline)] w-[260px] shrink-0 font-mono transition duration-300 relative select-none">
    <!-- Top Action Bar -->
    <div class="p-2.5 border-b border-[var(--arc-divider)] flex flex-col gap-2">
      <!-- New Dialog Button (Capsule) -->
      <button 
        @click="createNew"
        class="w-full bg-white/5 hover:bg-[var(--arc-hover)] active:scale-[0.98] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] rounded-full py-1.5 px-3 text-xs flex items-center justify-center gap-2 transition font-sans font-medium cursor-pointer shadow-sm group"
      >
        <Plus class="w-3.5 h-3.5 text-[var(--accent)] transition-colors" />
        <span>Новый диалог</span>
      </button>
      
      <!-- Search Input & Archive Toggle -->
      <div class="flex gap-1.5 items-center">
        <div class="flex-1 min-w-0">
          <SessionSearch />
        </div>
        <button 
          @click="toggleArchiveView"
          class="shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer"
          :class="isArchiveView ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] shadow-sm' : 'bg-white/5 text-[var(--arc-text-hint)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          :title="isArchiveView ? 'Вернуться к диалогам' : 'Открыть архив диалогов'"
        >
          <Archive class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Sessions List with Automatic Date Grouping -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-2.5">
      <div v-if="sessionsStore.isLoading" class="flex flex-col items-center justify-center gap-2 text-xs text-[var(--arc-text-hint)] py-12 font-sans">
        <Loader2 class="w-4 h-4 animate-spin text-[var(--arc-text-hint)]" />
        <span>Загрузка диалогов...</span>
      </div>

      <template v-else>
        <!-- Grouped Sessions Render -->
        <div v-for="group in groupedSessions" :key="group.title" class="flex flex-col gap-0.5">
          <!-- Date Section Divider Header -->
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
            @select="onSelectSession"
            @context-menu="openContextMenu"
            @update-name="handleUpdateName"
          />
        </div>
        
        <!-- Empty State (Compliant with UX specification) -->
        <div v-if="sessionsStore.sessions.length === 0" class="text-center p-4 py-10 font-sans flex flex-col items-center gap-3 my-auto">
          <div class="w-10 h-10 rounded-xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-hint)]">
            <Archive v-if="isArchiveView" class="w-5 h-5" />
            <MessageSquarePlus v-else class="w-5 h-5" />
          </div>

          <div class="flex flex-col gap-1">
            <h4 class="text-xs font-bold text-[var(--arc-text-primary)]">
              {{ isArchiveView ? 'Архив пуст' : 'Начните новый диалог' }}
            </h4>
            <p class="text-xs text-[var(--arc-text-hint)] max-w-[200px] leading-relaxed">
              {{ isArchiveView ? 'Архивированные сессии появятся здесь для долговременного хранения.' : 'Создайте сессию для отправки директив и задач агенту A.R.C.' }}
            </p>
          </div>

          <button 
            v-if="!isArchiveView"
            @click="createNew"
            class="mt-1 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] active:scale-95 text-[var(--arc-text-primary)] text-xs font-semibold border border-[var(--arc-hairline)] flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Создать диалог</span>
          </button>
        </div>
      </template>
    </div>

    <!-- Context Menu Portal -->
    <SessionContextMenu
      :context-menu="contextMenu"
      @toggle-pin="togglePinFromContext"
      @open-rename-modal="openRenameModal"
      @duplicate="duplicateFromContext"
      @toggle-archive="toggleArchiveFromContext"
      @export="exportFromContext"
      @prompt-delete="promptDeleteFromContext"
      @close="closeContextMenu"
    />

    <!-- Modals -->
    <Teleport to="body">
      <!-- Delete Confirmation Modal -->
      <ArcModal 
        :show="isDeleteModalOpen"
        title="Удаление диалога"
        max-width="max-w-md"
        @close="isDeleteModalOpen = false"
      >
        <div class="flex flex-col gap-4 font-sans">
          <div class="flex items-start gap-3.5">
            <div class="p-2.5 rounded-xl bg-[var(--arc-block)] text-[var(--status-err)] border border-[var(--arc-hairline)] shrink-0 mt-0.5">
              <AlertTriangle class="w-5 h-5" />
            </div>
            <div class="flex flex-col gap-1.5 text-xs text-[var(--arc-text-secondary)]">
              <p class="font-bold text-[var(--arc-text-primary)] text-sm">
                Удалить «{{ targetSession?.name || 'Диалог' }}»?
              </p>
              <p class="text-[var(--arc-text-hint)] text-xs leading-relaxed">
                Это действие безвозвратно удалит историю сообщений и контекст текущего диалога.
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between mt-3 pt-3 border-t border-[var(--arc-divider)]">
            <div class="flex items-center gap-2.5 ml-auto">
              <button 
                type="button" 
                @click="isDeleteModalOpen = false"
                class="px-4 py-2 rounded-full text-xs font-medium text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition cursor-pointer"
              >
                Отмена
              </button>
              <button 
                type="button" 
                @click="executeDelete"
                class="px-4 py-2 rounded-full text-xs font-bold text-[var(--status-err)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </div>
      </ArcModal>

      <!-- Rename Modal -->
      <ArcModal 
        :show="isRenameModalOpen"
        title="Переименовать диалог"
        max-width="max-w-md"
        @close="isRenameModalOpen = false"
      >
        <div class="flex flex-col gap-4 font-sans">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-[var(--arc-text-hint)] font-medium font-sans">Новое название</label>
            <input 
              v-model="renameValue" 
              placeholder="Введите название диалога..." 
              @keyup.enter="executeRename" 
              class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-xl px-3.5 py-2 text-xs text-[var(--arc-text-primary)] placeholder-[var(--arc-text-disabled)] focus:outline-none focus:border-[var(--accent)] transition"
              :style="{ boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.65)' }"
              autofocus
            />
          </div>

          <div class="flex justify-end gap-2.5 mt-2 pt-2 border-t border-[var(--arc-divider)]">
            <button 
              type="button" 
              @click="isRenameModalOpen = false"
              class="px-4 py-2 rounded-full text-xs font-medium text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition cursor-pointer"
            >
              Отмена
            </button>
            <button 
              type="button" 
              @click="executeRename"
              class="px-4 py-2 rounded-full text-xs font-bold text-[var(--accent-ink,#ffffff)] bg-[var(--accent)] hover:bg-[var(--accent)]/90 border border-[var(--accent)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 class="w-3.5 h-3.5" />
              <span>Сохранить</span>
            </button>
          </div>
        </div>
      </ArcModal>
    </Teleport>

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
import { 
  Plus, 
  Archive, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  Loader2, 
  MessageSquarePlus,
  ArrowLeft 
} from 'lucide-vue-next';
import { useSessionsStore, type Session } from '../stores/sessions.store';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useChatStore } from '../stores/chat.store';
import { useUIStore } from '../../../stores/ui.store';
import ArcModal from '../../../components/ui/ArcModal.vue';

const sessionsStore = useSessionsStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const uiStore = useUIStore();

const isArchiveView = computed(() => sessionsStore.dateFilter === 'archived');

const toggleArchiveView = () => {
  sessionsStore.dateFilter = isArchiveView.value ? 'all' : 'archived';
  sessionsStore.loadSessions();
};

interface SessionGroup {
  title: string;
  items: Session[];
}

const groupedSessions = computed<SessionGroup[]>(() => {
  if (isArchiveView.value) {
    return sessionsStore.sessions.length > 0
      ? [{ title: 'Архивированные диалоги', items: sessionsStore.sessions }]
      : [];
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

    if (sDate.toDateString() === todayStr) {
      todayItems.push(session);
    } else if (sDate.toDateString() === yesterdayStr) {
      yesterdayItems.push(session);
    } else if (sDate.getTime() >= weekAgo) {
      weekItems.push(session);
    } else {
      earlierItems.push(session);
    }
  }

  const groups: SessionGroup[] = [];
  if (todayItems.length > 0) groups.push({ title: 'Сегодня', items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ title: 'Вчера', items: yesterdayItems });
  if (weekItems.length > 0) groups.push({ title: 'На этой неделе', items: weekItems });
  if (earlierItems.length > 0) groups.push({ title: 'Ранее', items: earlierItems });

  return groups;
});

const handleUpdateName = async (id: number, newName: string) => {
  await sessionsStore.updateSession(id, { name: newName });
};

const createNew = async () => {
  const session = await sessionsStore.createSession('Новый диалог');
  chatStore.clearMessages();
  sessionsStore.switchSession(session.id);
};

const onSelectSession = (id: number) => {
  if (sessionsStore.activeSessionId !== id) {
    sessionsStore.switchSession(id);
  }
};

const contextMenu = ref({
  isOpen: false,
  x: 0,
  y: 0,
  session: null as Session | null
});

const openContextMenu = (e: MouseEvent, session: Session) => {
  const menuWidth = 210;
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

const closeContextMenu = () => {
  contextMenu.value.isOpen = false;
};

const togglePinFromContext = async () => {
  if (contextMenu.value.session) {
    const nextVal = contextMenu.value.session.is_pinned ? 0 : 1;
    await sessionsStore.updateSession(contextMenu.value.session.id, { is_pinned: nextVal });
    settingsStore.triggerSyncToast(nextVal ? 'Диалог закреплен' : 'Диалог откреплен');
  }
  closeContextMenu();
};

const duplicateFromContext = async () => {
  if (contextMenu.value.session) {
    const cloned = await sessionsStore.duplicateSession(contextMenu.value.session.id);
    if (cloned) settingsStore.triggerSyncToast('Создана копия диалога');
  }
  closeContextMenu();
};

const toggleArchiveFromContext = async () => {
  if (contextMenu.value.session) {
    const nextVal = contextMenu.value.session.is_archived ? 0 : 1;
    await sessionsStore.updateSession(contextMenu.value.session.id, { is_archived: nextVal });
    settingsStore.triggerSyncToast(nextVal ? 'Диалог перемещен в архив' : 'Диалог разархивирован');
  }
  closeContextMenu();
};

const exportFromContext = async () => {
  if (contextMenu.value.session) {
    const res = await sessionsStore.exportSession(contextMenu.value.session.id);
    if (res.success) {
      settingsStore.triggerSyncToast(`Сессия экспортирована: ${res.filePath || 'Markdown'}`);
    } else {
      settingsStore.triggerSyncToast(`Ошибка экспорта: ${res.error}`, undefined, true);
    }
  }
  closeContextMenu();
};

const targetSession = ref<Session | null>(null);
const isDeleteModalOpen = ref(false);
const isRenameModalOpen = ref(false);
const renameValue = ref('');

const promptDeleteFromContext = () => {
  if (contextMenu.value.session) {
    targetSession.value = contextMenu.value.session;
    isDeleteModalOpen.value = true;
  }
  closeContextMenu();
};

const executeDelete = async () => {
  if (targetSession.value) {
    await sessionsStore.deleteSession(targetSession.value.id);
    settingsStore.triggerSyncToast('Диалог удален');
    isDeleteModalOpen.value = false;
    targetSession.value = null;
  }
};

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
    await sessionsStore.updateSession(targetSession.value.id, { name: renameValue.value.trim() });
    settingsStore.triggerSyncToast('Диалог переименован');
    isRenameModalOpen.value = false;
    targetSession.value = null;
  }
};

onMounted(() => {
  sessionsStore.loadSessions();
});
</script>

<style scoped>
:deep(.group) {
  padding: 0.45rem 0.6rem !important;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--arc-hairline);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--arc-border);
}
</style>
