import { ref, computed } from 'vue';
import { MODEL_REGISTRY, type ModelType } from '../components/sections/model-hub.registry';
import { useModelDownloadStore } from '../../modelDownload/stores/modelDownload.store';

export type QuantCompatibility = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN';
export type DiskCheckStatus = 'IDLE' | 'CHECKING' | 'SYNCED' | 'ERROR' | 'UNAVAILABLE';
export type TtsVerificationStatus = 'UNCHECKED' | 'ACTIVE' | 'BUNDLED_UNVERIFIED';

export function getQuantCompatibility(
  minRamGb: number,
  targetMemoryGb: number | null
): QuantCompatibility {
  if (targetMemoryGb === null || !Number.isFinite(targetMemoryGb) || targetMemoryGb <= 0) {
    return 'UNKNOWN';
  }
  return minRamGb <= targetMemoryGb ? 'COMPATIBLE' : 'INCOMPATIBLE';
}

const CANONICAL_QUANT_IDS = new Set(
  MODEL_REGISTRY.flatMap((m) => m.quants.map((q) => q.id))
);

// Module-level session state (survives AiSettings v-if page unmounts)
const systemRamGb = ref<number | null>(null);
const systemVramGb = ref<number | null>(null);
const useGpuCalc = ref(false);
const diskCheckStatus = ref<DiskCheckStatus>('IDLE');
const diskCheckError = ref<string | null>(null);
const lastDiskCheckAt = ref<number | null>(null);
const downloadState = ref<Record<string, { downloaded: boolean }>>({});
const sttDownloadState = ref<Record<string, { downloading: boolean; percent: number; error?: string }>>({});
const ttsVerificationStatus = ref<TtsVerificationStatus>('UNCHECKED');
const confirmLowRam = ref<Set<string>>(new Set());
const downloadActionError = ref<string | null>(null);

let listenersRegistered = false;
let hardwareInitialized = false;

export function normalizeSttQuantId(rawId: string): string {
  if (
    rawId === 'zipformer-ru' ||
    rawId === 'sherpa-zipformer-ru' ||
    rawId === 'sherpa-ru-archive.tar.bz2'
  ) {
    return 'zipformer-ru';
  }
  if (
    rawId === 'sherpa-en-archive.tar.bz2' ||
    rawId === 'sherpa-zipformer-en' ||
    rawId === 'zipformer-en'
  ) {
    return 'sherpa-en-archive.tar.bz2';
  }
  if (rawId === 'whisper-small') {
    return 'whisper-small';
  }
  if (rawId === 'Xenova/whisper-base' || rawId === 'whisper-base-ru' || rawId === 'whisper-base') {
    return 'Xenova/whisper-base';
  }
  if (rawId === 'ggml-medium.bin' || rawId === 'whisper-medium-ru' || rawId === 'whisper-medium') {
    return 'ggml-medium.bin';
  }
  return rawId;
}

function applySttModelsList(stts: any[]) {
  for (const stt of stts) {
    if (!stt?.id) continue;
    const isDl = Boolean(stt.downloaded);
    const canonicalId = normalizeSttQuantId(stt.id);
    if (CANONICAL_QUANT_IDS.has(canonicalId)) {
      downloadState.value[canonicalId] = { downloaded: isDl };
    }
  }
}

export function resetModelHubSessionForTests() {
  systemRamGb.value = null;
  systemVramGb.value = null;
  useGpuCalc.value = false;
  diskCheckStatus.value = 'IDLE';
  diskCheckError.value = null;
  lastDiskCheckAt.value = null;
  downloadState.value = {};
  sttDownloadState.value = {};
  ttsVerificationStatus.value = 'UNCHECKED';
  confirmLowRam.value = new Set();
  downloadActionError.value = null;
  listenersRegistered = false;
  hardwareInitialized = false;
}

export function useModelHubSession() {
  const downloadStore = useModelDownloadStore();

  const targetMemoryGb = computed<number | null>(() => {
    if (useGpuCalc.value && systemVramGb.value !== null && systemVramGb.value > 0) {
      return systemVramGb.value;
    }
    return systemRamGb.value;
  });

  const installedQuantsCount = computed(() => {
    let count = 0;
    for (const id of CANONICAL_QUANT_IDS) {
      if (downloadState.value[id]?.downloaded === true) {
        count++;
      }
    }
    return count;
  });

  const compatibleCount = computed<number | null>(() => {
    if (targetMemoryGb.value === null) return null;
    return MODEL_REGISTRY.filter((m) =>
      m.quants.some((q) => getQuantCompatibility(q.minRamGb, targetMemoryGb.value) === 'COMPATIBLE')
    ).length;
  });

  const ensureGlobalListeners = () => {
    if (listenersRegistered || typeof window === 'undefined' || !window.api) return;
    listenersRegistered = true;

    if (typeof (window.api as any).onModelDownloadProgress === 'function') {
      (window.api as any).onModelDownloadProgress((data: any) => {
        if (!data) return;
        const filename = data.filename || downloadStore.currentFilename || '';
        if (data.error) {
          downloadStore.updateProgress(0, 0, filename, data.error);
          downloadActionError.value = data.error;
          return;
        }
        const done = Number(data.bytes_done) || 0;
        const total = Number(data.total_bytes) || 0;
        downloadStore.updateProgress(done, total, filename);
        if (total > 0 && done >= total && filename && CANONICAL_QUANT_IDS.has(filename)) {
          downloadState.value[filename] = { downloaded: true };
          checkAllStatuses();
        }
      });
    }

    if (typeof (window.api as any).onSttDownloadProgress === 'function') {
      (window.api as any).onSttDownloadProgress((data: any) => {
        if (!data?.modelId) return;
        const targetId = normalizeSttQuantId(data.modelId);

        const isTerminal = data.status === 'completed' || data.status === 'error' || data.status === 'cancelled';
        sttDownloadState.value[targetId] = {
          downloading: !isTerminal,
          percent: Number.isFinite(data.percent) ? data.percent : 0,
          error: data.status === 'error' ? data.error || 'Ошибка скачивания STT' : undefined
        };

        if (data.status === 'completed') {
          if (CANONICAL_QUANT_IDS.has(targetId)) {
            downloadState.value[targetId] = { downloaded: true };
          }
          checkAllStatuses();
        } else if (data.status === 'error') {
          downloadActionError.value = data.error || 'Ошибка скачивания STT модели';
        }
      });
    }

    if (typeof (window.api as any).onSttModelsUpdated === 'function') {
      (window.api as any).onSttModelsUpdated((res: any) => {
        const stts = Array.isArray(res) ? res : res?.models || [];
        applySttModelsList(stts);
      });
    }
  };

  const initHardwareSpecs = async () => {
    if (hardwareInitialized) return;
    hardwareInitialized = true;

    if (typeof window !== 'undefined' && window.api?.getSystemMetrics) {
      try {
        const metrics = await window.api.getSystemMetrics();
        if (metrics?.memoryTotalMb && metrics.memoryTotalMb > 0) {
          systemRamGb.value = Math.round(metrics.memoryTotalMb / 1024);
        } else {
          systemRamGb.value = null;
        }

        if (metrics?.vramTotalMb && metrics.vramTotalMb > 0) {
          systemVramGb.value = Math.round(metrics.vramTotalMb / 1024);
          useGpuCalc.value = systemVramGb.value > 0;
        } else {
          systemVramGb.value = null;
          useGpuCalc.value = false;
        }
        return;
      } catch {
        // Ignore metrics error and fall through to unknown
      }
    }

    systemRamGb.value = null;
    systemVramGb.value = null;
    useGpuCalc.value = false;
  };

  const checkAllStatuses = async () => {
    if (typeof window === 'undefined' || !window.api) {
      diskCheckStatus.value = 'UNAVAILABLE';
      diskCheckError.value = 'Интерфейс Electron API недоступен в текущем окружении';
      ttsVerificationStatus.value = 'BUNDLED_UNVERIFIED';
      return;
    }

    diskCheckStatus.value = 'CHECKING';
    diskCheckError.value = null;

    try {
      const api = window.api as any;

      for (const model of MODEL_REGISTRY) {
        if (model.type === 'llm-gguf' && typeof api.checkBuiltinModel === 'function') {
          for (const q of model.quants) {
            const isDl = await api.checkBuiltinModel(q.id);
            downloadState.value[q.id] = { downloaded: Boolean(isDl) };
          }
        }
      }

      if (typeof api.listSttModels === 'function') {
        const res = await api.listSttModels();
        const stts = Array.isArray(res) ? res : res?.models || [];
        applySttModelsList(stts);
      }

      // Honest TTS verification: only serverStatus.status === 'ready' confirms Silero weights and server readiness
      let isTtsConfirmedReady = false;
      try {
        const serverStatus =
          typeof api.getTtsServerStatus === 'function'
            ? await api.getTtsServerStatus().catch(() => null)
            : null;
        isTtsConfirmedReady = serverStatus?.status === 'ready';
      } catch {
        isTtsConfirmedReady = false;
      }

      ttsVerificationStatus.value = isTtsConfirmedReady ? 'ACTIVE' : 'BUNDLED_UNVERIFIED';
      const ttsModel = MODEL_REGISTRY.find((m) => m.type === 'tts');
      if (ttsModel) {
        for (const q of ttsModel.quants) {
          downloadState.value[q.id] = { downloaded: isTtsConfirmedReady };
        }
      }

      diskCheckStatus.value = 'SYNCED';
      lastDiskCheckAt.value = Date.now();
    } catch (e: any) {
      console.error('Failed to check model statuses:', e);
      diskCheckStatus.value = 'ERROR';
      diskCheckError.value = e?.message || 'Ошибка синхронизации с файловой системой';
    }
  };

  const isQuantDownloading = (id: string) => {
    const normalized = normalizeSttQuantId(id);
    if (sttDownloadState.value[normalized]?.downloading || sttDownloadState.value[id]?.downloading) {
      return true;
    }
    return downloadStore.isDownloading && downloadStore.currentFilename === id;
  };

  const getQuantProgress = (id: string) => {
    const normalized = normalizeSttQuantId(id);
    if (sttDownloadState.value[normalized]?.downloading) {
      return sttDownloadState.value[normalized].percent;
    }
    if (sttDownloadState.value[id]?.downloading) {
      return sttDownloadState.value[id].percent;
    }
    if (downloadStore.isDownloading && downloadStore.currentFilename === id) {
      return Math.floor(parseFloat(downloadStore.progressPercent) || 0);
    }
    return 0;
  };

  const cancelActiveDownload = async () => {
    downloadActionError.value = null;
    for (const key of Object.keys(sttDownloadState.value)) {
      if (sttDownloadState.value[key]?.downloading) {
        sttDownloadState.value[key] = {
          downloading: false,
          percent: 0
        };
      }
    }
    if (downloadStore.isDownloading) {
      await downloadStore.cancelDownload();
    }
  };

  const downloadQuant = async (type: ModelType, id: string) => {
    if (typeof window === 'undefined' || !window.api) {
      downloadActionError.value = 'Загрузка моделей доступна только в десктопном приложении A.R.C.';
      return;
    }

    downloadActionError.value = null;
    const quant = MODEL_REGISTRY.flatMap((m) => m.quants).find((q) => q.id === id);
    if (quant) {
      const compat = getQuantCompatibility(quant.minRamGb, targetMemoryGb.value);
      if (compat === 'INCOMPATIBLE' && !confirmLowRam.value.has(id)) {
        const next = new Set(confirmLowRam.value);
        next.add(id);
        confirmLowRam.value = next;
        return;
      }
    }

    try {
      ensureGlobalListeners();
      const api = window.api as any;
      if (type === 'llm-gguf') {
        downloadStore.updateProgress(0, quant?.sizeBytes || 0, id);
        const res = await api.downloadBuiltinModel(id);
        if (res && res.success === false) {
          if (res.cancelled) {
            downloadStore.finishDownload(false);
          } else {
            const errMsg = res.error || 'Ошибка скачивания GGUF модели';
            downloadStore.updateProgress(0, 0, id, errMsg);
            downloadActionError.value = errMsg;
          }
        } else if (res?.success) {
          downloadState.value[id] = { downloaded: true };
          downloadStore.finishDownload(true);
        }
        await checkAllStatuses();
      } else if (type === 'stt-streaming' || type === 'stt-file') {
        const targetId = normalizeSttQuantId(id);
        sttDownloadState.value[targetId] = { downloading: true, percent: 0 };
        await api.downloadSttModel({
          modelId: id,
          provider: type === 'stt-streaming' ? 'sherpa' : 'whisper'
        });
      }
    } catch (e: any) {
      console.error('Download failed:', e);
      downloadActionError.value = e?.message || 'Ошибка скачивания модели';
      const targetId = normalizeSttQuantId(id);
      if (type === 'llm-gguf') {
        downloadStore.updateProgress(0, 0, id, downloadActionError.value || 'Ошибка скачивания');
      } else if (sttDownloadState.value[targetId]) {
        sttDownloadState.value[targetId] = {
          downloading: false,
          percent: sttDownloadState.value[targetId].percent,
          error: downloadActionError.value || undefined
        };
      }
    }
  };

  const initializeSession = async () => {
    ensureGlobalListeners();
    await initHardwareSpecs();
    await checkAllStatuses();
  };

  return {
    downloadStore,
    systemRamGb,
    systemVramGb,
    useGpuCalc,
    targetMemoryGb,
    diskCheckStatus,
    diskCheckError,
    lastDiskCheckAt,
    downloadState,
    sttDownloadState,
    ttsVerificationStatus,
    confirmLowRam,
    downloadActionError,
    installedQuantsCount,
    compatibleCount,
    ensureGlobalListeners,
    isQuantDownloading,
    getQuantProgress,
    cancelActiveDownload,
    checkAllStatuses,
    downloadQuant,
    initializeSession
  };
}
