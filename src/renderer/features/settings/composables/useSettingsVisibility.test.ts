import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsVisibility } from './useSettingsVisibility';
import settingsRegistry from '../../../../../docs/ui-inventory/settings-registry.json';

describe('useSettingsVisibility', () => {
  beforeEach(() => {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString();
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        }
      };
    })();
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should initialize with compact mode enabled by default', () => {
    const { isCompactMode, visibleControlsCount, totalControlsCount } = useSettingsVisibility();
    expect(totalControlsCount.value).toBe(settingsRegistry.settings.length);
    expect(isCompactMode.value).toBe(true);
    const expectedVisible = settingsRegistry.settings.filter(
      (s: any) => s.frequency !== 'setup-once' && s.frequency !== 'debug-only'
    ).length;
    expect(visibleControlsCount.value).toBe(expectedVisible);
  });

  it('should hide setup-once and debug-only controls when in compact mode', () => {
    const { isCompactMode, setCompactMode, isControlVisible } = useSettingsVisibility();
    setCompactMode(true);
    expect(isCompactMode.value).toBe(true);

    // setup-once control
    expect(isControlVisible('settings.stt.auto_clear_cache')).toBe(false);
    expect(isControlVisible('voiceAutoClearCache')).toBe(false);

    // weekly / daily control
    expect(isControlVisible('settings.general.language')).toBe(true);
  });

  it('should show all controls when compact mode is toggled off', () => {
    const { isCompactMode, setCompactMode, isControlVisible, visibleControlsCount } = useSettingsVisibility();
    setCompactMode(false);
    expect(isCompactMode.value).toBe(false);
    expect(visibleControlsCount.value).toBe(settingsRegistry.settings.length);

    expect(isControlVisible('settings.stt.auto_clear_cache')).toBe(true);
    expect(isControlVisible('voiceAutoClearCache')).toBe(true);
  });
});
