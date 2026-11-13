import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from './database';
import { tasksService, type TaskChangedPayload } from './tasks.service';
import { TaskManagementTool } from './tools/task-management.tool';

const broadcastEvents: TaskChangedPayload[] = [];

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/arc-test-userdata')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (_channel: string, payload: TaskChangedPayload) => {
            broadcastEvents.push(payload);
          }
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

describe('Tasks Concurrency & Race Conditions (AI Tool vs Renderer UI)', () => {
  beforeEach(() => {
    broadcastEvents.length = 0;
    DatabaseService.close();
    DatabaseService.initWithConfig({
      dbPath: ':memory:',
      DatabaseClass: NativeSqlite || undefined,
      isTestEnv: true
    });
    tasksService.clearAllTasks('system');
    broadcastEvents.length = 0;
  });

  it('preserves both AI-created Task A and concurrently UI-updated Task B in SQLite and emits accurate broadcasts', async () => {
    // 1. Seed existing Task B (visible in UI)
    const initialTaskB = tasksService.upsertTask(
      {
        id: 'task-b',
        text: 'Prepare architecture report',
        status: 'todo',
        completed: false,
        priority: 'medium'
      },
      'renderer'
    );
    expect(initialTaskB).not.toBeNull();
    broadcastEvents.length = 0;

    const tool = new TaskManagementTool();

    // 2. Concurrent execution: AI Tool creates Task A while within 20ms Renderer updates Task B status
    const aiPromise = tool.execute({
      action: 'create_task',
      text: 'Audit DPAPI secrets vault',
      priority: 'high',
      category: 'sec'
    });

    const uiPromise = new Promise((resolve) => {
      setTimeout(() => {
        const updatedB = tasksService.upsertTask(
          {
            ...initialTaskB,
            status: 'in_progress',
            spentMinutes: 15
          },
          'renderer'
        );
        resolve(updatedB);
      }, 20);
    });

    const [aiResult, updatedBResult] = await Promise.all([aiPromise, uiPromise]);

    expect(aiResult.success).toBe(true);
    expect(updatedBResult).not.toBeNull();

    // 3. Verify both Task A and Task B exist in SQLite without data loss
    const allTasks = tasksService.getAllTasks();
    expect(allTasks).toHaveLength(2);

    const taskA = allTasks.find((t) => t.text === 'Audit DPAPI secrets vault');
    const taskB = allTasks.find((t) => t.id === 'task-b');

    expect(taskA).toBeDefined();
    expect(taskA?.priority).toBe('high');
    expect(taskA?.category).toBe('sec');

    expect(taskB).toBeDefined();
    expect(taskB?.status).toBe('in_progress');
    expect(taskB?.spentMinutes).toBe(15);
    expect(taskB!.updatedAt).toBeGreaterThan(initialTaskB!.updatedAt);

    // 4. Verify broadcast events for both AI tool and renderer mutations
    expect(broadcastEvents).toHaveLength(2);
    const aiBroadcast = broadcastEvents.find((e) => e.source === 'ai_tool');
    const uiBroadcast = broadcastEvents.find((e) => e.source === 'renderer');

    expect(aiBroadcast).toBeDefined();
    expect(aiBroadcast?.action).toBe('created');
    expect(aiBroadcast?.task?.id).toBe(taskA?.id);

    expect(uiBroadcast).toBeDefined();
    expect(uiBroadcast?.action).toBe('updated');
    expect(uiBroadcast?.task?.id).toBe('task-b');
    expect(uiBroadcast?.task?.status).toBe('in_progress');
  });
});
