/**
 * Shared types for Objective-First Autonomous Engine
 * Matches SQLite database schema in src/main/services/database.ts
 */

export type ObjectiveOwner = 'CHAIRMAN' | 'COO_AGENT' | 'SYSTEM_AUTO';

export type ObjectiveStatusType = 
  | 'DRAFT' 
  | 'ACTIVE' 
  | 'BLOCKED' 
  | 'COMPLETED' 
  | 'ABANDONED' 
  | 'ROLLED_BACK';

export enum ObjectiveStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
  ROLLED_BACK = 'ROLLED_BACK'
}

export type OutcomeStatusType = 
  | 'PENDING' 
  | 'PROGRESSING' 
  | 'ACHIEVED' 
  | 'FAILED';

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
  metric_source: MetricSource | string;
  baseline_value: number;
  current_value: number;
  target_value: number;
  progress: number;
  status: OutcomeStatus | OutcomeStatusType;
}

export interface SystemicRisk {
  id: string;
  objective_id: string;
  description: string;
  likelihood: number;
  impact: number;
  is_active: boolean | number;
}

export type Risk = SystemicRisk;

export type DecisionStatusType = 
  | 'PENDING' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'EXECUTING' 
  | 'DONE' 
  | 'FAILED' 
  | 'ROLLED_BACK' 
  | 'ABANDONED';

export type DecisionType = 'EXECUTIVE' | 'EXPLORATORY' | 'OBSERVATIONAL' | 'Executive' | 'Exploratory' | 'Observational';

export interface Decision {
  id: string;
  objective_id: string | null;
  title: string;
  status: DecisionStatusType;
  rationale: string | null;
  created_at: number | string | null;
  updated_at?: number | string | null;
  decision_type?: DecisionType;
  execution_weight?: number;
}

export interface Action {
  id: string;
  decision_id: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  params: Record<string, any> | string | null;
  result: Record<string, any> | string | null;
  inverse?: Record<string, any> | string | null;
  created_at: number | null;
}

export interface Artifact {
  id: string;
  action_id: string | null;
  path_uri: string;
  type: string;
  hash: string | null;
  created_at: number | null;
}

export interface PredictionNode {
  id: string;
  decision_id: string | null;
  node_type: 'REALITY_EXECUTED' | 'SIMULATED_ONLY' | 'SUPPRESSED_BRANCH';
  title: string;
  execution_weight: number | null;
  entropy_at_prediction: number | null;
  created_at: number | null;
}

export interface CoherenceRecord {
  id: string;
  coherence_index: number | null;
  exploration_pressure: number | null;
  execution_pressure: number | null;
  suppression_pressure: number | null;
  stability_drift_index: number | null;
  created_at: number | null;
}

export interface ObjectiveDependency {
  parent_id: string;
  child_id: string;
  weight: number;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  owner: ObjectiveOwner;
  priority: number;
  status: ObjectiveStatus | ObjectiveStatusType;
  confidence: number;
  created_at: string;
  deadline?: string | null;
  outcomes?: Outcome[];
  risks?: SystemicRisk[];
  decisions?: Decision[];
  dependencies?: string[];
  route_layout?: string;
}
