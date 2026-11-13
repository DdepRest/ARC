import { decisionEngine } from './DecisionEngine';
import { decisionGovernor } from './DecisionGovernor';

export class MetaCoherenceEngine {
  private static instance: MetaCoherenceEngine;

  private currentCoherenceIndex: number = 0.70;
  private ep: number = 0;
  private xp: number = 0;
  private sp: number = 0;
  private stabilityDriftIndex: number = 0.05;

  private activeExplorationFreedom: boolean = false;
  private activeSuppressionSensitivity: string = 'NORMAL';
  private lastProcessedNodeId: string | null = null;

  public static getInstance(): MetaCoherenceEngine {
    if (!MetaCoherenceEngine.instance) {
      MetaCoherenceEngine.instance = new MetaCoherenceEngine();
    }
    return MetaCoherenceEngine.instance;
  }

  public getCoherenceData() {
    return {
      coherenceIndex: parseFloat(this.currentCoherenceIndex.toFixed(3)),
      epCount: this.ep,
      xpCount: this.xp,
      spCount: this.sp,
      stabilityDrift: parseFloat(this.stabilityDriftIndex.toFixed(3)),
      explorationFreedom: this.activeExplorationFreedom,
      suppressionSensitivity: this.activeSuppressionSensitivity
    };
  }

  /**
   * Recalculates systems balance forces (EP, XP, SP) and computes Coherence Index.
   * Adjusts DecisionGovernor properties based on results.
   */
  public evaluateMetaCoherence(currentEntropy: number): number {
    // Fetch latest 15 prediction nodes directly with SQL LIMIT
    const lastNodes = decisionEngine.getPredictionNodes(15);

    // Signature check: if prediction graph hasn't changed, skip recalculations and DB writes
    const currentTopNodeId = lastNodes.length > 0 ? lastNodes[0].id : null;
    if (this.lastProcessedNodeId !== null && this.lastProcessedNodeId === currentTopNodeId) {
      return this.currentCoherenceIndex;
    }
    this.lastProcessedNodeId = currentTopNodeId;

    // 1. Calculate pressures (EP, XP, SP)
    this.ep = lastNodes.filter(n => n.node_type === 'SIMULATED_ONLY').length;
    this.xp = lastNodes.filter(n => n.node_type === 'REALITY_EXECUTED').length;
    this.sp = lastNodes.filter(n => n.node_type === 'SUPPRESSED_BRANCH').length;

    const totalCount = Math.max(1, this.ep + this.xp + this.sp);

    // 2. Normalize pressures relative to the total active sample slice
    const ep_normalized = this.ep / totalCount;
    const xp_normalized = this.xp / totalCount;
    const sp_normalized = this.sp / totalCount;

    // 3. Formulate COHERENCE_INDEX
    // Coherence = dynamic balance of 3 forces: EP, XP, and 1-SP
    this.currentCoherenceIndex = (ep_normalized * 0.4) + (xp_normalized * 0.4) + ((1 - sp_normalized) * 0.2);

    // Stability drift represents entropy acceleration over time
    this.stabilityDriftIndex = Math.abs(currentEntropy - 0.22);

    // 4. Adjust GOVERNOR settings using supervisory control patterns
    if (this.currentCoherenceIndex < 0.55) {
      this.activeExplorationFreedom = true;
      this.activeSuppressionSensitivity = 'LOW';

      // Expand ratio limits and suspend suppression filters on Decision Governor
      decisionGovernor.setMaxExploratoryRatio(5.0);
      decisionGovernor.setSuppressionDisabled(true);

    } else if (this.currentCoherenceIndex > 0.85) {
      this.activeExplorationFreedom = false;
      this.activeSuppressionSensitivity = 'HIGH';

      // Constrain ratio limits and enforce aggressive suppression blocks
      decisionGovernor.setMaxExploratoryRatio(1.5);
      decisionGovernor.setSuppressionDisabled(false);

    } else {
      // Normal equilibrium mode
      this.activeExplorationFreedom = false;
      this.activeSuppressionSensitivity = 'NORMAL';

      decisionGovernor.setMaxExploratoryRatio(3.0);
      decisionGovernor.setSuppressionDisabled(false);
    }

    // 5. Persist the Coherence Record to SQL database
    try {
      decisionEngine.createCoherenceRecord({
        coherence_index: this.currentCoherenceIndex,
        exploration_pressure: ep_normalized,
        execution_pressure: xp_normalized,
        suppression_pressure: sp_normalized,
        stability_drift_index: this.stabilityDriftIndex
      });
    } catch (err) {
      console.error("Failed to commit coherence trace to database:", err);
    }

    return this.currentCoherenceIndex;
  }
}

export const metaCoherenceEngine = MetaCoherenceEngine.getInstance();
