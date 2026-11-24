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

    // Restrained high-energy plasma background without blinding white center hotspot
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    const r = (hexColor >> 16) & 255;
    const g = (hexColor >> 8) & 255;
    const b = hexColor & 255;
    bgGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.68)`);
    bgGrad.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, 0.52)`);
    bgGrad.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, 0.24)`);
    bgGrad.addColorStop(0.88, `rgba(${r}, ${g}, ${b}, 0.08)`);
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

    // Balanced coordinates forming an inverted triangle matching the central chamber aperture
    const letters = [
      { char: 'A', x: cx - 224 * scale, y: cy - 128 * scale },
      { char: 'R', x: cx + 224 * scale, y: cy - 128 * scale },
      { char: 'C', x: cx,               y: cy + 206 * scale },
    ];

    // 1. Subtle dark obsidian triangular backing layer inside the central chamber
    //    Prevents core plasma emission from washing out A.R.C. while preserving perimeter glow
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 385 * scale, cy - 245 * scale);
    ctx.lineTo(cx + 385 * scale, cy - 245 * scale);
    ctx.lineTo(cx, cy + 410 * scale);
    ctx.closePath();
    const shieldGrad = ctx.createRadialGradient(cx, cy - 20 * scale, 10 * scale, cx, cy - 20 * scale, 410 * scale);
    shieldGrad.addColorStop(0, 'rgba(8, 10, 14, 0.88)');
    shieldGrad.addColorStop(0.75, 'rgba(10, 12, 17, 0.80)');
    shieldGrad.addColorStop(1.0, 'rgba(12, 15, 20, 0.35)');
    ctx.fillStyle = shieldGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 226, 236, 0.22)';
    ctx.lineWidth = 2.2 * scale;
    ctx.stroke();
    ctx.restore();

    // 2. Clean triangular datum lines connecting A - R - C
    ctx.strokeStyle = 'rgba(228, 234, 242, 0.20)';
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    ctx.moveTo(letters[0].x, letters[0].y);
    ctx.lineTo(letters[1].x, letters[1].y);
    ctx.lineTo(letters[2].x, letters[2].y);
    ctx.closePath();
    ctx.stroke();

    // 3. Precision dark backing medallions + deterministic vector glyphs for A, R, C
    const drawPrecisionGlyph = (char: string, gx: number, gy: number) => {
      // Dark matte contrast disc behind each letter
      ctx.beginPath();
      ctx.arc(gx, gy, 88 * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(7, 9, 13, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(225, 232, 242, 0.26)';
      ctx.lineWidth = 1.8 * scale;
      ctx.stroke();

      ctx.save();
      ctx.strokeStyle = '#f2f5fa';
      ctx.fillStyle = '#f2f5fa';
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 6;
      const sw = 21 * scale; // crisp structural stroke width
      ctx.lineWidth = sw;
      const h = 58 * scale; // half height of glyph
      const w = 44 * scale; // half width of glyph

      if (char === 'A') {
        // Crisp geometric 'A' with wide open apex and clear crossbar
        ctx.beginPath();
        ctx.moveTo(gx - w, gy + h);
        ctx.lineTo(gx, gy - h);
        ctx.lineTo(gx + w, gy + h);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = sw * 0.85;
        ctx.moveTo(gx - w * 0.56, gy + h * 0.24);
        ctx.lineTo(gx + w * 0.56, gy + h * 0.24);
        ctx.stroke();
      } else if (char === 'R') {
        // Precision engineered 'R' with unmistakable open upper bowl counter and distinct angled leg
        const leftX = gx - w * 0.88;
        const bowlRightX = gx + w * 0.42;
        const midY = gy + 2 * scale;
        const bowlRadius = (h + 2 * scale) * 0.5;
        const bowlCenterY = gy - h + bowlRadius;

        // Vertical stem + upper bowl loop (leaving large, dark open counter inside)
        ctx.beginPath();
        ctx.moveTo(leftX, gy + h);
        ctx.lineTo(leftX, gy - h);
        ctx.lineTo(gx + w * 0.14, gy - h);
        ctx.arc(gx + w * 0.14, bowlCenterY, bowlRadius, -Math.PI / 2, Math.PI / 2, false);
        ctx.lineTo(leftX, midY);
        ctx.stroke();

        // Diagonal kick leg of 'R' clearly separated from the vertical stem
        ctx.beginPath();
        ctx.moveTo(gx + w * 0.04, midY);
        ctx.lineTo( bowlRightX + w * 0.46, gy + h);
        ctx.stroke();
      } else if (char === 'C') {
        // Crisp geometric 'C' with wide open right aperture
        ctx.beginPath();
        ctx.arc(gx + 4 * scale, gy, h * 0.94, 0.24 * Math.PI, 1.76 * Math.PI, false);
        ctx.stroke();
      }
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

