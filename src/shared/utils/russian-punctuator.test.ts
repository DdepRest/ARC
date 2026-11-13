import { describe, it, expect } from 'vitest';
import { restorePunctuation } from './russian-punctuator';

describe('russian-punctuator', () => {
  it('should restore punctuation for introduction and reciprocal presentation', () => {
    const raw = 'Хочу познакомить тебя с леной знакомься, АРК, это Лена Лена это, АРК.';
    const formatted = restorePunctuation(raw);
    expect(formatted).toBe('Хочу познакомить тебя с Леной. Знакомься: АРК, это Лена. Лена, это АРК.');
  });

  it('should restore commas and dash for user sentence', () => {
    const raw = 'хочу познакомить тебя с леной арк это лена лена это арк';
    const formatted = restorePunctuation(raw);
    expect(formatted).toContain('АРК');
    expect(formatted).toContain('Лена');
    expect(formatted.endsWith('.')).toBe(true);
    expect(formatted.startsWith('Хочу')).toBe(true);
  });

  it('should format greetings properly', () => {
    const raw = 'привет как твои дела';
    const formatted = restorePunctuation(raw);
    expect(formatted).toBe('Привет, как твои дела?');
  });

  it('should format conjunctions properly', () => {
    const raw = 'я пришел потому что хотел спросить о погоде';
    const formatted = restorePunctuation(raw);
    expect(formatted).toBe('Я пришел, потому что хотел спросить о погоде.');
  });

  it('should add question mark for questions', () => {
    const raw = 'что ты думаешь об этом';
    const formatted = restorePunctuation(raw);
    expect(formatted).toBe('Что ты думаешь об этом?');
  });

  it('should handle already punctuated text gracefully without double commas', () => {
    const raw = 'Привет, как дела?';
    const formatted = restorePunctuation(raw);
    expect(formatted).toBe('Привет, как дела?');
  });
});
