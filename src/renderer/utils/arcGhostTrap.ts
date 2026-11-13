import { ref } from 'vue';

export interface GhostCaptureDump {
  timestamp: number;
  violationReason: string;
  targetNode: {
    tagName: string;
    classList: string[];
    inlineStyle: string;
    attributes: Record<string, string>;
    computedStyle: {
      color: string;
      stroke: string;
      strokeDasharray: string;
      fill: string;
      background: string;
      borderColor: string;
      boxShadow: string;
      opacity: string;
      zIndex: string;
      accent: string;
    };
    rect: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
    isInsideApp: boolean;
    domPath: string;
  };
  rootAccent: string;
  isWebglContextLost: boolean;
  isRafRunning: boolean;
  rafFrames: number;
  canvasDetails: {
    hasCanvas: boolean;
    width: number;
    height: number;
  };
  elementsAtCenter: Array<{
    tagName: string;
    id: string;
    className: string;
    isInsideApp: boolean;
  }>;
}

export const capturedGhost = ref<GhostCaptureDump | null>(null);

/**
 * Probes the rendering invariant: 2D fallback rings in DOM while 3D canvas is actively present/rendering,
 * or 3D scene foreign helpers/overlays during active 3D rendering.
 */
export function probeGhostInvariant(): GhostCaptureDump | null {
  if (typeof document === 'undefined') return null;

  const ringNode = document.querySelector('[data-arc-reactor] [data-arc-ring-svg]')
    || document.querySelector('[data-arc-reactor] [data-arc-fallback-rings]')
    || document.querySelector('[data-arc-reactor] circle[r="38"]')
    || document.querySelector('[data-arc-reactor] circle[stroke-dasharray]')
    || document.querySelector('[data-arc-reactor] .reactor-canvas-container ~ div circle');

  const canvasEl = document.querySelector('.reactor-canvas-container canvas') as HTMLCanvasElement | null;
  const hasCanvas = Boolean(canvasEl);
  const canvasWidth = canvasEl ? canvasEl.width : 0;
  const canvasHeight = canvasEl ? canvasEl.height : 0;

  const isWebglContextLost = typeof (globalThis as any).__ARC_WEBGL_LOST__ === 'boolean'
    ? (globalThis as any).__ARC_WEBGL_LOST__
    : Boolean((globalThis as any).__isWebglContextLost?.value);

  const isRafRunning = typeof (globalThis as any).__isReactorRafActive === 'function'
    ? (globalThis as any).__isReactorRafActive()
    : Boolean((globalThis as any).__reactorFrameCount && (globalThis as any).__reactorFrameCount > 0);

  const rafFrames = typeof (globalThis as any).__reactorFrameCount === 'number'
    ? (globalThis as any).__reactorFrameCount
    : 0;

  const isCanvasVisible = Boolean(
    canvasEl &&
    (!canvasEl.style || canvasEl.style.display !== 'none') &&
    (!canvasEl.classList || !canvasEl.classList.contains('opacity-0')) &&
    (typeof canvasEl.closest !== 'function' || (!canvasEl.closest('.opacity-0') && !canvasEl.closest('.hidden')))
  );

  let isInvariantViolation = false;
  let violationReason = '';
  let targetViolationNode: Element | null = null;

  // Case 1: Rings exist in DOM
  if (ringNode) {
    if (!isWebglContextLost) {
      // 2D rings in DOM while WebGL is OK
      isInvariantViolation = true;
      violationReason = 'INVARIANT_VIOLATION: Ring node in DOM while WebGL is OK (flag=false)';
      targetViolationNode = ringNode;
    } else if (isRafRunning) {
      // RAF running while WebGL is lost
      isInvariantViolation = true;
      violationReason = 'INVARIANT_VIOLATION: Ring node in DOM while 3D RAF is running (rafRunning=true)';
      targetViolationNode = ringNode;
    } else if (hasCanvas && isCanvasVisible) {
      // Stale 3D frame visible under fallback rings
      isInvariantViolation = true;
      violationReason = 'GHOST 2D: stale 3D canvas visible under fallback';
      targetViolationNode = ringNode;
    }
  } else if (!isWebglContextLost) {
    // Case 2: WebGL is OK, rings NOT in DOM -> Check for foreign 3D helper or untracked canvas/overlay
    const sceneObjects = typeof (globalThis as any).__getArcSceneTraverse === 'function'
      ? (globalThis as any).__getArcSceneTraverse()
      : ((globalThis as any).__ARC_SCENE_OBJECTS__ || []);

    const foreignHelper = Array.isArray(sceneObjects)
      ? sceneObjects.find((obj: any) =>
          obj.visible &&
          (obj.type.includes('Helper') || obj.name.includes('Grid') || obj.name.includes('Debug')) &&
          !obj.isReactorGeometry
        )
      : null;

    if (foreignHelper) {
      isInvariantViolation = true;
      violationReason = `GHOST 3D: foreign scene object detected [${foreignHelper.name || foreignHelper.type}]`;
      targetViolationNode = canvasEl || document.body;
    }
  }

  if (isInvariantViolation && (targetViolationNode || ringNode)) {
    const nodeToInspect = targetViolationNode || ringNode!;
    const rect = nodeToInspect.getBoundingClientRect ? nodeToInspect.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };
    const cx = rect.left + rect.width / 2 || window.innerWidth / 2;
    const cy = rect.top + rect.height / 2 || window.innerHeight / 2;
    const r = Math.min(rect.width, rect.height) * 0.35 || 100;

    // 9-point grid probe: Center + 4 Cardinals (N, S, E, W) + 4 Diagonals (NE, NW, SE, SW)
    const probePoints = [
      { name: 'center', x: cx, y: cy },
      { name: 'north', x: cx, y: cy - r },
      { name: 'south', x: cx, y: cy + r },
      { name: 'east', x: cx + r, y: cy },
      { name: 'west', x: cx - r, y: cy },
      { name: 'north-east', x: cx + r * 0.707, y: cy - r * 0.707 },
      { name: 'north-west', x: cx - r * 0.707, y: cy - r * 0.707 },
      { name: 'south-east', x: cx + r * 0.707, y: cy + r * 0.707 },
      { name: 'south-west', x: cx - r * 0.707, y: cy + r * 0.707 },
    ];

    const elementsAtCenter = typeof document.elementsFromPoint === 'function'
      ? probePoints.flatMap((pt) =>
          document.elementsFromPoint(pt.x, pt.y).map((el) => {
            const comp = typeof getComputedStyle === 'function' ? getComputedStyle(el) : ({} as any);
            return {
              point: pt.name,
              tagName: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className ? String(el.className) : '',
              isInsideApp: Boolean(el.closest && el.closest('#app')),
              color: comp.color || '',
              stroke: comp.stroke || '',
              fill: comp.fill || '',
              background: comp.backgroundColor || '',
              accent: typeof comp.getPropertyValue === 'function' ? comp.getPropertyValue('--accent').trim() : '',
            };
          })
        )
      : [];

    const computed = typeof getComputedStyle === 'function' ? getComputedStyle(nodeToInspect) : ({} as any);
    const circleEl = typeof nodeToInspect.querySelector === 'function'
      ? nodeToInspect.querySelector('circle')
      : (nodeToInspect.tagName && nodeToInspect.tagName.toLowerCase() === 'circle' ? nodeToInspect : null);
    const circleComputed = circleEl && typeof getComputedStyle === 'function' ? getComputedStyle(circleEl) : null;

    const rootAccent = typeof document.documentElement !== 'undefined' && typeof getComputedStyle === 'function'
      ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      : '#EF4444';

    const attrs: Record<string, string> = {};
    if (nodeToInspect.attributes) {
      for (let i = 0; i < nodeToInspect.attributes.length; i++) {
        const a = nodeToInspect.attributes[i];
        attrs[a.name] = a.value;
      }
    }

    const pathSegments: string[] = [];
    let curr: Element | null = nodeToInspect;
    while (curr && curr !== document.body) {
      const name = (curr.tagName ? curr.tagName.toLowerCase() : '') + (curr.id ? `#${curr.id}` : '') + (curr.classList && curr.classList.length ? `.${Array.from(curr.classList).slice(0, 2).join('.')}` : '');
      pathSegments.unshift(name);
      curr = curr.parentElement;
    }

    const dump: GhostCaptureDump = {
      timestamp: performance.now(),
      violationReason,
      targetNode: {
        tagName: nodeToInspect.tagName ? nodeToInspect.tagName.toLowerCase() : 'element',
        classList: nodeToInspect.classList ? Array.from(nodeToInspect.classList) : [],
        inlineStyle: typeof nodeToInspect.getAttribute === 'function' ? (nodeToInspect.getAttribute('style') || '') : '',
        attributes: attrs,
        computedStyle: {
          color: computed.color || '',
          stroke: circleComputed?.stroke || computed.stroke || '',
          strokeDasharray: circleComputed?.strokeDasharray || computed.strokeDasharray || '',
          fill: circleComputed?.fill || computed.fill || '',
          background: computed.backgroundColor || '',
          borderColor: computed.borderColor || '',
          boxShadow: computed.boxShadow || '',
          opacity: computed.opacity || '',
          zIndex: computed.zIndex || '',
          accent: typeof computed.getPropertyValue === 'function' ? computed.getPropertyValue('--accent').trim() : '',
        },
        rect: {
          top: rect.top || 0,
          left: rect.left || 0,
          width: rect.width || 0,
          height: rect.height || 0,
        },
        isInsideApp: Boolean(nodeToInspect.closest && nodeToInspect.closest('#app')),
        domPath: pathSegments.join(' > '),
      },
      rootAccent,
      isWebglContextLost,
      isRafRunning,
      rafFrames,
      canvasDetails: {
        hasCanvas,
        width: canvasWidth,
        height: canvasHeight,
      },
      elementsAtCenter,
    };

    capturedGhost.value = dump;
    (globalThis as any).__ARC_CAPTURED_GHOST__ = dump;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__ARC_CAPTURED_GHOST__', JSON.stringify(dump));
      }
    } catch {}

    console.error('🚨 ARC GHOST CAPTURED v3.1:', dump);
    ensureGhostBadgeInDOM(dump);

    return dump;
  }

  // If no violation, remove any previous ghost badge
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    const prevBadge = document.getElementById('arc-ghost-captured-badge');
    if (prevBadge && typeof prevBadge.remove === 'function') {
      prevBadge.remove();
    }
  }

  return null;
}

function ensureGhostBadgeInDOM(dump: GhostCaptureDump): void {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || typeof document.createElement !== 'function') return;

  let badge = document.getElementById('arc-ghost-captured-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'arc-ghost-captured-badge';
    Object.assign(badge.style, {
      position: 'fixed',
      top: '44px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '999999',
      backgroundColor: 'rgba(239, 68, 68, 0.95)',
      color: '#ffffff',
      padding: '6px 14px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '10px',
      fontWeight: 'bold',
      letterSpacing: '0.04em',
      border: '1px solid #ffffff',
      boxShadow: '0 0 20px rgba(239, 68, 68, 0.8)',
      pointerEvents: 'none',
      userSelect: 'none',
      maxWidth: '90vw',
      textAlign: 'center',
      wordBreak: 'break-word',
    });
    document.body.appendChild(badge);
  }

  const nodeType = dump.targetNode.tagName || 'UNKNOWN';
  const nodeClass = dump.targetNode.classList.join('.') || 'no-class';
  const nodeColor = dump.targetNode.computedStyle.color || dump.targetNode.computedStyle.stroke || 'none';
  const nodeAccent = dump.targetNode.computedStyle.accent || 'none';
  const rootAccent = dump.rootAccent || 'none';
  const scope = dump.targetNode.isInsideApp ? 'INSIDE #app' : 'EXTERNAL PREVIEW';

  const badgePrefix = mapViolationReasonToPrefix(dump.violationReason);

  badge.textContent = `🚨 ${badgePrefix} ${nodeType} | ${nodeClass} | ${scope} | color=${nodeColor} | accent@node=${nodeAccent} | accent@root=${rootAccent} | flag=${dump.isWebglContextLost}`;
}

export function mapViolationReasonToPrefix(reason: string): string {
  if (
    reason.startsWith('GHOST 2D:') ||
    reason.includes('GHOST 2D') ||
    reason.includes('soft loss')
  ) {
    return 'GHOST 2D:';
  }
  if (
    reason.startsWith('GHOST 3D') ||
    reason.includes('GHOST 3D') ||
    reason.includes('foreign')
  ) {
    return 'GHOST 3D/overlay:';
  }
  if (
    reason.includes('LOST') ||
    reason.includes('INVARIANT_VIOLATION')
  ) {
    return 'LOST (2D):';
  }
  return 'GHOST 3D/overlay:';
}

let ghostTrapObserver: MutationObserver | null = null;
let ghostTrapInterval: any = null;
let ghostTrapVisibilityBound = false;

/**
 * Starts the invariant ghost trap watcher v2.
 */
export function startGhostTrap(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  probeGhostInvariant();

  const attachReactorObserver = () => {
    if (ghostTrapObserver) return;
    const reactorEl = document.querySelector('[data-arc-reactor]');
    if (!reactorEl) return;
    let observerThrottleTimer: any = null;
    ghostTrapObserver = new MutationObserver(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (observerThrottleTimer) return;
      observerThrottleTimer = setTimeout(() => {
        observerThrottleTimer = null;
        probeGhostInvariant();
      }, 1500);
    });
    ghostTrapObserver.observe(reactorEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-arc-fallback-rings', 'data-arc-ring-svg'],
    });
  };

  attachReactorObserver();

  if (!ghostTrapInterval) {
    ghostTrapInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!ghostTrapObserver) attachReactorObserver();
      if (!document.querySelector('[data-arc-reactor]')) return;
      probeGhostInvariant();
    }, 3500);
  }

  if (!ghostTrapVisibilityBound) {
    ghostTrapVisibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && document.querySelector('[data-arc-reactor]')) {
        probeGhostInvariant();
      }
    });
  }
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).__startGhostTrap = startGhostTrap;
  (globalThis as any).__probeGhostInvariant = probeGhostInvariant;
}
