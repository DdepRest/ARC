/**
 * Manual validator and normalization utility for AI Objective & Task Decomposition.
 * Zero external schema dependencies (no zod, no ajv).
 */

export interface DecomposedOutcomeItem {
  title: string;
  metric_name: string;
  metric_source: {
    type: 'FILE_SCAN' | 'CLI_OUTPUT' | 'SQL_QUERY' | 'EXTERNAL_API';
    target_uri: string;
    payload?: Record<string, any>;
  };
  baseline_value: number;
  target_value: number;
}

export interface DecomposedDecisionItem {
  title: string;
  rationale: string;
  action?: {
    type: 'CLI_CMD' | 'FILE_WRITE' | 'IPC_CALL';
    target?: string;
    cmd?: string;
    path?: string;
  };
}

export interface DecomposedTaskItem {
  text: string;
  estimatedMinutes?: number;
  priority?: 'low' | 'medium' | 'high';
}

export interface DecomposedRiskItem {
  description: string;
  likelihood: number; // [0.0, 1.0]
  impact: number;     // [0.0, 1.0]
}

export interface DecompositionDraft {
  objectiveId: string;
  source: 'ai' | 'fallback';
  outcomes: DecomposedOutcomeItem[];
  decisions: DecomposedDecisionItem[];
  tasks: DecomposedTaskItem[];
  risks: DecomposedRiskItem[];
  rawPromptText?: string;
  createdAt: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: {
    outcomes: DecomposedOutcomeItem[];
    decisions: DecomposedDecisionItem[];
    tasks: DecomposedTaskItem[];
    risks: DecomposedRiskItem[];
  };
}

/**
 * Normalizes strings for deduplication:
 * - strips markdown formatting, bullets, numbering (e.g. "1. ", "Step 1: ", "- ")
 * - strips bracketed prefixes (e.g. "[AI Step 1] ", "[Локальный шаблон]")
 * - trims and collapses whitespace, converts to lowercase
 */
export function normalizeString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^(\d+[\.\)]\s*|[-*•]\s*|(?:step|шаг)\s*\d+[:\.]?\s*)/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Extracts and parses JSON from raw LLM output, handling markdown code fences
 * or leading/trailing commentary.
 */
export function extractJsonFromText(text: string): any {
  if (!text || typeof text !== 'string') {
    throw new Error('Input text is empty or not a string');
  }

  let cleaned = text.trim();

  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 2. Direct JSON parse attempt
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // 3. Fallback: locate first '{' and last '}'
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const candidate = cleaned.substring(startIdx, endIdx + 1);
      return JSON.parse(candidate);
    }
    throw new Error('No valid JSON object structure found in response text');
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Strict manual validator verifying structural boundaries and data types
 * without any external libraries.
 */
export const MAX_OUTCOMES = 5;
export const MAX_DECISIONS = 5;
export const MAX_TASKS = 7;
export const MAX_RISKS = 5;

export function validateDecompositionPayload(raw: any): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  // 1. Validate Outcomes (1..5)
  const outcomes: DecomposedOutcomeItem[] = [];
  if (!Array.isArray(raw.outcomes)) {
    errors.push('Field "outcomes" must be an array');
  } else {
    if (raw.outcomes.length === 0) {
      errors.push('At least 1 outcome is required (1..5)');
    }
    const maxOutcomes = Math.min(raw.outcomes.length, MAX_OUTCOMES);
    for (let i = 0; i < maxOutcomes; i++) {
      const item = raw.outcomes[i];
      if (!item || typeof item !== 'object') {
        errors.push(`Outcome #${i + 1} is not an object`);
        continue;
      }
      const title = String(item.title || '').trim();
      if (title.length < 3 || title.length > 160) {
        errors.push(`Outcome #${i + 1} title length must be 3..160 chars`);
      }
      const metricName = String(item.metric_name || 'metric_delta').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const validTypes = ['FILE_SCAN', 'CLI_OUTPUT', 'SQL_QUERY', 'EXTERNAL_API'];
      const rawType = item.metric_source?.type;
      const type = validTypes.includes(rawType) ? rawType : 'CLI_OUTPUT';
      const targetUri = String(item.metric_source?.target_uri || 'npm run lint').trim();

      outcomes.push({
        title,
        metric_name: metricName || 'metric_delta',
        metric_source: { type, target_uri: targetUri },
        baseline_value: Number(item.baseline_value) || 0,
        target_value: Number(item.target_value ?? 1)
      });
    }
  }

  // 2. Validate Decisions (1..5)
  const decisions: DecomposedDecisionItem[] = [];
  if (!Array.isArray(raw.decisions)) {
    errors.push('Field "decisions" must be an array');
  } else {
    if (raw.decisions.length === 0) {
      errors.push('At least 1 decision is required (1..5)');
    }
    const maxDecisions = Math.min(raw.decisions.length, MAX_DECISIONS);
    for (let i = 0; i < maxDecisions; i++) {
      const item = raw.decisions[i];
      if (!item || typeof item !== 'object') {
        errors.push(`Decision #${i + 1} is not an object`);
        continue;
      }
      const title = String(item.title || '').trim();
      const rationale = String(item.rationale || item.description || '').trim();
      if (title.length < 3 || title.length > 160) {
        errors.push(`Decision #${i + 1} title length must be 3..160 chars`);
      }
      if (rationale.length < 5 || rationale.length > 500) {
        errors.push(`Decision #${i + 1} rationale length must be 5..500 chars`);
      }

      let action: DecomposedDecisionItem['action'] | undefined = undefined;
      if (item.action && typeof item.action === 'object') {
        const rawActionType = item.action.type;
        const validActionTypes = ['CLI_CMD', 'FILE_WRITE', 'IPC_CALL'];
        const actionType = validActionTypes.includes(rawActionType) ? rawActionType : 'CLI_CMD';
        action = {
          type: actionType,
          target: String(item.action.target || item.action.path || 'system'),
          cmd: item.action.cmd ? String(item.action.cmd) : undefined,
          path: item.action.path ? String(item.action.path) : undefined
        };
      }

      decisions.push({
        title,
        rationale: rationale || 'Архитектурное решение в рамках декомпозиции цели',
        action
      });
    }
  }

  // 3. Validate Tasks (1..7)
  const tasks: DecomposedTaskItem[] = [];
  if (!Array.isArray(raw.tasks)) {
    errors.push('Field "tasks" must be an array');
  } else {
    if (raw.tasks.length === 0) {
      errors.push('At least 1 task is required (1..7)');
    }
    const maxTasks = Math.min(raw.tasks.length, MAX_TASKS);
    for (let i = 0; i < maxTasks; i++) {
      const item = raw.tasks[i];
      const text = typeof item === 'string' ? item.trim() : String(item?.text || '').trim();
      if (text.length < 3 || text.length > 200) {
        errors.push(`Task #${i + 1} text length must be 3..200 chars`);
      }
      const estMin = typeof item === 'object' && item?.estimatedMinutes ? clamp(Number(item.estimatedMinutes) || 30, 5, 480) : 30;
      const rawPriority = typeof item === 'object' ? item?.priority : 'medium';
      const priority = ['low', 'medium', 'high'].includes(rawPriority) ? rawPriority : 'medium';

      tasks.push({
        text,
        estimatedMinutes: estMin,
        priority: priority as 'low' | 'medium' | 'high'
      });
    }
  }

  // 4. Validate Risks (1..5)
  const risks: DecomposedRiskItem[] = [];
  if (!Array.isArray(raw.risks)) {
    errors.push('Field "risks" must be an array');
  } else {
    if (raw.risks.length === 0) {
      errors.push('At least 1 risk is required (1..5)');
    }
    const maxRisks = Math.min(raw.risks.length, MAX_RISKS);
    for (let i = 0; i < maxRisks; i++) {
      const item = raw.risks[i];
      if (!item || typeof item !== 'object') {
        errors.push(`Risk #${i + 1} is not an object`);
        continue;
      }
      const description = String(item.description || '').trim();
      if (description.length < 3 || description.length > 200) {
        errors.push(`Risk #${i + 1} description length must be 3..200 chars`);
      }
      const likelihood = Number(clamp(Number(item.likelihood) || 0.3, 0.0, 1.0).toFixed(2));
      const impact = Number(clamp(Number(item.impact) || 0.5, 0.0, 1.0).toFixed(2));

      risks.push({
        description,
        likelihood,
        impact
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      outcomes,
      decisions,
      tasks,
      risks
    }
  };
}
