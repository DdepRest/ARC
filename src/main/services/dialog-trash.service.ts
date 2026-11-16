import { DatabaseService } from './database';
import { DialogService } from './dialog.service';
import {
  type DialogTrashConfig,
  MS_PER_DAY,
  normalizeSessionIds,
  validateRetentionDays,
  getDefaultTrashConfigPath,
  getTrashConfig,
  setTrashConfig
} from './dialog-trash-config';

export type { DialogTrashConfig };
export {
  normalizeSessionIds,
  validateRetentionDays,
  getDefaultTrashConfigPath,
  getTrashConfig,
  setTrashConfig
};

export interface BulkSessionOpResult {
  success: boolean;
  totalRequested: number;
  processedIds: number[];
  skippedIds: number[];
  failed: Array<{ id: number; error: string }>;
  deletedCount?: number;
  error?: string;
}

export interface TrashCleanupResult {
  success: boolean;
  deletedCount: number;
  skipped: boolean;
  retentionDays: number | null;
  error?: string;
}

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_CLEANUP_DELAY_MS = 3500;

function safeModeFailure(totalRequested: number): BulkSessionOpResult {
  return {
    success: false,
    totalRequested,
    processedIds: [],
    skippedIds: [],
    failed: [],
    error: 'База данных находится в защищённом режиме только для чтения (DB_SAFE_MODE)'
  };
}

export class DialogTrashService {
  static archiveSessions(idsInput: unknown, archived: boolean): BulkSessionOpResult {
    const ids = normalizeSessionIds(idsInput);
    if (ids.length === 0) {
      return { success: false, totalRequested: 0, processedIds: [], skippedIds: [], failed: [], error: 'Не выбраны диалоги' };
    }
    if (DatabaseService.isSafeMode()) {
      return safeModeFailure(ids.length);
    }

    const processedIds: number[] = [];
    const skippedIds: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];
    const targetVal = archived ? 1 : 0;

    const runBatch = () => {
      for (const id of ids) {
        try {
          const session = DialogService.getSession(id);
          if (!session) {
            failed.push({ id, error: 'Диалог не найден' });
            continue;
          }
          if (Number(session.is_deleted || 0) === 1) {
            skippedIds.push(id);
            continue;
          }
          if (Number(session.is_archived || 0) === targetVal) {
            processedIds.push(id);
            continue;
          }
          DatabaseService.db
            .prepare('UPDATE sessions SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(targetVal, id);
          processedIds.push(id);
        } catch (err: any) {
          failed.push({ id, error: err?.message || 'Ошибка обновления архива' });
        }
      }
    };

    if (typeof DatabaseService.db?.transaction === 'function') {
      DatabaseService.db.transaction(runBatch)();
    } else {
      runBatch();
    }

    return {
      success: failed.length === 0 && processedIds.length > 0,
      totalRequested: ids.length,
      processedIds,
      skippedIds,
      failed,
      error: failed.length > 0 ? `Не удалось обработать диалогов: ${failed.length}` : undefined
    };
  }

  static moveSessionsToTrash(idsInput: unknown, nowIso: string = new Date().toISOString()): BulkSessionOpResult {
    const ids = normalizeSessionIds(idsInput);
    if (ids.length === 0) {
      return { success: false, totalRequested: 0, processedIds: [], skippedIds: [], failed: [], error: 'Не выбраны диалоги' };
    }
    if (DatabaseService.isSafeMode()) {
      return safeModeFailure(ids.length);
    }

    const processedIds: number[] = [];
    const skippedIds: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];

    const runBatch = () => {
      for (const id of ids) {
        try {
          const session = DialogService.getSession(id);
          if (!session) {
            failed.push({ id, error: 'Диалог не найден' });
            continue;
          }
          // Only active dialogs can be moved to Trash from active list; skip archived and already-trashed
          if (Number(session.is_archived || 0) === 1 || Number(session.is_deleted || 0) === 1) {
            skippedIds.push(id);
            continue;
          }
          DatabaseService.db
            .prepare('UPDATE sessions SET is_deleted = 1, deleted_at = ? WHERE id = ?')
            .run(nowIso, id);
          processedIds.push(id);
        } catch (err: any) {
          failed.push({ id, error: err?.message || 'Ошибка перемещения в корзину' });
        }
      }
    };

    if (typeof DatabaseService.db?.transaction === 'function') {
      DatabaseService.db.transaction(runBatch)();
    } else {
      runBatch();
    }

    return {
      success: failed.length === 0 && processedIds.length > 0,
      totalRequested: ids.length,
      processedIds,
      skippedIds,
      failed,
      error: failed.length > 0 ? `Не удалось переместить в корзину: ${failed.length}` : undefined
    };
  }

  static restoreSessionsFromTrash(idsInput: unknown): BulkSessionOpResult {
    const ids = normalizeSessionIds(idsInput);
    if (ids.length === 0) {
      return { success: false, totalRequested: 0, processedIds: [], skippedIds: [], failed: [], error: 'Не выбраны диалоги' };
    }
    if (DatabaseService.isSafeMode()) {
      return safeModeFailure(ids.length);
    }

    const processedIds: number[] = [];
    const skippedIds: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];

    const runBatch = () => {
      for (const id of ids) {
        try {
          const session = DialogService.getSession(id);
          if (!session) {
            failed.push({ id, error: 'Диалог не найден' });
            continue;
          }
          if (Number(session.is_deleted || 0) !== 1) {
            skippedIds.push(id);
            continue;
          }
          DatabaseService.db
            .prepare('UPDATE sessions SET is_deleted = 0, deleted_at = ?, is_archived = 0 WHERE id = ?')
            .run(null, id);
          processedIds.push(id);
        } catch (err: any) {
          failed.push({ id, error: err?.message || 'Ошибка восстановления диалога' });
        }
      }
    };

    if (typeof DatabaseService.db?.transaction === 'function') {
      DatabaseService.db.transaction(runBatch)();
    } else {
      runBatch();
    }

    return {
      success: failed.length === 0 && processedIds.length > 0,
      totalRequested: ids.length,
      processedIds,
      skippedIds,
      failed,
      error: failed.length > 0 ? `Не удалось восстановить диалогов: ${failed.length}` : undefined
    };
  }

  static permanentlyDeleteSessions(idsInput: unknown): BulkSessionOpResult {
    const ids = normalizeSessionIds(idsInput);
    if (ids.length === 0) {
      return { success: false, totalRequested: 0, processedIds: [], skippedIds: [], failed: [], deletedCount: 0, error: 'Не выбраны диалоги' };
    }
    if (DatabaseService.isSafeMode()) {
      return safeModeFailure(ids.length);
    }

    const processedIds: number[] = [];
    const skippedIds: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];

    const runBatch = () => {
      for (const id of ids) {
        try {
          const session = DialogService.getSession(id);
          if (!session) {
            failed.push({ id, error: 'Диалог не найден' });
            continue;
          }
          if (Number(session.is_deleted || 0) !== 1) {
            skippedIds.push(id);
            continue;
          }
          DialogService.deleteSession(id);
          processedIds.push(id);
        } catch (err: any) {
          failed.push({ id, error: err?.message || 'Ошибка окончательного удаления' });
        }
      }
    };

    if (typeof DatabaseService.db?.transaction === 'function') {
      DatabaseService.db.transaction(runBatch)();
    } else {
      runBatch();
    }

    return {
      success: failed.length === 0 && processedIds.length > 0,
      totalRequested: ids.length,
      processedIds,
      skippedIds,
      failed,
      deletedCount: processedIds.length,
      error: failed.length > 0 ? `Не удалось удалить диалогов: ${failed.length}` : undefined
    };
  }

  static purgeExpiredTrash(
    nowMs: number = Date.now(),
    configPath: string = getDefaultTrashConfigPath()
  ): TrashCleanupResult {
    const cfg = getTrashConfig(configPath);
    if (cfg.retentionDays === null) {
      return { success: true, deletedCount: 0, skipped: true, retentionDays: null };
    }
    if (DatabaseService.isSafeMode()) {
      return {
        success: false,
        deletedCount: 0,
        skipped: true,
        retentionDays: cfg.retentionDays,
        error: 'DB_SAFE_MODE'
      };
    }

    try {
      const cutoffMs = nowMs - cfg.retentionDays * MS_PER_DAY;
      const trashedRows = DatabaseService.db
        .prepare('SELECT id, is_deleted, is_archived, deleted_at FROM sessions WHERE is_deleted = 1')
        .all() as Array<{ id: number; is_deleted: number; is_archived: number; deleted_at: string | null }>;

      const expiredIds: number[] = [];
      for (const row of trashedRows) {
        if (Number(row.is_deleted || 0) !== 1 || Number(row.is_archived || 0) === 1 || !row.deleted_at) {
          continue;
        }
        const deletedMs = Date.parse(row.deleted_at);
        if (Number.isFinite(deletedMs) && deletedMs <= cutoffMs) {
          expiredIds.push(row.id);
        }
      }

      if (expiredIds.length === 0) {
        return { success: true, deletedCount: 0, skipped: false, retentionDays: cfg.retentionDays };
      }

      let deletedCount = 0;
      const runBatch = () => {
        for (const id of expiredIds) {
          DialogService.deleteSession(id);
          deletedCount++;
        }
      };

      if (typeof DatabaseService.db?.transaction === 'function') {
        DatabaseService.db.transaction(runBatch)();
      } else {
        runBatch();
      }

      return { success: true, deletedCount, skipped: false, retentionDays: cfg.retentionDays };
    } catch (e: any) {
      console.error('[DialogTrashService] Auto-cleanup failed:', e);
      return {
        success: false,
        deletedCount: 0,
        skipped: false,
        retentionDays: cfg.retentionDays,
        error: e?.message || 'Ошибка автоочистки корзины'
      };
    }
  }
}

class DialogTrashScheduler {
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private immediateTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  start() {
    this.stop();
    this.startupTimer = setTimeout(() => {
      this.runCleanupSafely();
    }, STARTUP_CLEANUP_DELAY_MS);
    this.intervalTimer = setInterval(() => {
      this.runCleanupSafely();
    }, CLEANUP_INTERVAL_MS);
  }

  scheduleDeferredCleanup() {
    if (this.immediateTimer) {
      clearTimeout(this.immediateTimer);
    }
    this.immediateTimer = setTimeout(() => {
      this.immediateTimer = null;
      this.runCleanupSafely();
    }, 50);
  }

  runCleanupSafely(): TrashCleanupResult {
    if (this.isRunning) {
      return { success: true, deletedCount: 0, skipped: true, retentionDays: getTrashConfig().retentionDays };
    }
    this.isRunning = true;
    try {
      const res = DialogTrashService.purgeExpiredTrash();
      if (res.deletedCount > 0) {
        console.log(`[DialogTrashScheduler] Auto-cleanup permanently deleted ${res.deletedCount} expired dialog(s).`);
      }
      return res;
    } finally {
      this.isRunning = false;
    }
  }

  stop() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.immediateTimer) {
      clearTimeout(this.immediateTimer);
      this.immediateTimer = null;
    }
  }
}

export const dialogTrashScheduler = new DialogTrashScheduler();
