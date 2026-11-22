import type { Task } from '../types';

export const TASKS_PENDING_OPS_KEY = 'arc_tasks_pending_ops_v1';
export const DEFAULT_SYNC_TIMEOUT_MS = 8000;
export const DEFAULT_RETRY_BACKOFF_BASE_MS = 1000;
export const MAX_AUTO_RETRIES = 3;

export interface PendingTasksJournal {
  upserts: Record<string, Task>;
  deletes: string[];
  clearAll: boolean;
}

export function createEmptyJournal(): PendingTasksJournal {
  return { upserts: {}, deletes: [], clearAll: false };
}

export function upgradeTasksSchema(loadedTasks: any[]): Task[] {
  return loadedTasks.map(t => {
    const createdAt = Number(t.createdAt ?? t.created_at) || Date.now();
    const updatedAt = Number(t.updatedAt ?? t.updated_at ?? createdAt) || createdAt;
    return {
      id: t.id || 'task-' + Math.random().toString(36).substring(2, 9),
      text: t.text || '',
      description: t.description || '',
      completed: !!t.completed,
      createdAt,
      completedAt: t.completedAt ?? t.completed_at ?? undefined,
      updatedAt,
      updated_at: updatedAt,
      priority: t.priority || 'medium',
      category: (!t.category || t.category === 'manage_categories') ? 'ops' : t.category,
      dueDate: t.dueDate || t.due_date || '',
      status: t.completed
        ? 'done'
        : (t.status === 'backlog' || !t.status
            ? ((t.spentMinutes || t.spent_minutes || 0) > 0 ? 'in_progress' : 'todo')
            : t.status),
      importance: t.importance || (t.priority === 'high' ? 'urgent-important' : 'regular'),
      estimatedMinutes: Number(t.estimatedMinutes ?? t.estimated_minutes) || 30,
      spentMinutes: Number(t.spentMinutes ?? t.spent_minutes) || 0,
      aiDecomposed: !!(t.aiDecomposed ?? t.ai_decomposed),
      isMyDay: !!(t.isMyDay ?? t.is_my_day),
      recurrence: t.recurrence,
      attachments: t.attachments || [],
      autoRestSeconds: t.autoRestSeconds ?? t.auto_rest_seconds,
      objectiveId: t.objectiveId || t.objective_id,
      subtasks: Array.isArray(t.subtasks)
        ? t.subtasks.map((st: any) => ({
            id: st.id || 'sub-' + Math.random().toString(36).substring(2, 9),
            text: st.text || '',
            completed: !!st.completed,
            restSeconds: st.restSeconds,
            source: (st.source === 'llm' || st.source === 'local_template') ? st.source : undefined
          }))
        : []
    };
  });
}

export function getTaskUpdatedAt(t: any): number {
  return Number(t?.updatedAt ?? t?.updated_at ?? t?.createdAt ?? t?.created_at ?? 0) || 0;
}

export function serializeTaskForDiff(t: Task): string {
  return JSON.stringify({
    id: t.id,
    text: t.text || '',
    description: t.description || '',
    completed: Boolean(t.completed),
    completedAt: t.completedAt ?? null,
    priority: t.priority || 'medium',
    category: t.category || 'ops',
    dueDate: t.dueDate || '',
    status: t.status || 'todo',
    importance: t.importance || 'regular',
    estimatedMinutes: Number(t.estimatedMinutes) || 30,
    spentMinutes: Number(t.spentMinutes) || 0,
    aiDecomposed: Boolean(t.aiDecomposed),
    isMyDay: Boolean(t.isMyDay),
    recurrence: t.recurrence ?? null,
    attachments: t.attachments || [],
    autoRestSeconds: t.autoRestSeconds ?? null,
    objectiveId: t.objectiveId ?? null,
    subtasks: (t.subtasks || []).map(st => ({
      id: st.id,
      text: st.text || '',
      completed: Boolean(st.completed),
      restSeconds: st.restSeconds ?? null,
      source: st.source ?? null
    }))
  });
}

export function hasPendingJournalEntries(journal: PendingTasksJournal): boolean {
  return journal.clearAll || journal.deletes.length > 0 || Object.keys(journal.upserts).length > 0;
}

export function readPendingTasksJournal(): PendingTasksJournal {
  if (typeof localStorage === 'undefined') return createEmptyJournal();
  try {
    const raw = localStorage.getItem(TASKS_PENDING_OPS_KEY);
    if (!raw) return createEmptyJournal();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createEmptyJournal();

    const upserts: Record<string, Task> = {};
    if (parsed.upserts && typeof parsed.upserts === 'object') {
      for (const [id, task] of Object.entries(parsed.upserts)) {
        if (id && task && typeof task === 'object') {
          upserts[id] = task as Task;
        }
      }
    }

    const deletes: string[] = Array.isArray(parsed.deletes)
      ? Array.from(new Set<string>(parsed.deletes.filter((x: any): x is string => typeof x === 'string' && x.length > 0)))
      : [];

    return {
      upserts,
      deletes,
      clearAll: Boolean(parsed.clearAll)
    };
  } catch {
    return createEmptyJournal();
  }
}

export function writePendingTasksJournal(journal: PendingTasksJournal): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!hasPendingJournalEntries(journal)) {
      localStorage.removeItem(TASKS_PENDING_OPS_KEY);
      return;
    }
    localStorage.setItem(TASKS_PENDING_OPS_KEY, JSON.stringify(journal));
  } catch (err) {
    console.warn('[tasks-sync] Failed to persist pending tasks journal:', err);
  }
}

export function clearPendingTasksJournal(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(TASKS_PENDING_OPS_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

export async function invokeWithTimeout<T>(
  op: () => Promise<T>,
  timeoutMs: number,
  channelName: string
): Promise<T> {
  const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_SYNC_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    let opPromise: Promise<T>;
    try {
      opPromise = Promise.resolve(op());
    } catch (syncErr) {
      opPromise = Promise.reject(syncErr);
    }
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`IPC_TIMEOUT:${channelName}:${effectiveTimeout}ms`));
      }, effectiveTimeout);
    });
    return await Promise.race([opPromise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
}
