import { usePerformanceStore } from '../stores/performance.store';
import { storeToRefs } from 'pinia';
import type { PerformancePolicy, PerformanceMode } from '../features/modules/types/performance.types';
import type { ComputedRef, Ref } from 'vue';

export interface UsePerformanceReturn {
  policy: ComputedRef<PerformancePolicy> | Ref<PerformancePolicy>;
  currentMode: ComputedRef<PerformanceMode> | Ref<PerformanceMode>;
  isOperatorOverride: ComputedRef<boolean> | Ref<boolean>;
  autoCandidate: ComputedRef<PerformanceMode> | Ref<PerformanceMode>;
  isGameDetected: ComputedRef<boolean> | Ref<boolean>;
  setOverride: (mode: PerformanceMode | null) => void;
  toggleGameMode: () => void;
  setGameDetected: (detected: boolean) => void;
  resetToAuto: () => void;
}

export function usePerformance(): UsePerformanceReturn {
  const store = usePerformanceStore();
  const { policy, currentMode, isOperatorOverride, autoCandidate, isGameDetected } = storeToRefs(store);

  return {
    policy,
    currentMode,
    isOperatorOverride,
    autoCandidate,
    isGameDetected,
    setOverride: store.setOverride,
    toggleGameMode: store.toggleGameMode,
    setGameDetected: store.setGameDetected,
    resetToAuto: store.resetToAuto
  };
}
