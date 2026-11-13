import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useAiDecomposition } from './useAiDecomp';
import type { Task } from '../types';

const mockTriggerSyncToast = vi.fn();

vi.mock('../../settings/stores/settings.store', () => ({
  useSettingsStore: () => ({
    language: 'RU',
    triggerSyncToast: mockTriggerSyncToast
  })
}));

describe('useAiDecomposition Composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.api = undefined;
  });

  it('calls window.api.tasksAiDecompose and populates subtasks when IPC succeeds', async () => {
    const mockTasks = ref<Task[]>([
      {
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
        subtasks: []
      }
    ]);
    const mockSaveTasks = vi.fn();

    (window as any).api = {
      tasksAiDecompose: vi.fn().mockResolvedValue({
        success: true,
        taskId: 'task-1',
        steps: ['Спроектировать схему DRAFT', 'Реализовать ручной валидатор', 'Интегрировать IPC канал']
      })
    };

    const { decomposeTaskWithAI, decomposingTaskId } = useAiDecomposition(mockTasks, mockSaveTasks);

    expect(decomposingTaskId.value).toBeNull();

    await decomposeTaskWithAI('task-1');

    expect(decomposingTaskId.value).toBeNull();
    expect((window as any).api.tasksAiDecompose).toHaveBeenCalledWith({
      taskId: 'task-1',
      taskText: 'Разработать модуль декомпозиции'
    });

    const task = mockTasks.value[0];
    expect(task.aiDecomposed).toBe(true);
    expect(task.subtasks).toHaveLength(3);
    expect(task.subtasks[0].text).toBe('[AI Step 1] Спроектировать схему DRAFT');
    expect(task.subtasks[1].text).toBe('[AI Step 2] Реализовать ручной валидатор');
    expect(task.subtasks[2].text).toBe('[AI Step 3] Интегрировать IPC канал');
    expect(mockSaveTasks).toHaveBeenCalled();
    expect(mockTriggerSyncToast).toHaveBeenCalled();
  });

  it('falls back to local templates with [Локальный шаблон — ИИ офлайн] prefix if IPC throws or fails', async () => {
    const mockTasks = ref<Task[]>([
      {
        id: 'task-sec',
        text: 'Аудит безопасности токенов доступа',
        description: '',
        createdAt: Date.now(),
        completed: false,
        priority: 'medium',
        category: 'sec',
        status: 'todo',
        importance: 'regular',
        estimatedMinutes: 45,
        spentMinutes: 0,
        subtasks: []
      }
    ]);
    const mockSaveTasks = vi.fn();

    (window as any).api = {
      tasksAiDecompose: vi.fn().mockRejectedValue(new Error('Network offline or IPC bridge error'))
    };

    const { decomposeTaskWithAI, decomposingTaskId } = useAiDecomposition(mockTasks, mockSaveTasks);

    await decomposeTaskWithAI('task-sec');

    expect(decomposingTaskId.value).toBeNull();
    const task = mockTasks.value[0];
    expect(task.aiDecomposed).toBe(true);
    expect(task.subtasks.length).toBeGreaterThan(0);
    expect(task.subtasks[0].text).toContain('[Локальный шаблон — ИИ офлайн]');
    expect(mockSaveTasks).toHaveBeenCalled();
  });

  it('resets decomposingTaskId in finally block even if an unexpected exception occurs', async () => {
    const mockTasks = ref<Task[]>([
      {
        id: 'task-err',
        text: 'Тест устойчивости к ошибкам',
        description: '',
        createdAt: Date.now(),
        completed: false,
        priority: 'low',
        category: 'ops',
        status: 'todo',
        importance: 'regular',
        estimatedMinutes: 10,
        spentMinutes: 0,
        subtasks: []
      }
    ]);
    const mockSaveTasks = vi.fn().mockImplementation(() => {
      throw new Error('Save tasks fatal storage crash');
    });

    const { decomposeTaskWithAI, decomposingTaskId } = useAiDecomposition(mockTasks, mockSaveTasks);

    await decomposeTaskWithAI('task-err');

    expect(decomposingTaskId.value).toBeNull();
  });
});
