import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ReactorTextureRegistry, type ReactorPbrTextureBundle } from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import { GRAPHICS_PRESETS } from '../../../features/settings/logic/graphics-presets';

function srgbToLinear(srgb: number): number {
  const c = Math.max(0, Math.min(1, srgb));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearLumaFromColor(color: THREE.Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Minimal zero-dependency 8-bit PNG decoder (RGB/RGBA) for real local hybrid PBR data PNGs. */
function decodePngRgba(filePath: string): { width: number; height: number; data: Uint8ClampedArray } {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  expect(bitDepth).toBe(8);
  expect(colorType === 2 || colorType === 6).toBe(true);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const recon = new Uint8Array(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? recon[rowOut + x - bpp] : 0;
      const b = y > 0 ? recon[rowOut - stride + x] : 0;
      const c = x >= bpp && y > 0 ? recon[rowOut - stride + x - bpp] : 0;
      let v = raw[rowIn + x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paethPredictor(a, b, c)) & 0xff;
      recon[rowOut + x] = v;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = i * bpp;
    rgba[i * 4] = recon[src];
    rgba[i * 4 + 1] = recon[src + 1];
    rgba[i * 4 + 2] = recon[src + 2];
    rgba[i * 4 + 3] = bpp === 4 ? recon[src + 3] : 255;
  }
  return { width, height, data: rgba };
}

function installCanvas2dMock() {
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
      drawImage: (img: { __decodedRgba?: Uint8ClampedArray }) => {
        if (img?.__decodedRgba) {
          canvasObj.__imageData = img.__decodedRgba;
        }
      },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: canvasObj.__imageData ?? new Uint8ClampedArray(w * h * 4),
      }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
      canvas: canvasObj,
    };
    return new Proxy(base, {
      get(target, prop) {
        return prop in target ? target[prop as string] : () => {};
      },
    });
  };

  if (typeof globalThis.document === 'undefined') {
    (globalThis as any).document = {
      createElement: (tag: string) =>
        tag === 'canvas'
          ? {
              width: 256,
              height: 256,
              getContext() {
                return makeCtx(this);
              },
            }
          : {},
    };
  } else if (typeof HTMLCanvasElement !== 'undefined') {
    (HTMLCanvasElement.prototype as any).getContext = function () {
      return makeCtx(this);
    };
  }
}

/** Measures linear albedo mean strictly from final 8-bit quantized ImageData after sRGB decoding. */
function measureQuantizedLinearAlbedoMean(tex: THREE.CanvasTexture): number {
  const data = (tex.image as any).__imageData as Uint8ClampedArray;
  expect(data).toBeInstanceOf(Uint8ClampedArray);
  const pixelCount = data.length / 4;
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const r = srgbToLinear(data[i * 4] / 255);
    const g = srgbToLinear(data[i * 4 + 1] / 255);
    const b = srgbToLinear(data[i * 4 + 2] / 255);
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return sum / pixelCount;
}

/** Measures linear scalar map mean (roughnessMap or aoMap) strictly from final 8-bit ImageData. */
function measureQuantizedScalarMean(tex: THREE.CanvasTexture): number {
  const data = (tex.image as any).__imageData as Uint8ClampedArray;
  expect(data).toBeInstanceOf(Uint8ClampedArray);
  const pixelCount = data.length / 4;
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    sum += data[i * 4] / 255;
  }
  return sum / pixelCount;
}

describe('ARC-055 — Seven-Material PBR Channel Inventory, Fallback & Three-Path Parity', () => {
  const savedImage = (globalThis as any).Image;

  beforeEach(() => {
    installCanvas2dMock();
    delete (globalThis as any).Image;
  });

  afterEach(() => {
    if (savedImage === undefined) delete (globalThis as any).Image;
    else (globalThis as any).Image = savedImage;
  });

  it('1. enforces exact per-material PBR channel inventory and scalar retention (Section 5.1)', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);

    // 4-channel materials (albedo, normal, roughness, ao)
    expect(mats.anodizedBlack.map).toBe(bundle.anodized.albedo);
    expect(mats.anodizedBlack.normalMap).toBe(bundle.anodized.normal);
    expect(mats.anodizedBlack.roughnessMap).toBe(bundle.anodized.roughness);
    expect(mats.anodizedBlack.aoMap).toBe(bundle.anodized.ao);

    expect(mats.brushedTitanium.map).toBe(bundle.brushedTitanium.albedo);
    expect(mats.brushedTitanium.normalMap).toBe(bundle.brushedTitanium.normal);
    expect(mats.brushedTitanium.roughnessMap).toBe(bundle.brushedTitanium.roughness);
    expect(mats.brushedTitanium.aoMap).toBe(bundle.brushedTitanium.ao);

    expect(mats.darkCarbon.map).toBe(bundle.carbon.albedo);
    expect(mats.darkCarbon.normalMap).toBe(bundle.carbon.normal);
    expect(mats.darkCarbon.roughnessMap).toBe(bundle.carbon.roughness);
    expect(mats.darkCarbon.aoMap).toBe(bundle.carbon.ao);

    // 3-channel materials (albedo, normal, roughness; NO AO)
    expect(mats.darkCeramic.map).toBe(bundle.ceramic.albedo);
    expect(mats.darkCeramic.normalMap).toBe(bundle.ceramic.normal);
    expect(mats.darkCeramic.roughnessMap).toBe(bundle.ceramic.roughness);
    expect(mats.darkCeramic.aoMap).toBeNull();
    expect(bundle.ceramic.ao).toBeUndefined();

    expect(mats.copperWinding.map).toBe(bundle.copper.albedo);
    expect(mats.copperWinding.normalMap).toBe(bundle.copper.normal);
    expect(mats.copperWinding.roughnessMap).toBe(bundle.copper.roughness);
    expect(mats.copperWinding.aoMap).toBeNull();
    expect(bundle.copper.ao).toBeUndefined();

    // Scalar-color materials sharing anodized normal & roughness (NO map, NO AO)
    expect(mats.ringFrameMat.map).toBeNull();
    expect(mats.ringFrameMat.normalMap).toBe(bundle.anodized.normal);
    expect(mats.ringFrameMat.roughnessMap).toBe(bundle.anodized.roughness);
    expect(mats.ringFrameMat.aoMap).toBeNull();
    expect(mats.ringFrameMat.color.getHex()).toBe(0x4c5666);

    expect(mats.heatTintedMetal.map).toBeNull();
    expect(mats.heatTintedMetal.normalMap).toBe(bundle.anodized.normal);
    expect(mats.heatTintedMetal.roughnessMap).toBe(bundle.anodized.roughness);
    expect(mats.heatTintedMetal.aoMap).toBeNull();
    expect(mats.heatTintedMetal.color.getHex()).toBe(0x3a4252);

    // Albedo-mapped materials have color === 0xffffff; all 7 roughness-mapped have roughness === 1.0
    for (const m of [mats.anodizedBlack, mats.brushedTitanium, mats.darkCarbon, mats.darkCeramic, mats.copperWinding]) {
      expect(m.color.getHex()).toBe(0xffffff);
    }
    for (const m of [
      mats.anodizedBlack,
      mats.brushedTitanium,
      mats.ringFrameMat,
      mats.darkCarbon,
      mats.darkCeramic,
      mats.copperWinding,
      mats.heatTintedMetal,
    ]) {
      expect(m.roughness).toBe(1.0);
    }

    // Verify normalScale, clearcoat, and Eco anisotropy preservation
    expect(mats.darkCarbon.clearcoat).toBeCloseTo(0.22, 4);
    expect(mats.brushedTitanium.anisotropy).toBeCloseTo(0.60, 4);
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Eco, null);
    expect(mats.brushedTitanium.anisotropy).toBe(0.0);
    mats.applyGraphicsConfig(GRAPHICS_PRESETS.Balanced, null);
    expect(mats.brushedTitanium.anisotropy).toBeCloseTo(0.60, 4);

    mats.dispose();
    registry.disposeAll();
  });

  it('2. validates Path A (no PBR bundle) vs Path B (procedural 8-bit ImageData) macro parity', () => {
    const pathA = createReactorMaterials('crimson', null);
    const registryB = new ReactorTextureRegistry();
    const bundleB = registryB.getBootstrapBundle(4, true);
    expect(bundleB.hybridAssetsUsed).toBe(false);

    // Path A has no bound PBR maps (macro reflectance & roughness parity only)
    for (const m of [
      pathA.anodizedBlack,
      pathA.brushedTitanium,
      pathA.ringFrameMat,
      pathA.darkCarbon,
      pathA.darkCeramic,
      pathA.copperWinding,
      pathA.heatTintedMetal,
    ]) {
      expect(m.map).toBeNull();
      expect(m.normalMap).toBeNull();
      expect(m.roughnessMap).toBeNull();
      expect(m.aoMap).toBeNull();
    }

    const expectedFallbacks = [
      { name: 'anodizedBlack', mat: pathA.anodizedBlack, hex: 0x37383a, rough: 0.380, roughTex: bundleB.anodized.roughness, albedoTex: bundleB.anodized.albedo },
      { name: 'ringFrameMat', mat: pathA.ringFrameMat, hex: 0x4c5666, rough: 0.380, roughTex: bundleB.anodized.roughness, albedoTex: null },
      { name: 'heatTintedMetal', mat: pathA.heatTintedMetal, hex: 0x3a4252, rough: 0.380, roughTex: bundleB.anodized.roughness, albedoTex: null },
      { name: 'brushedTitanium', mat: pathA.brushedTitanium, hex: 0x6a6b6c, rough: 0.274, roughTex: bundleB.brushedTitanium.roughness, albedoTex: bundleB.brushedTitanium.albedo },
      { name: 'darkCarbon', mat: pathA.darkCarbon, hex: 0x212122, rough: 0.452, roughTex: bundleB.carbon.roughness, albedoTex: bundleB.carbon.albedo },
      { name: 'darkCeramic', mat: pathA.darkCeramic, hex: 0x2c2c2c, rough: 0.880, roughTex: bundleB.ceramic.roughness, albedoTex: bundleB.ceramic.albedo },
      { name: 'copperWinding', mat: pathA.copperWinding, hex: 0x785f4e, rough: 0.311, roughTex: bundleB.copper.roughness, albedoTex: bundleB.copper.albedo },
    ];

    for (const entry of expectedFallbacks) {
      expect(entry.mat.color.getHex(), `${entry.name} fallback hex`).toBe(entry.hex);
      expect(entry.mat.roughness, `${entry.name} fallback roughness`).toBeCloseTo(entry.rough, 4);

      const measuredRough = measureQuantizedScalarMean(entry.roughTex);
      expect(Math.abs(entry.mat.roughness - measuredRough), `${entry.name} roughness parity`).toBeLessThanOrEqual(0.004);

      if (entry.albedoTex) {
        const fallbackLuma = linearLumaFromColor(entry.mat.color);
        const measuredLuma = measureQuantizedLinearAlbedoMean(entry.albedoTex);
        expect(Math.abs(fallbackLuma - measuredLuma), `${entry.name} linear albedo parity`).toBeLessThanOrEqual(0.002);
      }
    }

    pathA.dispose();
    registryB.disposeAll();
  });

  it('3. validates Path B (procedural) vs Path C (real hybrid PNG mean-centered) parity and single-decode caching', async () => {
    const regB = new ReactorTextureRegistry();
    const bundleB = regB.getBootstrapBundle(4, true);
    expect(bundleB.hybridAssetsUsed).toBe(false);

    const pbrDir = path.resolve(process.cwd(), 'src/renderer/assets/reactor-pbr');
    const anodizedPng = decodePngRgba(path.join(pbrDir, 'anodized-titanium-data.png'));
    const carbonPng = decodePngRgba(path.join(pbrDir, 'carbon-twill-data.png'));

    let decodeInvocations = 0;
    (globalThis as any).Image = class MockHybridImage {
      crossOrigin = '';
      width = 0;
      height = 0;
      naturalWidth = 0;
      naturalHeight = 0;
      __decodedRgba?: Uint8ClampedArray;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        decodeInvocations++;
        const decoded = url.includes('anodized') ? anodizedPng : carbonPng;
        this.width = decoded.width;
        this.height = decoded.height;
        this.naturalWidth = decoded.width;
        this.naturalHeight = decoded.height;
        this.__decodedRgba = decoded.data;
        queueMicrotask(() => this.onload?.());
      }
    };

    const regC = new ReactorTextureRegistry();
    const bundleC = await new Promise<ReactorPbrTextureBundle>((resolve) => {
      regC.requestTier(256, 4, true, resolve);
    });
    expect(bundleC.hybridAssetsUsed).toBe(true);
    expect(decodeInvocations).toBe(2);

    // Second tier request reuses cached DecodedDataMap & channel means without reloading PNGs
    const bundleC512 = await new Promise<ReactorPbrTextureBundle>((resolve) => {
      regC.requestTier(512, 4, true, resolve);
    });
    expect(bundleC512.hybridAssetsUsed).toBe(true);
    expect(decodeInvocations).toBe(2);

    // Mean-centered hybrid vs procedural parity for anodized and carbon (tolerances from Section 5.5)
    for (const key of ['anodized', 'carbon'] as const) {
      const albB = measureQuantizedLinearAlbedoMean(bundleB[key].albedo);
      const albC = measureQuantizedLinearAlbedoMean(bundleC[key].albedo);
      const rghB = measureQuantizedScalarMean(bundleB[key].roughness);
      const rghC = measureQuantizedScalarMean(bundleC[key].roughness);
      const aoB = measureQuantizedScalarMean(bundleB[key].ao!);
      const aoC = measureQuantizedScalarMean(bundleC[key].ao!);

      expect(Math.abs(albB - albC), `${key} Path B vs C albedo luma`).toBeLessThanOrEqual(0.002);
      expect(Math.abs(rghB - rghC), `${key} Path B vs C roughness mean`).toBeLessThanOrEqual(0.005);
      expect(Math.abs(aoB - aoC), `${key} Path B vs C AO mean`).toBeLessThanOrEqual(0.010);
    }

    // Non-hybrid materials remain procedural and keep identical channel inventory
    expect(bundleC.ceramic.ao).toBeUndefined();
    expect(bundleC.copper.ao).toBeUndefined();
    expect(measureQuantizedScalarMean(bundleC.brushedTitanium.roughness)).toBeCloseTo(
      measureQuantizedScalarMean(bundleB.brushedTitanium.roughness),
      5
    );

    // Single-owner disposal on Path C
    const matsC = createReactorMaterials('crimson', bundleC);
    const disposed = new Map<THREE.Texture, number>();
    for (const set of [bundleC.anodized, bundleC.brushedTitanium, bundleC.carbon, bundleC.ceramic, bundleC.copper]) {
      for (const tex of [set.albedo, set.normal, set.roughness, set.ao]) {
        if (!tex) continue;
        disposed.set(tex, 0);
        const orig = tex.dispose.bind(tex);
        tex.dispose = () => {
          disposed.set(tex, (disposed.get(tex) ?? 0) + 1);
          orig();
        };
      }
    }
    matsC.dispose();
    for (const c of disposed.values()) expect(c).toBe(0);
    regC.disposeAll();
    for (const c of disposed.values()) expect(c).toBe(1);
    regB.disposeAll();
  });
});
