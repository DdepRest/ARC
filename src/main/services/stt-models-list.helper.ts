import * as fs from 'fs';
import * as path from 'path';
import { BuiltInWhisperService } from '../services/built-in-whisper.service';
import { resolveSherpaModelDir, verifyModelFiles } from '../services/sherpa-paths.util';

export const FALLBACK_STT_MODELS_LIST = {
  sherpaAvailable: true,
  isPending: true,
  models: [
    { id: 'gigaam-ctc', name: 'GigaAM RU CTC 220M (русский, высокая точность)', provider: 'sherpa' as const, downloaded: true, expectedSize: '235 MB', sizeBytes: 0 },
    { id: 'silero-vad', name: 'Silero VAD (ONNX)', provider: 'sherpa' as const, downloaded: true, expectedSize: '1.4 MB', sizeBytes: 0 },
    { id: 'zipformer-ru', name: 'Sherpa ZipFormer Small (RU)', provider: 'sherpa' as const, downloaded: true, expectedSize: '94 MB', sizeBytes: 0 },
    { id: 'whisper-small', name: 'Sherpa Whisper Small (RU)', provider: 'sherpa' as const, downloaded: false, expectedSize: '375 MB', sizeBytes: 0 },
    { id: 'Xenova/whisper-tiny', name: 'Whisper Tiny (CPU)', provider: 'whisper' as const, downloaded: true, expectedSize: '75 MB', sizeBytes: 0 },
    { id: 'Xenova/whisper-base', name: 'Whisper Base (CPU)', provider: 'whisper' as const, downloaded: false, expectedSize: '145 MB', sizeBytes: 0 },
    { id: 'Xenova/whisper-small', name: 'Whisper Small (CPU)', provider: 'whisper' as const, downloaded: false, expectedSize: '480 MB', sizeBytes: 0 }
  ]
};

export async function fetchFullSttModelsList() {
  const isSherpaOk = true;
  const gigaRes = resolveSherpaModelDir('gigaam-ctc');
  const gigaCheck = verifyModelFiles(gigaRes.dir, 'gigaam-ctc');
  const gigaDownloaded = gigaCheck.isComplete;
  const gigaSizeBytes = gigaCheck.totalSize;

  let gigaSource: string | undefined = undefined;
  const gigaMetaPath = path.join(gigaRes.dir, 'download_meta.json');
  if (fs.existsSync(gigaMetaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(gigaMetaPath, 'utf8'));
      if (parsed.source) gigaSource = parsed.source;
    } catch {}
  }

  const vadRes = resolveSherpaModelDir('silero-vad');
  const vadCheck = verifyModelFiles(vadRes.dir, 'silero-vad');
  const vadDownloaded = vadCheck.isComplete;
  const vadSizeBytes = vadCheck.totalSize;

  const zipRes = resolveSherpaModelDir('zipformer-ru');
  const zipCheck = verifyModelFiles(zipRes.dir, 'zipformer-ru');
  const zipformerDownloaded = zipCheck.isComplete;
  const zipformerSizeBytes = zipCheck.totalSize;

  const turboRes = resolveSherpaModelDir('whisper-small');
  const turboCheck = verifyModelFiles(turboRes.dir, 'whisper-small');
  const turboDownloaded = turboCheck.isComplete;
  const turboSizeBytes = turboCheck.totalSize;

  const whisperModels = [
    { id: 'Xenova/whisper-tiny', name: 'Whisper Tiny (CPU)', expectedSize: '75 MB' },
    { id: 'Xenova/whisper-base', name: 'Whisper Base (CPU)', expectedSize: '145 MB' },
    { id: 'Xenova/whisper-small', name: 'Whisper Small (CPU)', expectedSize: '480 MB' }
  ];

  const whisperInstance = BuiltInWhisperService.getInstance();
  const whisperPromises = whisperModels.map(async (wm) => {
    let downloaded = false;
    try {
      const checkPromise = whisperInstance.isModelDownloaded(wm.id);
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 1000);
      });
      downloaded = await Promise.race([checkPromise, timeoutPromise]);
    } catch {
      downloaded = false;
    }
    return {
      id: wm.id,
      name: wm.name,
      provider: 'whisper' as const,
      downloaded,
      expectedSize: wm.expectedSize,
      sizeBytes: 0
    };
  });

  const settled = await Promise.allSettled(whisperPromises);
  const whisperList = settled.map((res, index) => {
    if (res.status === 'fulfilled') return res.value;
    const fallback = whisperModels[index];
    return {
      id: fallback.id,
      name: fallback.name,
      provider: 'whisper' as const,
      downloaded: false,
      expectedSize: fallback.expectedSize,
      sizeBytes: 0
    };
  });

  return {
    sherpaAvailable: isSherpaOk,
    isPending: false,
    models: [
      {
        id: 'gigaam-ctc',
        name: 'GigaAM RU CTC 220M (русский, высокая точность)',
        provider: 'sherpa' as const,
        downloaded: gigaDownloaded,
        expectedSize: '235 MB',
        sizeBytes: gigaSizeBytes,
        source: gigaSource
      },
      {
        id: 'silero-vad',
        name: 'Silero VAD (ONNX)',
        provider: 'sherpa' as const,
        downloaded: vadDownloaded,
        expectedSize: '1.4 MB',
        sizeBytes: vadSizeBytes
      },
      {
        id: 'zipformer-ru',
        name: 'Sherpa ZipFormer Small (RU)',
        provider: 'sherpa' as const,
        downloaded: zipformerDownloaded,
        expectedSize: '94 MB',
        sizeBytes: zipformerSizeBytes
      },
      {
        id: 'whisper-small',
        name: 'Sherpa Whisper Small (RU)',
        provider: 'sherpa' as const,
        downloaded: turboDownloaded,
        expectedSize: '375 MB',
        sizeBytes: turboSizeBytes
      },
      ...whisperList
    ]
  };
}
