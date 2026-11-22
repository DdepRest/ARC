import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUIStore } from '../../../stores/ui.store';

export const useModelDownloadStore = defineStore('modelDownload', () => {
  const isDownloading = ref(false);
  const bytesDone = ref(0);
  const totalBytes = ref(0);
  const currentFilename = ref('');
  const statusText = ref('');
  const errorText = ref('');

  const userDismissed = ref(false);
  const isPausedForVoice = ref(false);
  const isCollapsed = ref(false);
  const taskType = ref<'download' | 'loading' | 'stt-download' | null>(null);
  const loadingModelName = ref('');
  const loadingStageText = ref('');
  const completedMessage = ref('');
  let completedClearTimer: any = null;

  // Fallback Consent modal state
  const isConsentOpen = ref(false);
  const consentModelName = ref('');
  const consentSizeBytes = ref(0);
  const consentReason = ref('');
  const consentTimeoutSeconds = ref(30);
  let consentTimer: any = null;

  const showConsentDialog = (payload: { modelName: string; sizeBytes: number; reason: string; timeoutMs?: number }) => {
    if (isConsentOpen.value) {
      console.log('[ModelDownloadStore] Consent dialog already open, ignoring duplicate request.');
      return;
    }
    consentModelName.value = payload.modelName;
    consentSizeBytes.value = payload.sizeBytes || 0;
    consentReason.value = payload.reason || 'Облачные нейросети недоступны.';
    consentTimeoutSeconds.value = Math.round((payload.timeoutMs || 30000) / 1000);
    isConsentOpen.value = true;

    if (consentTimer) clearInterval(consentTimer);
    consentTimer = setInterval(() => {
      consentTimeoutSeconds.value--;
      if (consentTimeoutSeconds.value <= 0) {
        rejectConsent();
      }
    }, 1000);
  };

  const approveConsent = async () => {
    if (consentTimer) {
      clearInterval(consentTimer);
      consentTimer = null;
    }
    isConsentOpen.value = false;
    try {
      if (window.api && (window.api as any).approveLlmFallback) {
        await (window.api as any).approveLlmFallback();
      }
    } catch (e) {
      console.warn('Failed to approve LLM fallback:', e);
    }
  };

  const rejectConsent = async () => {
    if (consentTimer) {
      clearInterval(consentTimer);
      consentTimer = null;
    }
    isConsentOpen.value = false;
    try {
      if (window.api && (window.api as any).rejectLlmFallback) {
        await (window.api as any).rejectLlmFallback();
      }
    } catch (e) {
      console.warn('Failed to reject LLM fallback:', e);
    }
  };

  const checkActiveDownload = async () => {
    try {
      if (window.api && (window.api as any).getActiveModelDownload) {
        const active = await (window.api as any).getActiveModelDownload();
        if (active && active.isDownloading) {
          updateProgress(active.bytesDone, active.totalBytes, active.modelName);
        }
      }
    } catch (e) {
      console.warn('Failed to check active download state:', e);
    }
  };

  const setPausedForVoice = (paused: boolean) => {
    isPausedForVoice.value = paused;
    if (paused && isDownloading.value) {
      statusText.value = 'Загрузка приостановлена: Голосовой ввод';
      downloadSpeedBps.value = 0;
    } else if (!paused && isDownloading.value && currentFilename.value) {
      statusText.value = `Downloading ${currentFilename.value}...`;
    }
  };

  // Speed and ETA calculation
  const lastTime = ref(0);
  const lastBytes = ref(0);
  const downloadSpeedBps = ref(0);
  const speedSampleCount = ref(0);
  const lastExplicitPercent = ref(0);

  const progressPercent = computed(() => {
    if (totalBytes.value <= 0) {
      return Math.min(Math.max(lastExplicitPercent.value, 0), 100).toFixed(1);
    }
    const p = (bytesDone.value / totalBytes.value) * 100;
    return Math.min(Math.max(p, 0), 100).toFixed(1);
  });

  const downloadSpeedFormatted = computed(() => {
    if (downloadSpeedBps.value <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(downloadSpeedBps.value) / Math.log(k));
    return parseFloat((downloadSpeedBps.value / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  });

  const estimatedTimeFormatted = computed(() => {
    if (speedSampleCount.value < 2 || downloadSpeedBps.value <= 0 || totalBytes.value <= 0) return '--:--';
    const remainingBytes = totalBytes.value - bytesDone.value;
    if (remainingBytes <= 0) return '00:00';
    
    const secondsRemaining = Math.round(remainingBytes / downloadSpeedBps.value);
    if (!isFinite(secondsRemaining) || secondsRemaining < 0) return '--:--';

    const h = Math.floor(secondsRemaining / 3600);
    const m = Math.floor((secondsRemaining % 3600) / 60);
    const s = secondsRemaining % 60;

    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  const recordSpeed = (done: number, total: number) => {
    const now = Date.now();
    bytesDone.value = done;
    totalBytes.value = total;

    if (!isDownloading.value || lastTime.value === 0) {
      lastTime.value = now;
      lastBytes.value = done;
      downloadSpeedBps.value = 0;
      speedSampleCount.value = 0;
      return;
    }

    const timeDiff = now - lastTime.value;
    if (timeDiff >= 400) {
      const bytesDiff = done - lastBytes.value;
      if (bytesDiff > 0) {
        const instantSpeed = (bytesDiff / timeDiff) * 1000;
        downloadSpeedBps.value = downloadSpeedBps.value === 0
          ? instantSpeed
          : Math.round(downloadSpeedBps.value * 0.35 + instantSpeed * 0.65);
        speedSampleCount.value += 1;
        lastTime.value = now;
        lastBytes.value = done;
      } else if (bytesDiff === 0 && timeDiff >= 2500) {
        downloadSpeedBps.value = 0;
      }
    }
  };

  const updateProgress = (done: number, total: number, filename: string, error?: string) => {
    if (error) {
      errorText.value = error;
      statusText.value = `Error: ${error}`;
      isDownloading.value = false;
      downloadSpeedBps.value = 0;
      speedSampleCount.value = 0;
      useUIStore().setHighComputeLoad(false);
      return;
    }

    const wasNotDownloading = !isDownloading.value;
    if (wasNotDownloading) {
      isDownloading.value = true;
      taskType.value = 'download';
      userDismissed.value = false;
      errorText.value = '';
      completedMessage.value = '';
      useUIStore().setHighComputeLoad(true);
      lastTime.value = Date.now();
      lastBytes.value = done;
      bytesDone.value = done;
      totalBytes.value = total;
      downloadSpeedBps.value = 0;
      speedSampleCount.value = 0;
    } else {
      recordSpeed(done, total);
    }

    currentFilename.value = filename;
    statusText.value = `Downloading ${filename}...`;

    if (done >= total && total > 0) {
      setTimeout(() => {
        completedMessage.value = `Модель ${filename || 'нейросети'} успешно скачана`;
        finishDownload(true);
      }, 1000); // 1s grace period
    }
  };

  const updateLoadingStatus = (data: { modelName: string; status: 'loading' | 'ready' | 'error' }) => {
    if (completedClearTimer) clearTimeout(completedClearTimer);

    if (data.status === 'loading') {
      taskType.value = 'loading';
      loadingModelName.value = data.modelName || 'Qwen2.5';
      loadingStageText.value = 'Инициализация весов в RAM/VRAM...';
      userDismissed.value = false;
      errorText.value = '';
      completedMessage.value = '';
    } else if (data.status === 'ready') {
      taskType.value = null;
      loadingStageText.value = 'Готово';
      completedMessage.value = `Модель ${data.modelName || 'нейросети'} готова к работе`;
      completedClearTimer = setTimeout(() => {
        completedMessage.value = '';
        loadingModelName.value = '';
        loadingStageText.value = '';
      }, 3500);
    } else if (data.status === 'error') {
      taskType.value = null;
      errorText.value = `Ошибка загрузки модели ${data.modelName || ''}`;
      loadingStageText.value = 'Сбой';
    }
  };

  const updateSttProgress = (data: { modelId: string; percent: number; status: string; error?: string; bytes_done?: number; total_bytes?: number }) => {
    if (completedClearTimer) clearTimeout(completedClearTimer);
    if (data.status === 'cancelled') {
      if (!currentFilename.value || currentFilename.value === data.modelId) finishDownload(false);
      return;
    }
    if (data.error || data.status === 'error') {
      errorText.value = data.error || 'Ошибка скачивания голосовой модели';
      isDownloading.value = false;
      downloadSpeedBps.value = 0;
      speedSampleCount.value = 0;
      useUIStore().setHighComputeLoad(false);
      return;
    }
    if (data.status === 'completed' || data.percent >= 100) {
      completedMessage.value = `Голосовая модель ${data.modelId} готова`;
      finishDownload(true);
      completedClearTimer = setTimeout(() => { completedMessage.value = ''; }, 3500);
      return;
    }

    lastExplicitPercent.value = typeof data.percent === 'number' ? data.percent : 0;
    const isSameModel = currentFilename.value === data.modelId;
    const knownTotal = data.total_bytes && data.total_bytes > 0
      ? data.total_bytes
      : (isSameModel && totalBytes.value > 0 ? totalBytes.value : 0);
    const done = data.bytes_done !== undefined && data.bytes_done >= 0
      ? data.bytes_done
      : (knownTotal > 0 ? Math.round((lastExplicitPercent.value / 100) * knownTotal) : (isSameModel ? bytesDone.value : 0));

    const wasNotDownloading = !isDownloading.value || !isSameModel;
    if (wasNotDownloading) {
      isDownloading.value = true;
      taskType.value = 'stt-download';
      userDismissed.value = false;
      errorText.value = '';
      completedMessage.value = '';
      useUIStore().setHighComputeLoad(true);
      lastTime.value = Date.now();
      lastBytes.value = done;
      bytesDone.value = done;
      totalBytes.value = knownTotal;
      downloadSpeedBps.value = 0;
      speedSampleCount.value = 0;
    } else {
      recordSpeed(done, knownTotal);
    }

    currentFilename.value = data.modelId;
    statusText.value = data.status === 'verifying' ? `Проверка STT: ${data.modelId}` : `Загрузка STT: ${data.modelId}`;
  };

  const closeOverlay = () => { userDismissed.value = true; };
  const toggleCollapse = () => { isCollapsed.value = !isCollapsed.value; };
  const expand = () => { isCollapsed.value = false; userDismissed.value = false; };
  const collapse = () => { isCollapsed.value = true; };

  const cancelDownload = async (modelId?: string) => {
    const targetSttId = modelId || (taskType.value === 'stt-download' ? currentFilename.value || undefined : undefined);
    try {
      const api = window.api as any;
      if (!modelId && taskType.value !== 'stt-download' && typeof api?.cancelBuiltinModelDownload === 'function') await api.cancelBuiltinModelDownload();
      if (typeof api?.cancelSttDownload === 'function') await api.cancelSttDownload(targetSttId);
    } catch (e) { console.warn('Failed to cancel download via IPC:', e); }
    finishDownload();
  };

  const finishDownload = (preserveMessage = false) => {
    isDownloading.value = false;
    bytesDone.value = 0;
    totalBytes.value = 0;
    lastExplicitPercent.value = 0;
    currentFilename.value = '';
    downloadSpeedBps.value = 0;
    speedSampleCount.value = 0;
    useUIStore().setHighComputeLoad(false);
    if (!preserveMessage) {
      userDismissed.value = false;
      errorText.value = '';
      taskType.value = null;
    }
  };

  const hasActiveNotification = computed(() => {
    if (userDismissed.value) return false;
    return isDownloading.value || taskType.value === 'loading' || !!completedMessage.value || !!errorText.value || isHfCooldown.value;
  });

  const hfCooldownSeconds = ref(0);
  const isHfCooldown = computed(() => hfCooldownSeconds.value > 0);

  if (typeof window !== 'undefined' && (window as any).api?.onHfCooldownTick) {
    (window as any).api.onHfCooldownTick((data: { remainingSeconds: number }) => {
      hfCooldownSeconds.value = data.remainingSeconds;
    });
  }

  const resetHfCooldown = async () => {
    hfCooldownSeconds.value = 0;
    try {
      if (window.api && (window.api as any).resetHfCooldown) {
        await (window.api as any).resetHfCooldown();
      }
    } catch (e) {
      console.warn('Failed to reset HF cooldown:', e);
    }
  };

  const displayTitle = computed(() => {
    if (completedMessage.value) return completedMessage.value;
    if (isHfCooldown.value) return `HuggingFace 429: ожидание ${hfCooldownSeconds.value}с`;
    if (taskType.value === 'loading') return `Инициализация ${loadingModelName.value || 'нейросети'}`;
    if (taskType.value === 'stt-download') return `Загрузка модели речи ${currentFilename.value}`;
    if (currentFilename.value) return `Загрузка ${currentFilename.value}`;
    return 'Загрузка модели';
  });

  return {
    isDownloading,
    userDismissed,
    isCollapsed,
    taskType,
    loadingModelName,
    loadingStageText,
    completedMessage,
    hasActiveNotification,
    displayTitle,
    hfCooldownSeconds,
    isHfCooldown,
    resetHfCooldown,
    bytesDone,
    totalBytes,
    currentFilename,
    statusText,
    errorText,
    progressPercent,
    downloadSpeedFormatted,
    estimatedTimeFormatted,
    isPausedForVoice,
    isConsentOpen,
    consentModelName,
    consentSizeBytes,
    consentReason,
    consentTimeoutSeconds,
    showConsentDialog,
    approveConsent,
    rejectConsent,
    checkActiveDownload,
    setPausedForVoice,
    updateProgress,
    updateLoadingStatus,
    updateSttProgress,
    toggleCollapse,
    expand,
    collapse,
    closeOverlay,
    cancelDownload,
    finishDownload
  };
});
