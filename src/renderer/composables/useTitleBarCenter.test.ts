import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useTitleBarCenter } from './useTitleBarCenter';

describe('useTitleBarCenter', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('removeEventListener', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockElement = (rect: { left: number; right: number; width: number; height: number }, scrollWidth?: number) => {
    return ref({
      getBoundingClientRect: () => rect,
      offsetWidth: rect.width,
      scrollWidth: scrollWidth || rect.width
    } as unknown as HTMLElement);
  };

  it('calculates exact 50% dead-center when ample space is available', () => {
    // Window width: 1200px
    const containerRef = createMockElement({ left: 0, right: 1200, width: 1200, height: 38 });
    // Left logo: 0 to 110px
    const leftSectionRef = createMockElement({ left: 14, right: 110, width: 96, height: 38 });
    // Center items: natural width 400px
    const centerSectionRef = createMockElement({ left: 0, right: 400, width: 400, height: 38 }, 400);
    // Right section: 920px to 1200px (width 280px)
    const rightSectionRef = createMockElement({ left: 920, right: 1200, width: 280, height: 38 });

    const { centerLeft, updateCenterPosition } = useTitleBarCenter({
      containerRef,
      leftSectionRef,
      centerSectionRef,
      rightSectionRef,
      minGap: 12
    });

    updateCenterPosition();

    // Ideal center: (1200 - 400) / 2 = 400px
    // Center midpoint: 400 + 200 = 600px (exact 50% of 1200)
    expect(centerLeft.value).toBe(400);
  });

  it('dynamically yields and moves left when right section approaches', () => {
    // Window width: 1000px
    const containerRef = createMockElement({ left: 0, right: 1000, width: 1000, height: 38 });
    // Left logo: 110px
    const leftSectionRef = createMockElement({ left: 14, right: 110, width: 96, height: 38 });
    // Center items: 400px
    const centerSectionRef = createMockElement({ left: 0, right: 400, width: 400, height: 38 }, 400);
    // Right section is wide (e.g. 350px, starts at 650px)
    const rightSectionRef = createMockElement({ left: 650, right: 1000, width: 350, height: 38 });

    const { centerLeft, updateCenterPosition } = useTitleBarCenter({
      containerRef,
      leftSectionRef,
      centerSectionRef,
      rightSectionRef,
      minGap: 12
    });

    updateCenterPosition();

    // Ideal center: (1000 - 400) / 2 = 300px.
    // If it stayed at 300px, right edge would be at 700px, overlapping right section (starts at 650px).
    // With dynamic yielding: maxLeft = 650 - 12 - 400 = 238px.
    // Center yields to the left to maintain 12px gap!
    expect(centerLeft.value).toBe(238);
  });

  it('clamps and caps max-width when window is heavily constrained', () => {
    // Narrow window width: 500px
    const containerRef = createMockElement({ left: 0, right: 500, width: 500, height: 38 });
    // Left: 120px
    const leftSectionRef = createMockElement({ left: 0, right: 120, width: 120, height: 38 });
    // Center wants 400px
    const centerSectionRef = createMockElement({ left: 0, right: 400, width: 400, height: 38 }, 400);
    // Right: 250px (starts at 250px)
    const rightSectionRef = createMockElement({ left: 250, right: 500, width: 250, height: 38 });

    const { centerLeft, centerMaxWidth, updateCenterPosition } = useTitleBarCenter({
      containerRef,
      leftSectionRef,
      centerSectionRef,
      rightSectionRef,
      minGap: 10
    });

    updateCenterPosition();

    // Available space between: (250 - 10) - (120 + 10) = 240 - 130 = 110px
    expect(centerLeft.value).toBe(130);
    expect(centerMaxWidth.value).toBe(110);
  });
});
