import { onMounted, onUnmounted, watch, ref, type Ref } from "vue";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useUIStore } from "../../stores/ui.store";
import { useSettingsStore } from "../../features/settings/stores/settings.store";
import { useEcoStore } from "../../stores/eco.store";
import { useSystemStore } from "../../stores/system.store";
import { getVoiceState } from "../../composables/useVoice";
import { audioManager } from "../../composables/useAudioManager";
import type { ReactorState } from "../../../shared/types/ui";
import { applyThemeToMaterials, pregenerateThemes, themeAccentHex, clearThemeTextureCache } from "./modules/reactor-theme";
import { clearStaticTextureCache } from "./reactorTextures";

import { createReactorMaterials, type ReactorMaterials } from "./modules/reactor-materials";
import { createReactorLighting, type ReactorLighting } from "./modules/reactor-lighting";
import { createReactorParticles, type ReactorParticles } from "./modules/reactor-particles";
import { createReactorPostFX, type ReactorPostFX } from "./modules/reactor-postfx";
import { buildReactorGeometry, type ReactorGeometryResult } from "./modules/reactor-geometry";
import { createReactorStateDriver } from "./modules/reactor-state-driver";

export interface ReactorProps {
  state?: ReactorState;
  intensity?: number;
  coreCenter?: { x: number; y: number };
  coreScale?: number;
}

export function useReactor3D(
  container: Ref<HTMLElement | null>,
  reactorWrapperEl: Ref<HTMLElement | null>,
  props: ReactorProps
) {
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const systemStore = useSystemStore();

  const isWebglContextLost = ref(false);

  let audioPollInterval: number | null = null;

  // Multi-band FFT Frequency Targets
  let bassTarget = 0;
  let midTarget = 0;
  let trebleTarget = 0;
  let currentAudioTarget = 0;

  let animationFrameId: number | null = null;
  let isPageVisible = !document.hidden;
  let resizeObserver: ResizeObserver | null = null;

  // Scene & Subsystem References
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let onContextLost: ((event: Event) => void) | null = null;
  let onContextRestored: (() => void) | null = null;
  let materials: ReactorMaterials | null = null;
  let lighting: ReactorLighting | null = null;
  let particles: ReactorParticles | null = null;
  let postfx: ReactorPostFX | null = null;
  let geometry: ReactorGeometryResult | null = null;
  let stateDriver: { updateFrame: (delta: number) => void; triggerPulse: () => void } | null = null;

  const clock = new THREE.Clock();

  // ==========================================
  // Audio Polling (FFT Multi-Band Decomposition)
  // ==========================================
  const startAudioPolling = () => {
    if (audioPollInterval) return;

    audioPollInterval = window.setInterval(() => {
      if (!settingsStore.isAudioReactive) {
        bassTarget = 0;
        midTarget = 0;
        trebleTarget = 0;
        currentAudioTarget = 0;
        return;
      }

      // Priority 1: Check actual TTS sound playing state regardless of reactorState
      const isTtsActive = audioManager.isTtsPlaying();
      const state = props.state || uiStore.reactorState;
      const isMicActive = !isTtsActive && (
        state === "listening" ||
        uiStore.isListening ||
        (uiStore.conversationCountdown != null && uiStore.conversationCountdown > 0)
      );

      // DIAGNOSTIC LOGGING FOR SOURCE SWITCHING
      const currentSource = isTtsActive ? 'tts' : (isMicActive ? 'mic' : 'idle');
      if ((window as any)._lastAudioSourceState !== currentSource) {
        (window as any)._lastAudioSourceState = currentSource;
        console.log(`[Reactor] Audio source switched to: ${currentSource} (isTtsPlaying=${isTtsActive}, state=${state})`);
      }

      if (isTtsActive) {
        // Active TTS audio element stream analysis
        const bands = audioManager.getFrequencyBands('tts');
        bassTarget = bands.bass;
        midTarget = bands.mid;
        trebleTarget = bands.treble;
        currentAudioTarget = bands.total > 0 ? bands.total : (audioManager.currentVolume?.value || 0);
      } else if (isMicActive) {
        // Active microphone stream analysis
        const micBands = audioManager.getFrequencyBands('mic');
        bassTarget = micBands.bass;
        midTarget = micBands.mid;
        trebleTarget = micBands.treble;
        currentAudioTarget = micBands.total;
      } else {
        bassTarget = 0;
        midTarget = 0;
        trebleTarget = 0;
        currentAudioTarget = 0;
      }
    }, 66);
  };

  const stopAudioPolling = () => {
    if (audioPollInterval) {
      window.clearInterval(audioPollInterval);
      audioPollInterval = null;
    }
    bassTarget = 0;
    midTarget = 0;
    trebleTarget = 0;
    currentAudioTarget = 0;
  };

  // Manual Pulse Trigger
  watch(
    () => uiStore.pulseTrigger,
    () => {
      if (stateDriver) stateDriver.triggerPulse();
    }
  );

  // Color Theme updates
  watch(() => settingsStore.reactorColorTheme, (theme) => {
    if (materials) applyThemeToMaterials(theme, materials);
  }, { immediate: true });

  // Graphics Quality, Render Scale & Granular Graphics Config
  watch([() => settingsStore.graphicsQuality, () => settingsStore.renderScale], ([quality, scale]) => {
    if (postfx) postfx.updatePixelRatio(quality, scale);
  });

  watch(
    () => settingsStore.graphicsConfig,
    (cfg) => {
      if (!cfg) return;
      const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 16;
      if (materials) materials.applyGraphicsConfig(cfg, maxAniso);
      if (postfx) postfx.applyGraphicsConfig(cfg);
    },
    { deep: true }
  );

  const ecoStore = useEcoStore();

  const shouldRenderReactor = () => {
    const docHidden = typeof document !== "undefined" && (document.hidden || document.visibilityState === "hidden");
    return !docHidden && uiStore.activeTab === 'core' && ecoStore.currentEcoState !== 'hidden' && !ecoStore.isHidden && !isWebglContextLost.value;
  };

  // Page Visibility, Focus & UI state: Stop animation loop on hidden state or minimized window, resume immediately on return
  const handleVisibilityChange = () => {
    isPageVisible = shouldRenderReactor();
    if (isPageVisible) {
      clock.getDelta(); // reset delta step
      lastFrameTime = performance.now();
      startAudioPolling();
      if (renderer) renderer.setAnimationLoop(null);
      if (animationFrameId === null && renderer && stateDriver) {
        animationFrameId = requestAnimationFrame(animate);
      }
    } else {
      stopAudioPolling();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (renderer) {
        renderer.setAnimationLoop(null);
      }
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleVisibilityChange);
  }
  watch(() => uiStore.activeTab, () => {
    handleVisibilityChange();
  });

  watch(
    [() => ecoStore.currentEcoState, () => ecoStore.isHidden],
    () => {
      handleVisibilityChange();
    }
  );

  watch(isWebglContextLost, (lost) => {
    if (lost) {
      stopAudioPolling();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (renderer) {
        renderer.setAnimationLoop(null);
      }
    } else {
      handleVisibilityChange();
    }
  });

  // ==========================================
  // Main Animation Loop
  // ==========================================
  let lastFrameTime = 0;

  const animate = (time: number = 0) => {
    if (!shouldRenderReactor() || !stateDriver) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return;
    }

    animationFrameId = requestAnimationFrame(animate);

    let minInterval = 0;
    if (uiStore.isHighComputeLoad) {
      minInterval = 1000 / 20; // Cap to 20 FPS under high compute load (downloads/LLM generation)
    } else if (ecoStore.currentEcoState === 'idle') {
      minInterval = 1000 / 15;
    } else {
      minInterval = 0; // Target 60 FPS in active state
    }

    if (settingsStore.targetFps && settingsStore.targetFps !== 'unlimited' && settingsStore.targetFps !== 'auto') {
      const parsed = parseInt(settingsStore.targetFps, 10);
      if (!isNaN(parsed) && parsed > 0) {
        minInterval = Math.max(minInterval, 1000 / parsed);
      }
    }

    if (minInterval > 0) {
      const elapsed = time - lastFrameTime;
      if (elapsed < minInterval - 0.5) {
        return;
      }
      lastFrameTime = time - (elapsed % minInterval);
    } else {
      lastFrameTime = time;
    }

    (window as any).__reactorFrameCount = ((window as any).__reactorFrameCount || 0) + 1;

    const delta = Math.min(0.1, clock.getDelta());
    if (stateDriver) {
      stateDriver.updateFrame(delta);
    }
  };

  // ==========================================
  // Three.js Cleanup
  // ==========================================
  const cleanUpThree = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    materials?.dispose();
    clearStaticTextureCache();
    clearThemeTextureCache();
    particles?.dispose();
    postfx?.dispose();

    if (scene) {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const disposeMaterial = (m: THREE.Material) => {
            const anyMat = m as any;
            if (anyMat.map) anyMat.map.dispose();
            if (anyMat.envMap) anyMat.envMap.dispose();
            if (anyMat.alphaMap) anyMat.alphaMap.dispose();
            if (anyMat.emissiveMap) anyMat.emissiveMap.dispose();
            if (anyMat.normalMap) anyMat.normalMap.dispose();
            if (anyMat.roughnessMap) anyMat.roughnessMap.dispose();
            if (anyMat.metalnessMap) anyMat.metalnessMap.dispose();
            m.dispose();
          };
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => disposeMaterial(m));
          else disposeMaterial(mesh.material);
        }
      });
      scene.clear();
      scene = null;
    }

    if (renderer) {
      if (onContextLost && renderer.domElement) {
        renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      }
      if (onContextRestored && renderer.domElement) {
        renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      }
      try {
        renderer.dispose();
      } catch {}
      if (renderer.domElement && renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer = null;
    }

    if (container.value) {
      container.value.innerHTML = '';
    }
  };

  // ==========================================
  // Three.js Initialization
  // ==========================================
  const initThree = () => {
    if (!container.value) return;

    cleanUpThree();

    const width = Math.max(container.value.clientWidth || window.innerWidth, 300);
    const height = Math.max(container.value.clientHeight || window.innerHeight, 300);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(12, width / height, 0.1, 1000);
    camera.position.z = 81.5;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        });
      } catch (err: any) {
        console.warn("[Reactor3D] WebGLRenderer creation failed:", err?.message || err);
        isWebglContextLost.value = true;
        return;
      }
    }
    // WebGLRenderer successfully created - ensure fallback rings are hidden
    isWebglContextLost.value = false;
    renderer.debug.checkShaderErrors = false;
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Step 1: GPU Audit & Telemetry
    if (typeof window !== "undefined") {
      let gpuVendor = "unknown-vendor";
      let gpuRenderer = "unknown-renderer";
      try {
        const gl = renderer.getContext();
        const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo && gl) {
          gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || gpuVendor;
          gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
        }
      } catch (e) {
        console.warn("[Reactor3D] Failed to read WEBGL_debug_renderer_info:", e);
      }

      (window as any).__reactorGpuAudit = {
        vendor: gpuVendor,
        renderer: gpuRenderer,
        powerPreference: "high-performance",
        getInfo: () => ({
          calls: renderer?.info?.render?.calls ?? 0,
          triangles: renderer?.info?.render?.triangles ?? 0,
          points: renderer?.info?.render?.points ?? 0,
          lines: renderer?.info?.render?.lines ?? 0,
          frame: renderer?.info?.render?.frame ?? 0,
          geometries: renderer?.info?.memory?.geometries ?? 0,
          textures: renderer?.info?.memory?.textures ?? 0,
        }),
      };
      console.log(`[Reactor3D] GPU: ${gpuVendor} | ${gpuRenderer} | powerPreference: high-performance`);
    }

    onContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("[Reactor3D] WebGL context lost handled with preventDefault.");
      isWebglContextLost.value = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };
    onContextRestored = () => {
      console.log("[Reactor3D] WebGL context restored.");
      isWebglContextLost.value = false;
      clearStaticTextureCache();
      clearThemeTextureCache();
      initThree();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);

    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
      (window as any).__simulateWebglLoss = () => {
        isWebglContextLost.value = true;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        if (renderer) renderer.forceContextLoss();
      };
      (window as any).__simulateWebglRestore = () => {
        isWebglContextLost.value = false;
        clearStaticTextureCache();
        clearThemeTextureCache();
        initThree();
      };
    }

    container.value.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    pmremGenerator.dispose();
    roomEnv.dispose();

    // Instantiate Subsystems
    const initialHex = themeAccentHex(settingsStore.reactorColorTheme);
    materials = createReactorMaterials(settingsStore.reactorColorTheme);
    lighting = createReactorLighting(scene, initialHex);

    geometry = buildReactorGeometry(
      scene,
      materials,
      lighting,
      settingsStore.graphicsQuality
    );

    particles = createReactorParticles(
      scene,
      geometry.reactorGroup,
      materials,
      settingsStore.graphicsQuality
    );

    postfx = createReactorPostFX(
      scene,
      camera,
      renderer,
      width,
      height,
      settingsStore.graphicsQuality,
      settingsStore.renderScale,
      settingsStore.graphicsConfig
    );

    if (settingsStore.graphicsConfig) {
      const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() || 16;
      materials.applyGraphicsConfig(settingsStore.graphicsConfig, maxAniso);
    }

    stateDriver = createReactorStateDriver({
      scene,
      camera,
      renderer,
      materials,
      lighting,
      particles,
      postfx,
      geometry,
      getReactorState: () => props.state || uiStore.reactorState,
      getVoiceState: () => getVoiceState(),
      getIntensity: () => props.intensity,
      getCoreCenter: () => props.coreCenter,
      getCoreScale: () => props.coreScale,
      getSettingsStore: () => settingsStore,
      getSystemStore: () => systemStore,
      getUIStore: () => uiStore,
      getAudioTargets: () => ({ bassTarget, midTarget, trebleTarget, currentAudioTarget }),
    });

    // Resize Observer for Stage
    resizeObserver = new ResizeObserver(() => {
      if (!container.value || !postfx) return;
      const w = Math.max(container.value.clientWidth || window.innerWidth, 300);
      const h = Math.max(container.value.clientHeight || window.innerHeight, 300);
      postfx.updateSize(w, h);
    });
    resizeObserver.observe(container.value);

    // Diagnostic Scene Traverse (GHOST TRAP v3.1 Scene Children Snapshot)
    const sceneObjects: Array<{ name: string; type: string; visible: boolean; isReactorGeometry: boolean }> = [];
    scene.traverse((obj) => {
      sceneObjects.push({
        name: obj.name || 'unnamed',
        type: obj.type,
        visible: obj.visible,
        isReactorGeometry: Boolean(obj.name && (obj.name.startsWith('arc-') || obj.name.includes('reactor'))),
      });
    });
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__ARC_SCENE_OBJECTS__ = sceneObjects;
      (globalThis as any).__getArcSceneTraverse = () => sceneObjects;
    }

    // Start Loop
    clock.start();
    animate();
  };

  // Watchdog: ensures canvas visibility state is always synchronized when context is OK
  let watchdogInterval: any = null;
  const startCanvasWatchdog = () => {
    if (watchdogInterval) return;
    watchdogInterval = setInterval(() => {
      if (!isWebglContextLost.value && renderer?.domElement && container.value) {
        if (!container.value.contains(renderer.domElement)) {
          container.value.appendChild(renderer.domElement);
        }
      }
    }, 2000);
  };

  onMounted(() => {
    handleVisibilityChange();
    initThree();
    startAudioPolling();
    startCanvasWatchdog();
  });

  onUnmounted(() => {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    }
    stopAudioPolling();
    cleanUpThree();
  });

  const triggerPulse = () => {
    stateDriver?.triggerPulse();
  };

  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__isWebglContextLost = isWebglContextLost;
    (globalThis as any).__isReactorRafActive = () => animationFrameId !== null;
  }

  return {
    triggerPulse,
    isWebglContextLost,
  };
}
