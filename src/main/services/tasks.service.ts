import { BrowserWindow } from 'electron';
import { DatabaseService } from './database';

export type TaskMutationSource = 'renderer' | 'ai_tool' | 'system';

export interface TaskRecord {
  id: string;
  text: string;
  description?: string;
  completed: number;
  created_at: number;
  completed_at?: number | null;
  updated_at: number;
  priority: string;
  category: string;
  due_date?: string | null;
  status: string;
  importance: string;
  estimated_minutes: number;
  spent_minutes: number;
  ai_decomposed: number;
  is_my_day: number;
  recurrence?: string | null;
  attachments?: string | null;
  auto_rest_seconds?: number | null;
  objective_id?: string | null;
  subtasks?: string | null;
}

export interface TaskDTO {
  id: string;
  text: string;
  description: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  updatedAt: number;
  updated_at: number;
  priority: string;
  category: string;
  dueDate?: string;
  status: string;
  importance: string;
  estimatedMinutes: number;
  spentMinutes: number;
  aiDecomposed: boolean;
  isMyDay: boolean;
  recurrence?: any;
  attachments: any[];
  autoRestSeconds?: number;
  objectiveId?: string;
  subtasks: any[];
}

export interface TaskChangedPayload {
  action: 'created' | 'updated' | 'completed' | 'deleted' | 'batch' | 'reload';
  task?: TaskDTO;
  id?: string;
  tasks?: TaskDTO[];
  source: TaskMutationSource;
}

export interface BatchUpsertResult {
  success: boolean;
  tasks: TaskDTO[];
  failed: Array<{ id?: string; error: string }>;
}

export function broadcastTasksChanged(payload: TaskChangedPayload): void {
  try {
    const wins = BrowserWindow?.getAllWindows ? BrowserWindow.getAllWindows() : [];
    for (const win of wins) {
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send('tasks:changed', payload);
      }
    }
  } catch (err) {
    console.warn('[TasksService] Failed to broadcast tasks:changed:', err);
  }
}

function serializeJsonField(val: any, fallback: string | null = null): string | null {
  if (val === undefined || val === null) return fallback;
  return typeof val === 'string' ? val : JSON.stringify(val);
}

function parseJsonField<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch (_) {
    return fallback;
  }
}

export class TasksService {
  private static instance: TasksService;

  public static getInstance(): TasksService {
    if (!TasksService.instance) TasksService.instance = new TasksService();
    return TasksService.instance;
  }

  private mapRowToTask(row: any): TaskDTO | null {
    if (!row) return null;
    const subtasks = parseJsonField<any[]>(row.subtasks, []);
    const recurrence = parseJsonField<any>(row.recurrence, undefined);
    const attachments = parseJsonField<any[]>(row.attachments, []);
    const createdAt = Number(row.created_at) || Date.now();
    const updatedAt = Number(row.updated_at) || createdAt;

    return {
      id: row.id,
      text: row.text || '',
      description: row.description || '',
      completed: Boolean(row.completed),
      createdAt,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      updatedAt,
      updated_at: updatedAt,
      priority: row.priority || 'medium',
      category: row.category || 'ops',
      dueDate: row.due_date || undefined,
      status: row.status || (row.completed ? 'done' : 'todo'),
      importance: row.importance || 'regular',
      estimatedMinutes: Number(row.estimated_minutes) || 30,
      spentMinutes: Number(row.spent_minutes) || 0,
      aiDecomposed: Boolean(row.ai_decomposed),
      isMyDay: Boolean(row.is_my_day),
      recurrence,
      attachments: Array.isArray(attachments) ? attachments : [],
      autoRestSeconds: row.auto_rest_seconds ? Number(row.auto_rest_seconds) : undefined,
      objectiveId: row.objective_id || undefined,
      subtasks: Array.isArray(subtasks) ? subtasks : []
    };
  }

  private upsertTaskInTx(db: any, taskData: any): { saved: TaskDTO; isUpdate: boolean } {
    if (!taskData || typeof taskData !== 'object') {
      throw new Error('Invalid task payload: expected an object');
    }
    if (typeof taskData.text !== 'string' || !taskData.text.trim()) {
      throw new Error('Invalid task payload: non-empty text is required');
    }

    const id = String(taskData.id || 'task-' + Math.random().toString(36).substring(2, 9)).trim();
    const existing = db.prepare(`SELECT created_at, updated_at FROM arc_tasks WHERE id = ?`).get(id) as
      | { created_at: number; updated_at: number }
      | undefined;

    const now = Date.now();
    const createdAt = Number(taskData.createdAt ?? taskData.created_at ?? existing?.created_at ?? now) || now;
    const incomingUpdated = Number(taskData.updatedAt ?? taskData.updated_at ?? 0) || 0;
    const nextUpdatedAt = existing
      ? Math.max(now, Number(existing.updated_at || 0) + 1, incomingUpdated)
      : Math.max(now, incomingUpdated, createdAt);

    const completed = taskData.completed ? 1 : 0;
    const completedAt = taskData.completed
      ? Number(taskData.completedAt ?? taskData.completed_at ?? now)
      : null;

    const stmt = db.prepare(`
      INSERT INTO arc_tasks (
        id, text, description, completed, created_at, completed_at, updated_at,
        priority, category, due_date, status, importance,
        estimated_minutes, spent_minutes, ai_decomposed, is_my_day,
        recurrence, attachments, auto_rest_seconds, objective_id, subtasks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text, description = excluded.description,
        completed = excluded.completed, completed_at = excluded.completed_at,
        updated_at = MAX(excluded.updated_at, arc_tasks.updated_at),
        priority = excluded.priority, category = excluded.category,
        due_date = excluded.due_date, status = excluded.status,
        importance = excluded.importance, estimated_minutes = excluded.estimated_minutes,
        spent_minutes = excluded.spent_minutes, ai_decomposed = excluded.ai_decomposed,
        is_my_day = excluded.is_my_day, recurrence = excluded.recurrence,
        attachments = excluded.attachments, auto_rest_seconds = excluded.auto_rest_seconds,
        objective_id = excluded.objective_id, subtasks = excluded.subtasks
    `);

    stmt.run(
      id,
      taskData.text.trim(),
      taskData.description || '',
      completed,
      createdAt,
      completedAt,
      nextUpdatedAt,
      taskData.priority || 'medium',
      taskData.category || 'ops',
      taskData.dueDate ?? taskData.due_date ?? null,
      taskData.status || (completed ? 'done' : 'todo'),
      taskData.importance || 'regular',
      Number(taskData.estimatedMinutes ?? taskData.estimated_minutes) || 30,
      Number(taskData.spentMinutes ?? taskData.spent_minutes) || 0,
      taskData.aiDecomposed || taskData.ai_decomposed ? 1 : 0,
      taskData.isMyDay || taskData.is_my_day ? 1 : 0,
      serializeJsonField(taskData.recurrence, null),
      serializeJsonField(taskData.attachments, null),
      taskData.autoRestSeconds ?? taskData.auto_rest_seconds ?? null,
      taskData.objectiveId ?? taskData.objective_id ?? null,
      serializeJsonField(taskData.subtasks, '[]')
    );

    const row = db.prepare(`SELECT * FROM arc_tasks WHERE id = ?`).get(id);
    const saved = this.mapRowToTask(row);
    if (!saved) throw new Error(`Failed to read back task ${id} after upsert`);

    return { saved, isUpdate: Boolean(existing) };
  }

  public getAllTasks(): TaskDTO[] {
    try {
      const db = DatabaseService.db;
      if (!db) return [];
      const stmt = db.prepare(`SELECT * FROM arc_tasks ORDER BY created_at DESC`);
      const rows = stmt.all ? stmt.all() : [];
      return rows.map((r: any) => this.mapRowToTask(r)).filter(Boolean) as TaskDTO[];
    } catch (e) {
      console.error('[TasksService] Failed to load tasks from DB:', e);
      return [];
    }
  }

  public upsertTask(taskData: any, source: TaskMutationSource = 'renderer', emitBroadcast = true): TaskDTO | null {
    try {
      const db = DatabaseService.db;
      if (!db) return null;
      const runTx = db.transaction(() => this.upsertTaskInTx(db, taskData));
      const { saved, isUpdate } = runTx();
      if (emitBroadcast) {
        broadcastTasksChanged({ action: isUpdate ? 'updated' : 'created', task: saved, source });
      }
      return saved;
    } catch (e) {
      console.error('[TasksService] Failed to upsert task:', e);
      return null;
    }
  }

  public batchUpsertTasks(tasks: any[], source: TaskMutationSource = 'renderer'): BatchUpsertResult {
    const savedTasks: TaskDTO[] = [];
    const failed: Array<{ id?: string; error: string }> = [];
    try {
      const db = DatabaseService.db;
      if (!db || !Array.isArray(tasks)) {
        return { success: false, tasks: [], failed: [{ error: 'Database unavailable or invalid tasks array' }] };
      }

      const upsertSingleItemTx = db.transaction((item: any) => this.upsertTaskInTx(db, item));
      const runBatchTx = db.transaction((items: any[]) => {
        for (const item of items) {
          try {
            const { saved } = upsertSingleItemTx(item);
            savedTasks.push(saved);
          } catch (itemErr: any) {
            failed.push({
              id: item && typeof item === 'object' ? item.id : undefined,
              error: itemErr?.message || String(itemErr)
            });
          }
        }
      });

      runBatchTx(tasks);
      if (savedTasks.length > 0) {
        broadcastTasksChanged({ action: 'batch', tasks: savedTasks, source });
      }
      return { success: failed.length === 0, tasks: savedTasks, failed };
    } catch (e: any) {
      console.error('[TasksService] Failed to batch upsert tasks:', e);
      return { success: false, tasks: savedTasks, failed: [...failed, { error: e?.message || String(e) }] };
    }
  }

  public saveAllTasks(tasks: any[], source: TaskMutationSource = 'renderer'): boolean {
    return this.batchUpsertTasks(tasks, source).success;
  }

  public createTask(data: any, source: TaskMutationSource = 'ai_tool'): TaskDTO | null {
    try {
      const db = DatabaseService.db;
      if (!db) return null;
      const runTx = db.transaction(() => this.upsertTaskInTx(db, data));
      const { saved } = runTx();
      broadcastTasksChanged({ action: 'created', task: saved, source });
      return saved;
    } catch (e) {
      console.error('[TasksService] Failed to create task:', e);
      return null;
    }
  }

  public updateTask(id: string, patch: any, source: TaskMutationSource = 'renderer'): TaskDTO | null {
    try {
      const db = DatabaseService.db;
      if (!db || !id) return null;
      const runTx = db.transaction(() => {
        const existingRow = db.prepare(`SELECT * FROM arc_tasks WHERE id = ?`).get(id);
        const existingTask = this.mapRowToTask(existingRow);
        if (!existingTask) throw new Error(`Task not found: ${id}`);
        return this.upsertTaskInTx(db, { ...existingTask, ...patch, id });
      });
      const { saved } = runTx();
      broadcastTasksChanged({ action: 'updated', task: saved, source });
      return saved;
    } catch (e) {
      console.error('[TasksService] Failed to update task:', e);
      return null;
    }
  }

  public completeTask(id: string, source: TaskMutationSource = 'ai_tool'): boolean {
    try {
      const db = DatabaseService.db;
      if (!db || !id) return false;
      const runTx = db.transaction(() => {
        const existing = db.prepare(`SELECT * FROM arc_tasks WHERE id = ?`).get(id);
        if (!existing) return null;
        const now = Date.now();
        const nextUpdatedAt = Math.max(now, Number(existing.updated_at || 0) + 1);
        db.prepare(
          `UPDATE arc_tasks SET completed = 1, status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`
        ).run(now, nextUpdatedAt, id);
        return this.mapRowToTask(db.prepare(`SELECT * FROM arc_tasks WHERE id = ?`).get(id));
      });
      const updatedTask = runTx();
      if (!updatedTask) return false;
      broadcastTasksChanged({ action: 'completed', task: updatedTask, id, source });
      return true;
    } catch (e) {
      console.error('[TasksService] Failed to complete task:', e);
      return false;
    }
  }

  public deleteTask(id: string, source: TaskMutationSource = 'ai_tool'): boolean {
    try {
      const db = DatabaseService.db;
      if (!db || !id) return false;
      const runTx = db.transaction(() => db.prepare(`DELETE FROM arc_tasks WHERE id = ?`).run(id));
      const res = runTx();
      const deleted = Boolean(res && res.changes > 0);
      if (deleted) broadcastTasksChanged({ action: 'deleted', id, source });
      return deleted;
    } catch (e) {
      console.error('[TasksService] Failed to delete task:', e);
      return false;
    }
  }

  public clearAllTasks(source: TaskMutationSource = 'renderer'): boolean {
    try {
      const db = DatabaseService.db;
      if (!db) return false;
      const runTx = db.transaction(() => {
        db.prepare(`DELETE FROM arc_tasks`).run();
      });
      runTx();
      broadcastTasksChanged({ action: 'reload', tasks: [], source });
      return true;
    } catch (e) {
      console.error('[TasksService] Failed to clear all tasks:', e);
      return false;
    }
  }
}

export const tasksService = TasksService.getInstance();
