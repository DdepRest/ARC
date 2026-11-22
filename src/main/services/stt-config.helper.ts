import * as path from 'path';
import * as fs from 'fs';
import { resolveSherpaModelDir, resolveGigaamFiles, verifyModelFiles } from './sherpa-paths.util';
import { sherpaDownloaderService } from './sherpa-downloader.service';
import { sttCircuitBreaker } from './stt-circuit-breaker.util';
import { validateSherpaModelSacrificial, computeFileChecksum } from './sherpa-validator.util';

export interface SttWorkerConfigs {
  vadConfig: any;
  sherpaConfig: any;
  whisperConfig: any;
  gigaamConfig: any;
  gigaamSourceInfo: { modelPath: string; tokensPath: string; dir: string } | null;
}

export function buildSttWorkerConfigs(engine: 'gigaam' | 'legacy' = 'gigaam'): SttWorkerConfigs {
  const isLegacy = engine === 'legacy';
  const sherpaDirRes = resolveSherpaModelDir('zipformer-ru');
  const vadDirRes = resolveSherpaModelDir('silero-vad');
  const gigaDirRes = resolveSherpaModelDir('gigaam-ctc');
  const whisperDirRes = resolveSherpaModelDir('whisper-small');

  const SHERPA_DIR = sherpaDirRes.dir;
  const VAD_DIR = vadDirRes.dir;
  const GIGA_DIR = gigaDirRes.dir;
  const WHISPER_DIR = whisperDirRes.dir;

  // 1. Silero VAD Config
  const vadConfig = vadDirRes.isComplete ? {
    sileroVad: {
      model: path.join(VAD_DIR, 'silero_vad.onnx'),
      threshold: 0.35,
      minSilenceDuration: 0.30,
      minSpeechDuration: 0.10,
      windowSize: 512,
      maxSpeechDuration: 10.0
    },
    sampleRate: 16000,
    numThreads: 1,
    provider: 'cpu',
    debug: 0
  } : null;

  // 2. Whisper Small int8 Config (floor engine: always provided when complete)
  const whisperConfig = whisperDirRes.isComplete ? {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      whisper: {
        encoder: path.join(WHISPER_DIR, 'small-encoder.int8.onnx'),
        decoder: path.join(WHISPER_DIR, 'small-decoder.int8.onnx'),
        language: 'ru',
        task: 'transcribe'
      },
      tokens: path.join(WHISPER_DIR, 'small-tokens.txt'),
      modelType: 'whisper',
      numThreads: 2,
      provider: 'cpu',
      debug: 0
    }
  } : null;

  // 3. Sherpa Zipformer Streaming Config (only when engine is legacy)
  const sherpaConfig = (isLegacy && sherpaDirRes.isComplete) ? {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      transducer: {
        encoder: path.join(SHERPA_DIR, 'encoder.onnx'),
        decoder: path.join(SHERPA_DIR, 'decoder.onnx'),
        joiner: path.join(SHERPA_DIR, 'joiner.onnx'),
      },
      tokens: path.join(SHERPA_DIR, 'tokens.txt'),
      numThreads: 1,
      provider: 'cpu',
      debug: 0
    }
  } : null;

  // 4. GigaAM Multilingual CTC Config
  let gigaamConfig = null;
  let gigaamSourceInfo = null;
  if (gigaDirRes.isComplete) {
    const resolvedGiga = resolveGigaamFiles(GIGA_DIR);
    if (resolvedGiga) {
      gigaamSourceInfo = {
        modelPath: resolvedGiga.modelPath,
        tokensPath: resolvedGiga.tokensPath,
        dir: GIGA_DIR
      };
      gigaamConfig = {
        featConfig: { sampleRate: 16000, featureDim: 64 },
        modelConfig: {
          nemoCtc: {
            model: resolvedGiga.modelPath
          },
          tokens: resolvedGiga.tokensPath,
          numThreads: 2,
          provider: 'cpu',
          debug: 0
        }
      };
    }
  }

  return {
    vadConfig,
    sherpaConfig,
    whisperConfig,
    gigaamConfig,
    gigaamSourceInfo
  };
}

export function broadcastSttToast(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', duration: number = 4000) {
  try {
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((w: any) => {
      w.webContents.send('ui:show-toast', { message, type, duration });
    });
  } catch {}
}

export interface SttAutoDownloadOptions {
  includeGigaam?: boolean;
  includeWhisper?: boolean;
  includeZipformer?: boolean;
}

export async function executeSttAutoDownload(
  includeGigaamOrOpts: boolean | SttAutoDownloadOptions = false,
  onProgress?: (data: any) => void,
  onGigaamSuccess?: () => Promise<void>
): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  const opts: SttAutoDownloadOptions =
    typeof includeGigaamOrOpts === 'object' && includeGigaamOrOpts !== null
      ? includeGigaamOrOpts
      : { includeGigaam: Boolean(includeGigaamOrOpts), includeWhisper: false, includeZipformer: true };

  const includeGigaam = Boolean(opts.includeGigaam);
  const includeZipformer = opts.includeZipformer !== false;
  const includeWhisper = Boolean(opts.includeWhisper);

  const broadcast = (data: any) => {
    if (onProgress) onProgress(data);
    try {
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((w: any) => w.webContents.send('stt:download-progress', data));
    } catch {}
  };

  const vadRes = resolveSherpaModelDir('silero-vad');
  if (!vadRes.isComplete) {
    const res = await sherpaDownloaderService.downloadModel('silero-vad', broadcast);
    if (res.cancelled) return { success: false, cancelled: true };
    if (!res.success) return { success: false, error: `Failed silero-vad: ${res.error}` };
  }

  if (includeZipformer) {
    const sherpaRes = resolveSherpaModelDir('zipformer-ru');
    if (!sherpaRes.isComplete) {
      const res = await sherpaDownloaderService.downloadModel('zipformer-ru', broadcast);
      if (res.cancelled) return { success: false, cancelled: true };
      if (!res.success) return { success: false, error: `Failed zipformer-ru: ${res.error}` };
    }
  }

  if (includeWhisper) {
    const whisperRes = resolveSherpaModelDir('whisper-small');
    if (!whisperRes.isComplete) {
      const res = await sherpaDownloaderService.downloadModel('whisper-small', broadcast);
      if (res.cancelled) return { success: false, cancelled: true };
      if (!res.success) return { success: false, error: `Failed whisper-small: ${res.error}` };
    }
  }

  if (includeGigaam) {
    const gigaRes = resolveSherpaModelDir('gigaam-ctc');
    if (!gigaRes.isComplete) {
      const res = await sherpaDownloaderService.downloadModel('gigaam-ctc', broadcast);
      if (res.cancelled) return { success: false, cancelled: true };
      if (!res.success) return { success: false, error: `Failed gigaam-ctc: ${res.error}` };
      if (onGigaamSuccess) {
        await onGigaamSuccess();
      }
    }
  }

  return { success: true };
}

export function isGigaamPreVerified(dir: string): boolean {
  const metaPath = path.join(dir, 'download_meta.json');
  if (!fs.existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return meta.verified === true && meta.incompatible !== true;
  } catch {
    return false;
  }
}

export async function attemptGigaamHotSwap(
  child: any,
  activeGigaamSource: string,
  gigaamConfig: any,
  gigaamSourceInfo: { modelPath: string; tokensPath: string; dir: string }
): Promise<boolean> {
  if (sttCircuitBreaker.isSourceBlocked(activeGigaamSource, gigaamSourceInfo.dir)) {
    console.log('[STT HotSwap] GigaAM source is blocked by circuit breaker, skipping');
    return false;
  }

  const integrityCheck = verifyModelFiles(gigaamSourceInfo.dir, 'gigaam-ctc', { forceRehash: true });
  if (!integrityCheck.isComplete || integrityCheck.integrity?.status === 'tampered') {
    console.warn(`[STT HotSwap] Supply-chain integrity check failed for GigaAM: ${integrityCheck.integrity?.reason || 'missing'}`);
    return false;
  }

  console.log('[STT HotSwap] Running sacrificial validation for GigaAM...');
  const valResult = await validateSherpaModelSacrificial(gigaamSourceInfo.modelPath, gigaamSourceInfo.tokensPath, 15000);
  if (valResult.success && valResult.verified) {
    console.log('[STT HotSwap] Sacrificial validation passed, hot-swapping into active worker...');
    try {
      const checksum = computeFileChecksum(gigaamSourceInfo.modelPath);
      const metaPath = path.join(gigaamSourceInfo.dir, 'download_meta.json');
      let existingMeta: any = {};
      if (fs.existsSync(metaPath)) {
        try { existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
      }
      const isOfficialVerified = integrityCheck.integrity?.status === 'verified';
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            ...existingMeta,
            sourceId: activeGigaamSource,
            checksum,
            verified: isOfficialVerified,
            incompatible: false,
            runtimeValidated: true,
            verifiedAt: isOfficialVerified ? (existingMeta.verifiedAt || new Date().toISOString()) : undefined,
            integrity: {
              ...(existingMeta.integrity || integrityCheck.integrity),
              status: isOfficialVerified ? 'verified' : 'unverified_manual',
              algorithm: 'sha256',
              runtimeValidated: true
            },
            provenance: existingMeta.provenance || integrityCheck.provenance
          },
          null,
          2
        )
      );
    } catch {}

    if (child && child.connected) {
      child.send({ type: 'load_gigaam', gigaamConfig });
      return true;
    }
    return false;
  } else {
    console.warn(`[STT HotSwap] Sacrificial validation failed: ${valResult.error}. Marking incompatible.`);
    try {
      const metaPath = path.join(gigaamSourceInfo.dir, 'download_meta.json');
      fs.writeFileSync(metaPath, JSON.stringify({ sourceId: activeGigaamSource, incompatible: true, verified: false, error: valResult.error, checkedAt: new Date().toISOString() }, null, 2));
    } catch {}
    broadcastSttToast('Модель GigaAM несовместима с текущим окружением. Активен резервный Whisper.', 'error', 5000);
    return false;
  }
}


