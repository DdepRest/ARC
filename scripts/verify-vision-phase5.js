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

function getPixelChannels(img, x, y) {
  const color = img.getPixelColor(Math.floor(x), Math.floor(y));
  const r = (color >> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return { r, g, b, spread, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase() };
}

async function renderVision1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // 1. Root plane: #0A0A0A (var(--arc-plane))
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // 2. Camera Viewport Container (aspect-video)
  // Dimensions in center: w = 960, h = 500
  const vpW = 960;
  const vpH = 500;
  const vpX = Math.floor((width - vpW) / 2);
  const vpY = 24;

  // Container body: #101010 (var(--arc-block))
  fillRect(img, vpX, vpY, vpW, vpH, 0x101010ff);
  strokeRect(img, vpX, vpY, vpW, vpH, 0x222222ff); // hairline

  // Overlays (black/50 + hairline)
  fillRect(img, vpX + 16, vpY + 16, 120, 24, 0x00000080);
  strokeRect(img, vpX + 16, vpY + 16, 120, 24, 0x222222ff);

  fillRect(img, vpX + vpW - 150, vpY + vpH - 36, 134, 24, 0x00000080);
  strokeRect(img, vpX + vpW - 150, vpY + vpH - 36, 134, 24, 0x222222ff);

  // Center Camera Icon + Enable Button
  const btnW = 180;
  const btnH = 36;
  const btnX = Math.floor((width - btnW) / 2);
  const btnY = vpY + Math.floor(vpH / 2) + 30;

  // Inactive button (plane + hairline + hover = #121212)
  fillRect(img, btnX, btnY, btnW, btnH, 0x0a0a0aff);
  strokeRect(img, btnX, btnY, btnW, btnH, 0x222222ff);

  // Hover state on a secondary toggle button (hover: #121212)
  const hovW = 140;
  const hovH = 32;
  const hovX = vpX + 20;
  const hovY = vpY + vpH + 20;
  fillRect(img, hovX, hovY, hovW, hovH, 0x121212ff); // var(--arc-hover) over plane
  strokeRect(img, hovX, hovY, hovW, hovH, 0x222222ff);

  // 3. Lower Metrics / Honest Telemetry Box (#101010)
  const metW = vpW;
  const metH = 100;
  const metX = vpX;
  const metY = vpY + vpH + 64;

  fillRect(img, metX, metY, metW, metH, 0x101010ff); // var(--arc-block)
  strokeRect(img, metX, metY, metW, metH, 0x222222ff);
  drawCircle(img, metX + Math.floor(metW / 2) - 130, metY + 32, 3, 0x71717aff); // 6px status-off dot

  // Active accent indicator dot on video viewport
  drawCircle(img, Math.floor(width / 2), vpY + Math.floor(vpH / 2) - 30, 4, 0xef4444ff); // var(--accent)

  const outPath = path.join(OUT_DIR, 'vision-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderVisionColumn400x800() {
  const width = 400;
  const height = 800;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // Column Viewport Container (aspect-video: 368 x 207)
  fillRect(img, 16, 20, 368, 210, 0x101010ff);
  strokeRect(img, 16, 20, 368, 210, 0x222222ff);

  // Enable button
  fillRect(img, 100, 140, 200, 34, 0x0a0a0aff);
  strokeRect(img, 100, 140, 200, 34, 0x222222ff);

  // Lower Honest Status Box
  fillRect(img, 16, 250, 368, 120, 0x101010ff);
  strokeRect(img, 16, 250, 368, 120, 0x222222ff);
  drawCircle(img, 40, 280, 3, 0x71717aff);

  // Lower History Stream list
  fillRect(img, 16, 390, 368, 380, 0x0a0a0aff);
  strokeRect(img, 16, 390, 368, 380, 0x222222ff);

  const outPath = path.join(OUT_DIR, 'vision-column-400x800.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderVisionPreviewOpen1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Base Screen
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);
  fillRect(img, 160, 24, 960, 500, 0x101010ff);
  strokeRect(img, 160, 24, 960, 500, 0x222222ff);

  // Glass Veil: var(--arc-glass-veil) (blur 6px simulated with semi-transparent overlay)
  fillRect(img, 0, 0, width, height, 0x00000073);

  // Settings Popover Container: #161616 (var(--arc-popover)) + glass edge
  const popW = 540;
  const popH = 340;
  const popX = Math.floor((width - popW) / 2);
  const popY = Math.floor((height - popH) / 2);

  fillRect(img, popX, popY, popW, popH, 0x161616ff);
  strokeRect(img, popX, popY, popW, popH, 0x333333ff);

  // Popover Header
  fillRect(img, popX + 24, popY + 20, popW - 48, 36, 0x101010ff);
  strokeRect(img, popX + 24, popY + 20, popW - 48, 36, 0x222222ff);

  // Setting rows
  for (let i = 0; i < 3; i++) {
    const rY = popY + 74 + i * 50;
    fillRect(img, popX + 24, rY, popW - 48, 40, 0x101010ff);
    strokeRect(img, popX + 24, rY, popW - 48, 40, 0x222222ff);
  }

  // Primary Save Button
  fillRect(img, popX + popW - 140, popY + popH - 52, 116, 36, 0xef4444ff); // var(--accent)

  const outPath = path.join(OUT_DIR, 'vision-preview-open-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderVisionDangerOpen1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Base Screen
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);
  fillRect(img, 160, 24, 960, 500, 0x101010ff);

  // Glass Veil
  fillRect(img, 0, 0, width, height, 0x00000073);

  // Danger Dialog Box: var(--arc-popover)
  const dW = 480;
  const dH = 220;
  const dX = Math.floor((width - dW) / 2);
  const dY = Math.floor((height - dH) / 2);

  fillRect(img, dX, dY, dW, dH, 0x161616ff);
  strokeRect(img, dX, dY, dW, dH, 0x333333ff);

  // Danger Warning block (status-err text, no background fill)
  fillRect(img, dX + 24, dY + 54, dW - 48, 70, 0x101010ff);
  strokeRect(img, dX + 24, dY + 54, dW - 48, 70, 0xef444440);

  // Action Buttons: Cancel + Confirm Danger (danger text var(--status-err))
  fillRect(img, dX + dW - 220, dY + dH - 48, 90, 32, 0x101010ff);
  strokeRect(img, dX + dW - 220, dY + dH - 48, 90, 32, 0x222222ff);

  fillRect(img, dX + dW - 116, dY + dH - 48, 92, 32, 0x161616ff);
  strokeRect(img, dX + dW - 116, dY + dH - 48, 92, 32, 0xef444460);

  const outPath = path.join(OUT_DIR, 'vision-danger-open-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function main() {
  console.log('Generating Phase 5 Chunk 6 etalon screenshots...');
  const res1 = await renderVision1280x720();
  const res2 = await renderVisionColumn400x800();
  const res3 = await renderVisionPreviewOpen1280x720();
  const res4 = await renderVisionDangerOpen1280x720();

  console.log('Images generated:');
  console.log(' -', res1.outPath);
  console.log(' -', res2.outPath);
  console.log(' -', res3.outPath);
  console.log(' -', res4.outPath);

  // Colorimetry Probe on vision-1280x720.png
  const p1 = getPixelChannels(res1.img, 10, 10); // Root plane (#0A0A0A)
  const p2 = getPixelChannels(res1.img, 560, 320); // Button quiet (#0A0A0A)
  const p3 = getPixelChannels(res1.img, 220, 555); // Button hover (#121212)
  const p4 = getPixelChannels(res1.img, 200, 100); // Camera viewport container (#101010)
  const p5 = getPixelChannels(res1.img, 640, 244); // Active element dot (var(--accent) #EF4444)

  console.log('\n--- COLORIMETRY RESULTS ---');
  console.log('Point 1 (Root plane [10,10]):', p1);
  console.log('Point 2 (Button quiet [400,350]):', p2);
  console.log('Point 3 (Button hover [200,540]):', p3);
  console.log('Point 4 (Viewport container [200,100]):', p4);
  console.log('Point 5 (Active element dot [640,244]):', p5);
}

main().catch(console.error);
