import { ipcMain, app, clipboard } from 'electron';
import * as si from 'systeminformation';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as os from 'os';
import { PythonServerService } from '../services/python_server.service';
import { sttService } from '../services/stt.service';
import { collectAppMetrics } from '../services/app-metrics.util';
import { ecoService, type EcoState } from '../services/eco.service';
import * as fs from 'fs';
import * as path from 'path';
import { getAllowedRoots, isPathAllowed } from '../services/files.service';
import { modulesCapabilityService } from '../services/modules-capability.service';
import type { ModulesStatusRequestOptions } from '../../shared/config/modules-capability.registry';

export interface PerfConfig {
  targetFps: string;
  disableVsync: boolean;
}

export function migratePerfConfig(raw: unknown): PerfConfig {
  const cfg = (raw ?? {}) as Record<string, any>;
  
  // Set defaults
  const result: PerfConfig = {
    targetFps: 'auto',
    disableVsync: false
  };

  // Force-migrate старый unlimited -> auto, 65 -> 60
  if (cfg.targetFps === 'unlimited') {
    result.targetFps = 'auto';
  } else if (cfg.targetFps === '65') {
    result.targetFps = '60';
  } else if (cfg.targetFps) {
    result.targetFps = cfg.targetFps;
  }

  // Force-migrate disableVsync: true -> false
  if (cfg.disableVsync === true) {
    result.disableVsync = false;
  } else if (typeof cfg.disableVsync === 'boolean') {
    result.disableVsync = cfg.disableVsync;
  }

  return result;
}

export function registerSystemIpc() {
  // @deprecated Legacy channel; canonical: files:list (files.service)
  ipcMain.handle('system:files', async () => {
    try {
      const roots = getAllowedRoots();
      if (!Array.isArray(roots) || roots.length === 0) {
        return [];
      }
      const targetDir = roots.find((r) => isPathAllowed(r) && fs.existsSync(r)) ?? roots[0];
      if (!targetDir || !isPathAllowed(targetDir) || !fs.existsSync(targetDir)) {
        return [];
      }
      const files = await fs.promises.readdir(targetDir);
      return files;
    } catch {
      return [];
    }
  });
  let cachedStaticSystemInfo: { os: string; distro: string; arch: string; cpu: string; cores: number } | null = null;
  let inFlightSystemInfo: Promise<{ os: string; distro: string; arch: string; cpu: string; cores: number }> | null = null;

  ipcMain.handle('system:info', async () => {
    if (!cachedStaticSystemInfo) {
      if (!inFlightSystemInfo) {
        inFlightSystemInfo = Promise.all([si.osInfo(), si.cpu()])
          .then(([osInfo, cpu]) => {
            cachedStaticSystemInfo = {
              os: osInfo.platform,
              distro: osInfo.distro,
              arch: osInfo.arch,
              cpu: `${cpu.manufacturer} ${cpu.brand}`,
              cores: cpu.cores
            };
            return cachedStaticSystemInfo;
          })
          .finally(() => {
            inFlightSystemInfo = null;
          });
      }
      await inFlightSystemInfo;
    }

    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    const base = cachedStaticSystemInfo!;

    return {
      os: base.os,
      distro: base.distro,
      arch: base.arch,
      cpu: base.cpu,
      cores: base.cores,
      memory: Math.round(totalMem / (1024 * 1024 * 1024)), // GB
      usedMemory: Math.round(usedMem / (1024 * 1024 * 1024))
    };
  });

  // Calculate CPU load average using built-in node os module for speed
  const execAsync = promisify(exec);
  let cachedVramTotalMb: number | null = null;
  let lastVramCheckTime = 0;
  let inFlightVramPromise: Promise<number | null> | null = null;

  interface HardwareTempsSnapshot {
    cpuTemp: number | null;
    gpuTemp: number | null;
    vramUsedMb: number | null;
    vramTotalMb: number | null;
    at: number;
  }

  let tempCache: HardwareTempsSnapshot | null = null;
  let inFlightTempsPromise: Promise<HardwareTempsSnapshot> | null = null;
  const TEMP_TTL_MS = 5000;

  async function readTempsCached(): Promise<HardwareTempsSnapshot> {
    const now = Date.now();
    if (tempCache && now - tempCache.at < TEMP_TTL_MS) return tempCache;
    if (inFlightTempsPromise) return inFlightTempsPromise;

    inFlightTempsPromise = (async () => {
      const [cpuRes, gpuRes] = await Promise.allSettled([
        si.cpuTemperature(),
        si.graphics(),
      ]);

      const cpuTemp =
        cpuRes.status === 'fulfilled' && typeof cpuRes.value?.main === 'number' && cpuRes.value.main > 0
          ? Math.round(cpuRes.value.main)
          : null;

      const ctrl =
        gpuRes.status === 'fulfilled' && Array.isArray(gpuRes.value?.controllers)
          ? gpuRes.value.controllers[0]
          : null;
      const gpuTemp =
        ctrl && typeof ctrl.temperatureGpu === 'number' && ctrl.temperatureGpu > 0
          ? Math.round(ctrl.temperatureGpu)
          : null;
      const vramUsedMb =
        ctrl && typeof ctrl.memoryUsed === 'number' && ctrl.memoryUsed > 0
          ? Math.round(ctrl.memoryUsed)
          : null;
      const vramTotalMb =
        ctrl && typeof ctrl.memoryTotal === 'number' && ctrl.memoryTotal > 0
          ? Math.round(ctrl.memoryTotal)
          : null;

      tempCache = { cpuTemp, gpuTemp, vramUsedMb, vramTotalMb, at: Date.now() };
      return tempCache;
    })().finally(() => {
      inFlightTempsPromise = null;
    });

    return inFlightTempsPromise;
  }

  async function checkVramTotalMb(): Promise<number | null> {
    const now = Date.now();
    if (now - lastVramCheckTime < 60000 && cachedVramTotalMb !== null) return cachedVramTotalMb;
    if (inFlightVramPromise) return inFlightVramPromise;
    lastVramCheckTime = now;

    inFlightVramPromise = (async () => {
      try {
        const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits');
        const vram = parseInt(stdout.trim());
        if (!isNaN(vram)) {
          cachedVramTotalMb = vram;
          return cachedVramTotalMb;
        }
      } catch (e) {
        if (process.platform === 'win32') {
          try {
            const { stdout } = await execAsync('wmic path win32_VideoController get AdapterRAM');
            const lines = stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.includes('AdapterRAM'));
            let maxVram = 0;
            for (const line of lines) {
              const ram = parseInt(line);
              if (!isNaN(ram) && ram > maxVram) maxVram = ram;
            }
            if (maxVram > 0) {
              cachedVramTotalMb = Math.round(maxVram / (1024 * 1024));
              return cachedVramTotalMb;
            }
          } catch (e2) {
            console.warn('Ignored error in catch', e2);
          }
        }
      }
      cachedVramTotalMb = 0;
      return 0;
    })().finally(() => {
      inFlightVramPromise = null;
    });

    return inFlightVramPromise;
  }

  let previousCpuTimes = os.cpus().map(core => core.times);

  let prevNetworkStats: any = null;
  let prevNetTime = Date.now();
  let cachedNetRx = 0;
  let cachedNetTx = 0;

  // Background non-blocking network stats collector adapting to eco state (single-flight guarded)
  let networkPollerTimeout: NodeJS.Timeout | null = null;
  let isPollingNetwork = false;

  async function pollNetworkStats() {
    if (isPollingNetwork) return;
    isPollingNetwork = true;
    try {
      const stats = await si.networkStats();
      if (stats && stats.length > 0) {
        const primary = stats[0];
        const now = Date.now();
        const duration = (now - prevNetTime) / 1000;
        if (duration > 0 && prevNetworkStats) {
          cachedNetRx = Math.max(0, Math.round((primary.rx_bytes - prevNetworkStats.rx_bytes) / (1024 * duration)));
          cachedNetTx = Math.max(0, Math.round((primary.tx_bytes - prevNetworkStats.tx_bytes) / (1024 * duration)));
        }
        prevNetworkStats = primary;
        prevNetTime = now;
      }
    } catch (e) {
      console.warn('[A.R.C] Handled silent error in networkStats:', e);
    } finally {
      isPollingNetwork = false;
      if (networkPollerTimeout) clearTimeout(networkPollerTimeout);
      const intervalMs = Math.max(ecoService.getIntervalMs(), 10000);
      networkPollerTimeout = setTimeout(pollNetworkStats, intervalMs);
    }
  }

  // Start initial polling
  pollNetworkStats();

  ecoService.on('state-change', () => {
    if (networkPollerTimeout && !isPollingNetwork) {
      clearTimeout(networkPollerTimeout);
      const intervalMs = Math.max(ecoService.getIntervalMs(), 10000);
      networkPollerTimeout = setTimeout(pollNetworkStats, intervalMs);
    }
  });

  ipcMain.on('eco:set-state', (_event, state: EcoState, reason?: string) => {
    PythonServerService.setEcoState(state, reason || 'ipc:eco:set-state');
  });

  ipcMain.on('system:eco-state', (_event, state, reason?: string) => {
    PythonServerService.setEcoState(state as EcoState, reason || 'ipc:system:eco-state');
  });

  ipcMain.handle('system:metrics', async () => {
    // Determine memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = Math.round((usedMem / totalMem) * 100);

    // Determine CPU load smoothly without spawning wmic/child processes
    const currentCpuTimes = os.cpus().map(core => core.times);
    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < currentCpuTimes.length; i++) {
        const prev = previousCpuTimes[i];
        const curr = currentCpuTimes[i];

        const idleDiff = curr.idle - prev.idle;
        const tickDiff = (curr.user + curr.nice + curr.sys + curr.idle + curr.irq) - 
                         (prev.user + prev.nice + prev.sys + prev.idle + prev.irq);

        totalIdle += idleDiff;
        totalTick += tickDiff;
    }

    const cpuLoad = totalTick > 0 ? Math.round(100 - (100 * totalIdle / totalTick)) : 0;
    previousCpuTimes = currentCpuTimes;

    const memoryUsedMb = Math.round(usedMem / (1024 * 1024));
    const memoryTotalMb = Math.round(totalMem / (1024 * 1024));

    const temps = await readTempsCached();
    const fallbackVramTotal = temps.vramTotalMb ?? (await checkVramTotalMb());

    const appMetrics = collectAppMetrics({
      getAppMetrics: () => (app?.getAppMetrics ? app.getAppMetrics() : []),
      pythonPid: typeof PythonServerService.getPythonPid === 'function' ? PythonServerService.getPythonPid() : null,
      sttPid: typeof sttService?.getWorkerPid === 'function' ? sttService.getWorkerPid() : null
    });

    return {
      cpuLoad,
      memoryUsage,
      memoryUsedMb,
      memoryTotalMb,
      vramUsedMb: temps.vramUsedMb,
      vramTotalMb: fallbackVramTotal,
      temperature: temps.cpuTemp,
      cpuTemperature: temps.cpuTemp,
      gpuTemperature: temps.gpuTemp,
      networkRx: cachedNetRx,
      networkTx: cachedNetTx,
      uptime: os.uptime(),
      appMemoryMb: appMetrics.appMemoryMb,
      appProcesses: appMetrics.appProcesses
    };
  });

  ipcMain.handle('system:modules', async (_event, options?: ModulesStatusRequestOptions) => {
    return modulesCapabilityService.getSnapshot(options);
  });

  function getPerfConfigPath() {
    try {
      return path.join(app.getPath('userData'), 'arc-performance-settings.json');
    } catch {
      return path.join(os.homedir(), '.arc-performance-settings.json');
    }
  }

  ipcMain.handle('system:save-perf-config', async (_event, config) => {
    try {
      const configPath = getPerfConfigPath();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('[FPS Config] Error saving perf config:', err);
      return { success: false, error: String(err) };
    }
  });

  const handleWriteClipboard = async (_event: any, text: string) => {
    try {
      if (typeof text === 'string') {
        clipboard.writeText(text);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Clipboard] Failed to write text:', err);
      return false;
    }
  };

  ipcMain.handle('system:write-clipboard', handleWriteClipboard);
  ipcMain.handle('clipboard:writeText', handleWriteClipboard);

  ipcMain.handle('system:load-perf-config', async () => {
    try {
      const configPath = getPerfConfigPath();
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        return migratePerfConfig(JSON.parse(fileContent));
      }
    } catch (err) {
      console.error('[FPS Config] Error loading perf config:', err);
    }
    return migratePerfConfig(null);
  });
}
