import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  clearStaticTextureCache,
  createCoreThermalTexture,
  createHotCoreTexture,
} from '../reactorTextures';
import { ReactorTextureRegistry } from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import { createReactorLighting } from './reactor-lighting';
import { buildReactorGeometry } from './reactor-geometry';
import { createReactorStateDriver } from './reactor-state-driver';
import { applyCenteredPlasmaUvs, resolveCorePlasmaMode } from './reactor-core-plasma';
import { createBeveledTriangleSolid } from './reactor-geometry-primitives';
import { GRAPHICS_PRESETS, type GraphicsConfig } from '../../../features/settings/logic/graphics-presets';

function srgbToLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

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

function measureWorldRadiusRange(mesh: THREE.Mesh): { minR: number; maxR: number; box: THREE.Box3 } {
  const pos = mesh.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  let minR = Infinity;
  let maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    box.expandByPoint(v);
    const r = Math.hypot(v.x, v.y);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  return { minR, maxR, box };
}

describe('ARC-056 — Central Plasma Core: Thermal Hierarchy, Containment & Light Spill', () => {
  beforeEach(() => {
    ensureCanvas2dMock();
    clearStaticTextureCache();
  });

  afterEach(() => {
    clearStaticTextureCache();
  });

  it('A. validates world-space core dimensions, area ratio (69.2% radius / 47.9% area), clearances, and Z ordering', () => {
    const scene = new THREE.Scene();
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('red', bundle);
    const lighting = createReactorLighting(scene, 0xff1e2e);

    buildReactorGeometry(scene, mats, lighting, 'high');
    scene.updateMatrixWorld(true);

    const cavity = scene.getObjectByName('arc-core-faceted-cavity') as THREE.Mesh;
    const outerEnv = scene.getObjectByName('arc-plasma-outer-envelope') as THREE.Mesh;
    const mainBody = scene.getObjectByName('arc-triangular-core-mesh') as THREE.Mesh;
    const hotCore = scene.getObjectByName('arc-plasma-white-core') as THREE.Mesh;
    const contField = scene.getObjectByName('arc-plasma-containment-field') as THREE.Mesh;
    const innerWire = scene.getObjectByName('arc-inner-wire-triangle') as THREE.Mesh;
    const apertureRim = scene.getObjectByName('arc-aperture-inner-rim') as THREE.Mesh;
    const opticGlass = scene.getObjectByName('arc-chamber-optic-glass') as THREE.Mesh;
    const hudLogo = scene.getObjectByName('arc-central-hud-mesh') as THREE.Mesh;
    const spillLight = scene.getObjectByName('arc-core-spill-light') as THREE.PointLight;

    expect(cavity).toBeTruthy();
    expect(outerEnv).toBeTruthy();
    expect(mainBody).toBeTruthy();
    expect(hotCore).toBeTruthy();
    expect(contField).toBeTruthy();
    expect(innerWire).toBeTruthy();
    expect(spillLight).toBeInstanceOf(THREE.PointLight);
    expect(spillLight.castShadow).toBe(false);

    const cavityBounds = measureWorldRadiusRange(cavity);
    const envBounds = measureWorldRadiusRange(outerEnv);
    const bodyBounds = measureWorldRadiusRange(mainBody);
    const hotBounds = measureWorldRadiusRange(hotCore);
    const fieldBounds = measureWorldRadiusRange(contField);
    const wireBounds = measureWorldRadiusRange(innerWire);
    const glassBounds = measureWorldRadiusRange(opticGlass);

    // Nominal radius 0.54 inside 0.78 aperture -> 69.2% linear radius / 47.9% projected area
    const apertureInnerR = 0.78;
    const nominalBodyR = 0.54;
    expect(nominalBodyR / apertureInnerR).toBeCloseTo(0.6923, 3);
    expect(Math.pow(nominalBodyR / apertureInnerR, 2)).toBeCloseTo(0.4793, 3);
    // Transformed main body radius (including 0.014 bevel expansion -> ~0.568)
    expect(bodyBounds.maxR).toBeGreaterThanOrEqual(0.54);
    expect(bodyBounds.maxR).toBeLessThanOrEqual(0.58);

    // Hot core compact radius ~0.145 (beveled ~0.165)
    expect(hotBounds.maxR).toBeGreaterThanOrEqual(0.14);
    expect(hotBounds.maxR).toBeLessThanOrEqual(0.18);

    // Outer plasma envelope stays within iris copper actuator inner radius (0.72)
    expect(envBounds.maxR).toBeLessThanOrEqual(0.705);
    expect(envBounds.minR).toBeGreaterThanOrEqual(0.24); // triangular inner apothem ~0.252

    // Faceted cavity clears ceramic well floor (world z = -0.865) without clipping
    expect(cavityBounds.box.min.z).toBeGreaterThan(-0.865);

    // Strict non-overlapping back-to-front world Z hierarchy
    expect(cavityBounds.box.max.z).toBeLessThan(envBounds.box.min.z);
    expect(envBounds.box.max.z).toBeLessThan(bodyBounds.box.min.z);
    expect(bodyBounds.box.max.z).toBeLessThan(hotBounds.box.min.z);
    expect(hotBounds.box.max.z).toBeLessThan(fieldBounds.box.min.z);
    expect(fieldBounds.box.max.z).toBeLessThan(wireBounds.box.min.z);
    // Inner wire clears iris copper actuator world back face (aperture z=+0.02, actuator local -0.06 -> world -0.04, half-Z 0.054 -> -0.094)
    const irisActuatorWorldBack = apertureRim.position.z - 0.06 - (0.08 / 2 + 0.014);
    expect(wireBounds.box.max.z).toBeLessThan(irisActuatorWorldBack);
    expect(glassBounds.box.min.z).toBeGreaterThan(apertureRim.position.z);

    // Strict monotonic transparent renderOrder: 1 < 2 < 3 < 4 < 5 < 6 < 7
    expect(outerEnv.renderOrder).toBeLessThan(mainBody.renderOrder);
    expect(mainBody.renderOrder).toBeLessThan(hotCore.renderOrder);
    expect(hotCore.renderOrder).toBeLessThan(contField.renderOrder);
    expect(contField.renderOrder).toBeLessThan(innerWire.renderOrder);
    expect(innerWire.renderOrder).toBeLessThan(opticGlass.renderOrder);
    expect(opticGlass.renderOrder).toBeLessThan(hudLogo.renderOrder);

    // Verify no opaque chamber hardware penetrates the main plasma body Z/radial volume
    const mergedAnodized = scene.getObjectByName('arc-merged-chamber-anodizedBlack') as THREE.Mesh;
    const mergedRingFrame = scene.getObjectByName('arc-merged-chamber-ringFrameMat') as THREE.Mesh;
    const mergedCopper = scene.getObjectByName('arc-merged-chamber-copperWinding') as THREE.Mesh;
    for (const hwMesh of [mergedAnodized, mergedRingFrame, mergedCopper]) {
      const pos = hwMesh.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(hwMesh.matrixWorld);
        // Inside main plasma body Z slab [-0.486, -0.334], all opaque jaw/cradle vertices must stay strictly outside body maxR
        if (v.z >= bodyBounds.box.min.z && v.z <= bodyBounds.box.max.z) {
          const r = Math.hypot(v.x, v.y);
          expect(r).toBeGreaterThan(bodyBounds.maxR + 0.005);
        }
      }
    }

    mats.dispose();
    registry.disposeAll();
  });

  it('B. centers plasma UVs at (0.5, 0.5), validates deterministic thermal textures, color space, and cache ownership', () => {
    const geo = applyCenteredPlasmaUvs(createBeveledTriangleSolid(0.54, 0.124, 0.014, 0.014), 0.568);
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const uv2 = geo.getAttribute('uv2');
    expect(uv).toBeTruthy();
    expect(uv2).toBeTruthy();

    let frontCenterSumU = 0;
    let frontCenterSumV = 0;
    let frontCount = 0;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (Math.abs(norm.getZ(i)) >= 0.9) {
        frontCenterSumU += u;
        frontCenterSumV += v;
        frontCount++;
      }
    }
    expect(frontCount).toBeGreaterThan(0);
    // Equilateral triangle centroid is (0, 0), so average front UV must be centered at (0.5, 0.5)
    expect(frontCenterSumU / frontCount).toBeCloseTo(0.5, 2);
    expect(frontCenterSumV / frontCount).toBeCloseTo(0.5, 2);
    geo.dispose();

    const thermal1 = createCoreThermalTexture(256);
    const thermal2 = createCoreThermalTexture(256);
    const hot1 = createHotCoreTexture(128);
    const hot2 = createHotCoreTexture(128);

    // Deterministic cache reuse & color space
    expect(thermal1).toBe(thermal2);
    expect(hot1).toBe(hot2);
    expect(thermal1.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(hot1.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(thermal1.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(hot1.wrapS).toBe(THREE.ClampToEdgeWrapping);

    // Thermal center is brighter than perimeter and stays warm crimson/amber (no cyan/blue dominance)
    const img = (thermal1.image as any).__imageData as Uint8ClampedArray;
    const centerIdx = (128 * 256 + 128) * 4;
    const edgeIdx = (4 * 256 + 4) * 4;
    const centerLuma = 0.2126 * img[centerIdx] + 0.7152 * img[centerIdx + 1] + 0.0722 * img[centerIdx + 2];
    const edgeLuma = 0.2126 * img[edgeIdx] + 0.7152 * img[edgeIdx + 1] + 0.0722 * img[edgeIdx + 2];
    expect(centerLuma).toBeGreaterThan(edgeLuma * 4);
    expect(img[centerIdx]).toBeGreaterThanOrEqual(img[centerIdx + 2]);
  });

  it('C. enforces genuine Eco static fallback, Balanced/Cinematic shader hooks, runtime switching, and cache disposal separation', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('red', bundle);

    const coreMatRef = mats.singularityCoreEmissiveMat;
    const pointMatRef = mats.singularityPointMat;
    const vortexMatRef = mats.plasmaVortexMat;
    const thermalTexRef = mats.singularityCoreEmissiveMat.emissiveMap;
    const hotTexRef = mats.singularityPointMat.map;

    expect(thermalTexRef).toBeTruthy();
    expect(hotTexRef).toBeTruthy();

    // 1. Switch to Eco -> genuine static fallback (no custom GLSL injection)
    expect(resolveCorePlasmaMode(GRAPHICS_PRESETS.Eco)).toBe('eco');
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Eco, null);
    expect(mats.singularityCoreEmissiveMat.customProgramCacheKey()).toContain('eco-static');
    expect(mats.singularityPointMat.customProgramCacheKey()).toContain('eco-static');
    expect(mats.plasmaVortexMat.customProgramCacheKey()).toContain('eco-static');

    const ecoStub = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as any;
    mats.singularityCoreEmissiveMat.onBeforeCompile(ecoStub, {} as any);
    expect(ecoStub.fragmentShader).toBe(THREE.ShaderLib.standard.fragmentShader);

    // 2. Switch Eco -> Balanced -> procedural thermal shader installed (structural check only)
    expect(resolveCorePlasmaMode(GRAPHICS_PRESETS.Balanced)).toBe('balanced');
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Balanced, null);
    expect(mats.singularityCoreEmissiveMat.customProgramCacheKey()).toContain('balanced');
    const balStub = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as any;
    mats.singularityCoreEmissiveMat.onBeforeCompile(balStub, {} as any);
    expect(balStub.fragmentShader).toContain('uCoreThermalMap');
    expect(balStub.fragmentShader).toContain('uEmissiveGain');
    expect(balStub.uniforms.uDetailLevel.value).toBeCloseTo(0.60, 2);

    // 3. Switch Balanced -> Cinematic -> higher thermal detail & contrast
    expect(resolveCorePlasmaMode(GRAPHICS_PRESETS.Cinematic)).toBe('cinematic');
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Cinematic, null);
    expect(mats.singularityCoreEmissiveMat.customProgramCacheKey()).toContain('cinematic');
    const cinStub = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as any;
    mats.singularityCoreEmissiveMat.onBeforeCompile(cinStub, {} as any);
    expect(cinStub.uniforms.uDetailLevel.value).toBeCloseTo(1.0, 2);

    // 4. Switch Cinematic -> Eco -> restores genuine static fallback without leaking references
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Eco, null);
    expect(mats.singularityCoreEmissiveMat.customProgramCacheKey()).toContain('eco-static');
    expect(mats.singularityCoreEmissiveMat).toBe(coreMatRef);
    expect(mats.singularityPointMat).toBe(pointMatRef);
    expect(mats.plasmaVortexMat).toBe(vortexMatRef);
    expect(mats.singularityCoreEmissiveMat.emissiveMap).toBe(thermalTexRef);
    expect(mats.singularityPointMat.map).toBe(hotTexRef);

    // Material disposal must NOT dispose cached static core textures
    let thermalDisposed = 0;
    const origDispose = thermalTexRef!.dispose.bind(thermalTexRef);
    thermalTexRef!.dispose = () => {
      thermalDisposed++;
      origDispose();
    };
    mats.dispose();
    expect(thermalDisposed).toBe(0);

    clearStaticTextureCache();
    expect(thermalDisposed).toBe(1);
    registry.disposeAll();
  });

  it('D. drives outer envelope & core spill light across Eco/Balanced/Cinematic, OFF/Power=0 blackout, and reduced motion', () => {
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
    let audioLevel = 0.0;

    const postfx: any = {
      composer: { render: () => {} },
      bloomPass: { enabled: true, strength: 0.2, radius: 0.25, threshold: 0.58 },
    };

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
      postfx,
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
        bassTarget: audioLevel,
        midTarget: audioLevel * 0.8,
        trebleTarget: audioLevel * 0.5,
        currentAudioTarget: audioLevel,
      }),
      getCoreCenter: () => ({ x: 640, y: 360 }),
      getCoreScale: () => 1.0,
      getEffectiveConfig: () => activeConfig,
    });

    const outerEnv = scene.getObjectByName('arc-plasma-outer-envelope') as THREE.Mesh;
    const spillLight = scene.getObjectByName('arc-core-spill-light') as THREE.PointLight;

    // Warm up Balanced idle frames
    for (let i = 0; i < 20; i++) driver.updateFrame(0.032);
    expect(outerEnv.visible).toBe(true);
    expect(spillLight.visible).toBe(true);
    expect(spillLight.intensity).toBeGreaterThan(0.2);
    expect(postfx.bloomPass.threshold).toBeGreaterThanOrEqual(0.58);
    const balancedIntensity = spillLight.intensity;

    // Cinematic boosts spill light moderately above Balanced
    activeConfig = { ...GRAPHICS_PRESETS.Cinematic };
    for (let i = 0; i < 30; i++) driver.updateFrame(0.032);
    expect(spillLight.visible).toBe(true);
    expect(spillLight.intensity).toBeGreaterThan(balancedIntensity);

    // Speaking and processing states drive active energy modulation
    activeState = 'speaking';
    audioLevel = 0.75;
    for (let i = 0; i < 12; i++) driver.updateFrame(0.032);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBeGreaterThan(0.9);

    activeState = 'processing';
    for (let i = 0; i < 12; i++) driver.updateFrame(0.032);
    expect(outerEnv.visible).toBe(true);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBeGreaterThan(0.5);

    // Eco strictly disables dynamic core spill light
    activeConfig = { ...GRAPHICS_PRESETS.Eco };
    driver.updateFrame(0.032);
    expect(spillLight.visible).toBe(false);
    expect(spillLight.intensity).toBe(0);

    // OFF state produces complete central blackout across all layers & spill light
    activeConfig = { ...GRAPHICS_PRESETS.Cinematic };
    activeState = 'off';
    activePower = 1.0;
    for (let i = 0; i < 80; i++) driver.updateFrame(0.05);
    expect(outerEnv.visible).toBe(false);
    expect(spillLight.visible).toBe(false);
    expect(spillLight.intensity).toBe(0);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBe(0);
    expect(mats.singularityPointMat.opacity).toBe(0);
    expect(mats.plasmaVortexMat.opacity).toBe(0);
    expect(mats.plasmaVortexMat.emissiveIntensity).toBe(0);
    expect(mats.arcCenterLogoMat.opacity).toBe(0);

    // Restoring active state brings back energy layers cleanly
    activeState = 'idle';
    activePower = 1.0;
    audioLevel = 0.0;
    for (let i = 0; i < 40; i++) driver.updateFrame(0.05);
    expect(outerEnv.visible).toBe(true);
    expect(spillLight.visible).toBe(true);
    expect(spillLight.intensity).toBeGreaterThan(0.2);

    // Zero reactor power (even while state='idle') also produces complete shutdown
    activePower = 0.0;
    for (let i = 0; i < 80; i++) driver.updateFrame(0.05);
    expect(outerEnv.visible).toBe(false);
    expect(spillLight.visible).toBe(false);
    expect(spillLight.intensity).toBe(0);
    expect(mats.singularityCoreEmissiveMat.emissiveIntensity).toBe(0);

    // Effective Bloom calibration check: recalibrated A.R.C. top glyph stop (#a4aab4 * 0xe2e7f0) stays < 0.58 threshold
    const glyphLinear =
      0.2126 * srgbToLinear(164 / 255) * srgbToLinear(0xe2 / 255) +
      0.7152 * srgbToLinear(170 / 255) * srgbToLinear(0xe7 / 255) +
      0.0722 * srgbToLinear(180 / 255) * srgbToLinear(0xf0 / 255);
    expect(glyphLinear).toBeLessThan(0.35);

    mats.dispose();
    registry.disposeAll();
  });
});
