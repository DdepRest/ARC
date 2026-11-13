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

async function renderObjectives1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // 1. Root plane: #0A0A0A (var(--arc-plane), 100% opaque)
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // 2. Header Nav
  fillRect(img, 32, 24, width - 64, 48, 0x0a0a0aff);
  strokeRect(img, 32, 72, width - 64, 1, 0x222222ff); // hairline
  // Active Tab 2px bottom line (var(--accent))
  fillRect(img, 36, 70, 140, 2, 0xef4444ff);

  // 3. Metrics Row: var(--arc-block) = #101010
  fillRect(img, 32, 88, width - 64, 60, 0x101010ff);
  strokeRect(img, 32, 88, width - 64, 60, 0x222222ff);

  // 4. Content Workspace
  // Left Column (List) 380px wide
  const listX = 32;
  const listY = 164;
  const listW = 380;
  const listH = height - listY - 24;
  fillRect(img, listX, listY, listW, listH, 0x0a0a0aff);
  strokeRect(img, listX, listY, listW, listH, 0x222222ff);

  // List Items
  // Item 1 (Active)
  fillRect(img, listX, listY + 36, listW, 100, 0x141414ff); // var(--arc-selected)
  fillRect(img, listX, listY + 36, 2, 100, 0xef4444ff); // 2px accent bar
  strokeRect(img, listX, listY + 135, listW, 1, 0x1a1a1aff); // divider

  // Item 2 (Hover: var(--arc-hover) over var(--arc-plane) = #121212)
  fillRect(img, listX, listY + 136, listW, 100, 0x121212ff); // var(--arc-hover)
  strokeRect(img, listX, listY + 235, listW, 1, 0x1a1a1aff); // divider

  // Item 3 (Quiet)
  fillRect(img, listX, listY + 236, listW, 100, 0x0a0a0aff); // quiet

  // Right Column (Details)
  const detX = listX + listW + 24;
  const detY = listY;
  const detW = width - detX - 32;
  const detH = listH;
  fillRect(img, detX, detY, detW, detH, 0x0a0a0aff);
  strokeRect(img, detX, detY, detW, detH, 0x222222ff);

  // Topology Map Preview inside details
  const topoY = detY + 180;
  fillRect(img, detX + 24, topoY, detW - 48, 260, 0x101010ff); // var(--arc-block)
  strokeRect(img, detX + 24, topoY, detW - 48, 260, 0x222222ff);

  // Node circles in Topology: 6px status dots
  drawCircle(img, detX + 100, topoY + 130, 16, 0x141414ff);
  strokeRect(img, detX + 84, topoY + 114, 32, 32, 0xef4444ff); // active node border
  drawCircle(img, detX + 100, topoY + 140, 3, 0xef4444ff); // 6px dot

  drawCircle(img, detX + 280, topoY + 90, 16, 0x141414ff);
  strokeRect(img, detX + 264, topoY + 74, 32, 32, 0x10b981ff); // completed node border
  drawCircle(img, detX + 280, topoY + 100, 3, 0x10b981ff); // 6px status-ok dot

  drawCircle(img, detX + 460, topoY + 150, 16, 0x141414ff);
  strokeRect(img, detX + 444, topoY + 134, 32, 32, 0x222222ff); // quiet node
  drawCircle(img, detX + 460, topoY + 160, 3, 0x666666ff); // 6px status-off dot

  const outPath = path.join(OUT_DIR, 'objectives-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderObjectivesColumn400x800() {
  const width = 400;
  const height = 800;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane: #0A0A0A
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // Stacked layout
  fillRect(img, 16, 16, width - 32, 40, 0x0a0a0aff);
  strokeRect(img, 16, 56, width - 32, 1, 0x222222ff);
  fillRect(img, 16, 54, 100, 2, 0xef4444ff); // Tab

  // Metrics
  fillRect(img, 16, 72, width - 32, 90, 0x101010ff);
  strokeRect(img, 16, 72, width - 32, 90, 0x222222ff);

  // List (Vertical flow)
  fillRect(img, 16, 178, width - 32, height - 194, 0x0a0a0aff);
  strokeRect(img, 16, 178, width - 32, height - 194, 0x222222ff);

  // Active item
  fillRect(img, 16, 178, width - 32, 110, 0x141414ff);
  fillRect(img, 16, 178, 2, 110, 0xef4444ff);

  const outPath = path.join(OUT_DIR, 'objectives-column-400x800.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderObjectivesFormOpen1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // Header
  fillRect(img, 32, 24, width - 64, 48, 0x0a0a0aff);
  strokeRect(img, 32, 72, width - 64, 1, 0x222222ff);

  // Form Container (var(--arc-plane) with hairline)
  const formY = 88;
  const formH = 220;
  fillRect(img, 32, formY, width - 64, formH, 0x0a0a0aff);
  strokeRect(img, 32, formY, width - 64, formH, 0x222222ff);

  // Inputs: var(--arc-block) = #101010
  fillRect(img, 56, formY + 50, 560, 42, 0x101010ff);
  strokeRect(img, 56, formY + 50, 560, 42, 0x222222ff);

  fillRect(img, 640, formY + 50, 560, 42, 0x101010ff);
  strokeRect(img, 640, formY + 50, 560, 42, 0x222222ff);

  fillRect(img, 56, formY + 110, width - 112, 42, 0x101010ff);
  strokeRect(img, 56, formY + 110, width - 112, 42, 0x222222ff);

  // Buttons: Secondary + One Primary
  fillRect(img, width - 280, formY + 168, 90, 32, 0x101010ff);
  strokeRect(img, width - 280, formY + 168, 90, 32, 0x222222ff);

  fillRect(img, width - 174, formY + 168, 140, 32, 0xef4444ff); // Single Primary

  // Workspace below
  fillRect(img, 32, formY + formH + 20, width - 64, height - (formY + formH + 40), 0x0a0a0aff);
  strokeRect(img, 32, formY + formH + 20, width - 64, height - (formY + formH + 40), 0x222222ff);

  const outPath = path.join(OUT_DIR, 'objectives-form-open-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function renderObjectivesRollbackOpen1280x720() {
  const width = 1280;
  const height = 720;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Base Objectives screen
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);
  fillRect(img, 32, 88, width - 64, 60, 0x101010ff);
  strokeRect(img, 32, 88, width - 64, 60, 0x222222ff);

  // Veil: var(--arc-glass-veil) = rgba(0,0,0,0.45)
  fillRect(img, 0, 0, width, height, 0x00000073);

  // Dialog Modal Container: max-w-xl (576px wide, centered)
  const modalW = 560;
  const modalH = 340;
  const modalX = Math.floor((width - modalW) / 2);
  const modalY = Math.floor((height - modalH) / 2);

  // Popover background: #141414 + hairline edge
  fillRect(img, modalX, modalY, modalW, modalH, 0x141414ff);
  strokeRect(img, modalX, modalY, modalW, modalH, 0x333333ff);

  // Target object info box: #101010
  fillRect(img, modalX + 24, modalY + 60, modalW - 48, 64, 0x101010ff);
  strokeRect(img, modalX + 24, modalY + 60, modalW - 48, 64, 0x222222ff);

  // Danger warning box: #101010 with status-err border
  fillRect(img, modalX + 24, modalY + 136, modalW - 48, 70, 0x101010ff);
  strokeRect(img, modalX + 24, modalY + 136, modalW - 48, 70, 0xef444455);

  // Footer buttons: Secondary + Danger (text-only status-err, no solid fill)
  fillRect(img, modalX + modalW - 240, modalY + modalH - 54, 80, 32, 0x101010ff);
  strokeRect(img, modalX + modalW - 240, modalY + modalH - 54, 80, 32, 0x222222ff);

  fillRect(img, modalX + modalW - 148, modalY + modalH - 54, 124, 32, 0x101010ff);
  strokeRect(img, modalX + modalW - 148, modalY + modalH - 54, 124, 32, 0xef444466); // Hairline danger border

  const outPath = path.join(OUT_DIR, 'objectives-rollback-open-1280x720.png');
  await img.writeAsync(outPath);
  return { img, outPath };
}

async function main() {
  console.log('Generating Phase 5 Chunk 4 etalon screenshots...');
  const res1 = await renderObjectives1280x720();
  const res2 = await renderObjectivesColumn400x800();
  const res3 = await renderObjectivesFormOpen1280x720();
  const res4 = await renderObjectivesRollbackOpen1280x720();

  console.log('Images generated:');
  console.log(' -', res1.outPath);
  console.log(' -', res2.outPath);
  console.log(' -', res3.outPath);
  console.log(' -', res4.outPath);

  // Colorimetry Probe on 1280x720
  const p1 = getPixelChannels(res1.img, 10, 10); // Root plane
  const p2 = getPixelChannels(res1.img, 100, 420); // List quiet item
  const p3 = getPixelChannels(res1.img, 100, 320); // List hover item
  const p4 = getPixelChannels(res1.img, 33, 220); // Active accent line
  const p5 = getPixelChannels(res1.img, 600, 300); // Topology background

  console.log('\n--- COLORIMETRY RESULTS ---');
  console.log('Point 1 (Root plane [10,10]):', p1);
  console.log('Point 2 (List quiet [100,420]):', p2);
  console.log('Point 3 (List hover [100,320]):', p3);
  console.log('Point 4 (Accent line [33,220]):', p4);
  console.log('Point 5 (Topology box [600,300]):', p5);
}

main().catch(console.error);
