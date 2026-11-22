import * as fs from 'fs';
import * as path from 'path';
import { resolveSherpaModelDir } from './sherpa-paths.util';
import { gigaamSourcesService } from './gigaam-sources.service';
import {
  abortTask,
  abortableDelay,
  createStagingSessionDir,
  DownloadCancelledError,
  isCancellationError,
  publishStagedFiles,
  removeStagingSessionDir,
  type ActiveDownloadTask,
  type SherpaDownloadResult,
  type SherpaProgressEvent
} from './sherpa-download-task.helper';
import {
  downloadFileWithSignal,
  probeRemoteFileSizeSafe
} from './sherpa-http-download.util';
import { MODEL_SUPPLY_CHAIN_MANIFESTS } from './model-supply-chain.manifest';
import {
  buildVerifiedMetaRecord,
  computeFileSha256Sync,
  verifyStagedFileDigest
} from './model-integrity.util';
import {
  isLoopbackDownloadTestHarnessEnabled,
  isSecurityError
} from '../utils/network-security.util';

export interface SherpaFileSpec {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

export interface SherpaModelConfigEntry {
  manifestId: string;
  repo: string;
  sourceUrl: string;
  revision: string;
  licenseUrl: string;
  locale: string;
  engineCompatibility: string[];
  files: SherpaFileSpec[];
}

function toConfigEntry(manifestIdKey: string): SherpaModelConfigEntry {
  const m = MODEL_SUPPLY_CHAIN_MANIFESTS[manifestIdKey];
  return {
    manifestId: m.manifestId,
    repo: m.source,
    sourceUrl: m.sourceUrl,
    revision: m.revision,
    licenseUrl: m.licenseUrl,
    locale: m.locale,
    engineCompatibility: [...m.engineCompatibility],
    files: m.files.map((f) => ({ name: f.name, url: f.url, size: f.size, sha256: f.sha256 }))
  };
}

export const SHERPA_MODELS_CONFIG: Record<string, SherpaModelConfigEntry> = {
  'silero-vad': toConfigEntry('silero-vad'),
  'gigaam-ctc': toConfigEntry('gigaam-ctc'),
  'zipformer-ru': toConfigEntry('zipformer-ru'),
  'whisper-small': toConfigEntry('whisper-small')
};

export class SherpaDownloaderService {
  private static instance: SherpaDownloaderService;
  private activeTasks = new Map<string, ActiveDownloadTask>();
  private activeStagingDirs = new Set<string>();

  public static getInstance(): SherpaDownloaderService {
    if (!SherpaDownloaderService.instance) {
      SherpaDownloaderService.instance = new SherpaDownloaderService();
    }
    return SherpaDownloaderService.instance;
  }

  public normalizeModelId(modelId: string): string {
    if (modelId === 'gigaam') return 'gigaam-ctc';
    if (modelId === 'sherpa-zipformer-ru' || modelId === 'sherpa-ru-archive.tar.bz2') return 'zipformer-ru';
    if (modelId === 'sherpa-whisper-turbo') return 'whisper-base';
    return modelId;
  }

  public getModelDir(modelId: string = 'zipformer-ru'): string {
    return resolveSherpaModelDir(modelId).dir;
  }

  public getActiveModelIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  public async cancelDownload(modelId?: string): Promise<boolean> {
    if (!modelId) {
      await this.cancelAllDownloads();
      return true;
    }

    const normalizedId = this.normalizeModelId(modelId);
    const task = this.activeTasks.get(normalizedId);
    if (!task) {
      return false;
    }

    await abortTask(task);
    if (normalizedId === 'gigaam-ctc') {
      await gigaamSourcesService.cancelDownload();
    }
    await task.promise.catch(() => {});
    return true;
  }

  public async cancelAllDownloads(): Promise<void> {
    const tasks = Array.from(this.activeTasks.values());
    await Promise.allSettled(tasks.map((t) => abortTask(t)));
    await gigaamSourcesService.cancelDownload();
    await Promise.allSettled(tasks.map((t) => t.promise));
  }

  private async downloadSingleFile(
    url: string,
    destPartPath: string,
    onProgressChunk: (bytesRead: number) => void,
    retries = 3,
    task?: ActiveDownloadTask,
    maxBytes?: number
  ): Promise<void> {
    await downloadFileWithSignal({
      url,
      destPartPath,
      onProgressChunk,
      signal: task?.controller.signal,
      task,
      retries,
      maxBytes,
      resolveAttemptUrl: (baseUrl, attempt) =>
        attempt > 1 ? baseUrl.replace('https://huggingface.co/', 'https://hf-mirror.com/') : baseUrl
    });
  }

  public async getRemoteFileSize(url: string, signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) throw new DownloadCancelledError();
    try {
      const targetUrl = url.replace('https://huggingface.co/', 'https://hf-mirror.com/');
      return await probeRemoteFileSizeSafe(targetUrl, signal);
    } catch (e: any) {
      if (signal?.aborted || isCancellationError(e)) throw new DownloadCancelledError();
      if (isSecurityError(e)) throw e;
      try {
        return await probeRemoteFileSizeSafe(url, signal);
      } catch (e2: any) {
        if (signal?.aborted || isCancellationError(e2)) throw new DownloadCancelledError();
        if (isSecurityError(e2)) throw e2;
        return 0;
      }
    }
  }

  public async downloadModel(
    modelId: string,
    onProgress: (data: SherpaProgressEvent | { modelId: string; percent: number; status: string; error?: string }) => void
  ): Promise<SherpaDownloadResult> {
    const normalizedId = this.normalizeModelId(modelId);
    const existing = this.activeTasks.get(normalizedId);
    if (existing) {
      if (existing.state === 'cancelling') {
        await existing.promise.catch(() => {});
      } else {
        return existing.promise;
      }
    }

    const controller = new AbortController();
    const task: ActiveDownloadTask = {
      modelId,
      normalizedId,
      sessionId: `${normalizedId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      controller,
      state: 'downloading',
      modelDir: this.getModelDir(normalizedId),
      stagingDir: null,
      tempFiles: new Set(),
      activeRequests: new Set(),
      activeResponses: new Set(),
      activeFileStreams: new Set(),
      promise: Promise.resolve({ success: false })
    };

    const runPromise = (async (): Promise<SherpaDownloadResult> => {
      try {
        return await this.executeDownloadModel(task, onProgress);
      } finally {
        await removeStagingSessionDir(task.stagingDir, this.activeStagingDirs, task);
        task.stagingDir = null;
        if (this.activeTasks.get(normalizedId) === task) {
          this.activeTasks.delete(normalizedId);
        }
      }
    })();

    task.promise = runPromise;
    this.activeTasks.set(normalizedId, task);
    return runPromise;
  }

  private createSafeEmitter(
    task: ActiveDownloadTask,
    onProgress: (data: SherpaProgressEvent) => void
  ): (ev: SherpaProgressEvent) => void {
    let terminalSent = false;
    return (ev: SherpaProgressEvent) => {
      if (terminalSent) return;
      if (task.controller.signal.aborted && ev.status !== 'cancelled') return;
      if (ev.status === 'cancelled' || ev.status === 'completed' || ev.status === 'error') {
        terminalSent = true;
      }
      onProgress(ev);
    };
  }

  private async executeDownloadModel(
    task: ActiveDownloadTask,
    onProgress: (data: SherpaProgressEvent | { modelId: string; percent: number; status: string; error?: string }) => void
  ): Promise<SherpaDownloadResult> {
    const { normalizedId, modelId } = task;
    const signal = task.controller.signal;
    const emit = this.createSafeEmitter(task, onProgress as (data: SherpaProgressEvent) => void);

    try {
      if (normalizedId === 'gigaam-ctc') {
        const res = await gigaamSourcesService.downloadWithFallbackChain(task.modelDir, (ev) => emit(ev as SherpaProgressEvent), { signal, task });
        task.state = res.cancelled ? 'cancelled' : (res.success ? 'completed' : 'failed');
        return res;
      }

      if (normalizedId === 'silero-vad') {
        await abortableDelay(0, signal);
        const vadCfgUrl = SHERPA_MODELS_CONFIG['silero-vad']?.files[0]?.url || '';
        const isLocalTest = isLoopbackDownloadTestHarnessEnabled() && /^http:\/\/(127\.0\.0\.1|localhost)/i.test(vadCfgUrl);
        if (!isLocalTest) {
          const vadDirRes = resolveSherpaModelDir('silero-vad');
          if (vadDirRes.isComplete) {
            task.state = 'completed';
            emit({ modelId, percent: 100, status: 'completed' });
            return { success: true, status: 'completed' };
          }
        }
      }

      const config = SHERPA_MODELS_CONFIG[normalizedId];
      if (!config) {
        const err = `Unknown modelId: ${modelId}`;
        task.state = 'failed';
        emit({ modelId, percent: 0, status: 'error', error: err });
        return { success: false, status: 'error', error: err };
      }

      // Fail-closed: refuse automatic download if any file lacks a valid pinned SHA-256
      for (const fileSpec of config.files) {
        if (!fileSpec.sha256 || !/^[a-f0-9]{64}$/i.test(fileSpec.sha256)) {
          throw new Error(`Supply-chain manifest missing trusted SHA-256 for ${normalizedId}/${fileSpec.name}`);
        }
      }

      const resolvedSpecs: SherpaFileSpec[] = config.files.map((f) => ({ ...f }));
      if (!fs.existsSync(task.modelDir)) {
        fs.mkdirSync(task.modelDir, { recursive: true });
      }

      const totalSize = resolvedSpecs.reduce((acc, f) => acc + f.size, 0) || 1;
      let overallLoaded = 0;
      const filesToDownload: SherpaFileSpec[] = [];
      const verifiedFileDigests: Record<string, { size: number; sha256: string }> = {};

      emit({ modelId, percent: 0, status: 'downloading', bytes_done: 0, total_bytes: totalSize });

      for (const fileSpec of resolvedSpecs) {
        if (signal.aborted) throw new DownloadCancelledError();
        const filePath = path.join(task.modelDir, fileSpec.name);
        let upToDate = false;
        if (fs.existsSync(filePath)) {
          try {
            const stats = fs.statSync(filePath);
            if (stats && stats.size > 0 && (fileSpec.size <= 0 || stats.size === fileSpec.size)) {
              const diskSha = computeFileSha256Sync(filePath, true);
              if (diskSha && diskSha.toLowerCase() === fileSpec.sha256.toLowerCase()) {
                overallLoaded += stats.size;
                upToDate = true;
                verifiedFileDigests[fileSpec.name] = { size: stats.size, sha256: diskSha };
                const pct = Math.min(99, Math.round((overallLoaded / totalSize) * 100));
                emit({ modelId, percent: pct, status: 'downloading', bytes_done: overallLoaded, total_bytes: totalSize });
              }
            }
          } catch {}
        }
        if (!upToDate) filesToDownload.push(fileSpec);
      }

      const stagedPairs: Array<{ tempPath: string; finalPath: string }> = [];

      if (filesToDownload.length > 0) {
        task.stagingDir = createStagingSessionDir(task.modelDir, normalizedId, this.activeStagingDirs);

        for (const fileSpec of filesToDownload) {
          if (signal.aborted) throw new DownloadCancelledError();
          const finalPath = path.join(task.modelDir, fileSpec.name);
          const stagedPart = path.join(task.stagingDir, `${fileSpec.name}.part`);

          const downloadWithIntegrityCheck = async (isRetry = false): Promise<{ size: number; sha256: string }> => {
            if (signal.aborted) throw new DownloadCancelledError();
            let fileLoadedThisAttempt = 0;
            await this.downloadSingleFile(
              fileSpec.url,
              stagedPart,
              (chunkSize) => {
                if (signal.aborted) return;
                fileLoadedThisAttempt += chunkSize;
                const currentTotal = overallLoaded + fileLoadedThisAttempt;
                const pct = Math.min(99, Math.round((currentTotal / totalSize) * 100));
                emit({ modelId, percent: pct, status: 'downloading', bytes_done: currentTotal, total_bytes: totalSize });
              },
              3,
              task,
              fileSpec.size > 0 ? fileSpec.size : undefined
            );
            if (signal.aborted) throw new DownloadCancelledError();

            const check = verifyStagedFileDigest(stagedPart, fileSpec.size, fileSpec.sha256);
            if (!check.ok || !check.actualSha256) {
              try { if (fs.existsSync(stagedPart)) fs.unlinkSync(stagedPart); } catch {}
              if (!isRetry && check.reason?.includes('Size mismatch')) {
                await abortableDelay(400, signal);
                return downloadWithIntegrityCheck(true);
              }
              throw new Error(check.reason || `Integrity check failed for ${fileSpec.name}`);
            }
            return { size: check.actualSize, sha256: check.actualSha256 };
          };

          const verified = await downloadWithIntegrityCheck();
          overallLoaded += verified.size;
          verifiedFileDigests[fileSpec.name] = verified;
          stagedPairs.push({ tempPath: stagedPart, finalPath });
        }
      }

      if (signal.aborted) throw new DownloadCancelledError();
      task.state = 'verifying';
      emit({ modelId, percent: 99, status: 'verifying', bytes_done: overallLoaded, total_bytes: totalSize });

      for (const pair of stagedPairs) {
        const spec = resolvedSpecs.find((f) => path.basename(pair.finalPath) === f.name);
        if (!spec) throw new Error(`Unexpected staged file: ${pair.finalPath}`);
        const check = verifyStagedFileDigest(pair.tempPath, spec.size, spec.sha256);
        if (!check.ok) {
          throw new Error(check.reason || `Staged verification failed for ${spec.name}`);
        }
      }

      const metaPath = path.join(task.modelDir, 'download_meta.json');
      const metaRecord = buildVerifiedMetaRecord(
        {
          manifestId: config.manifestId,
          source: config.repo,
          sourceUrl: config.sourceUrl,
          revision: config.revision,
          licenseUrl: config.licenseUrl
        },
        verifiedFileDigests
      );

      if (signal.aborted) throw new DownloadCancelledError();
      publishStagedFiles(stagedPairs, metaPath, JSON.stringify(metaRecord, null, 2));

      task.state = 'completed';
      emit({ modelId, percent: 100, status: 'completed' });
      return { success: true, status: 'completed' };
    } catch (error: any) {
      if (signal.aborted || isCancellationError(error)) {
        task.state = 'cancelled';
        emit({ modelId, percent: 0, status: 'cancelled' });
        return { success: false, cancelled: true, status: 'cancelled' };
      }
      const errMsg = error?.message || String(error);
      task.state = 'failed';
      emit({ modelId, percent: 0, status: 'error', error: errMsg });
      return { success: false, status: 'error', error: errMsg };
    }
  }
}

export const sherpaDownloaderService = SherpaDownloaderService.getInstance();
