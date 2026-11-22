import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: {
    getAllWindows: () => []
  }
}));

import { DatabaseService } from '../database';
import { ObjectiveEngine } from './ObjectiveEngine';
import { decisionEngine } from '../decision/DecisionEngine';
import { tasksService } from '../tasks.service';
import { objectiveDecomposerService } from './objective-decomposer.service';
import type { DecompositionDraft } from './decomposition-validator';

describe('ObjectiveEngine Decomposition (DRAFT + Approve, Idempotency)', () => {
  let engine: ObjectiveEngine;

  beforeAll(() => {
    DatabaseService.init();
    engine = ObjectiveEngine.getInstance();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates pre-defined DRAFT for first system self-objective without modifying DB', async () => {
    const obj = engine.createObjective(
      'Transform A.R.C. into Objective-driven OS',
      'System self-evolution goal',
      'SYSTEM_AUTO',
      1000
    );

    const draft = await engine.decomposeObjectiveDraft(obj.id);
    expect(draft).toBeDefined();
    expect(draft.objectiveId).toBe(obj.id);
    expect(draft.source).toBe('fallback');
    expect(draft.outcomes.length).toBeGreaterThan(0);
    expect(draft.decisions.length).toBeGreaterThan(0);
    expect(draft.tasks.length).toBeGreaterThan(0);
    expect(draft.risks.length).toBeGreaterThan(0);

    // Verify DRAFT phase does NOT write outcomes or decisions into DB yet
    const loaded = engine.getObjective(obj.id);
    expect(loaded?.outcomes || []).toHaveLength(0);
    expect(loaded?.risks || []).toHaveLength(0);
    expect(decisionEngine.getDecisionsByObjective(obj.id)).toHaveLength(0);
  });

  it('generates DRAFT via objectiveDecomposerService for regular objective', async () => {
    const obj = engine.createObjective(
      'Optimize Database Cache Layer',
      'Improve query latency through memory caching',
      'CHAIRMAN',
      500
    );

    const sampleDraft: DecompositionDraft = {
      objectiveId: obj.id,
      source: 'ai',
      outcomes: [
        {
          title: 'Achieve sub-5ms latency for cached queries',
          metric_name: 'cache_latency',
          metric_source: { type: 'CLI_OUTPUT', target_uri: 'npm test' },
          baseline_value: 25,
          target_value: 5
        }
      ],
      decisions: [
        {
          title: 'Integrate LRU cache provider',
          rationale: 'LRU bounds memory consumption while accelerating lookups',
          action: { type: 'CLI_CMD', target: 'system', cmd: 'npm test' }
        }
      ],
      tasks: [
        { text: 'Implement LRU cache adapter in DatabaseService', estimatedMinutes: 40, priority: 'high' }
      ],
      risks: [
        { description: 'Memory pressure under burst read spikes', likelihood: 0.3, impact: 0.5 }
      ],
      createdAt: Date.now()
    };

    vi.spyOn(objectiveDecomposerService, 'generateDraft').mockResolvedValueOnce(sampleDraft);

    const draft = await engine.decomposeObjectiveDraft(obj.id, 'Task description');
    expect(draft.source).toBe('ai');
    expect(draft.outcomes[0].title).toBe('Achieve sub-5ms latency for cached queries');
  });

  it('approveDecompositionDraft commits all draft items and is strictly idempotent', async () => {
    const obj = engine.createObjective(
      'Idempotency Verification Goal',
      'Test duplicate prevention and commit accounting',
      'CHAIRMAN',
      200
    );

    const sampleDraft: DecompositionDraft = {
      objectiveId: obj.id,
      source: 'ai',
      outcomes: [
        {
          title: 'Verify zero duplicate insertions',
          metric_name: 'dedup_check',
          metric_source: { type: 'CLI_OUTPUT', target_uri: 'npm test' },
          baseline_value: 0,
          target_value: 1
        }
      ],
      decisions: [
        {
          title: 'Enforce normalized string deduplication',
          rationale: 'Prevent duplicate outcomes, decisions and tasks on re-approval',
          action: { type: 'CLI_CMD', target: 'system', cmd: 'npm test' }
        }
      ],
      tasks: [
        { text: 'Add deduplication tests for decomposition approve', estimatedMinutes: 25, priority: 'medium' }
      ],
      risks: [
        { description: 'False positive collisions with very short titles', likelihood: 0.1, impact: 0.3 }
      ],
      createdAt: Date.now()
    };

    // First Approve
    const firstResult = await engine.approveDecompositionDraft(obj.id, sampleDraft);
    expect(firstResult.committed.outcomes).toBe(1);
    expect(firstResult.committed.decisions).toBe(1);
    expect(firstResult.committed.tasks).toBe(1);
    expect(firstResult.committed.risks).toBe(1);
    expect(firstResult.totalCommitted).toBe(4);

    const firstLoaded = engine.getObjective(obj.id);
    expect(firstLoaded).not.toBeNull();
    expect(firstLoaded!.outcomes).toHaveLength(1);
    expect(firstLoaded!.risks).toHaveLength(1);
    expect(decisionEngine.getDecisionsByObjective(obj.id)).toHaveLength(1);
    const dbTasksAfterFirst = tasksService.getAllTasks().filter(t => t.objectiveId === obj.id);
    expect(dbTasksAfterFirst).toHaveLength(1);

    // Second Approve with identical draft (IDEMPOTENCY)
    const secondResult = await engine.approveDecompositionDraft(obj.id, sampleDraft);
    expect(secondResult.committed.outcomes).toBe(0);
    expect(secondResult.committed.decisions).toBe(0);
    expect(secondResult.committed.tasks).toBe(0);
    expect(secondResult.committed.risks).toBe(0);
    expect(secondResult.totalCommitted).toBe(0);

    // Verify still exactly 1 entry each
    const secondLoaded = engine.getObjective(obj.id);
    expect(secondLoaded!.outcomes).toHaveLength(1);
    expect(secondLoaded!.risks).toHaveLength(1);
    expect(decisionEngine.getDecisionsByObjective(obj.id)).toHaveLength(1);
    const dbTasksAfterSecond = tasksService.getAllTasks().filter(t => t.objectiveId === obj.id);
    expect(dbTasksAfterSecond).toHaveLength(1);
  });

  it('manages pendingDrafts queue lifecycle and clears draft upon approval', async () => {
    const obj = engine.createObjective(
      'Pending Draft Queue Verification',
      'Test pending drafts map and clearing',
      'CHAIRMAN',
      100
    );

    const sampleDraft: DecompositionDraft = {
      objectiveId: obj.id,
      source: 'ai',
      outcomes: [
        {
          title: 'Pending test outcome',
          metric_name: 'm_pending',
          metric_source: { type: 'CLI_OUTPUT', target_uri: 'npm test' },
          baseline_value: 0,
          target_value: 1
        }
      ],
      decisions: [],
      tasks: [],
      risks: [],
      createdAt: Date.now()
    };

    expect(engine.getPendingDraft(obj.id)).toBeUndefined();

    engine.setPendingDraft(sampleDraft);
    expect(engine.getPendingDraft(obj.id)).toEqual(sampleDraft);

    // approveDecompositionDraft should clear the pending draft
    await engine.approveDecompositionDraft(obj.id, sampleDraft);
    expect(engine.getPendingDraft(obj.id)).toBeUndefined();
  });

  it('backward-compatibility wrapper decomposeObjective executes draft + approve', async () => {
    const obj = engine.createObjective(
      'Legacy Caller Objective',
      'Verify legacy callers continue to work seamlessly',
      'CHAIRMAN',
      300
    );

    await engine.decomposeObjective(obj.id, 'Legacy task context');

    const loaded = engine.getObjective(obj.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.outcomes?.length ?? 0).toBeGreaterThan(0);
    expect(loaded!.risks?.length ?? 0).toBeGreaterThan(0);
    const decisions = decisionEngine.getDecisionsByObjective(obj.id);
    expect(decisions.length).toBeGreaterThan(0);
  });
});
