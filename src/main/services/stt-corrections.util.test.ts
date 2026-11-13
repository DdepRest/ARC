import { describe, it, expect } from 'vitest';
import { applyCorrections } from './stt-corrections.util';

describe('applyCorrections', () => {
  it('corrects "как джон" to "как дела"', () => {
    expect(applyCorrections('как джон')).toBe('как дела');
    expect(applyCorrections('Арк, как джон?')).toBe('Арк, как дела?');
    expect(applyCorrections('как дон')).toBe('как дела');
    expect(applyCorrections('побела')).toBe('как дела');
  });

  it('corrects "то ты" variants to "кто ты"', () => {
    expect(applyCorrections('то ты')).toBe('кто ты');
    expect(applyCorrections('то такой')).toBe('кто такой');
    expect(applyCorrections('то создал')).toBe('кто создал');
  });

  it('preserves unrelated text', () => {
    expect(applyCorrections('как дела')).toBe('как дела');
    expect(applyCorrections('включи музыку')).toBe('включи музыку');
  });
});
