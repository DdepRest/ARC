import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

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

  public async waitForCooldown(onTick?: (sec: number) => void): Promise<boolean> {
    while (Date.now() < this.hfCooldownUntil) {
      if (this.cancelled) return false;
      const sec = this.getRemainingSeconds();
      onTick?.(sec);
      this.broadcastCountdown(sec);
      await new Promise(r => setTimeout(r, 1000));
    }
    this.broadcastCountdown(0);
    return !this.cancelled;
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
    retries = 2
  ): Promise<void> {
    const tempDest = `${dest}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

    const fetchUrl = (currentUrl: string, attempt: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        let isFinished = false;
        let fileStream: fs.WriteStream | null = null;
        const protocol = currentUrl.startsWith('https') ? https : http;

        const cleanup = () => {
          if (fileStream) {
            try { fileStream.close(); } catch {}
            fileStream = null;
          }
          try { if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest); } catch {}
        };

        const req = protocol.get(
          currentUrl,
          { headers: { 'User-Agent': 'A.R.C.-GigaAMDownloader/1.0' } },
          (response) => {
            if ([301, 302, 307, 308].includes(response.statusCode || 0)) {
              const redirectUrl = response.headers.location;
              if (!redirectUrl) {
                isFinished = true;
                cleanup();
                return reject(new Error(`Redirect status ${response.statusCode} without location header`));
              }
              const resolvedUrl = new URL(redirectUrl, currentUrl).toString();
              return fetchUrl(resolvedUrl, attempt).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
              if (response.statusCode === 429) {
                const retryAfter = response.headers['retry-after'];
                this.record429(retryAfter);
              }
              isFinished = true;
              cleanup();
              return reject(new Error(`HTTP ${response.statusCode} for ${currentUrl}`));
            }

            try {
              fileStream = fs.createWriteStream(tempDest);
            } catch (err) {
              isFinished = true;
              cleanup();
              return reject(err);
            }

            fileStream.on('error', (err) => {
              if (isFinished) return;
              isFinished = true;
              cleanup();
              reject(err);
            });

            fileStream.on('finish', () => {
              isFinished = true;
              if (fileStream) {
                fileStream.close(() => resolve());
              } else {
                resolve();
              }
            });

            response.on('data', (chunk: Buffer) => {
              onProgressChunk(chunk.length);
            });

            response.pipe(fileStream);
          }
        );

        req.on('error', (err) => {
          if (isFinished) return;
          isFinished = true;
          cleanup();
          reject(err);
        });

        req.setTimeout(60000, () => {
          if (isFinished) return;
          isFinished = true;
          cleanup();
          req.destroy(new Error('Download request timed out'));
        });
      });
    };

    const tryDownload = async (attempt: number): Promise<void> => {
      try {
        // Mirror first, HF fallback only if not rate limited
        let targetUrl = url;
        if (attempt === 1) {
          targetUrl = this.toMirrorUrl(url);
        } else {
          if (this.isRateLimited()) {
            targetUrl = this.toMirrorUrl(url);
          } else {
            targetUrl = this.toHfUrl(url);
          }
        }
        await fetchUrl(targetUrl, attempt);
        if (fs.existsSync(dest)) {
          try { fs.unlinkSync(dest); } catch {}
        }
        fs.renameSync(tempDest, dest);
      } catch (err: any) {
        try { if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest); } catch {}
        if (attempt >= retries || this.cancelled) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        return tryDownload(attempt + 1);
      }
    };

    return tryDownload(1);
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
