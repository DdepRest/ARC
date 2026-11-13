<template>
  <div 
    ref="reactorWrapperEl" 
    data-arc-reactor="true"
    class="absolute inset-0 flex items-center justify-center pointer-events-none z-0 bg-transparent"
  >
    <div
      ref="container"
      class="reactor-canvas-container w-full h-full pointer-events-auto cursor-default"
      :class="{ 'opacity-0 pointer-events-none': isWebglContextLost }"
      @click="triggerPulse"
    ></div>

    <!-- 2D Fallback Rings (Rendered ONLY on confirmed WebGL context loss, v-if NOT v-show) -->
    <div 
      v-if="isWebglContextLost" 
      data-arc-fallback-rings="true"
      class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 animate-pulse select-none"
    >
      <svg class="w-64 h-64" viewBox="0 0 100 100" data-arc-ring-svg="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--accent, #ef4444)" stroke-width="1.5" opacity="0.6" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--accent, #ef4444)" stroke-width="1" stroke-dasharray="4 4" opacity="0.4" />
        <circle cx="50" cy="50" r="4" fill="var(--accent, #ef4444)" opacity="0.8" />
      </svg>
      <div class="mt-4 text-[10px] font-mono text-[var(--accent-text,var(--accent,#f87171))] tracking-widest uppercase">
        WEBGL_FALLBACK // RECONNECTING...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type { ReactorState } from '../../../shared/types/ui';
import { useReactor3D } from './useReactor3D';
import { registerSingleton, getArcLiveDump } from '../../utils/arcGhostDetector';

const props = withDefaults(defineProps<{
  state?: ReactorState;
  intensity?: number;
  coreCenter?: { x: number, y: number };
  coreScale?: number;
}>(), {
  intensity: 0.5,
  coreCenter: () => ({ x: window.innerWidth / 2, y: window.innerHeight * 0.47 }),
  coreScale: 1.0
});

const container = ref<HTMLElement | null>(null);
const reactorWrapperEl = ref<HTMLElement | null>(null);

let unregister: (() => void) | null = null;

onMounted(() => {
  unregister = registerSingleton('ReactorCore');
  nextTick(() => {
    const dump = getArcLiveDump();
    console.info('[ARC LIVE DUMP: INITIAL MOUNT]', dump);
  });
});

onUnmounted(() => {
  if (unregister) {
    unregister();
    unregister = null;
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (unregister) {
      unregister();
      unregister = null;
    }
  });
}

const { triggerPulse, isWebglContextLost } = useReactor3D(container, reactorWrapperEl, props);

watch(isWebglContextLost, (lost) => {
  if (lost) {
    nextTick(() => {
      const dump = getArcLiveDump();
      console.warn('[ARC LIVE DUMP: RING VISIBLE (WEBGL CONTEXT LOST)]', dump);
    });
  } else {
    nextTick(() => {
      const dump = getArcLiveDump();
      console.info('[ARC LIVE DUMP: WEBGL CONTEXT RESTORED (3D SCENE ACTIVE)]', dump);
    });
  }
});
</script>

<style>
.reactor-canvas-container canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
</style>
