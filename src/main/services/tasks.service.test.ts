import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from './database';
import { tasksService } from './tasks.service';

const mockSend = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/arc-test-userdata')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: () => false,
        webContents: {
          send: mockSend
        }
      }
    ])
  }
}));

let NativeSqlite: any = null;
try {
  const Candidate = require('better-sqlite3');
  const probe = new Candidate(':memory:');
  probe.close();
  NativeSqlite = Candidate;
} catch {
  NativeSqlite = null;
}

const engines: Array<'sqlite' | 'json'> = NativeSqlite ? ['sqlite', 'json'] : ['json'];

describe.each(engines)('TasksService SSOT & Transactional CRUD (%s mode)', (mode) => {
  beforeEach(() => {
    mockSend.mockClear();
    DatabaseService.close();
    DatabaseService.initWithConfig({
      dbPath: ':memory:',
      DatabaseClass: mode === 'sqlite' ? NativeSqlite : undefined,
      isTestEnv: true
    });
    tasksService.clearAllTasks('system');
    mockSend.mockClear();
  });

  it('upsertTask creates a new task and updates existing task without losing other rows', () => {
    const createdA = tasksService.upsertTask(
      { id: 'task-a', text: 'Task A', priority: 'high', category: 'dev' },
      'renderer'
    );
    expect(createdA).not.toBeNull();
    expect(createdA?.id).toBe('task-a');
    expect(createdA?.text).toBe('Task A');
    expect(typeof createdA?.updatedAt).toBe('number');
    expect(createdA!.updatedAt).toBeGreaterThan(0);

    const createdB = tasksService.upsertTask(
      { id: 'task-b', text: 'Task B', priority: 'low', category: 'ops' },
      'renderer'
    );
    expect(createdB).not.toBeNull();

    const updatedA = tasksService.upsertTask(
      { id: 'task-a', text: 'Task A Updated', priority: 'medium', category: 'dev', completed: true },
      'renderer'
    );
    expect(updatedA).not.toBeNull();
    expect(updatedA?.text).toBe('Task A Updated');
    expect(updatedA?.completed).toBe(true);
    expect(updatedA!.updatedAt).toBeGreaterThan(createdA!.updatedAt);

    const all = tasksService.getAllTasks();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.id === 'task-a')?.text).toBe('Task A Updated');
    expect(all.find((t) => t.id === 'task-b')?.text).toBe('Task B');
  });

  it('updated_at increases monotonically across upsertTask and completeTask', () => {
    const initial = tasksService.createTask({ id: 'task-mono', text: 'Monotonic check' }, 'renderer');
    expect(initial).not.toBeNull();
    const ts1 = initial!.updatedAt;

    const second = tasksService.upsertTask({ id: 'task-mono', text: 'Monotonic step 2' }, 'renderer');
    const ts2 = second!.updatedAt;
    expect(ts2).toBeGreaterThan(ts1);

    const completedOk = tasksService.completeTask('task-mono', 'renderer');
    expect(completedOk).toBe(true);

    const afterComplete = tasksService.getAllTasks().find((t) => t.id === 'task-mono');
    expect(afterComplete).toBeDefined();
    expect(afterComplete!.completed).toBe(true);
    expect(afterComplete!.updatedAt).toBeGreaterThan(ts2);
  });

  it('batchUpsertTasks upserts without DELETE FROM arc_tasks, preserving existing tasks outside batch', () => {
    tasksService.createTask({ id: 'existing-1', text: 'Pre-existing Task' }, 'ai_tool');
    mockSend.mockClear();

    const res = tasksService.batchUpsertTasks(
      [
        { id: 'batch-1', text: 'Batch Task 1', priority: 'high' },
        { id: 'batch-2', text: 'Batch Task 2', priority: 'medium' }
      ],
      'renderer'
    );

    expect(res.success).toBe(true);
    expect(res.failed).toHaveLength(0);
    expect(res.tasks).toHaveLength(2);

    const all = tasksService.getAllTasks();
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.id).sort()).toEqual(['batch-1', 'batch-2', 'existing-1']);
    expect(mockSend).toHaveBeenCalledWith(
      'tasks:changed',
      expect.objectContaining({
        action: 'batch',
        source: 'renderer'
      })
    );
  });

  it('batchUpsertTasks isolates per-item failure: 3 items with 2nd invalid saves 2 items and reports 1 failed', () => {
    const res = tasksService.batchUpsertTasks(
      [
        { id: 'valid-1', text: 'First Valid Task' },
        { id: 'invalid-2', text: '   ' }, // invalid empty text
        { id: 'valid-3', text: 'Third Valid Task' }
      ],
      'renderer'
    );

    expect(res.success).toBe(false);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].id).toBe('invalid-2');
    expect(res.tasks).toHaveLength(2);

    const all = tasksService.getAllTasks();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.id).sort()).toEqual(['valid-1', 'valid-3']);
  });

  it('saveAllTasks delegates to batchUpsertTasks without deleting unmentioned tasks', () => {
    tasksService.createTask({ id: 'ai-task-1', text: 'Created by AI' }, 'ai_tool');

    const ok = tasksService.saveAllTasks([{ id: 'ui-task-1', text: 'Saved from UI' }], 'renderer');
    expect(ok).toBe(true);

    const all = tasksService.getAllTasks();
    expect(all).toHaveLength(2);
    expect(all.some((t) => t.id === 'ai-task-1')).toBe(true);
    expect(all.some((t) => t.id === 'ui-task-1')).toBe(true);
  });

  it('clearAllTasks deletes all rows inside transaction and broadcasts reload with empty list', () => {
    tasksService.createTask({ id: 't-1', text: 'One' }, 'renderer');
    tasksService.createTask({ id: 't-2', text: 'Two' }, 'renderer');
    expect(tasksService.getAllTasks()).toHaveLength(2);

    mockSend.mockClear();
    const cleared = tasksService.clearAllTasks('renderer');
    expect(cleared).toBe(true);
    expect(tasksService.getAllTasks()).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledWith('tasks:changed', {
      action: 'reload',
      tasks: [],
      source: 'renderer'
    });
  });
});
