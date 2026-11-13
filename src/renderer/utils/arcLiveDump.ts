export interface ArcLiveDump {
  rootAccent: string;
  svgNodeAccent: string;
  container3DAccent: string;
  hudWidgetBorder: {
    exists: boolean;
    accent: string;
    borderColor: string;
    notchBg: string;
  };
  dockContainer: {
    exists: boolean;
    accent: string;
    borderColor: string;
    bgColor: string;
  };
  dockButtonWorkspaces: {
    exists: boolean;
    accent: string;
    borderColor: string;
    textColor: string;
  };
  dockButtonVoice: {
    exists: boolean;
    borderColor: string;
  };
  narrowDrawer: {
    isMobileViewport: boolean;
    exists: boolean;
    borderColor: string;
  };
  reactorColorTheme: string;
  isWebglContextLost: boolean;
  isRafRunning: boolean;
  reactorInstancesInDOM: number;
  timestamp: number;
}

/**
 * Captures an instantaneous live dump of all reactor, accent, and WebGL state.
 */
export function getArcLiveDump(): ArcLiveDump {
  const rootAccent = typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    : '#EF4444';

  const svgNode = typeof document !== 'undefined'
    ? (document.querySelector('[data-arc-ring-svg]') || document.querySelector('[data-arc-fallback-rings] svg') || document.querySelector('.reactor-canvas-container ~ div svg'))
    : null;
  const svgNodeAccent = svgNode
    ? (getComputedStyle(svgNode).getPropertyValue('--accent').trim() || svgNode.querySelector('circle')?.getAttribute('stroke') || '')
    : 'NOT_IN_DOM';

  const container3D = typeof document !== 'undefined'
    ? document.querySelector('.reactor-canvas-container')
    : null;
  const container3DAccent = container3D
    ? getComputedStyle(container3D).getPropertyValue('--accent').trim()
    : 'NOT_IN_DOM';

  // HUD Widget inspection
  const hudWidgetEl = typeof document !== 'undefined' ? document.querySelector('[data-arc-hud-widget]') : null;
  const hudWidgetBorder = {
    exists: Boolean(hudWidgetEl),
    accent: hudWidgetEl ? getComputedStyle(hudWidgetEl).getPropertyValue('--accent').trim() : 'NOT_IN_DOM',
    borderColor: hudWidgetEl ? getComputedStyle(hudWidgetEl).borderColor : 'NOT_IN_DOM',
    notchBg: hudWidgetEl ? (getComputedStyle(hudWidgetEl.querySelector('.absolute.top-0') || hudWidgetEl).backgroundColor) : 'NOT_IN_DOM',
  };

  // Dock container inspection
  const dockContainerEl = typeof document !== 'undefined' ? document.querySelector('[data-arc-dock-container]') : null;
  const dockContainer = {
    exists: Boolean(dockContainerEl),
    accent: dockContainerEl ? getComputedStyle(dockContainerEl).getPropertyValue('--accent').trim() : 'NOT_IN_DOM',
    borderColor: dockContainerEl ? getComputedStyle(dockContainerEl).borderColor : 'NOT_IN_DOM',
    bgColor: dockContainerEl ? getComputedStyle(dockContainerEl).backgroundColor : 'NOT_IN_DOM',
  };

  // Dock buttons inspection
  const dockBtnWorkspacesEl = typeof document !== 'undefined' ? document.querySelector('[data-arc-dock-btn="workspaces"]') : null;
  const dockButtonWorkspaces = {
    exists: Boolean(dockBtnWorkspacesEl),
    accent: dockBtnWorkspacesEl ? getComputedStyle(dockBtnWorkspacesEl).getPropertyValue('--accent').trim() : 'NOT_IN_DOM',
    borderColor: dockBtnWorkspacesEl ? getComputedStyle(dockBtnWorkspacesEl).borderColor : 'NOT_IN_DOM',
    textColor: dockBtnWorkspacesEl ? getComputedStyle(dockBtnWorkspacesEl).color : 'NOT_IN_DOM',
  };

  const dockBtnVoiceEl = typeof document !== 'undefined' ? document.querySelector('[data-arc-dock-btn="voice"]') : null;
  const dockButtonVoice = {
    exists: Boolean(dockBtnVoiceEl),
    borderColor: dockBtnVoiceEl ? getComputedStyle(dockBtnVoiceEl).borderColor : 'NOT_IN_DOM',
  };

  // Mobile drawer inspection
  const narrowDrawerEl = typeof document !== 'undefined' ? document.querySelector('.widgets-layer .fixed.inset-x-3') : null;
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  const narrowDrawer = {
    isMobileViewport,
    exists: Boolean(narrowDrawerEl),
    borderColor: narrowDrawerEl ? getComputedStyle(narrowDrawerEl).borderColor : 'NOT_IN_DOM',
  };

  const settingsStore = (globalThis as any).__ARC_SETTINGS_STORE__;
  const reactorColorTheme = settingsStore?.reactorColorTheme || 'red';

  const isWebglContextLost = typeof (globalThis as any).__ARC_WEBGL_LOST__ === 'boolean'
    ? (globalThis as any).__ARC_WEBGL_LOST__
    : Boolean((globalThis as any).__isWebglContextLost?.value);

  const isRafRunning = typeof (globalThis as any).__isReactorRafActive === 'function'
    ? (globalThis as any).__isReactorRafActive()
    : Boolean((globalThis as any).__reactorFrameCount && (globalThis as any).__reactorFrameCount > 0);

  const reactorInstancesInDOM = typeof document !== 'undefined'
    ? document.querySelectorAll('[data-arc-reactor]').length
    : 0;

  const dump: ArcLiveDump = {
    rootAccent,
    svgNodeAccent,
    container3DAccent,
    hudWidgetBorder,
    dockContainer,
    dockButtonWorkspaces,
    dockButtonVoice,
    narrowDrawer,
    reactorColorTheme,
    isWebglContextLost,
    isRafRunning,
    reactorInstancesInDOM,
    timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  };

  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__ARC_LAST_DUMP__ = dump;
  }
  return dump;
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).__getArcLiveDump = getArcLiveDump;
}
