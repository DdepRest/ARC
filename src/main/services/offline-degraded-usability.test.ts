import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ModulesCapabilityService,
  type CapabilityRuntimeAdapters
} from './modules-capability.service';
import type { DatabaseHealthStatus } from './database-recovery.types';
import {
  resolveTtsExecutionPlan,
  resolveTtsFallbackPolicy,
  type TtsPolicyConfig
} from './tts-policy.util';
import { providerHealthManager } from './llm/providers/provider-health';
import { ObjectiveDecomposerService } from './objective/objective-decomposer.service';
import { aiService } from './ai.service';

function createPersistentDbStatus(): DatabaseHealthStatus {
  return {
    mode: 'NORMAL',
    isSafeMode: false,
    readOnly: false,
    storageStatus: 'PERSISTENT_SQLITE',
    engine: 'sqlite',
    dbPath: '/mock/userData/arc.db',
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
    timestamp: '2026-11-21T00:00:00.000Z'
  };
}

describe('Offline & Degraded Usability Contract (Audit §11 / TZ §12.2)', () => {
  beforeEach(() => {
    providerHealthManager.resetAll();
  });

  afterEach(() => {
    providerHealthManager.resetAll();
    vi.restoreAllMocks();
  });

  it('keeps local SQLite-backed modules ready when AI providers and Voice services are completely offline', () => {
    // Simulate network outage across all configured cloud AI providers -> quarantined
    providerHealthManager.markFailure('openrouter', false, true);
    providerHealthManager.markFailure('openrouter', false, true);
    providerHealthManager.markFailure('openrouter', false, true);
    expect(providerHealthManager.isQuarantined('openrouter')).toBe(true);

    const offlineAdapters: CapabilityRuntimeAdapters = {
      now: () => '2026-11-21T00:00:00.000Z',
      getDbStatus: () => ({ hasDb: true, status: createPersistentDbStatus() }),
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
      getProviderHealth: (id) => providerHealthManager.getHealth(id),
      getSttStatus: () => ({
        ready: false,
        modelLoaded: false,
        engine: 'gigaam',
        activeEngine: 'none',
        lastError: null,
        modelsInstalled: false,
        missingReason: 'Локальные модели STT ещё не скачаны',
        setupState: 'missing'
      }),
      getTtsState: () => ({
        provider: 'auto',
        activeEngine: 'unavailable',
        allowCloudTtsFallback: false,
        forcedOfflineMode: true,
        fallbackPolicy: 'offline-locked',
        lastErrorReason: 'Silero сервер недоступен; SAPI недоступен'
      }),
      getPythonReadiness: () => ({
        deps: null,
        integrity: null,
        pythonPid: null,
        hasLocalModel: false,
        hasPythonExe: false
      }),
      getSkillsSummary: () => ({ total: 3, enabled: 3, loadedFromDisk: true }),
      getMacrosSummary: () => ({ schedulerRunning: true, macrosDirAccessible: true, macroCount: 1 }),
      getEcoState: () => 'active',
      getTelemetryStatus: () => ({ ok: true, detail: 'Сбор системных метрик ОС активен' })
    };

    const snap = new ModulesCapabilityService(offlineAdapters).getSnapshot();

    // Offline AI & Voice must truthfully report non-ready states (no false green)
    expect(snap.capabilities.find((c) => c.id === 'ai-chat')?.health).toBe('error');
    expect(snap.capabilities.find((c) => c.id === 'orchestrator')?.health).toBe('error');
    expect(snap.capabilities.find((c) => c.id === 'speech-stt')?.health).toBe('unavailable');
    expect(snap.legacyStatusMap.Assistant).toBe('Error');
    expect(snap.legacyStatusMap.Voice).toBe('Unavailable');

    // Local workspaces & core subsystems remain fully usable (ready) offline
    for (const localId of [
      'memory-engine',
      'tasks-engine',
      'strategic-objectives',
      'skills',
      'scenarios',
      'observability',
      'perf-isolation'
    ]) {
      const cap = snap.capabilities.find((c) => c.id === localId);
      expect(cap?.health).toBe('ready');
      expect(cap?.availability).toBe('available');
    }
    expect(snap.legacyStatusMap.Memory).toBe('Active');
    expect(snap.legacyStatusMap.Tasks).toBe('Active');

    // Planned v1.1 modules stay unavailable regardless of offline state
    for (const plannedId of ['agents', 'tools-mcp', 'architecture', 'sandbox']) {
      expect(snap.capabilities.find((c) => c.id === plannedId)?.health).toBe('unavailable');
    }
  });

  it('degrades task and objective decomposition to explicitly attributed local_template when AI network fails or times out', async () => {
    const decomposer = ObjectiveDecomposerService.getInstance();

    // Case 1: Network DNS / offline error
    vi.spyOn(aiService, 'request').mockRejectedValueOnce(new Error('ENOTFOUND api.openrouter.ai'));
    const offlineTaskRes = await decomposer.decomposeTask('Проверить безопасность локального хранилища');
    expect(offlineTaskRes.source).toBe('local_template');
    expect(offlineTaskRes.fallbackReason).toBe('llm_error');
    expect(offlineTaskRes.steps.length).toBeGreaterThanOrEqual(3);
    expect(offlineTaskRes.steps.every((s) => s.includes('Локальный шаблон — ИИ офлайн'))).toBe(true);

    // Case 2: Slow network timeout
    vi.spyOn(aiService, 'request').mockRejectedValueOnce(new Error('LLM request timed out after 30000ms'));
    const timeoutTaskRes = await decomposer.decomposeTask('Оптимизировать скорость загрузки');
    expect(timeoutTaskRes.source).toBe('local_template');
    expect(timeoutTaskRes.fallbackReason).toBe('llm_timeout');
    expect(timeoutTaskRes.steps.length).toBeGreaterThanOrEqual(3);

    // Case 3: Objective decomposition offline fallback returns valid structured draft
    vi.spyOn(aiService, 'request').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const objDraft = await decomposer.generateDraft('obj-offline-1', 'Подготовить офлайн-релиз');
    expect(objDraft.source).toBe('fallback');
    expect(objDraft.outcomes.length).toBeGreaterThan(0);
    expect(objDraft.tasks.length).toBeGreaterThan(0);
  });

  it('blocks cloud Edge TTS egress in forcedOfflineMode across all provider settings', () => {
    const providers: Array<TtsPolicyConfig['provider']> = ['auto', 'silero', 'edge', 'native'];

    for (const provider of providers) {
      const policy: TtsPolicyConfig = {
        provider,
        allowCloudTtsFallback: true,
        forcedOfflineMode: true
      };
      expect(resolveTtsFallbackPolicy(policy)).toBe('offline-locked');
      const plan = resolveTtsExecutionPlan(policy);
      expect(plan.cloudAllowed).toBe(false);
      expect(plan.steps).not.toContain('edge');
      expect(plan.steps).toContain('system');
      if (provider === 'native') {
        expect(plan.cloudBlockedReason).toBeNull();
      } else {
        expect(plan.cloudBlockedReason).toContain('офлайн');
      }
    }
  });

  it('quarantines unreachable provider after 3 network failures and recovers automatically after quarantine expires', () => {
    vi.useFakeTimers();
    try {
      const base = new Date('2026-11-21T10:00:00.000Z');
      vi.setSystemTime(base);

      providerHealthManager.markFailure('gemini', false, true);
      expect(providerHealthManager.getHealth('gemini').healthy).toBe(false);
      expect(providerHealthManager.isQuarantined('gemini')).toBe(false);

      providerHealthManager.markFailure('gemini', false, true);
      providerHealthManager.markFailure('gemini', false, true);
      expect(providerHealthManager.isQuarantined('gemini')).toBe(true);

      // Advance past 10-minute quarantine window -> automatic recovery
      vi.setSystemTime(new Date(base.getTime() + 10 * 60 * 1000 + 1000));
      expect(providerHealthManager.isQuarantined('gemini')).toBe(false);
      expect(providerHealthManager.getHealth('gemini').healthy).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
