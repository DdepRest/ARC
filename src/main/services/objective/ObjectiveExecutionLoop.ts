import { ecoService, type EcoState } from '../eco.service';
import { DatabaseService } from '../database';
import { objectiveEngine, ObjectiveStatus } from './ObjectiveEngine';
import { decisionEngine, Decision } from '../decision/DecisionEngine';
import { decisionGovernor } from '../decision/DecisionGovernor';
import { metaCoherenceEngine } from '../decision/MetaCoherenceEngine';
import * as fs from 'fs';

export enum StabilityState {
  STABLE = 'STABLE',
  DEGRADED = 'DEGRADED',
  CRITICAL = 'CRITICAL',
  QUIESCENT = 'QUIESCENT',
  EVOLVING = 'EVOLVING'
}

export class ObjectiveExecutionLoop {
  private static instance: ObjectiveExecutionLoop;
  private isLoopActive: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private executionPeriodMs: number = 30000; // 30s tick to prevent CPU and console spam
  private lastLogTimestamp: number = 0;

  // Global Engine State
  private currentEntropy: number = 0.22;
  private stabilityState: StabilityState = StabilityState.EVOLVING;
  private autoApproveEnabled: boolean = true;
  private sysMode: string = 'EVOLUTIONARY_EXECUTION';

  // Evolution/Plateau Tracking
  private previousEntropy: number = 0.22;
  private plateauTicks: number = 0;
  private cycleCount: number = 0;

  // Governor feedback rate limits
  private rateThrottleFactor: number = 1.0;

  public static getInstance(): ObjectiveExecutionLoop {
    if (!ObjectiveExecutionLoop.instance) {
      ObjectiveExecutionLoop.instance = new ObjectiveExecutionLoop();
    }
    return ObjectiveExecutionLoop.instance;
  }

  public getEntropyState() {
    const coherenceData = metaCoherenceEngine.getCoherenceData();
    return {
      entropy: parseFloat(this.currentEntropy.toFixed(3)),
      state: this.stabilityState,
      autoApprove: this.autoApproveEnabled,
      systemMode: this.sysMode,
      rateThrottleFactor: this.rateThrottleFactor,
      coherenceIndex: coherenceData.coherenceIndex,
      coherenceData: coherenceData
    };
  }

  public setAutoApprove(val: boolean) {
    this.autoApproveEnabled = val;
  }

  public isAutoApproveEnabled(): boolean {
    return this.autoApproveEnabled;
  }

  public async start(): Promise<void> {
    if (this.isLoopActive) return;
    this.isLoopActive = true;
    console.log("A.R.C. COGNITIVE EXECUTION LOOP: EVOLUTIONARY MODE ENGAGED WITH DECISION GOVERNOR");
    
    ecoService.on('state-change', (state: EcoState) => {
      this.handleEcoStateChange(state);
    });


    this.intervalId = setInterval(async () => {
      try {
        await this.runExecutionIteration();
      } catch (err) {
        console.error("A.R.C. EVOLUTION LOOP ITERATION ERROR:", err);
      }
    }, this.executionPeriodMs);

    // Immediate boot iteration
    setTimeout(async () => {
      await this.runExecutionIteration();
    }, 1000);
  }

  private handleEcoStateChange(state: EcoState) {
    if (!this.isLoopActive) return;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (state === 'hidden') {
      console.log("[ObjectiveExecutionLoop] Eco state is hidden. EVOLUTION CYCLE paused.");
      return;
    }
    
    const intervalMs = state === 'idle' ? 60000 : 30000;
    console.log(`[ObjectiveExecutionLoop] Eco state is ${state}. EVOLUTION CYCLE resumed with ${intervalMs}ms interval.`);
    
    this.intervalId = setInterval(async () => {
      try {
        await this.runExecutionIteration();
      } catch (err) {
        console.error("A.R.C. EVOLUTION LOOP ITERATION ERROR:", err);
      }
    }, intervalMs);
    
    if (state === 'active') {
      this.runExecutionIteration().catch(e => console.error(e));
    }
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isLoopActive = false;
    console.log("A.R.C. COGNITIVE EXECUTION LOOP: SHUTDOWN COMPLETE");
  }

  private async runExecutionIteration(): Promise<void> {
    this.cycleCount++;
    const now = Date.now();
    const shouldLog = false; // SILENCED: now - this.lastLogTimestamp >= 30000;
    if (shouldLog) {
      this.lastLogTimestamp = now;
      console.log(`[A.R.C. EVOLUTION CYCLE ${this.cycleCount}] SCANNING SYSTEMIC FIELD STATE`);
    }

    const allObjectives = objectiveEngine.getAllObjectives();
    const activeObjectives = allObjectives.filter(o => o.status === ObjectiveStatus.ACTIVE);
    const blockedObjectives = allObjectives.filter(o => o.status === ObjectiveStatus.BLOCKED);

    // Validate Code Integrity anchors
    let driftCount = 0;
    for (const obj of activeObjectives) {
      if (obj.outcomes && obj.outcomes.length > 0) {
        for (const outcome of obj.outcomes) {
          const { type, target_uri } = outcome.metric_source || {};
          if (type === 'FILE_SCAN' && target_uri) {
            const exists = fs.existsSync(target_uri);
            const rawCurrent = outcome.current_value;
            const updatedValue = exists ? 1 : 0;

            if (rawCurrent !== updatedValue) {
              if (shouldLog) console.log(`[INTENT DRIFT] Outcome: ${outcome.title} changed. ${rawCurrent} -> ${updatedValue}`);
              objectiveEngine.updateOutcomeValue(outcome.id, updatedValue);
              driftCount++;
            }
          }
        }
      }
    }

    // Recalculate dynamic entropy
    this.recalculateEntropyAndEvolution(allObjectives.length, blockedObjectives.length, driftCount);

    if (shouldLog) {
      console.log(`[EVOLUTION METRIC] Entropy: ${this.currentEntropy.toFixed(3)} | State: ${this.stabilityState} | Mode: ${this.sysMode}`);
    }

    // EVALUATE SUPERVISORY META-COHERENCE LAYER BEFORE GOVERNOR INGESTS DATA
    const coherenceIndex = metaCoherenceEngine.evaluateMetaCoherence(this.currentEntropy);
    if (shouldLog) {
      void 0;
    }

    // Call state-to-reality Decision Governor loop tick to process all pending decisions
    const { exploratoryOverload } = decisionGovernor.processGovernorLoopTick(this.currentEntropy);

    if (coherenceIndex > 0.85) {
      if (shouldLog) void 0;
      this.rateThrottleFactor = 0.1;
    } else if (coherenceIndex < 0.55) {
      if (shouldLog) void 0;
      this.rateThrottleFactor = 1.0;
    } else if (exploratoryOverload) {
      if (shouldLog) void 0;
      this.rateThrottleFactor = 0.2; // Severely throttle exploration generation rate
    } else {
      this.rateThrottleFactor = 1.0;
    }

    // Compression is executed if system gets heavily cluttered
    if (this.currentEntropy >= 0.5) {
      await this.executeCompressionProtocol();
    }

    // If too stable or in evolutionary state, inject active structural loads / variation
    if (this.stabilityState === StabilityState.EVOLVING || this.stabilityState === StabilityState.STABLE) {
      // Check throttle factor to regulate exploration injection rate dynamically
      if ((this.plateauTicks >= 2 || this.currentEntropy < 0.25) && Math.random() <= this.rateThrottleFactor) {
        await this.injectControlledVariationLoad(activeObjectives);
      } else if (exploratoryOverload) {
        void 0;
      }
    }

    // Process objective deviations and synthesize recovery interventions
    for (const obj of activeObjectives) {
      const health = objectiveEngine.evaluateHealth(obj.id);
      if (health.is_off_trajectory && this.stabilityState !== StabilityState.CRITICAL) {
        await this.synthesizeAutonomousInterventions(obj, health.confidence);
      }
    }

    this.compactLedgerGaps();
  }

  private recalculateEntropyAndEvolution(totalObjectives: number, blockedCount: number, driftCount: number): void {
    const allDecisions = decisionEngine.getAllDecisions();
    const pendingDecisions = allDecisions.filter(d => d.status === 'PENDING');
    const totalDecisionsCount = Math.max(1, allDecisions.length);

    const decisionDensity = pendingDecisions.length / totalDecisionsCount;
    const conflictsFactor = totalObjectives > 0 ? blockedCount / totalObjectives : 0;
    const graph = objectiveEngine.getObjectiveGraph();
    const nodesCount = Math.max(1, graph.nodes.length);
    const graphComplexity = Math.min(1.0, graph.links.length / nodesCount);
    const artifactDrift = Math.min(0.5, driftCount * 0.1);

    // Dynamic scale parameters
    let rawEntropy = (decisionDensity * 0.25) + (conflictsFactor * 0.25) + (graphComplexity * 0.2) + artifactDrift + 0.05;
    
    this.currentEntropy = Math.max(0.0, Math.min(1.0, rawEntropy));

    // Check for plateau (entropy has stabilized)
    if (Math.abs(this.currentEntropy - this.previousEntropy) < 0.015) {
      this.plateauTicks++;
    } else {
      this.plateauTicks = 0;
    }
    this.previousEntropy = this.currentEntropy;

    if (this.currentEntropy >= 0.7) {
      this.stabilityState = StabilityState.CRITICAL;
    } else if (this.currentEntropy >= 0.4) {
      this.stabilityState = StabilityState.DEGRADED;
    } else if (this.currentEntropy < 0.22) {
      this.stabilityState = StabilityState.EVOLVING; // Continuous Evolving mode
    } else {
      this.stabilityState = StabilityState.STABLE;
    }
  }

  private async injectControlledVariationLoad(activeObjectives: any[]): Promise<void> {
    const targetObj = activeObjectives[0] || null;
    const targetId = targetObj ? targetObj.id : null;

    const variationTitles = [
      "Simulate Alternative Future Path Vector",
      "Dynamic Objective Dependency Alignment",
      "Heuristic State Space Expansion Trace",
      "Exploratory Mutation Scan for Entropy Injection"
    ];

    const title = variationTitles[Math.floor(Math.random() * variationTitles.length)];
    const idSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

    const exploratoryTitle = `${title} [ID-${idSuffix}]`;
    const rationale = `Controlled variation injection to break zero-growth stability plates. 
- SOLVED_PATH: Codebase structural optimization mapping.
- ALTERNATIVE_FUTURES_PATH: Predictive simulation of trajectory indicators under varying parameter weights.
- EXPLORATORY_MUTATION_BRANCH: Auto-generating sub-hypotheses for optimal system expansion.`;

    // RUN DECISION GOVERNOR TO BALANCE REALITY ANCHORS BEFORE GENERATING
    const governance = decisionGovernor.governDecision(targetId, exploratoryTitle, rationale, this.currentEntropy);

    if (governance.shouldSuppress) {
      return;
    }

    const exists = decisionEngine.getAllDecisions().some(d => d.title.startsWith(title));
    if (!exists) {
      // DISABLED: fake decision generation for entropy injection
      // const dec = decisionEngine.createDecision(
      //   targetId,
      //   exploratoryTitle,
      //   rationale,
      //   governance.decisionType,
      //   governance.executionWeight
      // );
      // if (this.autoApproveEnabled) {
      //   decisionEngine.updateDecisionStatus(dec.id, 'APPROVED');
      // }
    }
  }

  private async executeCompressionProtocol(): Promise<void> {
    console.log("🧱 [COMPRESSION ENGINE: DECREASING SYSTEM ENTROPY CONGESTION]");
    const decisions = decisionEngine.getAllDecisions();
    const pendingDecisions = decisions.filter(d => d.status === 'PENDING');

    if (pendingDecisions.length > 5) {
      console.log(`[COMPRESSION COMPACT] Merging duplicated path structures to prevent infinite recursive chaos.`);
      const seenTitles = new Set<string>();
      for (const d of pendingDecisions) {
        const normalizedTitle = d.title.toLowerCase().replace(/\[id-[a-z0-9]+\]/g, '').trim();
        if (seenTitles.has(normalizedTitle)) {
          console.log(`[COMPRESSION REJECT] Pruned redundant branch: ${d.id}`);
          decisionEngine.updateDecisionStatus(d.id, 'REJECTED');
        } else {
          seenTitles.add(normalizedTitle);
        }
      }
    }
    console.log("SYSTEM COMPRESSION COMPLETED");
  }

  private async synthesizeAutonomousInterventions(obj: any, confidence: number): Promise<void> {
    const decisions = decisionEngine.getDecisionsByObjective(obj.id);
    const hasActiveCorrection = decisions.some(d => d.status === 'PENDING' || d.status === 'APPROVED' || d.status === 'EXECUTING');

    if (!hasActiveCorrection) {
      const recoveryTitle = `Auto-Stabilization Procedure: Realign ${obj.title.slice(0, 25)}...`;
      const rationale = `System trajectory health fell to ${confidence}. Triggering realign.
- SOLVED_PATH: Realignment of target outcomes config and artifact validation tests.
- ALTERNATIVE_FUTURES_PATH: Post-fault baseline regression checks.
- EXPLORATORY_MUTATION_BRANCH: Predictive structural path isolation.`;

      // GOVERN DECISION BEFORE SUBMITTING TO REAL SYSTEM
      const governance = decisionGovernor.governDecision(obj.id, recoveryTitle, rationale, this.currentEntropy);

      if (governance.shouldSuppress) {
        console.warn("[CRITICAL] Stable recovery procedure suppressed. Raising override signals!");
      }

      const dec = decisionEngine.createDecision(
        obj.id,
        recoveryTitle,
        rationale,
        'EXECUTIVE', // Always force EXECUTIVE for recovery paths
        governance.executionWeight
      );
      console.log(`[STABILIZATION MUTATION] Restoring trajectory loop parity: ${dec.id}`);
      
      if (this.autoApproveEnabled) {
        decisionEngine.updateDecisionStatus(dec.id, 'APPROVED');
      }
    }
  }

  private compactLedgerGaps(): void {
    try {
      const allD = decisionEngine.getAllDecisions();
      if (allD.length > 600) {
        console.log(`[LEDGER VACUUM] Truncating ancient indices to retain clean causal lookup space.`);
        decisionEngine.compactLedger(300);
      }
    } catch (e) {
      console.error("Ledger compaction error:", e);
    }
  }
}

export const objectiveExecutionLoop = ObjectiveExecutionLoop.getInstance();
