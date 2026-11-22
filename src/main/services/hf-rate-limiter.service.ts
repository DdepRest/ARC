import { BrowserWindow } from 'electron';
import {
  abortableDelay,
  DownloadCancelledError,
  isCancellationError,
  type ActiveDownloadTask
} from './sherpa-download-task.helper';
import { downloadFileWithSignal } from './sherpa-http-download.util';

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class HfRateLimiterService {
  private static instance: HfRateLimiterService;
  private cache = new Map<string, CacheEntry<any>>();
  private hfCooldownUntil = 0;
  private cancelled = false;

  public static getInstance(): HfRateLimiterService {
    if (!HfRateLimiterService.instance) {
      HfRateLimiterService.instance = new HfRateLimiterService();
    }
    return HfRateLimiterService.instance;
  }

  public getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  public setCached<T>(key: string, data: T, ttlMs = 60 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
  }

  public parseRetryAfter(headerValue?: string | number): number {
    if (!headerValue) return 30; // Min 30s backoff by default
    if (typeof headerValue === 'number') return Math.max(30, headerValue);

    const numeric = parseInt(headerValue, 10);
    if (!isNaN(numeric) && numeric > 0) {
      return Math.max(30, numeric);
    }

    const dateMs = new Date(headerValue).getTime();
    if (!isNaN(dateMs) && dateMs > Date.now()) {
      return Math.max(30, Math.ceil((dateMs - Date.now()) / 1000));
    }

    return 30;
  }

  public record429(retryAfterHeader?: string | number): number {
    const backoffSec = this.parseRetryAfter(retryAfterHeader);
    this.hfCooldownUntil = Date.now() + backoffSec * 1000;
    this.cancelled = false;
    console.warn(`[HF Hygiene] 429 Too Many Requests detected. Global HF backoff set for ${backoffSec}s.`);
    this.broadcastCountdown(backoffSec);
    return backoffSec;
  }

  public isRateLimited(): boolean {
    return Date.now() < this.hfCooldownUntil;
  }

  public getRemainingSeconds(): number {
    return Math.max(0, Math.ceil((this.hfCooldownUntil - Date.now()) / 1000));
  }

  public resetCooldown(): void {
    this.hfCooldownUntil = 0;
    this.cancelled = true;
    this.broadcastCountdown(0);
    console.log('[HF Hygiene] Cooldown manually reset by user.');
  }

  public clearCancel(): void {
    this.cancelled = false;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  public async waitForCooldown(onTick?: (sec: number) => void, signal?: AbortSignal): Promise<boolean> {
    while (Date.now() < this.hfCooldownUntil) {
      if (this.cancelled || signal?.aborted) return false;
      const sec = this.getRemainingSeconds();
      onTick?.(sec);
      this.broadcastCountdown(sec);
      try {
        await abortableDelay(1000, signal);
      } catch (err) {
        if (isCancellationError(err)) return false;
        throw err;
      }
    }
    this.broadcastCountdown(0);
    return !this.cancelled && !signal?.aborted;
  }

  public toMirrorUrl(url: string): string {
    return url.replace('https://huggingface.co', 'https://hf-mirror.com');
  }

  public toHfUrl(url: string): string {
    return url.replace('https://hf-mirror.com', 'https://huggingface.co');
  }

  public downloadFileWithMirrorFallback(
    url: string,
    dest: string,
    onProgressChunk: (bytes: number) => void,
    retries = 2,
    options?: { signal?: AbortSignal; task?: ActiveDownloadTask; maxBytes?: number }
  ) {
    const signal = options?.signal;
    if (signal?.aborted) {
      return Promise.reject(new DownloadCancelledError());
    }

    return downloadFileWithSignal({
      url,
      destPartPath: dest,
      onProgressChunk,
      signal,
      task: options?.task,
      headers: { 'User-Agent': 'A.R.C.-GigaAMDownloader/1.0' },
      retries,
      retryDelayMs: 1500,
      maxBytes: options?.maxBytes,
      resolveAttemptUrl: (baseUrl, attempt) => {
        if (attempt === 1) return this.toMirrorUrl(baseUrl);
        return this.isRateLimited() ? this.toMirrorUrl(baseUrl) : this.toHfUrl(baseUrl);
      },
      onHttpStatus: (statusCode, headers) => {
        if (statusCode === 429) {
          this.record429(headers['retry-after']);
        }
      }
    });
  }

  private broadcastCountdown(remainingSec: number) {
    try {
      if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
      const wins = BrowserWindow.getAllWindows();
      wins.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('hf:cooldown-tick', { remainingSeconds: remainingSec });
        }
      });
    } catch {}
  }
}

export const hfRateLimiter = HfRateLimiterService.getInstance();
