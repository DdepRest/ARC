import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionsStore } from './sessions.store';
import { useSettingsStore } from '../../settings/stores/settings.store';

describe('sessions.store bulk dialog management & settings retention', () => {
  let dbSessions: any[] = [];
  let dbMessages: Record<number, any[]> = {};

  beforeEach(() => {
    setActivePinia(createPinia());
    const now = Date.now();
    dbSessions = [
      { id: 1, name: 'Alpha', summary: 'first', is_archived: 0, is_deleted: 0, deleted_at: null, is_pinned: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now + 3000).toISOString() },
      { id: 2, name: 'Beta', summary: 'second', is_archived: 0, is_deleted: 0, deleted_at: null, is_pinned: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now + 2000).toISOString() },
      { id: 3, name: 'Gamma Archived', summary: 'arch', is_archived: 1, is_deleted: 0, deleted_at: null, is_pinned: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now + 1000).toISOString() },
      { id: 4, name: 'Delta Trashed', summary: 'trash', is_archived: 0, is_deleted: 1, deleted_at: new Date(now - 10000).toISOString(), is_pinned: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }
    ];
    dbMessages = { 1: [{ id: 11, content: 'Alpha msg' }], 2: [], 3: [], 4: [] };

    (global as any).window = {
      api: {
        dialogListSessions: vi.fn(async (_l: number, _o: number, filter?: { archived?: boolean; trash?: boolean }) => {
          if (filter?.trash) return dbSessions.filter((s) => s.is_deleted === 1);
          if (filter?.archived) return dbSessions.filter((s) => s.is_deleted === 0 && s.is_archived === 1);
          return dbSessions.filter((s) => s.is_deleted === 0 && s.is_archived === 0);
        }),
        dialogSearch: vi.fn(async (q: string, _limit: number, filter?: { archived?: boolean; trash?: boolean }) => {
          const lower = q.toLowerCase();
          return dbSessions
            .filter((s) => {
              if (filter?.trash) return s.is_deleted === 1;
              if (filter?.archived) return s.is_deleted === 0 && s.is_archived === 1;
              return s.is_deleted === 0 && s.is_archived === 0;
            })
            .filter((s) => s.name.toLowerCase().includes(lower))
            .map((s) => ({
              session_id: s.id,
              session_name: s.name,
              snippet: s.summary,
              is_archived: s.is_archived,
              is_deleted: s.is_deleted,
              deleted_at: s.deleted_at,
              is_pinned: s.is_pinned,
              created_at: s.created_at,
              updated_at: s.updated_at
            }));
        }),
        dialogBulkArchive: vi.fn(async (ids: number[], archived: boolean) => {
          const processedIds: number[] = [];
          for (const id of ids) {
            const s = dbSessions.find((item) => item.id === id && item.is_deleted === 0);
            if (s) {
              s.is_archived = archived ? 1 : 0;
              processedIds.push(id);
            }
          }
          return { success: processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds: [], failed: [] };
        }),
        dialogMoveToTrash: vi.fn(async (ids: number[]) => {
          const processedIds: number[] = [];
          const skippedIds: number[] = [];
          for (const id of ids) {
            const s = dbSessions.find((item) => item.id === id);
            if (s && s.is_deleted === 0 && s.is_archived === 0) {
              s.is_deleted = 1;
              s.deleted_at = new Date().toISOString();
              processedIds.push(id);
            } else {
              skippedIds.push(id);
            }
          }
          return { success: processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds, failed: [] };
        }),
        dialogRestoreFromTrash: vi.fn(async (ids: number[]) => {
          const processedIds: number[] = [];
          for (const id of ids) {
            const s = dbSessions.find((item) => item.id === id && item.is_deleted === 1);
            if (s) {
              s.is_deleted = 0;
              s.deleted_at = null;
              s.is_archived = 0;
              processedIds.push(id);
            }
          }
          return { success: processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds: [], failed: [] };
        }),
        dialogPermanentDelete: vi.fn(async (ids: number[]) => {
          const processedIds: number[] = [];
          for (const id of ids) {
            const idx = dbSessions.findIndex((item) => item.id === id && item.is_deleted === 1);
            if (idx !== -1) {
              dbSessions.splice(idx, 1);
              delete dbMessages[id];
              processedIds.push(id);
            }
          }
          return { success: processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds: [], failed: [], deletedCount: processedIds.length };
        }),
        dialogGetTrashConfig: vi.fn(async () => ({ retentionDays: null })),
        dialogSetTrashConfig: vi.fn(async (days: number | null) => ({ success: true, config: { retentionDays: days } }))
      }
    };
  });

  it('selectAllVisible selects only active list items (or search results) and excludes archive/trash', async () => {
    const store = useSessionsStore();
    await store.loadSessions();

    expect(store.sessions.map((s) => s.id)).toEqual([1, 2]);
    store.selectAllVisible();
    expect(store.selectedSessionIds).toEqual([1, 2]);

    // When search is active, selectAllVisible selects only visible search hits
    store.searchQuery = 'Alpha';
    await store.searchSessions('Alpha');
    store.selectAllVisible();
    expect(store.selectedSessionIds).toEqual([1]);

    // Switching view resets selection mode; clearing search reveals all trashed items
    await store.setViewFilter('trash');
    expect(store.isSelectionMode).toBe(false);
    expect(store.selectedSessionIds).toEqual([]);
    expect(store.sessions).toEqual([]);
    store.searchQuery = '';
    await store.loadSessions();
    expect(store.sessions.map((s) => s.id)).toEqual([4]);
  });

  it('switches activeSessionId to next available active dialog or null when all active dialogs are trashed', async () => {
    const store = useSessionsStore();
    await store.loadSessions();
    expect(store.activeSessionId).toBe(1);

    // Trash active dialog #1 -> switches to #2
    await store.moveSessionsToTrash([1]);
    expect(store.activeSessionId).toBe(2);
    expect(store.sessions.map((s) => s.id)).toEqual([2]);

    // Trash remaining active dialog #2 -> sets activeSessionId to null (empty state), leaving archived #3 untouched
    await store.moveSessionsToTrash([2]);
    expect(store.activeSessionId).toBeNull();
    expect(store.sessions).toHaveLength(0);
    expect(dbSessions.find((s) => s.id === 3)?.is_archived).toBe(1);
    expect(dbSessions.find((s) => s.id === 3)?.is_deleted).toBe(0);
  });

  it('restores dialogs from trash to active list and permanently deletes selected from trash', async () => {
    const store = useSessionsStore();
    await store.setViewFilter('trash');
    expect(store.sessions.map((s) => s.id)).toEqual([4]);

    const restoreRes = await store.restoreSessionsFromTrash([4]);
    expect(restoreRes.success).toBe(true);
    expect(store.sessions).toHaveLength(0);

    await store.setViewFilter('all');
    expect(store.sessions.map((s) => s.id)).toContain(4);

    // Move #2 to trash and permanently delete it
    await store.moveSessionsToTrash([2]);
    await store.setViewFilter('trash');
    expect(store.sessions.map((s) => s.id)).toEqual([2]);

    const permRes = await store.permanentlyDeleteSessions([2]);
    expect(permRes.success).toBe(true);
    expect(store.sessions).toHaveLength(0);
    expect(dbSessions.some((s) => s.id === 2)).toBe(false);
  });

  it('propagates errors and prevents false success when bulk archive fails', async () => {
    const store = useSessionsStore();
    await store.loadSessions();
    ((window as any).api.dialogBulkArchive as any).mockResolvedValueOnce({
      success: false,
      totalRequested: 1,
      processedIds: [],
      skippedIds: [],
      failed: [{ id: 1, error: 'DB_SAFE_MODE' }],
      error: 'DB_SAFE_MODE'
    });

    store.toggleSelectionMode(true);
    store.toggleSessionSelection(1);
    const res = await store.bulkArchiveSessions([1], true);

    expect(res.success).toBe(false);
    expect(store.bulkActionError).toBe('DB_SAFE_MODE');
    expect(store.isSelectionMode).toBe(true);
    expect(store.selectedSessionIds).toEqual([1]);
  });

  it('defaults dialogTrashRetentionDays to null and validates updates in settings store', async () => {
    const settingsStore = useSettingsStore();
    expect(settingsStore.dialogTrashRetentionDays).toBeNull();

    const invalidRes = await settingsStore.setDialogTrashRetentionDays(0);
    expect(invalidRes.success).toBe(false);
    expect(settingsStore.dialogTrashRetentionDays).toBeNull();

    const validRes = await settingsStore.setDialogTrashRetentionDays(30);
    expect(validRes.success).toBe(true);
    expect(settingsStore.dialogTrashRetentionDays).toBe(30);

    settingsStore.resetToDefaults();
    expect(settingsStore.dialogTrashRetentionDays).toBeNull();
  });
});
