import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { macroExecutor } from './MacroExecutor';
import { logger } from '../utils/logger';

export const TICK_INTERVAL_MS = 30_000;
export const CATCH_UP_WINDOW_MS = 15 * 60 * 1000;
export const MACRO_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

export interface ScheduleSlotState { lastRunDate: string; lastRunTs: number; }
export type ScheduleStateMap = Record<string, ScheduleSlotState>;

export interface MacroSchedulerOptions {
  macrosDir?: string;
  stateFilePath?: string;
  nowFn?: () => Date;
  timeZoneFn?: () => string;
  executor?: { execute: (macroData: any) => Promise<void> };
  notifyToast?: (message: string, type?: 'info' | 'warning' | 'error') => void;
  tickIntervalMs?: number;
  catchUpWindowMs?: number;
  executionTimeoutMs?: number;
}

export function localDateStr(d: Date, timeZone?: string): string {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function todayLocalAtHHMM(timeStr: string, now: Date = new Date(), timeZone?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);

  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value);

  const nowSecMs = Math.floor(now.getTime() / 1000) * 1000;
  const wallNowAsUtc = Date.UTC(map.year, (map.month || 1) - 1, map.day || 1, map.hour || 0, map.minute || 0, map.second || 0);
  const targetWallAsUtc = Date.UTC(map.year, (map.month || 1) - 1, map.day || 1, hours, minutes, 0, 0);
  return targetWallAsUtc - (wallNowAsUtc - nowSecMs);
}

export class MacroSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private checking = false;
  private readonly inFlightMacros = new Set<string>();
  private state: ScheduleStateMap = {};
  private stateLoaded = false;

  private readonly customMacrosDir?: string;
  private readonly customStateFilePath?: string;
  private readonly nowFn: () => Date;
  private readonly timeZoneFn: () => string;
  private readonly executor: { execute: (macroData: any) => Promise<void> };
  private readonly notifyToast: (message: string, type?: 'info' | 'warning' | 'error') => void;
  private readonly tickIntervalMs: number;
  private readonly catchUpWindowMs: number;
  private readonly executionTimeoutMs: number;

  constructor(options: MacroSchedulerOptions = {}) {
    this.customMacrosDir = options.macrosDir;
    this.customStateFilePath = options.stateFilePath;
    this.nowFn = options.nowFn ?? (() => new Date());
    this.timeZoneFn = options.timeZoneFn ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    this.executor = options.executor ?? macroExecutor;
    this.notifyToast = options.notifyToast ?? ((message, type = 'warning') => {
      try {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('ui:show-toast', { message, type });
        }
      } catch (err) {
        logger.warn('[MacroScheduler] Failed to send toast to renderer:', err);
      }
    });
    this.tickIntervalMs = options.tickIntervalMs ?? TICK_INTERVAL_MS;
    this.catchUpWindowMs = options.catchUpWindowMs ?? CATCH_UP_WINDOW_MS;
    this.executionTimeoutMs = options.executionTimeoutMs ?? MACRO_EXECUTION_TIMEOUT_MS;
  }

  private getMacrosDir(): string { return this.customMacrosDir ?? path.join(app.getPath('userData'), 'macros'); }
  private getStateFilePath(): string { return this.customStateFilePath ?? path.join(app.getPath('userData'), 'macros-schedule-state.json'); }

  private loadState(): void {
    const filePath = this.getStateFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.state = parsed as ScheduleStateMap;
          this.stateLoaded = true;
          return;
        }
      }
    } catch (err) {
      logger.warn('[MacroScheduler] Failed to load schedule state, resetting:', err);
    }
    this.state = {};
    this.stateLoaded = true;
  }

  private saveState(): void {
    const filePath = this.getStateFilePath();
    const dir = path.dirname(filePath);
    const tmpPath = `${filePath}.tmp`;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      logger.error('[MacroScheduler] Failed to persist schedule state:', err);
    }
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.loadState();
    this.timer = setInterval(() => void this.checkNow(), this.tickIntervalMs);
    void this.checkNow();
  }

  public stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.running = false;
  }

  public isRunning(): boolean { return this.running; }
  public isMacroInFlight(macroId: string): boolean { return this.inFlightMacros.has(macroId); }
  public releaseMacro(macroId: string): void { this.inFlightMacros.delete(macroId); }
  public tryAcquireMacro(macroId: string): boolean {
    if (!macroId || this.inFlightMacros.has(macroId)) return false;
    this.inFlightMacros.add(macroId);
    return true;
  }

  public async reload(): Promise<void> {
    this.loadState();
    await this.checkNow();
  }

  public async checkNow(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      if (!this.stateLoaded) this.loadState();
      const macrosDir = this.getMacrosDir();
      if (!fs.existsSync(macrosDir)) return;

      const rawFiles = fs.promises?.readdir ? await fs.promises.readdir(macrosDir) : fs.readdirSync(macrosDir);
      const files = rawFiles.filter((f) => f.endsWith('.json'));
      const now = this.nowFn();
      const nowMs = now.getTime();
      const tz = this.timeZoneFn();
      const today = localDateStr(now, tz);

      for (const file of files) {
        const macroId = file.replace(/\.json$/i, '');
        let macroData: any;
        try {
          const fullPath = path.join(macrosDir, file);
          const rawJson = fs.promises?.readFile ? await fs.promises.readFile(fullPath, 'utf-8') : fs.readFileSync(fullPath, 'utf-8');
          macroData = JSON.parse(rawJson);
        } catch (err) {
          logger.warn(`[MacroScheduler] Skipping corrupted macro file ${file}:`, err);
          continue;
        }
        if (!macroData || macroData.enabled === false) continue;

        const nodes: any[] = Array.isArray(macroData.nodes) ? macroData.nodes : Array.isArray(macroData.data?.nodes) ? macroData.data.nodes : [];
        const timerNodes = nodes.filter((n) => n && n.type === 'triggers/timer');
        if (timerNodes.length === 0) continue;

        const hasShellNode = nodes.some((n) => n && n.type === 'actions/shell');
        const macroName = String(macroData.name || macroId);

        for (const timerNode of timerNodes) {
          const slotKey = `${macroId}::${timerNode.id ?? 0}`;
          if (this.state[slotKey]?.lastRunDate === today) continue;

          const rawTime = String(timerNode.properties?.time ?? '').trim();
          const scheduledTs = todayLocalAtHHMM(rawTime, now, tz);
          if (scheduledTs === null) { logger.warn(`[MacroScheduler] Invalid HH:MM "${rawTime}" in ${slotKey}`); continue; }
          if (nowMs < scheduledTs) continue;

          const elapsedMs = nowMs - scheduledTs;
          if (elapsedMs > this.catchUpWindowMs) {
            this.state[slotKey] = { lastRunDate: today, lastRunTs: nowMs };
            this.saveState();
            logger.info(`[MacroScheduler] Missed ${slotKey} (${rawTime}) by ${Math.round(elapsedMs / 60000)}m — skipping`);
            continue;
          }

          if (hasShellNode) {
            this.state[slotKey] = { lastRunDate: today, lastRunTs: nowMs };
            this.saveState();
            logger.warn(`[MacroScheduler] shell macro requires manual approval — skipped at schedule time (${macroId})`);
            this.notifyToast(`Макрос "${macroName}" содержит shell-команду и пропущен по расписанию (требуется ручной запуск)`, 'warning');
            continue;
          }

          if (!this.tryAcquireMacro(macroId)) { logger.warn(`[MacroScheduler] Macro ${macroId} is already in flight, skipping tick`); continue; }

          this.state[slotKey] = { lastRunDate: today, lastRunTs: nowMs };
          this.saveState();

          let timeoutHandle: NodeJS.Timeout | null = null;
          try {
            const execPromise = Promise.resolve(this.executor.execute({ ...macroData, id: macroId }));
            execPromise.catch((lateErr) => logger.error(`[MacroScheduler] Late rejection in macro ${macroId}:`, lateErr));
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => reject(new Error(`Macro execution timed out after ${this.executionTimeoutMs}ms`)), this.executionTimeoutMs);
            });
            await Promise.race([execPromise, timeoutPromise]);
          } catch (execErr) {
            logger.error(`[MacroScheduler] Failed executing scheduled macro ${macroId}:`, execErr);
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            this.releaseMacro(macroId);
          }
        }
      }
    } catch (err) {
      logger.error('[MacroScheduler] Unexpected error during checkNow:', err);
    } finally {
      this.checking = false;
    }
  }
}

export const macroScheduler = new MacroSchedulerService();
