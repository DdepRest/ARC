import { ref, computed } from 'vue';
import { MODEL_REGISTRY, type ModelType } from '../components/sections/model-hub.registry';
import { useModelDownloadStore } from '../../modelDownload/stores/modelDownload.store';
import type { ResourceStateSnapshot } from '../../../../shared/utils/voice-model-state-machine';
import {
  CANONICAL_QUANT_IDS, deriveHubQuantSnapshot, evaluateTtsRuntimeStatus, extractSttRuntimeSets,
  fetchSystemMemorySpecs, findQuantTypeById, getQuantCompatibility, normalizeSttQuantId,
  type QuantCompatibility, type DiskCheckStatus, type TtsVerificationStatus, type QuantIntegrityInfo
} from '../logic/model-hub-state.helper';

export { getQuantCompatibility, normalizeSttQuantId, type QuantCompatibility, type DiskCheckStatus, type TtsVerificationStatus, type QuantIntegrityInfo };

const systemRamGb = ref<number | null>(null);
const systemVramGb = ref<number | null>(null);
const useGpuCalc = ref(false);
const diskCheckStatus = ref<DiskCheckStatus>('IDLE');
const diskCheckError = ref<string | null>(null);
const lastDiskCheckAt = ref<number | null>(null);
const downloadState = ref<Record<string, { downloaded: boolean }>>({});
const modelIntegrityMap = ref<Record<string, QuantIntegrityInfo>>({});
const quantStateMap = ref<Record<string, ResourceStateSnapshot>>({});
const sttDownloadState = ref<Record<string, { downloading: boolean; percent: number; error?: string }>>({});
const ttsVerificationStatus = ref<TtsVerificationStatus>('UNCHECKED');
const confirmLowRam = ref<Set<string>>(new Set());
const downloadActionError = ref<string | null>(null);
const pendingVerificationIds = ref<Set<string>>(new Set());
const loadedModelIds = ref<Set<string>>(new Set());
const activeModelIds = ref<Set<string>>(new Set());
const verifyingIds = ref<Set<string>>(new Set());
const cancelledIds = ref<Set<string>>(new Set());
const quantErrorMap = ref<Record<string, string>>({});
let listenersRegistered = false;
let hardwareInitialized = false;

export function resetModelHubSessionForTests() {
  systemRamGb.value = null; systemVramGb.value = null; useGpuCalc.value = false;
  diskCheckStatus.value = 'IDLE'; diskCheckError.value = null; lastDiskCheckAt.value = null;
  downloadState.value = {}; modelIntegrityMap.value = {}; quantStateMap.value = {};
  sttDownloadState.value = {}; ttsVerificationStatus.value = 'UNCHECKED';
  confirmLowRam.value = new Set(); downloadActionError.value = null;
  pendingVerificationIds.value = new Set(); loadedModelIds.value = new Set();
  activeModelIds.value = new Set(); verifyingIds.value = new Set();
  cancelledIds.value = new Set(); quantErrorMap.value = {};
  listenersRegistered = false; hardwareInitialized = false;
}

export function useModelHubSession() {
  const downloadStore = useModelDownloadStore();

  const isQuantDownloading = (id: string) => {
    const normalized = normalizeSttQuantId(id);
    if (sttDownloadState.value[normalized]?.downloading || sttDownloadState.value[id]?.downloading) return true;
    return downloadStore.isDownloading && downloadStore.currentFilename === id;
  };

  const syncQuantSnapshot = (id: string, type?: ModelType, opts?: { onDisk?: boolean; consentRequired?: boolean; checking?: boolean }) => {
    quantStateMap.value[id] = deriveHubQuantSnapshot({
      id,
      type: type || findQuantTypeById(id),
      downloaded: opts?.onDisk ?? Boolean(downloadState.value[id]?.downloaded),
      downloading: isQuantDownloading(id),
      verifying: verifyingIds.value.has(id),
      verificationPending: Boolean(opts?.checking) || pendingVerificationIds.value.has(id),
      cancelled: cancelledIds.value.has(id),
      error: quantErrorMap.value[id] || null,
      integrityInfo: modelIntegrityMap.value[id],
      loaded: loadedModelIds.value.has(id),
      active: activeModelIds.value.has(id),
      consentRequired: opts?.consentRequired
    });
  };

  const applySttModelsList = (stts: any[], isPendingList = false) => {
    for (const stt of stts) {
      if (!stt?.id) continue;
      const canonicalId = normalizeSttQuantId(stt.id);
      if (!CANONICAL_QUANT_IDS.has(canonicalId)) continue;
      const pending = isPendingList || Boolean(stt.verificationPending);
      if (pending) {
        pendingVerificationIds.value.add(canonicalId);
        downloadState.value[canonicalId] = { downloaded: false };
      } else {
        pendingVerificationIds.value.delete(canonicalId);
        const isDl = Boolean(stt.downloaded);
        downloadState.value[canonicalId] = { downloaded: isDl };
        modelIntegrityMap.value[canonicalId] = { integrity: stt.integrity, provenance: stt.provenance };
        if (isDl) cancelledIds.value.delete(canonicalId);
      }
      syncQuantSnapshot(canonicalId);
    }
  };

  const targetMemoryGb = computed<number | null>(() =>
    useGpuCalc.value && systemVramGb.value !== null && systemVramGb.value > 0 ? systemVramGb.value : systemRamGb.value
  );

  const installedQuantsCount = computed(() => {
    let count = 0;
    for (const id of CANONICAL_QUANT_IDS) {
      if (downloadState.value[id]?.downloaded === true) count++;
    }
    return count;
  });

  const compatibleCount = computed<number | null>(() => {
    if (targetMemoryGb.value === null) return null;
    return MODEL_REGISTRY.filter((m) => m.quants.some((q) => getQuantCompatibility(q.minRamGb, targetMemoryGb.value) === 'COMPATIBLE')).length;
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
          if (filename) { quantErrorMap.value[filename] = data.error; syncQuantSnapshot(filename, 'llm-gguf'); }
          return;
        }
        const done = Number(data.bytes_done) || 0;
        const total = Number(data.total_bytes) || 0;
        downloadStore.updateProgress(done, total, filename);
        if (filename) { cancelledIds.value.delete(filename); delete quantErrorMap.value[filename]; syncQuantSnapshot(filename, 'llm-gguf'); }
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

        if (data.status === 'verifying') verifyingIds.value.add(targetId);
        else verifyingIds.value.delete(targetId);

        if (data.status === 'cancelled') {
          cancelledIds.value.add(targetId);
          delete quantErrorMap.value[targetId];
        } else if (data.status === 'error') {
          cancelledIds.value.delete(targetId);
          quantErrorMap.value[targetId] = data.error || 'Ошибка скачивания STT модели';
          downloadActionError.value = quantErrorMap.value[targetId];
        } else if (data.status === 'downloading') {
          cancelledIds.value.delete(targetId);
          delete quantErrorMap.value[targetId];
        } else if (data.status === 'completed') {
          cancelledIds.value.delete(targetId);
          delete quantErrorMap.value[targetId];
          if (CANONICAL_QUANT_IDS.has(targetId)) downloadState.value[targetId] = { downloaded: true };
          checkAllStatuses();
        }
        syncQuantSnapshot(targetId);
      });
    }

    if (typeof (window.api as any).onSttModelsUpdated === 'function') {
      (window.api as any).onSttModelsUpdated((res: any) => {
        applySttModelsList(Array.isArray(res) ? res : res?.models || [], Boolean(res?.isPending));
      });
    }
  };

  const initHardwareSpecs = async () => {
    if (hardwareInitialized) return;
    hardwareInitialized = true;
    const specs = await fetchSystemMemorySpecs();
    systemRamGb.value = specs.ramGb;
    systemVramGb.value = specs.vramGb;
    useGpuCalc.value = specs.useGpu;
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
      await downloadStore.checkActiveDownload();

      let nextLoaded = new Set<string>();
      let nextActive = new Set<string>();
      if (typeof api.getSttStatus === 'function') {
        try {
          const sttSets = extractSttRuntimeSets(await api.getSttStatus());
          nextLoaded = sttSets.loaded;
          nextActive = sttSets.active;
        } catch {}
      }
      loadedModelIds.value = nextLoaded;
      activeModelIds.value = nextActive;

      for (const model of MODEL_REGISTRY) {
        if (model.type === 'llm-gguf' && typeof api.checkBuiltinModel === 'function') {
          for (const q of model.quants) {
            const isDl = await api.checkBuiltinModel(q.id);
            downloadState.value[q.id] = { downloaded: Boolean(isDl) };
            syncQuantSnapshot(q.id, 'llm-gguf');
          }
        }
      }

      if (typeof api.listSttModels === 'function') {
        const res = await api.listSttModels();
        applySttModelsList(Array.isArray(res) ? res : res?.models || [], Boolean(res?.isPending));
      }

      const [serverStatus, engineInfo] = await Promise.all([
        typeof api.getTtsServerStatus === 'function' ? api.getTtsServerStatus().catch(() => null) : null,
        typeof api.getTtsActiveEngine === 'function' ? api.getTtsActiveEngine().catch(() => null) : null
      ]);
      const ttsEval = evaluateTtsRuntimeStatus(serverStatus, engineInfo);
      ttsVerificationStatus.value = ttsEval.verificationStatus;
      const ttsModel = MODEL_REGISTRY.find((m) => m.type === 'tts');
      if (ttsModel) {
        for (const q of ttsModel.quants) {
          if (ttsEval.confirmedReady) loadedModelIds.value.add(q.id);
          if (ttsEval.active) activeModelIds.value.add(q.id);
          downloadState.value[q.id] = { downloaded: ttsEval.confirmedReady };
          modelIntegrityMap.value[q.id] = ttsEval.integrityInfo;
          syncQuantSnapshot(q.id, 'tts', {
            onDisk: ttsEval.modelOnDisk || ttsEval.confirmedReady,
            checking: ttsEval.checking,
            consentRequired: ttsEval.consentRequired
          });
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

  const getQuantProgress = (id: string) => {
    const normalized = normalizeSttQuantId(id);
    if (sttDownloadState.value[normalized]?.downloading) return sttDownloadState.value[normalized].percent;
    if (sttDownloadState.value[id]?.downloading) return sttDownloadState.value[id].percent;
    if (downloadStore.isDownloading && downloadStore.currentFilename === id) {
      return Math.floor(parseFloat(downloadStore.progressPercent) || 0);
    }
    return 0;
  };

  const cancelActiveDownload = async (modelId?: string) => {
    downloadActionError.value = null;
    if (modelId) {
      const normalized = normalizeSttQuantId(modelId);
      if (sttDownloadState.value[normalized]) sttDownloadState.value[normalized] = { downloading: false, percent: 0 };
      verifyingIds.value.delete(normalized);
      cancelledIds.value.add(normalized);
      await downloadStore.cancelDownload(modelId);
      syncQuantSnapshot(normalized);
      return;
    }
    const activeIds: string[] = [];
    for (const key of Object.keys(sttDownloadState.value)) {
      if (sttDownloadState.value[key]?.downloading) {
        sttDownloadState.value[key] = { downloading: false, percent: 0 };
        verifyingIds.value.delete(key);
        cancelledIds.value.add(key);
        activeIds.push(key);
      }
    }
    if (downloadStore.currentFilename) activeIds.push(downloadStore.currentFilename);
    if (downloadStore.isDownloading) {
      const fn = downloadStore.currentFilename;
      await downloadStore.cancelDownload();
      if (fn) cancelledIds.value.add(fn);
    }
    for (const id of activeIds) syncQuantSnapshot(id);
  };

  const downloadQuant = async (type: ModelType, id: string) => {
    if (typeof window === 'undefined' || !window.api) {
      downloadActionError.value = 'Загрузка моделей доступна только в десктопном приложении A.R.C.';
      return;
    }
    downloadActionError.value = null;
    const quant = MODEL_REGISTRY.flatMap((m) => m.quants).find((q) => q.id === id);
    if (quant && getQuantCompatibility(quant.minRamGb, targetMemoryGb.value) === 'INCOMPATIBLE' && !confirmLowRam.value.has(id)) {
      const next = new Set(confirmLowRam.value);
      next.add(id);
      confirmLowRam.value = next;
      return;
    }
    try {
      ensureGlobalListeners();
      const api = window.api as any;
      if (type === 'llm-gguf') {
        cancelledIds.value.delete(id);
        delete quantErrorMap.value[id];
        downloadStore.updateProgress(0, quant?.sizeBytes || 0, id);
        syncQuantSnapshot(id, 'llm-gguf');
        const res = await api.downloadBuiltinModel(id);
        if (res && res.success === false) {
          if (res.cancelled) { cancelledIds.value.add(id); downloadStore.finishDownload(false); }
          else {
            const errMsg = res.error || 'Ошибка скачивания GGUF модели';
            quantErrorMap.value[id] = errMsg;
            downloadStore.updateProgress(0, 0, id, errMsg);
            downloadActionError.value = errMsg;
          }
          syncQuantSnapshot(id, 'llm-gguf');
        } else if (res?.success) {
          downloadState.value[id] = { downloaded: true };
          downloadStore.finishDownload(true);
        }
        await checkAllStatuses();
      } else if (type === 'stt-streaming' || type === 'stt-file') {
        const targetId = normalizeSttQuantId(id);
        cancelledIds.value.delete(targetId);
        delete quantErrorMap.value[targetId];
        sttDownloadState.value[targetId] = { downloading: true, percent: 0 };
        syncQuantSnapshot(targetId, type);
        const res = await api.downloadSttModel({ modelId: id, provider: type === 'stt-streaming' ? 'sherpa' : 'whisper' });
        if (res?.cancelled) {
          cancelledIds.value.add(targetId);
          sttDownloadState.value[targetId] = { downloading: false, percent: 0 };
          downloadStore.finishDownload(false);
          syncQuantSnapshot(targetId, type);
        }
      }
    } catch (e: any) {
      console.error('Download failed:', e);
      downloadActionError.value = e?.message || 'Ошибка скачивания модели';
      const targetId = normalizeSttQuantId(id);
      quantErrorMap.value[targetId] = downloadActionError.value || 'Ошибка скачивания';
      if (type === 'llm-gguf') downloadStore.updateProgress(0, 0, id, quantErrorMap.value[targetId]);
      else if (sttDownloadState.value[targetId]) {
        sttDownloadState.value[targetId] = { downloading: false, percent: sttDownloadState.value[targetId].percent, error: quantErrorMap.value[targetId] };
      }
      syncQuantSnapshot(targetId, type);
    }
  };

  const initializeSession = async () => {
    ensureGlobalListeners();
    await initHardwareSpecs();
    await checkAllStatuses();
  };

  return {
    downloadStore, systemRamGb, systemVramGb, useGpuCalc, targetMemoryGb,
    diskCheckStatus, diskCheckError, lastDiskCheckAt, downloadState,
    modelIntegrityMap, quantStateMap, sttDownloadState, ttsVerificationStatus,
    confirmLowRam, downloadActionError, installedQuantsCount, compatibleCount,
    ensureGlobalListeners, isQuantDownloading, getQuantProgress,
    cancelActiveDownload, checkAllStatuses, downloadQuant, initializeSession
  };
}
