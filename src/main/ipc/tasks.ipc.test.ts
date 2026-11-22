import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from '../services/database';
import { tasksService } from '../services/tasks.service';
import { registerTasksIpc } from './tasks.ipc';
import { aiService } from '../services/ai.service';

const ipcHandlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/arc-test-userdata')
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      ipcHandlers.set(channel, handler);
    })
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
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

describe('tasks.ipc.ts — Granular Channels & Return Contracts', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    DatabaseService.close();
    DatabaseService.initWithConfig({
      dbPath: ':memory:',
      DatabaseClass: NativeSqlite || undefined,
      isTestEnv: true
    });
    tasksService.clearAllTasks('system');
    registerTasksIpc();
  });

  it('registers all granular and legacy tasks IPC channels', () => {
    expect(ipcHandlers.has('tasks:list')).toBe(true);
    expect(ipcHandlers.has('tasks:saveAll')).toBe(true);
    expect(ipcHandlers.has('tasks:create')).toBe(true);
    expect(ipcHandlers.has('tasks:complete')).toBe(true);
    expect(ipcHandlers.has('tasks:delete')).toBe(true);
    expect(ipcHandlers.has('tasks:upsert')).toBe(true);
    expect(ipcHandlers.has('tasks:batch-upsert')).toBe(true);
    expect(ipcHandlers.has('tasks:clear-all')).toBe(true);
    expect(ipcHandlers.has('tasks:ai-decompose')).toBe(true);
  });

  it('tasks:upsert returns { success, task, error } contract', async () => {
    const upsertHandler = ipcHandlers.get('tasks:upsert')!;

    const okRes = await upsertHandler({}, { id: 'ipc-1', text: 'IPC Upsert Task', priority: 'high' });
    expect(okRes.success).toBe(true);
    expect(okRes.task).toBeDefined();
    expect(okRes.task.id).toBe('ipc-1');
    expect(okRes.error).toBeUndefined();

    const errRes = await upsertHandler({}, { id: 'ipc-bad', text: '   ' });
    expect(errRes.success).toBe(false);
    expect(errRes.task).toBeUndefined();
    expect(errRes.error).toBeDefined();
  });

  it('tasks:batch-upsert returns { success, tasks, failed, error } contract', async () => {
    const batchHandler = ipcHandlers.get('tasks:batch-upsert')!;

    const res = await batchHandler({}, {
      tasks: [
        { id: 'b-1', text: 'Batch One' },
        { id: 'b-2', text: '' },
        { id: 'b-3', text: 'Batch Three' }
      ],
      source: 'renderer'
    });

    expect(res.success).toBe(false);
    expect(res.tasks).toHaveLength(2);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].id).toBe('b-2');
    expect(res.error).toBeDefined();
  });

  it('tasks:delete and tasks:clear-all return { success, error? } contract', async () => {
    const upsertHandler = ipcHandlers.get('tasks:upsert')!;
    const deleteHandler = ipcHandlers.get('tasks:delete')!;
    const clearAllHandler = ipcHandlers.get('tasks:clear-all')!;

    await upsertHandler({}, { id: 'del-1', text: 'To Delete' });
    await upsertHandler({}, { id: 'del-2', text: 'To Clear' });

    const delOk = await deleteHandler({}, 'del-1');
    expect(delOk).toEqual({ success: true, id: 'del-1', error: undefined });

    const delMissing = await deleteHandler({}, 'del-nonexistent');
    expect(delMissing.success).toBe(false);
    expect(delMissing.error).toBeDefined();

    const clearRes = await clearAllHandler({});
    expect(clearRes).toEqual({ success: true, error: undefined });
    expect(tasksService.getAllTasks()).toHaveLength(0);
  });

  it('tasks:saveAll delegates to batchUpsertTasks without DELETE FROM arc_tasks', async () => {
    const upsertHandler = ipcHandlers.get('tasks:upsert')!;
    const saveAllHandler = ipcHandlers.get('tasks:saveAll')!;
    const listHandler = ipcHandlers.get('tasks:list')!;

    await upsertHandler({}, { id: 'keep-1', text: 'Must Remain' });
    const saveOk = await saveAllHandler({}, [{ id: 'added-2', text: 'Added via saveAll' }]);
    expect(saveOk).toBe(true);

    const all = await listHandler({});
    expect(all).toHaveLength(2);
    expect(all.map((t: any) => t.id).sort()).toEqual(['added-2', 'keep-1']);
  });

  it('tasks:ai-decompose returns source=llm on valid model response and source=local_template with fallbackReason on failure', async () => {
    const decomposeHandler = ipcHandlers.get('tasks:ai-decompose')!;

    const emptyRes = await decomposeHandler({}, { taskId: 't-empty', taskText: '   ' });
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.source).toBe('local_template');
    expect(emptyRes.fallbackReason).toBe('empty_task_text');

    const aiSpy = vi.spyOn(aiService, 'request').mockImplementationOnce(async (_prompt, _ctx, onChunk) => {
      onChunk('["Шаг LLM 1", "Шаг LLM 2"]', true);
    });

    const llmRes = await decomposeHandler({}, { taskId: 't-llm', taskText: 'Оптимизировать кеш' });
    expect(llmRes.success).toBe(true);
    expect(llmRes.source).toBe('llm');
    expect(llmRes.fallbackReason).toBeUndefined();
    expect(llmRes.steps).toEqual(['Шаг LLM 1', 'Шаг LLM 2']);

    aiSpy.mockRejectedValueOnce(new Error('LLM decomposition request timed out (15s)'));
    const timeoutRes = await decomposeHandler({}, { taskId: 't-timeout', taskText: 'Проверить безопасность' });
    expect(timeoutRes.success).toBe(true);
    expect(timeoutRes.source).toBe('local_template');
    expect(timeoutRes.fallbackReason).toBe('llm_timeout');
    expect(timeoutRes.steps[0]).toContain('[Локальный шаблон — ИИ офлайн]');

    aiSpy.mockImplementationOnce(async (_prompt, _ctx, onChunk) => {
      onChunk('not valid json', true);
    });
    const invalidJsonRes = await decomposeHandler({}, { taskId: 't-bad', taskText: 'Настроить CI' });
    expect(invalidJsonRes.success).toBe(true);
    expect(invalidJsonRes.source).toBe('local_template');
    expect(invalidJsonRes.fallbackReason).toBe('llm_invalid_response');

    aiSpy.mockRestore();
  });
});
