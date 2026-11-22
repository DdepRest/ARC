import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../stores/settings.store';
import type { VoiceModelSetupState } from '../../../../shared/utils/voice-model-state-machine';

const sttEngineReady = ref(false);
const activeEngineName = ref('');
const sttStatusChecked = ref(false);
const sttStatusChecking = ref(false);
const sttLastError = ref<string | null>(null);
const sttModelsInstalled = ref<boolean | null>(null);
const sttMissingReason = ref<string | null>(null);
const sttSetupState = ref<VoiceModelSetupState | null>(null);

let activeConsumers = 0;
let unsubscribeEngineReady: (() => void) | null = null;
let initializedOnce = false;

export function resetSttStatusStateForTests() {
  sttEngineReady.value = false;
  activeEngineName.value = '';
  sttStatusChecked.value = false;
  sttStatusChecking.value = false;
  sttLastError.value = null;
  sttModelsInstalled.value = null;
  sttMissingReason.value = null;
  sttSetupState.value = null;
  activeConsumers = 0;
  initializedOnce = false;
  unsubscribeEngineReady?.();
  unsubscribeEngineReady = null;
}

export function useSttStatus() {
  const settingsStore = useSettingsStore();

  const applyEnginePayload = (
    payload: {
      ready?: boolean;
      activeEngine?: string;
      engine?: string;
      error?: string | null;
      lastError?: string | null;
      modelsInstalled?: boolean;
      missingReason?: string | null;
      setupState?: VoiceModelSetupState;
    } | null | undefined
  ) => {
    if (!payload) return;
    if (typeof payload.ready === 'boolean') {
      sttEngineReady.value = payload.ready;
    }
    if (typeof payload.modelsInstalled === 'boolean') {
      sttModelsInstalled.value = payload.modelsInstalled;
    }
    if (payload.missingReason !== undefined) {
      sttMissingReason.value = payload.missingReason;
    }
    if (payload.setupState) {
      sttSetupState.value = payload.setupState;
    }
    const engine = payload.activeEngine || payload.engine;
    if (engine && engine !== 'none') {
      activeEngineName.value = engine;
      if (engine === 'gigaam') {
        settingsStore.sttEngine = 'gigaam';
        settingsStore.sttModel = 'gigaam-ctc';
      }
    } else if (engine === 'none') {
      activeEngineName.value = '';
    }
    const errText = payload.error || payload.lastError || null;
    const isMissingResourceState =
      payload.setupState === 'missing' ||
      payload.setupState === 'consent_required' ||
      payload.modelsInstalled === false;
    if (errText && !isMissingResourceState) {
      sttLastError.value = errText;
    } else if (payload.ready || isMissingResourceState) {
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
      if (s) {
        applyEnginePayload(s);
        if (!s.ready && !s.lastError && !s.error) {
          sttLastError.value = null;
        }
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
    if (api) {
      void refreshSttStatus();
    }
    if (!initializedOnce && api) {
      initializedOnce = true;
      if (typeof api.onSttEngineReady === 'function') {
        unsubscribeEngineReady = api.onSttEngineReady((data: any) => {
          sttEngineReady.value = true;
          sttStatusChecked.value = true;
          sttLastError.value = null;
          sttModelsInstalled.value = true;
          sttMissingReason.value = null;
          sttSetupState.value = 'ready';
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
    sttModelsInstalled,
    sttMissingReason,
    sttSetupState,
    refreshSttStatus,
    applyEnginePayload
  };
}
