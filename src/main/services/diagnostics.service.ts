import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as si from 'systeminformation';
import { DatabaseService } from './database';
import { getDatabaseEngineMetadata } from './database-engine-metadata';
import type {
  DatabaseEngineCapabilities,
  DatabaseEngineType,
  StoragePersistenceStatus
} from './database-recovery.types';
import { providerManager } from './llm/providers/provider-manager';
import { logger } from '../utils/logger';
import { getRuntimeBuildMetadata, type BuildCommitSource } from '../../shared/config/build-metadata';

export interface DiagnosticsReport {
  timestamp: string;
  schemaVersion: 1;
  app: {
    version: string;
    commit: string;
    commitSource: BuildCommitSource;
    nodeVersion: string;
    chromeVersion: string;
    electronVersion: string;
    platform: string;
    arch: string;
  };
  system: {
    osRelease: string;
    cpuModel?: string;
    cpuCores?: number;
    totalMemoryMb?: number;
    freeMemoryMb?: number;
    uptimeSeconds?: number;
    gpuControllers: Array<{ model: string; vram: number | null }>;
  };
  metrics: {
    cpuLoadPercent?: number;
    ramUsedMb?: number;
    ramTotalMb?: number;
    gpuModel?: string;
    gpuTemperature?: number | null;
    vramUsedMb?: number | null;
    vramTotalMb?: number | null;
  };
  storage: {
    dbStatus: {
      mode: string;
      engine: string;
      storageStatus: string;
      readOnly: boolean;
      isSafeMode: boolean;
      schemaVersion: number;
      capabilities: DatabaseEngineCapabilities;
      limitations: string[];
    };
    counts: {
      tasks: number;
      sessions: number;
      objectives: number;
      memories: number;
    };
    launcherIndex: {
      exists: boolean;
      totalItems?: number;
      indexedAt?: string;
      sizeBytes?: number;
    };
  };
  providers: Array<{
    id: string;
    name: string;
    type: 'cloud' | 'local';
    enabled: boolean;
    model: string;
    hasApiKey: boolean;
    apiKeyStatus?: string;
  }>;
  scheduler: {
    activeTimerCount: number;
    cronCount: number;
    macrosScheduleEntries: number;
  };
  recentLogTail: string[];
}

/**
 * Mask sensitive secrets, tokens, keys and user home paths.
 */
export function maskSecrets(text: string): string {
  if (!text) return '';
  return text
    .replace(/(sk-[a-zA-Z0-9_-]{8})[a-zA-Z0-9_-]+/g, '$1***')
    .replace(/(AIza[a-zA-Z0-9_-]{6})[a-zA-Z0-9_-]+/g, '$1***')
    .replace(/(?:hf_|ghp_)[a-zA-Z0-9_-]{6,}/g, '***')
    .replace(/Bearer\s+([a-zA-Z0-9_.-]{6})[a-zA-Z0-9_.-]+/gi, 'Bearer $1***')
    .replace(/([?&](?:api[_-]?key|key|token|access[_-]?token|secret)=)([^&\s"']+)/gi, '$1***')
    .replace(/password["']?\s*[:=]\s*["']?([^"',\s}]+)/gi, 'password: ***')
    .replace(/(?:x-goog-)?(?:x-)?api[_-]?key["']?\s*[:=]\s*["']?([^"',\s}]+)/gi, 'apiKey: ***')
    .replace(/([\\/](?:Users|home)[\\/])[^\\/\s"]+/gi, '$1***');
}

/**
 * Sanitize raw log lines: strip conversation content and mask tokens.
 */
export function sanitizeLogLine(line: string): string {
  let cleaned = line;
  try {
    if (cleaned.trim().startsWith('{') && cleaned.trim().endsWith('}')) {
      const obj = JSON.parse(cleaned);
      if ('originalText' in obj) obj.originalText = '[STRIPPED]';
      if ('userText' in obj) obj.userText = '[STRIPPED]';
      if ('arcText' in obj) obj.arcText = '[STRIPPED]';
      if ('prompt' in obj) obj.prompt = '[STRIPPED]';
      cleaned = JSON.stringify(obj);
    }
  } catch (_) {
    cleaned = cleaned
      .replace(/"originalText"\s*:\s*"[^"]*"/g, '"originalText":"[STRIPPED]"')
      .replace(/"userText"\s*:\s*"[^"]*"/g, '"userText":"[STRIPPED]"')
      .replace(/"arcText"\s*:\s*"[^"]*"/g, '"arcText":"[STRIPPED]"');
  }
  return maskSecrets(cleaned);
}

export class DiagnosticsService {
  /**
   * Collect an anonymized system diagnostics report.
   */
  public static async collectReport(customUserDataDir?: string): Promise<DiagnosticsReport> {
    const userDataPath = customUserDataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : process.cwd());

    // 1. App info (strictly NO userDataPath!)
    const runtimeVersion = app && typeof app.getVersion === 'function' ? app.getVersion() : undefined;
    const buildMeta = getRuntimeBuildMetadata(runtimeVersion);
    const appInfo = {
      version: buildMeta.version,
      commit: buildMeta.commit,
      commitSource: buildMeta.commitSource,
      nodeVersion: process.versions.node || '',
      chromeVersion: process.versions.chrome || '',
      electronVersion: process.versions.electron || '',
      platform: process.platform,
      arch: process.arch
    };

    // 2. System info & Dynamic metrics
    const cpus = os.cpus();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();

    let cpuLoadPercent: number | undefined;
    let gpuModel: string | undefined;
    let gpuTemperature: number | null = null;
    let vramUsedMb: number | null = null;
    let vramTotalMb: number | null = null;
    let gpuControllers: Array<{ model: string; vram: number | null }> = [];

    try {
      const currentLoad = await si.currentLoad();
      cpuLoadPercent = Math.round(currentLoad.currentLoad * 10) / 10;
    } catch (_) {}

    try {
      const graphics = await si.graphics();
      if (Array.isArray(graphics.controllers) && graphics.controllers.length > 0) {
        gpuControllers = graphics.controllers.map(c => ({
          model: c.model || 'Unknown GPU',
          vram: typeof c.vram === 'number' && c.vram > 0 ? c.vram : null
        }));
        const primaryGpu = graphics.controllers.find(c => c.vram && c.vram > 0) || graphics.controllers[0];
        gpuModel = primaryGpu.model;
        if (primaryGpu.vram) {
          vramTotalMb = primaryGpu.vram;
        }
      }
    } catch (_) {
      gpuControllers = [];
    }

    const systemInfo = {
      osRelease: os.release(),
      cpuModel: cpus.length > 0 ? cpus[0].model : undefined,
      cpuCores: cpus.length,
      totalMemoryMb: Math.round(totalMemBytes / (1024 * 1024)),
      freeMemoryMb: Math.round(freeMemBytes / (1024 * 1024)),
      uptimeSeconds: Math.round(os.uptime()),
      gpuControllers
    };

    try {
      const temp = await si.cpuTemperature();
      if (temp.main && temp.main > 0) {
        gpuTemperature = temp.main;
      }
    } catch (_) {}

    const metrics = {
      cpuLoadPercent,
      ramUsedMb: Math.round((totalMemBytes - freeMemBytes) / (1024 * 1024)),
      ramTotalMb: Math.round(totalMemBytes / (1024 * 1024)),
      gpuModel,
      gpuTemperature,
      vramUsedMb,
      vramTotalMb
    };

    // 4. Storage & DB
    let healthStatus: any = {};
    try {
      healthStatus = DatabaseService.getHealthStatus ? DatabaseService.getHealthStatus() : {};
    } catch (_) {}

    const getTableCount = (table: string): number => {
      try {
        if (!DatabaseService.db) return 0;
        const res = DatabaseService.db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get();
        return Number(res?.n ?? 0);
      } catch (_) {
        return 0;
      }
    };

    const counts = {
      tasks: getTableCount('arc_tasks'),
      sessions: getTableCount('sessions'),
      objectives: getTableCount('arc_objectives'),
      memories: getTableCount('ltm')
    };

    // Launcher index
    const launcherIndexPath = path.join(userDataPath, 'launcher-index.json');
    let launcherIndex: { exists: boolean; totalItems?: number; indexedAt?: string; sizeBytes?: number } = { exists: false };
    if (fs.existsSync(launcherIndexPath)) {
      try {
        const stat = fs.statSync(launcherIndexPath);
        const content = JSON.parse(fs.readFileSync(launcherIndexPath, 'utf-8'));
        launcherIndex = {
          exists: true,
          totalItems: Array.isArray(content?.items) ? content.items.length : (content?.totalItems ?? 0),
          indexedAt: content?.indexedAt || content?.timestamp,
          sizeBytes: stat.size
        };
      } catch (_) {
        launcherIndex = { exists: true };
      }
    }

    const rawEngine = (healthStatus.engine || 'sqlite') as DatabaseEngineType;
    const rawStorageStatus = (
      healthStatus.storageStatus ||
      (healthStatus.isSafeMode ? 'VOLATILE_STORAGE' : 'PERSISTENT_SQLITE')
    ) as StoragePersistenceStatus;
    const engineMeta = getDatabaseEngineMetadata(rawEngine, rawStorageStatus);

    const storage = {
      dbStatus: {
        mode: healthStatus.mode || 'NORMAL',
        engine: rawEngine,
        storageStatus: rawStorageStatus,
        readOnly: Boolean(healthStatus.readOnly || healthStatus.isSafeMode),
        isSafeMode: Boolean(healthStatus.isSafeMode),
        schemaVersion: Number(healthStatus.migration?.currentVersion ?? healthStatus.schemaVersion ?? 1),
        capabilities: healthStatus.capabilities || engineMeta.capabilities,
        limitations: Array.isArray(healthStatus.limitations)
          ? healthStatus.limitations
          : engineMeta.limitations
      },
      counts,
      launcherIndex
    };

    // 5. Providers (clean list without raw keys)
    let providersList: DiagnosticsReport['providers'] = [];
    try {
      if (providerManager && typeof providerManager.getProviders === 'function') {
        const rawProviders = await providerManager.getProviders();
        providersList = rawProviders.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          enabled: Boolean(p.enabled),
          model: p.model || '',
          hasApiKey: Boolean(p.hasApiKey),
          apiKeyStatus: p.apiKeyStatus || (p.hasApiKey ? 'ok' : 'missing')
        }));
      }
    } catch (err) {
      logger.warn('[Diagnostics] Failed to collect providers:', err);
    }

    // 6. Scheduler macro triggers & schedule state entries
    const macrosDir = path.join(userDataPath, 'macros');
    let activeTimerCount = 0;
    let cronCount = 0;
    if (fs.existsSync(macrosDir)) {
      try {
        const files = fs.readdirSync(macrosDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          try {
            const macroData = JSON.parse(fs.readFileSync(path.join(macrosDir, file), 'utf-8'));
            if (macroData && macroData.enabled !== false && Array.isArray(macroData.triggers)) {
              for (const trig of macroData.triggers) {
                if (typeof trig === 'string') {
                  const trimmed = trig.trim();
                  if (/^\d{1,2}:\d{2}$/.test(trimmed)) activeTimerCount++;
                  else if (trimmed.includes('*') || trimmed.startsWith('cron:')) cronCount++;
                }
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    let macrosScheduleEntries = 0;
    const scheduleStatePath = path.join(userDataPath, 'macros-schedule-state.json');
    try {
      if (fs.existsSync(scheduleStatePath)) {
        const parsedState = JSON.parse(fs.readFileSync(scheduleStatePath, 'utf-8'));
        if (parsedState && typeof parsedState === 'object' && !Array.isArray(parsedState)) {
          macrosScheduleEntries = Object.keys(parsedState).length;
        }
      }
    } catch (_) {
      macrosScheduleEntries = 0;
    }

    // 7. Recent log tail (max 100 non-empty lines)
    const logFilePath = path.join(userDataPath, 'logs', 'dialogs', 'dialogs.log');
    let recentLogTail: string[] = [];
    if (fs.existsSync(logFilePath)) {
      try {
        const rawLogs = fs.readFileSync(logFilePath, 'utf-8');
        const lines = rawLogs.split('\n').map(l => l.trim()).filter(Boolean);
        const tail = lines.slice(-100);
        recentLogTail = tail.map(sanitizeLogLine);
      } catch (err) {
        logger.warn('[Diagnostics] Failed reading dialog log tail:', err);
      }
    }

    return {
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
      app: appInfo,
      system: systemInfo,
      metrics,
      storage,
      providers: providersList,
      scheduler: { activeTimerCount, cronCount, macrosScheduleEntries },
      recentLogTail
    };
  }

  /** Show native save dialog and write formatted report JSON. */
  public static async exportDiagnostics(
    parentWindow?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
    try {
      const report = await this.collectReport();
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `arc-diagnostics-${dateStr}.json`;

      const options = {
        title: 'Экспорт отчета диагностики A.R.C.',
        defaultPath: defaultFilename,
        filters: [{ name: 'JSON Diagnostics', extensions: ['json'] }]
      };

      const result = parentWindow && !parentWindow.isDestroyed()
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      await fs.promises.writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed to export diagnostics:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }
}
