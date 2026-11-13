import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import type { GraphicsConfig } from "../../../features/settings/logic/graphics-presets";

export interface ReactorPostFX {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  bokehPass?: BokehPass;
  updatePixelRatio: (quality: string, scale?: number) => void;
  applyGraphicsConfig: (config: GraphicsConfig) => void;
  updateSize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createReactorPostFX(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  graphicsQuality: string,
  renderScale: number = 1.0,
  initialConfig?: GraphicsConfig | null,
): ReactorPostFX {
  let currentWidth = width;
  let currentHeight = height;
  let currentQuality = graphicsQuality;
  let currentScale = renderScale;
  let activeConfig: GraphicsConfig | null = initialConfig ?? null;

  const mapBloomRadius = (uiRadius: number): number => {
    const clamped = Math.max(0.2, Math.min(0.8, uiRadius));
    // Maps UI slider [0.20 .. 0.80] into the balanced optical sweet spot [0.32 .. 0.41]
    return 0.32 + ((clamped - 0.2) / 0.6) * 0.09;
  };

  const resolveSamples = (cfg?: GraphicsConfig | null, quality?: string): number => {
    // 4x hardware MSAA on HalfFloatType is the sweet spot for integrated & discrete GPUs
    const maxSamples = Math.min(renderer.capabilities?.maxSamples ?? 4, 4);
    if (cfg) {
      if (cfg.msaaSamples <= 0) return 0;
      return Math.min(maxSamples, cfg.msaaSamples);
    }
    if (quality === "Low") return 0;
    if (quality === "Medium") return Math.min(maxSamples, 2);
    return maxSamples;
  };

  const calculateTargetDpr = (_quality: string, scale: number = 1.0, cfg?: GraphicsConfig | null): number => {
    const windowDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (cfg) {
      const baseDpr =
        cfg.targetDpr === "auto"
          ? Math.min(windowDpr, 1.25)
          : cfg.targetDpr;
      const rawCombined = baseDpr * cfg.renderScale;
      // Low (1.0 * 0.75 = 0.75) -> 0.75x lightweight render target
      if (rawCombined <= 0.8) {
        return 0.75;
      }
      // Medium (1.0 * 1.0 = 1.0) -> 1.0x native
      if (rawCombined <= 1.05) {
        return 1.0;
      }
      // High (1.25 * 1.0 = 1.25) -> 1.15x crisp render without excessive fillrate penalty
      if (rawCombined <= 1.35) {
        return 1.15;
      }
      // Ultra (1.5 * 1.25 = 1.875) -> 1.35x supersampling
      if (rawCombined <= 2.0) {
        return 1.35;
      }
      // UltraPlus (2.0 * 1.5 = 3.0) -> 1.65x supersampling
      return 1.65;
    }

    if (_quality === "Low") return 0.75;
    if (_quality === "Medium") return 1.0 * scale;
    return Math.min(1.5, Math.max(windowDpr, 1.15) * scale);
  };

  const calculateBloomScale = (cfg?: GraphicsConfig | null, quality?: string): number => {
    if (!cfg) return quality === "Low" ? 0.45 : 0.65;
    const baseDpr = cfg.targetDpr === "auto" ? 1.25 : cfg.targetDpr;
    const rawCombined = baseDpr * cfg.renderScale;
    if (rawCombined <= 0.8) return 0.45;  // Low: fast quarter-area bloom
    if (rawCombined <= 1.05) return 0.55; // Medium: half-scale Gaussian pyramid
    if (rawCombined <= 1.35) return 0.65; // High: optimal optical bloom without 5-mip fillrate bottleneck
    if (rawCombined <= 2.0) return 0.80;  // Ultra
    return 1.0;                           // UltraPlus: full-resolution Gaussian bloom pyramid
  };

  const initialDpr = calculateTargetDpr(graphicsQuality, renderScale, activeConfig);
  const initialSamples = resolveSamples(activeConfig, graphicsQuality);
  renderer.setPixelRatio(initialDpr);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(width * initialDpr)),
    Math.max(1, Math.round(height * initialDpr)),
    {
      type: THREE.HalfFloatType,
      samples: initialSamples,
    }
  );

  const composer = new EffectComposer(renderer, renderTarget);
  // IMPORTANT: In Three.js EffectComposer, readBuffer = renderTarget2 and writeBuffer = renderTarget1.
  // RenderPass renders into readBuffer (renderTarget2), and neither RenderPass nor UnrealBloomPass swaps buffers.
  // Therefore, hardware MSAA samples MUST be on renderTarget2 (readBuffer), while renderTarget1 (unused writeBuffer) stays at 0.
  if (composer.renderTarget1) {
    composer.renderTarget1.samples = 0;
  }
  if (composer.renderTarget2) {
    composer.renderTarget2.samples = initialSamples;
  }
  composer.setPixelRatio(initialDpr);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(0x000000);
  renderPass.clearAlpha = 0;

  const initialBloomScale = calculateBloomScale(activeConfig, graphicsQuality);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      Math.max(1, Math.round(width * initialDpr * initialBloomScale)),
      Math.max(1, Math.round(height * initialDpr * initialBloomScale))
    ),
    0.52,
    activeConfig ? mapBloomRadius(activeConfig.bloomRadius) : 0.38,
    0.48
  );
  bloomPass.enabled = activeConfig ? activeConfig.bloomEnabled : true;

  // Keep fxaaPass disabled so UnrealBloomPass remains the final pass (renderToScreen = true)
  // and applies ACESFilmicToneMapping + LinearToSRGB via bloomPass.basic before additive bloom blending.
  const fxaaPass = new ShaderPass(FXAAShader);
  const syncFxaaResolution = (w: number, h: number, dpr: number) => {
    const effW = Math.max(1, w * dpr);
    const effH = Math.max(1, h * dpr);
    if (fxaaPass.material?.uniforms?.resolution) {
      fxaaPass.material.uniforms.resolution.value.set(1 / effW, 1 / effH);
    }
  };
  fxaaPass.enabled = false;
  syncFxaaResolution(width, height, initialDpr);

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(fxaaPass);
  bloomPass.setSize(
    Math.max(1, Math.round(width * initialDpr * initialBloomScale)),
    Math.max(1, Math.round(height * initialDpr * initialBloomScale))
  );

  const syncTargetsAndSize = (dpr: number) => {
    const targetSamples = resolveSamples(activeConfig, currentQuality);
    const rt1 = composer.renderTarget1;
    const rt2 = composer.renderTarget2;
    if (rt1 && rt1.samples !== 0) {
      rt1.samples = 0;
      rt1.dispose();
    }
    if (rt2 && rt2.samples !== targetSamples) {
      rt2.samples = targetSamples;
      rt2.dispose();
    }

    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    renderer.setSize(currentWidth, currentHeight, false);
    composer.setSize(currentWidth, currentHeight);

    syncFxaaResolution(currentWidth, currentHeight, dpr);

    const bScale = calculateBloomScale(activeConfig, currentQuality);
    const bw = Math.max(1, Math.round(currentWidth * dpr * bScale));
    const bh = Math.max(1, Math.round(currentHeight * dpr * bScale));
    bloomPass.setSize(bw, bh);
  };

  const updatePixelRatio = (quality: string, scale: number = 1.0) => {
    currentQuality = quality;
    currentScale = scale;
    bloomPass.enabled = activeConfig ? activeConfig.bloomEnabled : true;
    const dpr = calculateTargetDpr(quality, scale, activeConfig);
    syncTargetsAndSize(dpr);
  };

  const applyGraphicsConfig = (config: GraphicsConfig) => {
    activeConfig = config;
    bloomPass.enabled = config.bloomEnabled;
    bloomPass.radius = mapBloomRadius(config.bloomRadius);
    fxaaPass.enabled = false;

    const dpr = calculateTargetDpr(currentQuality, config.renderScale, config);
    syncTargetsAndSize(dpr);
  };

  const updateSize = (w: number, h: number) => {
    currentWidth = w;
    currentHeight = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = calculateTargetDpr(currentQuality, currentScale, activeConfig);
    syncTargetsAndSize(dpr);
  };

  const dispose = () => {
    composer.dispose();
    if (bloomPass && typeof bloomPass.dispose === "function") {
      bloomPass.dispose();
    }
    if (fxaaPass && typeof fxaaPass.dispose === "function") {
      fxaaPass.dispose();
    }
    console.log("[GPU] Disposed EffectComposer and BloomPass");
  };

  return {
    composer,
    bloomPass,
    updatePixelRatio,
    applyGraphicsConfig,
    updateSize,
    dispose,
  };
}



