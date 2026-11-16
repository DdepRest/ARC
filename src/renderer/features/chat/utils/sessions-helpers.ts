export interface Session {
  id: number;
  name: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  is_pinned: number;
  is_archived: number;
  is_deleted?: number;
  deleted_at?: string | null;
  tags: string | null;
}

export interface BulkSessionOpResult {
  success: boolean;
  totalRequested: number;
  processedIds: number[];
  skippedIds: number[];
  failed: Array<{ id: number; error: string }>;
  deletedCount?: number;
  error?: string;
}

export const STORAGE_KEY = 'arc_chat_sessions';
export const MESSAGES_KEY_PREFIX = 'arc_chat_messages_';

export function getStoredSessions(): Session[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

export function saveStoredSessions(list: Session[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function removeStoredMessages(id: number) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(MESSAGES_KEY_PREFIX + id);
  } catch { /* ignore */ }
}

export function isTrashedSession(s: Pick<Session, 'is_deleted'>): boolean {
  return Number(s.is_deleted || 0) === 1;
}

export function isArchivedSession(s: Pick<Session, 'is_archived' | 'is_deleted'>): boolean {
  return !isTrashedSession(s) && Number(s.is_archived || 0) === 1;
}

export function isActiveSession(s: Pick<Session, 'is_archived' | 'is_deleted'>): boolean {
  return !isTrashedSession(s) && Number(s.is_archived || 0) === 0;
}

export function sortSessionList(list: Session[], isTrashView = false): Session[] {
  return [...list].sort((a, b) => {
    if (isTrashView) {
      const delA = new Date(a.deleted_at || a.updated_at || a.created_at).getTime() || 0;
      const delB = new Date(b.deleted_at || b.updated_at || b.created_at).getTime() || 0;
      if (delB !== delA) return delB - delA;
    }
    if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
      return (b.is_pinned || 0) - (a.is_pinned || 0);
    }
    const timeA = new Date(a.updated_at || a.created_at).getTime() || 0;
    const timeB = new Date(b.updated_at || b.created_at).getTime() || 0;
    return timeB - timeA;
  });
}

export function filterSessionsByDate(list: Session[], filter: string): Session[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  return list.filter((s) => {
    if (filter === 'trash') {
      return isTrashedSession(s);
    }
    if (isTrashedSession(s)) return false;

    if (filter === 'archived') {
      return Number(s.is_archived || 0) === 1;
    }
    if (Number(s.is_archived || 0) === 1) return false;

    if (filter === 'all') return true;

    const sDate = new Date(s.updated_at || s.created_at);
    if (isNaN(sDate.getTime())) return true;

    if (filter === 'today') return sDate.toDateString() === todayStr;
    if (filter === 'yesterday') return sDate.toDateString() === yesterdayStr;
    if (filter === 'week') return sDate.getTime() >= sevenDaysAgo;
    if (filter === 'month') return sDate.getTime() >= thirtyDaysAgo;
    return true;
  });
}

export function normalizeUniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
}

export function fallbackBulkArchive(ids: number[], archived: boolean): BulkSessionOpResult {
  const uniqueIds = normalizeUniqueIds(ids);
  const stored = getStoredSessions();
  const processedIds: number[] = [];
  const skippedIds: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];
  const nowIso = new Date().toISOString();

  for (const id of uniqueIds) {
    const item = stored.find((s) => s.id === id);
    if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
    if (isTrashedSession(item)) { skippedIds.push(id); continue; }
    item.is_archived = archived ? 1 : 0;
    item.updated_at = nowIso;
    processedIds.push(id);
  }
  saveStoredSessions(stored);
  return { success: failed.length === 0 && processedIds.length > 0, totalRequested: uniqueIds.length, processedIds, skippedIds, failed };
}

export function fallbackMoveToTrash(ids: number[]): BulkSessionOpResult {
  const uniqueIds = normalizeUniqueIds(ids);
  const stored = getStoredSessions();
  const processedIds: number[] = [];
  const skippedIds: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];
  const nowIso = new Date().toISOString();

  for (const id of uniqueIds) {
    const item = stored.find((s) => s.id === id);
    if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
    if (!isActiveSession(item)) { skippedIds.push(id); continue; }
    item.is_deleted = 1;
    item.deleted_at = nowIso;
    processedIds.push(id);
  }
  saveStoredSessions(stored);
  return { success: failed.length === 0 && processedIds.length > 0, totalRequested: uniqueIds.length, processedIds, skippedIds, failed };
}

export function fallbackRestoreFromTrash(ids: number[]): BulkSessionOpResult {
  const uniqueIds = normalizeUniqueIds(ids);
  const stored = getStoredSessions();
  const processedIds: number[] = [];
  const skippedIds: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];

  for (const id of uniqueIds) {
    const item = stored.find((s) => s.id === id);
    if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
    if (!isTrashedSession(item)) { skippedIds.push(id); continue; }
    item.is_deleted = 0;
    item.deleted_at = null;
    item.is_archived = 0;
    processedIds.push(id);
  }
  saveStoredSessions(stored);
  return { success: failed.length === 0 && processedIds.length > 0, totalRequested: uniqueIds.length, processedIds, skippedIds, failed };
}

export function fallbackPermanentDelete(ids: number[]): BulkSessionOpResult {
  const uniqueIds = normalizeUniqueIds(ids);
  let stored = getStoredSessions();
  const processedIds: number[] = [];
  const skippedIds: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];

  for (const id of uniqueIds) {
    const item = stored.find((s) => s.id === id);
    if (!item) { failed.push({ id, error: 'Диалог не найден' }); continue; }
    if (!isTrashedSession(item)) { skippedIds.push(id); continue; }
    stored = stored.filter((s) => s.id !== id);
    removeStoredMessages(id);
    processedIds.push(id);
  }
  saveStoredSessions(stored);
  return {
    success: failed.length === 0 && processedIds.length > 0,
    totalRequested: uniqueIds.length,
    processedIds,
    skippedIds,
    failed,
    deletedCount: processedIds.length
  };
}

export function mapSearchResultsToSessions(results: any[], dateFilter: string): Session[] {
  const sessionIds = new Set<number>();
  const matched: Session[] = [];
  for (const r of results) {
    if (!sessionIds.has(r.session_id)) {
      sessionIds.add(r.session_id);
      matched.push({
        id: r.session_id,
        name: r.session_name,
        summary: r.snippet,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString(),
        message_count: 0,
        is_pinned: r.is_pinned || 0,
        is_archived: r.is_archived || 0,
        is_deleted: r.is_deleted || 0,
        deleted_at: r.deleted_at || null,
        tags: null
      });
    }
  }
  return sortSessionList(filterSessionsByDate(matched, dateFilter), dateFilter === 'trash');
}

export function searchStoredSessions(query: string, dateFilter: string): Session[] {
  const lower = query.toLowerCase();
  const matched = getStoredSessions().filter((s) =>
    (s.name && s.name.toLowerCase().includes(lower)) ||
    (s.summary && s.summary.toLowerCase().includes(lower))
  );
  return sortSessionList(filterSessionsByDate(matched, dateFilter), dateFilter === 'trash');
}

export function exportSessionMarkdownFallback(id: number, session?: Session): { success: boolean; filePath?: string; error?: string } {
  const rawMsgs = typeof localStorage !== 'undefined' ? localStorage.getItem(MESSAGES_KEY_PREFIX + id) : null;
  const msgs = rawMsgs ? JSON.parse(rawMsgs) : [];
  let mdContent = `# ${session?.name || 'Диалог A.R.C.'}\nДата: ${new Date().toLocaleString()}\n\n---\n\n`;
  for (const m of msgs) {
    const author = m.role === 'user' ? '👤 Пользователь' : '🤖 A.R.C.';
    let timeStr = '';
    if (m.created_at) {
      try {
        const d = new Date(m.created_at);
        if (!isNaN(d.getTime()) && typeof d.toLocaleTimeString === 'function') timeStr = d.toLocaleTimeString();
      } catch { /* ignore */ }
    }
    mdContent += `### ${author} (${timeStr})\n\n${m.content || ''}\n\n---\n\n`;
  }
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(session?.name || 'dialog').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { success: true, filePath: a.download };
}

export function createFallbackSession(sessionName: string): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: sessionName,
    summary: 'Диалог без сообщений',
    created_at: now,
    updated_at: now,
    message_count: 0,
    is_pinned: 0,
    is_archived: 0,
    is_deleted: 0,
    deleted_at: null,
    tags: null
  };
  const allStored = getStoredSessions();
  allStored.unshift(session);
  saveStoredSessions(allStored);
  return session;
}

export function copyStoredMessages(fromId: number, toId: number) {
  if (typeof localStorage === 'undefined') return;
  const rawMsgs = localStorage.getItem(MESSAGES_KEY_PREFIX + fromId);
  if (rawMsgs) {
    localStorage.setItem(MESSAGES_KEY_PREFIX + toId, rawMsgs);
  }
}
