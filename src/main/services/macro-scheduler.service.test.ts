import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

import {
  MacroSchedulerService,
  localDateStr,
  todayLocalAtHHMM,
  CATCH_UP_WINDOW_MS,
} from './macro-scheduler.service';

describe('MacroSchedulerService (Task 3.3)', () => {
  let tmpDir: string;
  let macrosDir: string;
  let stateFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-macro-sched-'));
    macrosDir = path.join(tmpDir, 'macros');
    fs.mkdirSync(macrosDir, { recursive: true });
    stateFilePath = path.join(tmpDir, 'macros-schedule-state.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  function writeMacro(id: string, macroData: Record<string, any>) {
    fs.writeFileSync(path.join(macrosDir, `${id}.json`), JSON.stringify(macroData, null, 2), 'utf-8');
  }

  it('fires a scheduled timer macro once when current local time matches HH:MM and records lastRunDate', async () => {
    writeMacro('morning-brief', {
      name: 'Morning Brief',
      enabled: true,
      nodes: [
        { id: 1, type: 'triggers/timer', properties: { time: '08:00' } },
        { id: 2, type: 'actions/speak', properties: { text: 'Доброе утро' } },
      ],
    });

    const executeMock = vi.fn().mockResolvedValue(undefined);
    const now = new Date('2026-04-19T08:00:10.000Z');
    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => now,
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    await scheduler.checkNow();

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock.mock.calls[0][0].id).toBe('morning-brief');

    const savedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    expect(savedState['morning-brief::1']).toBeDefined();
    expect(savedState['morning-brief::1'].lastRunDate).toBe('2026-04-19');

    scheduler.stop();
    scheduler.stop(); // idempotent stop check
    expect(scheduler.isRunning()).toBe(false);
  });

  it('does not fire the same macro::nodeId twice on the same local date even across multiple ticks and service restarts', async () => {
    writeMacro('daily-sync', {
      name: 'Daily Sync',
      enabled: true,
      nodes: [{ id: 10, type: 'triggers/timer', properties: { time: '09:30' } }],
    });

    const executeMock = vi.fn().mockResolvedValue(undefined);
    let currentTime = new Date('2026-04-19T09:30:05.000Z');

    const scheduler1 = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => currentTime,
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    await scheduler1.checkNow();
    currentTime = new Date('2026-04-19T09:35:00.000Z');
    await scheduler1.checkNow();
    expect(executeMock).toHaveBeenCalledTimes(1);

    // Simulate app restart with same stateFilePath on the same day
    const scheduler2 = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => currentTime,
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    await scheduler2.checkNow();
    expect(executeMock).toHaveBeenCalledTimes(1);

    // Next local day -> should fire again
    currentTime = new Date('2026-04-20T09:31:00.000Z');
    await scheduler2.checkNow();
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('catches up a missed timer macro on checkNow() (resume/unlock-screen) when within the 15-minute catch-up window', async () => {
    writeMacro('wake-up-macro', {
      name: 'Wake Up Macro',
      enabled: true,
      nodes: [{ id: 1, type: 'triggers/timer', properties: { time: '08:00' } }],
    });

    const executeMock = vi.fn().mockResolvedValue(undefined);
    // System slept at 07:55 and resumed at 08:07 (+7 min <= 15 min catch-up window)
    const resumedTime = new Date('2026-04-19T08:07:00.000Z');

    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => resumedTime,
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    await scheduler.checkNow();
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('skips catch-up and marks lastRunDate when missed by more than 15 minutes', async () => {
    writeMacro('stale-macro', {
      name: 'Stale Macro',
      enabled: true,
      nodes: [{ id: 5, type: 'triggers/timer', properties: { time: '08:00' } }],
    });

    const executeMock = vi.fn().mockResolvedValue(undefined);
    // Resumed at 11:00 (3 hours > CATCH_UP_WINDOW_MS)
    const lateResumeTime = new Date(
      new Date('2026-04-19T08:00:00.000Z').getTime() + CATCH_UP_WINDOW_MS + 60_000
    );

    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => lateResumeTime,
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    await scheduler.checkNow();
    expect(executeMock).not.toHaveBeenCalled();

    const savedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    expect(savedState['stale-macro::5']?.lastRunDate).toBe('2026-04-19');
  });

  it('evaluates HH:MM in local timezone via Intl.DateTimeFormat and adapts when timezone changes', async () => {
    writeMacro('tz-macro', {
      name: 'Timezone Macro',
      enabled: true,
      nodes: [{ id: 1, type: 'triggers/timer', properties: { time: '08:00' } }],
    });

    const executeMock = vi.fn().mockResolvedValue(undefined);
    // 05:02 UTC is 08:02 in Europe/Moscow (UTC+3), but 05:02 in UTC
    const now = new Date('2026-04-19T05:02:00.000Z');
    let activeTz = 'UTC';

    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => now,
      timeZoneFn: () => activeTz,
      executor: { execute: executeMock },
    });

    // In UTC it's 05:02 (< 08:00), so it should NOT fire
    await scheduler.checkNow();
    expect(executeMock).not.toHaveBeenCalled();

    // User switches timezone to Europe/Moscow (where 05:02 UTC is 08:02 local)
    activeTz = 'Europe/Moscow';
    expect(localDateStr(now, activeTz)).toBe('2026-04-19');
    const moscowTarget = todayLocalAtHHMM('08:00', now, activeTz);
    expect(moscowTarget).toBe(Date.UTC(2026, 3, 19, 5, 0, 0));

    await scheduler.checkNow();
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('prevents concurrent execution of the same macroId and enforces the 5-minute execution timeout', async () => {
    writeMacro('slow-macro', {
      name: 'Slow Macro',
      enabled: true,
      nodes: [{ id: 1, type: 'triggers/timer', properties: { time: '10:00' } }],
    });

    // Executor that hangs longer than custom 50ms timeout and then rejects late
    const executeMock = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Late failure after timeout')), 120);
        })
    );

    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => new Date('2026-04-19T10:01:00.000Z'),
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
      executionTimeoutMs: 40,
    });

    // Manually acquire another macro ID to test concurrent lock
    expect(scheduler.tryAcquireMacro('locked-id')).toBe(true);
    expect(scheduler.tryAcquireMacro('locked-id')).toBe(false);
    expect(scheduler.isMacroInFlight('locked-id')).toBe(true);
    scheduler.releaseMacro('locked-id');
    expect(scheduler.isMacroInFlight('locked-id')).toBe(false);

    // Should resolve cleanly after ~40ms timeout without throwing or unhandledRejection
    await expect(scheduler.checkNow()).resolves.toBeUndefined();
    expect(scheduler.isMacroInFlight('slow-macro')).toBe(false);

    // Wait for the late rejection to fire and ensure no unhandledRejection occurs
    await new Promise((r) => setTimeout(r, 100));
  });

  it('gracefully skips invalid HH:MM formats (e.g. "25:99", "abc", "") without crashing the scheduler loop', async () => {
    writeMacro('invalid-times', {
      name: 'Invalid Times',
      enabled: true,
      nodes: [
        { id: 1, type: 'triggers/timer', properties: { time: '25:99' } },
        { id: 2, type: 'triggers/timer', properties: { time: 'abc' } },
        { id: 3, type: 'triggers/timer', properties: { time: '' } },
        { id: 4, type: 'triggers/timer', properties: { time: '12:00' } },
      ],
    });

    const executeMock = vi.fn().mockRejectedValueOnce(new Error('Simulated executor rejection'));
    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => new Date('2026-04-19T12:01:00.000Z'),
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    // Even when executor rejects on valid node #4, checkNow catches and does not crash
    await expect(scheduler.checkNow()).resolves.toBeUndefined();
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('skips scheduled macros containing actions/shell nodes, logs warning, and triggers warning toast without unattended shell execution', async () => {
    writeMacro('shell-cleanup', {
      name: 'Shell Cleanup',
      enabled: true,
      nodes: [
        { id: 1, type: 'triggers/timer', properties: { time: '14:00' } },
        { id: 2, type: 'actions/shell', properties: { command: 'del /q C:\\temp\\*' } },
      ],
    });

    const executeMock = vi.fn().mockResolvedValue(undefined);
    const toastMock = vi.fn();

    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => new Date('2026-04-19T14:02:00.000Z'),
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
      notifyToast: toastMock,
    });

    await scheduler.checkNow();

    expect(executeMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toContain('Shell Cleanup');
    expect(toastMock.mock.calls[0][1]).toBe('warning');

    const savedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    expect(savedState['shell-cleanup::1']?.lastRunDate).toBe('2026-04-19');
  });

  it('prunes obsolete macroId::nodeId entries from macros-schedule-state.json when macros or timer nodes are deleted, while retaining disabled macros', async () => {
    writeMacro('active-macro', {
      name: 'Active Macro',
      enabled: true,
      nodes: [{ id: 1, type: 'triggers/timer', properties: { time: '09:00' } }],
    });
    writeMacro('disabled-macro', {
      name: 'Disabled Macro',
      enabled: false,
      nodes: [{ id: 2, type: 'triggers/timer', properties: { time: '10:00' } }],
    });

    // Pre-seed state with active, disabled, deleted macro and removed timer node
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify(
        {
          'active-macro::1': { lastRunDate: '2026-04-18', lastRunTs: 1000 },
          'active-macro::99': { lastRunDate: '2026-04-18', lastRunTs: 1000 },
          'disabled-macro::2': { lastRunDate: '2026-04-18', lastRunTs: 1000 },
          'deleted-macro::1': { lastRunDate: '2026-04-18', lastRunTs: 1000 },
        },
        null,
        2
      ),
      'utf-8'
    );

    const executeMock = vi.fn().mockResolvedValue(undefined);
    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath,
      nowFn: () => new Date('2026-04-19T07:00:00.000Z'),
      timeZoneFn: () => 'UTC',
      executor: { execute: executeMock },
    });

    await scheduler.checkNow();

    const savedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    expect(savedState['active-macro::1']).toBeDefined();
    expect(savedState['disabled-macro::2']).toBeDefined();
    expect(savedState['active-macro::99']).toBeUndefined();
    expect(savedState['deleted-macro::1']).toBeUndefined();
  });
});
