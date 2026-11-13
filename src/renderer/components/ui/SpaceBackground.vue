<template>
  <div class="space-background">
    <!-- Deep Space Gradient (Darker, more cinematic neutral) -->
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0E0E0E_0%,_#060606_100%)]"></div>
    
    <!-- Ultra-thin Engineering Grid (5-10% Opacity) -->
    <div class="absolute inset-0 overflow-hidden">
      <div class="absolute inset-[-50%] bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:40px_40px] transform-gpu"></div>
      <div class="absolute inset-[-50%] bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:160px_160px] transform-gpu"></div>
    </div>

    <!-- Structured Static Underlay for frosted rails and dock (4-6% structural luminance) -->
    <div 
      class="absolute inset-0 pointer-events-none"
      style="background: 
        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 330px, transparent 380px, transparent calc(100% - 380px), rgba(255, 255, 255, 0.04) calc(100% - 330px), rgba(255, 255, 255, 0.04) 100%),
        radial-gradient(ellipse 700px 180px at 50% 100%, rgba(255, 255, 255, 0.04) 0%, transparent 80%);"
    ></div>
    
    <!-- Vignette Overlay: Smooth fade to edges -->
    <div class="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_35%,_#060606_100%)] opacity-95"></div>
    
    <!-- Optional Legacy 2D Data Stream Canvas (disabled by default to prevent dual-canvas compositor bottleneck over WebGL Reactor) -->
    <canvas 
      v-if="enableLegacy2dStreams"
      ref="canvas" 
      class="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
    ></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { useEcoStore } from '../../stores/eco.store';
import { getActiveDiagnosticFlags } from '../../features/settings/composables/useRenderBottleneckDiag';

const canvas = ref<HTMLCanvasElement | null>(null);
const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const ecoStore = useEcoStore();

// Active during Diagnostic Stage 1 (Baseline) or when explicitly enabled in graphicsConfig; disabled in Stages 2-4 and Auto
const enableLegacy2dStreams = computed(() => {
  const diag = getActiveDiagnosticFlags();
  if (diag.overrideActive) return diag.enable2dStreams;
  return Boolean((settingsStore.graphicsConfig as any)?.legacy2dBackgroundStreams);
});

let cleanupCanvasLoop: (() => void) | null = null;

function mount2dStreamLoop() {
  if (cleanupCanvasLoop) {
    cleanupCanvasLoop();
    cleanupCanvasLoop = null;
  }
  if (!enableLegacy2dStreams.value || !canvas.value) return;

  const ctx = canvas.value.getContext('2d', { alpha: false, preserveDrawingBuffer: false });
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.value.width = width * dpr;
  canvas.value.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const particles: Array<{x: number, y: number, z: number, length: number, speed: number, angle: number, life: number}> = [];
  const pCount = 30;

  for (let i = 0; i < pCount; i++) {
    particles.push(createParticle(width, height));
  }

  function createParticle(w: number, h: number) {
    const angle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 4);
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * 0.5 + 0.1,
      length: Math.random() * 40 + 10,
      speed: Math.random() * 2 + 0.5,
      angle,
      life: Math.random() * 100
    };
  }

  let raf: number | null = null;
  let lastTime = 0;
  const targetFps = 15;
  let dirtyRect = { x: 0, y: 0, width: canvas.value.width, height: canvas.value.height };

  const checkShouldRun = () => {
    return enableLegacy2dStreams.value &&
           typeof document !== 'undefined' && 
           document.visibilityState === 'visible' && 
           ecoStore.isWindowFocused && 
           !ecoStore.isHidden && 
           ecoStore.currentEcoState !== 'idle';
  };

  const stopAnimation = () => {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };

  const disposeAndClear = () => {
    stopAnimation();
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      dirtyRect = { x: 0, y: 0, width, height };
    }
  };

  const startAnimation = () => {
    if (raf === null && checkShouldRun()) {
      lastTime = performance.now();
      raf = requestAnimationFrame(draw);
    }
  };

  const draw = (currentTime: number = performance.now()) => {
    if (!checkShouldRun()) {
      stopAnimation();
      return;
    }

    raf = requestAnimationFrame(draw);

    const fps = uiStore.isCanvasActive ? 15 : targetFps;
    const interval = 1000 / fps;
    const elapsed = currentTime - lastTime;
    if (elapsed < interval) return;

    lastTime = currentTime - (elapsed % interval);

    const padding = 2;
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      Math.max(0, dirtyRect.x - padding), 
      Math.max(0, dirtyRect.y - padding), 
      Math.min(width, dirtyRect.width + padding * 2), 
      Math.min(height, dirtyRect.height + padding * 2)
    );
    
    let minX = width, minY = height, maxX = 0, maxY = 0;

    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';

    particles.forEach((p, idx) => {
      p.x += Math.cos(p.angle) * p.speed * p.z;
      p.y += Math.sin(p.angle) * p.speed * p.z;
      p.life -= 1;
      
      if (p.x > width + p.length || p.x < -p.length || p.y > height + p.length || p.y < -p.length || p.life <= 0) {
        particles[idx] = createParticle(width, height);
      }
      
      const x1 = p.x;
      const y1 = p.y;
      const x2 = p.x - Math.cos(p.angle) * p.length;
      const y2 = p.y - Math.sin(p.angle) * p.length;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      minX = Math.min(minX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxX = Math.max(maxX, x1, x2);
      maxY = Math.max(maxY, y1, y2);
    });
    ctx.stroke();

    dirtyRect = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  };

  startAnimation();

  const handleResize = () => {
    if (canvas.value) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.value.width = width * dpr;
      canvas.value.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    }
  };

  const handleVisChange = () => {
    if (checkShouldRun()) startAnimation();
    else disposeAndClear();
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('blur', disposeAndClear);
  window.addEventListener('focus', startAnimation);
  document.addEventListener('visibilitychange', handleVisChange);

  const unwatchEco = watch(() => [ecoStore.currentEcoState, ecoStore.isWindowFocused], () => {
    if (checkShouldRun()) startAnimation();
    else disposeAndClear();
  });

  cleanupCanvasLoop = () => {
    disposeAndClear();
    unwatchEco();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('blur', disposeAndClear);
    window.removeEventListener('focus', startAnimation);
    document.removeEventListener('visibilitychange', handleVisChange);
  };
}

watch(enableLegacy2dStreams, async (enabled) => {
  if (enabled) {
    await nextTick();
    mount2dStreamLoop();
  } else if (cleanupCanvasLoop) {
    cleanupCanvasLoop();
    cleanupCanvasLoop = null;
  }
});

onMounted(() => {
  if (enableLegacy2dStreams.value) {
    mount2dStreamLoop();
  }
});

onUnmounted(() => {
  if (cleanupCanvasLoop) {
    cleanupCanvasLoop();
    cleanupCanvasLoop = null;
  }
});
</script>

<style scoped>
.space-background {
  position: absolute;
  inset: 0;
  z-index: -10;
  background-color: #050505;
}
</style>
