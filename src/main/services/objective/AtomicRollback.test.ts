import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const mockTables = vi.hoisted(() => ({
  arc_objectives: [],
  arc_decisions: [],
  arc_actions: [],
  behavioral_events: [],
  arc_coherence_history: [],
  arc_outcomes: [],
  arc_objective_risks: [],
  arc_objective_dependencies: [],
}));

vi.mock('../ai.service', () => ({
  aiService: {
    generateTasks: vi.fn(),
  },
}));



import { DatabaseService } from '../database';
import { ObjectiveEngine, ObjectiveStatus } from './ObjectiveEngine';

describe('Atomic Rollback System Integration Tests', () => {
  let tempWorkspace: string;
  let backupDir: string;
  let engine: ObjectiveEngine;

  beforeAll(async () => {
  
    tempWorkspace = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-workspace-rollback-'));
    backupDir = path.join(os.homedir(), '.arc', 'backups');
    await fsp.mkdir(backupDir, { recursive: true });
    
    engine = ObjectiveEngine.getInstance();
  });

  beforeEach(() => {
    (DatabaseService as any).db = {
      prepare(sql: string) {
        const normalized = sql.trim().replace(/\s+/g, ' ');
        return {
          run(...args: any[]) {
            if (normalized.includes('UPDATE arc_objectives SET status = ? WHERE id = ?')) {
                const o = mockTables.arc_objectives.find((x: any) => x.id === args[1]);
                if (o) (o as any).status = args[0];
            } else if (normalized.includes('UPDATE arc_decisions SET status = \'ROLLED_BACK\'')) {
                mockTables.arc_decisions.forEach((d: any) => {
                    if (args.includes(d.id)) d.status = 'ROLLED_BACK';
                });
            } else if (normalized.includes('UPDATE arc_actions SET status = \'ROLLED_BACK\'')) {
                mockTables.arc_actions.forEach((a: any) => {
                    if (args.includes(a.id)) a.status = 'ROLLED_BACK';
                });
            } else if (normalized.includes('INSERT INTO behavioral_events')) {
                mockTables.behavioral_events.push(args as never);
            } else if (normalized.includes('INSERT INTO arc_coherence_history')) {
                mockTables.arc_coherence_history.push(args as never);
            }
            return { changes: 1 };
          },
          get(...args: any[]) {
            if (normalized.includes('FROM arc_objectives WHERE id = ?')) {
                return mockTables.arc_objectives.find((o: any) => o.id === args[0]);
            }
            return undefined;
          },
          all(...args: any[]) {
            if (normalized.includes('FROM arc_decisions WHERE objective_id = ?')) {
                return mockTables.arc_decisions.filter((d: any) => d.objective_id === args[0]);
            } else if (normalized.includes('FROM arc_actions')) {
                return mockTables.arc_actions.filter((a: any) => args.includes(a.decision_id));
            }
            return [];
          }
        };
      }
    };

    mockTables.arc_objectives = [];
    mockTables.arc_decisions = [];
    mockTables.arc_actions = [];
    mockTables.behavioral_events = [];
    mockTables.arc_coherence_history = [];
  });

  afterEach(async () => {
    await fsp.rm(tempWorkspace, { recursive: true, force: true }).catch(() => {});
  });

  it('Scenario 1: should successfully rollback objective, restoring files and updating status constraints', async () => {
    const objectiveId = 'test-rollback-obj-1';
    
    mockTables.arc_objectives.push({
      id: objectiveId,
      title: 'Fix styling and configuration',
      description: 'Reorganize layouts',
      owner: 'CHAIRMAN',
      priority: 150,
      status: ObjectiveStatus.ACTIVE,
      confidence: 1.0,
      sandbox_root: tempWorkspace,
      created_at: new Date().toISOString()
    } as never);

    const decisionId = 'dec-1';
    mockTables.arc_decisions.push({
      id: decisionId,
      objective_id: objectiveId,
      title: 'Update global stylesheet',
      status: 'APPROVED'
    } as never);

    const fakeBackupPath = path.join(backupDir, 'fixture-backup.bak');
    const originalFilePath = path.join(tempWorkspace, 'style.css');
    await fsp.writeFile(fakeBackupPath, '.body { color: blue; }');

    mockTables.arc_actions.push({
      id: 'act-1',
      decision_id: decisionId,
      type: 'WRITE_FILE',
      status: 'DONE',
      created_at: Date.now(),
      inverse: JSON.stringify({
        type: 'RESTORE',
        backupPath: fakeBackupPath,
        originalPath: originalFilePath
      })
    } as never);

    const result = await engine.rollbackObjective(objectiveId);
    expect(result.success).toBe(true);
    expect(result.rolledBackActions).toBe(1);
    expect(result.skippedActions).toBe(0);
    expect(result.errors.length).toBe(0);

    const obj = mockTables.arc_objectives.find((o: any) => o.id === objectiveId);
    expect(obj.status).toBe(ObjectiveStatus.ROLLED_BACK);
    const dec = mockTables.arc_decisions.find((d: any) => d.id === decisionId);
    expect(dec.status).toBe('ROLLED_BACK');
    const act = mockTables.arc_actions.find((a: any) => a.id === 'act-1');
    expect(act.status).toBe('ROLLED_BACK');

    const content = await fsp.readFile(originalFilePath, 'utf8');
    expect(content).toBe('.body { color: blue; }');

    const exists = await fsp.stat(fakeBackupPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('Scenario 2: should log warning and skip actions that lack inverse properties', async () => {
    const objectiveId = 'test-rollback-obj-2';
    
    mockTables.arc_objectives.push({
      id: objectiveId,
      title: 'Compile and build targets',
      description: 'Trigger bundlers',
      status: ObjectiveStatus.ACTIVE,
      confidence: 0.9,
      sandbox_root: tempWorkspace,
      created_at: new Date().toISOString()
    } as never);

    const decisionId = 'dec-2';
    mockTables.arc_decisions.push({
      id: decisionId,
      objective_id: objectiveId,
      title: 'Run build tools',
      status: 'APPROVED'
    } as never);

    mockTables.arc_actions.push({
      id: 'act-cli',
      decision_id: decisionId,
      type: 'SHELL_RUN',
      status: 'DONE',
      created_at: Date.now(),
      inverse: null
    } as never);

    const result = await engine.rollbackObjective(objectiveId);
    expect(result.success).toBe(true);
    expect(result.rolledBackActions).toBe(0);
    expect(result.skippedActions).toBe(1);
    expect(result.errors.length).toBe(0);

    const obj = mockTables.arc_objectives.find((o: any) => o.id === objectiveId);
    expect(obj.status).toBe(ObjectiveStatus.ROLLED_BACK);
  });

  it('Scenario 3: rolling back an already rolled-back objective should throw an error', async () => {
    const objectiveId = 'test-rollback-obj-3';
    
    mockTables.arc_objectives.push({
      id: objectiveId,
      title: 'Legacy Objective',
      description: 'Already undone task',
      status: ObjectiveStatus.ROLLED_BACK,
      confidence: 1.0,
      sandbox_root: tempWorkspace,
      created_at: new Date().toISOString()
    } as never);

    await expect(engine.rollbackObjective(objectiveId)).rejects.toThrow('is already rolled back');
  });
});
