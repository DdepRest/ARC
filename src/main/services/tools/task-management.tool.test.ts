import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskManagementTool } from './task-management.tool';
import { tasksService } from '../tasks.service';

vi.mock('../tasks.service', () => {
  return {
    tasksService: {
      getAllTasks: vi.fn(),
      deleteTask: vi.fn(),
      createTask: vi.fn(),
      completeTask: vi.fn()
    }
  };
});

describe('TaskManagementTool', () => {
  let tool: TaskManagementTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new TaskManagementTool();
  });

  describe('list_tasks', () => {
    it('returns explicit message when task list is empty', async () => {
      vi.mocked(tasksService.getAllTasks).mockReturnValue([]);

      const result = await tool.execute({ action: 'list_tasks' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Список задач пуст, всего 0 активных задач');
      expect((result.data as any).message).toBe('Список задач пуст, всего 0 активных задач');
      expect(result.total).toBe(0);
    });

    it('returns tasks when active tasks exist', async () => {
      vi.mocked(tasksService.getAllTasks).mockReturnValue([
        { id: '1', text: 'Подготовить отчёт', priority: 'high', completed: false, category: 'work' },
        { id: '2', text: 'Собрать метрики', priority: 'medium', completed: true, category: 'work' }
      ] as any);

      const result = await tool.execute({ action: 'list_tasks' });

      expect(result.success).toBe(true);
      expect(result.total).toBe(1);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks![0].text).toBe('Подготовить отчёт');
    });
  });

  describe('delete_task', () => {
    it('fuzzy matches task by substring and deletes it', async () => {
      vi.mocked(tasksService.getAllTasks).mockReturnValue([
        { id: 'task-100', text: 'таблица сравнения провайдеров', priority: 'high', completed: false },
        { id: 'task-101', text: 'купить кофе', priority: 'low', completed: false }
      ] as any);
      vi.mocked(tasksService.deleteTask).mockReturnValue(true);

      const result = await tool.execute({ action: 'delete_task', text: 'таблица' });

      expect(result.success).toBe(true);
      expect(tasksService.deleteTask).toHaveBeenCalledWith('task-100');
      expect(result.data).toContain('таблица сравнения провайдеров');
    });

    it('returns explicit error with list of task titles when task is not found', async () => {
      vi.mocked(tasksService.getAllTasks).mockReturnValue([
        { id: 'task-101', text: 'купить кофе', priority: 'low', completed: false }
      ] as any);

      const result = await tool.execute({ action: 'delete_task', text: 'таблица' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Задача не найдена. Список задач: ["купить кофе"]');
      expect(tasksService.deleteTask).not.toHaveBeenCalled();
    });

    it('asks user for clarification if multiple matches are found without exact match', async () => {
      vi.mocked(tasksService.getAllTasks).mockReturnValue([
        { id: 'task-1', text: 'таблица сравнения моделей', priority: 'high', completed: false },
        { id: 'task-2', text: 'таблица цен провайдеров', priority: 'medium', completed: false }
      ] as any);

      const result = await tool.execute({ action: 'delete_task', text: 'таблица' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Найдено несколько задач');
      expect(result.error).toContain('Уточните, какую именно удалить');
      expect(tasksService.deleteTask).not.toHaveBeenCalled();
    });
  });
});
