import { MODEL_REGISTRY, type ModelType } from '../components/sections/model-hub.registry';
import {
  deriveResourceStateSnapshot,
  type ResourceComponentKind,
  type ResourceStateSnapshot
} from '../../../../shared/utils/voice-model-state-machine';
import type { ModelIntegrityRecord, ModelProvenanceRecord } from '../../../../shared/types/model-integrity';

export type QuantCompatibility = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN';
export type DiskCheckStatus = 'IDLE' | 'CHECKING' | 'SYNCED' | 'ERROR' | 'UNAVAILABLE';
export type TtsVerificationStatus = 'UNCHECKED' | 'ACTIVE' | 'BUNDLED_UNVERIFIED' | 'TAMPERED';
export interface QuantIntegrityInfo { integrity?: ModelIntegrityRecord; provenance?: ModelProvenanceRecord; }

export function getQuantCompatibility(minRamGb: number, targetMemoryGb: number | null): QuantCompatibility {
  if (targetMemoryGb === null || !Number.isFinite(targetMemoryGb) || targetMemoryGb <= 0) return 'UNKNOWN';
  return minRamGb <= targetMemoryGb ? 'COMPATIBLE' : 'INCOMPATIBLE';
}

export function normalizeSttQuantId(rawId: string): string {
  if (rawId === 'zipformer-ru' || rawId === 'sherpa-zipformer-ru' || rawId === 'sherpa-ru-archive.tar.bz2') return 'zipformer-ru';
  if (rawId === 'sherpa-en-archive.tar.bz2' || rawId === 'sherpa-zipformer-en' || rawId === 'zipformer-en') return 'sherpa-en-archive.tar.bz2';
  if (rawId === 'whisper-small') return 'whisper-small';
  if (rawId === 'Xenova/whisper-base' || rawId === 'whisper-base-ru' || rawId === 'whisper-base') return 'Xenova/whisper-base';
  if (rawId === 'ggml-medium.bin' || rawId === 'whisper-medium-ru' || rawId === 'whisper-medium') return 'ggml-medium.bin';
  return rawId;
}

export function modelTypeToKind(type: ModelType): ResourceComponentKind {
  if (type === 'tts') return 'tts_model';
  if (type === 'llm-gguf') return 'llm_model';
  return 'stt_model';
}

export interface QuantRuntimeInput {
  id: string;
  type: ModelType;
  downloaded: boolean;
  downloading: boolean;
  verifying?: boolean;
  verificationPending?: boolean;
  cancelled?: boolean;
  error?: string | null;
  integrityInfo?: QuantIntegrityInfo;
  loaded?: boolean;
  active?: boolean;
  consentRequired?: boolean;
}

export function deriveHubQuantSnapshot(input: QuantRuntimeInput): ResourceStateSnapshot {
  return deriveResourceStateSnapshot({
    kind: modelTypeToKind(input.type),
    checking: input.verificationPending,
    verificationPending: input.verificationPending,
    downloaded: input.downloaded,
    integrityStatus: input.integrityInfo?.integrity?.status ?? null,
    loaded: input.loaded,
    active: input.active,
    downloading: input.downloading,
    verifying: input.verifying,
    cancelled: input.cancelled,
    consentRequired: input.consentRequired,
    error: input.error || (input.integrityInfo?.integrity?.status === 'tampered' ? input.integrityInfo?.integrity?.reason : null)
  });
}

export function findQuantTypeById(quantId: string): ModelType {
  for (const model of MODEL_REGISTRY) {
    if (model.quants.some((q) => q.id === quantId)) return model.type;
  }
  return 'stt-streaming';
}

export function extractSttRuntimeSets(sttStat: any): { loaded: Set<string>; active: Set<string> } {
  const loaded = new Set<string>();
  const active = new Set<string>();
  if (Array.isArray(sttStat?.loadedModelIds)) {
    for (const lid of sttStat.loadedModelIds) loaded.add(normalizeSttQuantId(lid));
  }
  if (sttStat?.ready && sttStat?.activeModelId) {
    const act = normalizeSttQuantId(sttStat.activeModelId);
    loaded.add(act);
    active.add(act);
  }
  return { loaded, active };
}

export interface EvaluatedTtsRuntime {
  verificationStatus: TtsVerificationStatus;
  confirmedReady: boolean;
  modelOnDisk: boolean;
  checking: boolean;
  consentRequired: boolean;
  active: boolean;
  integrityInfo: QuantIntegrityInfo;
}

export function evaluateTtsRuntimeStatus(serverStatus: any, engineInfo: any): EvaluatedTtsRuntime {
  let confirmedReady = serverStatus?.status === 'ready';
  let integrityStatus: 'verified' | 'tampered' | 'unknown' = 'unknown';
  let integrityReason: string | undefined;
  let shaPrefix: string | undefined;
  let modelOnDisk = Boolean(serverStatus?.modelInstalled);
  const rawStatus: string | undefined = serverStatus?.status;
  const activeEngine: string | null = engineInfo?.activeEngine ?? null;

  if (serverStatus?.integrity) {
    if (serverStatus.integrity.state === 'ERROR' || serverStatus.integrity.modelFile?.status === 'tampered') {
      integrityStatus = 'tampered';
      integrityReason = serverStatus.integrity.modelFile?.reason || serverStatus.integrity.reason || 'Нарушена целостность файлов Silero TTS';
      confirmedReady = false;
    } else if (serverStatus.integrity.state === 'READY') {
      integrityStatus = serverStatus.integrity.modelFile?.status === 'verified' ? 'verified' : 'unknown';
      if (integrityStatus === 'verified') modelOnDisk = true;
      shaPrefix = serverStatus.integrity.modelFile?.sha256Prefix;
    }
  }

  const verificationStatus: TtsVerificationStatus =
    integrityStatus === 'tampered' ? 'TAMPERED' : confirmedReady ? 'ACTIVE' : 'BUNDLED_UNVERIFIED';

  return {
    verificationStatus,
    confirmedReady,
    modelOnDisk,
    checking: rawStatus === 'starting' && !modelOnDisk && integrityStatus !== 'tampered',
    consentRequired: !modelOnDisk && !confirmedReady && rawStatus !== 'starting',
    active: confirmedReady && activeEngine === 'silero',
    integrityInfo: {
      integrity: { status: integrityStatus, algorithm: 'sha256', reason: integrityReason },
      provenance: { origin: 'bundled', source: 'snakers4/silero-models', revision: 'v5_6_ru', digestPrefix: shaPrefix }
    }
  };
}

export const CANONICAL_QUANT_IDS = new Set(MODEL_REGISTRY.flatMap((m) => m.quants.map((q) => q.id)));

export async function fetchSystemMemorySpecs(): Promise<{ ramGb: number | null; vramGb: number | null; useGpu: boolean }> {
  if (typeof window !== 'undefined' && window.api?.getSystemMetrics) {
    try {
      const metrics = await window.api.getSystemMetrics();
      const ramGb = metrics?.memoryTotalMb && metrics.memoryTotalMb > 0 ? Math.round(metrics.memoryTotalMb / 1024) : null;
      const vramGb = metrics?.vramTotalMb && metrics.vramTotalMb > 0 ? Math.round(metrics.vramTotalMb / 1024) : null;
      return { ramGb, vramGb, useGpu: Boolean(vramGb && vramGb > 0) };
    } catch {}
  }
  return { ramGb: null, vramGb: null, useGpu: false };
}


