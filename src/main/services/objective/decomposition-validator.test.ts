import { describe, it, expect } from 'vitest';
import {
  normalizeString,
  extractJsonFromText,
  validateDecompositionPayload,
  MAX_OUTCOMES,
  MAX_DECISIONS,
  MAX_TASKS,
  MAX_RISKS
} from './decomposition-validator';

describe('Decomposition Validator & Normalizer', () => {
  it('exports correct architectural limits (5, 5, 7, 5)', () => {
    expect(MAX_OUTCOMES).toBe(5);
    expect(MAX_DECISIONS).toBe(5);
    expect(MAX_TASKS).toBe(7);
    expect(MAX_RISKS).toBe(5);
  });
  describe('normalizeString', () => {
    it('strips list markers and numbering (1., 1), -, *, •)', () => {
      expect(normalizeString('1. Create database schema')).toBe('create database schema');
      expect(normalizeString('2) Run migrations')).toBe('run migrations');
      expect(normalizeString('- Review code')).toBe('review code');
      expect(normalizeString('* Verify tests')).toBe('verify tests');
      expect(normalizeString('• Polish UI')).toBe('polish ui');
    });

    it('strips step prefixes and bracketed tags', () => {
      expect(normalizeString('Step 1: Init project')).toBe('init project');
      expect(normalizeString('Шаг 2. Запуск сервиса')).toBe('запуск сервиса');
      expect(normalizeString('[AI Step 1] Design architecture')).toBe('design architecture');
      expect(normalizeString('[Локальный шаблон — ИИ офлайн] Спроектировать интерфейсы')).toBe('спроектировать интерфейсы');
    });

    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeString('   Refactor   Core   Engine   ')).toBe('refactor core engine');
    });

    it('handles empty or non-string input safely', () => {
      expect(normalizeString('')).toBe('');
      expect(normalizeString(null as any)).toBe('');
      expect(normalizeString(undefined as any)).toBe('');
    });
  });

  describe('extractJsonFromText', () => {
    it('parses pure JSON string', () => {
      const json = JSON.stringify({ outcomes: [], decisions: [] });
      expect(extractJsonFromText(json)).toEqual({ outcomes: [], decisions: [] });
    });

    it('extracts JSON enclosed in markdown code fences', () => {
      const text = 'Here is your decomposition:\n```json\n{"status": "ok", "count": 42}\n```\nHope it helps!';
      expect(extractJsonFromText(text)).toEqual({ status: 'ok', count: 42 });
    });

    it('extracts JSON enclosed in plain code fences without language tag', () => {
      const text = '```\n{"status": "ready"}\n```';
      expect(extractJsonFromText(text)).toEqual({ status: 'ready' });
    });

    it('extracts JSON when surrounded by commentary without code fences', () => {
      const text = 'System analysis output: {"valid": true, "code": 200} End of report.';
      expect(extractJsonFromText(text)).toEqual({ valid: true, code: 200 });
    });

    it('throws error when no valid JSON object structure is found', () => {
      expect(() => extractJsonFromText('Just random plain text without brackets')).toThrow();
      expect(() => extractJsonFromText('')).toThrow();
    });
  });

  describe('validateDecompositionPayload', () => {
    const validSample = {
      outcomes: [
        {
          title: 'Achieve 95% test coverage',
          metric_name: 'test_coverage',
          metric_source: { type: 'CLI_OUTPUT', target_uri: 'npm test' },
          baseline_value: 80,
          target_value: 95
        }
      ],
      decisions: [
        {
          title: 'Adopt Vitest integration',
          rationale: 'Vitest provides fast ESM testing with native Vite support',
          action: { type: 'CLI_CMD', target: 'system', cmd: 'npm test' }
        }
      ],
      tasks: [
        {
          text: 'Configure vitest.config.ts and root scripts',
          estimatedMinutes: 30,
          priority: 'high'
        }
      ],
      risks: [
        {
          description: 'Flaky asynchronous tests in CI runner',
          likelihood: 0.25,
          impact: 0.6
        }
      ]
    };

    it('validates a complete, correctly formed payload', () => {
      const result = validateDecompositionPayload(validSample);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toBeDefined();
      expect(result.data!.outcomes).toHaveLength(1);
      expect(result.data!.decisions).toHaveLength(1);
      expect(result.data!.tasks).toHaveLength(1);
      expect(result.data!.risks).toHaveLength(1);
    });

    it('rejects non-object or null payload', () => {
      expect(validateDecompositionPayload(null).valid).toBe(false);
      expect(validateDecompositionPayload('string').valid).toBe(false);
      expect(validateDecompositionPayload([]).valid).toBe(false);
    });

    it('flags missing or empty required arrays', () => {
      const result = validateDecompositionPayload({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('clamps risk likelihood and impact to [0.0, 1.0]', () => {
      const payload = {
        ...validSample,
        risks: [
          { description: 'Extreme risk test', likelihood: 2.5, impact: -0.5 }
        ]
      };
      const result = validateDecompositionPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.data!.risks[0].likelihood).toBe(1.0);
      expect(result.data!.risks[0].impact).toBe(0.0);
    });

    it('clamps task estimatedMinutes to [5, 480] and defaults to 30', () => {
      const payload = {
        ...validSample,
        tasks: [
          { text: 'Quick fix', estimatedMinutes: 1 },
          { text: 'Massive rewrite', estimatedMinutes: 9999 }
        ]
      };
      const result = validateDecompositionPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.data!.tasks[0].estimatedMinutes).toBe(5);
      expect(result.data!.tasks[1].estimatedMinutes).toBe(480);
    });

    it('caps array sizes to configured limits (outcomes: 5, decisions: 5, tasks: 7, risks: 5)', () => {
      const payload = {
        outcomes: Array(10).fill({ title: 'Outcome title test', metric_name: 'm' }),
        decisions: Array(10).fill({ title: 'Decision title test', rationale: 'Rationale test details' }),
        tasks: Array(20).fill({ text: 'Task item text' }),
        risks: Array(10).fill({ description: 'Risk item description' })
      };
      const result = validateDecompositionPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.data!.outcomes).toHaveLength(5);
      expect(result.data!.decisions).toHaveLength(5);
      expect(result.data!.tasks).toHaveLength(7);
      expect(result.data!.risks).toHaveLength(5);
    });

    it('specifically caps 6 outcomes to 5 and 8 tasks to 7', () => {
      const payload = {
        outcomes: Array(6).fill({ title: 'Outcome title test', metric_name: 'm' }),
        decisions: Array(6).fill({ title: 'Decision title test', rationale: 'Rationale test details' }),
        tasks: Array(8).fill({ text: 'Task item text' }),
        risks: Array(6).fill({ description: 'Risk item description' })
      };
      const result = validateDecompositionPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.data!.outcomes).toHaveLength(5);
      expect(result.data!.decisions).toHaveLength(5);
      expect(result.data!.tasks).toHaveLength(7);
      expect(result.data!.risks).toHaveLength(5);
    });
  });
});
