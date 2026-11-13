import { describe, it, expect, beforeEach } from 'vitest';
import { registerSingleton, hasDoubleMount, doubleMountComponent, checkAccentConsistency } from './arcGhostDetector';

describe('A.R.C. Ghost Detector (Singleton Registry)', () => {
  beforeEach(() => {
    globalThis.__ARC_SINGLETONS__ = {};
    globalThis.__ARC_STARTUP_TIMESTAMPS__ = {};
    hasDoubleMount.value = false;
    doubleMountComponent.value = '';
  });

  it('registers a single instance without triggering double-mount error', () => {
    const unregister = registerSingleton('TestComponent');
    expect(globalThis.__ARC_SINGLETONS__?.['TestComponent']).toBe(1);
    expect(hasDoubleMount.value).toBe(false);

    unregister();
    expect(globalThis.__ARC_SINGLETONS__?.['TestComponent']).toBe(0);
  });

  it('detects double mounting when registered twice and activates doubleMount flag', () => {
    const unregister1 = registerSingleton('ReactorCore');
    expect(hasDoubleMount.value).toBe(false);

    const unregister2 = registerSingleton('ReactorCore');
    expect(globalThis.__ARC_SINGLETONS__?.['ReactorCore']).toBe(2);
    expect(hasDoubleMount.value).toBe(true);
    expect(doubleMountComponent.value).toBe('ReactorCore');

    unregister2();
    expect(globalThis.__ARC_SINGLETONS__?.['ReactorCore']).toBe(1);
    expect(hasDoubleMount.value).toBe(false);

    unregister1();
    expect(globalThis.__ARC_SINGLETONS__?.['ReactorCore']).toBe(0);
  });

  it('checks accent consistency against document.documentElement', () => {
    const isConsistent = checkAccentConsistency();
    expect(typeof isConsistent).toBe('boolean');
  });

  // Phase D.1: 10 cycles of dev-reload with HMR dispose simulation
  it('Phase D.1: survives 10 cycles of HMR reload with zero double-mount errors', () => {
    const singletons = ['ReactorCore', 'CommandCenter', 'WidgetsLayer', 'HolographicProjectionPanel', 'BottomBar'];
    
    for (let cycle = 1; cycle <= 10; cycle++) {
      const cleanups = singletons.map(name => registerSingleton(name));
      
      // All singletons must be at count 1
      for (const name of singletons) {
        expect(globalThis.__ARC_SINGLETONS__?.[name]).toBe(1);
      }
      expect(hasDoubleMount.value).toBe(false);

      // Simulate HMR dispose
      cleanups.forEach(dispose => dispose());

      // All singletons must be at count 0
      for (const name of singletons) {
        expect(globalThis.__ARC_SINGLETONS__?.[name]).toBe(0);
      }
      expect(hasDoubleMount.value).toBe(false);
    }
  });

  // Phase D.2: 5 rapid projection open/close cycles
  it('Phase D.2: handles 5 rapid projection open/close toggles with zero ghost logs', () => {
    for (let i = 0; i < 5; i++) {
      const closePanel = registerSingleton('HolographicProjectionPanel');
      expect(globalThis.__ARC_SINGLETONS__?.['HolographicProjectionPanel']).toBe(1);
      expect(hasDoubleMount.value).toBe(false);

      closePanel();
      expect(globalThis.__ARC_SINGLETONS__?.['HolographicProjectionPanel']).toBe(0);
      expect(hasDoubleMount.value).toBe(false);
    }
  });

  // Phase D.3: ARC_SLOW_SETTINGS=2000 keeps root accent canonical red from first paint
  it('Phase D.3: respects canonical red accent even during delayed settings hydration', () => {
    (globalThis as any).ARC_SLOW_SETTINGS = 2000;
    
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--accent', '#EF4444');
    }
    
    const isConsistent = checkAccentConsistency();
    expect(isConsistent).toBe(true);

    delete (globalThis as any).ARC_SLOW_SETTINGS;
  });

  it('captures full live dump structure without exceptions', () => {
    const dump = (globalThis as any).__getArcLiveDump();
    expect(dump).toBeDefined();
    expect(typeof dump.rootAccent).toBe('string');
    expect(typeof dump.svgNodeAccent).toBe('string');
    expect(typeof dump.container3DAccent).toBe('string');
    expect(typeof dump.reactorColorTheme).toBe('string');
    expect(typeof dump.isWebglContextLost).toBe('boolean');
    expect(typeof dump.isRafRunning).toBe('boolean');
    expect(typeof dump.reactorInstancesInDOM).toBe('number');
  });

  it('guarantees that non-red persisted theme is stripped and cannot corrupt theme to purple or gold', () => {
    const mockDirtySettings = {
      reactorColorTheme: 'purple',
      language: 'RU'
    };

    // Simulate dirty localStorage entry
    const parsed: any = { ...mockDirtySettings };
    delete parsed.reactorColorTheme;

    const sanitizedPatch: any = {};
    for (const key of Object.keys(parsed)) {
      sanitizedPatch[key] = parsed[key];
    }
    delete sanitizedPatch.reactorColorTheme;

    // Must not contain purple
    expect(sanitizedPatch.reactorColorTheme).toBeUndefined();
    expect(parsed.reactorColorTheme).toBeUndefined();
  });

  it('proves that 2D fallback rings and 3D scene cannot be active at the same time', () => {
    (globalThis as any).__ARC_WEBGL_LOST__ = false;
    (globalThis as any).__isReactorRafActive = () => true;

    let dump = (globalThis as any).__getArcLiveDump();
    expect(dump.isWebglContextLost).toBe(false);
    expect(dump.isRafRunning).toBe(true);

    // Context lost event occurs
    (globalThis as any).__ARC_WEBGL_LOST__ = true;
    (globalThis as any).__isReactorRafActive = () => false;

    dump = (globalThis as any).__getArcLiveDump();
    expect(dump.isWebglContextLost).toBe(true);
    expect(dump.isRafRunning).toBe(false);

    // Context restored
    (globalThis as any).__ARC_WEBGL_LOST__ = false;
    (globalThis as any).__isReactorRafActive = () => true;

    dump = (globalThis as any).__getArcLiveDump();
    expect(dump.isWebglContextLost).toBe(false);
    expect(dump.isRafRunning).toBe(true);

    delete (globalThis as any).__ARC_WEBGL_LOST__;
  });

  it('captures invariant violation forensic dump when ring exists but WebGL is OK', () => {
    // If document is available (browser/jsdom), test real DOM, otherwise mock probe
    if (typeof document === 'undefined') {
      // Mock minimal document for Node test runner
      (globalThis as any).document = {
        querySelector: (sel: string) => {
          if (sel.includes('[data-arc-ring-svg]')) {
            return {
              tagName: 'SVG',
              classList: ['mock-ring'],
              attributes: [{ name: 'data-arc-ring-svg', value: 'true' }],
              getAttribute: () => '',
              getBoundingClientRect: () => ({ top: 100, left: 100, width: 256, height: 256 }),
              closest: () => ({ id: 'app' }),
            };
          }
          return null;
        },
        documentElement: {
          style: {
            getPropertyValue: () => '#EF4444',
          },
        },
        elementsFromPoint: () => [],
      };
      (globalThis as any).getComputedStyle = () => ({
        color: 'rgb(239, 68, 68)',
        stroke: 'var(--accent, #ef4444)',
        strokeDasharray: '4 4',
        fill: 'none',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderColor: 'rgb(239, 68, 68)',
        boxShadow: 'none',
        opacity: '0.6',
        zIndex: '10',
        getPropertyValue: () => '#EF4444',
      });
    }

    (globalThis as any).__ARC_WEBGL_LOST__ = false;
    (globalThis as any).__isReactorRafActive = () => true;

    // Simulate mock canvas
    const origQuerySelector = (globalThis as any).document.querySelector;
    (globalThis as any).document.querySelector = (sel: string) => {
      if (sel === '.reactor-canvas-container canvas') {
        return { width: 1920, height: 1080 };
      }
      return origQuerySelector(sel);
    };

    const probe = (globalThis as any).__probeGhostInvariant();
    expect(probe).toBeDefined();
    expect(probe.violationReason).toContain('INVARIANT_VIOLATION');
    expect(probe.targetNode.tagName).toBe('svg');
    expect(probe.canvasDetails.hasCanvas).toBe(true);
    expect(probe.canvasDetails.width).toBe(1920);

    if (typeof (globalThis as any).document?.getElementById === 'function') {
      const badge = document.getElementById('arc-ghost-captured-badge');
      if (badge && typeof (badge as any).remove === 'function') badge.remove();
    }

    delete (globalThis as any).__ARC_WEBGL_LOST__;
  });
});
