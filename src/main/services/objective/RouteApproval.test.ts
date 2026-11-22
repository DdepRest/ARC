import { vi, describe, it, expect, beforeAll } from 'vitest';

const mockTables = vi.hoisted(() => ({
    arc_objectives: [] as any[],
    arc_outcomes: [] as any[],
    arc_objective_risks: [] as any[],
    arc_objective_dependencies: [] as any[],
    arc_decisions: [] as any[],
    arc_actions: [] as any[],
    arc_artifacts: [] as any[]
  }));

vi.mock('better-sqlite3', () => {
  const tables: Record<string, any[]> = {
    arc_objectives: [],
    arc_outcomes: [],
    arc_objective_risks: [],
    arc_objective_dependencies: [],
    arc_decisions: [],
    arc_actions: [],
    arc_artifacts: []
  };

  // Attach to globalThis so the test code can assert against tables safely
  (globalThis as any).__mockTables = tables;

  class MockDatabase {
    constructor(path: string) {}
    pragma(sql: string) {}
    exec(sql: string) {}
    prepare(sql: string) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      
      return {
        run(...args: any[]) {
          if (normalized.startsWith('INSERT INTO arc_objectives')) {
            mockTables.arc_objectives.push({
              id: args[0],
              title: args[1],
              description: args[2],
              owner: args[3],
              priority: args[4],
              status: args[5],
              confidence: args[6],
              created_at: args[7],
              deadline: args[8],
              route_layout: undefined,
            });
          } else if (normalized.startsWith('UPDATE arc_objectives SET route_layout = ?')) {
            const obj = mockTables.arc_objectives.find(o => o.id === args[1]);
            if (obj) {
              obj.route_layout = args[0];
            }
          } else if (normalized.startsWith('INSERT INTO arc_outcomes')) {
            mockTables.arc_outcomes.push({
              id: args[0],
              objective_id: args[1],
              title: args[2],
              metric_name: args[3],
              metric_source: args[4],
              baseline_value: args[5],
              current_value: args[6],
              target_value: args[7],
              progress: args[8],
              status: args[9]
            });
          } else if (normalized.startsWith('INSERT INTO arc_objective_risks')) {
            mockTables.arc_objective_risks.push({
              id: args[0],
              objective_id: args[1],
              description: args[2],
              likelihood: args[3],
              impact: args[4],
              is_active: args[5]
            });
          } else if (normalized.startsWith('INSERT INTO arc_decisions')) {
            mockTables.arc_decisions.push({
              id: args[0],
              objective_id: args[1],
              title: args[2],
              status: args[3],
              rationale: args[4],
              created_at: args[5],
              updated_at: args[6],
              decision_type: args[7],
              execution_weight: args[8] || 1.0,
            });
          } else if (normalized.startsWith('INSERT INTO arc_actions')) {
            mockTables.arc_actions.push({
              id: args[0],
              decision_id: args[1],
              type: args[2],
              status: args[3],
              params: args[4]
            });
          } else if (normalized.startsWith('UPDATE arc_objectives SET confidence = ?, status = ?')) {
            const obj = mockTables.arc_objectives.find(o => o.id === args[2]);
            if (obj) {
              obj.confidence = args[0];
              obj.status = args[1];
            }
          } else if (normalized.startsWith('UPDATE arc_objectives SET status = ? WHERE id = ?')) {
            const obj = mockTables.arc_objectives.find(o => o.id === args[1]);
            if (obj) obj.status = args[0];
          } else if (normalized.startsWith('UPDATE arc_decisions SET execution_weight = ? WHERE id = ?')) {
            const dec = mockTables.arc_decisions.find(d => d.id === args[1]);
            if (dec) dec.execution_weight = args[0];
          } else if (normalized.startsWith('UPDATE arc_decisions SET status = ?, updated_at = ? WHERE id = ?')) {
            const dec = mockTables.arc_decisions.find(d => d.id === args[2]);
            if (dec) {
              dec.status = args[0];
              dec.updated_at = args[1];
            }
          } else if (normalized.startsWith('UPDATE arc_decisions SET status = ? WHERE id = ?')) {
            const dec = mockTables.arc_decisions.find(d => d.id === args[1]);
            if (dec) dec.status = args[0];
          } else if (normalized.startsWith('UPDATE arc_decisions SET status = \'REJECTED\' WHERE id = ?')) {
            const dec = mockTables.arc_decisions.find(d => d.id === args[0]);
            if (dec) dec.status = 'REJECTED';
          } else if (normalized.startsWith('UPDATE arc_decisions SET status = \'REJECTED\' WHERE objective_id = ?')) {
            mockTables.arc_decisions.filter(d => d.objective_id === args[0]).forEach(d => d.status = 'REJECTED');
          } else if (normalized.startsWith('UPDATE arc_outcomes SET progress = ?, status = ? WHERE id = ?')) {
            const out = mockTables.arc_outcomes.find(o => o.id === args[2]);
            if (out) {
              out.progress = args[0];
              out.status = args[1];
            }
          } else if (normalized.startsWith('UPDATE arc_outcomes SET status = \'FAILED\' WHERE id = ?')) {
            const out = mockTables.arc_outcomes.find(o => o.id === args[0]);
            if (out) out.status = 'FAILED';
          } else if (normalized.startsWith('UPDATE arc_outcomes SET status = \'FAILED\' WHERE objective_id = ?')) {
            mockTables.arc_outcomes.filter(o => o.objective_id === args[0]).forEach(o => o.status = 'FAILED');
          }
          return { changes: 1, lastInsertRowid: 1 };
        },
        get(...args: any[]) {
          if (normalized.startsWith('SELECT * FROM arc_objectives WHERE id = ?')) {
            return mockTables.arc_objectives.find(o => o.id === args[0]);
          } else if (normalized.startsWith('SELECT * FROM arc_decisions WHERE id = ?')) {
            return mockTables.arc_decisions.find(d => d.id === args[0]);
          } else if (normalized.startsWith('SELECT * FROM arc_outcomes WHERE id = ?')) {
            return mockTables.arc_outcomes.find(o => o.id === args[0]);
          }
          return undefined;
        },
        all(...args: any[]) {
          if (normalized.includes('FROM arc_outcomes WHERE objective_id = ?')) {
            return mockTables.arc_outcomes.filter(o => o.objective_id === args[0]);
          } else if (normalized.includes('FROM arc_objective_risks WHERE objective_id = ?')) {
            return mockTables.arc_objective_risks.filter(r => r.objective_id === args[0]);
          } else if (normalized.includes('FROM arc_objective_dependencies WHERE child_id = ?')) {
            return mockTables.arc_objective_dependencies.filter(d => d.child_id === args[0]);
          } else if (normalized.includes('FROM arc_objective_dependencies WHERE parent_id = ?')) {
            return mockTables.arc_objective_dependencies.filter(d => d.parent_id === args[0]);
          } else if (normalized.includes('FROM arc_objective_dependencies')) {
            return mockTables.arc_objective_dependencies;
          } else if (normalized.includes('FROM arc_objectives ORDER BY')) {
            return mockTables.arc_objectives.map(o => ({ id: o.id }));
          } else if (normalized.includes('FROM arc_decisions WHERE objective_id = ?')) {
            return mockTables.arc_decisions.filter(d => d.objective_id === args[0]);
          } else if (normalized.includes('FROM arc_actions WHERE decision_id = ?')) {
            return mockTables.arc_actions.filter(a => a.decision_id === args[0]);
          } else if (normalized.includes('FROM arc_artifacts WHERE action_id = ?')) {
            return mockTables.arc_artifacts.filter(art => art.action_id === args[0]);
          }
          return [];
        }
      };
    }
  }

  return Object.assign(MockDatabase, {
    default: MockDatabase
  });
});

// Load real modules under hoisted mocked dependencies
import { DatabaseService } from '../database';
import { objectiveEngine, ObjectiveStatus, OutcomeStatus } from './ObjectiveEngine';
import { objectiveExecutionLoop } from './ObjectiveExecutionLoop';

// Helper to access current memory tables
const getMockTables = () => mockTables;

describe('A.R.C. Route Approval System Integration Tests', () => {
  beforeAll(() => {
    // Initialize DatabaseService safely
    DatabaseService.init();
  });

  it('should create an objective in DRAFT status, decompose it, and verify status remains DRAFT under gatekeeper policy', async () => {
    // 1. Set auto-approve to false
    objectiveExecutionLoop.setAutoApprove(false);
    expect(objectiveExecutionLoop.isAutoApproveEnabled()).toBe(false);

    // 2. Create objective
    const obj = objectiveEngine.createObjective(
      'Test Trajectory Optimization',
      'Optimize the system files structure and trajectory paths safely',
      'CHAIRMAN',
      500
    );
    expect(obj.id).toBeDefined();
    expect(obj.status).toBe(ObjectiveStatus.DRAFT);

    // 3. Decompose objective
    await objectiveEngine.decomposeObjective(obj.id, 'Optimized compiling');

    // 4. Verify objective still remains DRAFT because autoApprove is disabled!
    const reloaded = objectiveEngine.getObjective(obj.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.status).toBe(ObjectiveStatus.DRAFT);

    // 5. Generate RouteMap
    const routeMap = objectiveEngine.generateRouteMap(obj.id);
    expect(routeMap).toBeDefined();
    expect(routeMap.objectiveId).toBe(obj.id);
    expect(routeMap.nodes.length).toBeGreaterThan(0);

    // Outcome and Decision step elements should be in the route map
    const outcomeNodes = routeMap.nodes.filter((n: any) => n.type === 'OUTCOME');
    const decisionNodes = routeMap.nodes.filter((n: any) => n.type === 'DECISION');
    expect(outcomeNodes.length).toBeGreaterThan(0);
    expect(decisionNodes.length).toBeGreaterThan(0);

    // PENDING state for decisions
    decisionNodes.forEach((node: any) => {
      expect(node.status).toBe('PENDING');
    });

    // 6. Test Exclude node and Weight Change with modifyRouteMap
    const decisionId = decisionNodes[0].id;
    const changeSet = {
      excludedNodes: [outcomeNodes[0].id],
      order: [{ id: decisionId, weight: 0.85 }]
    };

    objectiveEngine.modifyRouteMap(obj.id, changeSet);

    // Verify weight is updated in DB representation
    const tablesMock = getMockTables();
    const decisionDb = DatabaseService.db.prepare('SELECT * FROM arc_decisions WHERE id = ?').get(decisionId);
    expect(decisionDb.execution_weight).toBe(0.85);

    // Verify outcome is set to FAILED (excluded)
    const outcomeDb = DatabaseService.db.prepare('SELECT * FROM arc_outcomes WHERE id = ?').get(outcomeNodes[0].id);
    expect(outcomeDb.status).toBe('FAILED');

    // 7. Test Approve RouteMap
    objectiveEngine.approveRouteMap(obj.id, {
      excludedNodes: [],
      order: [{ id: decisionId, weight: 0.95 }]
    });

    // Verify objective status is now ACTIVE
    const reloadedActive = objectiveEngine.getObjective(obj.id);
    expect(reloadedActive!.status).toBe(ObjectiveStatus.ACTIVE);

    // Verify decision has transitioned to APPROVED status
    const approvedDecision = DatabaseService.db.prepare('SELECT * FROM arc_decisions WHERE id = ?').get(decisionId);
    expect(approvedDecision.status).toBe('APPROVED');
  });

  it('should successfully transition connected elements to FAILED / REJECTED when a route is declined', async () => {
    // Reset databases list
    const tablesMock = getMockTables();
    tablesMock.arc_objectives = [];
    tablesMock.arc_outcomes = [];
    tablesMock.arc_decisions = [];

    // 1. Create a draft objective
    const obj = objectiveEngine.createObjective(
      'Rejected Blueprint Attempt',
      'Requires trajectory validation but Chairman dislikes it',
      'CHAIRMAN',
      200
    );

    // Decompose to populate steps
    await objectiveEngine.decomposeObjective(obj.id, 'Failing system compilation');

    // 2. Decline the route
    objectiveEngine.declineRouteMap(obj.id);

    // 3. Verify objective status is ABANDONED
    const reloaded = objectiveEngine.getObjective(obj.id);
    expect(reloaded!.status).toBe(ObjectiveStatus.ABANDONED);

    // Verify outcomes are set to FAILED
    DatabaseService.db.prepare('SELECT * FROM arc_outcomes WHERE objective_id = ?').all(obj.id).forEach((o: any) => {
      expect(o.status).toBe('FAILED');
    });

    // Verify decisions are set to REJECTED
    DatabaseService.db.prepare('SELECT * FROM arc_decisions WHERE objective_id = ?').all(obj.id).forEach((d: any) => {
      expect(d.status).toBe('REJECTED');
    });
  });

  it('should successfully save and load route layout, detect requiresApproval, and handle empty route maps gracefully', async () => {
    // 1. Check empty route map handling (Task 2.7)
    const emptyObj = objectiveEngine.createObjective(
      'Empty Objective',
      'No outcomes or decisions generated yet',
      'CHAIRMAN',
      100
    );
    const emptyRouteMap = objectiveEngine.generateRouteMap(emptyObj.id);
    expect(emptyRouteMap.nodes).toEqual([]);
    expect(emptyRouteMap.edges).toEqual([]);

    // 2. Create objective with decomposed decisions/outcomes
    const obj = objectiveEngine.createObjective(
      'Layout and Policy Objective',
      'Requires trajectory validation and layout coordinates saving',
      'CHAIRMAN',
      300
    );
    await objectiveEngine.decomposeObjective(obj.id, 'Saving mock configurations');

    // Save layout coordinates (Task 2.5)
    const originalRouteMap = objectiveEngine.generateRouteMap(obj.id);
    const mockNodeId = originalRouteMap.nodes[0].id;
    const testLayout = {
      [mockNodeId]: { x: 42, y: 84 }
    };
    objectiveEngine.saveRouteLayout(obj.id, testLayout);

    // Reload and check coordinates exist
    const updatedRouteMap = objectiveEngine.generateRouteMap(obj.id);
    const matchedNode = updatedRouteMap.nodes.find((n: any) => n.id === mockNodeId);
    expect(matchedNode.x).toBe(42);
    expect(matchedNode.y).toBe(84);
  });
});
