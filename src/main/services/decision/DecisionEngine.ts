import { DatabaseService } from '../database';
import { randomUUID } from 'crypto';

export interface Decision {
  id: string;
  objective_id: string | null;
  title: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'DONE' | 'FAILED';
  rationale: string;
  created_at: number;
  updated_at: number;
  decision_type?: 'EXECUTIVE' | 'EXPLORATORY' | 'OBSERVATIONAL';
  execution_weight?: number;
}

export interface PredictionNode {
  id: string;
  decision_id: string | null;
  node_type: 'REALITY_EXECUTED' | 'SIMULATED_ONLY' | 'SUPPRESSED_BRANCH';
  title: string;
  execution_weight: number;
  entropy_at_prediction: number;
  created_at: number;
}

export interface CoherenceRecord {
  id: string;
  coherence_index: number;
  exploration_pressure: number;
  execution_pressure: number;
  suppression_pressure: number;
  stability_drift_index: number;
  created_at: number;
}

export interface Action {
  id: string;
  decision_id: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  params: Record<string, any>;
  result: Record<string, any> | null;
  created_at: number;
}

export interface Artifact {
  id: string;
  action_id: string | null;
  path_uri: string;
  type: string;
  hash: string | null;
  created_at: number;
}

export class DecisionEngine {
  private static instance: DecisionEngine;

  public static getInstance(): DecisionEngine {
    if (!DecisionEngine.instance) {
      DecisionEngine.instance = new DecisionEngine();
    }
    return DecisionEngine.instance;
  }

  public createDecision(
    objectiveId: string | null,
    title: string,
    rationale: string,
    decisionType: 'EXECUTIVE' | 'EXPLORATORY' | 'OBSERVATIONAL' = 'EXECUTIVE',
    executionWeight: number = 1.0
  ): Decision {
    const id = randomUUID();
    const now = Date.now();
    const decision: Decision = {
      id,
      objective_id: objectiveId,
      title,
      status: 'PENDING',
      rationale,
      created_at: now,
      updated_at: now,
      decision_type: decisionType,
      execution_weight: executionWeight
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_decisions (id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      decision.id,
      decision.objective_id,
      decision.title,
      decision.status,
      decision.rationale,
      decision.created_at,
      decision.updated_at,
      decision.decision_type,
      decision.execution_weight
    );

    return decision;
  }

  public getDecision(id: string): Decision | null {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_decisions WHERE id = ?');
    const result = stmt.get(id) as any;
    if (!result) return null;
    return {
      ...result,
      created_at: Number(result.created_at),
      updated_at: Number(result.updated_at)
    };
  }

  public getDecisionsByObjective(objectiveId: string): Decision[] {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_decisions WHERE objective_id = ?');
    const results = stmt.all(objectiveId) as any[];
    return results.map(r => ({
      ...r,
      created_at: Number(r.created_at),
      updated_at: Number(r.updated_at)
    }));
  }

  public getAllDecisions(): Decision[] {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_decisions ORDER BY created_at DESC');
    const results = stmt.all() as any[];
    return results.map(r => ({
      ...r,
      created_at: Number(r.created_at),
      updated_at: Number(r.updated_at)
    }));
  }

  public updateDecisionStatus(id: string, status: Decision['status']): void {
    const stmt = DatabaseService.db.prepare(`
      UPDATE arc_decisions SET status = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(status, Date.now(), id);
  }

  public createAction(decisionId: string, type: string, params: Record<string, any>): Action {
    const id = randomUUID();
    const action: Action = {
      id,
      decision_id: decisionId,
      type,
      status: 'PENDING',
      params,
      result: null,
      created_at: Date.now()
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_actions (id, decision_id, type, status, params, result, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      action.id,
      action.decision_id,
      action.type,
      action.status,
      JSON.stringify(action.params),
      null,
      action.created_at
    );

    return action;
  }

  public getActions(decisionId: string): Action[] {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_actions WHERE decision_id = ?');
    const results = stmt.all(decisionId) as any[];
    return results.map(r => ({
      ...r,
      params: r.params ? JSON.parse(r.params) : {},
      result: r.result ? JSON.parse(r.result) : null,
      created_at: Number(r.created_at)
    }));
  }

  public updateActionStatus(id: string, status: Action['status'], result: Record<string, any> | null): void {
    const stmt = DatabaseService.db.prepare(`
      UPDATE arc_actions SET status = ?, result = ? WHERE id = ?
    `);
    stmt.run(status, result ? JSON.stringify(result) : null, id);
  }

  public createArtifact(actionId: string | null, path_uri: string, type: string, hash: string | null): Artifact {
    const id = randomUUID();
    const artifact: Artifact = {
      id,
      action_id: actionId,
      path_uri,
      type,
      hash,
      created_at: Date.now()
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_artifacts (id, action_id, path_uri, type, hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      artifact.id,
      artifact.action_id,
      artifact.path_uri,
      artifact.type,
      artifact.hash,
      artifact.created_at
    );

    return artifact;
  }

  public getArtifacts(): Artifact[] {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_artifacts ORDER BY created_at DESC');
    const results = stmt.all() as any[];
    return results.map(r => ({
      ...r,
      created_at: Number(r.created_at)
    }));
  }

  public createPredictionNode(node: Omit<PredictionNode, 'id' | 'created_at'>): PredictionNode {
    const id = randomUUID();
    const created_at = Date.now();
    const fullNode: PredictionNode = {
      ...node,
      id,
      created_at
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_prediction_graph (id, decision_id, node_type, title, execution_weight, entropy_at_prediction, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fullNode.id,
      fullNode.decision_id,
      fullNode.node_type,
      fullNode.title,
      fullNode.execution_weight,
      fullNode.entropy_at_prediction,
      fullNode.created_at
    );

    return fullNode;
  }

  public getPredictionNodes(limit: number = 15): PredictionNode[] {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_prediction_graph ORDER BY created_at DESC LIMIT ?');
    const results = stmt.all(limit) as any[];
    return results.map(r => ({
      ...r,
      created_at: Number(r.created_at),
      execution_weight: Number(r.execution_weight),
      entropy_at_prediction: Number(r.entropy_at_prediction)
    }));
  }

  public createCoherenceRecord(record: Omit<CoherenceRecord, 'id' | 'created_at'>): CoherenceRecord {
    const id = randomUUID();
    const created_at = Date.now();
    const fullRecord: CoherenceRecord = {
      ...record,
      id,
      created_at
    };

    const stmt = DatabaseService.db.prepare(`
      INSERT INTO arc_coherence_history (id, coherence_index, exploration_pressure, execution_pressure, suppression_pressure, stability_drift_index, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fullRecord.id,
      fullRecord.coherence_index,
      fullRecord.exploration_pressure,
      fullRecord.execution_pressure,
      fullRecord.suppression_pressure,
      fullRecord.stability_drift_index,
      fullRecord.created_at
    );

    return fullRecord;
  }

  public getCoherenceHistory(limit: number = 50): CoherenceRecord[] {
    const stmt = DatabaseService.db.prepare('SELECT * FROM arc_coherence_history ORDER BY created_at DESC LIMIT ?');
    const results = stmt.all(limit) as any[];
    return results.map(r => ({
      ...r,
      coherence_index: Number(r.coherence_index),
      exploration_pressure: Number(r.exploration_pressure),
      execution_pressure: Number(r.execution_pressure),
      suppression_pressure: Number(r.suppression_pressure),
      stability_drift_index: Number(r.stability_drift_index),
      created_at: Number(r.created_at)
    }));
  }

  public compactLedger(maxRecords: number = 300): void {
    try {
      DatabaseService.db.prepare(`
        DELETE FROM arc_decisions 
        WHERE id NOT IN (
          SELECT id FROM arc_decisions ORDER BY created_at DESC LIMIT ?
        )
      `).run(maxRecords);

      DatabaseService.db.prepare(`
        DELETE FROM arc_prediction_graph 
        WHERE id NOT IN (
          SELECT id FROM arc_prediction_graph ORDER BY created_at DESC LIMIT ?
        )
      `).run(maxRecords);
      
      DatabaseService.db.prepare(`
        DELETE FROM arc_coherence_history 
        WHERE id NOT IN (
          SELECT id FROM arc_coherence_history ORDER BY created_at DESC LIMIT ?
        )
      `).run(maxRecords);

      DatabaseService.db.prepare(`
        DELETE FROM arc_actions
        WHERE decision_id IS NOT NULL AND decision_id NOT IN (SELECT id FROM arc_decisions)
      `).run();
      
      DatabaseService.db.prepare(`
        DELETE FROM arc_artifacts
        WHERE action_id IS NOT NULL AND action_id NOT IN (SELECT id FROM arc_actions)
      `).run();
    } catch (err) {
      console.error("[DecisionEngine] Ledger compaction failed:", err);
    }
  }
}

export const decisionEngine = DecisionEngine.getInstance();
