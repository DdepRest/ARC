import * as THREE from 'three';

let cachedBrushedMetal: THREE.CanvasTexture | null = null;
let cachedCarbonFiber: THREE.CanvasTexture | null = null;
let cachedHoloReticle: THREE.CanvasTexture | null = null;
let cachedTriangularReticle: THREE.CanvasTexture | null = null;
let cachedArcLogo: THREE.CanvasTexture | null = null;

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

    // Restrained high-energy plasma background with compact radial falloff (prevents wide hotspot bleed)
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    const r = (hexColor >> 16) & 255;
    const g = (hexColor >> 8) & 255;
    const b = hexColor & 255;
    bgGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.56)`);
    bgGrad.addColorStop(0.26, `rgba(${r}, ${g}, ${b}, 0.40)`);
    bgGrad.addColorStop(0.56, `rgba(${r}, ${g}, ${b}, 0.16)`);
    bgGrad.addColorStop(0.84, `rgba(${r}, ${g}, ${b}, 0.04)`);
    bgGrad.addColorStop(1.0, '#000000');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle turbulent plasma filaments
    const hiR = Math.min(255, r + 55);
    const hiG = Math.min(255, g + 35);
    const hiB = Math.min(255, b + 35);
    ctx.strokeStyle = `rgba(${hiR}, ${hiG}, ${hiB}, 0.24)`;
    ctx.lineWidth = 1.25;
    for (let rad = 16; rad < size * 0.45; rad += 12) {
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
    ctx.strokeStyle = `rgba(${hiR}, ${hiG}, ${hiB}, 0.16)`;
    for (let i = 0; i < 12; i++) {
      const angle = ((Math.PI * 2) / 12) * i;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14);
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
      ctx.strokeStyle = 'rgba(6, 8, 12, 0.86)';
      ctx.lineWidth = 9.5 * scale;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Machined satin titanium connecting bridge visually uniting A - R - C
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(206, 216, 228, 0.58)';
      ctx.lineWidth = 3.8 * scale;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    };

    const gapR = 82 * scale;
    drawSegmentWithGap(letters[0].x, letters[0].y, letters[1].x, letters[1].y, gapR);
    drawSegmentWithGap(letters[1].x, letters[1].y, letters[2].x, letters[2].y, gapR);
    drawSegmentWithGap(letters[2].x, letters[2].y, letters[0].x, letters[0].y, gapR);

    // 2. Custom Geometric A, R, C Vector Glyphs — integrated machined titanium-silver finish
    //    with localized dark contour cushion so 'R' stays crisp at all core brightness levels
    const strokeGlyphPath = (
      char: string,
      gx: number,
      gy: number,
      h: number,
      w: number,
      sw: number,
      isContourPass: boolean
    ) => {
      ctx.lineWidth = isContourPass ? sw + 20 * scale : sw;
      if (char === 'A') {
        ctx.beginPath();
        ctx.moveTo(gx - w, gy + h);
        ctx.lineTo(gx, gy - h);
        ctx.lineTo(gx + w, gy + h);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = (isContourPass ? sw + 16 * scale : sw) * 0.85;
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
      // Compact borderless radial shadow cushion (no large opaque backing or medallion ring)
      const haloGrad = ctx.createRadialGradient(gx, gy, 14 * scale, gx, gy, 80 * scale);
      haloGrad.addColorStop(0, 'rgba(5, 7, 10, 0.74)');
      haloGrad.addColorStop(0.58, 'rgba(5, 7, 10, 0.42)');
      haloGrad.addColorStop(1.0, 'rgba(5, 7, 10, 0.0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(gx, gy, 80 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 6;
      const sw = 24.5 * scale;
      const h = 68 * scale;
      const w = 53 * scale;

      // Pass 1: Tight obsidian machined bezel contour directly behind glyph strokes
      ctx.strokeStyle = 'rgba(5, 7, 10, 0.96)';
      strokeGlyphPath(char, gx, gy, h, w, sw, true);

      // Pass 2: Machined satin titanium-silver glyph face (high contrast without glowing white glare)
      const metalGrad = ctx.createLinearGradient(gx, gy - h, gx, gy + h);
      metalGrad.addColorStop(0, '#f4f7fb');
      metalGrad.addColorStop(0.52, '#e0e7f1');
      metalGrad.addColorStop(1, '#c5cedc');
      ctx.strokeStyle = metalGrad;
      strokeGlyphPath(char, gx, gy, h, w, sw, false);
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

