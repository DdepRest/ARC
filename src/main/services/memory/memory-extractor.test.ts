import { describe, it, expect } from 'vitest';
import { MemoryExtractor } from './memory-extractor';

describe('MemoryExtractor', () => {
  const extractor = new MemoryExtractor();

  it('extracts "запомни что" as a fact', async () => {
    const results = await extractor.extract('Запомни что пароль от сервера 12345', '');
    expect(results.length).toBeGreaterThan(0);
    const fact = results.find(r => r.category === 'fact');
    expect(fact).toBeDefined();
    expect(fact?.value).toContain('пароль от сервера 12345');
  });

  it('extracts "мне не нравится" as a preference', async () => {
    const results = await extractor.extract('Мне не нравится громкая музыка по утрам', '');
    expect(results.length).toBeGreaterThan(0);
    const pref = results.find(r => r.category === 'preference');
    expect(pref).toBeDefined();
    expect(pref?.value).toContain('громкая музыка');
  });

  it('extracts "я работаю в" as a job fact', async () => {
    const results = await extractor.extract('Я работаю в лаборатории ядерной физики', '');
    expect(results.length).toBeGreaterThan(0);
    const fact = results.find(r => r.category === 'fact');
    expect(fact).toBeDefined();
    expect(fact?.key).toBe('user:job');
    expect(fact?.value).toContain('лаборатории ядерной физики');
  });

  it('extracts "я живу в" as a location fact', async () => {
    const results = await extractor.extract('Я живу в Санкт-Петербурге', '');
    expect(results.length).toBeGreaterThan(0);
    const fact = results.find(r => r.category === 'fact');
    expect(fact).toBeDefined();
    expect(fact?.key).toBe('user:location');
    expect(fact?.value).toContain('Санкт-Петербурге');
  });
});
