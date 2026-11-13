import { DatabaseService } from '../database';
import { randomUUID } from 'crypto';
import { decisionEngine } from '../decision/DecisionEngine';
import { aiService } from '../ai.service';
import { ObjectiveExecutionLoop } from './ObjectiveExecutionLoop';
import { PolicyEngine } from '../sandbox/PolicyEngine';
import { SandboxedFS } from '../sandbox/SandboxedFS';
import { objectiveDecomposerService } from './objective-decomposer.service';
import { normalizeString, type DecompositionDraft } from './decomposition-validator';
import { tasksService } from '../tasks.service';
import path from 'path';
import fsp from 'fs/promises';

export enum ObjectiveStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
  ROLLED_BACK = 'ROLLED_BACK'
}

export enum OutcomeStatus {
  PENDING = 'PENDING',
  PROGRESSING = 'PROGRESSING',
  ACHIEVED = 'ACHIEVED',
  FAILED = 'FAILED'
}

export interface MetricSource {
  type: 'FILE_SCAN' | 'CLI_OUTPUT' | 'SQL_QUERY' | 'EXTERNAL_API';
  target_uri: string;
  payload?: Record<string, any>;
}

export interface Outcome {
  id: string;
  objective_id: string;
  title: string;
  metric_name: string;
  metric_source: MetricSource;
  baseline_value: number;
  current_value: number;
  target_value: number;
  progress: number; // calculated as value [0.0 - 1.0]
  status: OutcomeStatus;
}

export interface SystemicRisk {
  id: string;
  objective_id: string;
  description: string;
  likelihood: number; // 0.0 to 1.0
  impact: number; // 0.0 to 1.0
  is_active: boolean;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  owner: 'CHAIRMAN' | 'COO_AGENT' | 'SYSTEM_AUTO';
  priority: number; // WSJF or base priority [1-1000]
  status: ObjectiveStatus;
  confidence: number; // 0.0 to 1.0
  created_at: string;
  deadline?: string;
  outcomes?: Outcome[];
  risks?: SystemicRisk[];
  dependencies?: string[]; // parent objective IDs
  route_layout?: string;
}

export interface ObjectiveDependency {
  parent_id: string;
  child_id: string;
  weight: number;
}

export class ObjectiveEngine {
  private static instance: ObjectiveEngine;
  private pendingDrafts: Map<string, DecompositionDraft> = new Map();

  public static getInstance(): ObjectiveEngine {
    if (!ObjectiveEngine.instance) {
      ObjectiveEngine.instance = new ObjectiveEngine();
    }
    return ObjectiveEngine.instance;
  }

  public getPendingDraft(objectiveId: string): DecompositionDraft | undefined {
    return this.pendingDrafts.get(objectiveId);
  }

  public setPendingDraft(draft: DecompositionDraft): void {
    if (draft && draft.objectiveId) {
      this.pendingDrafts.set(draft.objectiveId, draft);
    }
  }

  public clearPendingDraft(objectiveId: string): void {
    this.pendingDrafts.delete(objectiveId);
  }

  // CREATE OBJECTIVE
  public createObjective(
    title: string,
    description: string,
    owner: 'CHAIRMAN' | 'COO_AGENT' | 'SYSTEM_AUTO' = 'CHAIRMAN',
    basePriority: number = 100,
    deadline?: string
  ): Objective {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    const obj: Objective = {
      id,
      title,
      description,
      owner,
      priority: basePriority,
      status: ObjectiveStatus.DRAFT,
      confidence: 1.0,
      created_at,
      deadline
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_objectives (id, title, description, owner, priority, status, confidence, created_at, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(obj.id, obj.title, obj.description, obj.owner, obj.priority, obj.status, obj.confidence, obj.created_at, obj.deadline || null);

    return obj;
  }

  // ADD OUTCOME
  public addOutcome(
    objectiveId: string,
    title: string,
    metricName: string,
    metricSource: MetricSource,
    baseline: number,
    target: number
  ): Outcome {
    const id = randomUUID();
    const outcome: Outcome = {
      id,
      objective_id: objectiveId,
      title,
      metric_name: metricName,
      metric_source: metricSource,
      baseline_value: baseline,
      current_value: baseline,
      target_value: target,
      progress: 0.0,
      status: OutcomeStatus.PENDING
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_outcomes (id, objective_id, title, metric_name, metric_source, baseline_value, current_value, target_value, progress, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      outcome.id,
      outcome.objective_id,
      outcome.title,
      outcome.metric_name,
      JSON.stringify(outcome.metric_source),
      outcome.baseline_value,
      outcome.current_value,
      outcome.target_value,
      outcome.progress,
      outcome.status
    );

    this.recalculateProgress(objectiveId);
    return outcome;
  }

  // ADD RISK
  public addRisk(objectiveId: string, description: string, likelihood: number, impact: number, is_active: boolean = false): SystemicRisk {
    const id = randomUUID();
    const risk: SystemicRisk = {
      id,
      objective_id: objectiveId,
      description,
      likelihood,
      impact,
      is_active
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_objective_risks (id, objective_id, description, likelihood, impact, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(risk.id, risk.objective_id, risk.description, risk.likelihood, risk.impact, risk.is_active ? 1 : 0);

    this.recalculateProgress(objectiveId);
    return risk;
  }

  // REGISTER DEPENDENCY
  public addDependency(parentId: string, childId: string, weight: number = 1.0): void {
    const checkCycle = this.detectCycle(parentId, childId);
    if (checkCycle) {
      throw new Error(`Cycle detected structural error! Cannot link ${parentId} with parent ${childId}`);
    }

    const stmt = DatabaseService.db.prepare(`
      INSERT OR REPLACE INTO arc_objective_dependencies (parent_id, child_id, weight)
      VALUES (?, ?, ?)
    `);
    stmt.run(parentId, childId, weight);

    // Dynamic prioritization propagate
    this.propagatePriority(parentId);
  }

  private detectCycle(startNodeId: string, targetNodeId: string, visited: Set<string> = new Set()): boolean {
    if (startNodeId === targetNodeId) return true;
    if (visited.has(startNodeId)) return false;
    visited.add(startNodeId);

    const stmt = DatabaseService.db.prepare('SELECT child_id FROM arc_objective_dependencies WHERE parent_id = ?');
    const kids = stmt.all(startNodeId) as any[];

    for (const kid of kids) {
      if (this.detectCycle(kid.child_id, targetNodeId, visited)) {
        return true;
      }
    }
    return false;
  }

  // CALCULATE MEASURE ENGINE DELTA & CLAMP DYNAMICS
  public recalculateProgress(objectiveId: string): void {
    const objective = this.getObjective(objectiveId);
    if (objective && objective.status === ObjectiveStatus.ABANDONED) {
      return;
    }

    const outcomeStmt = DatabaseService.db.prepare('SELECT * FROM arc_outcomes WHERE objective_id = ?');
    const outcomes = outcomeStmt.all(objectiveId) as any[];

    let completedCount = 0;
    
    // Process each outcome progress inline
    for (const out of outcomes) {
      if (out.status === OutcomeStatus.FAILED) {
        continue;
      }
      const b = out.baseline_value;
      const c = out.current_value;
      const t = out.target_value;

      let progress = 0;
      if (t !== b) {
        if (t > b) {
          progress = Math.min(Math.max((c - b) / (t - b), 0.0), 1.0);
        } else {
          // Minimizing negative metrics
          progress = Math.min(Math.max((b - c) / (b - t), 0.0), 1.0);
        }
      } else {
        progress = c === t ? 1.0 : 0.0;
      }

      let status = OutcomeStatus.PENDING;
      if (progress >= 1.0) {
        status = OutcomeStatus.ACHIEVED;
        completedCount++;
      } else if (progress > 0.0) {
        status = OutcomeStatus.PROGRESSING;
      }

      const updateOutcome = DatabaseService.db.prepare(`
        UPDATE arc_outcomes SET progress = ?, status = ? WHERE id = ?
      `);
      updateOutcome.run(progress, status, out.id);
    }

    // Health Assessment update
    const health = this.evaluateHealth(objectiveId);

    // Fetch active risks presence to determine if the objective is truly blocked
    const risksStmt = DatabaseService.db.prepare('SELECT * FROM arc_objective_risks WHERE objective_id = ?');
    const risks = risksStmt.all(objectiveId) as any[];
    const hasActiveRisks = risks.some(r => r.is_active === 1);
    const hasStarted = outcomes.some(o => o.progress > 0.0);

    // Lifecycle Status Transition Rule
    if (objective) {
      let nextStatus = objective.status;

      if (objective.status !== ObjectiveStatus.ABANDONED) {
        if (objective.status === ObjectiveStatus.DRAFT) {
          if (ObjectiveExecutionLoop.getInstance().isAutoApproveEnabled() && outcomes.length > 0) {
            nextStatus = ObjectiveStatus.ACTIVE;
          } else {
            nextStatus = ObjectiveStatus.DRAFT;
          }
        } else {
          if (outcomes.length > 0 && completedCount === outcomes.length) {
            nextStatus = ObjectiveStatus.COMPLETED;
          } else if (health.confidence < 0.35 && hasActiveRisks && hasStarted) {
            nextStatus = ObjectiveStatus.BLOCKED;
          } else if (objective.status === ObjectiveStatus.BLOCKED && (health.confidence >= 0.35 || !hasActiveRisks || !hasStarted)) {
            nextStatus = ObjectiveStatus.ACTIVE;
          }
        }
      }

      const updateObjective = DatabaseService.db.prepare(`
        UPDATE arc_objectives SET confidence = ?, status = ? WHERE id = ?
      `);
      updateObjective.run(health.confidence, nextStatus, objectiveId);
    }
  }

  // HEALTH ASSESSMENT ENGINE
  public evaluateHealth(objectiveId: string): { confidence: number; is_off_trajectory: boolean } {
    const risksStmt = DatabaseService.db.prepare('SELECT * FROM arc_objective_risks WHERE objective_id = ?');
    const risks = risksStmt.all(objectiveId) as any[];

    const activeRiskThreat = risks
      .filter(r => r.is_active === 1)
      .reduce((accum, r) => accum + (r.likelihood * r.impact), 0);

    const mitigatedRiskFactor = Math.max(0, 1.0 - activeRiskThreat);

    // Outcoming progress
    const outcomesStmt = DatabaseService.db.prepare('SELECT * FROM arc_outcomes WHERE objective_id = ?');
    const outcomes = outcomesStmt.all(objectiveId) as any[];

    const totalProgress = outcomes.length > 0
      ? outcomes.reduce((acc, o) => acc + o.progress, 0) / outcomes.length
      : 1.0;

    const confidence = parseFloat((mitigatedRiskFactor * totalProgress).toFixed(3));
    const is_off_trajectory = confidence < 0.35;

    return { confidence, is_off_trajectory };
  }

  // WSJF SCORE CALCULATOR FOR STRATEGIC VALUE
  public calculateWSJF(objectiveId: string, estimatedHours: number): number {
    const obj = this.getObjective(objectiveId);
    if (!obj) return 0;

    const strategicValue = obj.priority;
    
    const risksStmt = DatabaseService.db.prepare('SELECT * FROM arc_objective_risks WHERE objective_id = ?');
    const risks = risksStmt.all(objectiveId) as any[];
    const riskFactor = risks.reduce((acc, r) => acc + (r.likelihood * r.impact), 0);

    const timeCriticality = obj.deadline ? 100 : 10;
    
    const denominator = Math.max(estimatedHours, 0.5);
    const numerator = strategicValue + (riskFactor * 100) + timeCriticality;
    
    return parseFloat((numerator / denominator).toFixed(2));
  }

  private propagatePriority(parentId: string): void {
    const parent = this.getObjective(parentId);
    if (!parent) return;

    const stmt = DatabaseService.db.prepare(`
      SELECT child_id, weight FROM arc_objective_dependencies WHERE parent_id = ?
    `);
    const children = stmt.all(parentId) as any[];

    for (const child of children) {
      const childObj = this.getObjective(child.child_id);
      if (childObj) {
        const calculatedPriority = Math.max(childObj.priority, Math.floor(parent.priority * child.weight));
        DatabaseService.db.prepare(`
          UPDATE arc_objectives SET priority = ? WHERE id = ?
        `).run(calculatedPriority, child.child_id);

        this.propagatePriority(child.child_id);
      }
    }
  }

  // GET OBJECTIVE NODE DETAILED
  public getObjective(id: string): Objective | null {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_objectives WHERE id = ?');
    const res = stmt.get(id) as any;
    if (!res) return null;

    // Load sub-relations
    const outcomes = DatabaseService.db.prepare('SELECT * FROM arc_outcomes WHERE objective_id = ?').all(id) as any[];
    const risks = DatabaseService.db.prepare('SELECT * FROM arc_objective_risks WHERE objective_id = ?').all(id) as any[];
    const deps = DatabaseService.db.prepare('SELECT parent_id FROM arc_objective_dependencies WHERE child_id = ?').all(id) as any[];

    return {
      ...res,
      confidence: Number(res.confidence),
      priority: Number(res.priority),
      outcomes: outcomes.map(o => ({
        ...o,
        metric_source: JSON.parse(o.metric_source),
        progress: Number(o.progress)
      })),
      risks: risks.map(r => ({
        ...r,
        likelihood: Number(r.likelihood),
        impact: Number(r.impact),
        is_active: r.is_active === 1
      })),
      dependencies: deps.map(d => d.parent_id)
    };
  }

  public getAllObjectives(): Objective[] {
    const stmt = DatabaseService.db.prepare('SELECT id FROM arc_objectives ORDER BY priority DESC');
    const ids = stmt.all() as any[];
    return ids.map(item => this.getObjective(item.id)!).filter(Boolean);
  }

  public updateObjectiveStatus(id: string, status: ObjectiveStatus): void {
    DatabaseService.db.prepare('UPDATE arc_objectives SET status = ? WHERE id = ?').run(status, id);
    this.recalculateProgress(id);
  }

  public updateOutcomeValue(id: string, currentValue: number): void {
    const outcome = DatabaseService.db.prepare('SELECT objective_id FROM arc_outcomes WHERE id = ?').get(id) as any;
    if (outcome) {
      DatabaseService.db.prepare('UPDATE arc_outcomes SET current_value = ? WHERE id = ?').run(currentValue, id);
      this.recalculateProgress(outcome.objective_id);
    }
  }

  // DAG VISUALIZER GENERATOR
  public getObjectiveGraph() {
    const objectives = this.getAllObjectives();
    const linksStmt = DatabaseService.db.prepare('SELECT * FROM arc_objective_dependencies');
    const links = linksStmt.all() as any[];

    return {
      nodes: objectives.map(obj => ({
        id: obj.id,
        title: obj.title,
        description: obj.description,
        status: obj.status,
        priority: obj.priority,
        confidence: obj.confidence,
        outcomes_count: obj.outcomes?.length || 0,
        completed_outcomes: obj.outcomes?.filter(o => o.status === 'ACHIEVED').length || 0
      })),
      links: links.map(l => ({
        source: l.parent_id,
        target: l.child_id,
        weight: l.weight
      }))
    };
  }

  // RouteMap DAG Generation
  public generateRouteMap(objectiveId: string): any {
    const objective = this.getObjective(objectiveId);
    if (!objective) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }

    const outcomes = objective.outcomes || [];
    const decisions = decisionEngine.getDecisionsByObjective(objectiveId);

    // Handle empty graph gracefully (Task 2.7)
    if (outcomes.length === 0 && decisions.length === 0) {
      return {
        objectiveId,
        objectiveTitle: objective.title,
        nodes: [],
        edges: [],
        version: Date.now(),
      };
    }

    const nodes: any[] = [];
    const edges: any[] = [];

    // Parse position layout mappings from db text representations (Task 2.5)
    let layout: any = {};
    if ((objective as any).route_layout) {
      try {
        layout = JSON.parse((objective as any).route_layout);
      } catch (e) {
        console.warn('Failed to parse route_layout for objective:', objectiveId, e);
      }
    }

    // 1. Fetch Outcomes
    outcomes.forEach((out) => {
      const node: any = {
        id: out.id,
        type: 'OUTCOME',
        title: out.title,
        description: `Metric: ${out.metric_name} | Target: ${out.target_value}`,
        icon: 'report',
        status: out.status,
      };
      if (layout && layout[out.id]) {
        node.x = layout[out.id].x;
        node.y = layout[out.id].y;
      }
      nodes.push(node);
    });

    // 2. Fetch Decisions and evaluate PolicyEngine needs (Task 2.4)
    decisions.forEach((dec) => {
      let decRequiresApproval = false;
      try {
        const actions = decisionEngine.getActions(dec.id);
        for (const act of actions) {
          let target = '';
          try {
            const pObj = typeof act.params === 'string' ? JSON.parse(act.params) : act.params;
            target = pObj?.path || pObj?.command || '';
          } catch (e) { console.warn('Ignored error in catch', e); }
          const evalRes = PolicyEngine.evaluate(act.type as any, target, true);
          if (evalRes.requiresApproval) {
            decRequiresApproval = true;
            break;
          }
        }
      } catch (e) {
        // Fallback
      
        console.warn('[A.R.C] Handled silent error:', e);
    }

      const node: any = {
        id: dec.id,
        type: 'DECISION',
        title: dec.title,
        description: dec.rationale,
        icon: 'decision',
        status: dec.status,
        execution_weight: dec.execution_weight || 1.0,
        requiresApproval: decRequiresApproval
      };
      if (layout && layout[dec.id]) {
        node.x = layout[dec.id].x;
        node.y = layout[dec.id].y;
      }
      nodes.push(node);
    });

    // 3. Fetch Actions and Artifacts
    const artifactsMap = new Map<string, any>();
    decisions.forEach((dec) => {
      const actions = decisionEngine.getActions(dec.id);
      actions.forEach((act) => {
        // Query artifacts for action
        const stmt = DatabaseService.db.prepare('SELECT * FROM arc_artifacts WHERE action_id = ?');
        const arts = stmt.all(act.id) as any[];
        arts.forEach((art) => {
          if (!artifactsMap.has(art.id)) {
            const artNode: any = {
              id: art.id,
              type: 'ARTIFACT',
              title: path.basename(art.path_uri),
              description: `Path: ${art.path_uri}`,
              icon: 'file',
              status: 'COMPLETED',
              action_id: act.id,
              decision_id: dec.id,
              path_uri: art.path_uri,
            };
            if (layout && layout[art.id]) {
              artNode.x = layout[art.id].x;
              artNode.y = layout[art.id].y;
            }
            artifactsMap.set(art.id, artNode);
          }
        });
      });
    });

    artifactsMap.forEach((artNode) => {
      nodes.push(artNode);
    });

    // 4. Build elegant semantic/temporal Edges (DAG)
    // - Connect sequential Outcomes: Outcome_i -> Outcome_{i+1}
    for (let i = 0; i < outcomes.length - 1; i++) {
      edges.push({
        source: outcomes[i].id,
        target: outcomes[i + 1].id,
        label: 'Next Milestone',
      });
    }

    // - Connect Decisions to Outcomes:
    decisions.forEach((dec, idx) => {
      if (outcomes.length > 0) {
        const correspondingOutcome = outcomes[idx] || outcomes[outcomes.length - 1];
        edges.push({
          source: dec.id,
          target: correspondingOutcome.id,
          label: 'Aims to Achieve',
          weight: dec.execution_weight || 1.0,
        });
      }
    });

    // - Connect Decision to Artifact
    artifactsMap.forEach((artNode) => {
      edges.push({
        source: artNode.decision_id,
        target: artNode.id,
        label: 'Produces',
      });
    });

    // 5. Cyclic dependency check (strict requirement)
    const adjList = new Map<string, string[]>();
    nodes.forEach(n => adjList.set(n.id, []));
    edges.forEach(e => {
      if (adjList.has(e.source)) {
        adjList.get(e.source)!.push(e.target);
      }
    });

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) return true; // Cycle detected!
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          throw new Error(`Cycle detected in generated route map for objective ${objectiveId}`);
        }
      }
    }

    return {
      objectiveId,
      objectiveTitle: objective.title,
      nodes,
      edges,
      version: Date.now(),
    };
  }

  // Save layout position mappings to DB (Task 2.5)
  public saveRouteLayout(objectiveId: string, layout: any): void {
    const layoutStr = JSON.stringify(layout);
    DatabaseService.db.prepare('UPDATE arc_objectives SET route_layout = ? WHERE id = ?').run(layoutStr, objectiveId);
  }

  // Route Approval - Approve RouteMap
  public approveRouteMap(objectiveId: string, changes?: any): any {
    const objective = this.getObjective(objectiveId);
    if (!objective) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }

    if (changes) {
      this.modifyRouteMap(objectiveId, changes);
    }

    const decisions = decisionEngine.getDecisionsByObjective(objectiveId);
    for (const dec of decisions) {
      if (dec.status === 'PENDING') {
        decisionEngine.updateDecisionStatus(dec.id, 'APPROVED');
      }
    }

    DatabaseService.db.prepare('UPDATE arc_objectives SET status = ? WHERE id = ?').run(ObjectiveStatus.ACTIVE, objectiveId);
    this.recalculateProgress(objectiveId);

    return this.getObjective(objectiveId);
  }

  // Route Approval - Modify RouteMap
  public modifyRouteMap(objectiveId: string, changes: any): any {
    const objective = this.getObjective(objectiveId);
    if (!objective) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }

    if (changes.excludedNodes && Array.isArray(changes.excludedNodes)) {
      changes.excludedNodes.forEach((nodeId: string) => {
        const decStmt = DatabaseService.db.prepare('SELECT * FROM arc_decisions WHERE id = ?');
        const dec = decStmt.get(nodeId) as any;
        if (dec) {
          DatabaseService.db.prepare("UPDATE arc_decisions SET status = 'REJECTED' WHERE id = ?").run(nodeId);
        }

        const outStmt = DatabaseService.db.prepare('SELECT * FROM arc_outcomes WHERE id = ?');
        const out = outStmt.get(nodeId) as any;
        if (out) {
          DatabaseService.db.prepare("UPDATE arc_outcomes SET status = 'FAILED' WHERE id = ?").run(nodeId);
        }
      });
    }

    if (changes.order && Array.isArray(changes.order)) {
      changes.order.forEach((item: { id: string; weight: number }) => {
        DatabaseService.db.prepare('UPDATE arc_decisions SET execution_weight = ? WHERE id = ?').run(item.weight, item.id);
      });
    }

    this.recalculateProgress(objectiveId);
    return this.getObjective(objectiveId);
  }

  // Route Approval - Decline RouteMap
  public declineRouteMap(objectiveId: string): any {
    const objective = this.getObjective(objectiveId);
    if (!objective) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }

    DatabaseService.db.prepare("UPDATE arc_outcomes SET status = 'FAILED' WHERE objective_id = ?").run(objectiveId);
    DatabaseService.db.prepare("UPDATE arc_decisions SET status = 'REJECTED' WHERE objective_id = ?").run(objectiveId);
    DatabaseService.db.prepare('UPDATE arc_objectives SET status = ? WHERE id = ?').run(ObjectiveStatus.ABANDONED, objectiveId);
    this.recalculateProgress(objectiveId);

    return this.getObjective(objectiveId);
  }

  // OBJECTIVE AUTONOMOUS DECOMPOSITION ENGINE (Task 3.1: DRAFT + APPROVE)
  public async decomposeObjectiveDraft(
    objectiveId: string,
    taskDescriptionText?: string
  ): Promise<DecompositionDraft> {
    const obj = this.getObjective(objectiveId);
    if (!obj) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }

    // Special logic for the First System Self-Objective
    if (obj.title === "Transform A.R.C. into Objective-driven OS") {
      return {
        objectiveId,
        source: 'fallback',
        outcomes: [
          {
            title: "Decision Kernel integrated with Objective Engine",
            metric_name: "dk_integration",
            metric_source: { type: "FILE_SCAN", target_uri: "/src/main/services/decision/DecisionEngine.ts" },
            baseline_value: 0,
            target_value: 1
          },
          {
            title: "Ledger supports Objective tracing",
            metric_name: "ledger_tracing",
            metric_source: { type: "FILE_SCAN", target_uri: "/src/main/services/objective/ObjectiveEngine.ts" },
            baseline_value: 0,
            target_value: 1
          },
          {
            title: "UI supports Objective visualization layer",
            metric_name: "ui_viz",
            metric_source: { type: "FILE_SCAN", target_uri: "/src/renderer/layouts/CommandCenter.vue" },
            baseline_value: 0,
            target_value: 1
          }
        ],
        decisions: [
          {
            title: "Implement IPC bridges for goals & DAG links",
            rationale: "Expose IPC methods so Vue renderer registers and visualizes objectives, outcomes, and links",
            action: { type: "FILE_WRITE", target: "/src/main/ipc/objective.ipc.ts", path: "/src/main/ipc/objective.ipc.ts" }
          },
          {
            title: "Develop Objective Graph D3 rendering panel",
            rationale: "Integrate a modern radial/hierarchical graph visualizer for outstanding Chairman UI experience",
            action: { type: "FILE_WRITE", target: "/src/renderer/components/reactor/ReactorCore.vue", path: "/src/renderer/components/reactor/ReactorCore.vue" }
          }
        ],
        tasks: [
          { text: "Настроить шину IPC для стратегических связей", estimatedMinutes: 45, priority: "high" },
          { text: "Сконфигурировать дашборд Reactor Graph", estimatedMinutes: 60, priority: "medium" }
        ],
        risks: [
          { description: "Complexity of multi-process Electron UI and IPC channels", likelihood: 0.4, impact: 0.6 },
          { description: "Overwriting database files during deep refactoring", likelihood: 0.2, impact: 0.9 }
        ],
        rawPromptText: taskDescriptionText,
        createdAt: Date.now()
      };
    }

    return await objectiveDecomposerService.generateDraft(objectiveId, obj.title, taskDescriptionText);
  }

  public async approveDecompositionDraft(
    objectiveId: string,
    draft: DecompositionDraft
  ): Promise<{
    committed: { outcomes: number; decisions: number; tasks: number; risks: number };
    totalCommitted: number;
  }> {
    const obj = this.getObjective(objectiveId);
    if (!obj) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }

    const committed = { outcomes: 0, decisions: 0, tasks: 0, risks: 0 };

    // 1. Commit Outcomes (deduplicated by normalized title)
    const existingOutcomes = (obj.outcomes || []).map(o => normalizeString(o.title));
    if (Array.isArray(draft.outcomes)) {
      for (const item of draft.outcomes) {
        const norm = normalizeString(item.title);
        if (!norm || existingOutcomes.includes(norm)) continue;
        this.addOutcome(
          objectiveId,
          item.title,
          item.metric_name,
          item.metric_source,
          item.baseline_value,
          item.target_value
        );
        existingOutcomes.push(norm);
        committed.outcomes++;
      }
    }

    // 2. Commit Decisions & Actions (deduplicated by normalized title)
    const existingDecisions = decisionEngine.getDecisionsByObjective(objectiveId).map(d => normalizeString(d.title));
    if (Array.isArray(draft.decisions)) {
      for (const item of draft.decisions) {
        const norm = normalizeString(item.title);
        if (!norm || existingDecisions.includes(norm)) continue;
        const d = decisionEngine.createDecision(objectiveId, item.title, item.rationale);
        if (item.action) {
          decisionEngine.createAction(d.id, item.action.type, {
            path: item.action.path || item.action.target,
            cmd: item.action.cmd
          });
        }
        existingDecisions.push(norm);
        committed.decisions++;
      }
    }

    // 3. Commit Risks (deduplicated by normalized description)
    const existingRisks = (obj.risks || []).map(r => normalizeString(r.description));
    if (Array.isArray(draft.risks)) {
      for (const item of draft.risks) {
        const norm = normalizeString(item.description);
        if (!norm || existingRisks.includes(norm)) continue;
        this.addRisk(objectiveId, item.description, item.likelihood, item.impact, true);
        existingRisks.push(norm);
        committed.risks++;
      }
    }

    // 4. Commit Tasks (deduplicated by normalized text for this objective)
    const allDbTasks = tasksService.getAllTasks();
    const existingTaskTexts = allDbTasks
      .filter(t => t.objectiveId === objectiveId)
      .map(t => normalizeString(t.text));

    if (Array.isArray(draft.tasks)) {
      for (const item of draft.tasks) {
        const norm = normalizeString(item.text);
        if (!norm || existingTaskTexts.includes(norm)) continue;
        tasksService.createTask(
          {
            text: item.text,
            priority: item.priority || 'medium',
            estimatedMinutes: item.estimatedMinutes || 30,
            objectiveId
          },
          'ai_tool'
        );
        existingTaskTexts.push(norm);
        committed.tasks++;
      }
    }

    if (ObjectiveExecutionLoop.getInstance().isAutoApproveEnabled()) {
      this.updateObjectiveStatus(objectiveId, ObjectiveStatus.ACTIVE);
    }
    this.recalculateProgress(objectiveId);
    this.clearPendingDraft(objectiveId);

    const totalCommitted = committed.outcomes + committed.decisions + committed.tasks + committed.risks;
    return { committed, totalCommitted };
  }

  /**
   * @deprecated Use two-phase `decomposeObjectiveDraft` + `approveDecompositionDraft` instead.
   * Preserved for backward compatibility with existing IPC callers and integration tests.
   */
  public async decomposeObjective(objectiveId: string, taskDescriptionText: string): Promise<void> {
    const draft = await this.decomposeObjectiveDraft(objectiveId, taskDescriptionText);
    await this.approveDecompositionDraft(objectiveId, draft);
  }

  // ATOMIC ROLLBACK CORE ENGINE (Task 2.1 & 3.2)
  public async rollbackObjective(
    objectiveId: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{ 
    success: boolean; 
    rolledBackActions: number; 
    skippedActions: number; 
    errors: string[]; 
  }> {
    const errors: string[] = [];
    let rolledBackActions = 0;
    let skippedActions = 0;

    // 1. Verify existence and current rollback status
    const objective = this.getObjective(objectiveId);
    if (!objective) {
      throw new Error(`Objective with ID ${objectiveId} not found`);
    }
    if (objective.status === ObjectiveStatus.ROLLED_BACK) {
      throw new Error(`Objective ${objectiveId} is already rolled back`);
    }

    try {
      // 2. Load all decisions
      const decisions = DatabaseService.db.prepare('SELECT id, status FROM arc_decisions WHERE objective_id = ?').all(objectiveId) as any[];
      const decisionIds = decisions.map(d => d.id);

      if (decisionIds.length > 0) {
        // 3. Select all related actions in reverse order of execution (DESC)
        const placeholders = decisionIds.map(() => '?').join(',');
        const actions = DatabaseService.db.prepare(`
          SELECT * FROM arc_actions 
          WHERE decision_id IN (${placeholders}) 
          ORDER BY created_at DESC
        `).all(...decisionIds) as any[];

        // Derive root sandbox dir
        const rootDir = (objective as any).sandbox_root || path.join(require('os').homedir(), 'ARC_Workspace', objectiveId);
        await fsp.mkdir(rootDir, { recursive: true });
        const sfs = new SandboxedFS(rootDir, objectiveId);

        const totalActions = actions.length;
        let currentActionIndex = 0;

        // 4. Trace and execute reverse instruction actions
        for (const action of actions) {
          currentActionIndex++;
          const actionDetails = action.type || 'Action';
          if (onProgress) {
            onProgress(
              currentActionIndex, 
              totalActions, 
              `Откат действия: инверсия ${actionDetails}...`
            );
          }

          // Small sleep to allow visual indicator on frontend to animate smoothly
          await new Promise(resolve => setTimeout(resolve, 150));

          if (!action.inverse) {
            console.warn(`[ObjectiveEngine] Action ${action.id} of type ${action.type} has no inverse rollback instructions. Skipping.`);
            skippedActions++;
            continue;
          }

          try {
            const inv = JSON.parse(action.inverse);
            
            if (inv.type === 'RESTORE') {
              const backupExists = await fsp.stat(inv.backupPath).then(() => true).catch(() => false);
              if (backupExists) {
                const content = await fsp.readFile(inv.backupPath);
                const relativePath = path.relative(rootDir, inv.originalPath);
                await sfs.writeFile(relativePath, content, { skipBackup: true });
                // Safely clean up backup files in target logs
                await fsp.unlink(inv.backupPath).catch(() => {});
                rolledBackActions++;
              } else {
                errors.push(`Файл резервной копии не найден: ${inv.backupPath}. Откат действия пропущен.`);
                skippedActions++;
              }
            } else if (inv.type === 'RENAME_BACK') {
              const currentExists = await sfs.exists(path.relative(rootDir, inv.currentPath));
              if (currentExists) {
                const relCurrent = path.relative(rootDir, inv.currentPath);
                const relOriginal = path.relative(rootDir, inv.originalPath);
                await sfs.rename(relCurrent, relOriginal, { skipBackup: true });
                rolledBackActions++;
              } else {
                throw new Error(`Renamed source file at ${inv.currentPath} is missing`);
              }
            } else if (inv.type === 'DELETE') {
              const exists = await sfs.exists(path.relative(rootDir, inv.originalPath));
              if (exists) {
                const relPath = path.relative(rootDir, inv.originalPath);
                await sfs.deleteFile(relPath, { skipBackup: true });
                rolledBackActions++;
              } else {
                skippedActions++;
              }
            } else {
              throw new Error(`Unsupported inverse type: ${inv.type}`);
            }

            // Flag action as ROLLED_BACK
            DatabaseService.db.prepare("UPDATE arc_actions SET status = 'ROLLED_BACK' WHERE id = ?").run(action.id);

          } catch (err: any) {
            console.error(`[ObjectiveEngine] Action ${action.id} rollback error:`, err);
            errors.push(`Action ${action.id} inversion failed: ${err.message}`);
          }
        }
      }

      // 5. Update parent states to ROLLED_BACK
      DatabaseService.db.prepare('UPDATE arc_objectives SET status = ? WHERE id = ?').run(ObjectiveStatus.ROLLED_BACK, objectiveId);
      
      if (decisionIds.length > 0) {
        const placeholders = decisionIds.map(() => '?').join(',');
        DatabaseService.db.prepare(`
          UPDATE arc_decisions 
          SET status = 'ROLLED_BACK' 
          WHERE id IN (${placeholders})
        `).run(...decisionIds);
      }

      // Recalculate and synchronize outcome metrics
      this.recalculateProgress(objectiveId);

      // 6. Record System events
      const eventId = randomUUID();
      DatabaseService.db.prepare(`
        INSERT INTO behavioral_events (id, type, context, metadata, timestamp)
        VALUES (?, 'OBJECTIVE_ROLLBACK', ?, ?, ?)
      `).run(
        eventId,
        objectiveId,
        JSON.stringify({
          success: errors.length === 0,
          rolledBackActions,
          skippedActions,
          errors
        }),
        Date.now()
      );

      // Decrement entropy drift coherence index record
      const coherenceId = randomUUID();
      DatabaseService.db.prepare(`
        INSERT INTO arc_coherence_history (id, coherence_index, exploration_pressure, execution_pressure, suppression_pressure, stability_drift_index, created_at)
        VALUES (?, 0.98, 0.05, 0.01, 0.95, 0.02, ?)
      `).run(coherenceId, Date.now());

      return {
        success: errors.length === 0,
        rolledBackActions,
        skippedActions,
        errors
      };

    } catch (rootErr: any) {
      console.error(`[ObjectiveEngine] Fatal fallback during rollback of objective ${objectiveId}:`, rootErr);
      errors.push(`Fatal system exception: ${rootErr.message}`);
      return {
        success: false,
        rolledBackActions,
        skippedActions,
        errors
      };
    }
  }
}

export const objectiveEngine = ObjectiveEngine.getInstance();
