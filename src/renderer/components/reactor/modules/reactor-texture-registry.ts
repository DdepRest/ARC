import * as THREE from 'three';

export type PbrTextureTier = 256 | 512 | 1024 | 2048;

export interface PbrChannelSet {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  ao?: THREE.CanvasTexture;
}

export interface ReactorPbrTextureBundle {
  tier: PbrTextureTier;
  anodized: PbrChannelSet;
  brushedTitanium: PbrChannelSet;
  carbon: PbrChannelSet;
  ceramic: PbrChannelSet;
  copper: PbrChannelSet;
  hybridAssetsUsed: boolean;
}

interface DecodedDataMap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const HYBRID_ASSET_URLS = {
  carbon: new URL('../../../assets/reactor-pbr/carbon-twill-data.png', import.meta.url).href,
  anodized: new URL('../../../assets/reactor-pbr/anodized-titanium-data.png', import.meta.url).href,
};

const decodedAssetCache = new Map<string, DecodedDataMap>();
const pendingAssetLoads = new Map<string, Promise<DecodedDataMap | null>>();

/**
 * Exact IEC 61966-2-1 Linear [0..1] -> sRGB [0..1] transfer function.
 * Prevents the classic albedo crush bug where linear reflectance values
 * written directly into SRGBColorSpace CanvasTextures get gamma-decoded twice.
 */
export function linearToSrgb(linear: number): number {
  const c = Math.max(0, Math.min(1, linear));
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function lcg(seed: { v: number }): number {
  seed.v = (seed.v * 1664525 + 1013904223) >>> 0;
  return (seed.v >>> 8) / 16777216;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function tileableValueNoise(x: number, y: number, period: number, seedVal: number): number {
  const gx = (x / period) * period;
  const gy = (y / period) * period;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const hash = (ix: number, iy: number) => {
    const px = ((ix % period) + period) % period;
    const py = ((iy % period) + period) % period;
    let h = (px * 374761393 + py * 668265263 + seedVal * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  const v00 = hash(x0, y0);
  const v10 = hash(x0 + 1, y0);
  const v01 = hash(x0, y0 + 1);
  const v11 = hash(x0 + 1, y0 + 1);
  return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
}

function loadLocalDataPng(key: keyof typeof HYBRID_ASSET_URLS): Promise<DecodedDataMap | null> {
  const cached = decodedAssetCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pendingAssetLoads.get(key);
  if (existing) return existing;

  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  const p = new Promise<DecodedDataMap | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        if (!ctx || c.width === 0 || c.height === 0) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const decoded: DecodedDataMap = {
          width: c.width,
          height: c.height,
          data: imgData.data,
        };
        decodedAssetCache.set(key, decoded);
        resolve(decoded);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = HYBRID_ASSET_URLS[key];
  });

  pendingAssetLoads.set(key, p);
  return p;
}

function sampleDecodedChannel(map: DecodedDataMap, u: number, v: number, channel: 0 | 1 | 2): number {
  const x = ((u % 1) + 1) % 1 * map.width;
  const y = ((v % 1) + 1) % 1 * map.height;
  const x0 = Math.floor(x) % map.width;
  const y0 = Math.floor(y) % map.height;
  const x1 = (x0 + 1) % map.width;
  const y1 = (y0 + 1) % map.height;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);

  const c00 = map.data[(y0 * map.width + x0) * 4 + channel] / 255;
  const c10 = map.data[(y0 * map.width + x1) * 4 + channel] / 255;
  const c01 = map.data[(y1 * map.width + x0) * 4 + channel] / 255;
  const c11 = map.data[(y1 * map.width + x1) * 4 + channel] / 255;

  return (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
}

function makeCanvasTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  trilinear: boolean
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = trilinear ? THREE.LinearMipmapLinearFilter : THREE.LinearMipmapNearestFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a tangent-space normal canvas from a normalized scalar heightfield [0..1]
 * using a seamless tileable Sobel filter.
 */
function heightToNormalCanvas(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const mask = size - 1;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & mask;
    const yp = (y + 1) & mask;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;

      const tl = height[ym * size + xm];
      const t = height[ym * size + x];
      const tr = height[ym * size + xp];
      const l = height[y * size + xm];
      const r = height[y * size + xp];
      const bl = height[yp * size + xm];
      const b = height[yp * size + x];
      const br = height[yp * size + xp];

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      data[idx] = clampByte((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Writes LINEAR scalar values [0..1] for data maps (roughnessMap, aoMap).
 */
function scalarToLinearCanvas(values: Float32Array, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < size * size; i++) {
    const byte = clampByte(values[i] * 255);
    const p = i * 4;
    data[p] = byte;
    data[p + 1] = byte;
    data[p + 2] = byte;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Writes LINEAR albedo reflectance [0..1] with tint, properly encoded to sRGB
 * via IEC linearToSrgb() so Three.js SRGBColorSpace decodes exact physical reflectance.
 */
function scalarToSrgbAlbedoCanvas(
  values: Float32Array,
  size: number,
  rTint = 1,
  gTint = 1,
  bTint = 1
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < size * size; i++) {
    const lin = values[i];
    const p = i * 4;
    data[p] = clampByte(linearToSrgb(lin * rTint) * 255);
    data[p + 1] = clampByte(linearToSrgb(lin * gTint) * 255);
    data[p + 2] = clampByte(linearToSrgb(lin * bTint) * 255);
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * 1. Anodized Titanium — bead-blasted aerospace graphite metal.
 * Uses local hybrid PNG data map when loaded; seamless procedural fBm fallback otherwise.
 * Zero artificial checkerboard panel seams.
 */
function buildAnodizedSet(
  size: number,
  aniso: number,
  trilinear: boolean,
  hybridMap?: DecodedDataMap | null
): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const ao = new Float32Array(total);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const microMill = Math.sin(v * Math.PI * 32) * 0.015;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;

      let h: number;
      let rMod: number;
      let cavityAo: number;
      if (hybridMap) {
        h = sampleDecodedChannel(hybridMap, u, v, 0);
        rMod = sampleDecodedChannel(hybridMap, u, v, 1);
        cavityAo = sampleDecodedChannel(hybridMap, u, v, 2);
      } else {
        const n1 = tileableValueNoise(u * 8, v * 8, 8, 17);
        const n2 = tileableValueNoise(u * 24, v * 24, 24, 53);
        const n3 = tileableValueNoise(u * 64, v * 64, 64, 97);
        h = 0.5 + (n1 - 0.5) * 0.36 + (n2 - 0.5) * 0.24 + (n3 - 0.5) * 0.16 + microMill;
        rMod = 0.5 + (n2 - 0.5) * 0.65 - (n3 - 0.5) * 0.25;
        cavityAo = 0.88 + (n1 - 0.5) * 0.14;
      }

      height[idx] = Math.max(0, Math.min(1, h));
      // Obsidian Black / Dark Graphite anodized titanium: linear 0.012..0.030 (~sRGB #1D2127..#2B3038)
      albedo[idx] = Math.max(0.012, Math.min(0.030, 0.018 + (h - 0.5) * 0.014));
      // Physical linear roughness 0.36..0.50 (satin obsidian finish, crisp reflections without glare)
      rough[idx] = Math.max(0.36, Math.min(0.50, 0.42 + (rMod - 0.5) * 0.14));
      ao[idx] = Math.max(0.76, Math.min(1.0, 0.86 + (cavityAo - 0.5) * 0.22));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToSrgbAlbedoCanvas(albedo, size, 0.96, 0.98, 1.02), THREE.SRGBColorSpace, 2, 2, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 1.65), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToLinearCanvas(rough, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    ao: makeCanvasTexture(scalarToLinearCanvas(ao, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
  };
}

/**
 * 2. Brushed Titanium — directional satin machined alloy with fine anisotropic grain.
 */
function buildBrushedTitaniumSet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const ao = new Float32Array(total);
  const seed = { v: 1337 };

  const rowStreaks = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    rowStreaks[y] = (lcg(seed) - 0.5) * 0.22 + Math.sin((y / size) * Math.PI * 18) * 0.05;
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const streak = rowStreaks[y];
    const streakPrev = rowStreaks[(y - 1 + size) % size];
    const smoothStreak = streak * 0.72 + streakPrev * 0.28;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const longBrush = tileableValueNoise(u * 4, v * 64, 64, 31) - 0.5;
      const micro = (lcg(seed) - 0.5) * 0.04;

      const h = 0.5 + smoothStreak * 0.65 + longBrush * 0.28 + micro;
      height[idx] = Math.max(0, Math.min(1, h));
      // Restrained dark brushed gunmetal titanium (never pale gray): linear 0.058..0.114 (~sRGB #444952..#5B616B)
      albedo[idx] = Math.max(0.058, Math.min(0.114, 0.084 + smoothStreak * 0.062 + longBrush * 0.028));
      // Physical linear roughness 0.28..0.42 (controlled directional satin sheen, no bloom blowout or glare)
      rough[idx] = Math.max(0.28, Math.min(0.42, 0.35 - smoothStreak * 0.14 + Math.abs(longBrush) * 0.14));
      ao[idx] = Math.max(0.84, Math.min(1.0, 0.94 + smoothStreak * 0.1));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToSrgbAlbedoCanvas(albedo, size, 0.98, 0.99, 1.02), THREE.SRGBColorSpace, 2, 2, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 2.0), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToLinearCanvas(rough, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    ao: makeCanvasTexture(scalarToLinearCanvas(ao, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
  };
}

/**
 * 3. Carbon Composite — 3K 2x2 diagonal twill weave (hybrid PNG + procedural fallback).
 */
function buildCarbonTwillSet(
  size: number,
  aniso: number,
  trilinear: boolean,
  hybridMap?: DecodedDataMap | null
): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const ao = new Float32Array(total);
  const cell = Math.max(4, size >> 5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const cy = Math.floor(y / cell);
    const ly = (y % cell) / cell;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const cx = Math.floor(x / cell);
      const lx = (x % cell) / cell;
      const idx = y * size + x;

      let h: number;
      let warpFactor: number;
      let rVal: number;
      if (hybridMap) {
        h = sampleDecodedChannel(hybridMap, u, v, 0);
        warpFactor = sampleDecodedChannel(hybridMap, u, v, 1);
        rVal = sampleDecodedChannel(hybridMap, u, v, 2);
      } else {
        const twillPhase = (cx + cy) & 3;
        const isWarp = twillPhase < 2;
        const arch = isWarp
          ? Math.sin(lx * Math.PI) * (0.72 + 0.28 * Math.sin(ly * Math.PI))
          : Math.sin(ly * Math.PI) * (0.72 + 0.28 * Math.sin(lx * Math.PI));
        const strand = isWarp ? Math.sin(ly * Math.PI * 6) * 0.045 : Math.sin(lx * Math.PI * 6) * 0.045;
        h = Math.max(0, Math.min(1, 0.2 + arch * 0.72 + strand));
        warpFactor = isWarp ? 0.85 : 0.2;
        rVal = isWarp ? 0.36 + (1 - arch) * 0.14 : 0.42 + (1 - arch) * 0.14;
      }

      height[idx] = h;
      // Deep obsidian carbon-weave contrast: linear 0.006..0.020 (~sRGB #111419..#23272D)
      albedo[idx] = Math.max(0.006, Math.min(0.021, 0.008 + h * 0.008 + warpFactor * 0.004));
      // Physical resin-over-weave roughness: 0.34..0.54
      rough[idx] = Math.max(0.34, Math.min(0.55, 0.35 + rVal * 0.20));
      ao[idx] = Math.max(0.68, Math.min(1.0, 0.7 + h * 0.3));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToSrgbAlbedoCanvas(albedo, size, 0.98, 0.99, 1.01), THREE.SRGBColorSpace, 4, 4, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 2.3), THREE.NoColorSpace, 4, 4, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToLinearCanvas(rough, size), THREE.NoColorSpace, 4, 4, aniso, trilinear),
    ao: makeCanvasTexture(scalarToLinearCanvas(ao, size), THREE.NoColorSpace, 4, 4, aniso, trilinear),
  };
}

/**
 * 4. Technical Ceramic — matte sintered graphite-slate dielectric for clear material separation against dark metal.
 */
function buildDarkCeramicSet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const seed = { v: 9021 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const macro = tileableValueNoise(u * 12, v * 12, 12, 71) - 0.5;
      const n1 = lcg(seed);
      const pit = n1 > 0.955 ? -0.16 : (lcg(seed) - 0.5) * 0.06;

      height[idx] = Math.max(0, Math.min(1, 0.54 + macro * 0.14 + pit));
      // Distinct matte warm-graphite slate ceramic: linear 0.024..0.042 (~sRGB #292C31..#35383E)
      albedo[idx] = Math.max(0.024, Math.min(0.042, 0.032 + macro * 0.008 + pit * 0.012));
      // High matte roughness 0.76..0.92 (strong non-metallic contrast next to satin obsidian & titanium)
      rough[idx] = Math.max(0.76, Math.min(0.92, 0.84 - macro * 0.06 - pit * 0.16));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToSrgbAlbedoCanvas(albedo, size, 1.01, 0.99, 0.97), THREE.SRGBColorSpace, 3, 3, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 1.25), THREE.NoColorSpace, 3, 3, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToLinearCanvas(rough, size), THREE.NoColorSpace, 3, 3, aniso, trilinear),
  };
}

/**
 * 5. Copper Alloy — burnished industrial copper for induction windings, busbars & cooling fins.
 */
function buildCopperAlloySet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const seed = { v: 7741 };

  for (let y = 0; y < size; y++) {
    const streak = (lcg(seed) - 0.5) * 0.14 + Math.sin((y / size) * Math.PI * 24) * 0.03;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const micro = (lcg(seed) - 0.5) * 0.04;
      height[idx] = Math.max(0, Math.min(1, 0.5 + streak + micro));
      // Controlled dark burnished industrial copper/bronze (warm depth without bright orange glare)
      albedo[idx] = Math.max(0.22, Math.min(0.38, 0.29 + streak * 0.11));
      // Physical roughness 0.28..0.44
      rough[idx] = Math.max(0.28, Math.min(0.44, 0.35 - streak * 0.14 + Math.abs(micro) * 0.32));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToSrgbAlbedoCanvas(albedo, size, 0.80, 0.39, 0.21), THREE.SRGBColorSpace, 2, 2, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 1.8), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToLinearCanvas(rough, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
  };
}

function disposeChannelSet(set: PbrChannelSet): void {
  try { set.albedo.dispose(); } catch {}
  try { set.normal.dispose(); } catch {}
  try { set.roughness.dispose(); } catch {}
  try { set.ao?.dispose(); } catch {}
}

function disposeBundle(bundle: ReactorPbrTextureBundle): void {
  disposeChannelSet(bundle.anodized);
  disposeChannelSet(bundle.brushedTitanium);
  disposeChannelSet(bundle.carbon);
  disposeChannelSet(bundle.ceramic);
  disposeChannelSet(bundle.copper);
}

function scheduleChunk(fn: () => void): number {
  if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
    return (window as any).requestIdleCallback(fn, { timeout: 120 });
  }
  return setTimeout(fn, 0) as unknown as number;
}

/**
 * Single-owner Texture Registry managing Hybrid PBR texture tiers (256..2048)
 * with exact sRGB/Linear separation and zero double-dispose leaks.
 */
export class ReactorTextureRegistry {
  private cache = new Map<PbrTextureTier, ReactorPbrTextureBundle>();
  private activeTier: PbrTextureTier = 256;
  private generationToken = 0;
  private disposed = false;

  public mapRequestedResolutionToTier(requested: number): PbrTextureTier {
    if (requested >= 2048) return 2048;
    if (requested >= 1024) return 1024;
    if (requested >= 512) return 512;
    return 256;
  }

  /**
   * Synchronous fast bootstrap tier (256px) so frame 0 renders immediately,
   * while kicking off asynchronous preload of local hybrid PBR data PNGs.
   */
  public getBootstrapBundle(anisotropy = 4, trilinear = true): ReactorPbrTextureBundle {
    void loadLocalDataPng('anodized');
    void loadLocalDataPng('carbon');

    const existing = this.cache.get(256);
    if (existing) return existing;

    const anodizedPng = decodedAssetCache.get('anodized') ?? null;
    const carbonPng = decodedAssetCache.get('carbon') ?? null;
    const bundle: ReactorPbrTextureBundle = {
      tier: 256,
      anodized: buildAnodizedSet(256, anisotropy, trilinear, anodizedPng),
      brushedTitanium: buildBrushedTitaniumSet(256, anisotropy, trilinear),
      carbon: buildCarbonTwillSet(256, anisotropy, trilinear, carbonPng),
      ceramic: buildDarkCeramicSet(256, anisotropy, trilinear),
      copper: buildCopperAlloySet(256, anisotropy, trilinear),
      hybridAssetsUsed: Boolean(anodizedPng || carbonPng),
    };
    this.cache.set(256, bundle);
    this.activeTier = 256;
    return bundle;
  }

  /**
   * Asynchronously generates (chunked across idle ticks) or returns cached PBR tier.
   * Hero surfaces (anodized, brushedTitanium) scale up to 2048px; secondary maps cap at 1024px.
   */
  public requestTier(
    tier: PbrTextureTier,
    anisotropy: number,
    trilinear: boolean,
    onReady: (bundle: ReactorPbrTextureBundle) => void
  ): void {
    if (this.disposed) return;
    const token = ++this.generationToken;

    const cached = this.cache.get(tier);
    if (cached) {
      this.activeTier = tier;
      this.updateFiltering(anisotropy, trilinear);
      onReady(cached);
      return;
    }

    const secondarySize = Math.min(tier, 1024);

    Promise.all([loadLocalDataPng('anodized'), loadLocalDataPng('carbon')]).then(
      ([anodizedPng, carbonPng]) => {
        if (this.disposed || token !== this.generationToken) return;

        const partial: Partial<ReactorPbrTextureBundle> = {
          tier,
          hybridAssetsUsed: Boolean(anodizedPng || carbonPng),
        };
        const steps: Array<() => void> = [
          () => { partial.anodized = buildAnodizedSet(tier, anisotropy, trilinear, anodizedPng); },
          () => { partial.brushedTitanium = buildBrushedTitaniumSet(tier, anisotropy, trilinear); },
          () => { partial.carbon = buildCarbonTwillSet(secondarySize, anisotropy, trilinear, carbonPng); },
          () => { partial.ceramic = buildDarkCeramicSet(secondarySize, anisotropy, trilinear); },
          () => { partial.copper = buildCopperAlloySet(secondarySize, anisotropy, trilinear); },
        ];

        let stepIdx = 0;
        const runNext = () => {
          if (this.disposed || token !== this.generationToken) {
            if (partial.anodized) disposeChannelSet(partial.anodized);
            if (partial.brushedTitanium) disposeChannelSet(partial.brushedTitanium);
            if (partial.carbon) disposeChannelSet(partial.carbon);
            if (partial.ceramic) disposeChannelSet(partial.ceramic);
            if (partial.copper) disposeChannelSet(partial.copper);
            return;
          }

          if (stepIdx < steps.length) {
            steps[stepIdx++]();
            scheduleChunk(runNext);
            return;
          }

          const fullBundle = partial as ReactorPbrTextureBundle;
          this.cache.set(tier, fullBundle);
          this.activeTier = tier;
          onReady(fullBundle);
        };

        scheduleChunk(runNext);
      }
    );
  }

  public updateFiltering(anisotropy: number, trilinear: boolean): void {
    const minFilter = trilinear ? THREE.LinearMipmapLinearFilter : THREE.LinearMipmapNearestFilter;
    this.cache.forEach((bundle) => {
      const sets = [bundle.anodized, bundle.brushedTitanium, bundle.carbon, bundle.ceramic, bundle.copper];
      for (const s of sets) {
        for (const tex of [s.albedo, s.normal, s.roughness, s.ao]) {
          if (tex) {
            tex.anisotropy = anisotropy;
            tex.minFilter = minFilter;
            tex.needsUpdate = true;
          }
        }
      }
    });
  }

  public getActiveTier(): PbrTextureTier {
    return this.activeTier;
  }

  public getCachedTierCount(): number {
    return this.cache.size;
  }

  public getTextureStats(): { activeTier: PbrTextureTier; cachedTiers: PbrTextureTier[]; hybridAssetsUsed: boolean } {
    const active = this.cache.get(this.activeTier);
    return {
      activeTier: this.activeTier,
      cachedTiers: Array.from(this.cache.keys()),
      hybridAssetsUsed: Boolean(active?.hybridAssetsUsed),
    };
  }

  public isOwnedTexture(tex: THREE.Texture | null | undefined): boolean {
    if (!tex) return false;
    for (const bundle of this.cache.values()) {
      const sets = [bundle.anodized, bundle.brushedTitanium, bundle.carbon, bundle.ceramic, bundle.copper];
      for (const s of sets) {
        if (tex === s.albedo || tex === s.normal || tex === s.roughness || tex === s.ao) {
          return true;
        }
      }
    }
    return false;
  }

  public disposeAll(): void {
    this.disposed = true;
    this.generationToken++;
    this.cache.forEach((bundle) => disposeBundle(bundle));
    this.cache.clear();
  }
}
