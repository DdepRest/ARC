import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { validateSherpaModelSacrificial } from './sherpa-validator.util';
import { hfRateLimiter } from './hf-rate-limiter.service';
import {
  DownloadCancelledError,
  isCancellationError,
  createStagingSessionDir,
  removeStagingSessionDir,
  publishStagedFiles,
  type ActiveDownloadTask,
  type SherpaDownloadResult,
  type SherpaProgressEvent
} from './sherpa-download-task.helper';
import { GIGAAM_SOURCE_MANIFESTS } from './model-supply-chain.manifest';
import { buildVerifiedMetaRecord, verifyStagedFileDigest } from './model-integrity.util';
import { isSecurityError } from '../utils/network-security.util';

export interface GigaamSourceSpec {
  id: string;
  manifestId: string;
  repo: string;
  sourceUrl: string;
  revision: string;
  licenseUrl: string;
  description: string;
  defaultModelFile: string;
  defaultTokensFile: string;
  files: Record<string, { size: number; sha256: string; url: string }>;
}

function buildGigaamSources(): GigaamSourceSpec[] {
  return GIGAAM_SOURCE_MANIFESTS.map((m, idx) => {
    const fileMap: Record<string, { size: number; sha256: string; url: string }> = {};
    for (const f of m.files) {
      fileMap[f.name] = { size: f.size, sha256: f.sha256, url: f.url };
    }
    return {
      id: idx === 0 ? 'csukuangfj-ru-v3' : 'csukuangfj-ru-v2',
      manifestId: m.manifestId,
      repo: m.source,
      sourceUrl: m.sourceUrl,
      revision: m.revision,
      licenseUrl: m.licenseUrl,
      description:
        idx === 0
          ? 'Official Sherpa GigaAM v3 RU (RU-only) - Primary Compatible'
          : 'Official Sherpa GigaAM v2 RU (RU-only) - Fallback Compatible',
      defaultModelFile: 'model.int8.onnx',
      defaultTokensFile: 'tokens.txt',
      files: fileMap
    };
  });
}

export const GIGAAM_SOURCES: GigaamSourceSpec[] = buildGigaamSources();

export function getActiveGigaamSource(): GigaamSourceSpec {
  return GIGAAM_SOURCES[0];
}

export interface DownloadProgressCallback {
  (data: SherpaProgressEvent | { modelId: string; percent: number; status: string; error?: string; source?: string; bytes_done?: number; total_bytes?: number }): void;
}

export class GigaamSourcesService {
  private static instance: GigaamSourcesService;
  private activeDownloadPromise: Promise<SherpaDownloadResult> | null = null;
  private activeControllers = new Set<AbortController>();
  private activeStagingDirs = new Set<string>();

  public static getInstance(): GigaamSourcesService {
    if (!GigaamSourcesService.instance) {
      GigaamSourcesService.instance = new GigaamSourcesService();
    }
    return GigaamSourcesService.instance;
  }

  public async cancelDownload(): Promise<boolean> {
    const hadActive = this.activeControllers.size > 0 || this.activeDownloadPromise !== null;
    for (const controller of Array.from(this.activeControllers)) {
      if (!controller.signal.aborted) {
        controller.abort(new DownloadCancelledError());
      }
    }
    hfRateLimiter.resetCooldown();
    if (this.activeDownloadPromise) {
      await this.activeDownloadPromise.catch(() => {});
    }
    console.log('[GigaAM Sources] Download cancelled by user request.');
    return hadActive;
  }

  public async resolveRepoFiles(
    repo: string,
    defaultModel: string,
    defaultTokens: string,
    signal?: AbortSignal
  ): Promise<{ modelFile: string; tokensFile: string }> {
    if (signal?.aborted) throw new DownloadCancelledError();
    const cacheKey = `repo_files_${repo}`;
    const cached = hfRateLimiter.getCached<{ modelFile: string; tokensFile: string }>(cacheKey);
    if (cached) return cached;

    const endpoints = [
      `https://hf-mirror.com/api/models/${repo}`,
      `https://huggingface.co/api/models/${repo}`
    ];

    for (const url of endpoints) {
      if (signal?.aborted) throw new DownloadCancelledError();
      if (url.includes('huggingface.co') && hfRateLimiter.isRateLimited()) continue;
      try {
        const res = await axios.get(url, { timeout: 6000, signal });
        if (res.data && Array.isArray(res.data.siblings)) {
          const names: string[] = res.data.siblings.map((s: any) => s.rfilename).filter(Boolean);
          const onnxFiles = names.filter((n) => n.endsWith('.onnx'));
          const pickedModel = onnxFiles.find((n) => n.includes('.int8.onnx'))
            || onnxFiles.find((n) => n.includes('ctc'))
            || onnxFiles.find((n) => n === 'model.onnx')
            || onnxFiles[0];

          const txtFiles = names.filter((n) => n.endsWith('.txt') && !n.includes('requirement') && !n.startsWith('.'));
          const pickedTokens = txtFiles.find((n) => n.includes('vocab'))
            || txtFiles.find((n) => n.includes('tokens'))
            || txtFiles[0];

          if (pickedModel && pickedTokens) {
            const result = { modelFile: pickedModel, tokensFile: pickedTokens };
            hfRateLimiter.setCached(cacheKey, result, 60 * 60 * 1000);
            return result;
          }
        }
      } catch (err: any) {
        if (signal?.aborted || isCancellationError(err)) {
          throw new DownloadCancelledError();
        }
        if (err.response?.status === 429) {
          hfRateLimiter.record429(err.response.headers?.['retry-after']);
        }
        console.warn(`[GigaAM Sources] API check failed for ${url}: ${err.message}`);
      }
    }

    const fallback = { modelFile: defaultModel, tokensFile: defaultTokens };
    hfRateLimiter.setCached(cacheKey, fallback, 60 * 60 * 1000);
    return fallback;
  }

  public async downloadSingleFile(
    url: string,
    dest: string,
    onProgressChunk: (bytes: number) => void,
    retries = 2,
    options?: { signal?: AbortSignal; task?: ActiveDownloadTask; maxBytes?: number }
  ): Promise<void> {
    await hfRateLimiter.downloadFileWithMirrorFallback(url, dest, onProgressChunk, retries, options);
  }

  public async downloadWithFallbackChain(
    targetDir: string,
    onProgress: DownloadProgressCallback,
    options?: { signal?: AbortSignal; task?: ActiveDownloadTask }
  ): Promise<SherpaDownloadResult> {
    if (this.activeDownloadPromise) {
      return this.activeDownloadPromise;
    }

    const controller = new AbortController();
    const onExternalAbort = () => {
      if (!controller.signal.aborted) controller.abort(new DownloadCancelledError());
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        onExternalAbort();
      } else {
        options.signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    this.activeControllers.add(controller);

    if (!controller.signal.aborted) {
      hfRateLimiter.clearCancel();
    }

    let runPromise: Promise<SherpaDownloadResult> | null = null;
    runPromise = (async (): Promise<SherpaDownloadResult> => {
      try {
        return await this.executeFallbackChain(targetDir, onProgress, controller.signal, options?.task);
      } finally {
        options?.signal?.removeEventListener('abort', onExternalAbort);
        this.activeControllers.delete(controller);
        if (this.activeDownloadPromise === runPromise) {
          this.activeDownloadPromise = null;
        }
      }
    })();

    this.activeDownloadPromise = runPromise;
    return runPromise;
  }

  private async executeFallbackChain(
    targetDir: string,
    onProgress: DownloadProgressCallback,
    signal: AbortSignal,
    task?: ActiveDownloadTask
  ): Promise<SherpaDownloadResult> {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let lastError = 'No source available';
    let terminalSent = false;
    const emit = (ev: SherpaProgressEvent) => {
      if (terminalSent) return;
      if (signal.aborted && ev.status !== 'cancelled') return;
      if (ev.status === 'cancelled' || ev.status === 'completed' || ev.status === 'error') {
        terminalSent = true;
      }
      onProgress(ev);
    };

    if (signal.aborted) {
      emit({ modelId: 'gigaam-ctc', percent: 0, status: 'cancelled' });
      return { success: false, cancelled: true, status: 'cancelled' };
    }

    for (let i = 0; i < GIGAAM_SOURCES.length; i++) {
      if (signal.aborted) {
        emit({ modelId: 'gigaam-ctc', percent: 0, status: 'cancelled' });
        return { success: false, cancelled: true, status: 'cancelled' };
      }

      const source = GIGAAM_SOURCES[i];
      if (hfRateLimiter.isRateLimited()) {
        const canProceed = await hfRateLimiter.waitForCooldown(undefined, signal);
        if (!canProceed || signal.aborted) {
          emit({ modelId: 'gigaam-ctc', percent: 0, status: 'cancelled' });
          return { success: false, cancelled: true, status: 'cancelled' };
        }
      }

      emit({ modelId: 'gigaam-ctc', percent: 0, status: 'downloading', source: source.repo });
      const stagingDir = createStagingSessionDir(targetDir, 'gigaam-ctc', this.activeStagingDirs);
      if (task) task.stagingDir = stagingDir;

      try {
        const resolved = await this.resolveRepoFiles(
          source.repo,
          source.defaultModelFile,
          source.defaultTokensFile,
          signal
        );
        const modelFile = source.files[resolved.modelFile] ? resolved.modelFile : source.defaultModelFile;
        const tokensFile = source.files[resolved.tokensFile] ? resolved.tokensFile : source.defaultTokensFile;
        const modelSpec = source.files[modelFile];
        const tokensSpec = source.files[tokensFile];
        if (!modelSpec?.sha256 || !tokensSpec?.sha256) {
          throw new Error(`Missing pinned SHA-256 manifest entries for ${source.repo}`);
        }

        const stagedModel = path.join(stagingDir, modelFile);
        const stagedTokens = path.join(stagingDir, tokensFile);
        const tokensUrl = `https://hf-mirror.com/${source.repo}/resolve/${source.revision}/${tokensFile}`;
        const modelUrl = `https://hf-mirror.com/${source.repo}/resolve/${source.revision}/${modelFile}`;

        let lastReportedTime = 0;
        let downloadedBytes = 0;
        const totalExpectedBytes = modelSpec.size + tokensSpec.size;
        const handleChunk = (chunk: number) => {
          if (signal.aborted) return;
          downloadedBytes += chunk;
          const now = Date.now();
          if (now - lastReportedTime >= 400) {
            lastReportedTime = now;
            const pct = Math.min(99, Math.round((downloadedBytes / totalExpectedBytes) * 100));
            emit({
              modelId: 'gigaam-ctc',
              percent: pct,
              status: 'downloading',
              source: source.repo,
              bytes_done: downloadedBytes,
              total_bytes: totalExpectedBytes
            });
          }
        };

        await this.downloadSingleFile(tokensUrl, stagedTokens, handleChunk, 2, { signal, task, maxBytes: tokensSpec.size });
        if (signal.aborted) throw new DownloadCancelledError();
        const tokensCheck = verifyStagedFileDigest(stagedTokens, tokensSpec.size, tokensSpec.sha256);
        if (!tokensCheck.ok || !tokensCheck.actualSha256) {
          throw new Error(tokensCheck.reason || `Integrity check failed for ${tokensFile}`);
        }

        await this.downloadSingleFile(modelUrl, stagedModel, handleChunk, 2, { signal, task, maxBytes: modelSpec.size });
        if (signal.aborted) throw new DownloadCancelledError();
        const modelCheck = verifyStagedFileDigest(stagedModel, modelSpec.size, modelSpec.sha256);
        if (!modelCheck.ok || !modelCheck.actualSha256) {
          throw new Error(modelCheck.reason || `Integrity check failed for ${modelFile}`);
        }

        if (task) task.state = 'verifying';
        emit({ modelId: 'gigaam-ctc', percent: 99, status: 'verifying', source: source.repo, bytes_done: downloadedBytes, total_bytes: totalExpectedBytes });

        const valResult = await validateSherpaModelSacrificial(stagedModel, stagedTokens, 15000, signal);
        if (signal.aborted || valResult.cancelled) {
          throw new DownloadCancelledError();
        }

        if (valResult.success && valResult.verified) {
          const finalModel = path.join(targetDir, modelFile);
          const finalTokens = path.join(targetDir, tokensFile);
          const metaPath = path.join(targetDir, 'download_meta.json');
          const fileDigests = {
            [modelFile]: { size: modelCheck.actualSize, sha256: modelCheck.actualSha256 },
            [tokensFile]: { size: tokensCheck.actualSize, sha256: tokensCheck.actualSha256 }
          };
          const metaData = buildVerifiedMetaRecord(
            {
              manifestId: source.manifestId,
              source: source.repo,
              sourceUrl: source.sourceUrl,
              revision: source.revision,
              licenseUrl: source.licenseUrl
            },
            fileDigests,
            {
              sourceId: source.id,
              description: source.description,
              modelFile,
              tokensFile,
              checksum: `${modelCheck.actualSize}_${modelCheck.actualSha256}`
            }
          );

          publishStagedFiles(
            [
              { tempPath: stagedModel, finalPath: finalModel },
              { tempPath: stagedTokens, finalPath: finalTokens }
            ],
            metaPath,
            JSON.stringify(metaData, null, 2)
          );

          const symModel = path.join(targetDir, 'model.onnx');
          const symTokens = path.join(targetDir, 'tokens.txt');
          if (finalModel !== symModel && !fs.existsSync(symModel)) {
            try { fs.copyFileSync(finalModel, symModel); } catch {}
          }
          if (finalTokens !== symTokens && !fs.existsSync(symTokens)) {
            try { fs.copyFileSync(finalTokens, symTokens); } catch {}
          }

          emit({ modelId: 'gigaam-ctc', percent: 100, status: 'completed', source: source.repo });
          return { success: true, status: 'completed', source: source.repo };
        }

        throw new Error(`Sherpa OfflineRecognizer validation failed for ${source.repo}: ${valResult.error || 'exit != 0'}`);
      } catch (err: any) {
        if (signal.aborted || isCancellationError(err)) {
          emit({ modelId: 'gigaam-ctc', percent: 0, status: 'cancelled' });
          return { success: false, cancelled: true, status: 'cancelled' };
        }
        lastError = err?.message || String(err);
        console.warn(`[GigaAM Sources] Failed source ${source.repo}: ${lastError}. Cleaning staging and trying next...`);
        if (isSecurityError(err)) break;
      } finally {
        await removeStagingSessionDir(stagingDir, this.activeStagingDirs, task);
        if (task) task.stagingDir = null;
      }
    }

    const fullErrorMsg = `All GigaAM sources failed: ${lastError}`;
    emit({ modelId: 'gigaam-ctc', percent: 0, status: 'error', error: fullErrorMsg });
    return { success: false, status: 'error', error: fullErrorMsg };
  }
}

export const gigaamSourcesService = GigaamSourcesService.getInstance();
