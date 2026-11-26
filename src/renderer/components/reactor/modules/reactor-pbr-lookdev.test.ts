import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ReactorTextureRegistry,
  type ReactorPbrTextureBundle,
} from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import {
  createReactorLighting,
  STUDIO_LIGHT_PRESETS,
} from './reactor-lighting';
import { GRAPHICS_PRESETS } from '../../../features/settings/logic/graphics-presets';

/**
 * Exact IEC 61966-2-1 sRGB [0..1] -> Linear [0..1] decode function
 * matching Three.js SRGBColorSpace hardware decoding.
 */
function srgbToLinear(srgb: number): number {
  const c = Math.max(0, Math.min(1, srgb));
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function ensureCanvas2dBufferMock() {
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
          const obj: any = {
            width: 256,
            height: 256,
            getContext: function () {
              return makeCtx(this);
            },
          };
          return obj;
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

function measureDecodedLinearAlbedoStats(tex: THREE.CanvasTexture): {
  min: number;
  max: number;
  mean: number;
} {
  const data = (tex.image as any).__imageData as Uint8ClampedArray;
  expect(data).toBeInstanceOf(Uint8ClampedArray);
  const pixelCount = data.length / 4;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < pixelCount; i++) {
    const r = srgbToLinear(data[i * 4] / 255);
    const g = srgbToLinear(data[i * 4 + 1] / 255);
    const b = srgbToLinear(data[i * 4 + 2] / 255);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < min) min = luma;
    if (luma > max) max = luma;
    sum += luma;
  }

  return { min, max, mean: sum / pixelCount };
}

function measureLinearScalarMapStats(tex: THREE.CanvasTexture): {
  min: number;
  max: number;
  mean: number;
} {
  const data = (tex.image as any).__imageData as Uint8ClampedArray;
  expect(data).toBeInstanceOf(Uint8ClampedArray);
  const pixelCount = data.length / 4;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < pixelCount; i++) {
    const val = data[i * 4] / 255;
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
  }

  return { min, max, mean: sum / pixelCount };
}

describe('ARC-054 — Controlled Obsidian Contrast, Structural Depth & Optical Glass', () => {
  beforeEach(() => {
    ensureCanvas2dBufferMock();
  });

  it('1. validates decoded linear albedo range, F0 floor, and monotonic 6-level obsidian reflectance ordering', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson');

    const carbonAlbedo = measureDecodedLinearAlbedoStats(bundle.carbon.albedo);
    const ceramicAlbedo = measureDecodedLinearAlbedoStats(bundle.ceramic.albedo);
    const anodizedAlbedo = measureDecodedLinearAlbedoStats(bundle.anodized.albedo);
    const titaniumAlbedo = measureDecodedLinearAlbedoStats(bundle.brushedTitanium.albedo);
    const copperAlbedo = measureDecodedLinearAlbedoStats(bundle.copper.albedo);

    // ARC-054 controlled obsidian linear bounds (allowing +/- 0.003 for 8-bit sRGB quantization)
    expect(carbonAlbedo.min).toBeGreaterThanOrEqual(0.007);
    expect(carbonAlbedo.max).toBeLessThanOrEqual(0.022);
    expect(carbonAlbedo.mean).toBeGreaterThanOrEqual(0.010);
    expect(carbonAlbedo.mean).toBeLessThanOrEqual(0.017);

    expect(ceramicAlbedo.min).toBeGreaterThanOrEqual(0.014);
    expect(ceramicAlbedo.max).toBeLessThanOrEqual(0.030);
    expect(ceramicAlbedo.mean).toBeGreaterThanOrEqual(0.018);
    expect(ceramicAlbedo.mean).toBeLessThanOrEqual(0.025);

    expect(anodizedAlbedo.min).toBeGreaterThanOrEqual(0.027);
    expect(anodizedAlbedo.max).toBeLessThanOrEqual(0.048);
    expect(anodizedAlbedo.mean).toBeGreaterThanOrEqual(0.032);
    expect(anodizedAlbedo.mean).toBeLessThanOrEqual(0.041);

    // Physical anodized specular floor F0 = mix(0.04, albedo, metalness) >= 0.035 (avoids silhouette collapse)
    const anodizedF0 = 0.04 * (1 - mats.anodizedBlack.metalness) + anodizedAlbedo.mean * mats.anodizedBlack.metalness;
    expect(anodizedF0).toBeGreaterThanOrEqual(0.035);

    // Tempered shroud (heatTintedMetal, 0x363d4b) linear luma ~0.0463
    const shroudLinearLuma =
      0.2126 * mats.heatTintedMetal.color.r +
      0.7152 * mats.heatTintedMetal.color.g +
      0.0722 * mats.heatTintedMetal.color.b;
    expect(shroudLinearLuma).toBeGreaterThanOrEqual(0.042);
    expect(shroudLinearLuma).toBeLessThanOrEqual(0.052);

    // Dark Gunmetal (ringFrameMat, 0x464f5e) linear luma ~0.0770 (>2.0x over Obsidian Titanium, 42% darker than ARC-052)
    const gunmetalLinearLuma =
      0.2126 * mats.ringFrameMat.color.r +
      0.7152 * mats.ringFrameMat.color.g +
      0.0722 * mats.ringFrameMat.color.b;
    expect(gunmetalLinearLuma).toBeGreaterThanOrEqual(0.070);
    expect(gunmetalLinearLuma).toBeLessThanOrEqual(0.085);
    expect(gunmetalLinearLuma / anodizedAlbedo.mean).toBeGreaterThanOrEqual(1.9);

    // Selective Brushed Titanium linear 0.115..0.165 (avg ~0.138)
    expect(titaniumAlbedo.min).toBeGreaterThanOrEqual(0.110);
    expect(titaniumAlbedo.max).toBeLessThanOrEqual(0.170);
    expect(titaniumAlbedo.mean).toBeGreaterThanOrEqual(0.128);
    expect(titaniumAlbedo.mean).toBeLessThanOrEqual(0.148);

    // Smoked Copper luma ~0.117 (rare functional bronze-copper)
    expect(copperAlbedo.mean).toBeGreaterThanOrEqual(0.102);
    expect(copperAlbedo.mean).toBeLessThanOrEqual(0.132);

    // Strict monotonic reflectance hierarchy:
    // carbon < ceramic < anodized < heatTintedMetal < ringFrameMat (dark gunmetal) < brushedTitanium
    expect(carbonAlbedo.mean).toBeLessThan(ceramicAlbedo.mean);
    expect(ceramicAlbedo.mean).toBeLessThan(anodizedAlbedo.mean);
    expect(anodizedAlbedo.mean).toBeLessThan(shroudLinearLuma);
    expect(shroudLinearLuma).toBeLessThan(gunmetalLinearLuma);
    expect(gunmetalLinearLuma).toBeLessThan(titaniumAlbedo.mean);

    mats.dispose();
    registry.disposeAll();
  });

  it('2. enforces SRGBColorSpace on albedos and NoColorSpace on normal/roughness/ao across tiers', async () => {
    const registry = new ReactorTextureRegistry();
    const bootstrap = registry.getBootstrapBundle(4, true);

    const tier512 = await new Promise<ReactorPbrTextureBundle>((resolve) => {
      registry.requestTier(512, 8, true, resolve);
    });

    for (const bundle of [bootstrap, tier512]) {
      for (const set of [
        bundle.anodized,
        bundle.brushedTitanium,
        bundle.carbon,
        bundle.ceramic,
        bundle.copper,
      ]) {
        expect(set.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(set.normal.colorSpace).toBe(THREE.NoColorSpace);
        expect(set.roughness.colorSpace).toBe(THREE.NoColorSpace);
        if (set.ao) {
          expect(set.ao.colorSpace).toBe(THREE.NoColorSpace);
        }
      }
    }

    registry.disposeAll();
  });

  it('3. prevents roughness double-multiplication and binds ringFrameMat to smooth anodized maps', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);

    // Every material with a roughnessMap must have scalar roughness === 1.0
    for (const mat of [
      mats.anodizedBlack,
      mats.brushedTitanium,
      mats.ringFrameMat,
      mats.darkCarbon,
      mats.darkCeramic,
      mats.copperWinding,
      mats.heatTintedMetal,
    ]) {
      expect(mat.roughnessMap).toBeTruthy();
      expect(mat.roughness).toBe(1.0);
    }

    // ringFrameMat shares bundle.anodized.normal & bundle.anodized.roughness (0.30..0.38 smooth satin)
    expect(mats.ringFrameMat.normalMap).toBe(bundle.anodized.normal);
    expect(mats.ringFrameMat.roughnessMap).toBe(bundle.anodized.roughness);
    expect(mats.ringFrameMat.normalMap).not.toBe(bundle.brushedTitanium.normal);
    expect(mats.ringFrameMat.roughnessMap).not.toBe(bundle.brushedTitanium.roughness);
    expect(mats.ringFrameMat.map).toBeNull();
    expect(mats.ringFrameMat.color.getHex()).toBe(0x464f5e);

    // Verify ARC-054 linear roughness ranges in the maps
    const anodizedRough = measureLinearScalarMapStats(bundle.anodized.roughness);
    const titaniumRough = measureLinearScalarMapStats(bundle.brushedTitanium.roughness);
    const ceramicRough = measureLinearScalarMapStats(bundle.ceramic.roughness);

    expect(anodizedRough.min).toBeGreaterThanOrEqual(0.29);
    expect(anodizedRough.max).toBeLessThanOrEqual(0.39);
    expect(titaniumRough.min).toBeGreaterThanOrEqual(0.21);
    expect(titaniumRough.max).toBeLessThanOrEqual(0.33);
    expect(ceramicRough.min).toBeGreaterThanOrEqual(0.83);
    expect(ceramicRough.max).toBeLessThanOrEqual(0.95);

    mats.dispose();
    registry.disposeAll();
  });

  it('4. guarantees procedural fallback, opticGlass physical Fresnel contract, and STUDIO_LIGHT_PRESETS parity', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);
    expect(bundle.tier).toBe(256);

    // Verify opticGlass physical contract remains intact (premultiplied Fresnel + diagonal sheen, zero transmission pass)
    expect(mats.opticGlass.transmission).toBe(0);
    expect(mats.opticGlass.premultipliedAlpha).toBe(true);
    expect(mats.opticGlass.depthWrite).toBe(false);
    expect(mats.opticGlass.ior).toBeGreaterThanOrEqual(1.6);
    expect(mats.opticGlass.customProgramCacheKey()).toBe('arc-optic-glass-fresnel-v1');

    // Verify onBeforeCompile cleanly transforms the live Three.js physical fragment shader
    const shaderStub = { fragmentShader: THREE.ShaderLib.physical.fragmentShader } as any;
    mats.opticGlass.onBeforeCompile(shaderStub, {} as any);
    expect(shaderStub.fragmentShader).toContain('arcRimFresnel');
    expect(shaderStub.fragmentShader).toContain('arcDiagSheen');
    expect(shaderStub.fragmentShader).not.toContain('#include <premultiplied_alpha_fragment>');

    // Verify transmission remains 0.0 across Eco, Balanced, Cinematic, and Software WebGL
    for (const preset of [GRAPHICS_PRESETS.Eco, GRAPHICS_PRESETS.Balanced, GRAPHICS_PRESETS.Cinematic]) {
      mats.applyGraphicsConfig(preset, null);
      expect(mats.opticGlass.transmission).toBe(0);
      expect(mats.opticGlass.opacity).toBeCloseTo(0.17, 4);
    }

    // Verify zero NaN/zero-filled pixels across all procedural channels
    for (const set of [
      bundle.anodized,
      bundle.brushedTitanium,
      bundle.carbon,
      bundle.ceramic,
      bundle.copper,
    ]) {
      for (const tex of [set.albedo, set.normal, set.roughness, set.ao]) {
        if (!tex) continue;
        const buf = (tex.image as any).__imageData as Uint8ClampedArray;
        expect(buf.length).toBe(256 * 256 * 4);
        let nonZeroCount = 0;
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] > 0) nonZeroCount++;
        }
        expect(nonZeroCount).toBeGreaterThan(256 * 256 * 3);
      }
    }

    // Verify createReactorLighting() constructor matches STUDIO_LIGHT_PRESETS.standard
    const scene = new THREE.Scene();
    const lighting = createReactorLighting(scene, 0xff2222);
    expect(lighting.hemiLight.groundColor.getHex()).toBe(0x11141a);
    expect(lighting.hemiLight.intensity).toBe(STUDIO_LIGHT_PRESETS.hemi.intensity.standard);
    expect(lighting.keyLight.intensity).toBe(STUDIO_LIGHT_PRESETS.key.intensity.standard);
    expect(lighting.fillLight.intensity).toBe(STUDIO_LIGHT_PRESETS.fill.intensity.standard);
    expect(lighting.topSpot.intensity).toBe(STUDIO_LIGHT_PRESETS.topSpot.intensity.standard);
    expect(lighting.topSpot.visible).toBe(true);

    const mockRenderer = {
      shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap, needsUpdate: false },
    } as unknown as THREE.WebGLRenderer;

    lighting.applyGraphicsConfig(GRAPHICS_PRESETS.Eco, mockRenderer, null);
    expect(lighting.hemiLight.intensity).toBe(STUDIO_LIGHT_PRESETS.hemi.intensity.eco);
    expect(lighting.keyLight.intensity).toBe(STUDIO_LIGHT_PRESETS.key.intensity.eco);
    expect(lighting.fillLight.intensity).toBe(STUDIO_LIGHT_PRESETS.fill.intensity.eco);
    expect(lighting.topSpot.intensity).toBe(STUDIO_LIGHT_PRESETS.topSpot.intensity.eco);
    expect(lighting.topSpot.visible).toBe(true);

    lighting.applyGraphicsConfig(GRAPHICS_PRESETS.Balanced, mockRenderer, null);
    expect(lighting.hemiLight.intensity).toBe(STUDIO_LIGHT_PRESETS.hemi.intensity.standard);
    expect(lighting.keyLight.intensity).toBe(STUDIO_LIGHT_PRESETS.key.intensity.standard);
    expect(lighting.fillLight.intensity).toBe(STUDIO_LIGHT_PRESETS.fill.intensity.contact);
    expect(lighting.topSpot.intensity).toBe(STUDIO_LIGHT_PRESETS.topSpot.intensity.standard);

    lighting.applyGraphicsConfig(GRAPHICS_PRESETS.Cinematic, mockRenderer, null);
    expect(lighting.hemiLight.intensity).toBe(STUDIO_LIGHT_PRESETS.hemi.intensity.shadowed);
    expect(lighting.keyLight.intensity).toBe(STUDIO_LIGHT_PRESETS.key.intensity.shadowed);
    expect(lighting.fillLight.intensity).toBe(STUDIO_LIGHT_PRESETS.fill.intensity.shadowed);
    expect(lighting.topSpot.intensity).toBe(STUDIO_LIGHT_PRESETS.topSpot.intensity.shadowed);

    mats.dispose();
    registry.disposeAll();
  });

  it('5. ensures zero shared-texture leaks or double-disposal when materials and registry dispose', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);

    const disposeCounts = new Map<THREE.Texture, number>();
    for (const set of [
      bundle.anodized,
      bundle.brushedTitanium,
      bundle.carbon,
      bundle.ceramic,
      bundle.copper,
    ]) {
      for (const tex of [set.albedo, set.normal, set.roughness, set.ao]) {
        if (!tex) continue;
        disposeCounts.set(tex, 0);
        const origDispose = tex.dispose.bind(tex);
        tex.dispose = () => {
          disposeCounts.set(tex, (disposeCounts.get(tex) ?? 0) + 1);
          origDispose();
        };
      }
    }

    // Disposing materials must NOT dispose registry-owned PBR textures
    mats.dispose();
    for (const count of disposeCounts.values()) {
      expect(count).toBe(0);
    }

    // Disposing the registry must dispose every PBR texture exactly once (even shared anodized maps)
    registry.disposeAll();
    for (const count of disposeCounts.values()) {
      expect(count).toBe(1);
    }
    expect(registry.getCachedTierCount()).toBe(0);
  });
});
