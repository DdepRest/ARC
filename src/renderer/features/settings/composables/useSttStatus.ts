import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../stores/settings.store';

const sttEngineReady = ref(false);
const activeEngineName = ref('');
const sttStatusChecked = ref(false);
const sttStatusChecking = ref(false);
const sttLastError = ref<string | null>(null);

let activeConsumers = 0;
let unsubscribeEngineReady: (() => void) | null = null;
let initializedOnce = false;

export function resetSttStatusStateForTests() {
  sttEngineReady.value = false;
  activeEngineName.value = '';
  sttStatusChecked.value = false;
  sttStatusChecking.value = false;
  sttLastError.value = null;
  activeConsumers = 0;
  initializedOnce = false;
  unsubscribeEngineReady?.();
  unsubscribeEngineReady = null;
}

export function useSttStatus() {
  const settingsStore = useSettingsStore();

  const applyEnginePayload = (payload: { ready?: boolean; activeEngine?: string; engine?: string; error?: string } | null | undefined) => {
    if (!payload) return;
    if (typeof payload.ready === 'boolean') {
      sttEngineReady.value = payload.ready;
    }
    const engine = payload.activeEngine || payload.engine;
    if (engine) {
      activeEngineName.value = engine;
      if (engine === 'gigaam') {
        settingsStore.sttEngine = 'gigaam';
        settingsStore.sttModel = 'gigaam-ctc';
      }
    }
    if (payload.error) {
      sttLastError.value = payload.error;
    } else if (payload.ready) {
      sttLastError.value = null;
    }
  };

  const refreshSttStatus = async () => {
    const api = typeof window !== 'undefined' ? (window as any).api : null;
    if (!api?.getSttStatus) {
      sttStatusChecked.value = false;
      return;
    }
    sttStatusChecking.value = true;
    try {
      const s = await api.getSttStatus();
      sttStatusChecked.value = true;
      if (s?.ready) {
        applyEnginePayload(s);
      } else {
        sttEngineReady.value = false;
        activeEngineName.value = s?.activeEngine || '';
        sttLastError.value = s?.error || null;
      }
    } catch (err: any) {
      sttStatusChecked.value = true;
      sttEngineReady.value = false;
      sttLastError.value = err?.message || 'Ошибка опроса статуса STT';
    } finally {
      sttStatusChecking.value = false;
    }
  };

  onMounted(() => {
    activeConsumers++;
    const api = typeof window !== 'undefined' ? (window as any).api : null;

    if (!initializedOnce && api) {
      initializedOnce = true;
      void refreshSttStatus();
      if (typeof api.onSttEngineReady === 'function') {
        unsubscribeEngineReady = api.onSttEngineReady((data: any) => {
          sttEngineReady.value = true;
          sttStatusChecked.value = true;
          sttLastError.value = null;
          applyEnginePayload(data);
        });
      }
    }
  });

  onUnmounted(() => {
    activeConsumers = Math.max(0, activeConsumers - 1);
    if (activeConsumers === 0) {
      unsubscribeEngineReady?.();
      unsubscribeEngineReady = null;
      initializedOnce = false;
    }
  });

  return {
    sttEngineReady,
    activeEngineName,
    sttStatusChecked,
    sttStatusChecking,
    sttLastError,
    refreshSttStatus,
    applyEnginePayload
  };
}
