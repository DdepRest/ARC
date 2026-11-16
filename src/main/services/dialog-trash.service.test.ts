import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
    isPackaged: false
  },
  dialog: {
    showSaveDialog: vi.fn()
  }
}));

import { DatabaseService, JSONDatabase } from './database';
import { DialogService } from './dialog.service';
import {
  DialogTrashService,
  dialogTrashScheduler,
  getTrashConfig,
  setTrashConfig,
  validateRetentionDays
} from './dialog-trash.service';

describe('DialogTrashService & Migration & Auto-Cleanup', () => {
  let tmpDir: string;
  let dbPath: string;
  let configPath: string;

  function initTestJsonDb(seedLegacy = false) {
    if (seedLegacy) {
      fs.writeFileSync(
        dbPath,
        JSON.stringify({
          sessions: [
            {
              id: 10,
              name: 'Legacy Active',
              summary: 'old active',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
              message_count: 1,
              is_pinned: 0,
              is_archived: 0,
              tags: null
            },
            {
              id: 20,
              name: 'Legacy Archived',
              summary: 'old archived',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
              message_count: 0,
              is_pinned: 0,
              is_archived: 1,
              tags: null
            }
          ],
          messages: [
            {
              id: 100,
              session_id: 10,
              role: 'user',
              content: 'hello legacy',
              metadata: null,
              created_at: '2026-01-01T00:00:00.000Z'
            }
          ]
        }),
        'utf-8'
      );
    }

    const jdb = new JSONDatabase(dbPath);
    (DatabaseService as any).db = jdb;
    (DatabaseService as any).healthStatus = {
      mode: 'NORMAL_RW',
      isSafeMode: false,
      readOnly: false,
      recoveryExecuted: false,
      backupCreated: false,
      fallbackUsed: true,
      storageStatus: 'PERSISTENT_FALLBACK_JSON'
    };
    (DatabaseService as any).initTables();
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-dialog-trash-test-'));
    dbPath = path.join(tmpDir, 'test_fallback.json');
    configPath = path.join(tmpDir, 'trash-config.json');
    initTestJsonDb(false);
  });

  afterEach(() => {
    dialogTrashScheduler.stop();
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('idempotently migrates legacy sessions without losing active or archived dialogs', () => {
    initTestJsonDb(true);
    // Run migration twice to verify idempotency
    (DatabaseService as any).initTables();

    const active = DialogService.listSessions(50, 0, { archived: false });
    const archived = DialogService.listSessions(50, 0, { archived: true });
    const trash = DialogService.listSessions(50, 0, { trash: true });

    expect(active.map((s) => s.id)).toEqual([10]);
    expect(archived.map((s) => s.id)).toEqual([20]);
    expect(trash).toEqual([]);
    expect(DialogService.getMessages(10)).toHaveLength(1);
  });

  it('bulk archives and unarchives while preserving messages and skipping trashed dialogs', () => {
    const s1 = DialogService.createSession('Active 1');
    const s2 = DialogService.createSession('Active 2');
    const s3 = DialogService.createSession('Already Trashed');
    DialogService.addMessage(s1.id, 'user', 'Persist my message');
    DialogTrashService.moveSessionsToTrash([s3.id]);

    const res = DialogTrashService.archiveSessions([s1.id, s2.id, s3.id, 999999], true);
    expect(res.success).toBe(false); // 999999 failed
    expect(res.processedIds).toEqual([s1.id, s2.id]);
    expect(res.skippedIds).toEqual([s3.id]);
    expect(res.failed).toHaveLength(1);

    expect(DialogService.listSessions(50, 0, { archived: true }).map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    expect(DialogService.listSessions(50, 0, { archived: false })).toHaveLength(0);
    expect(DialogService.getMessages(s1.id)).toHaveLength(1);

    const unarchiveRes = DialogTrashService.archiveSessions([s1.id], false);
    expect(unarchiveRes.success).toBe(true);
    expect(DialogService.listSessions(50, 0, { archived: false }).map((s) => s.id)).toEqual([s1.id]);
  });

  it('moves only active dialogs to trash (never archived), restores to active, and permanently deletes from trash', () => {
    const active1 = DialogService.createSession('Act 1');
    const active2 = DialogService.createSession('Act 2');
    const arch = DialogService.createSession('Archived');
    DialogService.addMessage(active1.id, 'user', 'Keep across trash/restore');
    DialogTrashService.archiveSessions([arch.id], true);

    const trashRes = DialogTrashService.moveSessionsToTrash([active1.id, active2.id, arch.id]);
    expect(trashRes.success).toBe(true);
    expect(trashRes.processedIds).toEqual([active1.id, active2.id]);
    expect(trashRes.skippedIds).toEqual([arch.id]);

    expect(DialogService.listSessions(50, 0, { archived: false })).toHaveLength(0);
    expect(DialogService.listSessions(50, 0, { archived: true }).map((s) => s.id)).toEqual([arch.id]);
    expect(DialogService.listSessions(50, 0, { trash: true }).map((s) => s.id).sort()).toEqual([active1.id, active2.id].sort());

    // Restore active1 back to active list
    const restoreRes = DialogTrashService.restoreSessionsFromTrash([active1.id]);
    expect(restoreRes.success).toBe(true);
    expect(DialogService.listSessions(50, 0, { archived: false }).map((s) => s.id)).toEqual([active1.id]);
    expect(DialogService.getMessages(active1.id)).toHaveLength(1);

    // Permanent delete refuses active dialog active1 and deletes trashed active2
    const permRes = DialogTrashService.permanentlyDeleteSessions([active1.id, active2.id]);
    expect(permRes.success).toBe(true);
    expect(permRes.processedIds).toEqual([active2.id]);
    expect(permRes.skippedIds).toEqual([active1.id]);
    expect(DialogService.getSession(active2.id)).toBeUndefined();
    expect(DialogService.getSession(active1.id)).toBeDefined();
  });

  it('validates trash retention days strictly and leaves invalid configs unsaved', () => {
    expect(getTrashConfig(configPath)).toEqual({ retentionDays: null });

    expect(validateRetentionDays(null)).toEqual({ valid: true, retentionDays: null });
    expect(validateRetentionDays('off')).toEqual({ valid: true, retentionDays: null });
    expect(validateRetentionDays(30)).toEqual({ valid: true, retentionDays: 30 });
    expect(validateRetentionDays('14')).toEqual({ valid: true, retentionDays: 14 });

    for (const bad of ['', '   ', '0', 0, -3, 1.5, '7.5', 'abc', NaN]) {
      expect(validateRetentionDays(bad).valid).toBe(false);
    }

    const okSave = setTrashConfig(7, configPath);
    expect(okSave.success).toBe(true);
    expect(getTrashConfig(configPath)).toEqual({ retentionDays: 7 });

    const badSave = setTrashConfig('-2', configPath);
    expect(badSave.success).toBe(false);
    expect(getTrashConfig(configPath)).toEqual({ retentionDays: 7 });
  });

  it('purges only expired trashed dialogs on auto-cleanup, skips when disabled, and is idempotent', () => {
    const expired = DialogService.createSession('Expired Trash');
    const fresh = DialogService.createSession('Fresh Trash');
    const active = DialogService.createSession('Active');
    const archived = DialogService.createSession('Archived');

    DialogService.addMessage(expired.id, 'user', 'delete me');
    DialogService.addMessage(fresh.id, 'user', 'keep me');
    DialogTrashService.archiveSessions([archived.id], true);

    const nowMs = Date.UTC(2026, 10, 16, 12, 0, 0);
    const tenDaysAgo = new Date(nowMs - 10 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();

    DialogTrashService.moveSessionsToTrash([expired.id], tenDaysAgo);
    DialogTrashService.moveSessionsToTrash([fresh.id], twoDaysAgo);

    // Disabled by default -> skips cleanup
    const disabledRes = DialogTrashService.purgeExpiredTrash(nowMs, configPath);
    expect(disabledRes.skipped).toBe(true);
    expect(disabledRes.deletedCount).toBe(0);
    expect(DialogService.getSession(expired.id)).toBeDefined();

    // Enable 7-day retention -> only expired deleted
    setTrashConfig(7, configPath);
    const cleanupRes = DialogTrashService.purgeExpiredTrash(nowMs, configPath);
    expect(cleanupRes.success).toBe(true);
    expect(cleanupRes.skipped).toBe(false);
    expect(cleanupRes.deletedCount).toBe(1);

    expect(DialogService.getSession(expired.id)).toBeUndefined();
    expect(DialogService.getMessages(expired.id)).toEqual([]);
    expect(DialogService.getSession(fresh.id)).toBeDefined();
    expect(DialogService.getSession(active.id)).toBeDefined();
    expect(DialogService.getSession(archived.id)).toBeDefined();

    // Idempotent second run
    const secondRun = DialogTrashService.purgeExpiredTrash(nowMs, configPath);
    expect(secondRun.deletedCount).toBe(0);
    expect(DialogService.getSession(fresh.id)).toBeDefined();
  });

  it('runs scheduler startup cleanup timer and cleans up timers on stop()', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(DialogTrashService, 'purgeExpiredTrash').mockReturnValue({
      success: true,
      deletedCount: 0,
      skipped: true,
      retentionDays: null
    });

    dialogTrashScheduler.start();
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3600);
    expect(spy).toHaveBeenCalledTimes(1);

    dialogTrashScheduler.stop();
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
