import { decisionEngine, Decision, PredictionNode } from './DecisionEngine';
import { objectiveEngine } from '../objective/ObjectiveEngine';

export class DecisionGovernor {
  private static instance: DecisionGovernor;

  private maxExploratoryRatio: number = 3.0;
  private suppressionDisabled: boolean = false;

  public static getInstance(): DecisionGovernor {
    if (!DecisionGovernor.instance) {
      DecisionGovernor.instance = new DecisionGovernor();
    }
    return DecisionGovernor.instance;
  }

  public setMaxExploratoryRatio(ratio: number): void {
    this.maxExploratoryRatio = ratio;
  }

  public setSuppressionDisabled(disabled: boolean): void {
    this.suppressionDisabled = disabled;
  }

  /**
   * Evaluates and classifies a pending or new decision, assigning types, weights,
   * and checking ratio constraints between EXPLORATORY and EXECUTIVE channels.
   */
  public governDecision(objectiveId: string | null, title: string, rationale: string, currentEntropy: number): {
    decisionType: 'EXECUTIVE' | 'EXPLORATORY' | 'OBSERVATIONAL';
    executionWeight: number;
    shouldSuppress: boolean;
  } {
    // 1. Dynamic classification based on intent contents
    let decisionType: 'EXECUTIVE' | 'EXPLORATORY' | 'OBSERVATIONAL' = 'OBSERVATIONAL';
    const lowerTitle = title.toLowerCase();
    const lowerRationale = rationale.toLowerCase();

    const isExploratory = 
      lowerTitle.includes('simulate') || 
      lowerTitle.includes('heuristic') || 
      lowerTitle.includes('exploratory') || 
      lowerTitle.includes('variation') || 
      lowerTitle.includes('predictive') ||
      lowerRationale.includes('alternative_futures_path') ||
      lowerRationale.includes('exploratory_mutation_branch');

    const isExecutive = 
      lowerTitle.includes('recovery') || 
      lowerTitle.includes('stabilization') || 
      lowerTitle.includes('realign') || 
      lowerTitle.includes('transform') || 
      lowerTitle.includes('update') || 
      lowerTitle.includes('fix') ||
      lowerTitle.includes('seeding') ||
      lowerRationale.includes('solved_path') ||
      objectiveId !== null; // Objectives generally drive real actions

    if (isExecutive) {
      decisionType = 'EXECUTIVE';
    } else if (isExploratory) {
      decisionType = 'EXPLORATORY';
    }

    // 2. Assign execution weights using selection pressure indicators
    let executionWeight = 0.5;
    if (decisionType === 'EXECUTIVE') {
      // Prioritize high-drift, low-health, or active objective outcomes
      if (objectiveId) {
        const health = objectiveEngine.evaluateHealth(objectiveId);
        executionWeight = health.is_off_trajectory ? 0.95 : 0.75;
      } else {
        executionWeight = 0.80;
      }
    } else if (decisionType === 'EXPLORATORY') {
      // Exploration depth depends inversely on current systemic entropy to enforce control
      executionWeight = Math.max(0.1, parseFloat((0.5 - (currentEntropy * 0.3)).toFixed(3)));
    } else {
      executionWeight = 0.20;
    }

    // 3. Reality Anchor Ratio enforcement: EXPLORATORY : EXECUTIVE <= maxExploratoryRatio
    const allDecisions = decisionEngine.getAllDecisions();
    const exploratoryActive = allDecisions.filter(d => 
      (d.decision_type === 'EXPLORATORY') && 
      (d.status === 'PENDING' || d.status === 'APPROVED' || d.status === 'DONE')
    ).length;

    const executiveActive = Math.max(1, allDecisions.filter(d => 
      (d.decision_type === 'EXECUTIVE') && 
      (d.status === 'PENDING' || d.status === 'APPROVED' || d.status === 'DONE')
    ).length);

    const exploratoryRatio = exploratoryActive / executiveActive;
    let shouldSuppress = false;

    if (decisionType === 'EXPLORATORY' && exploratoryRatio > this.maxExploratoryRatio && !this.suppressionDisabled) {
      console.warn(`[GOVERNOR RULE TRIGGERED] Exploratory : Executive ratio is ${exploratoryRatio.toFixed(2)} (> ${this.maxExploratoryRatio}). Suppressing branch generation.`);
      shouldSuppress = true;

      // Create a Suppressed record in the Prediction Graph
      decisionEngine.createPredictionNode({
        decision_id: null,
        node_type: 'SUPPRESSED_BRANCH',
        title: `Suppressed: ${title}`,
        execution_weight: 0.0,
        entropy_at_prediction: currentEntropy
      });
    }

    return { decisionType, executionWeight, shouldSuppress };
  }

  /**
   * Main runtime lifecycle method of the Decision Governor layer.
   * Filters pending actions, executes predictive simulation logging, and regulates entropy injection rate.
   */
  public processGovernorLoopTick(currentEntropy: number): { exploratoryOverload: boolean } {
    const allDecisions = decisionEngine.getAllDecisions();
    const pendingDecisions = allDecisions.filter(d => d.status === 'PENDING');

    const exploratoryActive = allDecisions.filter(d => d.decision_type === 'EXPLORATORY').length;
    const executiveActive = Math.max(1, allDecisions.filter(d => d.decision_type === 'EXECUTIVE').length);
    const exploratoryOverload = (exploratoryActive / executiveActive) > this.maxExploratoryRatio && !this.suppressionDisabled;

    for (const d of pendingDecisions) {
      const type = d.decision_type || 'EXECUTIVE';

      if (type === 'EXPLORATORY') {
        // 1. Simulate impact in prediction graph
        decisionEngine.createPredictionNode({
          decision_id: d.id,
          node_type: 'SIMULATED_ONLY',
          title: d.title,
          execution_weight: d.execution_weight || 0.4,
          entropy_at_prediction: currentEntropy
        });

        // 2. Move decision node status to DONE (or REJECTED if overload active) to prevent infinite loop
        decisionEngine.updateDecisionStatus(d.id, exploratoryOverload ? 'REJECTED' : 'DONE');

      } else if (type === 'EXECUTIVE') {
        // Queue for approval / amplify execution signals
        decisionEngine.createPredictionNode({
          decision_id: d.id,
          node_type: 'REALITY_EXECUTED',
          title: d.title,
          execution_weight: d.execution_weight || 0.8,
          entropy_at_prediction: currentEntropy
        });

        // If overload is active, fast-track execute this executive recovery node to regain stability
        if (exploratoryOverload) {
          decisionEngine.updateDecisionStatus(d.id, 'APPROVED');
        }
      } else {
        // Observational
        decisionEngine.updateDecisionStatus(d.id, 'DONE');
      }
    }

    return { exploratoryOverload };
  }
}

export const decisionGovernor = DecisionGovernor.getInstance();
