import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from './settings.store';

describe('SettingsStore Defaults & Wake Words', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should have sttKeywordsEnabled === true by default', () => {
    const store = useSettingsStore();
    expect(store.sttKeywordsEnabled).toBe(true);
  });

  it('should have robust default wakeWords list without short <3 char noise variants', () => {
    const store = useSettingsStore();
    expect(Array.isArray(store.wakeWords)).toBe(true);
    expect(store.wakeWords).toContain('A.R.C.');
    expect(store.wakeWords).toContain('Арк');
    expect(store.wakeWords).toContain('Алекс');
    expect(store.wakeWords).toContain('Джарвис');
    expect(store.wakeWords).toContain('Компьютер');

    // Ensure no short invalid noise variants like 'эй', 'ар', 'эи' exist in defaults
    const shortNoisyVariants = store.wakeWords.filter(
      (w) => w.length < 3 && w.toLowerCase() !== 'арк',
    );
    expect(shortNoisyVariants.length).toBe(0);
  });
});
