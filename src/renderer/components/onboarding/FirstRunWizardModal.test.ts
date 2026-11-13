import { describe, it, expect } from 'vitest';
import { completeFirstRunWizard } from './utils/complete-wizard';
import {
  recommendGraphicsPreset,
  isUltraPlusAvailable
} from './utils/recommend-preset';

describe('FirstRunWizard Logic & Recommendations', () => {
  it('1. completeFirstRunWizard marks firstRunCompleted and sets onboardingVersion', () => {
    const mockStore = {
      firstRunCompleted: false,
      onboardingVersion: 0
    };

    completeFirstRunWizard(mockStore);

    expect(mockStore.firstRunCompleted).toBe(true);
    expect(mockStore.onboardingVersion).toBe(1);
  });

  it('2. recommendGraphicsPreset accurately maps TZ VRAM thresholds (4096 / 8192)', () => {
    // Probing unavailable / null / undefined / NaN / <= 0 -> Medium
    expect(recommendGraphicsPreset(null)).toBe('Medium');
    expect(recommendGraphicsPreset(undefined)).toBe('Medium');
    expect(recommendGraphicsPreset(Number.NaN)).toBe('Medium');
    expect(recommendGraphicsPreset(0)).toBe('Medium');
    expect(recommendGraphicsPreset(-512)).toBe('Medium');

    // < 4096 MB -> Low
    expect(recommendGraphicsPreset(2048)).toBe('Low');
    expect(recommendGraphicsPreset(4095)).toBe('Low');

    // 4096 MB .. 8191 MB -> Medium
    expect(recommendGraphicsPreset(4096)).toBe('Medium');
    expect(recommendGraphicsPreset(8191)).toBe('Medium');

    // >= 8192 MB -> High (Ultra and UltraPlus are never auto-recommended)
    expect(recommendGraphicsPreset(8192)).toBe('High');
    expect(recommendGraphicsPreset(12288)).toBe('High');
  });

  it('3. isUltraPlusAvailable enforces 12GB (12288 MB) threshold and returns false on null', () => {
    // Unknown / unprobed VRAM -> false
    expect(isUltraPlusAvailable(null)).toBe(false);
    expect(isUltraPlusAvailable(undefined)).toBe(false);
    expect(isUltraPlusAvailable(Number.NaN)).toBe(false);
    expect(isUltraPlusAvailable(0)).toBe(false);

    // Below 12288 MB -> false
    expect(isUltraPlusAvailable(8192)).toBe(false);
    expect(isUltraPlusAvailable(12287)).toBe(false);

    // >= 12288 MB -> true
    expect(isUltraPlusAvailable(12288)).toBe(true);
    expect(isUltraPlusAvailable(16384)).toBe(true);
  });
});
