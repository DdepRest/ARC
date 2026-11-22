import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTasksStore } from './tasks.store';
import type { TaskChangedPayload } from '../types';

const mockTriggerSyncToast = vi.fn();
const mockDismissSyncToast = vi.fn();

vi.mock('../../settings/stores/settings.store', () => ({
  useSettingsStore: () => ({
    language: 'RU',
    triggerSyncToast: mockTriggerSyncToast,
    dismissSyncToast: mockDismissSyncToast
  })
}));

vi.mock('../../../stores/ui.store', () => ({
  useUIStore: () => ({
    speak: vi.fn()
  })
}));

describe('useTasksStore — Granular SSOT, Diff-Sync & tasks:changed Broadcast', () => {
  let tasksChangedCallback: ((payload: TaskChangedPayload) => void) | null = null;
  let windowListeners: Record<string, Array<(e?: any) => void>> = {};
  let mockTasksList: ReturnType<typeof vi.fn>;
  let mockTasksUpsert: ReturnType<typeof vi.fn>;
  let mockTasksDelete: ReturnType<typeof vi.fn>;
  let mockTasksBatchUpsert: ReturnType<typeof vi.fn>;
  let mockTasksClearAll: ReturnType<typeof vi.fn>;
  let mockTasksSaveAll: ReturnType<typeof vi.fn>;
  let mockOnTasksChanged: ReturnType<typeof vi.fn>;

  let mockLocalStorageStore: Record<string, string> = {};
  let mockLocalStorageSetItem: ReturnType<typeof vi.fn>;

  function createDeferred<T>() {
    let resolve!: (val: T) => void;
    let reject!: (err: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    tasksChangedCallback = null;
    windowListeners = {};
    mockTriggerSyncToast.mockClear();
    mockDismissSyncToast.mockClear();
    mockLocalStorageStore = {};
    mockLocalStorageSetItem = vi.fn((key: string, val: string) => {
      mockLocalStorageStore[key] = String(val);
    });

    (globalThis as any).localStorage = {
      getItem: vi.fn((key: string) => (key in mockLocalStorageStore ? mockLocalStorageStore[key] : null)),
      setItem: mockLocalStorageSetItem,
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorageStore[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorageStore = {};
      })
    };

    mockTasksList = vi.fn().mockResolvedValue([
      {
        id: 'db-1',
        text: 'Initial DB Task 1',
        description: '',
        completed: false,
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        updated_at: 1700000001000,
        priority: 'high',
        category: 'dev',
        status: 'todo',
        importance: 'urgent-important',
        estimatedMinutes: 30,
        spentMinutes: 0,
        subtasks: []
      },
      {
        id: 'db-2',
        text: 'Initial DB Task 2',
        description: '',
        completed: false,
        createdAt: 1700000000000,
        updatedAt: 1700000002000,
        updated_at: 1700000002000,
        priority: 'medium',
        category: 'ops',
        status: 'todo',
        importance: 'regular',
        estimatedMinutes: 30,
        spentMinutes: 0,
        subtasks: []
      }
    ]);

    mockTasksUpsert = vi.fn().mockImplementation(async (t: any) => ({
      success: true,
      task: { ...t, updatedAt: (t.updatedAt || Date.now()) + 1, updated_at: (t.updatedAt || Date.now()) + 1 }
    }));

    mockTasksDelete = vi.fn().mockResolvedValue({ success: true });
    mockTasksBatchUpsert = vi.fn().mockImplementation(async (items: any[]) => ({
      success: true,
      tasks: items,
      failed: []
    }));
    mockTasksClearAll = vi.fn().mockResolvedValue({ success: true });
    mockTasksSaveAll = vi.fn().mockResolvedValue(true);

    mockOnTasksChanged = vi.fn().mockImplementation((cb: (payload: TaskChangedPayload) => void) => {
      tasksChangedCallback = cb;
      return () => {
        if (tasksChangedCallback === cb) {
          tasksChangedCallback = null;
        }
      };
    });

    (globalThis as any).window = {
      addEventListener: vi.fn((evt: string, fn: (e?: any) => void) => {
        if (!windowListeners[evt]) windowListeners[evt] = [];
        windowListeners[evt].push(fn);
      }),
      removeEventListener: vi.fn((evt: string, fn: (e?: any) => void) => {
        if (windowListeners[evt]) {
          windowListeners[evt] = windowListeners[evt].filter(cb => cb !== fn);
        }
      }),
      dispatchEvent: vi.fn((evt: { type: string }) => {
        for (const cb of windowListeners[evt.type] || []) {
          cb(evt);
        }
        return true;
      }),
      api: {
        tasksList: mockTasksList,
        tasksUpsert: mockTasksUpsert,
        tasksDelete: mockTasksDelete,
        tasksBatchUpsert: mockTasksBatchUpsert,
        tasksClearAll: mockTasksClearAll,
        tasksSaveAll: mockTasksSaveAll,
        onTasksChanged: mockOnTasksChanged,
        objectiveGetAll: vi.fn().mockResolvedValue([])
      }
    };
  });

  it('initializes lastSyncedSnapshotMap on load so first saveTasks() with no changes makes 0 IPC calls (Revision 2)', async () => {
    const store = useTasksStore();
    await store.loadTasksFromStorageOrDB();

    expect(store.tasks).toHaveLength(2);
    mockTasksUpsert.mockClear();
    mockTasksDelete.mockClear();
    mockTasksSaveAll.mockClear();

    await store.saveTasks();

    expect(mockTasksUpsert).not.toHaveBeenCalled();
    expect(mockTasksDelete).not.toHaveBeenCalled();
    expect(mockTasksSaveAll).not.toHaveBeenCalled();
  });

  it('detects deleted tasks in second pass of saveTasks() diff-sync and calls tasksDelete (Revision 1)', async () => {
    const store = useTasksStore();
    await store.loadTasksFromStorageOrDB();

    expect(store.tasks).toHaveLength(2);
    mockTasksUpsert.mockClear();
    mockTasksDelete.mockClear();

    // Simulate a protected composable removing 'db-2' from tasks.value and calling saveTasks()
    store.tasks = store.tasks.filter((t) => t.id !== 'db-2');
    await store.saveTasks();

    expect(mockTasksDelete).toHaveBeenCalledTimes(1);
    expect(mockTasksDelete).toHaveBeenCalledWith('db-2');
    expect(mockTasksUpsert).not.toHaveBeenCalled();

    // Subsequent saveTasks() must not re-delete 'db-2' because lastSyncedSnapshotMap was updated
    mockTasksDelete.mockClear();
    await store.saveTasks();
    expect(mockTasksDelete).not.toHaveBeenCalled();
  });

  it('subscribes to onTasksChanged and handles created/updated/deleted/batch without calling IPC back', async () => {
    const store = useTasksStore();
    await store.loadTasksFromStorageOrDB();

    expect(mockOnTasksChanged).toHaveBeenCalledTimes(1);
    expect(tasksChangedCallback).not.toBeNull();

    mockTasksUpsert.mockClear();
    mockTasksDelete.mockClear();
    mockTasksSaveAll.mockClear();
    mockTasksBatchUpsert.mockClear();

    // 1. Broadcast 'created' from AI tool
    tasksChangedCallback!({
      action: 'created',
      source: 'ai_tool',
      task: {
        id: 'ai-new-1',
        text: 'AI Created Task',
        completed: false,
        createdAt: 1700000005000,
        updatedAt: 1700000005000,
        updated_at: 1700000005000,
        priority: 'high',
        category: 'sec',
        subtasks: []
      }
    });

    expect(store.tasks.some((t) => t.id === 'ai-new-1')).toBe(true);

    // 2. Broadcast 'deleted'
    tasksChangedCallback!({
      action: 'deleted',
      source: 'ai_tool',
      id: 'db-2'
    });
    expect(store.tasks.some((t) => t.id === 'db-2')).toBe(false);

    // 3. Broadcast 'batch'
    tasksChangedCallback!({
      action: 'batch',
      source: 'renderer',
      tasks: [
        {
          id: 'batch-new',
          text: 'Batch Item',
          completed: false,
          createdAt: 1700000006000,
          updatedAt: 1700000006000,
          updated_at: 1700000006000,
          priority: 'low',
          category: 'ops',
          subtasks: []
        }
      ]
    });
    expect(store.tasks.some((t) => t.id === 'batch-new')).toBe(true);

    // Zero outbound IPC calls from broadcast handler (cycle protection)
    expect(mockTasksUpsert).not.toHaveBeenCalled();
    expect(mockTasksDelete).not.toHaveBeenCalled();
    expect(mockTasksSaveAll).not.toHaveBeenCalled();
    expect(mockTasksBatchUpsert).not.toHaveBeenCalled();
  });

  it('enforces updated_at conflict resolution: ignores < local, no-ops on === local, updates on > local', async () => {
    const store = useTasksStore();
    await store.loadTasksFromStorageOrDB();

    const target = store.tasks.find((t) => t.id === 'db-1')!;
    expect(target.updatedAt).toBe(1700000001000);

    // 1. Stale broadcast (updated_at < local) -> ignored
    tasksChangedCallback!({
      action: 'updated',
      source: 'ai_tool',
      task: {
        ...target,
        text: 'Stale Title',
        updatedAt: 1700000000500,
        updated_at: 1700000000500
      }
    });
    expect(store.tasks.find((t) => t.id === 'db-1')?.text).toBe('Initial DB Task 1');

    // 2. Equal timestamp (updated_at === local) -> idempotent no-op
    tasksChangedCallback!({
      action: 'updated',
      source: 'renderer',
      task: {
        ...target,
        text: 'Equal Timestamp Title',
        updatedAt: 1700000001000,
        updated_at: 1700000001000
      }
    });
    expect(store.tasks.find((t) => t.id === 'db-1')?.text).toBe('Initial DB Task 1');

    // 3. Newer timestamp (updated_at > local) -> applied
    tasksChangedCallback!({
      action: 'updated',
      source: 'ai_tool',
      task: {
        ...target,
        text: 'Fresh Title From AI',
        updatedAt: 1700000009000,
        updated_at: 1700000009000
      }
    });
    expect(store.tasks.find((t) => t.id === 'db-1')?.text).toBe('Fresh Title From AI');
    expect(store.tasks.find((t) => t.id === 'db-1')?.updatedAt).toBe(1700000009000);
  });

  it('uses granular IPC on store mutators and does not write to localStorage after seed', async () => {
    // Simulate empty SQLite DB on first run with legacy localStorage tasks
    mockTasksList.mockResolvedValueOnce([]);
    localStorage.setItem(
      'arc_operational_tasks',
      JSON.stringify([
        {
          id: 'legacy-local-1',
          text: 'Legacy Local Task',
          completed: false,
          createdAt: 1700000000000,
          priority: 'medium',
          category: 'ops',
          subtasks: []
        }
      ])
    );
    mockLocalStorageSetItem.mockClear();

    const store = useTasksStore();
    await store.loadTasksFromStorageOrDB();

    // One-time seed to SQLite via tasksBatchUpsert('system')
    expect(mockTasksBatchUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'legacy-local-1' })]),
      'system'
    );
    expect(mockLocalStorageSetItem).not.toHaveBeenCalled();

    // Mutate via store mutators
    store.updateTaskTitle('legacy-local-1', 'Updated Granularly');
    expect(mockTasksUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'legacy-local-1', text: 'Updated Granularly' })
    );
    expect(mockTasksSaveAll).not.toHaveBeenCalled();
    expect(mockLocalStorageSetItem).not.toHaveBeenCalled();

    store.deleteTask('legacy-local-1');
    await vi.waitFor(() => {
      expect(mockTasksDelete).toHaveBeenCalledWith('legacy-local-1');
    });
    expect(mockLocalStorageSetItem).not.toHaveBeenCalled();
  });

  describe('S1-05 — ACK-verified SQLite sync, dirty journal, concurrency & recovery', () => {
    it('confirms sync toast ONLY after SQLite ACK and updates snapshot map', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTriggerSyncToast.mockClear();

      const deferred = createDeferred<any>();
      mockTasksUpsert.mockReturnValueOnce(deferred.promise);

      const created = store.addTask('ACK gated task')!;
      expect(created).toBeTruthy();

      // Before ACK: dirty & syncing, confirmation toast must NOT have fired yet
      expect(store.dirtyTaskIds).toContain(created.id);
      expect(store.syncState).toBe('syncing');
      expect(store.hasUnsyncedChanges).toBe(true);
      expect(mockTriggerSyncToast).not.toHaveBeenCalled();

      deferred.resolve({
        success: true,
        task: { ...created, updatedAt: (created.updatedAt || 0) + 10, updated_at: (created.updatedAt || 0) + 10 }
      });

      await vi.waitFor(() => {
        expect(store.syncState).toBe('idle');
        expect(mockTriggerSyncToast).toHaveBeenCalledTimes(1);
      });

      expect(store.dirtyTaskIds).toEqual([]);
      expect(store.hasUnsyncedChanges).toBe(false);
      // Confirmed toast has no error variant
      expect(mockTriggerSyncToast.mock.calls[0][3]).toBeUndefined();

      // Snapshot updated -> saveTasks() makes 0 calls
      mockTasksUpsert.mockClear();
      await store.saveTasks();
      expect(mockTasksUpsert).not.toHaveBeenCalled();
    });

    it('keeps dirty state, persists journal, and shows error/retry toast on upsert { success: false } or response mismatch', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTriggerSyncToast.mockClear();

      // Case 1: explicit { success: false }
      mockTasksUpsert.mockResolvedValueOnce({ success: false, error: 'CONSTRAINT_FAIL' });
      const task = store.addTask('Unsaved task')!;

      await vi.waitFor(() => {
        expect(store.syncState).toBe('error');
      });

      expect(store.dirtyTaskIds).toContain(task.id);
      expect(store.hasUnsyncedChanges).toBe(true);
      expect(store.lastSyncError).toContain('CONSTRAINT_FAIL');
      expect(mockLocalStorageStore['arc_tasks_pending_ops_v1']).toBeTruthy();
      expect(mockTriggerSyncToast).toHaveBeenCalledWith(
        expect.stringContaining('CONSTRAINT_FAIL'),
        expect.any(Function),
        true,
        expect.objectContaining({ variant: 'error', actionLabel: 'Повторить' })
      );
      // Never shows a false synced confirmation
      expect(mockTriggerSyncToast).toHaveBeenCalledTimes(1);

      // Case 2: server response mismatch (wrong task ID returned)
      mockTriggerSyncToast.mockClear();
      mockTasksUpsert.mockResolvedValueOnce({
        success: true,
        task: { ...task, id: 'wrong-id-from-buggy-ipc' }
      });
      await store.saveTasks();

      expect(store.dirtyTaskIds).toContain(task.id);
      expect(store.syncState).toBe('error');
      expect(store.lastSyncError).toContain('Server response mismatch');

      // Case 3: Retry via error toast action succeeds and cleans journal
      mockTasksUpsert.mockImplementationOnce(async (t: any) => ({ success: true, task: t }));
      const retryCb = mockTriggerSyncToast.mock.calls[0][1];
      retryCb();

      await vi.waitFor(() => {
        expect(store.syncState).toBe('idle');
      });
      expect(store.hasUnsyncedChanges).toBe(false);
      expect(mockLocalStorageStore['arc_tasks_pending_ops_v1']).toBeUndefined();
    });

    it('retains dirty state when IPC throws and recovers on retryPendingSync()', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTriggerSyncToast.mockClear();

      mockTasksUpsert.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
      store.updateTaskTitle('db-1', 'Edited While Busy');

      await vi.waitFor(() => {
        expect(store.syncState).toBe('error');
      });

      expect(store.lastSyncError).toBe('SQLITE_BUSY');
      expect(store.dirtyTaskIds).toContain('db-1');
      expect(JSON.parse(mockLocalStorageStore['arc_tasks_pending_ops_v1']).upserts['db-1'].text).toBe(
        'Edited While Busy'
      );

      // Recover on manual retry
      const ok = await store.retryPendingSync();
      expect(ok).toBe(true);
      expect(store.syncState).toBe('idle');
      expect(store.hasUnsyncedChanges).toBe(false);
    });

    it('times out hanging IPC calls and protects against late stale resolution', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 25, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTriggerSyncToast.mockClear();

      const hanging = createDeferred<any>();
      mockTasksUpsert.mockReturnValueOnce(hanging.promise);

      store.updateTaskTitle('db-1', 'Timed out edit');

      await vi.waitFor(() => {
        expect(store.syncState).toBe('error');
      }, { timeout: 500 });

      expect(store.lastSyncError).toContain('IPC_TIMEOUT:tasks:upsert');
      expect(store.dirtyTaskIds).toContain('db-1');
      expect(mockTriggerSyncToast).toHaveBeenCalledWith(
        expect.stringContaining('IPC_TIMEOUT'),
        expect.any(Function),
        true,
        expect.objectContaining({ variant: 'error' })
      );

      // User edits again and it succeeds while the old hanging promise finally resolves late
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      store.updateTaskTitle('db-1', 'Fresh edit after timeout');
      await vi.waitFor(() => expect(store.syncState).toBe('idle'));

      hanging.resolve({
        success: true,
        task: { id: 'db-1', text: 'Timed out edit', completed: false, createdAt: 1, updatedAt: 9999999999999 }
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(store.tasks.find(t => t.id === 'db-1')?.text).toBe('Fresh edit after timeout');
    });

    it('tracks failed delete in pendingDeleteTaskIds, blocks stale broadcast resurrection, and retries via saveTasks()', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTriggerSyncToast.mockClear();

      mockTasksDelete.mockResolvedValueOnce({ success: false, error: 'DISK_IO_ERR' });
      store.deleteTask('db-2');

      await vi.waitFor(() => {
        expect(store.syncState).toBe('error');
      });

      expect(store.pendingDeleteTaskIds).toContain('db-2');
      expect(store.tasks.some(t => t.id === 'db-2')).toBe(false);
      // Error toast shown, NEVER synced deletion toast
      expect(mockTriggerSyncToast).toHaveBeenCalledTimes(1);
      expect(mockTriggerSyncToast.mock.calls[0][3]).toEqual(
        expect.objectContaining({ variant: 'error' })
      );

      // Stale broadcast must NOT resurrect 'db-2' while pending delete exists
      tasksChangedCallback!({
        action: 'updated',
        source: 'ai_tool',
        task: {
          id: 'db-2',
          text: 'Initial DB Task 2',
          completed: false,
          createdAt: 1700000000000,
          updatedAt: Date.now() + 10000,
          updated_at: Date.now() + 10000,
          priority: 'medium',
          category: 'ops',
          subtasks: []
        }
      });
      expect(store.tasks.some(t => t.id === 'db-2')).toBe(false);

      // Subsequent saveTasks() retries deletion and succeeds
      const ok = await store.saveTasks();
      expect(ok).toBe(true);
      expect(store.pendingDeleteTaskIds).toEqual([]);
      expect(store.syncState).toBe('idle');
    });

    it('serializes parallel edits on the same task ID and prevents stale ACK clobbering', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTasksUpsert.mockClear();

      const firstOp = createDeferred<any>();
      const secondOp = createDeferred<any>();
      mockTasksUpsert
        .mockReturnValueOnce(firstOp.promise)
        .mockReturnValueOnce(secondOp.promise);

      store.updateTaskTitle('db-1', 'Edit 1');
      store.updateTaskTitle('db-1', 'Edit 2');

      // Serial queue: only first IPC has fired while firstOp is in-flight
      expect(mockTasksUpsert).toHaveBeenCalledTimes(1);
      expect(mockTasksUpsert.mock.calls[0][0].text).toBe('Edit 1');

      // Resolve firstOp -> local 'Edit 2' must NOT be overwritten and secondOp must start
      firstOp.resolve({
        success: true,
        task: { ...store.tasks.find(t => t.id === 'db-1'), text: 'Edit 1' }
      });

      await vi.waitFor(() => {
        expect(mockTasksUpsert).toHaveBeenCalledTimes(2);
      });
      expect(store.tasks.find(t => t.id === 'db-1')?.text).toBe('Edit 2');
      expect(store.dirtyTaskIds).toContain('db-1');
      expect(mockTasksUpsert.mock.calls[1][0].text).toBe('Edit 2');

      secondOp.resolve({
        success: true,
        task: { ...store.tasks.find(t => t.id === 'db-1'), text: 'Edit 2' }
      });

      await vi.waitFor(() => {
        expect(store.syncState).toBe('idle');
      });
      expect(store.tasks.find(t => t.id === 'db-1')?.text).toBe('Edit 2');
      expect(store.dirtyTaskIds).toEqual([]);
    });

    it('serializes update-then-delete race on the same ID without resurrecting deleted task', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store.loadTasksFromStorageOrDB();
      mockTasksUpsert.mockClear();
      mockTasksDelete.mockClear();

      const deferredUpsert = createDeferred<any>();
      mockTasksUpsert.mockReturnValueOnce(deferredUpsert.promise);

      store.updateTaskTitle('db-1', 'Will be deleted immediately');
      store.deleteTask('db-1');

      // Delete must wait in per-task serial queue until in-flight upsert settles
      expect(mockTasksUpsert).toHaveBeenCalledTimes(1);
      expect(mockTasksDelete).not.toHaveBeenCalled();
      expect(store.tasks.some(t => t.id === 'db-1')).toBe(false);

      deferredUpsert.resolve({
        success: true,
        task: { id: 'db-1', text: 'Will be deleted immediately', completed: false, createdAt: 1, updatedAt: Date.now() }
      });

      await vi.waitFor(() => {
        expect(mockTasksDelete).toHaveBeenCalledWith('db-1');
        expect(store.syncState).toBe('idle');
      });

      expect(store.tasks.some(t => t.id === 'db-1')).toBe(false);
      expect(store.dirtyTaskIds).toEqual([]);
      expect(store.pendingDeleteTaskIds).toEqual([]);
    });

    it('flushes unacknowledged state on beforeunload and reconciles/replays against SQLite on restart', async () => {
      const store1 = useTasksStore();
      store1.setSyncOptions({ timeoutMs: 500, backoffBaseMs: 5000 });
      await store1.loadTasksFromStorageOrDB();

      // Simulate in-flight upsert during abrupt close + failed delete
      const hangingUpsert = createDeferred<any>();
      mockTasksUpsert.mockReturnValueOnce(hangingUpsert.promise);
      mockTasksDelete.mockResolvedValueOnce({ success: false, error: 'APP_CLOSING' });

      store1.updateTaskTitle('db-1', 'Unsaved Before Restart');
      store1.deleteTask('db-2');
      await vi.waitFor(() => expect(store1.pendingDeleteTaskIds).toContain('db-2'));

      // Fire beforeunload while db-1 upsert is still in flight
      (window as any).dispatchEvent({ type: 'beforeunload' });
      const rawJournal = JSON.parse(mockLocalStorageStore['arc_tasks_pending_ops_v1']);
      expect(rawJournal.upserts['db-1'].text).toBe('Unsaved Before Restart');
      expect(rawJournal.deletes).toContain('db-2');

      // Simulate app restart with fresh Pinia; SQLite still has stale Initial DB Task 1 & 2
      mockTasksUpsert.mockImplementation(async (t: any) => ({ success: true, task: t }));
      mockTasksDelete.mockResolvedValue({ success: true });
      setActivePinia(createPinia());

      const store2 = useTasksStore();
      await store2.loadTasksFromStorageOrDB();

      expect(store2.tasks.find(t => t.id === 'db-1')?.text).toBe('Unsaved Before Restart');
      expect(store2.tasks.some(t => t.id === 'db-2')).toBe(false);
      expect(mockTasksUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'db-1', text: 'Unsaved Before Restart' })
      );
      expect(mockTasksDelete).toHaveBeenCalledWith('db-2');
      expect(store2.hasUnsyncedChanges).toBe(false);
      expect(store2.syncState).toBe('idle');
      expect(mockLocalStorageStore['arc_tasks_pending_ops_v1']).toBeUndefined();
    });

    it('recovers automatically with bounded exponential backoff and stops after max retries', async () => {
      const store = useTasksStore();
      store.setSyncOptions({ timeoutMs: 200, backoffBaseMs: 10 });
      await store.loadTasksFromStorageOrDB();
      mockTasksUpsert.mockClear();

      // Part A: Fail twice then succeed on auto-retry #2
      mockTasksUpsert
        .mockResolvedValueOnce({ success: false, error: 'TRANSIENT_1' })
        .mockResolvedValueOnce({ success: false, error: 'TRANSIENT_2' })
        .mockImplementationOnce(async (t: any) => ({ success: true, task: t }));

      store.updateTaskTitle('db-1', 'Backoff Recovered');

      await vi.waitFor(() => {
        expect(store.syncState).toBe('idle');
      }, { timeout: 1000 });

      expect(mockTasksUpsert).toHaveBeenCalledTimes(3);
      expect(store.hasUnsyncedChanges).toBe(false);

      // Part B: Persistent failure caps at initial attempt + 3 auto-retries (= 4 calls)
      mockTasksUpsert.mockClear();
      mockTasksUpsert.mockResolvedValue({ success: false, error: 'PERMANENT_ERR' });
      store.updateTaskTitle('db-2', 'Never Acked');

      await vi.waitFor(() => {
        expect(mockTasksUpsert).toHaveBeenCalledTimes(4);
      }, { timeout: 1000 });

      // Wait an extra cycle to confirm no unbounded retries continue
      await new Promise(res => setTimeout(res, 120));
      expect(mockTasksUpsert).toHaveBeenCalledTimes(4);
      expect(store.syncState).toBe('error');
      expect(store.dirtyTaskIds).toContain('db-2');
    });
  });
});

