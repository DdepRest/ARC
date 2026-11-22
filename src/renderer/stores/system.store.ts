import { defineStore } from 'pinia';
import { useEcoStore } from './eco.store';
import { usePerformanceStore } from './performance.store';
import {
  createPendingCapabilitySnapshot,
  normalizeModulesCapabilityResponse,
  type ModulesCapabilitySnapshot,
  type ModulesStatusRequestOptions
} from '../../shared/config/modules-capability.registry';

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
    capabilitiesSnapshot: createPendingCapabilitySnapshot('Ожидание проверки подсистем', 'checking', null) as ModulesCapabilitySnapshot,
    modulesStatus: {} as Record<string, string>,
    modulesLoading: false,
    modulesRefreshing: false,
    modulesError: null as string | null,
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
    applyModulesSnapshot(snapshot: ModulesCapabilitySnapshot) {
      this.capabilitiesSnapshot = snapshot;
      this.modulesStatus = { ...snapshot.legacyStatusMap };
      this.modulesError = null;
    },
    async refreshModulesStatus(options?: ModulesStatusRequestOptions): Promise<ModulesCapabilitySnapshot> {
      const isManual = Boolean(options?.refresh);
      if (isManual && this.modulesRefreshing) {
        return this.capabilitiesSnapshot;
      }
      this.modulesLoading = true;
      if (isManual) this.modulesRefreshing = true;

      try {
        if (!window.api?.getModulesStatus) {
          const browserSnap = createPendingCapabilitySnapshot(
            'IPC Electron недоступен в текущем окружении',
            'unknown',
            null
          );
          this.applyModulesSnapshot(browserSnap);
          return browserSnap;
        }
        const raw = await window.api.getModulesStatus(isManual ? { refresh: true } : undefined);
        const normalized = normalizeModulesCapabilityResponse(raw);
        if (normalized) {
          this.applyModulesSnapshot(normalized);
          return normalized;
        }
        const invalidSnap = createPendingCapabilitySnapshot(
          'Получен некорректный формат снимка модулей',
          'unknown',
          null
        );
        this.applyModulesSnapshot(invalidSnap);
        this.modulesError = 'Некорректный формат ответа system:modules';
        return invalidSnap;
      } catch (err: any) {
        const errMsg = err?.message || 'Не удалось получить статус модулей';
        const fallback = createPendingCapabilitySnapshot(errMsg, 'unknown', null);
        this.capabilitiesSnapshot = fallback;
        this.modulesStatus = { ...fallback.legacyStatusMap };
        this.modulesError = errMsg;
        return fallback;
      } finally {
        this.modulesLoading = false;
        if (isManual) this.modulesRefreshing = false;
      }
    },
    async initialize() {
      if (window.api) {
        this.info = await window.api.getSystemInfo();
        await this.refreshModulesStatus();
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
      await this.refreshModulesStatus();
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
          await this.refreshModulesStatus();
        }
      }, 1000);
    }
  }
});
