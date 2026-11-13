import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '../features/settings/stores/settings.store';

export type EcoState = 'active' | 'idle' | 'hidden';

export const useEcoStore = defineStore('eco', () => {
  const ecoState = ref<EcoState>('active');
  const lastActiveTime = ref(Date.now());
  const idleTimeoutMs = 180000; // 180 seconds (3 minutes)

  const settingsStore = useSettingsStore();

  const isEcoEnabled = computed(() => {
    return settingsStore.ecoMode !== 'off';
  });

  const currentEcoState = computed<EcoState>(() => {
    if (settingsStore.ecoMode === 'always') return 'idle';
    if (!isEcoEnabled.value) return 'active';
    return ecoState.value;
  });

  const isEcoActive = computed(() => {
    return currentEcoState.value === 'idle' || currentEcoState.value === 'hidden';
  });
  
  const isHidden = computed(() => currentEcoState.value === 'hidden');
  const isWindowFocused = ref(typeof document !== 'undefined' ? document.hasFocus() : true);
  const isThrottled = computed(() => !isWindowFocused.value || currentEcoState.value === 'hidden');

  let idleTimer: ReturnType<typeof setInterval> | null = null;
  let hiddenDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastReportThrottle = 0;
  const lastChangeReason = ref<string>('initial');
  const activityEvents = ['mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart', 'wheel', 'pointerdown'];
  let handleActivityFn: ((e?: Event) => void) | null = null;
  let handleVisibilityFn: (() => void) | null = null;
  let handleBlurFn: (() => void) | null = null;
  let handleFocusFn: (() => void) | null = null;
  let cleanupIpcFocus: (() => void) | null = null;

  function reportActivity(force = false, eventName?: string) {
    if (hiddenDebounceTimer) {
      clearTimeout(hiddenDebounceTimer);
      hiddenDebounceTimer = null;
    }
    const now = Date.now();
    lastActiveTime.value = now;

    // Hysteresis: If already active, do nothing
    if (ecoState.value === 'active') {
      return;
    }

    // Do not wake up from idle/hidden state just by moving the mouse or wheeling
    if (eventName === 'mousemove' || eventName === 'wheel') {
      return;
    }

    lastChangeReason.value = eventName ? `user_activity:${eventName}` : 'user_activity';
    console.log(`[EcoStore] Activity detected (${lastChangeReason.value}) → transitioning to active state`);
    ecoState.value = 'active';
  }

  function setEcoState(state: EcoState, reason = 'manual') {
    if (ecoState.value === state) {
      if (state === 'active') {
        lastActiveTime.value = Date.now();
      }
      return;
    }
    lastChangeReason.value = reason;
    ecoState.value = state;
    if (state === 'active') {
      lastActiveTime.value = Date.now();
    }
  }

  function setHidden(hidden: boolean, source = 'visibilitychange') {
    if (hidden) {
      if (activeDebounceTimer) {
        clearTimeout(activeDebounceTimer);
        activeDebounceTimer = null;
      }
      if (!hiddenDebounceTimer && ecoState.value !== 'hidden') {
        hiddenDebounceTimer = setTimeout(() => {
          hiddenDebounceTimer = null;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            lastChangeReason.value = source;
            console.log(`[EcoReactor] State changed: active → hidden (source: ${source})`);
            ecoState.value = 'hidden';
          }
        }, 400);
      }
    } else {
      if (hiddenDebounceTimer) {
        clearTimeout(hiddenDebounceTimer);
        hiddenDebounceTimer = null;
      }
      if (activeDebounceTimer) {
        clearTimeout(activeDebounceTimer);
        activeDebounceTimer = null;
      }
      if (ecoState.value !== 'active') {
        lastChangeReason.value = source;
        console.log(`[EcoReactor] State changed: ${ecoState.value} → active (source: ${source})`);
        setEcoState('active', source);
      }
    }
  }

  watch(currentEcoState, (newState, oldState) => {
    if (newState === oldState) return;
    if ((window as any).api && (window as any).api.setEcoState) {
      (window as any).api.setEcoState(newState, lastChangeReason.value);
    }
  }, { immediate: true });

  function initActivityListeners() {
    destroyListeners();

    let pendingActivity = false;
    handleActivityFn = (e?: Event) => {
      const type = e?.type;
      if (ecoState.value === 'active' && (type === 'mousemove' || type === 'wheel')) {
        const now = Date.now();
        if (now - lastReportThrottle > 2000) {
          lastReportThrottle = now;
          lastActiveTime.value = now;
        }
        return;
      }
      if (!pendingActivity) {
        pendingActivity = true;
        requestAnimationFrame(() => {
          pendingActivity = false;
          reportActivity(false, type);
        });
      }
    };
    handleVisibilityFn = () => {
      const isDocHidden = document.visibilityState === 'hidden';
      setHidden(isDocHidden, `visibilitychange:${document.visibilityState}`);
    };

    handleBlurFn = () => {
      if (typeof document !== 'undefined' && document.hasFocus && document.hasFocus()) {
        return;
      }
      isWindowFocused.value = false;
    };

    handleFocusFn = () => {
      isWindowFocused.value = true;
      if (ecoState.value === 'hidden' && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) {
        setHidden(false, 'focus');
      }
    };

    activityEvents.forEach(evt => {
      window.addEventListener(evt, handleActivityFn as EventListener, { passive: true, capture: true });
    });

    document.addEventListener('visibilitychange', handleVisibilityFn);
    window.addEventListener('blur', handleBlurFn);
    window.addEventListener('focus', handleFocusFn);

    if ((window as any).api?.onFocusChanged) {
      cleanupIpcFocus = (window as any).api.onFocusChanged((focused: boolean) => {
        if (focused) {
          handleFocusFn?.();
        } else {
          handleBlurFn?.();
        }
      });
    }

    idleTimer = setInterval(() => {
      if (ecoState.value === 'active' && Date.now() - lastActiveTime.value >= idleTimeoutMs) {
        console.log('[EcoStore] Idle timeout reached (180s) → transitioning to idle state');
        ecoState.value = 'idle';
      }
    }, 1000);
  }

  function destroyListeners() {
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
    if (hiddenDebounceTimer) {
      clearTimeout(hiddenDebounceTimer);
      hiddenDebounceTimer = null;
    }
    if (activeDebounceTimer) {
      clearTimeout(activeDebounceTimer);
      activeDebounceTimer = null;
    }
    if (handleActivityFn) {
      activityEvents.forEach(evt => {
        window.removeEventListener(evt, handleActivityFn as EventListener, { capture: true });
      });
      handleActivityFn = null;
    }
    if (handleVisibilityFn) {
      document.removeEventListener('visibilitychange', handleVisibilityFn);
      handleVisibilityFn = null;
    }
    if (handleBlurFn) {
      window.removeEventListener('blur', handleBlurFn);
      handleBlurFn = null;
    }
    if (handleFocusFn) {
      window.removeEventListener('focus', handleFocusFn);
      handleFocusFn = null;
    }
    if (cleanupIpcFocus) {
      cleanupIpcFocus();
      cleanupIpcFocus = null;
    }
  }

  return {
    ecoState,
    currentEcoState,
    isEcoActive,
    isHidden,
    isWindowFocused,
    isThrottled,
    reportActivity,
    setHidden,
    setEcoState,
    initActivityListeners,
    destroyListeners
  };
});
