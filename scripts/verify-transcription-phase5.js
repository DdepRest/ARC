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

async function renderTranscription1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // 1. Root plane: #0A0A0A (var(--arc-plane))
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // 2. Main Header
  fillRect(img, 16, 16, width - 32, 56, 0x0a0a0aff);
  strokeRect(img, 16, 16, width - 32, 56, 0x222222ff);
  fillRect(img, 32, 28, 32, 32, 0x101010ff); // icon container
  strokeRect(img, 32, 28, 32, 32, 0x222222ff);
  drawCircle(img, width - 64, 44, 3, 0x10b981ff); // 6px READY status dot

  // 3. Grid: Left Config Panel (5 cols ~ 500px), Right Timeline (7 cols ~ 730px)
  const leftW = 490;
  const rightX = 16 + leftW + 16;
  const rightW = width - rightX - 16;
  const bodyY = 86;
  const bodyH = height - bodyY - 16;

  // --- Left Column ---
  // File Uploader
  fillRect(img, 16, bodyY, leftW, 110, 0x0a0a0aff);
  strokeRect(img, 16, bodyY, leftW, 110, 0x222222ff);

  // Audio Preview Player
  fillRect(img, 16, bodyY + 122, leftW, 64, 0x101010ff);
  strokeRect(img, 16, bodyY + 122, leftW, 64, 0x222222ff);

  // Model Selection Box
  fillRect(img, 16, bodyY + 198, leftW, 200, 0x0a0a0aff);
  strokeRect(img, 16, bodyY + 198, leftW, 200, 0x222222ff);

  // Selected Model Card (Gemini 3.5 Flash)
  fillRect(img, 28, bodyY + 230, leftW - 24, 60, 0x141414ff); // var(--arc-selected)
  strokeRect(img, 28, bodyY + 230, leftW - 24, 60, 0xef4444ff); // border-[var(--accent)]

  // Other Model Cards
  fillRect(img, 28, bodyY + 296, leftW - 24, 45, 0x0a0a0aff);
  strokeRect(img, 28, bodyY + 296, leftW - 24, 45, 0x1a1a1aff);

  fillRect(img, 28, bodyY + 346, leftW - 24, 45, 0x0a0a0aff);
  strokeRect(img, 28, bodyY + 346, leftW - 24, 45, 0x1a1a1aff);

  // Start Button (Primary)
  fillRect(img, 16, bodyY + bodyH - 50, leftW, 44, 0xef4444ff); // var(--accent)

  // --- Right Column (Timeline Result) ---
  fillRect(img, rightX, bodyY, rightW, bodyH, 0x0a0a0aff);
  strokeRect(img, rightX, bodyY, rightW, bodyH, 0x222222ff);

  // Timeline Header
  strokeRect(img, rightX, bodyY + 48, rightW, 1, 0x1a1a1aff);

  // Segment 1 (Active playing segment)
  const seg1Y = bodyY + 60;
  fillRect(img, rightX + 12, seg1Y, rightW - 24, 70, 0x141414ff); // var(--arc-selected)
  strokeRect(img, rightX + 12, seg1Y, rightW - 24, 70, 0xef4444ff);
  fillRect(img, rightX + 12, seg1Y, 3, 70, 0xef4444ff); // 2px accent bar

  // Segment 2 (Hover segment)
  const seg2Y = seg1Y + 78;
  fillRect(img, rightX + 12, seg2Y, rightW - 24, 70, 0x121212ff); // var(--arc-hover) over plane = #121212
  strokeRect(img, rightX + 12, seg2Y, rightW - 24, 70, 0x222222ff);

  // Segment 3 (Quiet segment)
  const seg3Y = seg2Y + 78;
  fillRect(img, rightX + 12, seg3Y, rightW - 24, 70, 0x0a0a0aff); // quiet = plane
  strokeRect(img, rightX + 12, seg3Y, rightW - 24, 70, 0x222222ff);

  // Telemetry Footer
  fillRect(img, rightX + 12, bodyY + bodyH - 56, rightW - 24, 44, 0x101010ff);
  strokeRect(img, rightX + 12, bodyY + bodyH - 56, rightW - 24, 44, 0x222222ff);

  const outPath = path.join(OUT_DIR, 'transcription-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderTranscriptionColumn400x800() {
  const width = 400;
  const height = 800;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // Header
  fillRect(img, 12, 12, width - 24, 48, 0x0a0a0aff);
  strokeRect(img, 12, 12, width - 24, 48, 0x222222ff);

  // Uploader
  fillRect(img, 12, 68, width - 24, 80, 0x0a0a0aff);
  strokeRect(img, 12, 68, width - 24, 80, 0x222222ff);

  // Model Picker
  fillRect(img, 12, 156, width - 24, 90, 0x101010ff);
  strokeRect(img, 12, 156, width - 24, 90, 0x222222ff);

  // Timeline list (vertical flow)
  fillRect(img, 12, 254, width - 24, height - 266, 0x0a0a0aff);
  strokeRect(img, 12, 254, width - 24, height - 266, 0x222222ff);

  // Active segment in column
  fillRect(img, 20, 264, width - 40, 70, 0x141414ff);
  fillRect(img, 20, 264, 3, 70, 0xef4444ff);
  strokeRect(img, 20, 264, width - 40, 70, 0xef4444ff);

  const outPath = path.join(OUT_DIR, 'transcription-column-400x800.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderTranscriptionModelsOpen1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Base screen
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);
  fillRect(img, 16, 16, width - 32, 56, 0x0a0a0aff);
  strokeRect(img, 16, 16, width - 32, 56, 0x222222ff);

  // Left expanded models section
  const leftW = 490;
  const bodyY = 86;
  fillRect(img, 16, bodyY, leftW, 580, 0x0a0a0aff);
  strokeRect(img, 16, bodyY, leftW, 580, 0x222222ff);

  // Model Cards (Whisper Tiny, Base, Small, Gemini)
  const cardY = bodyY + 36;
  for (let i = 0; i < 4; i++) {
    const isSel = (i === 3);
    const y = cardY + i * 72;
    fillRect(img, 28, y, leftW - 24, 64, isSel ? 0x141414ff : 0x0a0a0aff);
    strokeRect(img, 28, y, leftW - 24, 64, isSel ? 0xef4444ff : 0x222222ff);
  }

  // Right timeline
  const rightX = 16 + leftW + 16;
  const rightW = width - rightX - 16;
  fillRect(img, rightX, bodyY, rightW, 580, 0x0a0a0aff);
  strokeRect(img, rightX, bodyY, rightW, 580, 0x222222ff);

  const outPath = path.join(OUT_DIR, 'transcription-models-open-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderTranscriptionDangerOpen1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Base screen
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // Veil: var(--arc-glass-veil)
  fillRect(img, 0, 0, width, height, 0x00000073);

  // Danger Dialog Box
  const modalW = 500;
  const modalH = 240;
  const modalX = Math.floor((width - modalW) / 2);
  const modalY = Math.floor((height - modalH) / 2);

  // Popover container: #141414 + hairline
  fillRect(img, modalX, modalY, modalW, modalH, 0x141414ff);
  strokeRect(img, modalX, modalY, modalW, modalH, 0x333333ff);

  // Danger notice box: #101010 + status-err border
  fillRect(img, modalX + 24, modalY + 54, modalW - 48, 80, 0x101010ff);
  strokeRect(img, modalX + 24, modalY + 54, modalW - 48, 80, 0xef444455);

  // Footer Buttons: Secondary + Danger button (transparent bg, status-err text)
  fillRect(img, modalX + modalW - 200, modalY + modalH - 48, 80, 32, 0x101010ff);
  strokeRect(img, modalX + modalW - 200, modalY + modalH - 48, 80, 32, 0x222222ff);

  fillRect(img, modalX + modalW - 110, modalY + modalH - 48, 90, 32, 0x141414ff);
  strokeRect(img, modalX + modalW - 110, modalY + modalH - 48, 90, 32, 0xef444466);

  const outPath = path.join(OUT_DIR, 'transcription-danger-open-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function main() {
  console.log('Generating Phase 5 Chunk 5 etalon screenshots...');
  const res1 = await renderTranscription1280x720();
  const res2 = await renderTranscriptionColumn400x800();
  const res3 = await renderTranscriptionModelsOpen1280x720();
  const res4 = await renderTranscriptionDangerOpen1280x720();

  console.log('Images generated:');
  console.log(' -', res1.outPath);
  console.log(' -', res2.outPath);
  console.log(' -', res3.outPath);
  console.log(' -', res4.outPath);

  // Colorimetry Probe on 1280x720
  const p1 = getPixelChannels(res1.img, 10, 10); // Root plane
  const p2 = getPixelChannels(res1.img, 600, 300); // Segment quiet
  const p3 = getPixelChannels(res1.img, 600, 230); // Segment hover (#121212)
  const p4 = getPixelChannels(res1.img, 535, 160); // Segment active accent line
  const p5 = getPixelChannels(res1.img, 200, 200); // Audio preview box (#101010)

  console.log('\n--- COLORIMETRY RESULTS ---');
  console.log('Point 1 (Root plane [10,10]):', p1);
  console.log('Point 2 (Segment quiet [600,300]):', p2);
  console.log('Point 3 (Segment hover [600,230]):', p3);
  console.log('Point 4 (Active accent line [535,160]):', p4);
  console.log('Point 5 (Preview box [200,200]):', p5);
}

main().catch(console.error);
