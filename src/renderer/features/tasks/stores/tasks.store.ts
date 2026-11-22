import { defineStore } from "pinia";
import { ref, computed, reactive, onMounted, onUnmounted, onScopeDispose } from 'vue';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useUIStore } from '../../../stores/ui.store';
import { Task, TaskStatus, EisenhowerQuadrant, RecurrenceRule, TaskChangedPayload } from '../types';
import { useTaskFilters } from '../composables/useTaskFilters';
import { useTaskTelemetry } from '../composables/useTaskTelemetry';
import { useFocusSprint } from '../composables/useFocusSprint';
import { useRestTimer } from '../composables/useRestTimer';
import { usePresetTemplates } from '../composables/usePresetTemplates';
import { useCategories } from '../composables/useCategories';
import { useAiDecomposition } from '../composables/useAiDecomp';
import { useTaskExport } from '../composables/useTaskExport';
import { useTaskParser } from '../composables/useTaskParser';
import { useTaskSounds } from '../composables/useTaskSounds';
import { calculateNextRecurrenceDate } from '../composables/useRecurrenceHelpers';
import {
  DEFAULT_SYNC_TIMEOUT_MS,
  DEFAULT_RETRY_BACKOFF_BASE_MS,
  MAX_AUTO_RETRIES,
  upgradeTasksSchema,
  getTaskUpdatedAt,
  serializeTaskForDiff,
  hasPendingJournalEntries,
  readPendingTasksJournal,
  writePendingTasksJournal,
  clearPendingTasksJournal,
  invokeWithTimeout
} from '../utils/tasks-sync.helper';

function getDefaultSampleTasks(): Task[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  return [
    {
      id: 'init-1',
      text: 'Оптимизация рендеринга и декомпозиция компонентов',
      description: 'Профилирование узких мест, вынос тяжелой логики в composables и замеры FPS',
      completed: false,
      createdAt: Date.now() - 3600000 * 24,
      updatedAt: Date.now() - 3600000 * 24,
      updated_at: Date.now() - 3600000 * 24,
      priority: 'high',
      category: 'dev',
      status: 'in_progress',
      importance: 'urgent-important',
      dueDate: todayStr,
      isMyDay: true,
      estimatedMinutes: 45,
      spentMinutes: 15,
      subtasks: [
        { id: 'st-1', text: 'Замер времени рендера и анализ профилировщика', completed: true },
        { id: 'st-2', text: 'Вынос состояния в изолированные composables', completed: false },
        { id: 'st-3', text: 'Мемоизация вычислений фильтрации задач', completed: false }
      ]
    },
    {
      id: 'init-2',
      text: 'Синхронизация и бэкап системной памяти A.R.C.',
      description: 'Создание локального дампа состояния и верификация целостности данных',
      completed: false,
      createdAt: Date.now() - 3600000 * 48,
      updatedAt: Date.now() - 3600000 * 48,
      updated_at: Date.now() - 3600000 * 48,
      priority: 'medium',
      category: 'data',
      status: 'todo',
      importance: 'important',
      dueDate: tomorrowStr,
      isMyDay: false,
      estimatedMinutes: 30,
      spentMinutes: 0,
      subtasks: [
        { id: 'st-4', text: 'Экспорт журнала операций', completed: false },
        { id: 'st-5', text: 'Проверка хэш-сумм бэкапа', completed: false }
      ]
    },
    {
      id: 'init-3',
      text: 'Аудит безопасности и системный анализ ролей',
      description: 'Сканирование прав доступа и валидация токенов авторизации',
      completed: false,
      createdAt: Date.now() - 3600000 * 12,
      updatedAt: Date.now() - 3600000 * 12,
      updated_at: Date.now() - 3600000 * 12,
      priority: 'high',
      category: 'sec',
      status: 'todo',
      importance: 'urgent-important',
      dueDate: todayStr,
      isMyDay: true,
      estimatedMinutes: 60,
      spentMinutes: 0,
      subtasks: []
    }
  ];
}

let activeTasksChangedUnsubscribe: (() => void) | null = null;

export const useTasksStore = defineStore("tasks", () => {
  const settingsStore = useSettingsStore();
  const uiStore = useUIStore();
  const tasks = ref<Task[]>([]);
  const objectives = ref<any[]>([]);
  const expandedTaskId = ref<string | null>(null);
  const viewMode = ref<'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history'>('list');
  const isTasksLoaded = ref(false);

  // Double-click guard for toggleTask / recurrence
  const lastToggleMap = new Map<string, number>();

  // Snapshot map of the last state POSITIVELY ACKNOWLEDGED by SQLite SSOT
  const lastSyncedSnapshotMap = new Map<string, string>();

  // Per-task serial queue & monotonic revision guard to prevent concurrent races
  const taskRevisionMap = new Map<string, number>();
  const perTaskQueueMap = new Map<string, Promise<void>>();
  const pendingUpsertPayloads = new Map<string, Task>();

  const dirtyUpsertIds = ref<Set<string>>(new Set());
  const pendingDeleteIds = ref<Set<string>>(new Set());
  const inFlightTaskIds = ref<Set<string>>(new Set());
  const pendingClearAll = ref(false);
  const syncState = ref<'idle' | 'syncing' | 'error'>('idle');
  const lastSyncError = ref<string | null>(null);

  const dirtyTaskIds = computed(() => Array.from(dirtyUpsertIds.value));
  const pendingDeleteTaskIds = computed(() => Array.from(pendingDeleteIds.value));
  const hasUnsyncedChanges = computed(
    () => dirtyUpsertIds.value.size > 0 || pendingDeleteIds.value.size > 0 || pendingClearAll.value
  );

  let syncTimeoutMs = DEFAULT_SYNC_TIMEOUT_MS;
  let retryBackoffBaseMs = DEFAULT_RETRY_BACKOFF_BASE_MS;
  let retryAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let isRetrying = false;
  let inFlightLoadPromise: Promise<void> | null = null;

  const setSyncOptions = (opts: { timeoutMs?: number; backoffBaseMs?: number }) => {
    if (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) {
      syncTimeoutMs = opts.timeoutMs;
    }
    if (typeof opts.backoffBaseMs === 'number' && opts.backoffBaseMs > 0) {
      retryBackoffBaseMs = opts.backoffBaseMs;
    }
  };

  const getApi = () =>
    typeof window !== 'undefined' ? ((window as any).api || (window as any).electronAPI) : null;

  const nextTaskRevision = (id: string): number => {
    const next = (taskRevisionMap.get(id) ?? 0) + 1;
    taskRevisionMap.set(id, next);
    return next;
  };

  const buildJournalSnapshot = () => {
    const upserts: Record<string, Task> = {};
    for (const id of dirtyUpsertIds.value) {
      const storedPayload = pendingUpsertPayloads.get(id);
      const liveTask = tasks.value.find(t => t.id === id);
      const source = storedPayload || liveTask;
      if (source) {
        upserts[id] = JSON.parse(JSON.stringify(source));
      }
    }
    return {
      upserts,
      deletes: Array.from(pendingDeleteIds.value),
      clearAll: pendingClearAll.value
    };
  };

  const flushDirtyJournalToStorage = (forceWriteWhenPending = true) => {
    const snapshot = buildJournalSnapshot();
    if (!hasPendingJournalEntries(snapshot)) {
      clearPendingTasksJournal();
      return;
    }
    if (forceWriteWhenPending) {
      writePendingTasksJournal(snapshot);
    }
  };

  const refreshSyncState = (failedReason?: string | null) => {
    if (failedReason !== undefined) {
      lastSyncError.value = failedReason;
    }
    if (inFlightTaskIds.value.size > 0) {
      syncState.value = 'syncing';
      return;
    }
    if (lastSyncError.value || hasUnsyncedChanges.value) {
      syncState.value = 'error';
      return;
    }
    syncState.value = 'idle';
    retryAttempts = 0;
  };

  const notifySyncError = (reason: string) => {
    const isEn = settingsStore.language === 'EN';
    const label = isEn
      ? `Sync failed (${reason}). Kept locally for retry.`
      : `Ошибка сохранения в БД (${reason}). Ожидает повтора.`;
    settingsStore.triggerSyncToast(
      label,
      () => {
        void retryPendingSync();
      },
      true,
      {
        variant: 'error',
        actionLabel: isEn ? 'Retry' : 'Повторить'
      }
    );
  };

  const confirmSyncToast = (
    ackPromise: Promise<boolean>,
    label: string,
    undoFn: () => void,
    isCritical = false
  ) => {
    void ackPromise.then(acked => {
      if (acked) {
        settingsStore.triggerSyncToast(label, undoFn, isCritical);
      }
    });
  };

  const scheduleBackoffRetry = () => {
    if (retryTimer !== null || isRetrying || !hasUnsyncedChanges.value) return;
    if (retryAttempts >= MAX_AUTO_RETRIES) return;
    const delay = retryBackoffBaseMs * Math.pow(2, retryAttempts);
    retryAttempts += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void retryPendingSync({ isAutoRetry: true });
    }, delay);
  };

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const enqueueTaskOp = <T>(id: string, op: () => Promise<T>): Promise<T> => {
    const prev = perTaskQueueMap.get(id);
    const run = prev ? prev.then(() => op(), () => op()) : op();
    const tracked = run.then(
      () => undefined,
      () => undefined
    ).finally(() => {
      if (perTaskQueueMap.get(id) === tracked) {
        perTaskQueueMap.delete(id);
      }
    });
    perTaskQueueMap.set(id, tracked);
    return run;
  };

  const rebuildSyncedSnapshotMap = (list: Task[]) => {
    lastSyncedSnapshotMap.clear();
    for (const t of list || []) {
      if (t && t.id) {
        lastSyncedSnapshotMap.set(t.id, serializeTaskForDiff(t));
      }
    }
  };

  const persistTaskUpsert = async (
    task: Task,
    opts?: { silentErrorToast?: boolean }
  ): Promise<Task | null> => {
    if (!task || !task.id) return null;
    const opRev = nextTaskRevision(task.id);
    const now = Date.now();
    const nextTs = Math.max(now, getTaskUpdatedAt(task) + 1);
    task.updatedAt = nextTs;
    task.updated_at = nextTs;

    const payload = JSON.parse(JSON.stringify(task)) as Task;
    pendingDeleteIds.value.delete(task.id);
    dirtyUpsertIds.value.add(task.id);
    pendingUpsertPayloads.set(task.id, payload);
    pendingClearAll.value = false;
    refreshSyncState();

    return enqueueTaskOp(task.id, async () => {
      const api = getApi();
      const upserter = api?.tasksUpsert || api?.tasks?.upsert;
      if (typeof upserter !== 'function') {
        const reason = 'IPC tasksUpsert unavailable';
        flushDirtyJournalToStorage(true);
        refreshSyncState(reason);
        scheduleBackoffRetry();
        if (!opts?.silentErrorToast) notifySyncError(reason);
        return null;
      }

      inFlightTaskIds.value.add(task.id);
      refreshSyncState();

      try {
        const res = await invokeWithTimeout<any>(() => upserter(payload), syncTimeoutMs, 'tasks:upsert');

        if (res && typeof res === 'object' && 'success' in res && res.success === false) {
          throw new Error(typeof res.error === 'string' && res.error ? res.error : 'Upsert rejected');
        }

        const savedRaw = res && typeof res === 'object' && 'task' in res ? res.task : res;
        if (!savedRaw || typeof savedRaw !== 'object' || savedRaw.id !== task.id) {
          throw new Error('Server response mismatch for tasks:upsert');
        }

        const [upgraded] = upgradeTasksSchema([savedRaw]);
        lastSyncedSnapshotMap.set(upgraded.id, serializeTaskForDiff(upgraded));

        const latestRev = taskRevisionMap.get(upgraded.id) ?? 0;
        if (latestRev === opRev && !pendingDeleteIds.value.has(upgraded.id)) {
          const idx = tasks.value.findIndex(x => x.id === upgraded.id);
          if (idx !== -1) {
            tasks.value[idx] = upgraded;
          }
          dirtyUpsertIds.value.delete(upgraded.id);
          pendingUpsertPayloads.delete(upgraded.id);
          flushDirtyJournalToStorage(false);
        }

        inFlightTaskIds.value.delete(task.id);
        refreshSyncState(hasUnsyncedChanges.value ? lastSyncError.value : null);
        return upgraded;
      } catch (err: any) {
        const reason = err?.message || String(err);
        console.warn('[tasks.store] IPC tasksUpsert failed:', reason);
        inFlightTaskIds.value.delete(task.id);
        flushDirtyJournalToStorage(true);
        refreshSyncState(reason);
        scheduleBackoffRetry();
        if (!opts?.silentErrorToast) notifySyncError(reason);
        return null;
      }
    });
  };

  const persistTaskDelete = async (
    id: string,
    opts?: { silentErrorToast?: boolean }
  ): Promise<boolean> => {
    if (!id) return false;
    const opRev = nextTaskRevision(id);
    dirtyUpsertIds.value.delete(id);
    pendingUpsertPayloads.delete(id);
    pendingDeleteIds.value.add(id);
    refreshSyncState();

    return enqueueTaskOp(id, async () => {
      const api = getApi();
      const deleter = api?.tasksDelete || api?.tasks?.delete;
      if (typeof deleter !== 'function') {
        const reason = 'IPC tasksDelete unavailable';
        flushDirtyJournalToStorage(true);
        refreshSyncState(reason);
        scheduleBackoffRetry();
        if (!opts?.silentErrorToast) notifySyncError(reason);
        return false;
      }

      inFlightTaskIds.value.add(id);
      refreshSyncState();

      try {
        const res = await invokeWithTimeout<any>(() => deleter(id), syncTimeoutMs, 'tasks:delete');
        const acked =
          typeof res === 'object' && res !== null
            ? res.success === true && (res.id === undefined || res.id === id)
            : res === true;

        if (!acked) {
          const errText =
            typeof res === 'object' && res !== null && typeof res.error === 'string' && res.error
              ? res.error
              : 'Delete rejected';
          throw new Error(errText);
        }

        if ((taskRevisionMap.get(id) ?? 0) === opRev) {
          pendingDeleteIds.value.delete(id);
          lastSyncedSnapshotMap.delete(id);
          flushDirtyJournalToStorage(false);
        }

        inFlightTaskIds.value.delete(id);
        refreshSyncState(hasUnsyncedChanges.value ? lastSyncError.value : null);
        return true;
      } catch (err: any) {
        const reason = err?.message || String(err);
        console.warn('[tasks.store] IPC tasksDelete failed:', reason);
        inFlightTaskIds.value.delete(id);
        flushDirtyJournalToStorage(true);
        refreshSyncState(reason);
        scheduleBackoffRetry();
        if (!opts?.silentErrorToast) notifySyncError(reason);
        return false;
      }
    });
  };

  const persistTasksBatch = async (
    taskList: Task[],
    source: 'renderer' | 'ai_tool' | 'system' = 'renderer',
    opts?: { silentErrorToast?: boolean }
  ): Promise<boolean> => {
    if (!Array.isArray(taskList) || taskList.length === 0) return true;
    const now = Date.now();
    const revById = new Map<string, number>();
    const payloads: Task[] = [];

    for (const t of taskList) {
      if (!t || !t.id) continue;
      const rev = nextTaskRevision(t.id);
      revById.set(t.id, rev);
      const nextTs = Math.max(now, getTaskUpdatedAt(t) + 1);
      t.updatedAt = nextTs;
      t.updated_at = nextTs;
      const cloned = JSON.parse(JSON.stringify(t)) as Task;
      payloads.push(cloned);
      pendingDeleteIds.value.delete(t.id);
      dirtyUpsertIds.value.add(t.id);
      pendingUpsertPayloads.set(t.id, cloned);
      inFlightTaskIds.value.add(t.id);
    }

    if (payloads.length === 0) return true;
    pendingClearAll.value = false;
    refreshSyncState();

    const api = getApi();
    const batcher = api?.tasksBatchUpsert || api?.tasks?.batchUpsert;
    if (typeof batcher !== 'function') {
      const reason = 'IPC tasksBatchUpsert unavailable';
      for (const p of payloads) inFlightTaskIds.value.delete(p.id);
      flushDirtyJournalToStorage(true);
      refreshSyncState(reason);
      scheduleBackoffRetry();
      if (!opts?.silentErrorToast) notifySyncError(reason);
      return false;
    }

    try {
      const res = await invokeWithTimeout<any>(
        () => batcher(JSON.parse(JSON.stringify(payloads)), source),
        syncTimeoutMs,
        'tasks:batch-upsert'
      );

      const failedIds = new Set<string>(
        Array.isArray(res?.failed)
          ? res.failed.map((f: any) => f?.id).filter((id: any): id is string => typeof id === 'string' && id.length > 0)
          : []
      );
      const savedList = res && Array.isArray(res.tasks) ? upgradeTasksSchema(res.tasks) : [];
      const ackedIds = new Set<string>();

      for (const saved of savedList) {
        if (!revById.has(saved.id) || failedIds.has(saved.id)) continue;
        ackedIds.add(saved.id);
        lastSyncedSnapshotMap.set(saved.id, serializeTaskForDiff(saved));

        if ((taskRevisionMap.get(saved.id) ?? 0) === revById.get(saved.id) && !pendingDeleteIds.value.has(saved.id)) {
          const idx = tasks.value.findIndex(x => x.id === saved.id);
          if (idx !== -1) {
            tasks.value[idx] = saved;
          }
          dirtyUpsertIds.value.delete(saved.id);
          pendingUpsertPayloads.delete(saved.id);
        }
      }

      for (const p of payloads) {
        inFlightTaskIds.value.delete(p.id);
      }

      const allAcked =
        Boolean(res?.success) &&
        failedIds.size === 0 &&
        payloads.every(p => ackedIds.has(p.id));

      if (!allAcked) {
        const reason = typeof res?.error === 'string' && res.error ? res.error : 'Partial or rejected batch upsert';
        flushDirtyJournalToStorage(true);
        refreshSyncState(reason);
        scheduleBackoffRetry();
        if (!opts?.silentErrorToast) notifySyncError(reason);
        return false;
      }

      flushDirtyJournalToStorage(false);
      refreshSyncState(hasUnsyncedChanges.value ? lastSyncError.value : null);
      return true;
    } catch (err: any) {
      const reason = err?.message || String(err);
      console.warn('[tasks.store] IPC tasksBatchUpsert failed:', reason);
      for (const p of payloads) {
        inFlightTaskIds.value.delete(p.id);
      }
      flushDirtyJournalToStorage(true);
      refreshSyncState(reason);
      scheduleBackoffRetry();
      if (!opts?.silentErrorToast) notifySyncError(reason);
      return false;
    }
  };

  const persistClearAll = async (opts?: { silentErrorToast?: boolean }): Promise<boolean> => {
    pendingClearAll.value = true;
    dirtyUpsertIds.value.clear();
    pendingUpsertPayloads.clear();
    pendingDeleteIds.value.clear();
    refreshSyncState();

    // Drain any active per-task ops before running global clear
    if (perTaskQueueMap.size > 0) {
      await Promise.allSettled(Array.from(perTaskQueueMap.values()));
    }

    const api = getApi();
    const clearer = api?.tasksClearAll || api?.tasks?.clearAll;
    if (typeof clearer !== 'function') {
      const reason = 'IPC tasksClearAll unavailable';
      flushDirtyJournalToStorage(true);
      refreshSyncState(reason);
      scheduleBackoffRetry();
      if (!opts?.silentErrorToast) notifySyncError(reason);
      return false;
    }

    try {
      const res = await invokeWithTimeout<any>(() => clearer(), syncTimeoutMs, 'tasks:clear-all');
      const acked = typeof res === 'object' && res !== null ? res.success === true : Boolean(res);
      if (!acked) {
        throw new Error(typeof res === 'object' && res?.error ? res.error : 'Clear all rejected');
      }
      lastSyncedSnapshotMap.clear();
      pendingClearAll.value = false;
      flushDirtyJournalToStorage(false);
      refreshSyncState(null);
      return true;
    } catch (err: any) {
      const reason = err?.message || String(err);
      console.warn('[tasks.store] IPC tasksClearAll failed:', reason);
      flushDirtyJournalToStorage(true);
      refreshSyncState(reason);
      scheduleBackoffRetry();
      if (!opts?.silentErrorToast) notifySyncError(reason);
      return false;
    }
  };

  // Two-pass diff-sync callback for protected composables (no full-replace DELETE FROM, ACK-verified)
  const saveTasks = async (): Promise<boolean> => {
    const currentList = tasks.value || [];
    const currentIds = new Set<string>();

    // Pass 1: Upsert only newly added, modified, or still-dirty tasks
    const toUpsert: Task[] = [];
    for (const t of currentList) {
      if (!t || !t.id) continue;
      currentIds.add(t.id);
      const currentSnap = serializeTaskForDiff(t);
      const prevSnap = lastSyncedSnapshotMap.get(t.id);
      if (prevSnap !== currentSnap || dirtyUpsertIds.value.has(t.id)) {
        toUpsert.push(t);
      }
    }

    // Pass 2: Delete tasks still present in SQLite snapshot or pending delete set, missing from tasks.value
    const deleteSet = new Set<string>();
    for (const prevId of lastSyncedSnapshotMap.keys()) {
      if (!currentIds.has(prevId)) {
        deleteSet.add(prevId);
      }
    }
    for (const pendingDelId of pendingDeleteIds.value) {
      if (!currentIds.has(pendingDelId)) {
        deleteSet.add(pendingDelId);
      }
    }
    const toDeleteIds = Array.from(deleteSet);

    if (toUpsert.length === 0 && toDeleteIds.length === 0 && !pendingClearAll.value) {
      return true;
    }

    const upsertResults = await Promise.all(toUpsert.map(t => persistTaskUpsert(t)));
    const deleteResults = await Promise.all(toDeleteIds.map(id => persistTaskDelete(id)));
    const clearResult = pendingClearAll.value ? await persistClearAll() : true;

    return upsertResults.every(Boolean) && deleteResults.every(Boolean) && clearResult;
  };

  const retryPendingSync = async (opts?: { isAutoRetry?: boolean }): Promise<boolean> => {
    clearRetryTimer();
    if (!opts?.isAutoRetry) {
      retryAttempts = 0;
    }
    if (!hasUnsyncedChanges.value) {
      refreshSyncState(null);
      return true;
    }

    isRetrying = true;
    let shouldScheduleNext = false;
    try {
      if (pendingClearAll.value) {
        const cleared = await persistClearAll({ silentErrorToast: opts?.isAutoRetry });
        if (!cleared) {
          shouldScheduleNext = hasUnsyncedChanges.value;
        }
        return cleared;
      }

      const upsertsToRetry: Task[] = [];
      for (const id of dirtyUpsertIds.value) {
        const candidate = tasks.value.find(t => t.id === id) || pendingUpsertPayloads.get(id);
        if (candidate) {
          upsertsToRetry.push(candidate);
        }
      }
      const deletesToRetry = Array.from(pendingDeleteIds.value);

      const upsertResults = await Promise.all(
        upsertsToRetry.map(t => persistTaskUpsert(t, { silentErrorToast: true }))
      );
      const deleteResults = await Promise.all(
        deletesToRetry.map(id => persistTaskDelete(id, { silentErrorToast: true }))
      );

      const allOk = upsertResults.every(Boolean) && deleteResults.every(Boolean);
      if (allOk && !hasUnsyncedChanges.value) {
        refreshSyncState(null);
        return true;
      }
      if (!opts?.isAutoRetry && lastSyncError.value) {
        notifySyncError(lastSyncError.value);
      }
      shouldScheduleNext = hasUnsyncedChanges.value;
      return false;
    } finally {
      isRetrying = false;
      if (shouldScheduleNext) {
        scheduleBackoffRetry();
      }
    }
  };

  const applyIncomingTaskUpsert = (rawTask: any) => {
    if (!rawTask || !rawTask.id) return;
    const [incoming] = upgradeTasksSchema([rawTask]);

    // Never resurrect a task that is locally queued for deletion or has dirty local edits pending ACK
    if (pendingDeleteIds.value.has(incoming.id)) {
      return;
    }

    const localIdx = tasks.value.findIndex(t => t.id === incoming.id);
    if (localIdx === -1) {
      tasks.value.unshift(incoming);
      lastSyncedSnapshotMap.set(incoming.id, serializeTaskForDiff(incoming));
      return;
    }

    const incTs = getTaskUpdatedAt(incoming);
    const locTs = getTaskUpdatedAt(tasks.value[localIdx]);

    if (incTs <= locTs || dirtyUpsertIds.value.has(incoming.id)) {
      return;
    }

    tasks.value[localIdx] = incoming;
    lastSyncedSnapshotMap.set(incoming.id, serializeTaskForDiff(incoming));
  };

  const handleTasksChangedBroadcast = async (payload: TaskChangedPayload) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.action === 'created' || payload.action === 'updated' || payload.action === 'completed') {
      if (payload.task) {
        applyIncomingTaskUpsert(payload.task);
      }
      return;
    }

    if (payload.action === 'deleted') {
      if (payload.id) {
        if (!dirtyUpsertIds.value.has(payload.id)) {
          tasks.value = tasks.value.filter(t => t.id !== payload.id);
        }
        lastSyncedSnapshotMap.delete(payload.id);
        pendingDeleteIds.value.delete(payload.id);
        flushDirtyJournalToStorage(false);
      }
      return;
    }

    if (payload.action === 'batch') {
      if (Array.isArray(payload.tasks)) {
        for (const item of payload.tasks) {
          applyIncomingTaskUpsert(item);
        }
      }
      return;
    }

    if (payload.action === 'reload') {
      let incomingList: any[] | null = Array.isArray(payload.tasks) ? payload.tasks : null;
      if (!incomingList) {
        const api = getApi();
        const lister = api?.tasksList || api?.tasks?.list;
        if (lister) {
          try {
            const dbTasks = await lister();
            if (Array.isArray(dbTasks)) {
              incomingList = dbTasks;
            }
          } catch (err) {
            console.warn('[tasks.store] Failed to reload tasks on broadcast:', err);
          }
        }
      }
      if (incomingList) {
        const upgraded = upgradeTasksSchema(incomingList);
        rebuildSyncedSnapshotMap(upgraded);
        // Preserve pending local deletes and dirty local upserts over reload
        const preserved = upgraded.filter(t => !pendingDeleteIds.value.has(t.id));
        for (const dirtyId of dirtyUpsertIds.value) {
          const localDirty = pendingUpsertPayloads.get(dirtyId) || tasks.value.find(t => t.id === dirtyId);
          if (localDirty) {
            const idx = preserved.findIndex(t => t.id === dirtyId);
            if (idx !== -1) preserved[idx] = localDirty;
            else preserved.unshift(localDirty);
          }
        }
        tasks.value = pendingClearAll.value ? [] : preserved;
      }
    }
  };

  const setupTasksChangedListener = () => {
    if (activeTasksChangedUnsubscribe) {
      try {
        activeTasksChangedUnsubscribe();
      } catch (_) {}
      activeTasksChangedUnsubscribe = null;
    }
    const api = getApi();
    const subscriber = api?.onTasksChanged || api?.tasks?.onChanged;
    if (typeof subscriber === 'function') {
      const unsub = subscriber((payload: TaskChangedPayload) => {
        void handleTasksChangedBroadcast(payload);
      });
      if (typeof unsub === 'function') {
        activeTasksChangedUnsubscribe = unsub;
      }
    }
  };

  const handleBeforeUnload = () => {
    if (hasUnsyncedChanges.value || inFlightTaskIds.value.size > 0) {
      flushDirtyJournalToStorage(true);
    }
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
  }

  onScopeDispose(() => {
    clearRetryTimer();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    }
    if (activeTasksChangedUnsubscribe) {
      try {
        activeTasksChangedUnsubscribe();
      } catch (_) {}
      activeTasksChangedUnsubscribe = null;
    }
  });

  const doLoadTasksFromStorageOrDB = async () => {
    const api = getApi();
    const journal = readPendingTasksJournal();

    // Load Objectives first to have them available for filtering
    if (api?.objectiveGetAll) {
      try {
        const objList = await api.objectiveGetAll();
        if (Array.isArray(objList)) {
          objectives.value = objList;
        }
      } catch (err) {
        console.warn('[tasks.store] Failed to load objectives:', err);
      }
    }

    const lister = api?.tasksList || api?.tasks?.list;
    const hasIpc = typeof lister === 'function';
    let dbTasks: any[] | null = null;
    let ipcListError: string | null = null;

    if (hasIpc) {
      try {
        const rawList = await invokeWithTimeout(() => lister(), syncTimeoutMs, 'tasks:list');
        if (Array.isArray(rawList)) {
          dbTasks = rawList;
        } else {
          ipcListError = 'Invalid tasks:list payload';
        }
      } catch (e: any) {
        ipcListError = e?.message || String(e);
        console.warn('[tasks.store] IPC list failed, retaining local/journal state:', ipcListError);
      }
    }

    if (dbTasks !== null) {
      const upgradedDbTasks = upgradeTasksSchema(dbTasks);
      rebuildSyncedSnapshotMap(upgradedDbTasks);

      // Reconcile pending clear-all journal if present
      if (journal.clearAll) {
        tasks.value = [];
        pendingClearAll.value = true;
        refreshSyncState();
        await persistClearAll({ silentErrorToast: true });
        return;
      }

      // Legacy one-time seed ONLY when SQLite is empty and no pending dirty journal exists
      if (upgradedDbTasks.length === 0 && !hasPendingJournalEntries(journal)) {
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_operational_tasks') : null;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const sanitized = parsed.filter((t: any) => t.text && !/^(14|1314|141|1414|test)$/i.test(t.text.trim()));
              tasks.value = sanitized.length > 0 ? upgradeTasksSchema(sanitized) : getDefaultSampleTasks();
            } else {
              tasks.value = getDefaultSampleTasks();
            }
          } catch {
            tasks.value = getDefaultSampleTasks();
          }
        } else {
          tasks.value = getDefaultSampleTasks();
        }

        const batcher = api?.tasksBatchUpsert || api?.tasks?.batchUpsert;
        if (typeof batcher === 'function') {
          await persistTasksBatch(tasks.value, 'system', { silentErrorToast: true });
        } else {
          for (const t of tasks.value) {
            dirtyUpsertIds.value.add(t.id);
            pendingUpsertPayloads.set(t.id, JSON.parse(JSON.stringify(t)));
          }
          flushDirtyJournalToStorage(true);
          refreshSyncState('IPC tasksBatchUpsert unavailable');
        }
        return;
      }

      // Authoritative DB loaded + reconcile any pending journal deletes/upserts
      const dbIds = new Set(upgradedDbTasks.map(t => t.id));
      const deleteSet = new Set(journal.deletes);
      let merged = upgradedDbTasks.filter(t => !deleteSet.has(t.id));

      const replayDeletes: string[] = [];
      for (const delId of deleteSet) {
        if (dbIds.has(delId)) {
          pendingDeleteIds.value.add(delId);
          replayDeletes.push(delId);
        }
      }

      const replayUpserts: Task[] = [];
      for (const [id, rawPending] of Object.entries(journal.upserts)) {
        if (deleteSet.has(id)) continue;
        const [upgradedPending] = upgradeTasksSchema([rawPending]);
        const existingIdx = merged.findIndex(t => t.id === id);
        if (existingIdx !== -1) {
          merged[existingIdx] = upgradedPending;
        } else {
          merged.unshift(upgradedPending);
        }
        dirtyUpsertIds.value.add(id);
        pendingUpsertPayloads.set(id, JSON.parse(JSON.stringify(upgradedPending)));
        replayUpserts.push(upgradedPending);
      }

      tasks.value = merged;

      if (replayDeletes.length > 0 || replayUpserts.length > 0) {
        refreshSyncState();
        await Promise.allSettled([
          ...replayUpserts.map(t => persistTaskUpsert(t, { silentErrorToast: true })),
          ...replayDeletes.map(id => persistTaskDelete(id, { silentErrorToast: true }))
        ]);
        flushDirtyJournalToStorage(hasUnsyncedChanges.value);
      } else {
        clearPendingTasksJournal();
        refreshSyncState(null);
      }
      return;
    }

    // IPC list failed or unavailable: reconstruct from legacy storage + dirty journal without pretending synced
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_operational_tasks') : null;
    let baseList: Task[] = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed.filter((t: any) => t.text && !/^(14|1314|141|1414|test)$/i.test(t.text.trim()));
          baseList = sanitized.length > 0 ? upgradeTasksSchema(sanitized) : getDefaultSampleTasks();
        } else {
          baseList = getDefaultSampleTasks();
        }
      } catch {
        baseList = getDefaultSampleTasks();
      }
    } else {
      baseList = getDefaultSampleTasks();
    }

    const deleteSet = new Set(journal.deletes);
    if (journal.clearAll) {
      baseList = [];
      pendingClearAll.value = true;
    } else {
      baseList = baseList.filter(t => !deleteSet.has(t.id));
      for (const delId of deleteSet) {
        pendingDeleteIds.value.add(delId);
      }
      for (const [id, rawPending] of Object.entries(journal.upserts)) {
        if (deleteSet.has(id)) continue;
        const [upgradedPending] = upgradeTasksSchema([rawPending]);
        const idx = baseList.findIndex(t => t.id === id);
        if (idx !== -1) baseList[idx] = upgradedPending;
        else baseList.unshift(upgradedPending);
        dirtyUpsertIds.value.add(id);
        pendingUpsertPayloads.set(id, JSON.parse(JSON.stringify(upgradedPending)));
      }
    }

    tasks.value = baseList;
    lastSyncedSnapshotMap.clear();
    if (ipcListError) {
      refreshSyncState(ipcListError);
    } else if (hasUnsyncedChanges.value) {
      refreshSyncState('IPC tasksList unavailable');
    }
  };

  const loadTasksFromStorageOrDB = async (): Promise<void> => {
    if (inFlightLoadPromise) {
      return inFlightLoadPromise;
    }
    inFlightLoadPromise = doLoadTasksFromStorageOrDB().finally(() => {
      inFlightLoadPromise = null;
    });
    return inFlightLoadPromise;
  };

  setupTasksChangedListener();

  if (!isTasksLoaded.value) {
    isTasksLoaded.value = true;
    void loadTasksFromStorageOrDB();
  }

  const {
    activeFilter,
    searchQuery,
    sortBy,
    completedCount,
    activeCount,
    completionRatio,
    filteredTasks,
    filterCount
  } = useTaskFilters(tasks);

  const {
    totalEstimatedMinutes,
    totalSpentMinutes,
    getPriorityCount,
    getPriorityRatio,
    getCategoryCount,
    getOverdueCount,
    getDueTodayCount,
    noDueDateCount,
    notStartedCount,
    largeNoPlanCount
  } = useTaskTelemetry(tasks);

  const {
    activeFocusTaskId,
    sprintDurationMinutes,
    sprintTimeRemaining,
    isSprintRunning,
    activeFocusTask,
    startFocusSprint,
    toggleSprintTimer,
    resetSprintTimer,
    setSprintDurationMinutes,
    adjustSprintTime,
    setCustomSprintSeconds
  } = useFocusSprint(tasks, saveTasks, viewMode, expandedTaskId);

  const {
    restTimeRemaining,
    isRestRunning,
    activeRestSubtaskName,
    startRestTimer,
    toggleRestTimer,
    stopRestTimer,
    adjustRestTime,
    isWorkoutText,
    setSubtaskRestSeconds,
    setAllSubtasksRestSeconds
  } = useRestTimer(tasks, saveTasks);

  const { loadPresetTemplate } = usePresetTemplates(tasks, saveTasks);

  const {
    categories,
    categoryOptions,
    getCategoryName,
    addCategory,
    deleteCategory,
    getCategoryStyles
  } = useCategories();

  const { decomposingTaskId, decomposeTaskWithAI } = useAiDecomposition(tasks, saveTasks);

  const { exportTasks, exportTasksCSV, triggerReset: runReset } = useTaskExport(tasks, saveTasks, getCategoryName);
  const { parseSmartTaskInput } = useTaskParser(categories, addCategory);
  const { playCompletionChime } = useTaskSounds();

  // Form Bindings
  const newTaskText = ref('');
  const newTaskPriority = ref<'low' | 'medium' | 'high'>('medium');
  const newTaskCategory = ref<string>('general');
  const newTaskDueDate = ref<string>('');
  const newTaskRecurrence = ref<RecurrenceRule | undefined>(undefined);
  const newTaskEstimatedMinutes = ref<number>(30);
  const newTaskImportance = ref<EisenhowerQuadrant>('regular');

  const newSubtaskText = reactive<Record<string, string>>({});

  const translations = computed(() => {
    const isEn = settingsStore.language === 'EN';
    return {
      systemLevel: isEn ? 'TASK MANAGEMENT' : 'УПРАВЛЕНИЕ ЗАДАЧАМИ',
      title: isEn ? 'OPERATIONAL TASK CENTER' : 'ОПЕРАЦИОННЫЙ ЦЕНТР ЗАДАЧ',
      completed: isEn ? 'COMPLETED' : 'ВЫПОЛНЕНО',
      placeholder: isEn ? 'What needs to be done? (e.g. Prepare report tomorrow !high #work)' : 'Что нужно сделать? (например: Подготовить отчет завтра !high #работа)',
      priority: isEn ? 'PRIO:' : 'ПРИОРИТЕТ:',
      add: isEn ? 'Add task' : 'Добавить задачу',
      all: isEn ? 'All Operations' : 'Все операции',
      active: isEn ? 'In Progress' : 'В работе',
      done: isEn ? 'Resolved' : 'Завершенные',
      clearCompleted: isEn ? 'Clear Resolved' : 'Сбросить выполненные',
      emptyTitle: isEn ? 'Operational log is clean' : 'Операционный журнал чист',
      emptyCompletedDesc: isEn ? 'No resolved tasks recorded in this cluster.' : 'Нет записей о выполненных задачах в этом кластере.',
      emptyActiveDesc: isEn ? 'Zero active threads detected. Excellent performance.' : 'Активные потоки не обнаружены. Отличные показатели производительности.',
      emptyAllDesc: isEn ? 'Operational sequence pool is empty. Initiate a new node above.' : 'Пул операционных последовательностей пуст. Инициируйте новый узел выше.',
      deleteTask: isEn ? 'Terminate node' : 'Прервать узел',
      searchPlaceholder: isEn ? 'Search...' : 'Поиск...',
      category: isEn ? 'CATEGORY:' : 'КАТЕГОРИЯ:',
      dueDate: isEn ? 'DUE:' : 'СРОК:',
      subtasks: isEn ? 'SUBTASKS & STEPS' : 'ПОДЗАДАЧИ И ШАГИ',
      notes: isEn ? 'DESCRIPTION & NOTES' : 'ОПИСАНИЕ И ЗАМЕТКИ',
      telemetryTitle: isEn ? 'TASK OVERVIEW & ANALYTICS' : 'ОБЗОР И АНАЛИТИКА ЗАДАЧ',
      cognitiveLoad: isEn ? 'TASK PROGRESS' : 'ПРОГРЕСС ЗАДАЧ',
      priorityDistribution: isEn ? 'PRIORITY DISTRIBUTION' : 'РАСПРЕДЕЛЕНИЕ ПО ПРИОРИТЕТАМ',
      sectorDistribution: isEn ? 'CATEGORY DISTRIBUTION' : 'РАСПРЕДЕЛЕНИЕ ПО КАТЕГОРИЯМ',
      systemActions: isEn ? 'EXPORT & SYSTEM ACTIONS' : 'ЭКСПОРТ И ДЕЙСТВИЯ',
      addSubtask: isEn ? 'New step... (Enter)' : 'Новый шаг... (Enter)',
      aiDecompose: isEn ? '⚡ AI AUTO-DECOMPOSE' : '⚡ ИИ АВТО-ДЕКОМПОЗИЦИЯ',
      sprintFocus: isEn ? 'START FOCUS SPRINT' : 'ЗАПУСК СПРИНТА ФОКУСА',
      eisenhowerMode: isEn ? 'EISENHOWER 2X2' : 'МАТРИЦА 2X2',
      kanbanMode: isEn ? 'KANBAN BOARD' : 'КАНБАН ДОСКА',
      listMode: isEn ? 'TACTICAL LIST' : 'СПИСОК',
      sprintMode: isEn ? 'FOCUS SPRINT' : 'ПОМОДОРО СПРИНТ'
    };
  });

  const updateTaskTitle = (taskId: string, newTitle: string) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task && newTitle.trim() && task.text !== newTitle.trim()) {
      task.text = newTitle.trim();
      void persistTaskUpsert(task);
    }
  };

  const updateTaskDescription = (taskId: string, newDescription: string) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task && task.description !== newDescription) {
      task.description = newDescription;
      void persistTaskUpsert(task);
    }
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (status === 'done') {
        task.completed = true;
        task.completedAt = Date.now();
      } else {
        task.completed = false;
        delete task.completedAt;
      }
      void persistTaskUpsert(task);
    }
  };

  const updateTaskImportance = (taskId: string, importance: EisenhowerQuadrant) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task) {
      task.importance = importance;
      void persistTaskUpsert(task);
    }
  };

  const getDueDateClass = (dueDateStr: string, completed: boolean) => {
    if (completed) return 'text-[var(--arc-text-muted)]';
    const todayStr = new Date().toISOString().split('T')[0];
    if (dueDateStr < todayStr) return 'text-[var(--status-err)] font-semibold';
    if (dueDateStr === todayStr) return 'text-[var(--status-warn)] font-medium';
    return 'text-[var(--arc-text-hint)]';
  };

  const formatDueDateStatus = (dueDateStr: string, completed: boolean) => {
    const isEn = settingsStore.language === 'EN';
    if (completed) return isEn ? 'Done' : 'Готово';
    const todayStr = new Date().toISOString().split('T')[0];
    const [tY, tM, tD] = todayStr.split('-').map(Number);
    const [dY, dM, dD] = dueDateStr.split('-').map(Number);
    if (!dY || !dM || !dD) return dueDateStr;

    const today = new Date(tY, tM - 1, tD);
    const due = new Date(dY, dM - 1, dD);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return isEn ? 'Today' : 'Сегодня';
    if (diffDays === 1) return isEn ? 'Tomorrow' : 'Завтра';
    if (diffDays === -1) return isEn ? 'Yesterday' : 'Вчера';
    if (diffDays < -1 && diffDays >= -7) {
      return isEn ? `${Math.abs(diffDays)}d ago` : `${Math.abs(diffDays)} дн. назад`;
    }
    if (diffDays > 1 && diffDays <= 7) {
      return isEn ? `in ${diffDays}d` : `Через ${diffDays} дн.`;
    }
    return due.toLocaleDateString(isEn ? 'en-US' : 'ru-RU', {
      day: 'numeric',
      month: 'short'
    }).replace('.', '');
  };

  const getCompletedSubtasksCount = (task: Task) => {
    if (!task.subtasks) return 0;
    return (task.subtasks || []).filter(st => st.completed).length;
  };

  const getSubtasksPercent = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return 0;
    return Math.round((getCompletedSubtasksCount(task) / task.subtasks.length) * 100);
  };

  const addSubtask = (taskId: string, explicitText?: string, restSeconds?: number) => {
    const text = explicitText !== undefined ? explicitText.trim() : newSubtaskText[taskId]?.trim();
    if (!text) return;

    const task = tasks.value.find(t => t.id === taskId);
    if (task) {
      if (!task.subtasks) task.subtasks = [];
      task.subtasks.push({
        id: 'sub-' + Math.random().toString(36).substring(2, 9),
        text,
        completed: false,
        ...(restSeconds && restSeconds > 0 ? { restSeconds } : {})
      });
      if (explicitText === undefined) {
        newSubtaskText[taskId] = '';
      }

      if (task.completed) {
        task.completed = false;
        task.status = 'todo';
        delete task.completedAt;
      }

      void persistTaskUpsert(task);
    }
  };

  const toggleSubtask = (taskId: string, subId: string) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task && task.subtasks) {
      const sub = task.subtasks.find(st => st.id === subId);
      if (sub) {
        sub.completed = !sub.completed;

        if (sub.completed) {
          const restSecs = sub.restSeconds !== undefined 
            ? sub.restSeconds 
            : (task.autoRestSeconds || (isWorkoutText(task.text, sub.text) ? 60 : 0));
          
          if (restSecs > 0) {
            startRestTimer(restSecs, sub.text);
          }
        }

        if (task.subtasks.length > 0 && task.subtasks.every(st => st.completed)) {
          if (!task.completed) {
            task.completed = true;
            task.status = 'done';
            task.completedAt = Date.now();
          }
        } else {
          if (task.completed) {
            task.completed = false;
            task.status = 'todo';
            delete task.completedAt;
          }
        }

        void persistTaskUpsert(task);
      }
    }
  };

  const deleteSubtask = (taskId: string, subId: string) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task && task.subtasks) {
      const originalSubtasks = [...task.subtasks];
      task.subtasks = (task.subtasks || []).filter(st => st.id !== subId);

      if (task.subtasks.length > 0 && task.subtasks.every(st => st.completed)) {
        if (!task.completed) {
          task.completed = true;
          task.status = 'done';
          task.completedAt = Date.now();
        }
      }

      const p = persistTaskUpsert(task).then(Boolean);
      confirmSyncToast(
        p,
        settingsStore.language === 'EN' ? '✦ Subtask deleted' : '✦ Подзадача удалена',
        () => {
          const t = tasks.value.find(x => x.id === taskId);
          if (t) {
            t.subtasks = originalSubtasks;
            void persistTaskUpsert(t);
          }
        }
      );
    }
  };

  const reorderSubtask = (taskId: string, subId: string, direction: 'up' | 'down') => {
    const task = tasks.value.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const idx = task.subtasks.findIndex(st => st.id === subId);
    if (idx === -1) return;

    if (direction === 'up' && idx > 0) {
      const temp = task.subtasks[idx];
      task.subtasks[idx] = task.subtasks[idx - 1];
      task.subtasks[idx - 1] = temp;
      void persistTaskUpsert(task);
    } else if (direction === 'down' && idx < task.subtasks.length - 1) {
      const temp = task.subtasks[idx];
      task.subtasks[idx] = task.subtasks[idx + 1];
      task.subtasks[idx + 1] = temp;
      void persistTaskUpsert(task);
    }
  };

  const applyStepTemplate = (taskId: string, templateType: 'qa' | 'release' | 'tz' | 'dev') => {
    const task = tasks.value.find(t => t.id === taskId);
    if (!task) return;

    if (!task.subtasks) task.subtasks = [];

    const isEn = settingsStore.language === 'EN';
    const templates: Record<string, string[]> = {
      qa: isEn ? [
        'Run automated unit tests',
        'Perform manual regression testing',
        'Verify cross-browser responsiveness',
        'Check console logs & error telemetry'
      ] : [
        'Запустить автоматические юнит-тесты',
        'Провести ручное регрессионное тестирование',
        'Проверить кроссбраузерность и адаптивность',
        'Проверить консоль и логи на ошибки'
      ],
      release: isEn ? [
        'Prepare build artifact & version tag',
        'Run lint & type checks',
        'Backup database / memory state',
        'Deploy to staging & verify',
        'Publish release notes'
      ] : [
        'Подготовить релизный дистрибутив и тег версии',
        'Провести проверку типов и линтинг',
        'Создать резервную копию базы/памяти',
        'Выполнить деплой на тестовый стенд',
        'Опубликовать описание релиза'
      ],
      tz: isEn ? [
        'Gather target requirements & scope',
        'Define architecture & API schema',
        'Estimate time & resource constraints',
        'Review with team lead'
      ] : [
        'Сформулировать требования и рамки задачи',
        'Описать архитектуру и схемы API',
        'Оценить временные и ресурсные затраты',
        'Согласовать план реализации'
      ],
      dev: isEn ? [
        'Create feature branch',
        'Implement core data models',
        'Build responsive UI views',
        'Integrate state management & handlers',
        'Code review & merge request'
      ] : [
        'Создать ветку в репозитории',
        'Реализовать базовые структуры данных',
        'Сверстать интерфейсные компоненты',
        'Связать состояния и обработчики',
        'Провести код-ревью и слить изменения'
      ]
    };

    const steps = templates[templateType] || [];
    steps.forEach(text => {
      task.subtasks?.push({
        id: 'sub-' + Math.random().toString(36).substring(2, 9),
        text,
        completed: false
      });
    });

    if (task.completed) {
      task.completed = false;
      task.status = 'todo';
      delete task.completedAt;
    }

    const p = persistTaskUpsert(task).then(Boolean);
    confirmSyncToast(
      p,
      isEn ? '✦ Step template applied' : '✦ Шаблон шагов применен',
      () => {}
    );
  };

  const addTask = (
    explicitText?: string,
    explicitPriority?: 'low' | 'medium' | 'high',
    explicitCategory?: string,
    explicitDueDate?: string,
    explicitObjectiveId?: string
  ) => {
    const raw = explicitText !== undefined ? explicitText.trim() : newTaskText.value.trim();
    if (!raw) return;

    const parsed = parseSmartTaskInput(raw);
    const finalTitle = parsed.cleanedText || raw;
    const prio = explicitPriority || parsed.parsedPriority || newTaskPriority.value;
    const now = Date.now();

    const task: Task = {
      id: 'task-' + Math.random().toString(36).substring(2, 9),
      text: finalTitle,
      description: '',
      completed: false,
      createdAt: now,
      updatedAt: now,
      updated_at: now,
      priority: prio,
      category: explicitCategory || parsed.parsedCategory || newTaskCategory.value,
      dueDate: explicitDueDate || parsed.parsedDueDate || newTaskDueDate.value || undefined,
      recurrence: newTaskRecurrence.value ? JSON.parse(JSON.stringify(newTaskRecurrence.value)) : undefined,
      isMyDay: parsed.parsedIsMyDay || (activeFilter.value === 'my_day'),
      subtasks: [],
      status: 'todo',
      importance: prio === 'high' ? 'urgent-important' : (newTaskImportance.value || 'regular'),
      estimatedMinutes: newTaskEstimatedMinutes.value || 30,
      spentMinutes: 0,
      objectiveId: explicitObjectiveId
    };

    tasks.value.unshift(task);
    const p = persistTaskUpsert(task).then(Boolean);
    if (explicitText === undefined) {
      newTaskText.value = '';
      newTaskDueDate.value = '';
      newTaskRecurrence.value = undefined;
    }

    confirmSyncToast(
      p,
      settingsStore.language === 'EN' ? '✦ Task added successfully' : '✦ Задача успешно добавлена',
      () => {
        tasks.value = tasks.value.filter(t => t.id !== task.id);
        void persistTaskDelete(task.id);
      }
    );

    newTaskText.value = '';
    newTaskDueDate.value = '';
    newTaskRecurrence.value = undefined;
    return task;
  };

  const toggleTask = (id: string) => {
    const now = Date.now();
    const lastTime = lastToggleMap.get(id) || 0;
    // BLOCK 3: Double-click guard (ignore rapid consecutive clicks within 1000ms)
    if (now - lastTime < 1000) {
      console.log(`[tasks.store] Double-click guarded for task ${id}`);
      return;
    }
    lastToggleMap.set(id, now);

    const task = tasks.value.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      const originalCompleted = !task.completed;
      const originalSubtasksState = task.subtasks ? task.subtasks.map(st => ({ id: st.id, completed: st.completed })) : [];
      let newRecurringTask: Task | undefined;
      
      if (task.completed) {
        playCompletionChime();
        task.completedAt = Date.now();
        task.status = 'done';
        if (task.subtasks) {
          task.subtasks.forEach(st => st.completed = true);
        }
        // Handle recurrence
        if (task.recurrence && task.recurrence.type !== 'none' && task.dueDate) {
          const rule = task.recurrence;
          let shouldSpawn = true;

          if (rule.endType === 'after_occurrences') {
            const currentCount = (rule.occurrencesCount || 0) + 1;
            rule.occurrencesCount = currentCount;
            if (currentCount >= (rule.count || 1)) {
              shouldSpawn = false;
            }
          }

          if (shouldSpawn) {
            const nextDate = calculateNextRecurrenceDate(task.dueDate, rule);
            if (nextDate) {
              if (rule.endType === 'on_date' && rule.endDate && nextDate > rule.endDate) {
                shouldSpawn = false;
              } else {
                const recNow = Date.now();
                newRecurringTask = {
                  ...JSON.parse(JSON.stringify(task)),
                  id: 'task-' + Math.random().toString(36).substring(2, 9),
                  completed: false,
                  createdAt: recNow,
                  updatedAt: recNow,
                  updated_at: recNow,
                  completedAt: undefined,
                  dueDate: nextDate,
                  status: 'todo',
                  spentMinutes: 0,
                  recurrence: JSON.parse(JSON.stringify(rule))
                };
                if (newRecurringTask?.subtasks) {
                  newRecurringTask.subtasks.forEach(st => st.completed = false);
                }
                tasks.value.push(newRecurringTask as Task);
              }
            }
          }
        }
      } else {
        delete task.completedAt;
        if (task.status === 'done') task.status = 'todo';
      }
      const ackPromise = Promise.all([
        persistTaskUpsert(task),
        newRecurringTask ? persistTaskUpsert(newRecurringTask) : Promise.resolve(true)
      ]).then(([mainSaved, recSaved]) => Boolean(mainSaved) && Boolean(recSaved));

      confirmSyncToast(
        ackPromise,
        task.completed
          ? (settingsStore.language === 'EN' ? '✦ Task resolved' : '✦ Задача завершена')
          : (settingsStore.language === 'EN' ? '✦ Task active' : '✦ Задача возобновлена'),
        () => {
          const t = tasks.value.find(x => x.id === id);
          if (t) {
            t.completed = originalCompleted;
            if (originalCompleted) {
              t.completedAt = Date.now();
              t.status = 'done';
            } else {
              delete t.completedAt;
              t.status = 'todo';
            }
            if (t.subtasks) {
              t.subtasks.forEach(st => {
                const orig = originalSubtasksState.find(o => o.id === st.id);
                if (orig) st.completed = orig.completed;
              });
            }
            void persistTaskUpsert(t);
            if (newRecurringTask) {
              tasks.value = tasks.value.filter(x => x.id !== newRecurringTask?.id);
              void persistTaskDelete(newRecurringTask.id);
            }
          }
        }
      );
    }
  };

  const deleteTask = (id: string) => {
    const originalTasks = [...tasks.value];
    const taskToDelete = tasks.value.find(t => t.id === id);
    if (!taskToDelete) return;

    tasks.value = tasks.value.filter(t => t.id !== id);
    if (expandedTaskId.value === id) expandedTaskId.value = null;
    const p = persistTaskDelete(id);

    confirmSyncToast(
      p,
      settingsStore.language === 'EN' ? `✦ Task "${taskToDelete.text}" deleted` : `✦ Задача "${taskToDelete.text}" удалена`,
      () => {
        tasks.value = originalTasks;
        void persistTaskUpsert(taskToDelete);
      },
      true // critical
    );
  };

  const clearCompleted = () => {
    const originalTasks = [...tasks.value];
    const completedTasks = tasks.value.filter(t => t.completed);
    if (completedTasks.length === 0) return;
    tasks.value = tasks.value.filter(t => !t.completed);
    const ackPromise = Promise.all(
      completedTasks.map((ct, idx) => persistTaskDelete(ct.id, { silentErrorToast: idx > 0 }))
    ).then(results => results.every(Boolean));

    confirmSyncToast(
      ackPromise,
      settingsStore.language === 'EN' ? '✦ Resolved tasks cleared' : '✦ Выполненные задачи очищены',
      () => {
        tasks.value = originalTasks;
        void persistTasksBatch(completedTasks, 'renderer');
      }
    );
  };

  const toggleExpand = (id: string) => {
    expandedTaskId.value = expandedTaskId.value === id ? null : id;
  };

  // Microsoft To Do "My Day" Flag
  const toggleMyDay = (id: string) => {
    const task = tasks.value.find(t => t.id === id);
    if (task) {
      task.isMyDay = !task.isMyDay;
      const p = persistTaskUpsert(task).then(Boolean);
      const isEn = settingsStore.language === 'EN';
      confirmSyncToast(
        p,
        task.isMyDay
          ? (isEn ? '☀️ Added to My Day' : '☀️ Добавлено в "Мой день"')
          : (isEn ? 'Removed from My Day' : 'Удалено из "Мой день"'),
        () => {
          task.isMyDay = !task.isMyDay;
          void persistTaskUpsert(task);
        }
      );
    }
  };

  // Task Duplication / Cloning
  const duplicateTask = (id: string) => {
    const task = tasks.value.find(t => t.id === id);
    if (!task) return;

    const isEn = settingsStore.language === 'EN';
    const now = Date.now();
    const clone: Task = {
      ...JSON.parse(JSON.stringify(task)),
      id: 'task-' + Math.random().toString(36).substring(2, 9),
      text: `${task.text} (${isEn ? 'Copy' : 'Копия'})`,
      createdAt: now,
      updatedAt: now,
      updated_at: now,
      completed: false,
      completedAt: undefined,
      status: 'todo'
    };

    tasks.value.unshift(clone);
    const p = persistTaskUpsert(clone).then(Boolean);

    confirmSyncToast(
      p,
      isEn ? '✦ Task duplicated' : '✦ Задача склонирована',
      () => {
        tasks.value = tasks.value.filter(t => t.id !== clone.id);
        void persistTaskDelete(clone.id);
      }
    );
  };

  const triggerReset = () => {
    runReset(settingsStore.language === 'EN', (msg: string, undoCb: () => void, isCritical?: boolean) => {
      const clearPromise = tasks.value.length === 0 ? persistClearAll() : Promise.resolve(true);
      confirmSyncToast(
        clearPromise,
        msg,
        () => {
          undoCb();
          if (tasks.value.length > 0) {
            void persistTasksBatch(tasks.value, 'renderer');
          }
        },
        isCritical
      );
    });
  };

  onMounted(() => {
    const handleTimerAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action } = customEvent.detail || {};
      if (action === 'start-focus') {
        const taskId = activeFocusTaskId.value || recommendedTask.value?.id || '';
        if (!taskId) {
          const isEn = settingsStore.language === 'EN';
          const msg = isEn 
            ? "No active tasks found to start a focus sprint, sir." 
            : "Активных задач для запуска фокуса не найдено.";
          settingsStore.triggerSyncToast(msg, () => {}, true);
          uiStore.speak(msg);
          return;
        }
        startFocusSprint(taskId);
        if (!isSprintRunning.value) {
          toggleSprintTimer();
        }
      } else if (action === 'stop-focus') {
        if (isSprintRunning.value) {
          toggleSprintTimer();
        }
      } else if (action === 'start-rest') {
        startRestTimer(300, 'Заслуженный перерыв');
      } else if (action === 'stop-rest') {
        if (isRestRunning.value) {
          stopRestTimer();
        }
      }
    };

    window.addEventListener('arc:timer-action', handleTimerAction);
    onUnmounted(() => {
      window.removeEventListener('arc:timer-action', handleTimerAction);
    });
  });

  const recommendedTask = computed(() => {
    const candidates = tasks.value.filter(t => !t.completed && t.status !== 'done' && t.status !== 'blocked' && t.status !== 'deferred');
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const aOverdue = a.dueDate && a.dueDate < todayStr ? 3 : (a.dueDate === todayStr ? 2 : 1);
      const bOverdue = b.dueDate && b.dueDate < todayStr ? 3 : (b.dueDate === todayStr ? 2 : 1);
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;

      const prioWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const aP = prioWeight[a.priority || 'medium'] || 2;
      const bP = prioWeight[b.priority || 'medium'] || 2;
      if (aP !== bP) return bP - aP;

      const impWeight: Record<string, number> = { 'urgent-important': 4, 'important': 3, 'urgent': 2, 'regular': 1 };
      const aI = impWeight[a.importance || 'regular'] || 1;
      const bI = impWeight[b.importance || 'regular'] || 1;
      return bI - aI;
    })[0] || null;
  });

  const formatTime = (ts: any) => {
    if (!ts) return '';
    try {
      const d = ts instanceof Date ? ts : new Date(ts);
      if (!d || isNaN(d.getTime()) || typeof d.toLocaleTimeString !== 'function') return '';
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return {
    tasks,
    objectives,
    recommendedTask,
    expandedTaskId,
    viewMode,
    decomposingTaskId,
    activeFocusTaskId,
    activeFocusTask,
    sprintDurationMinutes,
    sprintTimeRemaining,
    isSprintRunning,
    totalEstimatedMinutes,
    totalSpentMinutes,
    newTaskText,
    newTaskPriority,
    newTaskCategory,
    newTaskDueDate,
    newTaskRecurrence,
    newTaskEstimatedMinutes,
    newTaskImportance,
    newSubtaskText,
    activeFilter,
    searchQuery,
    sortBy,
    completedCount,
    activeCount,
    completionRatio,
    translations,
    filteredTasks,
    filterCount,
    noDueDateCount,
    notStartedCount,
    largeNoPlanCount,
    formatTime,
    getPriorityCount,
    getPriorityRatio,
    getCategoryCount,
    getOverdueCount,
    getDueTodayCount,
    getCategoryStyles,
    getDueDateClass,
    formatDueDateStatus,
    getCompletedSubtasksCount,
    getSubtasksPercent,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    reorderSubtask,
    applyStepTemplate,
    addTask,
    updateTaskTitle,
    updateTaskDescription,
    toggleTask,
    deleteTask,
    clearCompleted,
    toggleExpand,
    exportTasks,
    exportTasksCSV,
    toggleMyDay,
    duplicateTask,
    parseSmartTaskInput,
    triggerReset,
    saveTasks,
    retryPendingSync,
    setSyncOptions,
    syncState,
    lastSyncError,
    dirtyTaskIds,
    pendingDeleteTaskIds,
    hasUnsyncedChanges,
    loadTasksFromStorageOrDB,
    decomposeTaskWithAI,
    startFocusSprint,
    toggleSprintTimer,
    resetSprintTimer,
    setSprintDurationMinutes,
    adjustSprintTime,
    setCustomSprintSeconds,
    restTimeRemaining,
    isRestRunning,
    activeRestSubtaskName,
    startRestTimer,
    toggleRestTimer,
    stopRestTimer,
    adjustRestTime,
    setSubtaskRestSeconds,
    setAllSubtasksRestSeconds,
    updateTaskStatus,
    updateTaskImportance,
    loadPresetTemplate,
    categories,
    categoryOptions,
    addCategory,
    deleteCategory,
    getCategoryName
  };
});
// Trigger vite cache invalidation
