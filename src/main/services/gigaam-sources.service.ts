import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import axios from 'axios';
import { validateSherpaModelSacrificial, computeFileChecksum } from './sherpa-validator.util';
import { hfRateLimiter } from './hf-rate-limiter.service';

export interface GigaamSourceSpec {
  id: string;
  repo: string;
  description: string;
  defaultModelFile: string;
  defaultTokensFile: string;
}

export const GIGAAM_SOURCES: GigaamSourceSpec[] = [
  {
    id: 'csukuangfj-ru-v3',
    repo: 'csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16',
    description: 'Official Sherpa GigaAM v3 RU (RU-only) - Primary Compatible',
    defaultModelFile: 'model.int8.onnx',
    defaultTokensFile: 'tokens.txt'
  },
  {
    id: 'csukuangfj-ru-v2',
    repo: 'csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19',
    description: 'Official Sherpa GigaAM v2 RU (RU-only) - Fallback Compatible',
    defaultModelFile: 'model.int8.onnx',
    defaultTokensFile: 'tokens.txt'
  }
];

export function getActiveGigaamSource(): GigaamSourceSpec {
  return GIGAAM_SOURCES[0];
}

export interface DownloadProgressCallback {
  (data: { modelId: string; percent: number; status: string; error?: string; source?: string; bytes_done?: number; total_bytes?: number }): void;
}

export class GigaamSourcesService {
  private static instance: GigaamSourcesService;
  private activeDownloadPromise: Promise<{ success: boolean; source?: string; error?: string }> | null = null;

  public static getInstance(): GigaamSourcesService {
    if (!GigaamSourcesService.instance) {
      GigaamSourcesService.instance = new GigaamSourcesService();
    }
    return GigaamSourcesService.instance;
  }

  public cancelDownload(): void {
    hfRateLimiter.resetCooldown();
    this.activeDownloadPromise = null;
    console.log('[GigaAM Sources] Download cancelled by user request.');
  }

  /**
   * Resolves remote files for a given HF repository using Hugging Face API or mirror.
   */
  public async resolveRepoFiles(repo: string, defaultModel: string, defaultTokens: string): Promise<{ modelFile: string; tokensFile: string }> {
    const cacheKey = `repo_files_${repo}`;
    const cached = hfRateLimiter.getCached<{ modelFile: string; tokensFile: string }>(cacheKey);
    if (cached) return cached;

    const endpoints = [
      `https://hf-mirror.com/api/models/${repo}`,
      `https://huggingface.co/api/models/${repo}`
    ];

    for (const url of endpoints) {
      if (url.includes('huggingface.co') && hfRateLimiter.isRateLimited()) continue;
      try {
        const res = await axios.get(url, { timeout: 6000 });
        if (res.data && Array.isArray(res.data.siblings)) {
          const names: string[] = res.data.siblings.map((s: any) => s.rfilename).filter(Boolean);

          const onnxFiles = names.filter(n => n.endsWith('.onnx'));
          let pickedModel = onnxFiles.find(n => n.includes('.int8.onnx'))
            || onnxFiles.find(n => n.includes('ctc'))
            || onnxFiles.find(n => n === 'model.onnx')
            || onnxFiles[0];

          const txtFiles = names.filter(n => n.endsWith('.txt') && !n.includes('requirement') && !n.startsWith('.'));
          let pickedTokens = txtFiles.find(n => n.includes('vocab'))
            || txtFiles.find(n => n.includes('tokens'))
            || txtFiles[0];

          if (pickedModel && pickedTokens) {
            const result = { modelFile: pickedModel, tokensFile: pickedTokens };
            hfRateLimiter.setCached(cacheKey, result, 60 * 60 * 1000);
            return result;
          }
        }
      } catch (err: any) {
        if (err.response?.status === 429) {
          const retryAfter = err.response.headers?.['retry-after'];
          hfRateLimiter.record429(retryAfter);
        }
        console.warn(`[GigaAM Sources] API check failed for ${url}: ${err.message}`);
      }
    }

    const fallback = { modelFile: defaultModel, tokensFile: defaultTokens };
    hfRateLimiter.setCached(cacheKey, fallback, 60 * 60 * 1000);
    return fallback;
  }

  public downloadSingleFile(
    url: string,
    dest: string,
    onProgressChunk: (bytes: number) => void,
    retries = 2
  ): Promise<void> {
    return hfRateLimiter.downloadFileWithMirrorFallback(url, dest, onProgressChunk, retries);
  }

  public async downloadWithFallbackChain(
    targetDir: string,
    onProgress: DownloadProgressCallback
  ): Promise<{ success: boolean; source?: string; error?: string }> {
    if (this.activeDownloadPromise) {
      return this.activeDownloadPromise;
    }
    this.activeDownloadPromise = (async () => {
      try {
        return await this.executeFallbackChain(targetDir, onProgress);
      } finally {
        this.activeDownloadPromise = null;
      }
    })();
    return this.activeDownloadPromise;
  }

  private async executeFallbackChain(
    targetDir: string,
    onProgress: DownloadProgressCallback
  ): Promise<{ success: boolean; source?: string; error?: string }> {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let lastError = 'No source available';

    for (let i = 0; i < GIGAAM_SOURCES.length; i++) {
      const source = GIGAAM_SOURCES[i];

      // HF rate limiting check: wait for cooldown to expire before attempting next source
      if (hfRateLimiter.isRateLimited()) {
        console.log(`[GigaAM Sources] HF rate-limited. Waiting for cooldown before source #${i + 1} (${source.repo})...`);
        const canProceed = await hfRateLimiter.waitForCooldown();
        if (!canProceed) {
          console.warn('[GigaAM Sources] Download cancelled during cooldown.');
          break;
        }
      }

      console.log(`[GigaAM Sources] Trying source #${i + 1}: ${source.repo} (${source.description})...`);

      onProgress({
        modelId: 'gigaam-ctc',
        percent: 0,
        status: 'downloading',
        source: source.repo
      });

      try {
        const { modelFile, tokensFile } = await this.resolveRepoFiles(
          source.repo,
          source.defaultModelFile,
          source.defaultTokensFile
        );

        const modelDest = path.join(targetDir, modelFile);
        const tokensDest = path.join(targetDir, tokensFile);

        const tokensUrl = `https://hf-mirror.com/${source.repo}/resolve/main/${tokensFile}`;
        const modelUrl = `https://hf-mirror.com/${source.repo}/resolve/main/${modelFile}`;

        let lastReportedTime = 0;
        let downloadedBytes = 0;
        const totalEstimatedBytes = 230 * 1024 * 1024; // ~230 MB

        // 1. Download tokens
        await this.downloadSingleFile(tokensUrl, tokensDest, (chunk) => {
          downloadedBytes += chunk;
          const now = Date.now();
          if (now - lastReportedTime >= 400) {
            lastReportedTime = now;
            const pct = Math.min(99, Math.round((downloadedBytes / totalEstimatedBytes) * 100));
            onProgress({
              modelId: 'gigaam-ctc',
              percent: pct,
              status: 'downloading',
              source: source.repo,
              bytes_done: downloadedBytes,
              total_bytes: totalEstimatedBytes
            });
          }
        }, 2);

        // 2. Download model
        await this.downloadSingleFile(modelUrl, modelDest, (chunk) => {
          downloadedBytes += chunk;
          const now = Date.now();
          if (now - lastReportedTime >= 400) {
            lastReportedTime = now;
            const pct = Math.min(99, Math.round((downloadedBytes / totalEstimatedBytes) * 100));
            onProgress({
              modelId: 'gigaam-ctc',
              percent: pct,
              status: 'downloading',
              source: source.repo,
              bytes_done: downloadedBytes,
              total_bytes: totalEstimatedBytes
            });
          }
        }, 2);

        // 3. Test initialization in sacrificial isolated process (timeout 15s)
        console.log(`[GigaAM Sources] Sacrificial testing sherpa OfflineRecognizer on ${source.repo}...`);
        const valResult = await validateSherpaModelSacrificial(modelDest, tokensDest, 15000);

        if (valResult.success && valResult.verified) {
          // Compatibility links/copies for legacy 'model.onnx' and 'tokens.txt'
          const symModel = path.join(targetDir, 'model.onnx');
          const symTokens = path.join(targetDir, 'tokens.txt');
          if (modelDest !== symModel && !fs.existsSync(symModel)) {
            try { fs.copyFileSync(modelDest, symModel); } catch {}
          }
          if (tokensDest !== symTokens && !fs.existsSync(symTokens)) {
            try { fs.copyFileSync(tokensDest, symTokens); } catch {}
          }

          // Save metadata
          const checksum = computeFileChecksum(modelDest);
          const metaPath = path.join(targetDir, 'download_meta.json');
          const metaData = {
            source: source.repo,
            sourceId: source.id,
            description: source.description,
            modelFile,
            tokensFile,
            checksum,
            downloadedAt: new Date().toISOString(),
            status: 'verified',
            verified: true,
            incompatible: false
          };
          fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));

          onProgress({
            modelId: 'gigaam-ctc',
            percent: 100,
            status: 'completed',
            source: source.repo
          });

          console.log(`[GigaAM Sources] Successfully verified and initialized GigaAM from source: ${source.repo}`);
          return { success: true, source: source.repo };
        } else {
          // Mark source as incompatible in download_meta
          const metaPath = path.join(targetDir, 'download_meta.json');
          try {
            fs.writeFileSync(metaPath, JSON.stringify({
              source: source.repo,
              sourceId: source.id,
              incompatible: true,
              verified: false,
              error: valResult.error || 'Native validation failed (sacrificial process exit != 0)',
              checkedAt: new Date().toISOString()
            }, null, 2));
          } catch {}
          throw new Error(`Sherpa OfflineRecognizer validation failed for ${source.repo}: ${valResult.error || 'exit != 0'}`);
        }
      } catch (err: any) {
        lastError = err.message || String(err);
        console.warn(`[GigaAM Sources] Failed source ${source.repo}: ${lastError}. Cleaning up and trying next...`);
        // Clean up partial files
        try {
          const files = fs.readdirSync(targetDir);
          for (const f of files) {
            if (f.endsWith('.tmp') || f.endsWith('.onnx') || f.endsWith('.txt')) {
              try { fs.unlinkSync(path.join(targetDir, f)); } catch {}
            }
          }
        } catch {}
      }
    }

    console.warn(`[GigaAM Sources] All GigaAM sources failed. Error: ${lastError}. Soft fallback active.`);
    const fullErrorMsg = `All GigaAM sources failed: ${lastError}`;
    onProgress({
      modelId: 'gigaam-ctc',
      percent: 0,
      status: 'error',
      error: fullErrorMsg
    });
    return { success: false, error: fullErrorMsg };
  }
}

export const gigaamSourcesService = GigaamSourcesService.getInstance();
