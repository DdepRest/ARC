import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReactorDashboard } from './composables/useReactorDashboard';
import { useUIStore } from '../../stores/ui.store';
import { useSystemStore } from '../../stores/system.store';

describe('useReactorDashboard Composable', () => {
  beforeEach(() => {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString();
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        }
      };
    })();
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
    Object.defineProperty(global, 'window', {
      value: {
        api: {
          setEcoState: vi.fn(),
          getSystemInfo: vi.fn().mockResolvedValue({ cores: 8 }),
          getSystemMetrics: vi.fn().mockResolvedValue({ cpuLoad: 20, memoryUsage: 30, temperature: 40 }),
          getModulesStatus: vi.fn().mockResolvedValue({})
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      },
      writable: true,
      configurable: true
    });

    setActivePinia(createPinia());
    vi.stubGlobal('requestAnimationFrame', (cb: any) => setTimeout(cb, 16));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('initializes with default visualizer mode and overview tab', () => {
    const dashboard = useReactorDashboard();
    expect(dashboard.visualizerMode.value).toBe('harmonics');
    expect(dashboard.activeTab.value).toBe('overview');
    expect(dashboard.isPinging.value).toBe(false);
  });

  it('correctly maps reactor states to descriptive status labels and colors', () => {
    const uiStore = useUIStore();
    const dashboard = useReactorDashboard();

    uiStore.reactorState = 'idle';
    expect(dashboard.stateMeta.value.label).toBe('Готовность');

    uiStore.reactorState = 'listening';
    expect(dashboard.stateMeta.value.label).toBe('Слушает');
    expect(dashboard.stateMeta.value.color).toBe('#34d399');

    uiStore.reactorState = 'processing';
    expect(dashboard.stateMeta.value.label).toBe('Обработка');
    expect(dashboard.stateMeta.value.color).toBe('#fbbf24');

    uiStore.reactorState = 'speaking';
    expect(dashboard.stateMeta.value.label).toBe('Синтез речи');
    expect(dashboard.stateMeta.value.color).toBe('#22d3ee');

    uiStore.reactorState = 'alert';
    expect(dashboard.stateMeta.value.label).toBe('Сбой ядра');
    expect(dashboard.stateMeta.value.color).toBe('#f43f5e');
  });

  it('computes composite system load correctly based on CPU, RAM, and state', () => {
    const uiStore = useUIStore();
    const systemStore = useSystemStore();
    const dashboard = useReactorDashboard();

    systemStore.metrics = {
      cpuLoad: 50,
      memoryUsage: 40,
      temperature: 42,
      uptime: 3600
    };

    uiStore.reactorState = 'idle';
    // 50 * 0.5 + 40 * 0.3 = 25 + 12 = 37
    expect(dashboard.compositeLoad.value).toBe(37);

    uiStore.reactorState = 'processing';
    // 37 + 25 = 62
    expect(dashboard.compositeLoad.value).toBe(62);
  });

  it('generates a valid SVG path for dynamic waveform visualizer', () => {
    const dashboard = useReactorDashboard();
    dashboard.animTime.value = 1.5;

    const path = dashboard.waveformPath.value;
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain(' L ');
  });

  it('triggers diagnostic pulse and increments UI pulse trigger', async () => {
    vi.useFakeTimers();
    const uiStore = useUIStore();
    const dashboard = useReactorDashboard();

    const initialTrigger = uiStore.pulseTrigger;
    dashboard.triggerDiagnosticPulse();

    expect(uiStore.pulseTrigger).toBe(initialTrigger + 1);
    expect(dashboard.isPinging.value).toBe(true);

    vi.advanceTimersByTime(200);
    expect(dashboard.isPinging.value).toBe(false);
    expect(dashboard.lastPingLatency.value).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});
