import { describe, it, expect, vi } from 'vitest';
import { CoreClassifier } from './core-classifier';

vi.mock('../../../shared/utils/stop-command', () => ({
  isStopCommand: vi.fn((text) => text === 'стоп')
}));

vi.mock('../memory/memory-manager', () => ({
  memoryManager: {
    enrichContext: vi.fn().mockResolvedValue({
      contextString: '',
      userPreferences: [{ key: 'pref:цвет', value: 'синий' }],
      relevantFacts: []
    })
  }
}));

describe('CoreClassifier', () => {
  it('should handle hard stop', async () => {
    const result = await CoreClassifier.classify('стоп', 'стоп', false);
    expect(result).toBe('Остановлено.');
  });

  it('should not intercept greetings and let them pass to AI model', async () => {
    const result = await CoreClassifier.classify('привет', 'привет', false);
    expect(result).toBeNull();
  });

  it('should answer about preferences from memory', async () => {
    const result = await CoreClassifier.classify('какой мой любимый цвет', 'какой мой любимый цвет', false);
    expect(result).toBe('Ваш цвет — синий');
  });

  it('should not hijack normal conversational questions containing как or что', async () => {
    const result = await CoreClassifier.classify(
      'как ты понял что это труба я ведь сказал что три буквы в слове',
      'как ты понял что это труба я ведь сказал что три буквы в слове',
      false
    );
    expect(result).toBeNull();
  });
});
