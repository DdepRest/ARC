import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import {
  abortableDelay,
  DownloadCancelledError,
  isCancellationError,
  waitForStreamClose,
  type ActiveDownloadTask
} from './sherpa-download-task.helper';
import {
  createSsrfSafeLookup,
  DEFAULT_MAX_RESPONSE_BYTES,
  DownloadSecurityError,
  isBlockedIpAddress,
  isLoopbackDownloadTestHarnessEnabled,
  isSecurityError,
  MAX_MODEL_REDIRECTS,
  validateTrustedDownloadUrl
} from '../utils/network-security.util';

export interface DownloadSignalOptions {
  url: string;
  destPartPath: string;
  onProgressChunk: (bytesRead: number) => void;
  signal?: AbortSignal;
  task?: ActiveDownloadTask;
  headers?: Record<string, string>;
  retries?: number;
  retryDelayMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  resolveAttemptUrl?: (baseUrl: string, attempt: number) => string;
  onHttpStatus?: (statusCode: number, headers: http.IncomingHttpHeaders) => void;
}

export interface DownloadSignalResult {
  bytesWritten: number;
  sha256: string;
  finalUrl: string;
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export async function downloadFileWithSignal(opts: DownloadSignalOptions): Promise<DownloadSignalResult> {
  const {
    url,
    destPartPath,
    onProgressChunk,
    signal,
    task,
    headers = { 'User-Agent': 'A.R.C.-SherpaDownloader/1.0' },
    retries = 3,
    retryDelayMs = 1500,
    maxRedirects = MAX_MODEL_REDIRECTS,
    maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
    resolveAttemptUrl,
    onHttpStatus
  } = opts;

  task?.tempFiles.add(destPartPath);

  const fetchUrl = (currentUrl: string, redirectDepth: number): Promise<DownloadSignalResult> => {
    if (signal?.aborted) {
      return Promise.reject(new DownloadCancelledError());
    }

    let parsedUrl: URL;
    try {
      parsedUrl = validateTrustedDownloadUrl(currentUrl);
    } catch (secErr) {
      return Promise.reject(secErr);
    }

    return new Promise((resolve, reject) => {
      let isFinished = false;
      let fileStream: fs.WriteStream | null = null;
      let currentRes: http.IncomingMessage | null = null;
      let req: http.ClientRequest | null = null;
      const hash = crypto.createHash('sha256');
      let bytesWritten = 0;

      const allowLoopback = isLoopbackDownloadTestHarnessEnabled() &&
        (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost');
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      const safeLookup = allowLoopback ? undefined : createSsrfSafeLookup();

      const unlinkPart = () => {
        if (Object.prototype.hasOwnProperty.call(fs, 'unlinkSync') && typeof fs.unlinkSync === 'function') {
          try { if (fs.existsSync(destPartPath)) fs.unlinkSync(destPartPath); } catch {}
        }
      };

      const settle = (err: Error | null, resVal?: DownloadSignalResult) => {
        if (isFinished) return;
        isFinished = true;
        signal?.removeEventListener('abort', onAbort);
        if (req) task?.activeRequests.delete(req);
        if (currentRes) task?.activeResponses.delete(currentRes);

        const closeAndFinish = () => {
          if (err) unlinkPart();
          if (err) reject(err);
          else resolve(resVal!);
        };

        if (fileStream) {
          const streamRef = fileStream;
          fileStream = null;
          if (err) {
            void waitForStreamClose(streamRef).then(() => {
              task?.activeFileStreams.delete(streamRef);
              closeAndFinish();
            });
          } else {
            streamRef.close(() => {
              task?.activeFileStreams.delete(streamRef);
              closeAndFinish();
            });
          }
        } else {
          closeAndFinish();
        }
      };

      const onAbort = () => {
        if (isFinished) return;
        const cancelErr = new DownloadCancelledError();
        try { currentRes?.unpipe(); } catch {}
        try { currentRes?.destroy(cancelErr); } catch {}
        try { req?.destroy(cancelErr); } catch {}
        settle(cancelErr);
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const requestOpts: https.RequestOptions = {
          headers,
          signal,
          ...(safeLookup ? { lookup: safeLookup } : {})
        };

        req = protocol.get(parsedUrl.toString(), requestOpts, (response) => {
          currentRes = response;
          task?.activeResponses.add(response);

          if (!allowLoopback && response.socket?.remoteAddress && isBlockedIpAddress(response.socket.remoteAddress)) {
            const ssrfErr = new DownloadSecurityError(
              `Blocked remote socket IP: ${response.socket.remoteAddress}`,
              'ERR_SSRF_BLOCKED_IP'
            );
            try { response.destroy(ssrfErr); } catch {}
            return settle(ssrfErr);
          }

          if (signal?.aborted) {
            try { response.destroy(new DownloadCancelledError()); } catch {}
            return settle(new DownloadCancelledError());
          }

          if (REDIRECT_CODES.has(response.statusCode || 0)) {
            const redirectUrl = response.headers.location;
            try { response.resume(); } catch {}
            task?.activeResponses.delete(response);
            currentRes = null;
            if (req) task?.activeRequests.delete(req);

            if (!redirectUrl) {
              return settle(new Error(`Redirect status ${response.statusCode} without location header`));
            }
            if (redirectDepth >= maxRedirects) {
              return settle(new DownloadSecurityError(`Exceeded maximum redirects (${maxRedirects})`, 'ERR_TOO_MANY_REDIRECTS'));
            }

            let resolvedUrl: string;
            try {
              resolvedUrl = new URL(redirectUrl, parsedUrl.toString()).toString();
              validateTrustedDownloadUrl(resolvedUrl);
            } catch (redirErr: any) {
              return settle(redirErr instanceof Error ? redirErr : new DownloadSecurityError(String(redirErr)));
            }

            signal?.removeEventListener('abort', onAbort);
            isFinished = true;
            fetchUrl(resolvedUrl, redirectDepth + 1).then(resolve, reject);
            return;
          }

          onHttpStatus?.(response.statusCode || 0, response.headers);

          if (response.statusCode !== 200) {
            try { response.resume(); } catch {}
            return settle(new Error(`HTTP ${response.statusCode} for ${parsedUrl.origin}${parsedUrl.pathname}`));
          }

          const contentLength = parseInt(String(response.headers['content-length'] || '0'), 10);
          if (maxBytes > 0 && contentLength > maxBytes) {
            try { response.destroy(); } catch {}
            return settle(new DownloadSecurityError(`Response Content-Length (${contentLength}) exceeds allowed limit (${maxBytes})`, 'ERR_RESPONSE_TOO_LARGE'));
          }

          try {
            const parentDir = path.dirname(destPartPath);
            if (typeof fs.mkdirSync === 'function' && !fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }
            fileStream = fs.createWriteStream(destPartPath);
            task?.activeFileStreams.add(fileStream);
          } catch (err: any) {
            return settle(err instanceof Error ? err : new Error(String(err)));
          }

          fileStream.on('error', (err) => {
            settle(err instanceof Error ? err : new Error(String(err)));
          });

          fileStream.on('finish', () => {
            if (signal?.aborted) {
              settle(new DownloadCancelledError());
            } else {
              settle(null, {
                bytesWritten,
                sha256: hash.digest('hex'),
                finalUrl: parsedUrl.toString()
              });
            }
          });

          response.on('error', (err) => {
            settle(signal?.aborted ? new DownloadCancelledError() : (err instanceof Error ? err : new Error(String(err))));
          });

          response.on('aborted', () => {
            settle(signal?.aborted ? new DownloadCancelledError() : new Error('Response stream aborted unexpectedly'));
          });

          response.on('data', (chunk: Buffer) => {
            if (signal?.aborted || isFinished) return;
            bytesWritten += chunk.length;
            if (maxBytes > 0 && bytesWritten > maxBytes) {
              const overErr = new DownloadSecurityError(`Stream exceeded maxBytes limit (${maxBytes})`, 'ERR_RESPONSE_TOO_LARGE');
              settle(overErr);
              try { response.unpipe(); } catch {}
              try { response.destroy(overErr); } catch {}
              return;
            }
            hash.update(chunk);
            onProgressChunk(chunk.length);
          });

          response.pipe(fileStream);
        });
      } catch (reqErr: any) {
        return settle(signal?.aborted ? new DownloadCancelledError() : (reqErr instanceof Error ? reqErr : new Error(String(reqErr))));
      }

      if (req) {
        task?.activeRequests.add(req);
        req.on('error', (err) => {
          settle(signal?.aborted ? new DownloadCancelledError() : (err instanceof Error ? err : new Error(String(err))));
        });
        req.setTimeout?.(60000, () => {
          const timeoutErr = new Error('Download request timed out');
          try { req?.destroy(timeoutErr); } catch {}
          settle(timeoutErr);
        });
      }
    });
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new DownloadCancelledError();
    }
    const targetUrl = resolveAttemptUrl ? resolveAttemptUrl(url, attempt) : url;
    try {
      return await fetchUrl(targetUrl, 0);
    } catch (err) {
      if (signal?.aborted || isCancellationError(err)) {
        throw new DownloadCancelledError();
      }
      if (isSecurityError(err) || attempt >= retries) {
        throw err;
      }
      await abortableDelay(retryDelayMs * attempt, signal);
    }
  }

  throw new Error('Exhausted download retries');
}

export function probeRemoteFileSizeSafe(
  rawUrl: string,
  signal?: AbortSignal,
  maxRedirects = MAX_MODEL_REDIRECTS
): Promise<number> {
  const probeHop = (currentUrl: string, depth: number): Promise<number> => {
    if (signal?.aborted) return Promise.reject(new DownloadCancelledError());
    const parsedUrl = validateTrustedDownloadUrl(currentUrl);
    const allowLoopback = isLoopbackDownloadTestHarnessEnabled() &&
      (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost');
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const safeLookup = allowLoopback ? undefined : createSsrfSafeLookup();

    return new Promise((resolve, reject) => {
      const req = protocol.request(
        parsedUrl.toString(),
        {
          method: 'HEAD',
          headers: { 'User-Agent': 'A.R.C.-SherpaDownloader/1.0' },
          signal,
          timeout: 5000,
          ...(safeLookup ? { lookup: safeLookup } : {})
        },
        (res) => {
          res.resume();
          if (!allowLoopback && res.socket?.remoteAddress && isBlockedIpAddress(res.socket.remoteAddress)) {
            return reject(new DownloadSecurityError(`Blocked remote socket IP: ${res.socket.remoteAddress}`, 'ERR_SSRF_BLOCKED_IP'));
          }
          if (REDIRECT_CODES.has(res.statusCode || 0) && res.headers.location) {
            if (depth >= maxRedirects) {
              return reject(new DownloadSecurityError(`Exceeded maximum redirects (${maxRedirects})`, 'ERR_TOO_MANY_REDIRECTS'));
            }
            try {
              const nextUrl = new URL(res.headers.location, parsedUrl.toString()).toString();
              validateTrustedDownloadUrl(nextUrl);
              return probeHop(nextUrl, depth + 1).then(resolve, reject);
            } catch (e) {
              return reject(e);
            }
          }
          const linked = parseInt(String(res.headers['x-linked-size'] || '0'), 10);
          if (linked > 0) return resolve(linked);
          const cl = parseInt(String(res.headers['content-length'] || '0'), 10);
          return resolve(cl > 0 ? cl : 0);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(0);
      });
      req.on('error', (err) => {
        if (signal?.aborted || isCancellationError(err)) return reject(new DownloadCancelledError());
        if (isSecurityError(err)) return reject(err);
        resolve(0);
      });
      req.end();
    });
  };
  return probeHop(rawUrl, 0);
}
