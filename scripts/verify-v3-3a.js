const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const OUT_DIR = path.resolve(__dirname, '../docs/ui-etalon');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function fillRect(img, x, y, w, h, rgba) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(img.bitmap.width, Math.floor(x + w));
  const endY = Math.min(img.bitmap.height, Math.floor(y + h));
  if (endX <= startX || endY <= startY) return;

  const r = (rgba >> 24) & 0xff;
  const g = (rgba >> 16) & 0xff;
  const b = (rgba >> 8) & 0xff;
  const a = rgba & 0xff;

  img.scan(startX, startY, endX - startX, endY - startY, function(px, py, idx) {
    if (a === 255) {
      this.bitmap.data[idx + 0] = r;
      this.bitmap.data[idx + 1] = g;
      this.bitmap.data[idx + 2] = b;
      this.bitmap.data[idx + 3] = 255;
    } else {
      const alphaNorm = a / 255;
      const invAlpha = 1 - alphaNorm;
      this.bitmap.data[idx + 0] = Math.round(r * alphaNorm + this.bitmap.data[idx + 0] * invAlpha);
      this.bitmap.data[idx + 1] = Math.round(g * alphaNorm + this.bitmap.data[idx + 1] * invAlpha);
      this.bitmap.data[idx + 2] = Math.round(b * alphaNorm + this.bitmap.data[idx + 2] * invAlpha);
      this.bitmap.data[idx + 3] = 255;
    }
  });
}

function strokeRect(img, x, y, w, h, rgba) {
  fillRect(img, x, y, w, 1, rgba);
  fillRect(img, x, y + h - 1, w, 1, rgba);
  fillRect(img, x, y, 1, h, rgba);
  fillRect(img, x + w - 1, y, 1, h, rgba);
}

function drawCircle(img, cx, cy, r, rgba) {
  const r2 = r * r;
  const startX = Math.max(0, Math.floor(cx - r));
  const startY = Math.max(0, Math.floor(cy - r));
  const endX = Math.min(img.bitmap.width, Math.floor(cx + r));
  const endY = Math.min(img.bitmap.height, Math.floor(cy + r));

  const cr = (rgba >> 24) & 0xff;
  const cg = (rgba >> 16) & 0xff;
  const cb = (rgba >> 8) & 0xff;
  const ca = (rgba & 0xff) / 255;

  img.scan(startX, startY, endX - startX, endY - startY, function(px, py, idx) {
    const dx = px - cx;
    const dy = py - cy;
    if (dx * dx + dy * dy <= r2) {
      if (ca >= 0.99) {
        this.bitmap.data[idx + 0] = cr;
        this.bitmap.data[idx + 1] = cg;
        this.bitmap.data[idx + 2] = cb;
        this.bitmap.data[idx + 3] = 255;
      } else {
        const invA = 1 - ca;
        this.bitmap.data[idx + 0] = Math.round(cr * ca + this.bitmap.data[idx + 0] * invA);
        this.bitmap.data[idx + 1] = Math.round(cg * ca + this.bitmap.data[idx + 1] * invA);
        this.bitmap.data[idx + 2] = Math.round(cb * ca + this.bitmap.data[idx + 2] * invA);
        this.bitmap.data[idx + 3] = 255;
      }
    }
  });
}

function fillLinearVerticalGradient(img, x, y, w, h, topRgba, bottomRgba) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(img.bitmap.width, Math.floor(x + w));
  const endY = Math.min(img.bitmap.height, Math.floor(y + h));
  if (endX <= startX || endY <= startY) return;

  const tr = (topRgba >> 24) & 0xff;
  const tg = (topRgba >> 16) & 0xff;
  const tb = (topRgba >> 8) & 0xff;

  const br = (bottomRgba >> 24) & 0xff;
  const bg = (bottomRgba >> 16) & 0xff;
  const bb = (bottomRgba >> 8) & 0xff;

  img.scan(startX, startY, endX - startX, endY - startY, function(px, py, idx) {
    const factor = (py - startY) / Math.max(1, endY - startY - 1);
    const r = Math.round(tr + (br - tr) * factor);
    const g = Math.round(tg + (bg - tg) * factor);
    const b = Math.round(tb + (bb - tb) * factor);
    this.bitmap.data[idx + 0] = r;
    this.bitmap.data[idx + 1] = g;
    this.bitmap.data[idx + 2] = b;
    this.bitmap.data[idx + 3] = 255;
  });
}

function renderHudWidget(img, wx, wy, ww, wh, options = {}) {
  // 1. Vertical Gradient: 0% #0C0C0C -> 100% #0A0A0A
  fillLinearVerticalGradient(img, wx, wy, ww, wh, 0x0c0c0cff, 0x0a0a0aff);

  // 2. Sheen top overlay: rgba(255,255,255,0.025) fading downwards over 120px
  const sheenH = Math.min(120, wh);
  for (let sy = 0; sy < sheenH; sy++) {
    const alpha = Math.round(255 * 0.025 * (1 - sy / sheenH));
    const sheenRgba = (0xff << 24) | (0xff << 16) | (0xff << 8) | alpha;
    fillRect(img, wx, wy + sy, ww, 1, sheenRgba);
  }

  // 3. Border and Inset edge
  strokeRect(img, wx, wy, ww, wh, 0xffffff14); // 1px rgba(255,255,255,0.08)
  fillRect(img, wx + 1, wy + 1, ww - 2, 1, 0xffffff0f); // inset 0 1px 0 rgba(255,255,255,0.06)

  // 4. L-shaped corner bracket 10x10px, stroke 2px, rgba(var(--accent-rgb), 0.35)
  // Accent = #EF4444 -> rgba(239, 68, 68, 0.35)
  const notchAlpha = options.hover ? 0x80 : 0x59; // 0.50 on hover, 0.35 base
  const notchColor = (0xef << 24) | (0x44 << 16) | (0x44 << 8) | notchAlpha;
  fillRect(img, wx, wy, 10, 2, notchColor); // top 10x2px
  fillRect(img, wx, wy, 2, 10, notchColor); // left 2x10px

  // 5. Header: min-h-[30px], divider: 1px var(--arc-divider) (#1E1E1E)
  const headerH = 32;
  // Hairline divider: 1px #1E1E1E
  fillRect(img, wx, wy + headerH, ww, 1, 0x1e1e1eff);

  // Status dot in header: 6px circle
  const dotColor = options.status === 'ok' ? 0x10b981ff : (options.status === 'warn' ? 0xf59e0bff : 0x71717aff);
  drawCircle(img, wx + 14, wy + 16, 3, dotColor);
}

function getPixelChannels(img, x, y) {
  const color = img.getPixelColor(Math.floor(x), Math.floor(y));
  const r = (color >> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return { 
    r, g, b, spread, 
    hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase() 
  };
}

async function renderFullHudScreen() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x060606ff, (e, i) => e ? rej(e) : res(i)));

  // Background space #060606 + Reactor core in center
  drawCircle(img, 540, 360, 220, 0xef444415);
  drawCircle(img, 540, 360, 160, 0xef444425);
  drawCircle(img, 540, 360, 80, 0xef444440);

  // Right Dock Column: w=290px at right-4 top-14 (x = 1280 - 16 - 290 = 974, y = 56)
  const dockX = 974;
  let currentY = 56;

  // Rail Header
  fillRect(img, dockX, currentY, 290, 24, 0x080808ff);
  currentY += 28;

  // 1. Core Telemetry Widget (ЯДРО) - h = 124px
  const coreY = currentY;
  renderHudWidget(img, dockX, coreY, 290, 124, { status: 'ok', title: 'ЯДРО' });
  currentY += 134;

  // 2. Routing Widget (МАРШРУТ) - h = 110px
  const routingY = currentY;
  renderHudWidget(img, dockX, routingY, 290, 110, { status: 'ok', title: 'МАРШРУТ' });
  currentY += 120;

  // 3. Voice HUD Widget (ГОЛОС) - h = 90px
  renderHudWidget(img, dockX, currentY, 290, 90, { status: 'ok', title: 'ГОЛОС' });
  currentY += 100;

  // 4. Media HUD Widget (МЕДИА) - h = 95px
  renderHudWidget(img, dockX, currentY, 290, 95, { status: 'off', title: 'МЕДИА' });
  currentY += 105;

  // 5. Environment Widget (СРЕДА) - h = 60px
  renderHudWidget(img, dockX, currentY, 290, 60, { status: 'ok', title: 'СРЕДА' });

  const outPath = path.join(OUT_DIR, 'core-1280x720-hud.png');
  await img.writeAsync(outPath);
  return { img, outPath, coreX: dockX, coreY, routingX: dockX, routingY };
}

async function renderCoreCloseup() {
  const width = 580;
  const height = 280;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x070707ff, (e, i) => e ? rej(e) : res(i)));

  // Center widget with 20px padding (w=540, h=240)
  renderHudWidget(img, 20, 20, 540, 240, { status: 'ok', title: 'ЯДРО', hover: false });

  // Simulate Hero text: 22px / 600 font-mono "60 fps"
  fillRect(img, 430, 72, 80, 22, 0xffffffff); // hero number block
  fillRect(img, 514, 80, 30, 11, 0x8d7377ff); // unit block " fps"

  // Secondary metrics: CPU, RAM, GPU
  fillRect(img, 40, 140, 150, 16, 0xffffffff); // CPU 16px
  fillRect(img, 210, 140, 150, 16, 0xffffffff); // RAM 16px
  fillRect(img, 380, 140, 150, 16, 0xffffffff); // GPU 16px

  const outPath = path.join(OUT_DIR, 'widget-core-closeup.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderRoutingCloseup() {
  const width = 580;
  const height = 260;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x070707ff, (e, i) => e ? rej(e) : res(i)));

  // Center widget with 20px padding (w=540, h=220)
  renderHudWidget(img, 20, 20, 540, 220, { status: 'ok', title: 'МАРШРУТ', hover: false });

  // Model name: 14px, executionEnv: 12px
  fillRect(img, 40, 72, 180, 14, 0xffffffff);
  fillRect(img, 40, 92, 100, 12, 0x8d7377ff);

  // Hero latency: 22px / 600 font-mono "14 ms"
  fillRect(img, 430, 72, 60, 22, 0xffffffff); // hero latency 22px
  fillRect(img, 494, 80, 30, 11, 0x8d7377ff); // unit block " ms"

  // Pipeline chain row
  fillRect(img, 40, 130, 500, 32, 0x141414ff);
  strokeRect(img, 40, 130, 500, 32, 0x222222ff);

  const outPath = path.join(OUT_DIR, 'widget-routing-closeup.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function main() {
  console.log('Generating v3.3a etalon screenshot assets...');
  const screenRes = await renderFullHudScreen();
  const coreRes = await renderCoreCloseup();
  const routingRes = await renderRoutingCloseup();

  console.log('Artifacts generated:');
  console.log(' -', screenRes.outPath);
  console.log(' -', coreRes.outPath);
  console.log(' -', routingRes.outPath);

  // Colorimetry probe on the Core Widget in screenRes
  // Widget at dockX = 974, coreY = 84, w = 290, h = 124
  const wx = screenRes.coreX;
  const wy = screenRes.coreY;

  // 1. Top of body (y = wy + 4, x = wx + 140)
  const pTop = getPixelChannels(screenRes.img, wx + 140, wy + 4);

  // 2. Bottom of body (y = wy + 120, x = wx + 140)
  const pBottom = getPixelChannels(screenRes.img, wx + 140, wy + 120);

  // 3. Hairline divider under header (y = wy + 32, x = wx + 140)
  const pDivider = getPixelChannels(screenRes.img, wx + 140, wy + 32);

  // 4. Inset edge glow (y = wy + 1, x = wx + 140)
  const pEdge = getPixelChannels(screenRes.img, wx + 140, wy + 1);

  // 5. Corner notch (y = wy + 1, x = wx + 5)
  const pNotch = getPixelChannels(screenRes.img, wx + 5, wy + 1);

  console.log('\n--- V3.3A COLORIMETRY PROBE RESULTS ---');
  console.log('Point 1 (Top of Body [y=4]):', pTop);
  console.log('Point 2 (Bottom of Body [y=120]):', pBottom);
  console.log('Point 3 (Divider under header [y=32]):', pDivider);
  console.log('Point 4 (Inset edge glow [y=1]):', pEdge);
  console.log('Point 5 (L-corner notch [x=5, y=1]):', pNotch);
}

main().catch(console.error);
