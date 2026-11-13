import * as fs from 'fs';
import * as path from 'path';
import { maskSecrets, sanitizeStackTrace } from '../../shared/utils/log-sanitizer';

const DEBUG = process.env.NODE_ENV !== 'production';
const MAX_APP_LOG_BYTES = 5 * 1024 * 1024; // 5 MB per file (app.log, .1, .2 => <= 15 MB)

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  stack?: string;
  repeatCount?: number;
}

export type LogMiddleware = (entry: LogEntry) => LogEntry | null;

export class DeduplicatingLogger {
  private lastMsg = '';
  private lastLevel: LogLevel | '' = '';
  private repeatCount = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private middlewares: LogMiddleware[] = [];
  private logFilePath: string | null = null;

  private diskWriteQueue: string[] = [];
  private diskFlushTimer: NodeJS.Timeout | null = null;
  private isFlushingAsync = false;
  private estimatedLogBytes = 0;

  public use(middleware: LogMiddleware): void {
    if (typeof middleware === 'function') {
      this.middlewares.push(middleware);
    }
  }

  public clearMiddlewares(): void {
    this.middlewares = [];
  }

  public enableDiskLogging(logsDir: string): void {
    try {
      if (!logsDir || !logsDir.trim()) return;
      const resolvedDir = path.resolve(logsDir);
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }
      this.logFilePath = path.join(resolvedDir, 'app.log');
      this.estimatedLogBytes = fs.existsSync(this.logFilePath) ? fs.statSync(this.logFilePath).size : 0;
    } catch {
      this.logFilePath = null;
      this.estimatedLogBytes = 0;
    }
  }

  public disableDiskLogging(): void {
    this.flush();
    this.logFilePath = null;
  }

  private rotateLogsIfNeeded(filePath: string, incomingBytes: number): void {
    try {
      if (this.estimatedLogBytes + incomingBytes <= MAX_APP_LOG_BYTES) return;
      if (!fs.existsSync(filePath)) {
        this.estimatedLogBytes = 0;
        return;
      }
      const currentSize = fs.statSync(filePath).size;
      if (currentSize + incomingBytes <= MAX_APP_LOG_BYTES) {
        this.estimatedLogBytes = currentSize;
        return;
      }
      const archive1 = `${filePath}.1`;
      const archive2 = `${filePath}.2`;
      if (fs.existsSync(archive2)) fs.unlinkSync(archive2);
      if (fs.existsSync(archive1)) fs.renameSync(archive1, archive2);
      fs.renameSync(filePath, archive1);
      fs.writeFileSync(filePath, '', 'utf8');
      this.estimatedLogBytes = 0;
    } catch {
      // Ignore rotation errors to avoid crashing application
    }
  }

  private flushDiskQueueSync(): void {
    if (this.diskFlushTimer) {
      clearTimeout(this.diskFlushTimer);
      this.diskFlushTimer = null;
    }
    if (!this.logFilePath || this.diskWriteQueue.length === 0) {
      this.diskWriteQueue = [];
      return;
    }
    const batch = this.diskWriteQueue.join('');
    this.diskWriteQueue = [];
    try {
      const byteLen = Buffer.byteLength(batch, 'utf8');
      this.rotateLogsIfNeeded(this.logFilePath, byteLen);
      fs.appendFileSync(this.logFilePath, batch, 'utf8');
      this.estimatedLogBytes += byteLen;
    } catch {}
  }

  private async flushDiskQueueAsync(): Promise<void> {
    this.diskFlushTimer = null;
    if (this.isFlushingAsync || !this.logFilePath || this.diskWriteQueue.length === 0) return;
    this.isFlushingAsync = true;
    const targetPath = this.logFilePath;
    const batch = this.diskWriteQueue.join('');
    this.diskWriteQueue = [];
    try {
      const byteLen = Buffer.byteLength(batch, 'utf8');
      if (this.estimatedLogBytes + byteLen > MAX_APP_LOG_BYTES) {
        this.rotateLogsIfNeeded(targetPath, byteLen);
      }
      await fs.promises.appendFile(targetPath, batch, 'utf8');
      this.estimatedLogBytes += byteLen;
    } catch {
      // Fail-open if disk is temporarily unavailable
    } finally {
      this.isFlushingAsync = false;
      if (this.diskWriteQueue.length > 0 && this.logFilePath && !this.diskFlushTimer) {
        this.diskFlushTimer = setTimeout(() => { void this.flushDiskQueueAsync(); }, 250);
      }
    }
  }

  private writeRecordToDisk(entry: LogEntry): void {
    if (!this.logFilePath) return;
    try {
      const sanitizedEntry: LogEntry = {
        ts: entry.ts,
        level: entry.level,
        message: maskSecrets(entry.message),
        ...(entry.stack ? { stack: sanitizeStackTrace(entry.stack) } : {}),
        ...(entry.repeatCount && entry.repeatCount > 1 ? { repeatCount: entry.repeatCount } : {})
      };
      const line = `${JSON.stringify(sanitizedEntry)}\n`;
      this.diskWriteQueue.push(line);
      if (this.diskWriteQueue.length >= 40) {
        void this.flushDiskQueueAsync();
      } else if (!this.diskFlushTimer) {
        this.diskFlushTimer = setTimeout(() => { void this.flushDiskQueueAsync(); }, 250);
      }
    } catch {
      // Fail-open if disk is temporarily read-only or unavailable
    }
  }

  private extractStack(args: any[]): string | undefined {
    for (const a of args) {
      if (a instanceof Error && typeof a.stack === 'string') {
        const cleaned = sanitizeStackTrace(a.stack);
        if (cleaned) return cleaned;
      } else if (a && typeof a === 'object' && typeof a.stack === 'string') {
        const cleaned = sanitizeStackTrace(a.stack);
        if (cleaned) return cleaned;
      }
    }
    return undefined;
  }

  private formatArgs(args: any[]): string {
    const raw = args
      .map(a => {
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'object') {
          try {
            if (a instanceof Error) {
              const urlSuffix = (a as any).config?.url ? ` (url: ${(a as any).config.url})` : '';
              return `${a.message}${urlSuffix}`;
            }
            const clone: Record<string, unknown> = { ...(a as Record<string, unknown>) };
            if ('stack' in clone) {
              clone.stack = sanitizeStackTrace(clone.stack);
            }
            return (a as any).message || JSON.stringify(clone);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    return maskSecrets(raw);
  }

  private runMiddlewares(entry: LogEntry): LogEntry | null {
    let current: LogEntry | null = entry;
    for (const mw of this.middlewares) {
      if (!current) return null;
      current = mw(current);
    }
    if (!current) return null;
    return {
      ...current,
      message: maskSecrets(current.message),
      ...(current.stack ? { stack: sanitizeStackTrace(current.stack) } : {})
    };
  }

  public flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.repeatCount > 1 && this.lastLevel) {
      const output = `${this.lastMsg} (x ${this.repeatCount})`;
      if (this.lastLevel === 'info' && DEBUG) console.log('[INFO]', output);
      else if (this.lastLevel === 'warn') console.warn('[WARN]', output);
      else if (this.lastLevel === 'error') console.error('[ERROR]', output);
      this.writeRecordToDisk({
        ts: new Date().toISOString(),
        level: this.lastLevel,
        message: this.lastMsg,
        repeatCount: this.repeatCount
      });
    }
    this.repeatCount = 0;
    this.lastMsg = '';
    this.lastLevel = '';
    this.flushDiskQueueSync();
  }

  private process(level: LogLevel, ...args: any[]) {
    const rawMsg = this.formatArgs(args);
    const stack = level === 'error' ? this.extractStack(args) : undefined;
    const processed = this.runMiddlewares({
      ts: new Date().toISOString(),
      level,
      message: rawMsg,
      ...(stack ? { stack } : {})
    });
    if (!processed) return;

    const msg = processed.message;
    if (msg === this.lastMsg && level === this.lastLevel) {
      this.repeatCount++;
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 1000);
      }
      return;
    }

    if (this.repeatCount > 1) {
      this.flush();
    }

    this.lastMsg = msg;
    this.lastLevel = level;
    this.repeatCount = 1;

    if (level === 'info') {
      if (DEBUG) console.log('[INFO]', msg);
    } else if (level === 'warn') {
      console.warn('[WARN]', msg);
    } else if (level === 'error') {
      console.error('[ERROR]', msg);
    }

    this.writeRecordToDisk(processed);
  }

  info(...args: any[]) { this.process('info', ...args); }
  warn(...args: any[]) { this.process('warn', ...args); }
  error(...args: any[]) { this.process('error', ...args); }
}

export const logger = new DeduplicatingLogger();
