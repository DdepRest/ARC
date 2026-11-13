import { describe, it, expect, beforeEach } from 'vitest';
import { probeGhostInvariant, mapViolationReasonToPrefix } from './arcGhostTrap';

describe('A.R.C. Ghost Trap Scope Control Tests (Mini-TZ Verification)', () => {
  let mockElements: Record<string, any> = {};
  let mockLocalStorage: Record<string, string> = {};

  beforeEach(() => {
    mockElements = {};
    mockLocalStorage = {};

    delete (globalThis as any).__ARC_WEBGL_LOST__;
    delete (globalThis as any).__isReactorRafActive;
    delete (globalThis as any).__reactorFrameCount;
    delete (globalThis as any).__ARC_CAPTURED_GHOST__;

    const documentMock = {
      querySelector: (sel: string) => mockElements[sel] || null,
      querySelectorAll: () => [],
      getElementById: (id: string) => mockElements[`#${id}`] || null,
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          id: '',
          style: {},
          classList: { contains: () => false },
          textContent: '',
          appendChild: () => {},
          remove: () => {
            delete mockElements[`#${el.id}`];
          },
          getAttribute: () => '',
          closest: () => null,
        };
        return el;
      },
      body: {
        appendChild: (el: any) => {
          if (el.id) mockElements[`#${el.id}`] = el;
        },
      },
      documentElement: {
        style: {
          getPropertyValue: () => 'var(--accent)',
        },
      },
      elementsFromPoint: () => [],
    };

    (globalThis as any).document = documentMock;
    (globalThis as any).window = {
      innerWidth: 1920,
      innerHeight: 1080,
    };
    (globalThis as any).getComputedStyle = (el: any) => ({
      color: el?.style?.color || 'var(--arc-text-primary)',
      stroke: 'var(--accent)',
      strokeDasharray: '264 264',
      fill: 'none',
      backgroundColor: 'var(--arc-block)',
      borderColor: 'var(--arc-divider)',
      boxShadow: 'none',
      opacity: '1',
      zIndex: '10',
      getPropertyValue: () => 'var(--accent)',
    });

    (globalThis as any).localStorage = {
      getItem: (key: string) => mockLocalStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockLocalStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key];
      },
    };
  });

  it('1. NEGATIVE CONTROL: Tasks view active with FocusSprintView & SummaryMeter SVG rings in DOM under live 3D (flag=false, RAF active) -> GHOST badge does NOT appear and localStorage is clean', () => {
    // Canvas present inside [data-arc-reactor]
    mockElements['.reactor-canvas-container canvas'] = {
      width: 1920,
      height: 1080,
      style: { display: 'block' },
      classList: Object.assign(['reactor-canvas'], { contains: () => false, join: (s: string) => s }),
      closest: () => null,
    };

    // Note: SVG rings in Tasks workspace exist in real DOM, but do NOT match '[data-arc-reactor] ...'
    // Therefore document.querySelector('[data-arc-reactor] ...') returns null for rings.

    // Live 3D environment state
    (globalThis as any).__ARC_WEBGL_LOST__ = false;
    (globalThis as any).__isReactorRafActive = () => true;
    (globalThis as any).__reactorFrameCount = 300;

    const probeResult = probeGhostInvariant();
    const badge = (globalThis as any).document.getElementById('arc-ghost-captured-badge');
    const storedDump = (globalThis as any).localStorage.getItem('__ARC_CAPTURED_GHOST__');

    expect(probeResult).toBeNull();
    expect(badge).toBeNull();
    expect(storedDump).toBeNull();
  });

  it('2. POSITIVE CONTROL: Soft loss simulation (flag=true, fallback rings inside [data-arc-reactor]) -> HUD badge "GHOST 2D: stale 3D" APPEARS, dump is written to localStorage and survives reload', () => {
    // Canvas present inside [data-arc-reactor]
    mockElements['.reactor-canvas-container canvas'] = {
      width: 1920,
      height: 1080,
      style: { display: 'block' },
      classList: Object.assign(['reactor-canvas'], { contains: () => false, join: (s: string) => s }),
      closest: () => null,
    };

    // Fallback rings exist INSIDE [data-arc-reactor]
    mockElements['[data-arc-reactor] [data-arc-fallback-rings]'] = {
      tagName: 'DIV',
      classList: Object.assign(['reactor-fallback-rings'], { contains: () => false, join: (s: string) => 'reactor-fallback-rings' }),
      attributes: [{ name: 'data-arc-fallback-rings', value: 'true' }],
      getAttribute: () => '',
      getBoundingClientRect: () => ({ top: 100, left: 100, width: 256, height: 256 }),
      closest: () => ({ id: 'app' }),
    };

    // WebGL lost simulation
    (globalThis as any).__ARC_WEBGL_LOST__ = true;
    (globalThis as any).__isReactorRafActive = () => false;

    const probeResult = probeGhostInvariant();
    const badge = (globalThis as any).document.getElementById('arc-ghost-captured-badge');
    const storedDump = (globalThis as any).localStorage.getItem('__ARC_CAPTURED_GHOST__');

    expect(probeResult).not.toBeNull();
    expect(probeResult?.violationReason).toBe('GHOST 2D: stale 3D canvas visible under fallback');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('GHOST 2D:');
    expect(badge?.textContent).toMatch(/^🚨 GHOST 2D:/);
    expect(badge?.textContent).toContain('flag=true');
    expect(storedDump).not.toBeNull();

    if (storedDump) {
      const parsed = JSON.parse(storedDump);
      expect(parsed.violationReason).toBe('GHOST 2D: stale 3D canvas visible under fallback');
      expect(parsed.isWebglContextLost).toBe(true);
      expect(parsed.canvasDetails.hasCanvas).toBe(true);
      expect(Object.keys(parsed)).toEqual(expect.arrayContaining([
        'timestamp',
        'violationReason',
        'targetNode',
        'rootAccent',
        'isWebglContextLost',
        'isRafRunning',
        'rafFrames',
        'canvasDetails',
        'elementsAtCenter'
      ]));
    }

    // Explicit prefix mapping verification directly from production module arcGhostTrap.ts
    // 1. Soft loss mapping -> 'GHOST 2D:'
    expect(badge?.textContent).toMatch(/^🚨 GHOST 2D:/);
    expect(mapViolationReasonToPrefix('soft loss detected at step 3')).toBe('GHOST 2D:');
    expect(mapViolationReasonToPrefix('GHOST 2D: stale 3D canvas visible under fallback')).toBe('GHOST 2D:');

    // 2. Foreign helper violation mapping -> 'GHOST 3D/overlay:'
    expect(mapViolationReasonToPrefix('GHOST 3D: foreign scene object [GridHelper]')).toBe('GHOST 3D/overlay:');

    // 3. Invariant violation mapping -> 'LOST (2D):'
    expect(mapViolationReasonToPrefix('INVARIANT_VIOLATION: Ring node in DOM')).toBe('LOST (2D):');
  });
});
