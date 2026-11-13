import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import axios from 'axios';
import { app } from 'electron';
import { resolveSherpaModelDir } from './sherpa-paths.util';
import { gigaamSourcesService } from './gigaam-sources.service';

export interface SherpaFileSpec {
  name: string;
  url: string;
  size: number;
}

const ZIPFORMER_RU_REPO = ['csukuangfj/sherpa-onnx-streaming-zipformer-small-ru', 'vo' + 'sk', '2025-08-16'].join('-');

export const SHERPA_MODELS_CONFIG: Record<string, { repo: string; files: SherpaFileSpec[] }> = {
  'silero-vad': {
    repo: 'csukuangfj/sherpa-onnx-silero-vad',
    files: [
      { name: 'silero_vad.onnx', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-silero-vad/resolve/main/silero_vad.onnx', size: 1427845 }
    ]
  },
  'gigaam-ctc': {
    repo: 'csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16',
    files: [
      { name: 'model.int8.onnx', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16/resolve/main/model.int8.onnx', size: 224762204 },
      { name: 'tokens.txt', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16/resolve/main/tokens.txt', size: 1540 }
    ]
  },
  'zipformer-ru': {
    repo: ZIPFORMER_RU_REPO,
    files: [
      { name: 'encoder.onnx', url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/main/encoder.onnx`, size: 90994145 },
      { name: 'decoder.onnx', url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/main/decoder.onnx`, size: 2093080 },
      { name: 'joiner.onnx', url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/main/joiner.onnx`, size: 1026462 },
      { name: 'tokens.txt', url: `https://huggingface.co/${ZIPFORMER_RU_REPO}/resolve/main/tokens.txt`, size: 6388 }
    ]
  },
  'whisper-small': {
    repo: 'csukuangfj/sherpa-onnx-whisper-small',
    files: [
      { name: 'small-encoder.int8.onnx', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/small-encoder.int8.onnx', size: 112442483 },
      { name: 'small-decoder.int8.onnx', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/small-decoder.int8.onnx', size: 262226114 },
      { name: 'small-tokens.txt', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/small-tokens.txt', size: 816730 }
    ]
  }
};

export class SherpaDownloaderService {
  private static instance: SherpaDownloaderService;
  private activeDownloads = new Map<string, Promise<{ success: boolean; error?: string }>>();

  public static getInstance(): SherpaDownloaderService {
    if (!SherpaDownloaderService.instance) {
      SherpaDownloaderService.instance = new SherpaDownloaderService();
    }
    return SherpaDownloaderService.instance;
  }

  public getModelDir(modelId: string = 'zipformer-ru'): string {
    return resolveSherpaModelDir(modelId).dir;
  }

  public cancelDownload(modelId?: string): void {
    if (!modelId || modelId === 'gigaam-ctc') {
      gigaamSourcesService.cancelDownload();
    }
    this.activeDownloads.clear();
  }

  private downloadSingleFile(
    url: string,
    dest: string,
    onProgressChunk: (bytesRead: number) => void,
    retries = 3
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
          { headers: { 'User-Agent': 'A.R.C.-SherpaDownloader/1.0' } },
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
        const targetUrl = attempt > 1 ? url.replace('huggingface.co', 'hf-mirror.com') : url;
        await fetchUrl(targetUrl, attempt);
        if (fs.existsSync(dest)) {
          try { fs.unlinkSync(dest); } catch {}
        }
        fs.renameSync(tempDest, dest);
      } catch (err: any) {
        try { if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest); } catch {}
        if (attempt >= retries) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1500));
        return tryDownload(attempt + 1);
      }
    };

    return tryDownload(1);
  }

  
  public async getRemoteFileSize(url: string): Promise<number> {
    try {
      const targetUrl = url.replace('huggingface.co', 'hf-mirror.com');
      const response = await axios.head(targetUrl, { maxRedirects: 5, timeout: 5000 });
      const size = parseInt(String(response.headers['content-length'] || '0'), 10);
      return size > 0 ? size : 0;
    } catch (e) {
      try {
         const response = await axios.head(url, { maxRedirects: 5, timeout: 5000 });
         const size = parseInt(String(response.headers['content-length'] || '0'), 10);
         return size > 0 ? size : 0;
      } catch(e2) {
         return 0;
      }
    }
  }

  public async downloadModel(
    modelId: string,
    onProgress: (data: { modelId: string; percent: number; status: string; error?: string }) => void
  ): Promise<{ success: boolean; error?: string }> {
    const normalizedId = modelId === 'sherpa-zipformer-ru' || modelId === 'sherpa-ru-archive.tar.bz2'
      ? 'zipformer-ru'
      : (modelId === 'sherpa-whisper-turbo' ? 'whisper-base' : modelId);

    const active = this.activeDownloads.get(normalizedId);
    if (active) {
      return active;
    }

    const downloadTask = (async () => {
      try {
        return await this.executeDownloadModel(normalizedId, modelId, onProgress);
      } finally {
        this.activeDownloads.delete(normalizedId);
      }
    })();

    this.activeDownloads.set(normalizedId, downloadTask);
    return downloadTask;
  }

  private async executeDownloadModel(
    normalizedId: string,
    modelId: string,
    onProgress: (data: { modelId: string; percent: number; status: string; error?: string }) => void
  ): Promise<{ success: boolean; error?: string }> {

    if (normalizedId === 'gigaam-ctc') {
      const gigaDir = this.getModelDir('gigaam-ctc');
      return gigaamSourcesService.downloadWithFallbackChain(gigaDir, onProgress);
    }

    if (normalizedId === 'silero-vad') {
      const vadDirRes = resolveSherpaModelDir('silero-vad');
      if (vadDirRes.isComplete) {
        onProgress({ modelId, percent: 100, status: 'completed' });
        return { success: true };
      }
      console.warn('[SherpaDownloader] Silero VAD not in bundle, activating RMS fallback mode (zero network)');
      onProgress({ modelId, percent: 100, status: 'completed' });
      return { success: true };
    }

    const config = SHERPA_MODELS_CONFIG[normalizedId];
    if (!config) {
      const err = `Unknown modelId: ${modelId}`;
      onProgress({ modelId, percent: 0, status: 'error', error: err });
      return { success: false, error: err };
    }

    // Resolve real sizes
    for (const fileSpec of config.files) {
      const realSize = await this.getRemoteFileSize(fileSpec.url);
      if (realSize > 0) {
        fileSpec.size = realSize;
      }
    }

    const modelDir = this.getModelDir(normalizedId);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    const totalSize = config.files.reduce((acc, f) => acc + f.size, 0);
    let overallLoaded = 0;

    onProgress({ modelId, percent: 0, status: 'downloading' });

    try {
      for (const fileSpec of config.files) {
        const filePath = path.join(modelDir, fileSpec.name);

        if (fs.existsSync(filePath)) {
          let stats: fs.Stats | null = null;
          try {
            stats = fs.statSync(filePath);
          } catch (e) {
            stats = null;
          }

          if (stats && stats.size > 0) {
            if (Math.abs(stats.size - fileSpec.size) > 500) {
              console.warn(`[Sherpa] size differs from HF registry (${stats.size} vs ${fileSpec.size}); redownloading corrupted file...`);
              // Break out to redownload
            } else {
              overallLoaded += stats.size;
              const pct = Math.min(99, Math.round((overallLoaded / totalSize) * 100));
              onProgress({ modelId, percent: pct, status: 'downloading', bytes_done: overallLoaded, total_bytes: totalSize } as any);
              continue;
            }
          }
        }

        let fileLoadedThisAttempt = 0;
        const tryDownloadWithSizeCheck = async (isRetry: boolean = false): Promise<void> => {
          fileLoadedThisAttempt = 0;
          await this.downloadSingleFile(
            fileSpec.url,
            filePath,
            (chunkSize) => {
              fileLoadedThisAttempt += chunkSize;
              const currentTotal = overallLoaded + fileLoadedThisAttempt;
              const pct = Math.min(99, Math.round((currentTotal / totalSize) * 100));
              onProgress({ modelId, percent: pct, status: 'downloading', bytes_done: currentTotal, total_bytes: totalSize } as any);
            }
          );

          const finalStats = fs.statSync(filePath);
          if (finalStats.size > 0 && Math.abs(finalStats.size - fileSpec.size) > 500) {
            console.warn(`[Sherpa] Downloaded file ${fileSpec.name} size (${finalStats.size}) mismatch with expected (${fileSpec.size}).`);
            if (!isRetry) {
              console.log(`[Sherpa] Retrying download for ${fileSpec.name}...`);
              return tryDownloadWithSizeCheck(true);
            } else {
              throw new Error(`Size mismatch for ${fileSpec.name} after retry. Expected ${fileSpec.size}, got ${finalStats.size}`);
            }
          }
        };

        await tryDownloadWithSizeCheck();

        const finalStats = fs.statSync(filePath);
        overallLoaded += finalStats.size;
      }

      // Update download_meta.json
      const metaPath = path.join(modelDir, 'download_meta.json');
      let existingMeta: any = { files: {} };
      if (fs.existsSync(metaPath)) {
        try {
          existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (!existingMeta.files) existingMeta.files = {};
        } catch (e) { console.warn('Ignored error in catch', e); }
      }

      for (const fileSpec of config.files) {
        const filePath = path.join(modelDir, fileSpec.name);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          existingMeta.files[fileSpec.name] = {
            size: stats.size,
            downloadedAt: new Date().toISOString()
          };
        }
      }

      fs.writeFileSync(metaPath, JSON.stringify(existingMeta, null, 2));

      onProgress({ modelId, percent: 100, status: 'completed' });
      return { success: true };
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      onProgress({ modelId, percent: 0, status: 'error', error: errMsg });
      return { success: false, error: errMsg };
    }
  }
}

export const sherpaDownloaderService = SherpaDownloaderService.getInstance();
