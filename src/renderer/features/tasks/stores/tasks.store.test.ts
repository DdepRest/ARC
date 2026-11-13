import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTasksStore } from './tasks.store';
import type { TaskChangedPayload } from '../types';

vi.mock('../../settings/stores/settings.store', () => ({
  useSettingsStore: () => ({
    language: 'RU',
    triggerSyncToast: vi.fn()
  })
}));

vi.mock('../../../stores/ui.store', () => ({
  useUIStore: () => ({
    speak: vi.fn()
  })
}));

describe('useTasksStore — Granular SSOT, Diff-Sync & tasks:changed Broadcast', () => {
  let tasksChangedCallback: ((payload: TaskChangedPayload) => void) | null = null;
  let mockTasksList: ReturnType<typeof vi.fn>;
  let mockTasksUpsert: ReturnType<typeof vi.fn>;
  let mockTasksDelete: ReturnType<typeof vi.fn>;
  let mockTasksBatchUpsert: ReturnType<typeof vi.fn>;
  let mockTasksClearAll: ReturnType<typeof vi.fn>;
  let mockTasksSaveAll: ReturnType<typeof vi.fn>;
  let mockOnTasksChanged: ReturnType<typeof vi.fn>;

  let mockLocalStorageStore: Record<string, string> = {};
  let mockLocalStorageSetItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    tasksChangedCallback = null;
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

    (globalThis as any).window = (globalThis as any).window || {};
    (window as any).api = {
      tasksList: mockTasksList,
      tasksUpsert: mockTasksUpsert,
      tasksDelete: mockTasksDelete,
      tasksBatchUpsert: mockTasksBatchUpsert,
      tasksClearAll: mockTasksClearAll,
      tasksSaveAll: mockTasksSaveAll,
      onTasksChanged: mockOnTasksChanged,
      objectiveGetAll: vi.fn().mockResolvedValue([])
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
    expect(mockTasksDelete).toHaveBeenCalledWith('legacy-local-1');
    expect(mockLocalStorageSetItem).not.toHaveBeenCalled();
  });
});
