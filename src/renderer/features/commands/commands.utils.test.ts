import { describe, it, expect } from 'vitest';
import { generateGratitudeResponse } from './commands.utils';

describe('generateGratitudeResponse', () => {
  it('should return a polite Russian response', () => {
    const response = generateGratitudeResponse(false);
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    expect([
      'Рад помочь.',
      'Пожалуйста.',
      'Всегда рад.',
      'Обращайтесь.',
      'На связи.'
    ]).toContain(response);
  });

  it('should return a polite English response', () => {
    const response = generateGratitudeResponse(true);
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    expect(['Glad to help.', 'Always glad to assist.', 'Anytime.', 'You are welcome.']).toContain(response);
  });
});
