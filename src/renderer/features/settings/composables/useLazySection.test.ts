import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue') as any;
  return {
    ...actual,
    onMounted: vi.fn(),
    onUnmounted: vi.fn()
  };
});

import { useLazySection } from './useLazySection';

describe('useLazySection Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize visibleSections object', () => {
    const rootRef = ref(null);
    const { visibleSections } = useLazySection(rootRef);
    expect(visibleSections.value).toBeDefined();
    expect(typeof visibleSections.value).toBe('object');
  });
});
