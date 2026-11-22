import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useAiDecomposition, getTaskDecompositionSource, LOCAL_TEMPLATE_PREFIX } from './useAiDecomp';
import type { Task } from '../types';

const mockTriggerSyncToast = vi.fn();

vi.mock('../../settings/stores/settings.store', () => ({
  useSettingsStore: () => ({
    language: 'RU',
    triggerSyncToast: mockTriggerSyncToast
  })
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    text: 'Разработать модуль декомпозиции',
    description: '',
    createdAt: Date.now(),
    completed: false,
    priority: 'high',
    category: 'dev',
    status: 'todo',
    importance: 'regular',
    estimatedMinutes: 30,
    spentMinutes: 0,
    subtasks: [],
    ...overrides
  };
}

describe('useAiDecomposition Composable (S3-05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.api = undefined;
  });

  it('calls window.api.tasksAiDecompose and populates llm subtasks + synced toast when LLM succeeds', async () => {
    const mockTasks = ref<Task[]>([makeTask()]);
    const mockSaveTasks = vi.fn();

    (window as any).api = {
      tasksAiDecompose: vi.fn().mockResolvedValue({
        success: true,
        taskId: 'task-1',
        source: 'llm',
        steps: ['Спроектировать схему DRAFT', 'Реализовать ручной валидатор', 'Интегрировать IPC канал']
      })
    };

    const { decomposeTaskWithAI, decomposingTaskId } = useAiDecomposition(mockTasks, mockSaveTasks);

    expect(decomposingTaskId.value).toBeNull();

    const result = await decomposeTaskWithAI('task-1');

    expect(result).toEqual({
      status: 'applied_llm',
      source: 'llm',
      stepsAdded: 3
    });
    expect(decomposingTaskId.value).toBeNull();
    expect((window as any).api.tasksAiDecompose).toHaveBeenCalledWith({
      taskId: 'task-1',
      taskText: 'Разработать модуль декомпозиции'
    });

    const task = mockTasks.value[0];
    expect(task.aiDecomposed).toBe(true);
    expect(task.subtasks).toHaveLength(3);
    expect(task.subtasks[0].text).toBe('[AI Step 1] Спроектировать схему DRAFT');
    expect(task.subtasks[0].source).toBe('llm');
    expect(task.subtasks[1].text).toBe('[AI Step 2] Реализовать ручной валидатор');
    expect(task.subtasks[2].text).toBe('[AI Step 3] Интегрировать IPC канал');
    expect(getTaskDecompositionSource(task)).toBe('llm');
    expect(mockSaveTasks).toHaveBeenCalledTimes(1);
    expect(mockTriggerSyncToast).toHaveBeenCalledWith(
      expect.stringContaining('LLM'),
      expect.any(Function),
      false,
      expect.objectContaining({ variant: 'synced', hideAction: true })
    );
  });

  it('distinguishes Main local_template response from LLM and never shows AI completion toast', async () => {
    const mockTasks = ref<Task[]>([makeTask({ id: 'task-offline' })]);
    const mockSaveTasks = vi.fn();

    (window as any).api = {
      tasksAiDecompose: vi.fn().mockResolvedValue({
        success: true,
        taskId: 'task-offline',
        source: 'local_template',
        fallbackReason: 'llm_timeout',
        steps: [
          `${LOCAL_TEMPLATE_PREFIX} Шаг 1`,
          `${LOCAL_TEMPLATE_PREFIX} Шаг 2`
        ]
      })
    };

    const { decomposeTaskWithAI } = useAiDecomposition(mockTasks, mockSaveTasks);
    const result = await decomposeTaskWithAI('task-offline');

    expect(result).toEqual({
      status: 'applied_template',
      source: 'local_template',
      fallbackReason: 'llm_timeout',
      stepsAdded: 2
    });
    const task = mockTasks.value[0];
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].source).toBe('local_template');
    expect(task.subtasks[0].text).toContain(LOCAL_TEMPLATE_PREFIX);
    expect(getTaskDecompositionSource(task)).toBe('local_template');

    const [toastLabel, , , toastOpts] = mockTriggerSyncToast.mock.calls[0];
    expect(toastLabel).not.toContain('ИИ декомпозиция задачи завершена');
    expect(toastLabel).toContain('локальный шаблон');
    expect(toastLabel).toContain('ИИ не ответил вовремя');
    expect(toastOpts).toEqual({ variant: 'warn', actionLabel: 'Повторить ИИ' });
  });

  it('falls back to local templates with [Локальный шаблон — ИИ офлайн] prefix and warn toast if IPC throws', async () => {
    const mockTasks = ref<Task[]>([
      makeTask({ id: 'task-sec', text: 'Аудит безопасности токенов доступа', category: 'sec', priority: 'medium', estimatedMinutes: 45 })
    ]);
    const mockSaveTasks = vi.fn();

    (window as any).api = {
      tasksAiDecompose: vi.fn().mockRejectedValue(new Error('Network offline or IPC bridge error'))
    };

    const { decomposeTaskWithAI, decomposingTaskId } = useAiDecomposition(mockTasks, mockSaveTasks);

    const result = await decomposeTaskWithAI('task-sec');

    expect(result.status).toBe('applied_template');
    expect(result.source).toBe('local_template');
    expect(result.fallbackReason).toBe('ipc_error');
    expect(decomposingTaskId.value).toBeNull();
    const task = mockTasks.value[0];
    expect(task.aiDecomposed).toBe(true);
    expect(task.subtasks.length).toBeGreaterThan(0);
    expect(task.subtasks[0].text).toContain(LOCAL_TEMPLATE_PREFIX);
    expect(task.subtasks[0].source).toBe('local_template');
    expect(mockSaveTasks).toHaveBeenCalledTimes(1);
    expect(mockTriggerSyncToast).toHaveBeenCalledWith(
      expect.stringContaining('применён локальный шаблон'),
      expect.any(Function),
      true,
      expect.objectContaining({ variant: 'warn' })
    );
  });

  it('blocks repeat decomposition after LLM success without duplicating subtasks or calling IPC', async () => {
    const mockTasks = ref<Task[]>([
      makeTask({
        id: 'task-done-llm',
        aiDecomposed: true,
        subtasks: [
          { id: 's1', text: '[AI Step 1] Первый шаг', completed: false, source: 'llm' },
          { id: 's2', text: '[AI Step 2] Второй шаг', completed: true, source: 'llm' }
        ]
      })
    ]);
    const mockSaveTasks = vi.fn();
    const ipcSpy = vi.fn();
    (window as any).api = { tasksAiDecompose: ipcSpy };

    const { decomposeTaskWithAI } = useAiDecomposition(mockTasks, mockSaveTasks);
    const result = await decomposeTaskWithAI('task-done-llm');

    expect(result).toEqual({
      status: 'skipped_already_decomposed',
      source: 'llm',
      stepsAdded: 0
    });
    expect(ipcSpy).not.toHaveBeenCalled();
    expect(mockSaveTasks).not.toHaveBeenCalled();
    expect(mockTasks.value[0].subtasks).toHaveLength(2);
  });

  it('allows LLM retry after local_template, replacing only template steps and keeping manual subtasks', async () => {
    const mockTasks = ref<Task[]>([
      makeTask({
        id: 'task-retry',
        aiDecomposed: true,
        subtasks: [
          { id: 'manual-1', text: 'Моя ручная заметка', completed: true },
          { id: 'tpl-1', text: `${LOCAL_TEMPLATE_PREFIX} Старый шаблон 1`, completed: false, source: 'local_template' },
          { id: 'tpl-2', text: `${LOCAL_TEMPLATE_PREFIX} Старый шаблон 2`, completed: false, source: 'local_template' }
        ]
      })
    ]);
    const mockSaveTasks = vi.fn();

    // First retry: LLM still offline -> keeps existing template without duplication
    (window as any).api = {
      tasksAiDecompose: vi.fn().mockResolvedValueOnce({
        success: true,
        taskId: 'task-retry',
        source: 'local_template',
        fallbackReason: 'llm_error',
        steps: [`${LOCAL_TEMPLATE_PREFIX} Новый шаблон`]
      }).mockResolvedValueOnce({
        success: true,
        taskId: 'task-retry',
        source: 'llm',
        steps: ['Реальный шаг LLM A', 'Реальный шаг LLM B']
      })
    };

    const { decomposeTaskWithAI } = useAiDecomposition(mockTasks, mockSaveTasks);

    const stillOfflineRes = await decomposeTaskWithAI('task-retry');
    expect(stillOfflineRes).toEqual({
      status: 'kept_existing_template',
      source: 'local_template',
      fallbackReason: 'llm_error',
      stepsAdded: 0
    });
    expect(mockTasks.value[0].subtasks).toHaveLength(3);
    expect(mockSaveTasks).not.toHaveBeenCalled();

    // Second retry: LLM recovered -> replaces template steps, keeps manual-1
    const upgradedRes = await decomposeTaskWithAI('task-retry');
    expect(upgradedRes).toEqual({
      status: 'upgraded_to_llm',
      source: 'llm',
      stepsAdded: 2
    });
    expect(mockSaveTasks).toHaveBeenCalledTimes(1);
    const updatedSubtasks = mockTasks.value[0].subtasks;
    expect(updatedSubtasks).toHaveLength(3);
    expect(updatedSubtasks[0]).toMatchObject({ id: 'manual-1', text: 'Моя ручная заметка', completed: true });
    expect(updatedSubtasks[1]).toMatchObject({ text: '[AI Step 1] Реальный шаг LLM A', source: 'llm' });
    expect(updatedSubtasks[2]).toMatchObject({ text: '[AI Step 2] Реальный шаг LLM B', source: 'llm' });
    expect(getTaskDecompositionSource(mockTasks.value[0])).toBe('llm');
  });

  it('prevents concurrent double-click execution via decomposingTaskId guard', async () => {
    const mockTasks = ref<Task[]>([makeTask({ id: 'task-race' })]);
    const mockSaveTasks = vi.fn();

    let resolveIpc!: (val: any) => void;
    const ipcSpy = vi.fn(() => new Promise(resolve => { resolveIpc = resolve; }));
    (window as any).api = { tasksAiDecompose: ipcSpy };

    const { decomposeTaskWithAI } = useAiDecomposition(mockTasks, mockSaveTasks);

    const firstCall = decomposeTaskWithAI('task-race');
    const secondCall = await decomposeTaskWithAI('task-race');

    expect(secondCall).toEqual({ status: 'busy', source: null, stepsAdded: 0 });
    expect(ipcSpy).toHaveBeenCalledTimes(1);

    resolveIpc({ success: true, taskId: 'task-race', source: 'llm', steps: ['Шаг 1'] });
    const firstResult = await firstCall;
    expect(firstResult.status).toBe('applied_llm');
    expect(mockTasks.value[0].subtasks).toHaveLength(1);
  });

  it('resets decomposingTaskId in finally block even if an unexpected exception occurs', async () => {
    const mockTasks = ref<Task[]>([
      makeTask({ id: 'task-err', text: 'Тест устойчивости к ошибкам', priority: 'low', category: 'ops', estimatedMinutes: 10 })
    ]);
    const mockSaveTasks = vi.fn().mockImplementation(() => {
      throw new Error('Save tasks fatal storage crash');
    });

    const { decomposeTaskWithAI, decomposingTaskId } = useAiDecomposition(mockTasks, mockSaveTasks);

    await decomposeTaskWithAI('task-err');

    expect(decomposingTaskId.value).toBeNull();
  });

  it('TaskContextRail.vue and TaskItem.vue expose truthful source labels and repeat/retry guards', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse: parseSfc, compileTemplate } = await import('@vue/compiler-sfc');

    const railPath = path.resolve(__dirname, '../components/TaskContextRail.vue');
    const itemPath = path.resolve(__dirname, '../components/TaskItem.vue');
    const railSrc = fs.readFileSync(railPath, 'utf8');
    const itemSrc = fs.readFileSync(itemPath, 'utf8');

    expect(railSrc).toContain('Шаблон · ИИ офлайн');
    expect(railSrc).toContain('Источник: LLM');
    expect(railSrc).toContain('Повтор ИИ');
    expect(railSrc).toContain('LLM ✓');
    expect(railSrc).toContain("isDecomposingSelected || selectedDecompSource === 'llm'");

    expect(itemSrc).toContain("isDecomposing || decompSource === 'llm'");
    expect(itemSrc).toContain('Повторить ИИ');

    for (const [filename, src] of [[railPath, railSrc], [itemPath, itemSrc]] as const) {
      const { descriptor } = parseSfc(src, { filename });
      const compiled = compileTemplate({
        source: descriptor.template!.content,
        filename,
        id: filename,
        compilerOptions: {
          mode: 'function',
          isTS: true,
          expressionPlugins: ['typescript']
        }
      });
      expect(compiled.errors).toEqual([]);
    }
  });
});

