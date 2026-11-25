import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { GraphicsConfig } from '../../../features/settings/logic/graphics-presets';
import type { GpuCapabilities } from './reactor-gpu-capabilities';

const ColorGradingVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.04 },
    uSaturation: { value: 1.04 },
    uVignette: { value: 0.14 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Subtle filmic saturation & gentle midtone contrast in linear HDR without crushing darks
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = max(vec3(0.0), (col - vec3(0.02)) * uContrast + vec3(0.02));

      // Delicate optical edge vignette (applied gently to preserve transparent backdrop alpha)
      if (uVignette > 0.001) {
        vec2 centered = (vUv - 0.5) * 2.0;
        float distSq = dot(centered, centered);
        float vig = 1.0 - smoothstep(0.55, 1.85, distSq) * uVignette;
        col *= vig;
      }

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

export interface ReactorPostFX {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  gtaoPass: GTAOPass | null;
  bokehPass: BokehPass | null;
  applyGraphicsConfig: (config: GraphicsConfig, caps?: GpuCapabilities | null) => void;
  setAdaptiveRenderScale: (scale: number | null) => void;
  setAdaptiveOverrides: (overrides: {
    renderScale?: number | null;
    disableAo?: boolean;
    bloomResolutionScale?: number | null;
  }) => void;
  updateSize: (width: number, height: number) => void;
  getEffectiveDpr: () => number;
  getEffectiveRenderScale: () => number;
  dispose: () => void;
}

export function createReactorPostFX(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  initialConfig: GraphicsConfig,
  initialCaps: GpuCapabilities
): ReactorPostFX {
  let currentWidth = Math.max(1, width);
  let currentHeight = Math.max(1, height);
  let activeConfig: GraphicsConfig = initialConfig;
  let activeCaps: GpuCapabilities = initialCaps;

  let adaptiveRenderScale: number | null = null;
  let adaptiveDisableAo = false;
  let adaptiveBloomScale: number | null = null;
  let effectiveDpr = 1.0;

  const mapBloomRadius = (uiRadius: number): number => {
    const clamped = Math.max(0.2, Math.min(0.8, uiRadius));
    return 0.18 + ((clamped - 0.2) / 0.6) * 0.14;
  };

  const resolveBufferType = (cfg: GraphicsConfig, caps: GpuCapabilities): THREE.TextureDataType => {
    if (cfg.colorBufferPrecision === 'halfFloat' && caps.supportsHalfFloatColorBuffer) {
      return THREE.HalfFloatType;
    }
    return THREE.UnsignedByteType;
  };

  const resolveSamples = (cfg: GraphicsConfig, caps: GpuCapabilities): number => {
    if (!caps.isWebGL2 || caps.isSoftwareGl || caps.maxSamples <= 0 || cfg.msaaSamples <= 0) {
      return 0;
    }
    return Math.min(caps.maxSamples, cfg.msaaSamples);
  };

  const computeEffectiveDpr = (cfg: GraphicsConfig, caps: GpuCapabilities): number => {
    const winDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const baseDpr = cfg.targetDpr === 'auto' ? Math.min(winDpr, 1.25) : cfg.targetDpr;
    const scale = adaptiveRenderScale !== null ? adaptiveRenderScale : cfg.renderScale;
    const combined = baseDpr * scale;
    const maxCap = caps.isSoftwareGl ? 1.0 : 1.5;
    return Math.max(0.65, Math.min(maxCap, combined));
  };

  const computeBloomScale = (cfg: GraphicsConfig): number => {
    if (adaptiveBloomScale !== null) return adaptiveBloomScale;
    return Math.max(0.25, Math.min(1.0, cfg.bloomResolutionScale || 0.5));
  };

  effectiveDpr = computeEffectiveDpr(activeConfig, activeCaps);
  const initialSamples = resolveSamples(activeConfig, activeCaps);
  const initialBufferType = resolveBufferType(activeConfig, activeCaps);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setPixelRatio(effectiveDpr);

  const initialRt = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(currentWidth * effectiveDpr)),
    Math.max(1, Math.round(currentHeight * effectiveDpr)),
    {
      type: initialBufferType,
      samples: initialSamples,
    }
  );

  const composer = new EffectComposer(renderer, initialRt);
  if (composer.renderTarget1) composer.renderTarget1.samples = 0;
  if (composer.renderTarget2) composer.renderTarget2.samples = initialSamples;
  composer.setPixelRatio(effectiveDpr);
  composer.setSize(currentWidth, currentHeight);

  // 1. Scene RenderPass (linear HDR, transparent background preserved)
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(0x000000);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  // 2. GTAOPass (50% resolution, hardware HalfFloat GPUs only)
  let gtaoPass: GTAOPass | null = null;
  if (activeCaps.supportsHalfFloatColorBuffer && !activeCaps.isSoftwareGl) {
    try {
      const aoW = Math.max(1, Math.round(currentWidth * effectiveDpr * 0.5));
      const aoH = Math.max(1, Math.round(currentHeight * effectiveDpr * 0.5));
      gtaoPass = new GTAOPass(scene, camera, aoW, aoH);
      gtaoPass.output = GTAOPass.OUTPUT.Default;
      gtaoPass.updateGtaoMaterial({
        radius: 0.65,
        distanceExponent: 1.6,
        thickness: 1.2,
        scale: 1.0,
        samples: 12,
        distanceFallOff: 0.9,
      });
      gtaoPass.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 5,
        samples: 8,
      });
      gtaoPass.blendIntensity = 0.65;
      gtaoPass.enabled = false;
      composer.addPass(gtaoPass);
    } catch (err) {
      console.warn('[ReactorPostFX] GTAOPass unavailable, continuing without AO:', err);
      gtaoPass = null;
    }
  }

  // 3. Optional BokehPass (STRICTLY disabled in Eco/Balanced/Cinematic; enabled only in Showcase)
  let bokehPass: BokehPass | null = null;
  if (!activeCaps.isSoftwareGl) {
    try {
      bokehPass = new BokehPass(scene, camera, {
        focus: 41.2,
        aperture: 0.00012,
        maxblur: 0.003,
      });
      bokehPass.enabled = false;
      composer.addPass(bokehPass);
    } catch {
      bokehPass = null;
    }
  }

  // 4. Calibrated UnrealBloomPass (honors actual config strength/radius/threshold/scale)
  const initBloomScale = computeBloomScale(activeConfig);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      Math.max(1, Math.round(currentWidth * effectiveDpr * initBloomScale)),
      Math.max(1, Math.round(currentHeight * effectiveDpr * initBloomScale))
    ),
    0.26 * (activeConfig.bloomStrength / 100),
    mapBloomRadius(activeConfig.bloomRadius),
    Math.max(0.58, activeConfig.bloomThreshold)
  );
  bloomPass.enabled = activeConfig.bloomEnabled;
  composer.addPass(bloomPass);

  // 5. Subtle Color Grading & Optical Vignette (linear HDR space, alpha-preserving)
  const colorGradePass = new ShaderPass(ColorGradingVignetteShader);
  colorGradePass.enabled = activeConfig.colorGrading || activeConfig.vignetteStrength > 0.001;
  composer.addPass(colorGradePass);

  // 6. Single OutputPass (ACES Filmic Tone Mapping + Linear -> sRGB encoding)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // 7. Conditional FXAA Pass (placed AFTER OutputPass in sRGB space; genuinely respects config.fxaaEnabled)
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.enabled = activeConfig.fxaaEnabled;
  composer.addPass(fxaaPass);

  let currentBufferType: THREE.TextureDataType = initialBufferType;

  const syncPassResolutions = (dpr: number) => {
    const effW = Math.max(1, Math.round(currentWidth * dpr));
    const effH = Math.max(1, Math.round(currentHeight * dpr));

    if (fxaaPass.material?.uniforms?.resolution) {
      fxaaPass.material.uniforms.resolution.value.set(1 / effW, 1 / effH);
    }

    const bScale = computeBloomScale(activeConfig);
    bloomPass.setSize(
      Math.max(1, Math.round(effW * bScale)),
      Math.max(1, Math.round(effH * bScale))
    );

    if (gtaoPass) {
      // Strictly 50% resolution for GTAO
      gtaoPass.setSize(
        Math.max(1, Math.round(effW * 0.5)),
        Math.max(1, Math.round(effH * 0.5))
      );
    }
  };

  const syncTargetsAndPasses = () => {
    const targetSamples = resolveSamples(activeConfig, activeCaps);
    const targetType = resolveBufferType(activeConfig, activeCaps);
    effectiveDpr = computeEffectiveDpr(activeConfig, activeCaps);

    const rt1 = composer.renderTarget1;
    const rt2 = composer.renderTarget2;

    if (rt1 && (rt1.samples !== 0 || rt1.texture.type !== targetType)) {
      rt1.samples = 0;
      rt1.texture.type = targetType;
      rt1.dispose();
    }
    if (rt2 && (rt2.samples !== targetSamples || rt2.texture.type !== targetType)) {
      rt2.samples = targetSamples;
      rt2.texture.type = targetType;
      rt2.dispose();
    }
    currentBufferType = targetType;

    // Configure passes
    if (gtaoPass) {
      const aoActive = !adaptiveDisableAo && !activeCaps.isSoftwareGl && activeConfig.aoMode !== 'off';
      gtaoPass.enabled = aoActive;
      if (aoActive) {
        const isFullGtao = activeConfig.aoMode === 'gtao';
        gtaoPass.blendIntensity = isFullGtao ? 0.78 : 0.45;
        gtaoPass.updateGtaoMaterial({
          radius: isFullGtao ? 0.68 : 0.52,
          samples: isFullGtao ? 14 : 8,
          distanceExponent: 1.6,
          thickness: 1.15,
          scale: 1.0,
          distanceFallOff: 0.9,
        });
      }
    }

    if (bokehPass) {
      bokehPass.enabled = Boolean(activeConfig.dofEnabled) && !activeCaps.isSoftwareGl;
    }

    bloomPass.enabled = activeConfig.bloomEnabled;
    bloomPass.radius = mapBloomRadius(activeConfig.bloomRadius);
    bloomPass.threshold = Math.max(0.58, Math.min(0.85, activeConfig.bloomThreshold));

    const wantGrading = activeConfig.colorGrading;
    const vig = Math.max(0, Math.min(0.35, activeConfig.vignetteStrength));
    colorGradePass.enabled = wantGrading || vig > 0.001;
    if (colorGradePass.uniforms) {
      colorGradePass.uniforms.uContrast.value = wantGrading ? 1.045 : 1.0;
      colorGradePass.uniforms.uSaturation.value = wantGrading ? 1.05 : 1.0;
      colorGradePass.uniforms.uVignette.value = vig;
    }

    fxaaPass.enabled = activeConfig.fxaaEnabled;

    renderer.setPixelRatio(effectiveDpr);
    composer.setPixelRatio(effectiveDpr);
    renderer.setSize(currentWidth, currentHeight, false);
    composer.setSize(currentWidth, currentHeight);

    // Override pass resolutions AFTER composer.setSize() so GTAO stays 50% and Bloom respects bloomResolutionScale
    syncPassResolutions(effectiveDpr);
  };

  syncTargetsAndPasses();

  const applyGraphicsConfig = (config: GraphicsConfig, caps?: GpuCapabilities | null) => {
    activeConfig = config;
    if (caps) activeCaps = caps;
    syncTargetsAndPasses();
  };

  const setAdaptiveRenderScale = (scale: number | null) => {
    if (adaptiveRenderScale === scale) return;
    adaptiveRenderScale = scale;
    syncTargetsAndPasses();
  };

  const setAdaptiveOverrides = (overrides: {
    renderScale?: number | null;
    disableAo?: boolean;
    bloomResolutionScale?: number | null;
  }) => {
    let changed = false;
    if (overrides.renderScale !== undefined && overrides.renderScale !== adaptiveRenderScale) {
      adaptiveRenderScale = overrides.renderScale;
      changed = true;
    }
    if (overrides.disableAo !== undefined && overrides.disableAo !== adaptiveDisableAo) {
      adaptiveDisableAo = overrides.disableAo;
      changed = true;
    }
    if (overrides.bloomResolutionScale !== undefined && overrides.bloomResolutionScale !== adaptiveBloomScale) {
      adaptiveBloomScale = overrides.bloomResolutionScale;
      changed = true;
    }
    if (changed) {
      syncTargetsAndPasses();
    }
  };

  const updateSize = (w: number, h: number) => {
    currentWidth = Math.max(1, w);
    currentHeight = Math.max(1, h);
    camera.aspect = currentWidth / currentHeight;
    camera.updateProjectionMatrix();
    syncTargetsAndPasses();
  };

  const dispose = () => {
    try { composer.dispose(); } catch {}
    try { gtaoPass?.dispose(); } catch {}
    try { bokehPass?.dispose(); } catch {}
    try { bloomPass.dispose(); } catch {}
    try { colorGradePass.dispose(); } catch {}
    try { outputPass.dispose(); } catch {}
    try { fxaaPass.dispose(); } catch {}
    void currentBufferType;
  };

  return {
    composer,
    bloomPass,
    gtaoPass,
    bokehPass,
    applyGraphicsConfig,
    setAdaptiveRenderScale,
    setAdaptiveOverrides,
    updateSize,
    getEffectiveDpr: () => effectiveDpr,
    getEffectiveRenderScale: () => (adaptiveRenderScale !== null ? adaptiveRenderScale : activeConfig.renderScale),
    dispose,
  };
}
