import { describe, it, expect, beforeEach } from 'vitest';
import { useCollapsedSections } from './useCollapsedSections';

describe('useCollapsedSections Unit Tests', () => {
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
  });

  it('should toggle collapse state of a section', () => {
    const { isCollapsed, toggleCollapsed } = useCollapsedSections();
    const secId = 'test-section-1';

    expect(isCollapsed(secId)).toBe(false);

    toggleCollapsed(secId);
    expect(isCollapsed(secId)).toBe(true);

    toggleCollapsed(secId);
    expect(isCollapsed(secId)).toBe(false);
  });
});
