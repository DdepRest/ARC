import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useEcoStore } from './eco.store';
import {
  type PerformanceMode,
  type PerformancePolicy,
  PERFORMANCE_POLICIES
} from '../features/modules/types/performance.types';

export const usePerformanceStore = defineStore('performance', () => {
  const ecoStore = useEcoStore();

  // State
  const overrideMode = ref<PerformanceMode | null>(null);
  const autoCandidate = ref<PerformanceMode>('ACTIVE');
  const isGameDetected = ref(false);

  // Auto Candidate derivation
  watch(
    [() => ecoStore.currentEcoState, () => ecoStore.isWindowFocused, isGameDetected],
    ([ecoState, focused, gameActive]) => {
      if (gameActive) {
        autoCandidate.value = 'GAME_MODE';
      } else if (ecoState === 'hidden' || !focused) {
        autoCandidate.value = 'BACKGROUND';
      } else if (ecoState === 'idle') {
        autoCandidate.value = 'BACKGROUND';
      } else {
        autoCandidate.value = 'ACTIVE';
      }
    },
    { immediate: true }
  );

  // Active Policy calculation
  const currentMode = computed<PerformanceMode>(() => {
    return overrideMode.value ?? autoCandidate.value;
  });

  const isOperatorOverride = computed(() => overrideMode.value !== null);

  const policy = computed<PerformancePolicy>(() => {
    const mode = currentMode.value;
    const base = PERFORMANCE_POLICIES[mode] || PERFORMANCE_POLICIES.ACTIVE;
    return {
      mode,
      targetFps: base.targetFps,
      effectsLevel: base.effectsLevel,
      blurLevel: base.blurLevel,
      telemetryMode: base.telemetryMode,
      pollingMode: base.pollingMode,
      animationLevel: base.animationLevel,
      source: isOperatorOverride.value ? 'OPERATOR_OVERRIDE' : 'AUTO'
    };
  });

  // Actions
  function setOverride(mode: PerformanceMode | null) {
    overrideMode.value = mode;
  }

  function toggleGameMode() {
    if (overrideMode.value === 'GAME_MODE') {
      overrideMode.value = null;
    } else {
      overrideMode.value = 'GAME_MODE';
    }
  }

  function setGameDetected(detected: boolean) {
    isGameDetected.value = detected;
  }

  function resetToAuto() {
    overrideMode.value = null;
  }

  return {
    policy,
    currentMode,
    isOperatorOverride,
    autoCandidate,
    isGameDetected,
    setOverride,
    toggleGameMode,
    setGameDetected,
    resetToAuto
  };
});
