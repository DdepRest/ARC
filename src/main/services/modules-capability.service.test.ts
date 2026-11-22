import { describe, it, expect, vi } from 'vitest';
import {
  MODULES_CAPABILITY_DEFINITIONS,
  buildModulesCapabilitySnapshot,
  createPendingCapabilitySnapshot
} from '../../shared/config/modules-capability.registry';
import {
  ModulesCapabilityService,
  type CapabilityRuntimeAdapters
} from './modules-capability.service';
import type { DatabaseHealthStatus } from './database-recovery.types';
import type { DependencyCheckResult } from './python_deps.contract';

function makeHealthyAdapters(overrides: Partial<CapabilityRuntimeAdapters> = {}): CapabilityRuntimeAdapters {
  const dbStatus: DatabaseHealthStatus = {
    mode: 'NORMAL',
    isSafeMode: false,
    readOnly: false,
    storageStatus: 'PERSISTENT_SQLITE',
    engine: 'sqlite',
    dbPath: '/tmp/arc.db',
    schemaVersion: 8,
    capabilities: {
      persistent: true,
      supportsTransactions: true,
      supportsRollback: true,
      supportsFts5: true,
      supportsForeignKeys: true,
      supportsSqlIndexes: true
    },
    limitations: [],
    timestamp: '2026-11-19T12:00:00.000Z'
  };

  const pyDeps: DependencyCheckResult = {
    success: true,
    state: 'READY',
    phase: 'READY',
    coreReady: true,
    dspReady: true,
    accentReady: true,
    ffmpegReady: true,
    pythonRuntime: {
      executable: 'python3',
      version: '3.11.0',
      major: 3,
      minor: 11,
      arch: '64bit',
      platform: 'linux',
      supported: true,
      pipAvailable: true,
      warnings: []
    },
    installedPackages: ['torch', 'silero'],
    missingCore: [],
    missingOptional: [],
    errors: []
  };

  return {
    now: () => '2026-11-19T12:00:00.000Z',
    getDbStatus: () => ({ hasDb: true, status: dbStatus }),
    getProviders: () => [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'cloud',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-2.5-flash',
        priority: 1,
        apiKey: '••••••••',
        hasApiKey: true,
        apiKeyStatus: 'ok',
        maxTokens: 2048,
        temperature: 0.7,
        enabled: true
      }
    ],
    getProviderHealth: () => ({
      healthy: true,
      lastFailAt: 0,
      failCount: 0,
      consecutiveFails: 0,
      inCooldownUntil: 0,
      inQuarantineUntil: 0
    }),
    getSttStatus: () => ({
      ready: true,
      modelLoaded: true,
      engine: 'gigaam',
      activeEngine: 'gigaam',
      lastError: null,
      modelsInstalled: true,
      missingReason: null,
      setupState: 'ready'
    }),
    getTtsState: () => ({
      provider: 'auto',
      activeEngine: 'silero',
      allowCloudTtsFallback: false,
      forcedOfflineMode: false,
      fallbackPolicy: 'local-only',
      lastErrorReason: null
    }),
    getPythonReadiness: () => ({
      deps: pyDeps,
      integrity: { state: 'READY', verifiedAt: '2026-11-19T12:00:00.000Z', failedFiles: [] },
      pythonPid: 1234,
      hasLocalModel: null,
      hasPythonExe: null
    }),
    getSkillsSummary: () => ({ total: 4, enabled: 4, loadedFromDisk: true }),
    getMacrosSummary: () => ({ schedulerRunning: true, macrosDirAccessible: true, macroCount: 2 }),
    getEcoState: () => 'active',
    getTelemetryStatus: () => ({ ok: true, detail: 'Сбор системных метрик ОС активен' }),
    ...overrides
  };
}

describe('S3-04: ModulesCapabilityService & Shared Registry', () => {
  it('1. Canonical definitions have unique IDs, complete metadata, and planned items never have ready state or entrypoint', () => {
    const ids = MODULES_CAPABILITY_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(14);

    const plannedIds = ['agents', 'tools-mcp', 'architecture', 'sandbox'];
    for (const pid of plannedIds) {
      const def = MODULES_CAPABILITY_DEFINITIONS.find((d) => d.id === pid);
      expect(def).toBeDefined();
      expect(def?.lifecycleState).toBe('planned');
      expect(def?.entrypoint).toBeNull();
    }

    // Even if someone passes tampered planned status to buildModulesCapabilitySnapshot, invariants enforce planned -> unavailable
    const tampered = buildModulesCapabilitySnapshot([
      {
        id: 'agents',
        name: 'Автономные агенты',
        description: 'test',
        subsystem: 'Agent Swarm',
        category: 'roadmap',
        lifecycleState: 'planned',
        availability: 'available',
        health: 'ready',
        entrypoint: { tab: 'chat' },
        dependencies: ['agent-swarm-runtime'],
        lastCheckedAt: '2026-11-19T00:00:00.000Z',
        reason: null
      }
    ]);
    expect(tampered.capabilities[0].health).toBe('unavailable');
    expect(tampered.capabilities[0].availability).toBe('unavailable');
    expect(tampered.capabilities[0].entrypoint).toBeNull();
  });

  it('2. Produces truthful ready snapshot when all implemented adapters are healthy and keeps planned items unavailable', () => {
    const service = new ModulesCapabilityService(makeHealthyAdapters());
    const snap = service.getSnapshot();

    expect(snap.schemaVersion).toBe(1);
    expect(snap.checkedAt).toBe('2026-11-19T12:00:00.000Z');
    expect(snap.summary.total).toBe(14);
    expect(snap.summary.implemented).toBe(10);
    expect(snap.summary.planned).toBe(4);
    expect(snap.summary.ready).toBe(10);
    expect(snap.summary.unavailable).toBe(4);
    expect(snap.legacyStatusMap).toEqual({
      Assistant: 'Active',
      Voice: 'Active',
      Memory: 'Active',
      Tasks: 'Active'
    });

    for (const id of ['agents', 'tools-mcp', 'architecture', 'sandbox']) {
      const cap = snap.capabilities.find((c) => c.id === id)!;
      expect(cap.lifecycleState).toBe('planned');
      expect(cap.health).toBe('unavailable');
      expect(cap.availability).toBe('unavailable');
      expect(cap.entrypoint).toBeNull();
      expect(cap.reason).toContain('v1.1');
    }
  });

  it('3. Reflects DB_SAFE_MODE and JSON fallback across Memory, Tasks, and Objectives without false green', () => {
    const safeAdapters = makeHealthyAdapters({
      getDbStatus: () => ({
        hasDb: true,
        status: {
          mode: 'DB_SAFE_MODE',
          isSafeMode: true,
          readOnly: true,
          storageStatus: 'VOLATILE_STORAGE',
          engine: 'json-safe-mode',
          errorCode: 'SQLITE_SCHEMA_DRIFT',
          dbPath: '',
          capabilities: {
            persistent: false,
            supportsTransactions: false,
            supportsRollback: false,
            supportsFts5: false,
            supportsForeignKeys: false,
            supportsSqlIndexes: false
          },
          limitations: ['read-only'],
          timestamp: '2026-11-19T12:00:00.000Z'
        }
      })
    });

    const snap = new ModulesCapabilityService(safeAdapters).getSnapshot();
    for (const id of ['memory-engine', 'tasks-engine', 'strategic-objectives']) {
      const cap = snap.capabilities.find((c) => c.id === id)!;
      expect(cap.health).toBe('degraded');
      expect(cap.availability).toBe('degraded');
      expect(cap.reason).toContain('DB_SAFE_MODE');
    }
    expect(snap.legacyStatusMap.Memory).toBe('Degraded');
    expect(snap.legacyStatusMap.Tasks).toBe('Degraded');
  });

  it('4. Reflects missing API keys and quarantined AI providers accurately', () => {
    const noKeysService = new ModulesCapabilityService(
      makeHealthyAdapters({
        getProviders: () => [
          {
            id: 'openrouter',
            name: 'OpenRouter',
            type: 'cloud',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'google/gemini-2.5-flash',
            priority: 1,
            apiKey: '',
            hasApiKey: false,
            apiKeyStatus: 'missing',
            maxTokens: 2048,
            temperature: 0.7,
            enabled: true
          }
        ]
      })
    );
    const noKeysSnap = noKeysService.getSnapshot();
    expect(noKeysSnap.capabilities.find((c) => c.id === 'ai-chat')?.health).toBe('unavailable');
    expect(noKeysSnap.capabilities.find((c) => c.id === 'orchestrator')?.health).toBe('unavailable');
    expect(noKeysSnap.legacyStatusMap.Assistant).toBe('Unavailable');

    const allQuarantinedService = new ModulesCapabilityService(
      makeHealthyAdapters({
        getProviderHealth: () => ({
          healthy: false,
          lastFailAt: Date.now(),
          failCount: 3,
          consecutiveFails: 3,
          inCooldownUntil: 0,
          inQuarantineUntil: Date.now() + 60_000
        })
      })
    );
    const qSnap = allQuarantinedService.getSnapshot();
    expect(qSnap.capabilities.find((c) => c.id === 'ai-chat')?.health).toBe('error');
    expect(qSnap.legacyStatusMap.Assistant).toBe('Error');
  });

  it('5. Reflects Voice missing STT models, DEGRADED Python deps, and forwards manual refresh flag', () => {
    const getPythonReadiness = vi.fn((refresh?: boolean) => ({
      deps: {
        success: true,
        state: 'DEGRADED' as const,
        phase: 'DEGRADED' as const,
        reason: 'import_check_failed' as const,
        coreReady: true,
        dspReady: false,
        accentReady: false,
        ffmpegReady: false,
        pythonRuntime: {
          executable: 'python3',
          version: '3.11.0',
          major: 3,
          minor: 11,
          arch: '64bit',
          platform: 'linux',
          supported: true,
          pipAvailable: true,
          warnings: []
        },
        installedPackages: ['torch'],
        missingCore: [],
        missingOptional: ['ruaccent'],
        errors: ['missing ruaccent']
      },
      integrity: null,
      pythonPid: null,
      hasLocalModel: refresh ? false : null,
      hasPythonExe: refresh ? false : null
    }));

    const service = new ModulesCapabilityService(
      makeHealthyAdapters({
        getSttStatus: () => ({
          ready: false,
          modelLoaded: false,
          engine: 'gigaam',
          activeEngine: 'none',
          lastError: null,
          modelsInstalled: false,
          missingReason: 'consent_required',
          setupState: 'consent_required'
        }),
        getTtsState: () => ({
          provider: 'auto',
          activeEngine: null,
          allowCloudTtsFallback: false,
          forcedOfflineMode: false,
          fallbackPolicy: 'local-only',
          lastErrorReason: null
        }),
        getPythonReadiness
      })
    );

    const pollSnap = service.getSnapshot();
    expect(getPythonReadiness).toHaveBeenCalledWith(false);
    expect(pollSnap.capabilities.find((c) => c.id === 'speech-stt')?.health).toBe('unavailable');
    expect(pollSnap.legacyStatusMap.Voice).toBe('Unavailable');

    service.getSnapshot({ refresh: true });
    expect(getPythonReadiness).toHaveBeenLastCalledWith(true);
  });

  it('6. Isolates exceptions thrown by an individual adapter without crashing the snapshot', () => {
    const service = new ModulesCapabilityService(
      makeHealthyAdapters({
        getSkillsSummary: () => {
          throw new Error('skills.json permission denied');
        }
      })
    );

    const snap = service.getSnapshot();
    const skillsCap = snap.capabilities.find((c) => c.id === 'skills')!;
    expect(skillsCap.health).toBe('error');
    expect(skillsCap.reason).toContain('skills.json permission denied');
    expect(snap.capabilities.find((c) => c.id === 'tasks-engine')?.health).toBe('ready');
  });

  it('7. createPendingCapabilitySnapshot never emits fake online/ready states', () => {
    const pending = createPendingCapabilitySnapshot('IPC недоступен', 'unknown', null);
    expect(pending.summary.ready).toBe(0);
    expect(pending.summary.unknown).toBe(10);
    expect(pending.summary.planned).toBe(4);
    expect(pending.legacyStatusMap.Assistant).toBe('Idle');
  });
});
