const MOCK_TRASH_CONFIG_KEY = 'arc_mock_trash_config';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function validateMockRetentionDays(input: unknown): { valid: true; retentionDays: number | null } | { valid: false; error: string } {
  if (input === null || input === undefined || input === 'off') {
    return { valid: true, retentionDays: null };
  }
  const num = typeof input === 'number' ? input : (typeof input === 'string' && /^\d+$/.test(input.trim()) ? Number(input.trim()) : NaN);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    return { valid: false, error: 'Укажите целое положительное число дней (не менее 1)' };
  }
  return { valid: true, retentionDays: num };
}

export function getMockTrashConfig(): { retentionDays: number | null } {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(MOCK_TRASH_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const check = validateMockRetentionDays(parsed?.retentionDays ?? null);
        if (check.valid) return { retentionDays: check.retentionDays };
      }
    }
  } catch { /* ignore */ }
  return { retentionDays: null };
}

export function purgeExpiredMockSessions(
  sessions: any[],
  messages: Record<number, any[]>,
  saveSessions: (s: any[]) => void,
  saveMessages: (m: Record<number, any[]>) => void,
  nowMs: number = Date.now()
): { deletedCount: number; retentionDays: number | null } {
  const cfg = getMockTrashConfig();
  if (cfg.retentionDays === null) return { deletedCount: 0, retentionDays: null };
  const cutoffMs = nowMs - cfg.retentionDays * MS_PER_DAY;
  const remaining: any[] = [];
  let deletedCount = 0;

  for (const s of sessions) {
    const isTrashed = Number(s.is_deleted || 0) === 1;
    const isArchived = Number(s.is_archived || 0) === 1;
    const delMs = s.deleted_at ? Date.parse(s.deleted_at) : NaN;
    if (isTrashed && !isArchived && Number.isFinite(delMs) && delMs <= cutoffMs) {
      delete messages[s.id];
      deletedCount++;
    } else {
      remaining.push(s);
    }
  }

  if (deletedCount > 0) {
    saveSessions(remaining);
    saveMessages(messages);
  }
  return { deletedCount, retentionDays: cfg.retentionDays };
}

export function createMockDialogTrashHandlers(deps: {
  getSessions: () => any[];
  saveSessions: (s: any[]) => void;
  getMessages: () => Record<number, any[]>;
  saveMessages: (m: Record<number, any[]>) => void;
}) {
  const normalizeIds = (ids: unknown): number[] =>
    Array.isArray(ids)
      ? Array.from(new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)))
      : [];

  return {
    dialogBulkArchive: async (idsInput: number[], archived: boolean) => {
      const ids = normalizeIds(idsInput);
      const sessions = deps.getSessions();
      const processedIds: number[] = [];
      const skippedIds: number[] = [];
      const failed: Array<{ id: number; error: string }> = [];
      const nowIso = new Date().toISOString();

      for (const id of ids) {
        const item = sessions.find((s) => s.id === id);
        if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
        if (Number(item.is_deleted || 0) === 1) { skippedIds.push(id); continue; }
        item.is_archived = archived ? 1 : 0;
        item.updated_at = nowIso;
        processedIds.push(id);
      }
      deps.saveSessions(sessions);
      return { success: failed.length === 0 && processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds, failed };
    },

    dialogMoveToTrash: async (idsInput: number[]) => {
      const ids = normalizeIds(idsInput);
      const sessions = deps.getSessions();
      const processedIds: number[] = [];
      const skippedIds: number[] = [];
      const failed: Array<{ id: number; error: string }> = [];
      const nowIso = new Date().toISOString();

      for (const id of ids) {
        const item = sessions.find((s) => s.id === id);
        if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
        if (Number(item.is_archived || 0) === 1 || Number(item.is_deleted || 0) === 1) {
          skippedIds.push(id);
          continue;
        }
        item.is_deleted = 1;
        item.deleted_at = nowIso;
        processedIds.push(id);
      }
      deps.saveSessions(sessions);
      return { success: failed.length === 0 && processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds, failed };
    },

    dialogRestoreFromTrash: async (idsInput: number[]) => {
      const ids = normalizeIds(idsInput);
      const sessions = deps.getSessions();
      const processedIds: number[] = [];
      const skippedIds: number[] = [];
      const failed: Array<{ id: number; error: string }> = [];

      for (const id of ids) {
        const item = sessions.find((s) => s.id === id);
        if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
        if (Number(item.is_deleted || 0) !== 1) { skippedIds.push(id); continue; }
        item.is_deleted = 0;
        item.deleted_at = null;
        item.is_archived = 0;
        processedIds.push(id);
      }
      deps.saveSessions(sessions);
      return { success: failed.length === 0 && processedIds.length > 0, totalRequested: ids.length, processedIds, skippedIds, failed };
    },

    dialogPermanentDelete: async (idsInput: number[]) => {
      const ids = normalizeIds(idsInput);
      let sessions = deps.getSessions();
      const allMsgs = deps.getMessages();
      const processedIds: number[] = [];
      const skippedIds: number[] = [];
      const failed: Array<{ id: number; error: string }> = [];

      for (const id of ids) {
        const item = sessions.find((s) => s.id === id);
        if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
        if (Number(item.is_deleted || 0) !== 1) { skippedIds.push(id); continue; }
        sessions = sessions.filter((s) => s.id !== id);
        delete allMsgs[id];
        processedIds.push(id);
      }
      deps.saveSessions(sessions);
      deps.saveMessages(allMsgs);
      return {
        success: failed.length === 0 && processedIds.length > 0,
        totalRequested: ids.length,
        processedIds,
        skippedIds,
        failed,
        deletedCount: processedIds.length
      };
    },

    dialogGetTrashConfig: async () => getMockTrashConfig(),

    dialogSetTrashConfig: async (retentionDays: number | null) => {
      const check = validateMockRetentionDays(retentionDays);
      if ('error' in check) return { success: false, error: check.error };
      const cfg = { retentionDays: check.retentionDays };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(MOCK_TRASH_CONFIG_KEY, JSON.stringify(cfg));
        }
      } catch { /* ignore */ }
      if (cfg.retentionDays !== null) {
        purgeExpiredMockSessions(deps.getSessions(), deps.getMessages(), deps.saveSessions, deps.saveMessages);
      }
      return { success: true, config: cfg };
    },

    dialogRunTrashCleanup: async () => {
      const res = purgeExpiredMockSessions(deps.getSessions(), deps.getMessages(), deps.saveSessions, deps.saveMessages);
      return { success: true, deletedCount: res.deletedCount, skipped: res.retentionDays === null, retentionDays: res.retentionDays };
    },

    dialogSearch: async (query: string, limit?: number, filter?: { archived?: boolean; trash?: boolean }) => {
      const q = (query || '').toLowerCase().trim();
      if (!q) return [];
      const sessions = deps.getSessions();
      const sessionMap = new Map<number, any>(sessions.map((s: any) => [s.id, s]));
      const allMsgs = deps.getMessages();
      const results: any[] = [];
      const matchesFilter = (s: any) => {
        const isDel = Number(s?.is_deleted || 0) === 1;
        const isArch = Number(s?.is_archived || 0) === 1;
        if (filter?.trash) return isDel;
        if (filter?.archived) return !isDel && isArch;
        if (filter) return !isDel && !isArch;
        return !isDel;
      };
      for (const s of sessions) {
        if (!matchesFilter(s)) continue;
        if ((s.name && s.name.toLowerCase().includes(q)) || (s.summary && s.summary.toLowerCase().includes(q))) {
          results.push({
            message_id: 0,
            session_id: s.id,
            session_name: s.name,
            snippet: s.summary || s.name,
            role: 'user',
            is_archived: s.is_archived || 0,
            is_pinned: s.is_pinned || 0,
            is_deleted: s.is_deleted || 0,
            deleted_at: s.deleted_at || null,
            updated_at: s.updated_at,
            created_at: s.created_at
          });
        }
      }
      for (const sessionIdStr of Object.keys(allMsgs)) {
        const sId = Number(sessionIdStr);
        const s = sessionMap.get(sId);
        if (!s || !matchesFilter(s)) continue;
        const msgs = allMsgs[sId] || [];
        for (const m of msgs) {
          if (m.content && m.content.toLowerCase().includes(q)) {
            results.push({
              id: m.id,
              message_id: m.id,
              session_id: sId,
              session_name: s.name,
              snippet: m.content.slice(0, 100),
              content: m.content,
              role: m.role,
              is_archived: s.is_archived || 0,
              is_pinned: s.is_pinned || 0,
              is_deleted: s.is_deleted || 0,
              deleted_at: s.deleted_at || null,
              updated_at: s.updated_at,
              created_at: m.created_at || s.created_at
            });
            if (limit && results.length >= limit) break;
          }
        }
        if (limit && results.length >= limit) break;
      }
      return results;
    }
  };
}
