import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  clearStaticTextureCache,
  createCoreThermalTexture,
  createHotCoreTexture,
  createOuterEnvelopeTexture,
} from '../reactorTextures';
import { ReactorTextureRegistry } from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import { createReactorLighting } from './reactor-lighting';
import { buildReactorGeometry } from './reactor-geometry';
import { createReactorStateDriver } from './reactor-state-driver';
import { evaluateThermalRampRgb } from './reactor-core-plasma-shaders';
import {
  ColorGradingVignetteShader,
  GTAO_DENOISE_CONFIG,
  evaluateBilateralDenoiseWeight,
  resolveAutoDprCap,
  resolveEffectiveFxaa,
  resolveGtaoPassSettings,
} from './reactor-postfx-shaders';
import type { GpuCapabilities } from './reactor-gpu-capabilities';
import { GRAPHICS_PRESETS, type GraphicsConfig } from '../../../features/settings/logic/graphics-presets';

function ensureCanvas2dMock() {
  const makeCtx = (canvasObj: { width: number; height: number; __imageData?: Uint8ClampedArray }) => {
    const base: Record<string, any> = {
      createImageData: (cw: number, ch: number) => ({
        width: cw,
        height: ch,
        data: new Uint8ClampedArray(cw * ch * 4),
      }),
      putImageData: (img: { data: Uint8ClampedArray }) => {
        canvasObj.__imageData = img.data;
      },
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
      canvas: canvasObj,
    };
    return new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return () => {};
      },
    });
  };

  if (typeof globalThis.document === 'undefined') {
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 256,
            height: 256,
            getContext() {
              return makeCtx(this);
            },
          };
        }
        return {};
      },
    };
    return;
  }

  if (typeof HTMLCanvasElement !== 'undefined') {
    const proto = HTMLCanvasElement.prototype as any;
    proto.__arcMocked = true;
    proto.getContext = function () {
      return makeCtx(this);
    };
  }
}

describe('ARC-057 — Plasma Look Development, Material Separation & Render Calibration', () => {
  beforeEach(() => {
    ensureCanvas2dMock();
    clearStaticTextureCache();
  });

  afterEach(() => {
    clearStaticTextureCache();
  });

  it('1. replaces #include <emissivemap_fragment> in Balanced/Cinematic without duplicate modulation or diffuseColor turbulence', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('red', bundle);

    for (const preset of [GRAPHICS_PRESETS.Balanced, GRAPHICS_PRESETS.Cinematic]) {
      mats.applyGraphicsConfig(preset, null);
      for (const mat of [
        mats.singularityCoreEmissiveMat,
        mats.plasmaOuterEnvelopeMat,
        mats.plasmaVortexMat,
      ]) {
        const stub = {
          vertexShader: THREE.ShaderLib.standard.vertexShader,
          fragmentShader: THREE.ShaderLib.standard.fragmentShader,
          uniforms: {},
        } as any;
        mat.onBeforeCompile(stub, {} as any);

        // Single-pass replacement guarantees Three.js emissiveMap chunk does NOT execute before custom logic
        expect(stub.fragmentShader).not.toContain('#include <emissivemap_fragment>');
        // Raw map UV sampling under #ifdef USE_MAP replaces crushed diffuseColor turbulence
        expect(stub.fragmentShader).toContain('#ifdef USE_MAP');
        expect(stub.fragmentShader).toContain('texture2D(map, vMapUv)');
        expect(stub.fragmentShader).not.toContain('dot(diffuseColor.rgb');
      }
    }

    // Eco restores pure static fallback with untouched ShaderLib fragment
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Eco, null);
    const envEcoStub = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as any;
    mats.plasmaOuterEnvelopeMat.onBeforeCompile(envEcoStub, {} as any);
    expect(envEcoStub.fragmentShader).toBe(THREE.ShaderLib.standard.fragmentShader);
    expect(mats.plasmaOuterEnvelopeMat.customProgramCacheKey()).toContain('eco-static');

    mats.dispose();
    registry.disposeAll();
  });

  it('2. validates isolated 4-stop thermal ramp progression and deterministic outer-envelope texture caching/ownership', () => {
    // Isolated emission chromaticity ramp only (does NOT simulate full GPU framebuffer or Bloom)
    const crimsonHue: [number, number, number] = [1.0, 0.013, 0.027];
    const outer = evaluateThermalRampRgb(0.05, crimsonHue);
    const midOrange = evaluateThermalRampRgb(0.45, crimsonHue);
    const innerAmber = evaluateThermalRampRgb(0.75, crimsonHue);
    const hotCore = evaluateThermalRampRgb(0.98, crimsonHue);

    // Monotonic warming from deep crimson -> orange-red -> warm amber -> white-amber center
    expect(outer[0]).toBeGreaterThan(0.7);
    expect(midOrange[1]).toBeGreaterThan(outer[1] * 4);
    expect(innerAmber[1]).toBeGreaterThan(midOrange[1]);
    expect(hotCore[1]).toBeGreaterThan(innerAmber[1]);
    expect(hotCore[2]).toBeGreaterThan(innerAmber[2]);

    // Deterministic static texture cache & color space for all three core maps
    const env1 = createOuterEnvelopeTexture(256);
    const env2 = createOuterEnvelopeTexture(256);
    expect(env1).toBe(env2);
    expect(env1.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(env1.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(env1.wrapT).toBe(THREE.ClampToEdgeWrapping);

    // Mid-annular band (r ~0.64) is brighter than outer edge (r ~0.96)
    const envData = (env1.image as any).__imageData as Uint8ClampedArray;
    const ringIdx = (128 * 256 + Math.round(128 + 0.64 * 128)) * 4;
    const cornerIdx = (2 * 256 + 2) * 4;
    expect(envData[ringIdx]).toBeGreaterThan(120);
    expect(envData[cornerIdx]).toBeLessThan(20);

    // Core thermal map remains visibly luminous at r = 0.22/0.54 (main body sample outside hot core r = 0.145)
    const thermal = createCoreThermalTexture(256);
    const thermalData = (thermal.image as any).__imageData as Uint8ClampedArray;
    const r022UvOffset = Math.round((0.22 / 0.54) * 0.46 * 256);
    const bodyIdx = (128 * 256 + (128 + r022UvOffset)) * 4;
    expect(thermalData[bodyIdx]).toBeGreaterThan(220);
    expect(thermalData[bodyIdx + 1]).toBeGreaterThan(80);
  });

  it('3. enforces independent plasmaOuterEnvelopeMat lifecycle: pre-frame-0 binding, filtering, OFF/Power=0 blackout, and disposal separation', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.5, 500);
    camera.position.set(2.2, 1.6, 41.2);
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('red', bundle);
    const lighting = createReactorLighting(scene, 0xff1e2e);
    const geometry = buildReactorGeometry(scene, mats, lighting, 'high');

    let activeState = 'idle';
    let activePower = 1.0;
    let activeConfig: GraphicsConfig = { ...GRAPHICS_PRESETS.Balanced };

    const driver = createReactorStateDriver({
      scene,
      camera,
      renderer: { getContext: () => ({ isContextLost: () => false }) } as any,
      materials: mats,
      lighting,
      geometry,
      particles: {
        sparks: null,
        dustParticles: null,
        containmentLattice: null,
        dataNodes: null,
        nebulaMat: null,
        nebulaMesh: null,
      } as any,
      postfx: {
        composer: { render: () => {} },
        bloomPass: { enabled: true, strength: 0.2, radius: 0.22, threshold: 0.58 },
      } as any,
      getSettingsStore: () => ({
        reactorColorTheme: 'red',
        graphicsQuality: 'Medium',
        graphicsConfig: activeConfig,
        reactorPower: activePower,
        reactorSpeed: 1.0,
      }),
      getSystemStore: () => ({ cpuUsage: 15, ramUsage: 30 }),
      getUIStore: () => ({}),
      getReactorState: () => activeState,
      getIntensity: () => 1.0,
      getAudioTargets: () => ({
        bassTarget: 0,
        midTarget: 0,
        trebleTarget: 0,
        currentAudioTarget: 0,
      }),
      getCoreCenter: () => ({ x: 640, y: 360 }),
      getCoreScale: () => 1.0,
      getEffectiveConfig: () => activeConfig,
    });

    const outerEnv = scene.getObjectByName('arc-plasma-outer-envelope') as THREE.Mesh;
    const contField = scene.getObjectByName('arc-plasma-containment-field') as THREE.Mesh;
    const hotCore = scene.getObjectByName('arc-plasma-white-core') as THREE.Mesh;

    // Assigned synchronously before first rendered frame & independent from plasmaVortexMat
    expect(outerEnv.material).toBe(mats.plasmaOuterEnvelopeMat);
    expect(contField.material).toBe(mats.plasmaVortexMat);
    expect(outerEnv.material).not.toBe(contField.material);

    // Confirm geometry constraint: white hot core max radius < 0.18, so r = 0.22 is outside hot core
    scene.updateMatrixWorld(true);
    const pos = hotCore.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let hotMaxR = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(hotCore.matrixWorld);
      hotMaxR = Math.max(hotMaxR, Math.hypot(v.x, v.y));
    }
    expect(hotMaxR).toBeLessThan(0.22);

    // Filtering propagates to outerEnvelopeMap across applyGraphicsConfig
    const envTexRef = mats.plasmaOuterEnvelopeMat.emissiveMap!;
    expect(envTexRef).toBe(createOuterEnvelopeTexture(256));
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Cinematic, { maxAnisotropy: 8 } as any);
    expect(envTexRef.anisotropy).toBe(Math.min(GRAPHICS_PRESETS.Cinematic.anisotropy, 8));
    expect(envTexRef.minFilter).toBe(THREE.LinearMipmapLinearFilter);

    // Warm up idle frames: verify independent envelope & central-over-outer emissive hierarchy
    for (let i = 0; i < 20; i++) driver.updateFrame(0.032);
    expect(outerEnv.visible).toBe(true);
    expect(mats.plasmaOuterEnvelopeMat.opacity).toBeGreaterThan(0.35);
    expect(mats.plasmaOuterEnvelopeMat.emissiveIntensity).toBeGreaterThan(0.8);
    expect(mats.plasmaVortexMat.opacity).toBeLessThan(mats.plasmaOuterEnvelopeMat.opacity);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBeGreaterThan(mats.neonTubeMat.emissiveIntensity);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBeGreaterThan(mats.coreDiodeMat.emissiveIntensity);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBeGreaterThan(mats.criticalWhite.emissiveIntensity);

    // Complete OFF blackout & clean restoration
    activeState = 'off';
    for (let i = 0; i < 80; i++) driver.updateFrame(0.05);
    expect(outerEnv.visible).toBe(false);
    expect(mats.plasmaOuterEnvelopeMat.opacity).toBe(0);
    expect(mats.plasmaOuterEnvelopeMat.emissiveIntensity).toBe(0);

    activeState = 'idle';
    for (let i = 0; i < 40; i++) driver.updateFrame(0.05);
    expect(outerEnv.visible).toBe(true);
    expect(mats.plasmaOuterEnvelopeMat.opacity).toBeGreaterThan(0.3);
    expect(mats.plasmaOuterEnvelopeMat.emissiveIntensity).toBeGreaterThan(0.7);

    // Zero power blackout
    activePower = 0.0;
    for (let i = 0; i < 80; i++) driver.updateFrame(0.05);
    expect(outerEnv.visible).toBe(false);
    expect(mats.plasmaOuterEnvelopeMat.opacity).toBe(0);
    expect(mats.plasmaOuterEnvelopeMat.emissiveIntensity).toBe(0);

    // Strict disposal ownership: mats.dispose() disposes plasmaOuterEnvelopeMat once, never cached textures
    let envMatDisposed = 0;
    const origMatDispose = mats.plasmaOuterEnvelopeMat.dispose.bind(mats.plasmaOuterEnvelopeMat);
    mats.plasmaOuterEnvelopeMat.dispose = () => {
      envMatDisposed++;
      origMatDispose();
    };
    let envTexDisposed = 0;
    const origTexDispose = envTexRef.dispose.bind(envTexRef);
    envTexRef.dispose = () => {
      envTexDisposed++;
      origTexDispose();
    };

    mats.dispose();
    expect(envMatDisposed).toBe(1);
    expect(envTexDisposed).toBe(0);

    clearStaticTextureCache();
    expect(envTexDisposed).toBe(1);
    registry.disposeAll();
  });

  it('4. validates synthetic GTAO depth-discontinuity & normal-step rejection, FXAA-vs-MSAA4x, DPR 1.25 default cap, and preserved contrast curve', () => {
    expect(GTAO_DENOISE_CONFIG.radius).toBe(3);
    expect(GTAO_DENOISE_CONFIG.depthPhi).toBe(2);
    expect(GTAO_DENOISE_CONFIG.normalPhi).toBe(4.5);

    // Synthetic depth step: depthPhi=2 rejects cross-depth samples strictly more strongly than depthPhi=3
    const bleedDepthPhi2 = evaluateBilateralDenoiseWeight(4.0, 1.0, GTAO_DENOISE_CONFIG.depthPhi, GTAO_DENOISE_CONFIG.normalPhi);
    const bleedDepthPhi3 = evaluateBilateralDenoiseWeight(4.0, 1.0, 3.0, GTAO_DENOISE_CONFIG.normalPhi);
    expect(bleedDepthPhi2).toBeLessThan(bleedDepthPhi3);

    // Synthetic 60-degree bevel normal step (dot = 0.5): normalPhi=4.5 rejects stronger than normalPhi=3
    const bleedNormal45 = evaluateBilateralDenoiseWeight(0.0, 0.5, GTAO_DENOISE_CONFIG.depthPhi, 4.5);
    const bleedNormal30 = evaluateBilateralDenoiseWeight(0.0, 0.5, GTAO_DENOISE_CONFIG.depthPhi, 3.0);
    expect(bleedNormal45).toBeLessThan(bleedNormal30);

    const balancedGtao = resolveGtaoPassSettings(false);
    const cinematicGtao = resolveGtaoPassSettings(true);
    expect(balancedGtao.blendIntensity).toBeLessThan(cinematicGtao.blendIntensity);

    // Suppress redundant FXAA at MSAA 4x, preserve at MSAA 0/2
    expect(resolveEffectiveFxaa(true, 4)).toBe(false);
    expect(resolveEffectiveFxaa(true, 2)).toBe(true);
    expect(resolveEffectiveFxaa(true, 0)).toBe(true);
    expect(resolveEffectiveFxaa(false, 0)).toBe(false);

    // Performance-safe DPR cap: default strictly <= 1.25; integrated GPUs stay <= 1.25 even if headroom flag set
    const discreteCaps: GpuCapabilities = {
      isWebGL2: true,
      maxTextureSize: 8192,
      maxAnisotropy: 16,
      maxSamples: 4,
      supportsHalfFloatColorBuffer: true,
      supportsDisjointTimerQuery: true,
      supportsShadows: true,
      vendor: 'NVIDIA Corporation',
      rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)',
      isSoftwareGl: false,
    };
    const igpuCaps: GpuCapabilities = {
      ...discreteCaps,
      vendor: 'Intel',
      rendererName: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)',
    };
    expect(resolveAutoDprCap(2.0, discreteCaps, false)).toBe(1.25);
    expect(resolveAutoDprCap(2.0, igpuCaps, false)).toBe(1.25);
    expect(resolveAutoDprCap(2.0, igpuCaps, true)).toBe(1.25);
    expect(resolveAutoDprCap(2.0, discreteCaps, true)).toBe(1.5);

    // Existing contrast curve is preserved unchanged pending live GPU A/B captures
    expect(ColorGradingVignetteShader.fragmentShader).toContain(
      '(col - vec3(0.02)) * uContrast + vec3(0.02)'
    );
  });
});
