/**
 * A.R.C. Singleton Registry & Ghost Detector (ТЗ P1.3-R)
 * Detects double-mounting, startup race conditions, and CSS accent drift.
 */
import { ref } from 'vue';

declare global {
  // eslint-disable-next-line no-var
  var __ARC_SINGLETONS__: Record<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __ARC_STARTUP_TIMESTAMPS__: Record<string, number> | undefined;
}

if (typeof globalThis !== 'undefined') {
  if (!globalThis.__ARC_SINGLETONS__) {
    globalThis.__ARC_SINGLETONS__ = {};
  }
  if (!globalThis.__ARC_STARTUP_TIMESTAMPS__) {
    globalThis.__ARC_STARTUP_TIMESTAMPS__ = {};
  }
}

export const hasDoubleMount = ref(false);
export const doubleMountComponent = ref<string>('');

export interface SingletonRegistration {
  name: string;
  unregister: () => void;
}

/**
 * Registers a component as an expected singleton.
 * If count > 1, logs console.error and marks double-mount state for TitleBar.
 */
export function registerSingleton(name: string): () => void {
  if (typeof globalThis === 'undefined' || !globalThis.__ARC_SINGLETONS__) {
    return () => {};
  }

  const singletons = globalThis.__ARC_SINGLETONS__;
  const timestamps = globalThis.__ARC_STARTUP_TIMESTAMPS__;

  // Record mount timestamp
  if (timestamps) {
    timestamps[name] = performance.now();
  }

  singletons[name] = (singletons[name] || 0) + 1;
  const count = singletons[name];

  if (count > 1) {
    console.error(`ARC GHOST: double mount [${name}] (count: ${count})`);
    hasDoubleMount.value = true;
    doubleMountComponent.value = name;

    if (import.meta.env?.DEV) {
      console.warn(`[DEV ASSERTION] Singleton '${name}' mounted more than once! Total active: ${count}`);
    }
  }

  return () => {
    if (globalThis.__ARC_SINGLETONS__) {
      globalThis.__ARC_SINGLETONS__[name] = Math.max(0, (globalThis.__ARC_SINGLETONS__[name] || 1) - 1);
      if (globalThis.__ARC_SINGLETONS__[name] <= 1 && doubleMountComponent.value === name) {
        hasDoubleMount.value = false;
        doubleMountComponent.value = '';
      }
    }
  };
}

/**
 * Records when the active color theme was applied to document.documentElement
 */
export function recordThemeApplied(themeName: string): void {
  if (typeof globalThis !== 'undefined' && globalThis.__ARC_STARTUP_TIMESTAMPS__) {
    globalThis.__ARC_STARTUP_TIMESTAMPS__[`theme:${themeName}`] = performance.now();
  }
}

/**
 * Checks that all critical UI nodes share the exact same --accent property as :root.
 */
export function checkAccentConsistency(): boolean {
  if (typeof document === 'undefined') return true;

  const rootStyle = getComputedStyle(document.documentElement);
  const rootAccent = rootStyle.getPropertyValue('--accent').trim().toLowerCase();

  const probeNodes: { selector: string; name: string }[] = [
    { selector: '#arc-dock-container', name: 'CommandCenter:Dock' },
    { selector: '.widgets-layer', name: 'WidgetsLayer:Container' },
    { selector: '.reactor-canvas-container', name: 'ReactorCore:Container' },
    { selector: '#global-tabbar', name: 'TabBar:Global' },
  ];

  let hasDrift = false;

  for (const probe of probeNodes) {
    const el = document.querySelector(probe.selector);
    if (el) {
      const nodeAccent = getComputedStyle(el).getPropertyValue('--accent').trim().toLowerCase();
      // If node accent exists and differs from root accent, log ghost drift
      if (nodeAccent && nodeAccent !== rootAccent) {
        console.error(`ARC GHOST: accent drift on node [${probe.name}]`, {
          selector: probe.selector,
          rootAccent,
          nodeAccent,
        });
        hasDrift = true;
      }
    }
  }

  return !hasDrift;
}

let consistencyInterval: any = null;

/**
 * Starts periodic accent consistency checks (every 5s in DEV mode).
 */
export function startAccentConsistencyCheck(): void {
  if (typeof window === 'undefined') return;

  // Immediate check
  checkAccentConsistency();

  // Periodic check in development only
  if (import.meta.env?.DEV && !consistencyInterval) {
    consistencyInterval = setInterval(() => {
      checkAccentConsistency();
    }, 5000);
  }
}

/**
 * Prints the full chronological startup sequence.
 */
export function logStartupOrder(): void {
  if (typeof globalThis !== 'undefined' && globalThis.__ARC_STARTUP_TIMESTAMPS__) {
    console.info('A.R.C. Startup Sequence:', globalThis.__ARC_STARTUP_TIMESTAMPS__);
  }
}

export { getArcLiveDump, type ArcLiveDump } from './arcLiveDump';
export { probeGhostInvariant, startGhostTrap, capturedGhost, type GhostCaptureDump } from './arcGhostTrap';

