import { ref, onMounted, onUnmounted, Ref, nextTick, watch } from 'vue';
import { useSettingsStore } from '../features/settings/stores/settings.store';

export type WidgetAnchor = 'tl' | 'tr' | 'bl' | 'br';

export interface WidgetPositionData {
  anchor: WidgetAnchor;
  offsetX: number;
  offsetY: number;
  width?: number;
  height?: number;
  version?: number;
}

// Global registry for collision detection and snapping
const widgetRegistry = new Map<
  string,
  { x: number; y: number; w: number; h: number; isRight?: boolean; isBottom?: boolean }
>();

const SCREEN_SNAP_THRESHOLD = 8;
const WIDGET_SNAP_THRESHOLD = 12;

export function useDraggableWidget(
  storageKey: string,
  defaultPos: { x: number; y: number; isRight?: boolean; isBottom?: boolean },
  widgetRef?: Ref<HTMLElement | null>
) {
  const settingsStore = useSettingsStore();
  const x = ref(0);
  const y = ref(0);

  // Cached dimensions to prevent layout thrashing in rAF/pointermove
  let cachedWidth = 320;
  let cachedHeight = 150;

  // Position state
  let currentAnchor: WidgetAnchor = defaultPos.isRight
    ? defaultPos.isBottom ? 'br' : 'tr'
    : defaultPos.isBottom ? 'bl' : 'tl';
  let currentOffsetX = defaultPos.x;
  let currentOffsetY = defaultPos.y;
  let isCustom = false;

  // Snapping state
  const isSnapped = ref(false);

  // Update cached dimensions
  const updateCachedDimensions = () => {
    if (widgetRef && widgetRef.value) {
      const rect = widgetRef.value.getBoundingClientRect();
      if (rect.width > 0) cachedWidth = rect.width;
      if (rect.height > 0) cachedHeight = rect.height;
    }
  };

  const getRealBounds = () => {
    updateCachedDimensions();
    return { width: cachedWidth, height: cachedHeight };
  };

  // Compute absolute (x, y) coordinates from anchor and offsets
  const computeAbsolutePosition = (
    anchor: WidgetAnchor,
    offsetX: number,
    offsetY: number,
    w = cachedWidth,
    h = cachedHeight
  ): { x: number; y: number } => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;

    let absX = 0;
    let absY = 0;

    switch (anchor) {
      case 'tl':
        absX = offsetX;
        absY = offsetY;
        break;
      case 'tr':
        absX = screenW - offsetX - w;
        absY = offsetY;
        break;
      case 'bl':
        absX = offsetX;
        absY = screenH - offsetY - h;
        break;
      case 'br':
        absX = screenW - offsetX - w;
        absY = screenH - offsetY - h;
        break;
    }

    return { x: absX, y: absY };
  };

  // Determine nearest anchor and compute offsets from top-left (absX, absY)
  const computeAnchorFromAbsolute = (
    absX: number,
    absY: number,
    w = cachedWidth,
    h = cachedHeight
  ): { anchor: WidgetAnchor; offsetX: number; offsetY: number } => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;

    const isRight = absX + w / 2 > screenW / 2;
    const isBottom = absY + h / 2 > screenH / 2;

    let anchor: WidgetAnchor = 'tl';
    let offsetX = absX;
    let offsetY = absY;

    if (isRight && !isBottom) {
      anchor = 'tr';
      offsetX = screenW - absX - w;
      offsetY = absY;
    } else if (!isRight && isBottom) {
      anchor = 'bl';
      offsetX = absX;
      offsetY = screenH - absY - h;
    } else if (isRight && isBottom) {
      anchor = 'br';
      offsetX = screenW - absX - w;
      offsetY = screenH - absY - h;
    }

    return { anchor, offsetX, offsetY };
  };

  const getTopSafeMargin = () => {
    // 32px TitleBar height + 16px safe margin when TabBar is at bottom (total 48px).
    // When TabBar is at top, 32px TitleBar + 48px TabBar + 16px safe margin = 96px.
    return settingsStore.tabBarPosition === 'top' ? 96 : 48;
  };

  const resolveCollision = (targetX: number, targetY: number) => {
    let finalX = targetX;
    let finalY = targetY;
    let hasOverlap = true;
    let maxTries = 10;
    while (hasOverlap && maxTries > 0) {
      hasOverlap = false;
      for (const [key, rect] of widgetRegistry.entries()) {
        if (key === storageKey) continue;
        const overlapX = finalX < rect.x + rect.w && finalX + cachedWidth > rect.x;
        const overlapY = finalY < rect.y + rect.h && finalY + cachedHeight > rect.y;
        if (overlapX && overlapY) {
          hasOverlap = true;
          if (defaultPos.isBottom) {
            finalY = rect.y - cachedHeight - 16;
          } else {
            finalY = rect.y + rect.h + 16;
          }
          break;
        }
      }
      maxTries--;
    }
    return clampPosition(finalX, finalY);
  };

  const calculateDefaultPosition = () => {
    const { width, height } = getRealBounds();
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;

    let targetX = defaultPos.x;
    let targetY = defaultPos.y;

    if (defaultPos.isRight) {
      targetX = screenW - defaultPos.x - width;
    }
    if (defaultPos.isBottom) {
      targetY = screenH - defaultPos.y - height;
    } else {
      targetY = Math.max(getTopSafeMargin(), defaultPos.y);
    }

    const resolved = resolveCollision(targetX, targetY);
    return applySnapping(resolved.x, resolved.y);
  };

  const clampPosition = (currentX: number, currentY: number) => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const minY = getTopSafeMargin();
    const maxY = Math.max(minY, screenH - cachedHeight - 8);

    const clampedX = Math.max(8, Math.min(currentX, Math.max(8, screenW - cachedWidth - 8)));
    const clampedY = Math.max(minY, Math.min(currentY, maxY));
    return { x: clampedX, y: clampedY };
  };

  // Snapping logic against screen edges, magnetic grid, and other widgets
  const applySnapping = (rawX: number, rawY: number) => {
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const minY = getTopSafeMargin();
    const maxY = Math.max(minY, screenH - cachedHeight - 8);

    // Magnetic Grid (Task #6)
    const MAGNETIC_GRID = 16;
    let snX = Math.round(rawX / MAGNETIC_GRID) * MAGNETIC_GRID;
    let snY = Math.round(rawY / MAGNETIC_GRID) * MAGNETIC_GRID;
    let snappedAny = true; // Always true for grid

    const SNAP_THRESHOLD = 24; // Distance to snap to other windows

    // Snap to other windows
    for (const [key, rect] of widgetRegistry.entries()) {
      if (key === storageKey) continue;
      
      // X-axis snapping
      // Snap our left edge to their right edge
      if (Math.abs(rawX - (rect.x + rect.w)) < SNAP_THRESHOLD) {
        snX = rect.x + rect.w + 16;
      }
      // Snap our right edge to their left edge
      else if (Math.abs((rawX + cachedWidth) - rect.x) < SNAP_THRESHOLD) {
        snX = rect.x - cachedWidth - 16;
      }
      // Align left edges
      else if (Math.abs(rawX - rect.x) < SNAP_THRESHOLD) {
        snX = rect.x;
      }
      // Align right edges
      else if (Math.abs((rawX + cachedWidth) - (rect.x + rect.w)) < SNAP_THRESHOLD) {
        snX = rect.x + rect.w - cachedWidth;
      }

      // Y-axis snapping
      // Snap our top edge to their bottom edge
      if (Math.abs(rawY - (rect.y + rect.h)) < SNAP_THRESHOLD) {
        snY = rect.y + rect.h + 16;
      }
      // Snap our bottom edge to their top edge
      else if (Math.abs((rawY + cachedHeight) - rect.y) < SNAP_THRESHOLD) {
        snY = rect.y - cachedHeight - 16;
      }
      // Align top edges
      else if (Math.abs(rawY - rect.y) < SNAP_THRESHOLD) {
        snY = rect.y;
      }
      // Align bottom edges
      else if (Math.abs((rawY + cachedHeight) - (rect.y + rect.h)) < SNAP_THRESHOLD) {
        snY = rect.y + rect.h - cachedHeight;
      }
    }

    // 1. Screen edge snapping (overrides widget snapping if pushed to edge)
    if (snX < 16) {
      snX = 16;
    } else if (snX + cachedWidth > screenW - 16) {
      snX = screenW - cachedWidth - 16;
    }

    if (snY < minY + 8) {
      snY = minY + 8;
    } else if (snY > maxY - 16) {
      snY = maxY - 16;
    }

    isSnapped.value = snappedAny;
    return { x: snX, y: snY };
  };

  const updateRegistry = () => {
    widgetRegistry.set(storageKey, {
      x: x.value,
      y: y.value,
      w: cachedWidth,
      h: cachedHeight,
      isRight: defaultPos.isRight,
      isBottom: defaultPos.isBottom
    });
  };

  const savePosition = () => {
    const { anchor, offsetX, offsetY } = computeAnchorFromAbsolute(
      x.value,
      y.value,
      cachedWidth,
      cachedHeight
    );
    currentAnchor = anchor;
    currentOffsetX = offsetX;
    currentOffsetY = offsetY;

    const data: WidgetPositionData = {
      anchor,
      offsetX,
      offsetY,
      width: cachedWidth,
      height: cachedHeight,
      version: 8
    };

    localStorage.setItem('arc_widget_v8_' + storageKey, JSON.stringify(data));
  };

  const loadPosition = () => {
    const savedV8 = localStorage.getItem('arc_widget_v8_' + storageKey);
    if (savedV8) {
      try {
        const parsed = JSON.parse(savedV8) as WidgetPositionData;
        if (parsed.anchor && typeof parsed.offsetX === 'number') {
          currentAnchor = parsed.anchor;
          currentOffsetX = parsed.offsetX;
          currentOffsetY = parsed.offsetY;
          if (parsed.width) cachedWidth = parsed.width;
          if (parsed.height) cachedHeight = parsed.height;

          const abs = computeAbsolutePosition(
            parsed.anchor,
            parsed.offsetX,
            parsed.offsetY
          );
          const resolved = resolveCollision(abs.x, abs.y);
          x.value = resolved.x;
          y.value = resolved.y;
          if (resolved.y !== abs.y || resolved.x !== abs.x) {
            savePosition();
          }
          isCustom = true;
          return;
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
    }

    isCustom = false;
    const defaults = calculateDefaultPosition();
    const clamped = clampPosition(defaults.x, defaults.y);
    x.value = clamped.x;
    y.value = clamped.y;
  };

  const applyClamp = () => {
    updateCachedDimensions();
    if (isCustom) {
      const abs = computeAbsolutePosition(
        currentAnchor,
        currentOffsetX,
        currentOffsetY
      );
      const resolved = resolveCollision(abs.x, abs.y);
      x.value = resolved.x;
      y.value = resolved.y;
      if (resolved.y !== abs.y || resolved.x !== abs.x) {
        savePosition();
      }
    } else {
      const defaults = calculateDefaultPosition();
      const clamped = clampPosition(defaults.x, defaults.y);
      x.value = clamped.x;
      y.value = clamped.y;
    }
    updateRegistry();
  };

  const isDragging = ref(false);
  let dragPointerId: number | null = null;
  let startPointerX = 0;
  let startPointerY = 0;
  let initialX = 0;
  let initialY = 0;
  let rAfId: number | null = null;
  let pendingX = 0;
  let pendingY = 0;

  const updateDragPosition = () => {
    rAfId = null;
    if (!isDragging.value) return;

    const clamped = clampPosition(pendingX, pendingY);
    const snapped = applySnapping(clamped.x, clamped.y);

    x.value = snapped.x;
    y.value = snapped.y;
    updateRegistry();
  };

  const onDragStart = (e: MouseEvent | PointerEvent) => {
    if (settingsStore.widgetsLocked) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('.no-drag') ||
      target.closest('select')
    ) {
      return;
    }

    updateCachedDimensions();

    isDragging.value = true;
    startPointerX = e.clientX;
    startPointerY = e.clientY;
    initialX = x.value;
    initialY = y.value;
    pendingX = initialX;
    pendingY = initialY;

    if ('pointerId' in e && e.target && 'setPointerCapture' in (e.target as Element)) {
      dragPointerId = (e as PointerEvent).pointerId;
      try {
        (e.target as Element).setPointerCapture((e as PointerEvent).pointerId);
      } catch (err) { console.warn('Ignored error in catch', err); }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
  };

  const onMouseDown = (e: MouseEvent) => {
    onDragStart(e);
  };

  const onPointerMove = (e: MouseEvent | PointerEvent) => {
    if (!isDragging.value) return;

    const dx = e.clientX - startPointerX;
    const dy = e.clientY - startPointerY;

    pendingX = initialX + dx;
    pendingY = initialY + dy;

    if (rAfId === null) {
      rAfId = requestAnimationFrame(updateDragPosition);
    }
  };

  const onPointerUp = (e?: MouseEvent | PointerEvent) => {
    if (!isDragging.value) return;

    if (rAfId !== null) {
      cancelAnimationFrame(rAfId);
      rAfId = null;
    }

    isDragging.value = false;
    isSnapped.value = false;

    if (
      dragPointerId !== null &&
      e &&
      'pointerId' in e &&
      e.target &&
      'releasePointerCapture' in (e.target as Element)
    ) {
      try {
        (e.target as Element).releasePointerCapture(dragPointerId);
      } catch (err) { console.warn('Ignored error in catch', err); }
      dragPointerId = null;
    }

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);

    isCustom = true;
    savePosition();
    updateRegistry();
  };

  const resetPosition = () => {
    localStorage.removeItem('arc_widget_v7_' + storageKey);
    localStorage.removeItem('arc_widget_v6_' + storageKey);
    localStorage.removeItem('arc_widget_v5_' + storageKey);
    localStorage.removeItem('arc_widget_v4_' + storageKey);
    localStorage.removeItem('arc_widget_v3_' + storageKey);
    localStorage.removeItem('arc_widget_v2_' + storageKey);
    localStorage.removeItem('arc_widget_' + storageKey);
    localStorage.removeItem(storageKey);
    isCustom = false;
    const defaults = calculateDefaultPosition();
    x.value = defaults.x;
    y.value = defaults.y;

    const { anchor, offsetX, offsetY } = computeAnchorFromAbsolute(
      x.value,
      y.value,
      cachedWidth,
      cachedHeight
    );
    currentAnchor = anchor;
    currentOffsetX = offsetX;
    currentOffsetY = offsetY;

    updateRegistry();
  };

  const onResize = () => {
    applyClamp();
  };

  let resizeObs: ResizeObserver | null = null;

  onMounted(() => {
    loadPosition();
    window.addEventListener('arc_widgets_reset_positions', resetPosition);
    window.addEventListener('resize', onResize);

    nextTick(() => {
      setTimeout(() => {
        applyClamp();
        if (widgetRef && widgetRef.value) {
          resizeObs = new ResizeObserver(() => applyClamp());
          resizeObs.observe(widgetRef.value);
        }
      }, 50);
    });
  });

  onUnmounted(() => {
    if (rAfId !== null) cancelAnimationFrame(rAfId);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('arc_widgets_reset_positions', resetPosition);
    window.removeEventListener('resize', onResize);
    if (resizeObs) resizeObs.disconnect();
    widgetRegistry.delete(storageKey);
  });

  watch(() => settingsStore.tabBarPosition, () => {
    applyClamp();
  });

  const positionStyle = (customZIndex?: number) => {
    if (settingsStore.widgetLayoutMode === 'dock') {
      return {
        position: 'relative' as const,
        width: '100%',
        zIndex: customZIndex ?? 25,
        userSelect: 'none' as const,
        pointerEvents: 'auto' as const
      };
    }
    const baseZ = customZIndex !== undefined ? customZIndex : 25;
    return {
      position: 'fixed' as const,
      left: 0,
      top: 0,
      transform: `translate(${x.value}px, ${y.value}px)`,
      willChange: isDragging.value ? 'transform' : 'auto',
      cursor: settingsStore.widgetsLocked
        ? 'default'
        : isDragging.value
        ? 'grabbing'
        : 'grab',
      userSelect: 'none' as const,
      zIndex: isDragging.value ? 60 : baseZ
    };
  };

  return {
    x,
    y,
    onMouseDown,
    onDragStart,
    positionStyle,
    resetPosition,
    isSnapped,
    isDragging
  };
}
