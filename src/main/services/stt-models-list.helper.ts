import * as fs from 'fs';
import * as path from 'path';
import { BuiltInWhisperService } from '../services/built-in-whisper.service';
import { resolveSherpaModelDir, verifyModelFiles } from '../services/sherpa-paths.util';
import type { ModelIntegrityRecord, ModelProvenanceRecord } from '../../shared/types/model-integrity';
import type { VoiceModelSetupState } from '../../shared/utils/voice-model-state-machine';

export const FALLBACK_STT_MODELS_LIST = {
  sherpaAvailable: true,
  isPending: true,
  models: [
    { id: 'gigaam-ctc', name: 'GigaAM RU CTC 220M (русский, высокая точность)', provider: 'sherpa' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '215 MB', sizeBytes: 0 },
    { id: 'silero-vad', name: 'Silero VAD (ONNX)', provider: 'sherpa' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '644 KB', sizeBytes: 0 },
    { id: 'zipformer-ru', name: 'Sherpa ZipFormer Small (RU)', provider: 'sherpa' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '94 MB', sizeBytes: 0 },
    { id: 'whisper-small', name: 'Sherpa Whisper Small (RU)', provider: 'sherpa' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '375 MB', sizeBytes: 0 },
    { id: 'Xenova/whisper-tiny', name: 'Whisper Tiny (CPU)', provider: 'whisper' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '75 MB', sizeBytes: 0 },
    { id: 'Xenova/whisper-base', name: 'Whisper Base (CPU)', provider: 'whisper' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '145 MB', sizeBytes: 0 },
    { id: 'Xenova/whisper-small', name: 'Whisper Small (CPU)', provider: 'whisper' as const, downloaded: false, verificationPending: true, setupState: 'checking' as VoiceModelSetupState, expectedSize: '480 MB', sizeBytes: 0 }
  ]
};

export interface ListedSttModelItem {
  id: string;
  name: string;
  provider: 'sherpa' | 'whisper';
  downloaded: boolean;
  verificationPending?: boolean;
  setupState?: VoiceModelSetupState;
  expectedSize: string;
  sizeBytes: number;
  source?: string;
  integrity?: ModelIntegrityRecord;
  provenance?: ModelProvenanceRecord;
}

export async function fetchFullSttModelsList() {
  const isSherpaOk = true;
  const gigaRes = resolveSherpaModelDir('gigaam-ctc');
  const gigaCheck = verifyModelFiles(gigaRes.dir, 'gigaam-ctc');

  let gigaSource: string | undefined = gigaCheck.provenance?.source;
  const gigaMetaPath = path.join(gigaRes.dir, 'download_meta.json');
  if (!gigaSource && fs.existsSync(gigaMetaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(gigaMetaPath, 'utf8'));
      if (parsed.source) gigaSource = parsed.source;
    } catch {}
  }

  const vadRes = resolveSherpaModelDir('silero-vad');
  const vadCheck = verifyModelFiles(vadRes.dir, 'silero-vad');

  const zipRes = resolveSherpaModelDir('zipformer-ru');
  const zipCheck = verifyModelFiles(zipRes.dir, 'zipformer-ru');

  const turboRes = resolveSherpaModelDir('whisper-small');
  const turboCheck = verifyModelFiles(turboRes.dir, 'whisper-small');

  const whisperModels = [
    { id: 'Xenova/whisper-tiny', name: 'Whisper Tiny (CPU)', expectedSize: '75 MB' },
    { id: 'Xenova/whisper-base', name: 'Whisper Base (CPU)', expectedSize: '145 MB' },
    { id: 'Xenova/whisper-small', name: 'Whisper Small (CPU)', expectedSize: '480 MB' }
  ];

  const whisperInstance = BuiltInWhisperService.getInstance();
  const whisperPromises = whisperModels.map(async (wm): Promise<ListedSttModelItem> => {
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
      sizeBytes: 0,
      integrity: {
        status: downloaded ? 'unverified_manual' : 'missing',
        algorithm: 'sha256',
        reason: downloaded ? 'Кэш Transformers без встроенного SHA-256 манифеста' : undefined
      },
      provenance: {
        origin: downloaded ? 'manual_local' : 'official_auto',
        source: wm.id
      }
    };
  });

  const settled = await Promise.allSettled(whisperPromises);
  const whisperList: ListedSttModelItem[] = settled.map((res, index) => {
    if (res.status === 'fulfilled') return res.value;
    const fallback = whisperModels[index];
    return {
      id: fallback.id,
      name: fallback.name,
      provider: 'whisper' as const,
      downloaded: false,
      expectedSize: fallback.expectedSize,
      sizeBytes: 0,
      integrity: { status: 'missing', algorithm: 'sha256' },
      provenance: { origin: 'official_auto', source: fallback.id }
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
        downloaded: gigaCheck.isComplete,
        expectedSize: '215 MB',
        sizeBytes: gigaCheck.totalSize,
        source: gigaSource,
        integrity: gigaCheck.integrity,
        provenance: gigaCheck.provenance
      },
      {
        id: 'silero-vad',
        name: 'Silero VAD (ONNX)',
        provider: 'sherpa' as const,
        downloaded: vadCheck.isComplete,
        expectedSize: '644 KB',
        sizeBytes: vadCheck.totalSize,
        integrity: vadCheck.integrity,
        provenance: vadCheck.provenance
      },
      {
        id: 'zipformer-ru',
        name: 'Sherpa ZipFormer Small (RU)',
        provider: 'sherpa' as const,
        downloaded: zipCheck.isComplete,
        expectedSize: '94 MB',
        sizeBytes: zipCheck.totalSize,
        integrity: zipCheck.integrity,
        provenance: zipCheck.provenance
      },
      {
        id: 'whisper-small',
        name: 'Sherpa Whisper Small (RU)',
        provider: 'sherpa' as const,
        downloaded: turboCheck.isComplete,
        expectedSize: '375 MB',
        sizeBytes: turboCheck.totalSize,
        integrity: turboCheck.integrity,
        provenance: turboCheck.provenance
      },
      ...whisperList
    ]
  };
}
