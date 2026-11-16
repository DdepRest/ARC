import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  type Session,
  type BulkSessionOpResult,
  MESSAGES_KEY_PREFIX,
  getStoredSessions,
  saveStoredSessions,
  removeStoredMessages,
  isActiveSession,
  isTrashedSession,
  isArchivedSession,
  sortSessionList,
  filterSessionsByDate,
  normalizeUniqueIds,
  fallbackBulkArchive,
  fallbackMoveToTrash,
  fallbackRestoreFromTrash,
  fallbackPermanentDelete,
  mapSearchResultsToSessions,
  searchStoredSessions,
  exportSessionMarkdownFallback,
  createFallbackSession,
  copyStoredMessages
} from '../utils/sessions-helpers';

export type { Session, BulkSessionOpResult };

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([]);
  const activeSessionId = ref<number | null>(null);
  const isLoading = ref(false);
  const searchQuery = ref('');
  const dateFilter = ref('all'); // all, today, yesterday, week, archived, trash

  const isSelectionMode = ref(false);
  const selectedSessionIds = ref<number[]>([]);
  const isBulkOperating = ref(false);
  const bulkActionError = ref<string | null>(null);

  const selectedCount = computed(() => selectedSessionIds.value.length);

  function pruneSelectionToVisible() {
    if (selectedSessionIds.value.length === 0) return;
    const visibleSet = new Set(sessions.value.map((s) => s.id));
    selectedSessionIds.value = selectedSessionIds.value.filter((id) => visibleSet.has(id));
  }

  function clearSelection(exitMode = false) {
    selectedSessionIds.value = [];
    bulkActionError.value = null;
    if (exitMode) isSelectionMode.value = false;
  }

  function toggleSelectionMode(force?: boolean) {
    const next = typeof force === 'boolean' ? force : !isSelectionMode.value;
    isSelectionMode.value = next;
    bulkActionError.value = null;
    if (!next) selectedSessionIds.value = [];
  }

  function toggleSessionSelection(id: number) {
    if (isBulkOperating.value) return;
    const idx = selectedSessionIds.value.indexOf(id);
    selectedSessionIds.value = idx === -1
      ? [...selectedSessionIds.value, id]
      : selectedSessionIds.value.filter((item) => item !== id);
  }

  function selectAllVisible() {
    if (isBulkOperating.value) return;
    if (!isSelectionMode.value) isSelectionMode.value = true;
    const eligible = sessions.value.filter((s) => {
      if (dateFilter.value === 'trash') return isTrashedSession(s);
      if (dateFilter.value === 'archived') return isArchivedSession(s);
      return isActiveSession(s);
    });
    selectedSessionIds.value = eligible.map((s) => s.id);
  }

  async function refreshCurrentView() {
    if (searchQuery.value.trim()) await searchSessions(searchQuery.value);
    else await loadSessions();
  }

  async function setViewFilter(nextFilter: string) {
    dateFilter.value = nextFilter;
    clearSelection(true);
    await refreshCurrentView();
  }

  async function fetchActiveList(): Promise<Session[]> {
    const api = (window as any).api;
    if (api?.dialogListSessions) {
      const list = await api.dialogListSessions(100, 0, { archived: false, date: 'all' });
      if (Array.isArray(list)) return sortSessionList(list.filter((s: Session) => isActiveSession(s)), false);
    }
    return sortSessionList(filterSessionsByDate(getStoredSessions(), 'all'), false);
  }

  async function resolveActiveSessionAfterRemoval(removedIds: number[]) {
    if (activeSessionId.value === null || !removedIds.includes(activeSessionId.value)) return;
    try {
      const activeList = await fetchActiveList();
      const remaining = activeList.filter((s) => !removedIds.includes(s.id));
      activeSessionId.value = remaining.length > 0 ? remaining[0].id : null;
    } catch {
      const remaining = sessions.value.filter((s) => isActiveSession(s) && !removedIds.includes(s.id));
      activeSessionId.value = remaining.length > 0 ? remaining[0].id : null;
    }
  }

  function applyActiveSelectionAfterLoad(isTrash: boolean) {
    if (isTrash) return;
    if (sessions.value.length > 0) {
      if (!activeSessionId.value || !sessions.value.some((s) => s.id === activeSessionId.value)) {
        switchSession(sessions.value[0].id);
      }
    } else {
      activeSessionId.value = null;
    }
  }

  async function loadSessions() {
    isLoading.value = true;
    try {
      const api = (window as any).api;
      const isTrash = dateFilter.value === 'trash';
      const isArchived = dateFilter.value === 'archived';

      if (api?.dialogListSessions) {
        const list = await api.dialogListSessions(100, 0, { archived: isArchived, trash: isTrash, date: dateFilter.value });
        if (Array.isArray(list)) {
          const viewFiltered = list.filter((s: Session) =>
            isTrash ? isTrashedSession(s) : isArchived ? isArchivedSession(s) : isActiveSession(s)
          );
          sessions.value = sortSessionList(viewFiltered, isTrash);
          pruneSelectionToVisible();
          applyActiveSelectionAfterLoad(isTrash);
          return;
        }
      }

      const filtered = filterSessionsByDate(getStoredSessions(), dateFilter.value);
      sessions.value = sortSessionList(filtered, isTrash);
      pruneSelectionToVisible();
      applyActiveSelectionAfterLoad(isTrash);
    } catch (e) {
      console.error('Failed to load sessions', e);
    } finally {
      isLoading.value = false;
    }
  }

  async function createSession(name?: string): Promise<Session> {
    isLoading.value = true;
    const sessionName = name || 'Новый диалог';
    try {
      let session: Session | null = null;
      if ((window as any).api?.dialogCreateSession) {
        session = await (window as any).api.dialogCreateSession(sessionName);
      }
      if (!session || !session.id) {
        session = createFallbackSession(sessionName);
      }
      if (dateFilter.value === 'archived' || dateFilter.value === 'trash') dateFilter.value = 'all';
      clearSelection(true);
      activeSessionId.value = session.id;
      await loadSessions();
      return session;
    } catch (e) {
      console.error('Error in createSession:', e);
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  function switchSession(id: number) {
    activeSessionId.value = id;
  }

  function sortSessions() {
    sessions.value = sortSessionList(sessions.value, dateFilter.value === 'trash');
  }

  async function deleteSession(id: number) {
    isLoading.value = true;
    try {
      if ((window as any).api?.dialogDeleteSession) await (window as any).api.dialogDeleteSession(id);
    } catch (e) {
      console.error('Failed to delete session via IPC', e);
    }
    saveStoredSessions(getStoredSessions().filter((s) => s.id !== id));
    removeStoredMessages(id);
    await loadSessions();
    if (activeSessionId.value === id || !activeSessionId.value || !sessions.value.some((s) => s.id === activeSessionId.value)) {
      if (sessions.value.length > 0) switchSession(sessions.value[0].id);
      else await createSession('Новый диалог');
    }
    isLoading.value = false;
  }

  async function updateSession(id: number, data: Partial<Session>) {
    const mergedData = { ...data, updated_at: new Date().toISOString() };
    try {
      if ((window as any).api?.dialogUpdateSession) await (window as any).api.dialogUpdateSession(id, mergedData);
    } catch (e) {
      console.error('Failed to update session via IPC', e);
      throw e;
    }
    const allStored = getStoredSessions();
    const storedIndex = allStored.findIndex((s) => s.id === id);
    if (storedIndex !== -1) {
      Object.assign(allStored[storedIndex], mergedData);
      saveStoredSessions(allStored);
    }
    await refreshCurrentView();
  }

  async function executeBulkAction(
    ids: number[],
    opts: {
      defaultError: string;
      withDeletedCount?: boolean;
      resolveActiveOnProcessed: boolean;
      run: (uniqueIds: number[]) => Promise<BulkSessionOpResult>;
    }
  ): Promise<BulkSessionOpResult> {
    if (isBulkOperating.value) {
      return {
        success: false, totalRequested: ids.length, processedIds: [], skippedIds: [], failed: [],
        ...(opts.withDeletedCount ? { deletedCount: 0 } : {}), error: 'Операция уже выполняется'
      };
    }
    const uniqueIds = normalizeUniqueIds(ids);
    if (uniqueIds.length === 0) {
      return {
        success: false, totalRequested: 0, processedIds: [], skippedIds: [], failed: [],
        ...(opts.withDeletedCount ? { deletedCount: 0 } : {}), error: 'Не выбраны диалоги'
      };
    }
    isBulkOperating.value = true;
    bulkActionError.value = null;
    try {
      const res = await opts.run(uniqueIds);
      if (!res || !res.success) bulkActionError.value = res?.error || opts.defaultError;
      if (res?.processedIds?.length) {
        if (opts.resolveActiveOnProcessed) await resolveActiveSessionAfterRemoval(res.processedIds);
        await refreshCurrentView();
        if (res.success) clearSelection(true);
      }
      return res;
    } catch (e: any) {
      const msg = e?.message || opts.defaultError;
      bulkActionError.value = msg;
      return {
        success: false, totalRequested: uniqueIds.length, processedIds: [], skippedIds: [],
        failed: uniqueIds.map((id) => ({ id, error: msg })),
        ...(opts.withDeletedCount ? { deletedCount: 0 } : {}), error: msg
      };
    } finally {
      isBulkOperating.value = false;
    }
  }

  function bulkArchiveSessions(ids: number[], archived: boolean): Promise<BulkSessionOpResult> {
    return executeBulkAction(ids, {
      defaultError: 'Не удалось обновить архив',
      resolveActiveOnProcessed: archived,
      run: (u) => (window as any).api?.dialogBulkArchive
        ? (window as any).api.dialogBulkArchive(u, archived)
        : Promise.resolve(fallbackBulkArchive(u, archived))
    });
  }

  function moveSessionsToTrash(ids: number[]): Promise<BulkSessionOpResult> {
    return executeBulkAction(ids, {
      defaultError: 'Не удалось переместить диалоги в корзину',
      resolveActiveOnProcessed: true,
      run: (u) => (window as any).api?.dialogMoveToTrash
        ? (window as any).api.dialogMoveToTrash(u)
        : Promise.resolve(fallbackMoveToTrash(u))
    });
  }

  function restoreSessionsFromTrash(ids: number[]): Promise<BulkSessionOpResult> {
    return executeBulkAction(ids, {
      defaultError: 'Не удалось восстановить диалоги',
      resolveActiveOnProcessed: false,
      run: (u) => (window as any).api?.dialogRestoreFromTrash
        ? (window as any).api.dialogRestoreFromTrash(u)
        : Promise.resolve(fallbackRestoreFromTrash(u))
    });
  }

  function permanentlyDeleteSessions(ids: number[]): Promise<BulkSessionOpResult> {
    return executeBulkAction(ids, {
      defaultError: 'Не удалось окончательно удалить диалоги',
      withDeletedCount: true,
      resolveActiveOnProcessed: true,
      run: (u) => (window as any).api?.dialogPermanentDelete
        ? (window as any).api.dialogPermanentDelete(u)
        : Promise.resolve(fallbackPermanentDelete(u))
    });
  }

  async function searchSessions(query: string) {
    if (!query.trim()) {
      await loadSessions();
      return;
    }
    isLoading.value = true;
    const isTrash = dateFilter.value === 'trash';
    const isArchived = dateFilter.value === 'archived';
    try {
      const api = (window as any).api;
      if (api?.dialogSearch) {
        const results = await api.dialogSearch(query, 20, { archived: isArchived, trash: isTrash });
        sessions.value = mapSearchResultsToSessions(results, dateFilter.value);
        pruneSelectionToVisible();
        return;
      }
      sessions.value = searchStoredSessions(query, dateFilter.value);
      pruneSelectionToVisible();
    } catch (e) {
      console.error('Failed to search', e);
    } finally {
      isLoading.value = false;
    }
  }

  async function exportSession(id: number): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      if ((window as any).api?.dialogExportSession) return await (window as any).api.dialogExportSession(id);
      return exportSessionMarkdownFallback(id, sessions.value.find((s) => s.id === id));
    } catch (e: any) {
      console.error('Failed to export session', e);
      return { success: false, error: e.message };
    }
  }

  async function duplicateSession(id: number): Promise<Session | null> {
    try {
      const source = sessions.value.find((s) => s.id === id);
      if (!source) return null;
      const newSession = await createSession(`${source.name || 'Диалог'} (Копия)`);
      copyStoredMessages(id, newSession.id);
      switchSession(newSession.id);
      return newSession;
    } catch (e) {
      console.error('Failed to duplicate session', e);
      return null;
    }
  }

  return {
    sessions,
    activeSessionId,
    isLoading,
    searchQuery,
    dateFilter,
    isSelectionMode,
    selectedSessionIds,
    selectedCount,
    isBulkOperating,
    bulkActionError,
    toggleSelectionMode,
    toggleSessionSelection,
    selectAllVisible,
    clearSelection,
    setViewFilter,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    updateSession,
    bulkArchiveSessions,
    moveSessionsToTrash,
    restoreSessionsFromTrash,
    permanentlyDeleteSessions,
    searchSessions,
    sortSessions,
    exportSession,
    duplicateSession
  };
});
