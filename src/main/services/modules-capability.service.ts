import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import {
  MODULES_CAPABILITY_DEFINITIONS,
  PLANNED_DEFAULT_REASON,
  buildModulesCapabilitySnapshot,
  type ModuleCapability,
  type ModuleCapabilityDefinition,
  type ModulesCapabilitySnapshot,
  type ModulesStatusRequestOptions
} from '../../shared/config/modules-capability.registry';
import { DatabaseService } from './database';
import { ecoService } from './eco.service';
import { providerHealthManager } from './llm/providers/provider-health';
import { providerManager } from './llm/providers/provider-manager';
import { macroScheduler } from './macro-scheduler.service';
import { PythonServerService } from './python_server.service';
import { sttService } from './stt.service';
import { ttsService } from './tts.service';
import { skillsStore } from '../ipc/skills.ipc';
import {
  evaluateAiProviders,
  evaluateDatabaseModule,
  evaluateScenariosModule,
  evaluateSkillsModule,
  evaluateVoiceModule,
  type CapabilityProbeOutcome,
  type CapabilityRuntimeAdapters
} from './modules-capability.evaluators';

export type { CapabilityProbeOutcome, CapabilityRuntimeAdapters };

function getSafeUserDataPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // ignore outside Electron runtime
  }
  return '';
}

export function createDefaultCapabilityAdapters(): CapabilityRuntimeAdapters {
  return {
    now: () => new Date().toISOString(),
    getDbStatus: () => ({
      hasDb: Boolean(DatabaseService.db),
      status: DatabaseService.getHealthStatus()
    }),
    getProviders: () => providerManager.getProviders(),
    getProviderHealth: (id: string) => providerHealthManager.getHealth(id),
    getSttStatus: () => sttService.getStatus(),
    getTtsState: () => ttsService.getActiveEngine(),
    getPythonReadiness: (refresh?: boolean) => ({
      deps: PythonServerService.getLastDependencyReadiness?.() ?? null,
      integrity: PythonServerService.getLastIntegrityReport?.() ?? null,
      pythonPid: PythonServerService.getPythonPid?.() ?? null,
      hasLocalModel: refresh ? Boolean(PythonServerService.resolveSileroModelPath?.()) : null,
      hasPythonExe: refresh ? Boolean(PythonServerService.resolvePythonExe?.()) : null
    }),
    getSkillsSummary: () => {
      const total = skillsStore.size;
      let enabled = 0;
      for (const s of skillsStore.values()) {
        if (s.enabled) enabled++;
      }
      const userData = getSafeUserDataPath();
      const loadedFromDisk = total > 0 || (userData ? fs.existsSync(path.join(userData, 'skills.json')) : false);
      return { total, enabled, loadedFromDisk };
    },
    getMacrosSummary: () => {
      const userData = getSafeUserDataPath();
      const macrosDir = userData ? path.join(userData, 'macros') : '';
      let macrosDirAccessible = false;
      let macroCount = 0;
      if (macrosDir) {
        try {
          if (fs.existsSync(macrosDir)) {
            macrosDirAccessible = true;
            macroCount = fs.readdirSync(macrosDir).filter((f) => f.endsWith('.json')).length;
          }
        } catch {
          macrosDirAccessible = false;
        }
      }
      return {
        schedulerRunning: macroScheduler.isRunning(),
        macrosDirAccessible,
        macroCount
      };
    },
    getEcoState: () => (typeof ecoService.getState === 'function' ? ecoService.getState() : 'active'),
    getTelemetryStatus: () => {
      const totalMem = os.totalmem();
      const hasMetrics = Number.isFinite(totalMem) && totalMem > 0;
      return {
        ok: hasMetrics,
        detail: hasMetrics ? 'Сбор системных метрик ОС активен' : 'Системные метрики ОС недоступны'
      };
    }
  };
}

export class ModulesCapabilityService {
  private readonly adapters: CapabilityRuntimeAdapters;
  private lastSnapshot: ModulesCapabilitySnapshot | null = null;

  constructor(adapters: CapabilityRuntimeAdapters = createDefaultCapabilityAdapters()) {
    this.adapters = adapters;
  }

  private evaluateDefinition(
    def: ModuleCapabilityDefinition,
    checkedAt: string,
    options?: ModulesStatusRequestOptions
  ): ModuleCapability {
    if (def.lifecycleState === 'planned') {
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        subsystem: def.subsystem,
        category: def.category,
        lifecycleState: 'planned',
        availability: 'unavailable',
        health: 'unavailable',
        entrypoint: null,
        dependencies: [...def.dependencies],
        lastCheckedAt: checkedAt,
        reason: def.plannedReason || PLANNED_DEFAULT_REASON
      };
    }

    let outcome: CapabilityProbeOutcome;
    try {
      switch (def.id) {
        case 'ai-chat':
          outcome = evaluateAiProviders(this.adapters, false);
          break;
        case 'orchestrator':
          outcome = evaluateAiProviders(this.adapters, true);
          break;
        case 'memory-engine':
          outcome = evaluateDatabaseModule(this.adapters, 'Память');
          break;
        case 'tasks-engine':
          outcome = evaluateDatabaseModule(this.adapters, 'Задачи');
          break;
        case 'strategic-objectives':
          outcome = evaluateDatabaseModule(this.adapters, 'Цели');
          break;
        case 'speech-stt':
          outcome = evaluateVoiceModule(this.adapters, Boolean(options?.refresh));
          break;
        case 'skills':
          outcome = evaluateSkillsModule(this.adapters);
          break;
        case 'scenarios':
          outcome = evaluateScenariosModule(this.adapters);
          break;
        case 'observability': {
          const t = this.adapters.getTelemetryStatus();
          outcome = t.ok
            ? { availability: 'available', health: 'ready', reason: t.detail }
            : { availability: 'degraded', health: 'degraded', reason: t.detail };
          break;
        }
        case 'perf-isolation': {
          const eco = this.adapters.getEcoState();
          outcome = {
            availability: 'available',
            health: 'ready',
            reason: `Профиль энергорежима: ${eco}`
          };
          break;
        }
        default:
          outcome = {
            availability: 'unavailable',
            health: 'unknown',
            reason: 'Адаптер состояния не зарегистрирован'
          };
      }
    } catch (err: any) {
      outcome = {
        availability: 'unavailable',
        health: 'error',
        reason: `Ошибка проверки адаптера: ${err?.message || String(err)}`
      };
    }

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      subsystem: def.subsystem,
      category: def.category,
      lifecycleState: def.lifecycleState,
      availability: outcome.availability,
      health: outcome.health,
      entrypoint: def.entrypoint ? { ...def.entrypoint } : null,
      dependencies: [...def.dependencies],
      lastCheckedAt: checkedAt,
      reason: outcome.reason
    };
  }

  public getSnapshot(options?: ModulesStatusRequestOptions): ModulesCapabilitySnapshot {
    const checkedAt = this.adapters.now();
    const capabilities = MODULES_CAPABILITY_DEFINITIONS.map((def) =>
      this.evaluateDefinition(def, checkedAt, options)
    );
    const snapshot = buildModulesCapabilitySnapshot(capabilities, checkedAt);
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  public getCachedSnapshot(): ModulesCapabilitySnapshot | null {
    return this.lastSnapshot;
  }
}

export const modulesCapabilityService = new ModulesCapabilityService();
