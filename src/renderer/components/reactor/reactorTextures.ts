import * as THREE from 'three';

let cachedBrushedMetal: THREE.CanvasTexture | null = null;
let cachedCarbonFiber: THREE.CanvasTexture | null = null;
let cachedHoloReticle: THREE.CanvasTexture | null = null;
let cachedTriangularReticle: THREE.CanvasTexture | null = null;
let cachedArcLogo: THREE.CanvasTexture | null = null;
let cachedCoreThermal: THREE.CanvasTexture | null = null;
let cachedHotCore: THREE.CanvasTexture | null = null;
let cachedOuterEnvelope: THREE.CanvasTexture | null = null;

export function clearStaticTextureCache(): void {
  try { cachedBrushedMetal?.dispose(); } catch {}
  cachedBrushedMetal = null;
  try { cachedCarbonFiber?.dispose(); } catch {}
  cachedCarbonFiber = null;
  try { cachedHoloReticle?.dispose(); } catch {}
  cachedHoloReticle = null;
  try { cachedTriangularReticle?.dispose(); } catch {}
  cachedTriangularReticle = null;
  try { cachedArcLogo?.dispose(); } catch {}
  cachedArcLogo = null;
  try { cachedCoreThermal?.dispose(); } catch {}
  cachedCoreThermal = null;
  try { cachedHotCore?.dispose(); } catch {}
  cachedHotCore = null;
  try { cachedOuterEnvelope?.dispose(); } catch {}
  cachedOuterEnvelope = null;
}

/**
 * Fast PRNG for procedural noise generation (LCG)
 */
function fastRandom(seed: { val: number }): number {
  seed.val = (seed.val * 1664525 + 1013904223) >>> 0;
  return (seed.val >>> 8) / 16777216;
}

/**
 * Creates a procedural brushed metal texture (scratches / anisotropic grain)
 */
export function createBrushedMetalTexture(width = 256, height = 256): THREE.CanvasTexture {
  if (cachedBrushedMetal) {
    cachedBrushedMetal.needsUpdate = true;
    return cachedBrushedMetal;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const imgData = ctx.createImageData(width, height);
    const data32 = new Uint32Array(imgData.data.buffer);
    const seed = { val: 1337 };

    for (let y = 0; y < height; y++) {
      const lineNoise = (fastRandom(seed) - 0.5) * 16;
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const smoothWave = Math.sin((x / width) * Math.PI * 4) * 4;
        const pixelNoise = (fastRandom(seed) - 0.5) * 4;
        const val = Math.min(255, Math.max(0, (128 + lineNoise + smoothWave + pixelNoise) | 0));
        data32[rowOffset + x] = 0xFF000000 | (val << 16) | (val << 8) | val;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  cachedBrushedMetal = texture;
  return texture;
}

/**
 * Creates a procedural carbon fiber twill weave bump/roughness texture
 */
export function createCarbonFiberTexture(width = 256, height = 256): THREE.CanvasTexture {
  if (cachedCarbonFiber) {
    cachedCarbonFiber.needsUpdate = true;
    return cachedCarbonFiber;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#161618';
    ctx.fillRect(0, 0, width, height);

    const tileSize = 16;
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        const isOdd = ((x / tileSize) + (y / tileSize)) % 2 === 0;
        ctx.fillStyle = isOdd ? '#1e1e22' : '#151518';
        ctx.fillRect(x, y, tileSize, tileSize);

        // Soft sub-stripe highlight for subtle weave depth without hard stair-stepping
        ctx.fillStyle = isOdd ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
        ctx.fillRect(x, y, tileSize, tileSize / 2);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  cachedCarbonFiber = texture;
  return texture;
}

/**
 * Creates an intricate procedural sci-fi plasma energy texture for the reactor heart
 */
export function createPlasmaEnergyTexture(size = 256, hexColor = 0x00d4ff): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    // White-hot inner plasma core transitioning cleanly to saturated crimson edges (compact falloff prevents logo washout)
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    const r = (hexColor >> 16) & 255;
    const g = (hexColor >> 8) & 255;
    const b = hexColor & 255;
    const hotR = Math.min(255, r + 95);
    const hotG = Math.min(255, g + 165);
    const hotB = Math.min(255, b + 150);
    bgGrad.addColorStop(0.0, `rgba(${hotR}, ${hotG}, ${hotB}, 0.92)`);
    bgGrad.addColorStop(0.18, `rgba(${Math.min(255, r + 45)}, ${Math.min(255, g + 55)}, ${Math.min(255, b + 48)}, 0.78)`);
    bgGrad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, 0.52)`);
    bgGrad.addColorStop(0.66, `rgba(${r}, ${g}, ${b}, 0.22)`);
    bgGrad.addColorStop(0.88, `rgba(${r}, ${g}, ${b}, 0.05)`);
    bgGrad.addColorStop(1.0, '#000000');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle turbulent plasma containment filaments
    const hiR = Math.min(255, r + 70);
    const hiG = Math.min(255, g + 48);
    const hiB = Math.min(255, b + 48);
    ctx.strokeStyle = `rgba(${hiR}, ${hiG}, ${hiB}, 0.28)`;
    ctx.lineWidth = 1.3;
    for (let rad = 14; rad < size * 0.45; rad += 11) {
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.15) {
        const noise = Math.sin(a * 6 + rad * 0.2) * 2.5 + Math.cos(a * 9) * 1.5;
        const x = cx + Math.cos(a) * (rad + noise);
        const y = cy + Math.sin(a) * (rad + noise);
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Restrained 3-fold harmonic radial energy rays (12 rays)
    ctx.strokeStyle = `rgba(${hiR}, ${hiG}, ${hiB}, 0.18)`;
    for (let i = 0; i < 12; i++) {
      const angle = ((Math.PI * 2) / 12) * i;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 12, cy + Math.sin(angle) * 12);
      ctx.lineTo(
        cx + Math.cos(angle) * (size * 0.45),
        cy + Math.sin(angle) * (size * 0.45)
      );
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Deterministic thermal plasma texture for the central triangular core body (ARC-056).
 * Centered strictly at UV (0.5, 0.5) with white-amber core -> orange-red -> saturated crimson
 * -> deep ruby outer band and subtle 3-fold turbulent plasma filaments (no blue/cyan tones).
 * Owned by the static texture cache and cleared via clearStaticTextureCache().
 */
export function createCoreThermalTexture(size = 512): THREE.CanvasTexture {
  if (cachedCoreThermal) {
    cachedCoreThermal.needsUpdate = true;
    return cachedCoreThermal;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const half = size * 0.5;
    const invHalf = 1 / half;

    for (let y = 0; y < size; y++) {
      const ny = (y + 0.5 - half) * invHalf;
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - half) * invHalf;
        const rad = Math.hypot(nx, ny);
        const ang = Math.atan2(ny, nx);

        // Downward-pointing 3-fold triangular symmetry shaping + deterministic plasma filaments
        const triHarmonic = Math.cos(3 * (ang + Math.PI / 2)) * 0.085;
        const effR = Math.max(0, rad - triHarmonic * Math.min(1, rad * 1.4));

        const f1 = Math.sin(nx * 11.0 + Math.cos(ny * 9.0) * 1.6) * Math.cos(ny * 10.5 - Math.sin(nx * 8.5) * 1.4);
        const f2 = Math.sin(rad * 22.0 - Math.cos(ang * 3.0) * 2.2 + f1 * 1.5);
        const vein = Math.pow(0.5 + 0.5 * Math.sin(ang * 6.0 + rad * 12.0 + f1 * 2.1), 2.0);
        const filament = (f1 * 0.5 + 0.5) * 0.45 + (f2 * 0.5 + 0.5) * 0.30 + vein * 0.25;

        // Broad luminous body plateau keeping outer triangle perimeter active while square corners remain deep ruby
        const baseHeat = Math.max(0, Math.min(1, 1.0 - Math.pow(effR * 0.98, 1.38)));
        const heat = Math.max(
          0,
          Math.min(1, baseHeat * (0.82 + filament * 0.28) + (1.0 - Math.min(1, effR * 2.15)) * 0.16)
        );

        // 4-stop thermal blackbody ramp: deep crimson -> rich orange-red -> warm amber -> white-hot center
        let r: number;
        let g: number;
        let b: number;
        if (heat < 0.26) {
          const t = heat / 0.26;
          r = 26 + t * 158;
          g = 3 + t * 18;
          b = 6 + t * 14;
        } else if (heat < 0.60) {
          const t = (heat - 0.26) / 0.34;
          r = 184 + t * 68;
          g = 21 + t * 79;
          b = 20 + t * 14;
        } else if (heat < 0.84) {
          const t = (heat - 0.60) / 0.24;
          r = 252 + t * 3;
          g = 100 + t * 106;
          b = 34 + t * 84;
        } else {
          const t = (heat - 0.84) / 0.16;
          r = 255;
          g = 206 + t * 44;
          b = 118 + t * 112;
        }

        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, Math.round(r)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  cachedCoreThermal = texture;
  return texture;
}

/**
 * Deterministic compact white-hot to warm-amber singularity texture (ARC-056).
 * Soft edge falloff to transparent black prevents harsh polygonal edges under AdditiveBlending.
 */
export function createHotCoreTexture(size = 256): THREE.CanvasTexture {
  if (cachedHotCore) {
    cachedHotCore.needsUpdate = true;
    return cachedHotCore;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const half = size * 0.5;
    const invHalf = 1 / half;

    for (let y = 0; y < size; y++) {
      const ny = (y + 0.5 - half) * invHalf;
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - half) * invHalf;
        const rad = Math.hypot(nx, ny);
        const ang = Math.atan2(ny, nx);

        const triShape = Math.cos(3 * (ang + Math.PI / 2)) * 0.065;
        const effR = Math.max(0, rad - triShape * Math.min(1, rad));
        const cell = 0.84 + 0.16 * Math.sin(nx * 14.0 + Math.cos(ny * 13.0)) * Math.cos(ny * 14.0 - Math.sin(nx * 12.0));
        const edgeMask = Math.max(0, Math.min(1, 1.0 - Math.pow(effR / 0.96, 1.95)));
        const core = Math.max(0, Math.min(1, Math.pow(edgeMask, 1.25) * cell));

        // White-ivory center -> warm amber -> rich orange feather -> transparent black
        const r = 255 * Math.pow(core, 0.50);
        const g = 250 * Math.pow(core, 0.98);
        const b = 232 * Math.pow(core, 1.72);
        const a = 255 * edgeMask;

        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, Math.round(r)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        data[idx + 3] = Math.max(0, Math.min(255, Math.round(a)));
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  cachedHotCore = texture;
  return texture;
}

/**
 * Deterministic annular crimson corona texture for the dedicated outer plasma envelope (ARC-057).
 * Peaks across the annular envelope ring (r ~0.50..0.78) and feathers cleanly to zero at perimeter.
 * Owned by the static texture cache and cleared via clearStaticTextureCache().
 */
export function createOuterEnvelopeTexture(size = 256): THREE.CanvasTexture {
  if (cachedOuterEnvelope) {
    cachedOuterEnvelope.needsUpdate = true;
    return cachedOuterEnvelope;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const half = size * 0.5;
    const invHalf = 1 / half;

    for (let y = 0; y < size; y++) {
      const ny = (y + 0.5 - half) * invHalf;
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - half) * invHalf;
        const rad = Math.hypot(nx, ny);
        const ang = Math.atan2(ny, nx);

        const triMod = Math.cos(3 * (ang + Math.PI / 2)) * 0.055;
        const effR = Math.max(0, rad - triMod * Math.min(1, rad));
        const innerRise = Math.max(0, Math.min(1, (effR - 0.18) / 0.36));
        const outerFall = Math.max(0, Math.min(1, 1.0 - Math.pow(Math.max(0, (effR - 0.56) / 0.42), 1.65)));
        const swirl = 0.80 + 0.20 * Math.sin(ang * 6.0 + effR * 14.0) * Math.cos(ang * 3.0 - effR * 9.0);
        const density = Math.max(0, Math.min(1, (0.38 + 0.62 * innerRise) * outerFall * swirl));

        const r = 248 * Math.pow(density, 0.72);
        const g = 68 * Math.pow(density, 1.45);
        const b = 28 * Math.pow(density, 1.75);

        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, Math.round(r)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  cachedOuterEnvelope = texture;
  return texture;
}

/**
 * Creates a soft radial Gaussian glow texture for soft glowing particles
 */
export function createGlowParticleTexture(size = 128, hexColor = 0x00d4ff): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    const r = (hexColor >> 16) & 255;
    const g = (hexColor >> 8) & 255;
    const b = hexColor & 255;
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1.0)`);
    gradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.8)`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.25)`);
    gradient.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates an intricate sci-fi reticle / HUD circle texture for glass optics
 */
export function createHolographicReticleTexture(size = 512): THREE.CanvasTexture {
  if (cachedHoloReticle) {
    cachedHoloReticle.needsUpdate = true;
    return cachedHoloReticle;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // Dotted inner ring
    ctx.setLineDash([6, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Radial ticks
    const ticks = 36;
    for (let i = 0; i < ticks; i++) {
      const angle = (Math.PI * 2 / ticks) * i;
      const rInner = size * 0.40;
      const rOuter = size * (i % 3 === 0 ? 0.44 : 0.42);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
      ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
      ctx.stroke();
    }

    // Crosshairs
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.15, cy); ctx.lineTo(cx - size * 0.05, cy);
    ctx.moveTo(cx + size * 0.05, cy); ctx.lineTo(cx + size * 0.15, cy);
    ctx.moveTo(cx, cy - size * 0.15); ctx.lineTo(cx, cy - size * 0.05);
    ctx.moveTo(cx, cy + size * 0.05); ctx.lineTo(cx, cy + size * 0.15);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedHoloReticle = texture;
  return texture;
}

/**
 * Creates an intricate triangular sci-fi reticle / HUD texture for the central triangular core
 */
export function createTriangularReticleTexture(size = 512): THREE.CanvasTexture {
  if (cachedTriangularReticle) {
    cachedTriangularReticle.needsUpdate = true;
    return cachedTriangularReticle;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;

    const drawTriangle = (r: number, offsetAngle = -Math.PI / 2) => {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = offsetAngle + (i * 2 * Math.PI) / 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    // 1. Outer Triangular Frame
    drawTriangle(size * 0.44);
    ctx.stroke();

    // 2. Secondary Dotted Inner Triangle
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 1.5;
    drawTriangle(size * 0.36);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Central Power Triangle
    ctx.lineWidth = 2;
    drawTriangle(size * 0.22);
    ctx.stroke();

    // 4. Inverted Core Grid
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    drawTriangle(size * 0.14, Math.PI / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Corner Targeting Brackets & Ticks
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const vx = cx + Math.cos(a) * (size * 0.44);
      const vy = cy + Math.sin(a) * (size * 0.44);

      // Radial energy line from center through vertex
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (size * 0.15), cy + Math.sin(a) * (size * 0.15));
      ctx.lineTo(cx + Math.cos(a) * (size * 0.47), cy + Math.sin(a) * (size * 0.47));
      ctx.stroke();

      // Corner target dot
      ctx.beginPath();
      ctx.arc(vx, vy, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    }

    // 6. Perimeter Edge Measurement Ticks
    ctx.lineWidth = 1;
    for (let side = 0; side < 3; side++) {
      const a1 = -Math.PI / 2 + (side * 2 * Math.PI) / 3;
      const a2 = -Math.PI / 2 + (((side + 1) % 3) * 2 * Math.PI) / 3;
      const x1 = cx + Math.cos(a1) * (size * 0.44);
      const y1 = cy + Math.sin(a1) * (size * 0.44);
      const x2 = cx + Math.cos(a2) * (size * 0.44);
      const y2 = cy + Math.sin(a2) * (size * 0.44);

      for (let t = 1; t < 6; t++) {
        const frac = t / 6;
        const px = x1 + (x2 - x1) * frac;
        const py = y1 + (y2 - y1) * frac;
        const nx = -(y2 - y1) / size * 8;
        const ny = (x2 - x1) / size * 8;

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx, py + ny);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedTriangularReticle = texture;
  return texture;
}

/**
 * Creates an ultra-sharp, high-tech holographic texture with A, R, C arranged in a balanced white triangle
 *   A     R
 *      C
 */
export function createArcCenterLogoTexture(size = 2048): THREE.CanvasTexture {
  if (cachedArcLogo) {
    cachedArcLogo.needsUpdate = true;
    return cachedArcLogo;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const scale = size / 1024;

    ctx.clearRect(0, 0, size, size);

    // Strict equilateral triangular triad centered around the localized core (unified emblem geometry)
    const letters = [
      { char: 'A', x: cx - 215 * scale, y: cy - 124 * scale },
      { char: 'R', x: cx + 215 * scale, y: cy - 124 * scale },
      { char: 'C', x: cx,               y: cy + 248 * scale },
    ];

    // 1. Unified Integrated Triangular Emblem Frame (open center so the emissive core remains visible)
    //    Single clean structural bridge locking A - R - C into one cohesive emblem without opaque backing plates
    const drawSegmentWithGap = (x1: number, y1: number, x2: number, y2: number, gapRadius: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const startX = x1 + ux * gapRadius;
      const startY = y1 + uy * gapRadius;
      const endX = x2 - ux * gapRadius;
      const endY = y2 - uy * gapRadius;

      // Recessed dark anodized channel bed under connecting bar
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(6, 8, 12, 0.64)';
      ctx.lineWidth = 6.5 * scale;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Machined dark-titanium connecting bridge visually uniting A - R - C without glare
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 154, 164, 0.40)';
      ctx.lineWidth = 2.6 * scale;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Precision recessed end-notches anchoring each connecting bridge toward its glyph
      const nx = -uy;
      const ny = ux;
      const tick = 5.5 * scale;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(142, 148, 158, 0.36)';
      ctx.lineWidth = 2.1 * scale;
      ctx.moveTo(startX - nx * tick, startY - ny * tick);
      ctx.lineTo(startX + nx * tick, startY + ny * tick);
      ctx.moveTo(endX - nx * tick, endY - ny * tick);
      ctx.lineTo(endX + nx * tick, endY + ny * tick);
      ctx.stroke();
    };

    const gapR = 88 * scale;
    drawSegmentWithGap(letters[0].x, letters[0].y, letters[1].x, letters[1].y, gapR);
    drawSegmentWithGap(letters[1].x, letters[1].y, letters[2].x, letters[2].y, gapR);
    drawSegmentWithGap(letters[2].x, letters[2].y, letters[0].x, letters[0].y, gapR);

    // 2. Custom Geometric A, R, C Vector Glyphs — restrained dark-titanium / muted silver finish
    //    calibrated strictly below the effective 0.58 Bloom threshold even with 0xe2e7f0 runtime tint
    const strokeGlyphPath = (
      char: string,
      gx: number,
      gy: number,
      h: number,
      w: number,
      sw: number,
      isContourPass: boolean
    ) => {
      ctx.lineWidth = isContourPass ? sw + 14 * scale : sw;
      if (char === 'A') {
        ctx.beginPath();
        ctx.moveTo(gx - w, gy + h);
        ctx.lineTo(gx, gy - h);
        ctx.lineTo(gx + w, gy + h);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = (isContourPass ? sw + 12 * scale : sw) * 0.85;
        ctx.moveTo(gx - w * 0.56, gy + h * 0.25);
        ctx.lineTo(gx + w * 0.56, gy + h * 0.25);
        ctx.stroke();
      } else if (char === 'R') {
        // Distinct geometric 'R': crisp vertical stem, open upper D-bowl counter, and well-separated diagonal leg
        const leftX = gx - w * 0.88;
        const bowlApexX = gx + w * 0.20;
        const midY = gy + 3 * scale;
        const bowlRadius = (h + 3 * scale) * 0.5;
        const bowlCenterY = gy - h + bowlRadius;

        ctx.beginPath();
        ctx.moveTo(leftX, gy + h);
        ctx.lineTo(leftX, gy - h);
        ctx.lineTo(bowlApexX, gy - h);
        ctx.arc(bowlApexX, bowlCenterY, bowlRadius, -Math.PI / 2, Math.PI / 2, false);
        ctx.lineTo(leftX, midY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(gx + w * 0.14, midY + 2 * scale);
        ctx.lineTo(gx + w * 0.96, gy + h);
        ctx.stroke();
      } else if (char === 'C') {
        ctx.beginPath();
        ctx.arc(gx + 5 * scale, gy, h * 0.94, 0.24 * Math.PI, 1.76 * Math.PI, false);
        ctx.stroke();
      }
    };

    const drawPrecisionGlyph = (char: string, gx: number, gy: number) => {
      // Compact borderless radial shadow cushion preserving sharp legibility over enlarged plasma body
      const haloGrad = ctx.createRadialGradient(gx, gy, 12 * scale, gx, gy, 58 * scale);
      haloGrad.addColorStop(0, 'rgba(5, 7, 10, 0.58)');
      haloGrad.addColorStop(0.58, 'rgba(5, 7, 10, 0.30)');
      haloGrad.addColorStop(1.0, 'rgba(5, 7, 10, 0.0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(gx, gy, 58 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 6;
      const sw = 23.0 * scale;
      const h = 68 * scale;
      const w = 53 * scale;

      // Pass 1: Tight obsidian machined bezel contour directly behind glyph strokes
      ctx.strokeStyle = 'rgba(5, 7, 10, 0.90)';
      strokeGlyphPath(char, gx, gy, h, w, sw, true);

      // Pass 2: Restrained machined dark-titanium / muted silver face (~0.26..0.31 linear post-tint < 0.58 bloom threshold)
      const metalGrad = ctx.createLinearGradient(gx, gy - h, gx, gy + h);
      metalGrad.addColorStop(0, 'rgba(164, 170, 180, 0.92)');
      metalGrad.addColorStop(0.54, 'rgba(136, 142, 152, 0.88)');
      metalGrad.addColorStop(1, 'rgba(146, 126, 126, 0.90)');
      ctx.strokeStyle = metalGrad;
      strokeGlyphPath(char, gx, gy, h, w, sw, false);

      // Pass 3: Subtle warm core-reflected micro-edge integrating emblem with optical glass
      ctx.strokeStyle = 'rgba(204, 126, 106, 0.18)';
      strokeGlyphPath(char, gx, gy, h, w, 3.0 * scale, false);
      ctx.restore();
    };

    letters.forEach((item) => {
      drawPrecisionGlyph(item.char, item.x, item.y);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.anisotropy = 16; // Maximum anisotropy for razor-sharp rendering
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  cachedArcLogo = texture;
  return texture;
}

