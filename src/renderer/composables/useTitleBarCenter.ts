import { ref, computed, onMounted, onUnmounted, nextTick, watch, getCurrentInstance, type Ref } from 'vue';

export interface UseTitleBarCenterOptions {
  containerRef: Ref<HTMLElement | null>;
  leftSectionRef: Ref<HTMLElement | null>;
  centerSectionRef: Ref<HTMLElement | null>;
  rightSectionRef: Ref<HTMLElement | null>;
  watchSources?: any[];
  minGap?: number;
}

export function useTitleBarCenter(options: UseTitleBarCenterOptions) {
  const {
    containerRef,
    leftSectionRef,
    centerSectionRef,
    rightSectionRef,
    watchSources = [],
    minGap = 12
  } = options;

  const centerLeft = ref<number | null>(null);
  const centerMaxWidth = ref<number | null>(null);

  const updateCenterPosition = () => {
    if (!containerRef.value || !centerSectionRef.value) return;

    const containerRect = containerRef.value.getBoundingClientRect();
    const containerW = containerRect.width;
    if (containerW <= 0) return;

    const leftEdge = leftSectionRef.value
      ? leftSectionRef.value.getBoundingClientRect().right - containerRect.left
      : 110;

    const rightEdge = rightSectionRef.value
      ? rightSectionRef.value.getBoundingClientRect().left - containerRect.left
      : containerW - 280;

    // Natural intrinsic content width of center telemetry items
    const centerW = centerSectionRef.value.scrollWidth || centerSectionRef.value.offsetWidth || 360;

    const minLeft = leftEdge + minGap;
    const maxRight = rightEdge - minGap;
    const availableGap = Math.max(0, maxRight - minLeft);

    const maxLeft = maxRight - centerW;
    const idealLeft = (containerW - centerW) / 2;

    if (maxLeft < minLeft) {
      centerLeft.value = minLeft;
      centerMaxWidth.value = availableGap;
    } else {
      // Exactly centered relative to window, but smoothly moves aside if sides approach
      centerLeft.value = Math.min(Math.max(idealLeft, minLeft), maxLeft);
      centerMaxWidth.value = availableGap;
    }
  };

  const centerStyle = computed(() => {
    if (centerLeft.value === null) {
      return {
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'calc(100% - 420px)'
      };
    }
    return {
      left: `${Math.round(centerLeft.value)}px`,
      transform: 'translateY(-50%)',
      maxWidth: centerMaxWidth.value !== null ? `${Math.round(centerMaxWidth.value)}px` : undefined,
      transition: 'left 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease'
    };
  });

  let resizeObserver: ResizeObserver | null = null;

  const initListeners = () => {
    nextTick(updateCenterPosition);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateCenterPosition();
      });
      if (containerRef.value) resizeObserver.observe(containerRef.value);
      if (leftSectionRef.value) resizeObserver.observe(leftSectionRef.value);
      if (rightSectionRef.value) resizeObserver.observe(rightSectionRef.value);
      if (centerSectionRef.value) resizeObserver.observe(centerSectionRef.value);
    }
    window.addEventListener('resize', updateCenterPosition, { passive: true });
  };

  const cleanupListeners = () => {
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener('resize', updateCenterPosition);
  };

  if (getCurrentInstance()) {
    onMounted(initListeners);
    onUnmounted(cleanupListeners);
  }

  if (watchSources.length > 0) {
    watch(watchSources, () => {
      nextTick(updateCenterPosition);
    });
  }

  return {
    centerLeft,
    centerMaxWidth,
    centerStyle,
    updateCenterPosition
  };
}
