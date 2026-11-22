import { ToolDefinition, ToolInstance, ToolResult } from '../../../shared/types/tools';
import { tasksService } from '../tasks.service';

export class TaskManagementTool implements ToolInstance {
  definition: ToolDefinition = {
    name: 'task_management',
    description: 'Manage operational tasks, to-dos, and objectives: create new tasks, complete existing tasks, delete tasks, or list active tasks.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The operation to perform: "create_task", "complete_task", "list_tasks", "delete_task"',
          enum: ['create_task', 'complete_task', 'list_tasks', 'delete_task']
        },
        text: {
          type: 'string',
          description: 'The title, substring query, or description of the task (e.g. "таблица", "подготовить отчёт").'
        },
        id: {
          type: 'string',
          description: 'The unique ID of the task to complete or delete.'
        },
        priority: {
          type: 'string',
          description: 'Task priority: "low", "medium", or "high". Default is "medium".',
          enum: ['low', 'medium', 'high']
        },
        category: {
          type: 'string',
          description: 'Category / tag identifier (e.g. "ops", "dev", "data", "sec", "general").'
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format (e.g. "2026-09-01").'
        },
        description: {
          type: 'string',
          description: 'Additional notes, description, or context for the task.'
        },
        objective_id: {
          type: 'string',
          description: 'Associated strategic objective ID from the Objective Engine if applicable.'
        }
      },
      required: ['action']
    }
  };

  async execute(params: {
    action: string;
    text?: string;
    id?: string;
    priority?: string;
    category?: string;
    due_date?: string;
    description?: string;
    objective_id?: string;
  }): Promise<ToolResult> {
    const { action, text, id, priority = 'medium', category = 'ops', due_date, description = '', objective_id } = params;

    try {
      if (action === 'create_task') {
        if (!text || !text.trim()) {
          return { success: false, error: 'Task text is required for create_task action', toolName: this.definition.name };
        }

        const created = tasksService.createTask({
          text: text.trim(),
          description: description.trim(),
          priority: (priority as any) || 'medium',
          category: category || 'ops',
          dueDate: due_date,
          objectiveId: objective_id,
          completed: false,
          status: 'todo'
        }, 'ai_tool');

        if (!created) {
          return {
            success: false,
            error: 'Failed to create task in database',
            toolName: this.definition.name
          };
        }

        return {
          success: true,
          data: `Task successfully created: "${created.text}" (ID: ${created.id}, Priority: ${created.priority}, Due: ${created.dueDate || 'none'})`,
          toolName: this.definition.name
        };
      }

      if (action === 'complete_task') {
        if (!id && !text) {
          return { success: false, error: 'Task id or matching text is required for complete_task action', toolName: this.definition.name };
        }

        let targetId = id;
        if (!targetId && text) {
          const all = tasksService.getAllTasks();
          const active = all.filter(t => !t.completed);
          const query = text.toLowerCase().trim();
          const match = active.find(t => t.text.toLowerCase().includes(query));
          if (match) {
            targetId = match.id;
          } else {
            const taskTitles = active.length > 0 ? active.map(t => `"${t.text}"`).join(', ') : 'нет';
            return {
              success: false,
              error: `Активная задача не найдена по запросу "${text}". Список активных задач: [${taskTitles}]`,
              toolName: this.definition.name
            };
          }
        }

        if (!targetId) {
          return { success: false, error: `No active task found matching "${text}"`, toolName: this.definition.name };
        }

        const ok = tasksService.completeTask(targetId);
        return {
          success: ok,
          data: ok ? `Task ${targetId} marked as completed.` : `Failed to complete task ${targetId}`,
          toolName: this.definition.name
        };
      }

      if (action === 'delete_task') {
        if (!id && !text) {
          return {
            success: false,
            error: 'Для удаления задачи укажите название задачи или её идентификатор.',
            toolName: this.definition.name
          };
        }

        const all = tasksService.getAllTasks();
        let targetTask: any = null;

        if (id) {
          targetTask = all.find(t => t.id === id);
        }

        if (!targetTask && text) {
          const query = text.toLowerCase().trim();
          // Fuzzy matching: search by substring (case-insensitive)
          const matches = all.filter(t => t.text.toLowerCase().includes(query));

          if (matches.length === 0) {
            const taskTitles = all.length > 0 ? all.map(t => `"${t.text}"`).join(', ') : 'нет';
            return {
              success: false,
              error: `Задача не найдена. Список задач: [${taskTitles}]`,
              toolName: this.definition.name
            };
          }

          if (matches.length > 1) {
            // If there is an exact match among multiple candidates, pick it
            const exactMatch = matches.find(t => t.text.toLowerCase().trim() === query);
            if (exactMatch) {
              targetTask = exactMatch;
            } else {
              const titles = matches.map(t => `"${t.text}"`).join(', ');
              return {
                success: false,
                error: `Найдено несколько задач: [${titles}]. Уточните, какую именно удалить.`,
                toolName: this.definition.name
              };
            }
          } else {
            targetTask = matches[0];
          }
        }

        if (!targetTask) {
          const taskTitles = all.length > 0 ? all.map(t => `"${t.text}"`).join(', ') : 'нет';
          return {
            success: false,
            error: `Задача не найдена. Список задач: [${taskTitles}]`,
            toolName: this.definition.name
          };
        }

        const ok = tasksService.deleteTask(targetTask.id);
        return {
          success: ok,
          data: ok ? `Задача "${targetTask.text}" удалена.` : `Не удалось удалить задачу ${targetTask.id}`,
          toolName: this.definition.name
        };
      }

      if (action === 'list_tasks') {
        const all = tasksService.getAllTasks();
        const active = all.filter(t => !t.completed);

        if (active.length === 0) {
          return {
            success: true,
            message: 'Список задач пуст, всего 0 активных задач',
            data: {
              message: 'Список задач пуст, всего 0 активных задач',
              tasks: [],
              total: 0
            },
            tasks: [],
            total: 0,
            toolName: this.definition.name
          } as ToolResult;
        }

        const formatted = active.slice(0, 10).map((t, idx) => `${idx + 1}. [${t.priority.toUpperCase()}] ${t.text}${t.dueDate ? ` (Due: ${t.dueDate})` : ''} (ID: ${t.id})`).join('\n');
        return {
          success: true,
          tasks: active,
          total: active.length,
          data: {
            tasks: active,
            total: active.length,
            formatted: `Активные задачи (${active.length}):\n${formatted}`
          },
          toolName: this.definition.name
        } as ToolResult;
      }

      return {
        success: false,
        error: `Unknown action: ${action}`,
        toolName: this.definition.name
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        toolName: this.definition.name
      };
    }
  }
}
