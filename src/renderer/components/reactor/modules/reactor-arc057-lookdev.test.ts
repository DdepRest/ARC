import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  clearStaticTextureCache,
  createCoreThermalTexture,
  createOuterEnvelopeTexture,
} from '../reactorTextures';
import { ReactorTextureRegistry } from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import { createReactorLighting } from './reactor-lighting';
import { buildReactorGeometry } from './reactor-geometry';
import { createReactorStateDriver } from './reactor-state-driver';
import {
  applyThemeToMaterials,
  clearThemeTextureCache,
  getThemeTextures,
} from './reactor-theme';
import {
  CORE_PLASMA_SHADER_CONFIG,
  evaluateThermalRampRgb,
} from './reactor-core-plasma-shaders';
import {
  ColorGradingVignetteShader,
  GTAO_DENOISE_CONFIG,
  evaluatePoissonDenoiseWeight,
  getPoissonDenoiseLuminance,
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
    clearThemeTextureCache();
  });

  afterEach(() => {
    clearStaticTextureCache();
    clearThemeTextureCache();
  });

  it('1. replaces #include <emissivemap_fragment> once, samples outerEnvelopeMap in Balanced/Cinematic, and unbinds plasmaVortexMat.emissiveMap cleanly', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('red', bundle);
    const expectedEnvTex = createOuterEnvelopeTexture(256);
    const expectedThermalTex = createCoreThermalTexture(512);

    for (const preset of [GRAPHICS_PRESETS.Balanced, GRAPHICS_PRESETS.Cinematic]) {
      mats.applyGraphicsConfig(preset, null);

      // plasmaOuterEnvelopeMat keeps outerEnvelopeMap bound and samples it via USE_EMISSIVEMAP / vEmissiveMapUv
      expect(mats.plasmaOuterEnvelopeMat.emissiveMap).toBe(expectedEnvTex);
      // plasmaVortexMat intentionally unbinds emissiveMap in Balanced/Cinematic (radial falloff via vColor, filaments via map)
      expect(mats.plasmaVortexMat.emissiveMap).toBeNull();

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

        if (mat === mats.plasmaOuterEnvelopeMat) {
          expect(stub.fragmentShader).toContain('#ifdef USE_EMISSIVEMAP');
          expect(stub.fragmentShader).toContain('vEmissiveMapUv');
          expect(stub.fragmentShader).toContain('texture2D(emissiveMap, arcEnvUv)');
          expect(stub.fragmentShader).toContain('pow(max(arcEnvMapSample.r');
          // Preserve Three.js r174 hardware sRGB decoding without manual double-decode
          expect(stub.fragmentShader).not.toContain('sRGBTransferEOTF');
        }
      }
    }

    // Eco restores pure static fallback with untouched ShaderLib fragment & valid emissiveMaps
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Eco, null);
    expect(mats.plasmaOuterEnvelopeMat.emissiveMap).toBe(expectedEnvTex);
    expect(mats.plasmaVortexMat.emissiveMap).toBe(expectedThermalTex);
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

  it('2. validates isolated 4-stop thermal ramp progression, outer-envelope UV alignment, and theme synchronization', () => {
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

    // Deterministic static texture cache & color space for outer envelope
    const env1 = createOuterEnvelopeTexture(256);
    const env2 = createOuterEnvelopeTexture(256);
    expect(env1).toBe(env2);
    expect(env1.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(env1.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(env1.wrapT).toBe(THREE.ClampToEdgeWrapping);

    // Validate transformed outer-envelope UV range (geometry r_uv = 0.342..0.449) against actual texture pixels
    const envData = (env1.image as any).__imageData as Uint8ClampedArray;
    const sampleRedAtUv = (u: number, v: number): number => {
      const cx = Math.max(0, Math.min(255, Math.floor(Math.max(0.01, Math.min(0.99, u)) * 256)));
      const cy = Math.max(0, Math.min(255, Math.floor(Math.max(0.01, Math.min(0.99, v)) * 256)));
      return envData[(cy * 256 + cx) * 4];
    };
    const scale = CORE_PLASMA_SHADER_CONFIG.outerEnvelopeUvScale;
    const innerRed = sampleRedAtUv(0.5 + 0.342 * scale, 0.5);
    const midRed = sampleRedAtUv(0.5 + 0.395 * scale, 0.5);
    const outerRed = sampleRedAtUv(0.5 + 0.449 * scale, 0.5);
    // Transformed UV band lands directly on the bright annular profile without clamping to dark edges
    expect(innerRed).toBeGreaterThan(200);
    expect(midRed).toBeGreaterThan(190);
    expect(outerRed).toBeGreaterThan(160);
    // Verify unaligned 1.4x scale would have pushed mid/outer geometry past texture edge into black
    expect(sampleRedAtUv(0.5 + 0.449 * 1.4, 0.5)).toBeLessThan(15);

    // Core thermal map remains visibly luminous at r = 0.22/0.54 (main body sample outside hot core r = 0.145)
    const thermal = createCoreThermalTexture(256);
    const thermalData = (thermal.image as any).__imageData as Uint8ClampedArray;
    const r022UvOffset = Math.round((0.22 / 0.54) * 0.46 * 256);
    const bodyIdx = (128 * 256 + (128 + r022UvOffset)) * 4;
    expect(thermalData[bodyIdx]).toBeGreaterThan(220);
    expect(thermalData[bodyIdx + 1]).toBeGreaterThan(80);

    // Runtime theme synchronization updates plasmaOuterEnvelopeMat.map while preserving outerEnvelopeMap
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('red', bundle);
    const initialRedMap = mats.plasmaOuterEnvelopeMat.map;
    const initialEnvEmissive = mats.plasmaOuterEnvelopeMat.emissiveMap;
    expect(initialEnvEmissive).toBe(env1);

    applyThemeToMaterials('blue', mats);
    const bluePlasmaMap = getThemeTextures('blue').plasmaMap;
    expect(mats.plasmaOuterEnvelopeMat.map).toBe(bluePlasmaMap);
    expect(mats.plasmaOuterEnvelopeMat.map).not.toBe(initialRedMap);
    expect(mats.plasmaOuterEnvelopeMat.map).toBe(mats.singularityCoreEmissiveMat.map);
    expect(mats.plasmaOuterEnvelopeMat.map).toBe(mats.plasmaVortexMat.map);
    expect(mats.plasmaOuterEnvelopeMat.emissiveMap).toBe(initialEnvEmissive);

    applyThemeToMaterials('green', mats);
    const greenPlasmaMap = getThemeTextures('green').plasmaMap;
    expect(mats.plasmaOuterEnvelopeMat.map).toBe(greenPlasmaMap);
    expect(mats.plasmaOuterEnvelopeMat.map).not.toBe(bluePlasmaMap);
    expect(mats.plasmaOuterEnvelopeMat.emissiveMap).toBe(initialEnvEmissive);

    mats.dispose();
    registry.disposeAll();
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
    const activeConfig: GraphicsConfig = { ...GRAPHICS_PRESETS.Balanced };

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

  it('4. validates exact Three.js r174 PoissonDenoiseShader depth/normal/luma weights, FXAA-vs-MSAA4x, DPR 1.25 default cap, and preserved contrast curve', () => {
    expect(GTAO_DENOISE_CONFIG).toEqual({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 4.5,
      radius: 3,
      samples: 8,
    });

    // Under Three.js r174 linear-clamped depthSimilarity = max(1 - depthDiff / depthPhi, 0):
    // 1) depthDiff = 1.5 distinguishes depthPhi=2 (0.25) from depthPhi=3 (0.50)
    const wDepth15Phi2 = evaluatePoissonDenoiseWeight({ depthDiff: 1.5, normalDot: 1.0, depthPhi: 2 });
    const wDepth15Phi3 = evaluatePoissonDenoiseWeight({ depthDiff: 1.5, normalDot: 1.0, depthPhi: 3 });
    expect(wDepth15Phi2).toBeCloseTo(0.25, 6);
    expect(wDepth15Phi3).toBeCloseTo(0.50, 6);
    expect(wDepth15Phi2).toBeLessThan(wDepth15Phi3);

    // 2) depthDiff = 2.4 crosses depthPhi=2 cutoff (0.0 rejected) while depthPhi=3 still leaks 0.20
    const wDepth24Phi2 = evaluatePoissonDenoiseWeight({ depthDiff: 2.4, normalDot: 1.0, depthPhi: 2 });
    const wDepth24Phi3 = evaluatePoissonDenoiseWeight({ depthDiff: 2.4, normalDot: 1.0, depthPhi: 3 });
    expect(wDepth24Phi2).toBe(0);
    expect(wDepth24Phi3).toBeCloseTo(0.20, 6);

    // 3) depthDiff >= 3.0 clamps both cleanly to 0
    expect(evaluatePoissonDenoiseWeight({ depthDiff: 4.0, normalDot: 1.0, depthPhi: 2 })).toBe(0);
    expect(evaluatePoissonDenoiseWeight({ depthDiff: 4.0, normalDot: 1.0, depthPhi: 3 })).toBe(0);

    // 4) Normal similarity pow(max(dot, 0), normalPhi): 60-degree bevel (dot = 0.5)
    const wNormal45 = evaluatePoissonDenoiseWeight({ depthDiff: 0, normalDot: 0.5, normalPhi: 4.5 });
    const wNormal30 = evaluatePoissonDenoiseWeight({ depthDiff: 0, normalDot: 0.5, normalPhi: 3.0 });
    expect(wNormal45).toBeCloseTo(Math.pow(0.5, 4.5), 6);
    expect(wNormal30).toBeCloseTo(0.125, 6);
    expect(wNormal45).toBeLessThan(wNormal30);

    // 5) Luminance similarity max(1 - lumaDiff / lumaPhi, 0) using exact 0.2125/0.7154/0.0721 weights
    expect(getPoissonDenoiseLuminance([1, 1, 1])).toBeCloseTo(1.0, 6);
    const wLuma5 = evaluatePoissonDenoiseWeight({ depthDiff: 0, normalDot: 1.0, lumaDiff: 5.0, lumaPhi: 10 });
    const wLuma10 = evaluatePoissonDenoiseWeight({ depthDiff: 0, normalDot: 1.0, lumaDiff: 10.0, lumaPhi: 10 });
    expect(wLuma5).toBeCloseTo(0.5, 6);
    expect(wLuma10).toBe(0);

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
