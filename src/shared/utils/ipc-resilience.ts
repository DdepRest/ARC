import { maskSecrets, sanitizeError } from './log-sanitizer';

export interface IpcRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const TRANSIENT_ERROR_PATTERN =
  /EBUSY|SQLITE_BUSY|EAGAIN|ETIMEDOUT|ECONNRESET|EPIPE|IPC_TIMEOUT|IPC_CHANNEL_BUSY|temporarily unavailable|timeout/i;

const PERMANENT_ERROR_PATTERN =
  /IPC_SHUTTING_DOWN|PROVIDER_NOT_ALLOWED|DatabaseSafeModeError|Validation|Invalid|not allowed|Permission denied/i;

export function isTransientIpcError(err: unknown): boolean {
  if (!err) return false;
  const text = typeof err === 'string' ? err : ((err as any)?.code || '') + ' ' + ((err as any)?.message || String(err));
  if (PERMANENT_ERROR_PATTERN.test(text)) return false;
  return TRANSIENT_ERROR_PATTERN.test(text);
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'IPC operation'): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(`[IPC_TIMEOUT] ${label} timed out after ${timeoutMs}ms`);
      err.code = 'IPC_TIMEOUT';
      reject(err);
    }, timeoutMs);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Executes an async IPC operation with configurable timeout and exponential backoff retries.
 */
export async function withIpcRetryAndTimeout<T>(
  operation: (attempt: number) => Promise<T>,
  options: IpcRetryOptions = {},
  label = 'ipc:call'
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 150;
  const maxDelayMs = options.maxDelayMs ?? 2500;
  const jitterMs = options.jitterMs ?? 50;
  const shouldRetry = options.shouldRetry ?? ((err) => isTransientIpcError(err));

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      const abortErr: any = new Error(`[IPC_ABORTED] ${label} aborted before attempt ${attempt + 1}`);
      abortErr.code = 'ERR_CANCELED';
      throw abortErr;
    }

    try {
      return await withTimeout(operation(attempt), timeoutMs, label);
    } catch (err) {
      lastError = err;
      if (options.signal?.aborted || attempt >= maxRetries || !shouldRetry(err, attempt)) {
        throw err;
      }
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      await abortableSleep(expDelay + jitter, options.signal);
    }
  }

  throw lastError;
}

/**
 * Manages main-to-renderer communication resilience, in-flight request tracking,
 * and graceful shutdown draining.
 */
export class IpcLifecycleManager {
  private shuttingDown = false;
  private inFlightCount = 0;
  private drainResolvers: Array<() => void> = [];

  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  public getInFlightCount(): number {
    return this.inFlightCount;
  }

  public resetForTesting(): void {
    this.shuttingDown = false;
    this.inFlightCount = 0;
    this.drainResolvers = [];
  }

  /**
   * Wraps a main-process IPC handler with in-flight tracking, shutdown guard,
   * timeout, and automatic error sanitization.
   */
  public wrapHandler<TArgs extends any[], TResult>(
    channel: string,
    handler: (...args: TArgs) => Promise<TResult> | TResult,
    options: { timeoutMs?: number; allowDuringShutdown?: boolean } = {}
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      if (this.shuttingDown && !options.allowDuringShutdown) {
        const err: any = new Error(`[IPC_SHUTTING_DOWN] Channel "${channel}" rejected: application is shutting down`);
        err.code = 'IPC_SHUTTING_DOWN';
        throw err;
      }

      this.inFlightCount++;
      try {
        const execPromise = Promise.resolve(handler(...args));
        return options.timeoutMs
          ? await withTimeout(execPromise, options.timeoutMs, channel)
          : await execPromise;
      } catch (err: any) {
        if (err && typeof err === 'object' && typeof err.message === 'string') {
          err.message = maskSecrets(err.message);
        }
        throw err;
      } finally {
        this.inFlightCount = Math.max(0, this.inFlightCount - 1);
        if (this.inFlightCount === 0 && this.drainResolvers.length > 0) {
          const resolvers = this.drainResolvers.splice(0, this.drainResolvers.length);
          resolvers.forEach((r) => r());
        }
      }
    };
  }

  /**
   * Sends a message from main to a BrowserWindow with destroyed-window protection
   * and exponential backoff retries if the renderer frame is temporarily busy/loading.
   */
  public async sendToWindow<TPayload = any>(
    win: { isDestroyed?: () => boolean; webContents?: { isDestroyed?: () => boolean; isLoading?: () => boolean; send: (ch: string, payload?: TPayload) => void } } | null | undefined,
    channel: string,
    payload?: TPayload,
    retryOpts: IpcRetryOptions = { maxRetries: 2, baseDelayMs: 50, timeoutMs: 2000 }
  ): Promise<boolean> {
    if (!win || win.isDestroyed?.() || !win.webContents || win.webContents.isDestroyed?.()) {
      return false;
    }

    try {
      await withIpcRetryAndTimeout(
        async () => {
          if (win.isDestroyed?.() || !win.webContents || win.webContents.isDestroyed?.()) {
            return;
          }
          if (typeof win.webContents.isLoading === 'function' && win.webContents.isLoading()) {
            const busyErr: any = new Error('IPC_CHANNEL_BUSY: webContents is still loading');
            busyErr.code = 'IPC_CHANNEL_BUSY';
            throw busyErr;
          }
          win.webContents.send(channel, payload);
        },
        retryOpts,
        `send:${channel}`
      );
      return true;
    } catch (err) {
      console.warn(`[IPC-Resilience] Failed to send "${channel}" to renderer: ${sanitizeError(err)}`);
      return false;
    }
  }

  /**
   * Initiates graceful IPC shutdown: blocks new mutating requests, notifies live windows,
   * and waits up to `drainTimeoutMs` for in-flight operations to complete.
   */
  public async gracefulShutdown(
    windows: Array<{ isDestroyed?: () => boolean; webContents?: { isDestroyed?: () => boolean; send: (ch: string, payload?: any) => void } }> = [],
    drainTimeoutMs = 3000
  ): Promise<{ drained: boolean; remainingInFlight: number }> {
    this.shuttingDown = true;

    for (const win of windows) {
      try {
        if (win && !win.isDestroyed?.() && win.webContents && !win.webContents.isDestroyed?.()) {
          win.webContents.send('app:shutting-down', { timestamp: Date.now() });
        }
      } catch {
        // Ignore errors on closing windows
      }
    }

    if (this.inFlightCount === 0) {
      return { drained: true, remainingInFlight: 0 };
    }

    const drained = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, drainTimeoutMs);

      this.drainResolvers.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    return { drained, remainingInFlight: this.inFlightCount };
  }
}

export const ipcLifecycle = new IpcLifecycleManager();
