import { ipcMain } from 'electron';
import { tasksService, type TaskMutationSource } from '../services/tasks.service';
import { objectiveDecomposerService } from '../services/objective/objective-decomposer.service';

export function registerTasksIpc() {
  ipcMain.handle('tasks:list', () => {
    return tasksService.getAllTasks();
  });

  ipcMain.handle('tasks:saveAll', (_event, tasks) => {
    return tasksService.saveAllTasks(tasks, 'renderer');
  });

  ipcMain.handle('tasks:create', (_event, taskData) => {
    return tasksService.createTask(taskData, 'renderer');
  });

  ipcMain.handle('tasks:complete', (_event, id) => {
    return tasksService.completeTask(id, 'renderer');
  });

  ipcMain.handle('tasks:delete', (_event, id) => {
    const ok = tasksService.deleteTask(id, 'renderer');
    return {
      success: ok,
      id,
      error: ok ? undefined : `Failed to delete task ${id}`
    };
  });

  ipcMain.handle('tasks:upsert', (_event, taskData) => {
    const task = tasksService.upsertTask(taskData, 'renderer');
    return {
      success: Boolean(task),
      task: task ?? undefined,
      error: task ? undefined : 'Failed to upsert task'
    };
  });

  ipcMain.handle('tasks:batch-upsert', (_event, payload) => {
    const isWrapped = payload && !Array.isArray(payload) && Array.isArray(payload.tasks);
    const tasks = isWrapped ? payload.tasks : payload;
    const source: TaskMutationSource =
      isWrapped && (payload.source === 'renderer' || payload.source === 'ai_tool' || payload.source === 'system')
        ? payload.source
        : 'renderer';

    const result = tasksService.batchUpsertTasks(tasks, source);
    return {
      success: result.success,
      tasks: result.tasks,
      failed: result.failed,
      error: result.failed.length > 0 ? 'Some tasks failed to upsert' : undefined
    };
  });

  ipcMain.handle('tasks:clear-all', () => {
    const ok = tasksService.clearAllTasks('renderer');
    return {
      success: ok,
      error: ok ? undefined : 'Failed to clear all tasks'
    };
  });

  ipcMain.handle('tasks:ai-decompose', async (_event, payload: { taskId?: string; taskText?: string } | undefined) => {
    const taskId = typeof payload?.taskId === 'string' ? payload.taskId : '';
    const taskText = typeof payload?.taskText === 'string' ? payload.taskText : '';
    try {
      if (!taskText.trim()) {
        return {
          success: false,
          taskId,
          steps: [],
          source: 'local_template' as const,
          fallbackReason: 'empty_task_text' as const,
          error: 'Task text is required'
        };
      }
      const result = await objectiveDecomposerService.decomposeTask(taskText);
      return {
        success: result.steps.length > 0,
        taskId,
        steps: result.steps,
        source: result.source,
        fallbackReason: result.fallbackReason
      };
    } catch (err: any) {
      return {
        success: false,
        taskId,
        steps: [],
        source: 'local_template' as const,
        fallbackReason: 'ipc_error' as const,
        error: err?.message || String(err)
      };
    }
  });
}
