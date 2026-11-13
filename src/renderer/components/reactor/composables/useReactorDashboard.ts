import { ref, computed, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { storeToRefs } from 'pinia';
import { useUIStore } from '../../../stores/ui.store';
import { useSystemStore } from '../../../stores/system.store';
import { usePerformanceStore } from '../../../stores/performance.store';
import { useEcoStore } from '../../../stores/eco.store';
import { computeLoadDrivenSpeed, computeRamGlowPulse } from '../reactorMetrics';

export type VisualizerMode = 'harmonics' | 'waveform' | 'matrix';
export type DashboardTab = 'overview' | 'subsystems' | 'telemetry';

export function useReactorDashboard() {
  const uiStore = useUIStore();
  const systemStore = useSystemStore();
  const performanceStore = usePerformanceStore();
  const ecoStore = useEcoStore();

  const { reactorState, activeModel, activeRoute, timelineStep, timelineLatency, profilerStats, isListening } = storeToRefs(uiStore);
  const { metrics, info } = storeToRefs(systemStore);
  const { policy } = storeToRefs(performanceStore);
  const { isEcoActive } = storeToRefs(ecoStore);

  // Local interactive UI state
  const visualizerMode = ref<VisualizerMode>('harmonics');
  const activeTab = ref<DashboardTab>('overview');
  const isPinging = ref(false);
  const lastPingLatency = ref(18);
  const animTime = ref(0);

  let animationFrameId: number | null = null;

  const resumeTicker = () => {
    if (animationFrameId === null && typeof document !== 'undefined' && !document.hidden && !ecoStore.isThrottled) {
      animationFrameId = requestAnimationFrame(updateTicker);
    }
  };

  const pauseTicker = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  // Animation ticker for dynamic SVG elements
  const updateTicker = (t: number) => {
    if (typeof document !== 'undefined' && (document.hidden || ecoStore.isThrottled)) {
      pauseTicker();
      return;
    }
    animTime.value = t * 0.001; // seconds
    animationFrameId = requestAnimationFrame(updateTicker);
  };

  const onVisibilityOrFocus = () => {
    if (typeof document !== 'undefined' && (document.hidden || ecoStore.isThrottled)) {
      pauseTicker();
    } else {
      resumeTicker();
    }
  };

  const instance = getCurrentInstance();
  if (instance) {
    onMounted(() => {
      resumeTicker();
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', onVisibilityOrFocus);
        window.addEventListener('blur', onVisibilityOrFocus);
      }
      if (!systemStore.isReady && systemStore.initialize) {
        systemStore.initialize();
      }
    });

    onUnmounted(() => {
      pauseTicker();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onVisibilityOrFocus);
        window.removeEventListener('blur', onVisibilityOrFocus);
      }
    });
  }

  // Derived metrics
  const cpuPercent = computed(() => {
    const val = metrics.value?.cpuLoad ?? profilerStats.value?.cpuLoad ?? 18;
    return Math.max(0, Math.min(100, Math.round(val)));
  });

  const ramPercent = computed(() => {
    const val = metrics.value?.memoryUsage ?? profilerStats.value?.ramLoad ?? 34;
    return Math.max(0, Math.min(100, Math.round(val)));
  });

  const fpsValue = computed(() => {
    return profilerStats.value?.fps ?? 60;
  });

  const frameTimeValue = computed(() => {
    return profilerStats.value?.frameTime ?? 16.6;
  });

  const tempValue = computed(() => {
    const temp = metrics.value?.temperature;
    return temp && temp > 0 ? Math.round(temp) : 41;
  });

  const compositeLoad = computed(() => {
    const cpu = cpuPercent.value;
    const ram = ramPercent.value;
    const stateBonus = reactorState.value === 'processing' ? 25 : reactorState.value === 'speaking' ? 15 : 0;
    return Math.min(100, Math.round(cpu * 0.5 + ram * 0.3 + stateBonus));
  });

  // Dynamic visualizer speed & pulse calculations
  const loadSpeed = computed(() => {
    return computeLoadDrivenSpeed(cpuPercent.value, 1.0);
  });

  const ramPulse = computed(() => {
    return computeRamGlowPulse(ramPercent.value, 1.0);
  });

  // State presentation
  const stateMeta = computed(() => {
    switch (reactorState.value) {
      case 'listening':
        return {
          label: 'Слушает',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotClass: 'bg-emerald-400 animate-pulse',
          color: '#34d399'
        };
      case 'processing':
        return {
          label: 'Обработка',
          badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-400 animate-ping',
          color: '#fbbf24'
        };
      case 'speaking':
        return {
          label: 'Синтез речи',
          badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          dotClass: 'bg-cyan-400 animate-pulse',
          color: '#22d3ee'
        };
      case 'alert':
        return {
          label: 'Сбой ядра',
          badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          dotClass: 'bg-rose-500 animate-bounce',
          color: '#f43f5e'
        };
      case 'idle':
      default:
        return {
          label: isEcoActive.value ? 'Эко-режим' : 'Готовность',
          badgeClass: isEcoActive.value 
            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          dotClass: isEcoActive.value ? 'bg-amber-400' : 'bg-rose-500',
          color: isEcoActive.value ? '#f59e0b' : '#ef4444'
        };
    }
  });

  // Dynamic SVG Waveform points calculation
  const waveformPath = computed(() => {
    const t = animTime.value;
    const loadMult = (cpuPercent.value / 100) * 12 + 4;
    const width = 280;
    const height = 60;
    const midY = height / 2;
    const points: string[] = [];

    for (let x = 0; x <= width; x += 10) {
      const progress = x / width;
      const angle = progress * Math.PI * 4 + t * (loadSpeed.value * 3);
      const wave = Math.sin(angle) * loadMult * (1 - Math.abs(progress - 0.5) * 0.8);
      const y = midY + wave;
      points.push(`${x},${y.toFixed(1)}`);
    }

    return `M ${points.join(' L ')}`;
  });

  // Interactive diagnostic pulse action
  const triggerDiagnosticPulse = () => {
    if (isPinging.value) return;
    isPinging.value = true;
    uiStore.pulseTrigger++;
    
    // Simulate real local ping measurement
    const start = performance.now();
    setTimeout(() => {
      lastPingLatency.value = Math.max(8, Math.round(performance.now() - start + (Math.random() * 6)));
      isPinging.value = false;
      uiStore.showToast(`Диагностический импульс ядра: ${lastPingLatency.value}мс`, 'info', 2500);
    }, 180);
  };

  return {
    visualizerMode,
    activeTab,
    isPinging,
    lastPingLatency,
    animTime,
    cpuPercent,
    ramPercent,
    fpsValue,
    frameTimeValue,
    tempValue,
    compositeLoad,
    loadSpeed,
    ramPulse,
    stateMeta,
    waveformPath,
    activeModel,
    activeRoute,
    timelineStep,
    timelineLatency,
    isListening,
    isEcoActive,
    policy,
    info,
    triggerDiagnosticPulse
  };
}
