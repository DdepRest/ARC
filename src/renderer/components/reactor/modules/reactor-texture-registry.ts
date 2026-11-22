import * as THREE from 'three';

export type PbrTextureTier = 256 | 512 | 1024;

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
}

function lcg(seed: { v: number }): number {
  seed.v = (seed.v * 1664525 + 1013904223) >>> 0;
  return (seed.v >>> 8) / 16777216;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
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

function scalarToGrayCanvas(values: Float32Array, size: number, rScale = 1, gScale = 1, bScale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = values[i] * 255;
    const p = i * 4;
    data[p] = clampByte(v * rScale);
    data[p + 1] = clampByte(v * gScale);
    data[p + 2] = clampByte(v * bScale);
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function buildAnodizedSet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const ao = new Float32Array(total);
  const seed = { v: 4109 };

  const panelStep = Math.max(32, size >> 2);
  for (let y = 0; y < size; y++) {
    const rowStreak = (lcg(seed) - 0.5) * 0.08;
    const seamY = (y % panelStep) < 2 ? 1.0 : 0.0;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const seamX = (x % panelStep) < 2 ? 1.0 : 0.0;
      const seam = Math.max(seamY, seamX);
      const grain = (lcg(seed) - 0.5) * 0.09;
      const machined = Math.sin((x / size) * Math.PI * 6) * 0.03;

      const h = Math.max(0, Math.min(1, 0.55 + rowStreak + grain + machined - seam * 0.42));
      height[idx] = h;
      // Subtle dark obsidian/graphite albedo (avoids crushed 0x050507 black)
      albedo[idx] = Math.max(0.08, Math.min(0.24, 0.145 + rowStreak * 0.22 + grain * 0.12 - seam * 0.04));
      // Roughness variation: 0.26..0.44, rougher in machined grooves
      rough[idx] = Math.max(0.22, Math.min(0.55, 0.31 + Math.abs(rowStreak) * 0.7 - grain * 0.3 + seam * 0.18));
      ao[idx] = seam > 0 ? 0.52 : 0.96 - Math.abs(grain) * 0.3;
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToGrayCanvas(albedo, size, 0.94, 0.96, 1.04), THREE.SRGBColorSpace, 2, 2, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 2.2), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToGrayCanvas(rough, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    ao: makeCanvasTexture(scalarToGrayCanvas(ao, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
  };
}

function buildBrushedTitaniumSet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const ao = new Float32Array(total);
  const seed = { v: 1337 };

  for (let y = 0; y < size; y++) {
    const fineBrush = (lcg(seed) - 0.5) * 0.24;
    const band = Math.sin((y / size) * Math.PI * 16) * 0.05;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const microScratch = Math.sin((x / size) * Math.PI * 4 + y * 0.17) * 0.05;
      const jitter = (lcg(seed) - 0.5) * 0.05;

      height[idx] = Math.max(0, Math.min(1, 0.5 + fineBrush + band + microScratch + jitter));
      albedo[idx] = Math.max(0.18, Math.min(0.46, 0.31 + fineBrush * 0.28 + band * 0.25));
      rough[idx] = Math.max(0.16, Math.min(0.42, 0.25 - fineBrush * 0.22 + Math.abs(jitter) * 0.4));
      ao[idx] = Math.max(0.75, Math.min(1.0, 0.94 + fineBrush * 0.12));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToGrayCanvas(albedo, size, 0.94, 0.97, 1.03), THREE.SRGBColorSpace, 2, 2, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 2.8), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToGrayCanvas(rough, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    ao: makeCanvasTexture(scalarToGrayCanvas(ao, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
  };
}

/**
 * True 2x2 diagonal twill carbon fiber weave (no checkerboard artifacts).
 */
function buildCarbonTwillSet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const cell = Math.max(4, size >> 5); // 32 cells across tile

  for (let y = 0; y < size; y++) {
    const cy = Math.floor(y / cell);
    const ly = (y % cell) / cell;
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const lx = (x % cell) / cell;
      const idx = y * size + x;

      // 2x2 diagonal twill pattern
      const twillPhase = (cx + cy) & 3;
      const isWarp = twillPhase < 2;
      const arch = isWarp
        ? Math.sin(lx * Math.PI) * (0.7 + 0.3 * Math.sin(ly * Math.PI))
        : Math.sin(ly * Math.PI) * (0.7 + 0.3 * Math.sin(lx * Math.PI));
      const strand = isWarp ? Math.sin(ly * Math.PI * 6) * 0.04 : Math.sin(lx * Math.PI * 6) * 0.04;

      height[idx] = Math.max(0, Math.min(1, 0.25 + arch * 0.65 + strand));
      albedo[idx] = isWarp
        ? 0.11 + arch * 0.08 + strand * 0.2
        : 0.085 + arch * 0.065 + strand * 0.2;
      rough[idx] = isWarp
        ? Math.max(0.24, 0.44 - arch * 0.14)
        : Math.max(0.30, 0.52 - arch * 0.14);
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToGrayCanvas(albedo, size, 0.96, 0.98, 1.03), THREE.SRGBColorSpace, 6, 6, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 2.4), THREE.NoColorSpace, 6, 6, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToGrayCanvas(rough, size), THREE.NoColorSpace, 6, 6, aniso, trilinear),
  };
}

function buildDarkCeramicSet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const seed = { v: 9021 };

  for (let i = 0; i < total; i++) {
    const n1 = lcg(seed);
    const n2 = lcg(seed);
    const pit = n1 > 0.94 ? -0.18 : (n2 - 0.5) * 0.08;
    height[i] = Math.max(0, Math.min(1, 0.55 + pit));
    albedo[i] = Math.max(0.09, Math.min(0.18, 0.13 + pit * 0.12));
    rough[i] = Math.max(0.62, Math.min(0.86, 0.74 - pit * 0.25));
  }

  return {
    albedo: makeCanvasTexture(scalarToGrayCanvas(albedo, size, 0.96, 0.97, 1.0), THREE.SRGBColorSpace, 3, 3, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 1.4), THREE.NoColorSpace, 3, 3, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToGrayCanvas(rough, size), THREE.NoColorSpace, 3, 3, aniso, trilinear),
  };
}

function buildCopperAlloySet(size: number, aniso: number, trilinear: boolean): PbrChannelSet {
  const total = size * size;
  const height = new Float32Array(total);
  const rough = new Float32Array(total);
  const albedo = new Float32Array(total);
  const seed = { v: 7741 };

  for (let y = 0; y < size; y++) {
    const streak = (lcg(seed) - 0.5) * 0.16;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const micro = (lcg(seed) - 0.5) * 0.04;
      height[idx] = Math.max(0, Math.min(1, 0.5 + streak + micro));
      albedo[idx] = Math.max(0.35, Math.min(0.68, 0.52 + streak * 0.3));
      rough[idx] = Math.max(0.18, Math.min(0.42, 0.26 - streak * 0.2));
    }
  }

  return {
    albedo: makeCanvasTexture(scalarToGrayCanvas(albedo, size, 1.0, 0.68, 0.44), THREE.SRGBColorSpace, 2, 2, aniso, trilinear),
    normal: makeCanvasTexture(heightToNormalCanvas(height, size, 2.0), THREE.NoColorSpace, 2, 2, aniso, trilinear),
    roughness: makeCanvasTexture(scalarToGrayCanvas(rough, size), THREE.NoColorSpace, 2, 2, aniso, trilinear),
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
 * Single-owner Texture Registry managing PBR texture tiers and preventing double/triple dispose.
 */
export class ReactorTextureRegistry {
  private cache = new Map<PbrTextureTier, ReactorPbrTextureBundle>();
  private activeTier: PbrTextureTier = 256;
  private generationToken = 0;
  private disposed = false;

  public mapRequestedResolutionToTier(requested: number): PbrTextureTier {
    if (requested >= 1024) return 1024;
    if (requested >= 512) return 512;
    return 256;
  }

  /**
   * Synchronous fast bootstrap tier (256px) so the very first frame renders immediately.
   */
  public getBootstrapBundle(anisotropy = 4, trilinear = true): ReactorPbrTextureBundle {
    const existing = this.cache.get(256);
    if (existing) return existing;
    const bundle: ReactorPbrTextureBundle = {
      tier: 256,
      anodized: buildAnodizedSet(256, anisotropy, trilinear),
      brushedTitanium: buildBrushedTitaniumSet(256, anisotropy, trilinear),
      carbon: buildCarbonTwillSet(256, anisotropy, trilinear),
      ceramic: buildDarkCeramicSet(256, anisotropy, trilinear),
      copper: buildCopperAlloySet(256, anisotropy, trilinear),
    };
    this.cache.set(256, bundle);
    this.activeTier = 256;
    return bundle;
  }

  /**
   * Asynchronously generates (chunked across idle ticks) or returns cached PBR tier.
   * Cancels superseded requests cleanly via generationToken so rapid preset switches never leak.
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

    const partial: Partial<ReactorPbrTextureBundle> = { tier };
    const steps: Array<() => void> = [
      () => { partial.anodized = buildAnodizedSet(tier, anisotropy, trilinear); },
      () => { partial.brushedTitanium = buildBrushedTitaniumSet(tier, anisotropy, trilinear); },
      () => { partial.carbon = buildCarbonTwillSet(tier, anisotropy, trilinear); },
      () => { partial.ceramic = buildDarkCeramicSet(tier, anisotropy, trilinear); },
      () => { partial.copper = buildCopperAlloySet(tier, anisotropy, trilinear); },
    ];

    let stepIdx = 0;
    const runNext = () => {
      if (this.disposed || token !== this.generationToken) {
        // Clean up any partial textures generated before cancellation
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
