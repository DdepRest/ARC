import { computed } from 'vue';
import { useUIStore } from '../stores/ui.store';
import type { ReactorState } from '../../shared/types/ui';

export function useReactor() {
  const uiStore = useUIStore();

  const startListening = () => {
    uiStore.setReactorState('listening');
    uiStore.setListening(true);
  };

  const stopListening = () => {
    uiStore.setListening(false);
    uiStore.setReactorState('idle'); // Just reset to idle when stopped manually
  };

  const setReactorState = (state: ReactorState) => {
    uiStore.setReactorState(state);
  };

  const triggerAlert = () => {
    uiStore.setReactorState('alert');
    setTimeout(() => {
      // Basic safeguard reset
      if (uiStore.reactorState === 'alert') {
        uiStore.setReactorState('idle');
      }
    }, 5000);
  };

  return {
    reactorState: computed(() => uiStore.reactorState),
    isListening: computed(() => uiStore.isListening),
    startListening,
    stopListening,
    triggerAlert,
    setReactorState
  };
}
