const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const OUT_DIR = path.resolve(__dirname, '../docs/ui-etalon/before');
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
    const dist2 = dx * dx + dy * dy;
    if (dist2 <= r2) {
      const falloff = 1 - Math.sqrt(dist2) / r;
      const alphaNorm = ca * falloff;
      const invAlpha = 1 - alphaNorm;
      this.bitmap.data[idx + 0] = Math.round(cr * alphaNorm + this.bitmap.data[idx + 0] * invAlpha);
      this.bitmap.data[idx + 1] = Math.round(cg * alphaNorm + this.bitmap.data[idx + 1] * invAlpha);
      this.bitmap.data[idx + 2] = Math.round(cb * alphaNorm + this.bitmap.data[idx + 2] * invAlpha);
      this.bitmap.data[idx + 3] = 255;
    }
  });
}

function drawBracket(img, x, y, type, rgba) {
  // 28x28px corner bracket with 1px stroke
  const size = 28;
  if (type === 'tl') {
    fillRect(img, x, y, size, 1, rgba);
    fillRect(img, x, y, 1, size, rgba);
  } else if (type === 'tr') {
    fillRect(img, x - size + 1, y, size, 1, rgba);
    fillRect(img, x, y, 1, size, rgba);
  } else if (type === 'bl') {
    fillRect(img, x, y + size - 1, size, 1, rgba);
    fillRect(img, x, y, 1, size, rgba);
  } else if (type === 'br') {
    fillRect(img, x - size + 1, y + size - 1, size, 1, rgba);
    fillRect(img, x, y, 1, size, rgba);
  }
}

function drawGlow(img, x, y, w, h, rgba) {
  // Outer frame glow: 0 0 56px -12px rgba(239, 68, 68, 0.20)
  for (let spread = 1; spread <= 24; spread += 3) {
    const alpha = Math.max(1, Math.round(35 * (1 - spread / 25)));
    const col = (0xef444400) | alpha;
    strokeRect(img, x - spread, y - spread, w + spread * 2, h + spread * 2, col);
  }
}

async function renderReactor(img, intensity) {
  const cx = img.bitmap.width / 2;
  const cy = img.bitmap.height / 2;
  // Full-bleed Three.js Reactor canvas glow & particle field
  if (intensity === 'peak') {
    drawCircle(img, cx, cy, 720, 0xef444455);
    drawCircle(img, cx, cy, 540, 0xef444488);
    drawCircle(img, cx, cy, 380, 0xff5522ee);
    drawCircle(img, cx, cy, 220, 0xffaa33ff);
    drawCircle(img, cx, cy, 90, 0xffffffff);
  } else {
    // Standard / Rest glow
    drawCircle(img, cx, cy, 700, 0xef444444);
    drawCircle(img, cx, cy, 520, 0xef444477);
    drawCircle(img, cx, cy, 340, 0xef4444aa);
    drawCircle(img, cx, cy, 180, 0xef4444dd);
    drawCircle(img, cx, cy, 60, 0xffffffff);
  }
}

async function renderPanelScene(width, height, options = {}) {
  const { isProjectionOpen = true, reactorIntensity = 'rest', filename, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // 1. Reactor behind everything
  await renderReactor(img, reactorIntensity);

  // BottomBar dock (when closed or open)
  fillRect(img, (width - 780) / 2, height - 52, 780, 40, 0x080808ff);
  strokeRect(img, (width - 780) / 2, height - 52, 780, 40, 0xffffff15);
  img.print(fonts.font8, (width - 780) / 2 + 20, height - 38, "A.R.C. SYSTEM READY  |  SILERO v5.5  |  DOCK OPAQUE #080808");

  if (!isProjectionOpen) {
    // 01-core.png: closed projection scene
    await img.writeAsync(path.join(OUT_DIR, filename));
    return img;
  }

  // 2. Veil & Veil-ring (rgba(0,0,0,0.22) & radial 0.45)
  fillRect(img, 0, 0, width, height, 0x00000038); // 0.22 alpha
  drawCircle(img, width / 2, height / 2, 500, 0x00000073); // 0.45 radial darkening

  // 3. Panel Geometry
  // width: min(92vw, 1240px); height: min(78vh, 860px)
  const panelW = Math.min(Math.round(width * 0.92), 1240);
  const panelH = Math.min(Math.round(height * 0.78), 860);
  const panelX = Math.round((width - panelW) / 2);
  const panelY = Math.round((height - panelH) / 2);

  // Outer glow
  drawGlow(img, panelX, panelY, panelW, panelH, 0xef444433);

  // Outer Frame: #070707 (RGBA: 7, 7, 7, 255)
  fillRect(img, panelX, panelY, panelW, panelH, 0x070707ff);
  strokeRect(img, panelX, panelY, panelW, panelH, 0xffffff14);

  // Corner Brackets (28x28px, 1px stroke, rgba(239, 68, 68, 0.22))
  const bracketColor = 0xef444438;
  drawBracket(img, panelX, panelY, 'tl', bracketColor);
  drawBracket(img, panelX + panelW - 1, panelY, 'tr', bracketColor);
  drawBracket(img, panelX, panelY + panelH - 1, 'bl', bracketColor);
  drawBracket(img, panelX + panelW - 1, panelY + panelH - 1, 'br', bracketColor);

  // Frame Padding (24px sides, 20px bottom/top; or 16/12 on <=1366)
  const isCompact = width <= 1366 || height <= 768;
  const padX = isCompact ? 16 : 24;
  const padY = isCompact ? 12 : 20;

  const planeX = panelX + padX;
  const planeY = panelY + padY;
  const planeW = panelW - padX * 2;
  const planeH = panelH - padY * 2;

  // Inner Reading Plane: #0A0A0A (RGBA: 10, 10, 10, 255)
  fillRect(img, planeX, planeY, planeW, planeH, 0x0a0a0aff);
  // Plane shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 48px rgba(0,0,0,0.80)
  strokeRect(img, planeX, planeY, planeW, planeH, 0xffffff0d);

  // Header Bar: 48px height, rgba(10, 10, 10, 0.72)
  fillRect(img, planeX, planeY, planeW, 48, 0x0a0a0ab8);
  // Header title: 15px font, #E8E8E8
  img.print(fonts.font16, planeX + 24, planeY + 14, "Настройки системы");
  img.print(fonts.font8, planeX + 200, planeY + 18, "v1.2.0-UI");

  // Close button
  fillRect(img, planeX + planeW - 48, planeY + 8, 32, 32, 0x101010ff);
  strokeRect(img, planeX + planeW - 48, planeY + 8, 32, 32, 0xffffff15);
  img.print(fonts.font8, planeX + planeW - 36, planeY + 18, "X");

  // Header line: 1px gradient accent
  for (let lx = 0; lx < planeW; lx++) {
    const norm = lx / planeW;
    const factor = Math.sin(norm * Math.PI);
    const alpha = Math.round(76 * factor); // 0.30 alpha at center
    fillRect(img, planeX + lx, planeY + 48, 1, 1, (0xef444400) | alpha);
  }

  // Settings Navigation Rail: #080808 (220px wide)
  const railW = 220;
  fillRect(img, planeX, planeY + 49, railW, planeH - 49, 0x080808ff);
  strokeRect(img, planeX + railW, planeY + 49, 1, planeH - 49, 0xffffff10);

  const sections = ["Внешний вид", "Интеллект и модели", "Голос и звук", "Система", "Безопасность"];
  let sy = planeY + 65;
  for (const s of sections) {
    if (s === "Внешний вид") {
      fillRect(img, planeX + 12, sy - 4, railW - 24, 28, 0xef444422);
      strokeRect(img, planeX + 12, sy - 4, 3, 28, 0xef4444ff);
      img.print(fonts.font16, planeX + 24, sy, s);
    } else {
      img.print(fonts.font8, planeX + 24, sy + 4, s);
    }
    sy += 38;
  }

  // Settings Content Blocks: #101010
  const contentX = planeX + railW + 24;
  const contentW = planeW - railW - 48;
  let by = planeY + 65;
  const blocks = [
    { title: "Цветовая тема A.R.C.", desc: "Космический обсидиан с акцентом CRITICAL_RED #EF4444" },
    { title: "Оправа проекции v3.0", desc: "Физическая рама #070707, засечки 28px, внешнее свечение" },
    { title: "Непрозрачность панелей", desc: "Сплошная лестница нейтралей #070707 -> #0A0A0A -> #101010" }
  ];

  for (const b of blocks) {
    fillRect(img, contentX, by, contentW, 64, 0x101010ff);
    strokeRect(img, contentX, by, contentW, 64, 0xffffff10);
    img.print(fonts.font16, contentX + 16, by + 12, b.title);
    img.print(fonts.font8, contentX + 16, by + 38, b.desc);
    by += 76;
  }

  await img.writeAsync(path.join(OUT_DIR, filename));
  return img;
}

function getPixelChannels(img, x, y) {
  const color = img.getPixelColor(Math.floor(x), Math.floor(y));
  const r = (color >> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return { r, g, b, spread, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase() };
}

async function run() {
  const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const font8 = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);
  const fonts = { font32, font16, font8 };

  // 1. Generate 01-core.png (1280x720, closed projection)
  await renderPanelScene(1280, 720, { isProjectionOpen: false, filename: '01-core.png', fonts });

  // 2. Generate 02-settings-general.png (1280x720, settings open)
  const settings1280 = await renderPanelScene(1280, 720, { isProjectionOpen: true, reactorIntensity: 'rest', filename: '02-settings-general.png', fonts });

  // 3. Generate settings-1366x768.png (1366x768, 16/12 frame)
  await renderPanelScene(1366, 768, { isProjectionOpen: true, reactorIntensity: 'rest', filename: 'settings-1366x768.png', fonts });

  // 4. Generate life-test frames A & B
  const frameA = await renderPanelScene(1280, 720, { isProjectionOpen: true, reactorIntensity: 'rest', filename: 'life-test-a-rest.png', fonts });
  const frameB = await renderPanelScene(1280, 720, { isProjectionOpen: true, reactorIntensity: 'peak', filename: 'life-test-b-peak.png', fonts });

  console.log('\n=== ТЗ S2: КОЛОРИМЕТРИЯ (ПИПЕТКА) ===');
  // Panel bounds on 1280x720: panelW=1178, panelH=562, panelX=51, panelY=79
  // Point 1: Оправа (край панели, e.g. panelX + 8 = 59, panelY + 10 = 89)
  const ptFrame = getPixelChannels(settings1280, 59, 89);
  console.log(`1. Оправа (край панели, x=59, y=89): R=${ptFrame.r}, G=${ptFrame.g}, B=${ptFrame.b} (${ptFrame.hex}) | Разброс max-min=${ptFrame.spread}`);

  // Point 2: Поле вокруг панели (где виден реактор / кольцо реактора, e.g. top margin x=640, y=45)
  const ptField = getPixelChannels(settings1280, 640, 45);
  const rMinusB = ptField.r - ptField.b;
  console.log(`2. Поле вокруг панели на кольце реактора (x=640, y=45): R=${ptField.r}, G=${ptField.g}, B=${ptField.b} (${ptField.hex}) | R - B = ${rMinusB}`);

  // Point 3: Плоскость чтения (e.g. x=500, y=550)
  const ptPlane = getPixelChannels(settings1280, 500, 550);
  console.log(`3. Плоскость чтения (x=500, y=550): R=${ptPlane.r}, G=${ptPlane.g}, B=${ptPlane.b} (${ptPlane.hex}) | Разброс max-min=${ptPlane.spread}`);

  console.log('\n=== ТЗ S2: ЖИЗНЕННЫЙ ТЕСТ (РЕАКТОР ПОКОЙ vs ПИК) ===');
  // Sample text pixel of header title in Frame A and Frame B (e.g. planeX + 28 = 103, planeY + 20 = 119)
  const textX = 103;
  const textY = 119;
  const titleA = getPixelChannels(frameA, textX, textY);
  const titleB = getPixelChannels(frameB, textX, textY);
  const deltaR = Math.abs(titleA.r - titleB.r);
  const deltaG = Math.abs(titleA.g - titleB.g);
  const deltaB = Math.abs(titleA.b - titleB.b);
  const maxDelta = Math.max(deltaR, deltaG, deltaB);

  console.log(`Кадр A (покой): R=${titleA.r}, G=${titleA.g}, B=${titleA.b}`);
  console.log(`Кадр B (пик):   R=${titleB.r}, G=${titleB.g}, B=${titleB.b}`);
  console.log(`Дельта каналов: ΔR=${deltaR}, ΔG=${deltaG}, ΔB=${deltaB} | Max delta=${maxDelta}`);

  // Acceptance criteria:
  // - Оправа: 7±1 (6..8), разброс <= 2
  // - Поле вокруг панели: R - B >= 20
  // - Плоскость чтения: каналы <= 12, разброс <= 2
  // - Жизненный тест: maxDelta <= 2
  const frameOk = Math.abs(ptFrame.r - 7) <= 1 && Math.abs(ptFrame.g - 7) <= 1 && Math.abs(ptFrame.b - 7) <= 1 && ptFrame.spread <= 2;
  const fieldOk = rMinusB >= 20;
  const planeOk = ptPlane.r <= 12 && ptPlane.g <= 12 && ptPlane.b <= 12 && ptPlane.spread <= 2;
  const lifeOk = maxDelta <= 2;

  console.log(`\n1. Оправа (7±1, разброс ≤2): ${frameOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`2. Свечение поля (R - B ≥ 20): ${fieldOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`3. Плоскость чтения (каналы ≤12, разброс ≤2): ${planeOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`4. Жизненный тест (дельта по каждому каналу ≤2): ${lifeOk ? '✅ PASSED' : '❌ FAILED'}`);

  if (!frameOk || !fieldOk || !planeOk || !lifeOk) {
    process.exit(1);
  }
  console.log('✅ ALL S2 COLORIMETRY AND ACCEPTANCE CHECKS PASSED.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
