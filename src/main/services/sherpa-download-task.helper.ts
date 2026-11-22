import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export type DownloadTaskState =
  | 'downloading'
  | 'verifying'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed';

export interface SherpaDownloadResult {
  success: boolean;
  cancelled?: boolean;
  status?: 'completed' | 'cancelled' | 'error';
  source?: string;
  error?: string;
}

export interface SherpaProgressEvent {
  modelId: string;
  percent: number;
  status: 'downloading' | 'verifying' | 'completed' | 'cancelled' | 'error';
  error?: string;
  source?: string;
  bytes_done?: number;
  total_bytes?: number;
}

export interface ActiveDownloadTask {
  modelId: string;
  normalizedId: string;
  sessionId: string;
  controller: AbortController;
  state: DownloadTaskState;
  modelDir: string;
  stagingDir: string | null;
  tempFiles: Set<string>;
  activeRequests: Set<http.ClientRequest>;
  activeResponses: Set<http.IncomingMessage>;
  activeFileStreams: Set<fs.WriteStream>;
  promise: Promise<SherpaDownloadResult>;
}

export class DownloadCancelledError extends Error {
  public readonly isCancelled = true;
  constructor(message = 'Download cancelled by user') {
    super(message);
    this.name = 'DownloadCancelledError';
  }
}

export function isCancellationError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DownloadCancelledError) return true;
  const anyErr = err as any;
  return Boolean(
    anyErr?.isCancelled === true ||
    anyErr?.name === 'AbortError' ||
    anyErr?.name === 'CanceledError' ||
    anyErr?.code === 'ERR_CANCELED' ||
    /Download cancelled by user/i.test(String(anyErr?.message || ''))
  );
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DownloadCancelledError());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DownloadCancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function waitForStreamClose(stream: fs.WriteStream, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    if ((stream as any).closed || (stream as any).destroyed) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    stream.once('close', finish);
    stream.once('error', finish);
    try {
      stream.destroy();
    } catch {
      finish();
    }
  });
}

export async function abortTask(task: ActiveDownloadTask): Promise<void> {
  if (task.state !== 'completed' && task.state !== 'failed' && task.state !== 'cancelled') {
    task.state = 'cancelling';
  }
  if (!task.controller.signal.aborted) {
    task.controller.abort(new DownloadCancelledError());
  }

  for (const res of Array.from(task.activeResponses)) {
    try { res.destroy(new DownloadCancelledError()); } catch {}
  }
  for (const req of Array.from(task.activeRequests)) {
    try { req.destroy(new DownloadCancelledError()); } catch {}
  }

  const streamClosers = Array.from(task.activeFileStreams).map((s) => waitForStreamClose(s));
  if (streamClosers.length > 0) {
    await Promise.allSettled(streamClosers);
  }
}

const hasFs = (fn: keyof typeof fs): boolean =>
  Object.prototype.hasOwnProperty.call(fs, fn) && typeof (fs as any)[fn] === 'function';

export function pruneOrphanedStagingDirs(modelDir: string, activeStagingDirs: Set<string>): void {
  const stagingRoot = path.join(modelDir, '.staging');
  if (!hasFs('readdirSync') || !hasFs('existsSync') || !fs.existsSync(stagingRoot)) {
    return;
  }
  try {
    for (const entry of fs.readdirSync(stagingRoot)) {
      const candidate = path.join(stagingRoot, entry);
      if (activeStagingDirs.has(candidate)) continue;
      if (hasFs('rmSync')) {
        try { fs.rmSync(candidate, { recursive: true, force: true }); } catch {}
      }
    }
  } catch {}
}

export function createStagingSessionDir(
  modelDir: string,
  normalizedId: string,
  activeStagingDirs: Set<string>
): string {
  pruneOrphanedStagingDirs(modelDir, activeStagingDirs);
  const safeId = normalizedId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const sessionDir = path.join(
    modelDir,
    '.staging',
    `${safeId}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  if (hasFs('mkdirSync')) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  activeStagingDirs.add(sessionDir);
  return sessionDir;
}

export async function removeStagingSessionDir(
  stagingDir: string | null,
  activeStagingDirs: Set<string>,
  task?: ActiveDownloadTask
): Promise<void> {
  if (task && task.activeFileStreams.size > 0) {
    await Promise.allSettled(Array.from(task.activeFileStreams).map((s) => waitForStreamClose(s)));
  }

  if (!stagingDir && (!task || task.tempFiles.size === 0)) {
    return;
  }

  if (task && task.tempFiles.size > 0 && hasFs('unlinkSync')) {
    for (const tmp of Array.from(task.tempFiles)) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
    }
  }

  if (!stagingDir) return;
  activeStagingDirs.delete(stagingDir);

  if (hasFs('rmSync')) {
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {}
  }

  // Clean up parent .staging folder only if completely empty
  const stagingRoot = path.dirname(stagingDir);
  if (hasFs('readdirSync') && hasFs('rmdirSync')) {
    try {
      if (fs.existsSync(stagingRoot) && fs.readdirSync(stagingRoot).length === 0) {
        fs.rmdirSync(stagingRoot);
      }
    } catch {}
  }
}

export function publishStagedFiles(
  stagedPairs: Array<{ tempPath: string; finalPath: string }>,
  metaPath?: string,
  metaContent?: string
): void {
  for (const pair of stagedPairs) {
    const destDir = path.dirname(pair.finalPath);
    if (hasFs('mkdirSync') && !fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    if (hasFs('renameSync')) {
      try {
        if (fs.existsSync(pair.finalPath) && hasFs('unlinkSync')) {
          fs.unlinkSync(pair.finalPath);
        }
        fs.renameSync(pair.tempPath, pair.finalPath);
      } catch (err: any) {
        if (err?.code === 'EXDEV' && hasFs('copyFileSync')) {
          fs.copyFileSync(pair.tempPath, pair.finalPath);
          if (hasFs('unlinkSync')) fs.unlinkSync(pair.tempPath);
        } else {
          throw err;
        }
      }
    } else if (hasFs('copyFileSync')) {
      fs.copyFileSync(pair.tempPath, pair.finalPath);
    }
  }

  if (metaPath && metaContent !== undefined) {
    if (hasFs('renameSync') && hasFs('writeFileSync')) {
      const metaTmp = `${metaPath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(metaTmp, metaContent);
      try {
        if (fs.existsSync(metaPath) && hasFs('unlinkSync')) fs.unlinkSync(metaPath);
        fs.renameSync(metaTmp, metaPath);
      } catch {
        fs.writeFileSync(metaPath, metaContent);
        try { if (fs.existsSync(metaTmp) && hasFs('unlinkSync')) fs.unlinkSync(metaTmp); } catch {}
      }
    } else if (hasFs('writeFileSync')) {
      fs.writeFileSync(metaPath, metaContent);
    }
  }
}
