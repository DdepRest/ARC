import { defineStore } from 'pinia';
import { useEcoStore } from './eco.store';
import { usePerformanceStore } from './performance.store';

export interface LocalModelLatencyMetrics {
  ttftMs: number | null;
  tokensPerSec: number | null;
  avgDurationMs: number | null;
  lastRequestDurationMs: number | null;
  totalRequests: number;
}

export interface SystemMetrics {
  cpuLoad: number;
  memoryUsage: number;
  temperature: number;
  networkRx?: number;
  networkTx?: number;
  uptime: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  vramUsedMb?: number;
  vramTotalMb?: number;
  cpuTemperature?: number;
  gpuTemperature?: number;
  gpuLoad?: number;
  modelLatency?: LocalModelLatencyMetrics;
}

export interface SystemInfo {
  os: string;
  distro: string;
  arch: string;
  cpu: string;
  cores: number;
  memory: number;
  usedMemory: number;
}

export const useSystemStore = defineStore('system', {
  state: () => ({
    metrics: {
      cpuLoad: 0,
      memoryUsage: 0,
      temperature: 42,
      cpuTemperature: 42,
      gpuTemperature: 46,
      uptime: 0,
      vramUsedMb: 0,
      vramTotalMb: 8192,
      modelLatency: {
        ttftMs: 120,
        tokensPerSec: 38.5,
        avgDurationMs: 410,
        lastRequestDurationMs: 380,
        totalRequests: 0
      }
    } as SystemMetrics,
    latencyHistory: [] as Array<{ ttftMs: number; tokensPerSec: number; durationMs: number }>,
    info: null as SystemInfo | null,
    modulesStatus: {} as Record<string, string>,
    isReady: false,
    effectiveTelemetryCadence: '10s'
  }),
  actions: {
    recordModelInference(ttftMs: number, totalTokens: number, durationMs: number) {
      const validTtft = Math.max(10, Math.round(ttftMs));
      const validDuration = Math.max(10, Math.round(durationMs));
      const durationSec = validDuration / 1000;
      const tokSec = durationSec > 0 ? Math.round((totalTokens / durationSec) * 10) / 10 : 0;

      this.latencyHistory = [
        ...this.latencyHistory.slice(-19),
        { ttftMs: validTtft, tokensPerSec: tokSec, durationMs: validDuration }
      ];

      const len = this.latencyHistory.length;
      const avgTTFT = Math.round(this.latencyHistory.reduce((a, b) => a + b.ttftMs, 0) / len);
      const avgDuration = Math.round(this.latencyHistory.reduce((a, b) => a + b.durationMs, 0) / len);
      const avgTokSec = Math.round((this.latencyHistory.reduce((a, b) => a + b.tokensPerSec, 0) / len) * 10) / 10;

      this.metrics.modelLatency = {
        ttftMs: avgTTFT,
        tokensPerSec: avgTokSec,
        avgDurationMs: avgDuration,
        lastRequestDurationMs: validDuration,
        totalRequests: (this.metrics.modelLatency?.totalRequests || 0) + 1
      };
    },
    async initialize() {
      if (window.api) {
        this.info = await window.api.getSystemInfo();
        this.modulesStatus = await window.api.getModulesStatus();
        await this.fetchMetricsNow();
        this.startPolling();
        this.isReady = true;
      }
    },
    async fetchMetricsNow() {
      if (!window.api) return;
      const fetched = await window.api.getSystemMetrics();
      this.metrics = {
        ...this.metrics,
        ...fetched,
        modelLatency: this.metrics.modelLatency
      };
      this.modulesStatus = await window.api.getModulesStatus();
    },
    async startPolling() {
      let lastPollTime = 0;
      setInterval(async () => {
        const ecoStore = useEcoStore();
        const perfStore = usePerformanceStore();
        if (!window.api) return;
        
        if (ecoStore.isThrottled || ecoStore.currentEcoState === 'hidden') {
          this.effectiveTelemetryCadence = 'PAUSED';
          return;
        }
        
        const policy = perfStore.policy;
        let interval = 10000;

        if (policy.telemetryMode === 'EVENT_DRIVEN' || policy.pollingMode === 'MINIMAL') {
          interval = 60000;
          this.effectiveTelemetryCadence = 'EVENT_DRIVEN (60s fallback)';
        } else if (policy.telemetryMode === 'THROTTLED_02HZ' || ecoStore.currentEcoState === 'idle') {
          interval = 25000;
          this.effectiveTelemetryCadence = 'THROTTLED_02HZ (25s)';
        } else {
          interval = 10000;
          this.effectiveTelemetryCadence = 'STREAMING_1HZ (10s)';
        }
        
        const now = Date.now();
        if (now - lastPollTime >= interval) {
          lastPollTime = now;
          const fetched = await window.api.getSystemMetrics();
          this.metrics = {
            ...this.metrics,
            ...fetched,
            modelLatency: this.metrics.modelLatency
          };
          this.modulesStatus = await window.api.getModulesStatus();
        }
      }, 1000);
    }
  }
});
