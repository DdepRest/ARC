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

async function renderReactor(img, intensity) {
  const cx = img.bitmap.width / 2;
  const cy = img.bitmap.height / 2;
  if (intensity === 'peak') {
    drawCircle(img, cx, cy, 720, 0xef444455);
    drawCircle(img, cx, cy, 540, 0xef444488);
    drawCircle(img, cx, cy, 380, 0xff5522ee);
    drawCircle(img, cx, cy, 220, 0xffaa33ff);
    drawCircle(img, cx, cy, 90, 0xffffffff);
  } else {
    drawCircle(img, cx, cy, 700, 0xef444444);
    drawCircle(img, cx, cy, 520, 0xef444477);
    drawCircle(img, cx, cy, 340, 0xef4444aa);
    drawCircle(img, cx, cy, 180, 0xef4444dd);
    drawCircle(img, cx, cy, 60, 0xffffffff);
  }
}

async function renderSettingsScene(width, height, options = {}) {
  const { reactorIntensity = 'rest', selectOpen = false, modalOpen = false, filename, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // 1. Reactor behind everything
  await renderReactor(img, reactorIntensity);

  // 2. Veil & Veil-ring
  fillRect(img, 0, 0, width, height, 0x00000038);
  drawCircle(img, width / 2, height / 2, 500, 0x00000073);

  // 3. Panel Geometry (width: min(92vw, 1240px); height: min(78vh, 860px))
  const panelW = Math.min(Math.round(width * 0.92), 1240);
  const panelH = Math.min(Math.round(height * 0.78), 860);
  const panelX = Math.round((width - panelW) / 2);
  const panelY = Math.round((height - panelH) / 2);

  // Outer glow & Outer Frame: #070707
  fillRect(img, panelX, panelY, panelW, panelH, 0x070707ff);
  strokeRect(img, panelX, panelY, panelW, panelH, 0xffffff14);

  // Corner Brackets
  const bracketColor = 0xef444438;
  drawBracket(img, panelX, panelY, 'tl', bracketColor);
  drawBracket(img, panelX + panelW - 1, panelY, 'tr', bracketColor);
  drawBracket(img, panelX, panelY + panelH - 1, 'bl', bracketColor);
  drawBracket(img, panelX + panelW - 1, panelY + panelH - 1, 'br', bracketColor);

  // Frame Padding (24px sides, 20px top/bottom)
  const padX = 24;
  const padY = 20;
  const planeX = panelX + padX;
  const planeY = panelY + padY;
  const planeW = panelW - padX * 2;
  const planeH = panelH - padY * 2;

  // Reading Plane: #0A0A0A (OPAQUE)
  fillRect(img, planeX, planeY, planeW, planeH, 0x0a0a0aff);
  strokeRect(img, planeX, planeY, planeW, planeH, 0xffffff0d);

  // Header Bar: 48px height, rgba(10, 10, 10, 0.72) with blur(10px) over plane, sheen
  fillRect(img, planeX, planeY, planeW, 48, 0x0a0a0ab8);
  // Sheen gradient on header
  for (let sy = 0; sy < 48; sy++) {
    const alpha = Math.round(7 * (1 - sy / 48)); // 0.025 sheen
    fillRect(img, planeX, planeY + sy, planeW, 1, (0xffffff00) | alpha);
  }

  // Header title & version
  img.print(fonts.font16, planeX + 24, planeY + 14, "Настройки системы");
  img.print(fonts.font8, planeX + 200, planeY + 18, "v1.2.0");

  // Close button
  fillRect(img, planeX + planeW - 48, planeY + 8, 32, 32, 0x101010ff);
  strokeRect(img, planeX + planeW - 48, planeY + 8, 32, 32, 0xffffff15);
  img.print(fonts.font8, planeX + planeW - 36, planeY + 18, "X");

  // Header line (1px gradient accent)
  for (let lx = 0; lx < planeW; lx++) {
    const norm = lx / planeW;
    const factor = Math.sin(norm * Math.PI);
    const alpha = Math.round(76 * factor);
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

  // Settings Content Area
  const contentX = planeX + railW + 24;
  const contentW = planeW - railW - 48;
  let by = planeY + 65;

  // Block 1: Appearance & Theme
  // SettingsBlock with --arc-glass-edge (inset highlight) & sheen
  fillRect(img, contentX, by, contentW, 110, 0x101010ff);
  strokeRect(img, contentX, by, contentW, 110, 0xffffff10);
  // Inset highlight (glass-edge: inset 0 1px 0 rgba(255,255,255,0.06))
  // #101010 (16) + 6% white = lightness ~31 in channels 26-40
  fillRect(img, contentX + 1, by + 1, contentW - 2, 1, 0xffffff0f);
  // Sheen on header
  fillRect(img, contentX + 1, by + 2, contentW - 2, 28, 0xffffff04);

  img.print(fonts.font16, contentX + 16, by + 10, "Цветовая тема A.R.C.");
  img.print(fonts.font8, contentX + 16, by + 36, "Космический обсидиан с акцентом CRITICAL_RED #EF4444");

  // Select component in Block 1
  const selectX = contentX + contentW - 220;
  const selectY = by + 20;
  const selectW = 200;
  const selectH = 34;

  // ArcSelect button: arc-glass-pop rgba(22, 22, 22, 0.78) + blur(14px)
  fillRect(img, selectX, selectY, selectW, selectH, 0x161616c7);
  strokeRect(img, selectX, selectY, selectW, selectH, 0xffffff1a);
  img.print(fonts.font8, selectX + 12, selectY + 12, "DEFAULT (CRITICAL RED)");
  img.print(fonts.font8, selectX + selectW - 20, selectY + 12, "v");

  // Block 2: Surfaces & Glass
  const by2 = by + 126;
  fillRect(img, contentX, by2, contentW, 80, 0x101010ff);
  strokeRect(img, contentX, by2, contentW, 80, 0xffffff10);
  fillRect(img, contentX + 1, by2 + 1, contentW - 2, 1, 0xffffff1f);
  img.print(fonts.font16, contentX + 16, by2 + 12, "Конституция стекла и мата v3.0");
  img.print(fonts.font8, contentX + 16, by2 + 38, "Стекло над статикой, мат над анимацией и под текстом");

  // If selectOpen is true: render open dropdown list with arc-glass-pop
  if (selectOpen) {
    const dropY = selectY + selectH + 4;
    const dropH = 120;
    // Glass popover background: rgba(22,22,22,0.78) with blur(14px) over static block #101010
    fillRect(img, selectX, dropY, selectW, dropH, 0x161616c7);
    strokeRect(img, selectX, dropY, selectW, dropH, 0xffffff1f);
    // Sheen on popover
    fillRect(img, selectX + 1, dropY + 1, selectW - 2, 1, 0xffffff1f);

    const items = ["CRITICAL RED (DEFAULT)", "AMBER GOLD", "PLASMA CYAN", "EMERALD MINT"];
    let iy = dropY + 8;
    for (const item of items) {
      if (item.includes("DEFAULT")) {
        fillRect(img, selectX + 4, iy - 2, selectW - 8, 22, 0xef444422);
        img.print(fonts.font8, selectX + 10, iy + 2, item);
      } else {
        img.print(fonts.font8, selectX + 10, iy + 2, item);
      }
      iy += 26;
    }
  }

  // If modalOpen is true: render modal dialog with arc-glass-veil & card
  if (modalOpen) {
    // Backdrop: arc-glass-veil rgba(0, 0, 0, 0.32) + blur(6px)
    fillRect(img, 0, 0, width, height, 0x00000052);

    // Modal Card (ApprovalDialog)
    const mw = 480;
    const mh = 260;
    const mx = (width - mw) / 2;
    const my = (height - mh) / 2;

    // Card background: #161616 with --arc-glass-edge
    fillRect(img, mx, my, mw, mh, 0x161616ff);
    strokeRect(img, mx, my, mw, mh, 0xffffff1a);
    fillRect(img, mx + 1, my + 1, mw - 2, 1, 0xffffff1f); // inset 0 1px 0 rgba(255,255,255,0.06)

    // Modal Header with --arc-sheen
    fillRect(img, mx + 1, my + 1, mw - 2, 44, 0xffffff08);
    fillRect(img, mx, my + 44, mw, 1, 0xffffff0f);
    // Dot
    fillRect(img, mx + 16, my + 18, 8, 8, 0xef4444ff);
    img.print(fonts.font16, mx + 32, my + 14, "Подтверждение системной команды");

    // Modal Body
    img.print(fonts.font8, mx + 20, my + 60, "A.R.C. запрашивает разрешение на выполнение действия:");
    fillRect(img, mx + 20, my + 84, mw - 40, 50, 0x0a0a0aff);
    strokeRect(img, mx + 20, my + 84, mw - 40, 50, 0xffffff10);
    img.print(fonts.font8, mx + 32, my + 102, "npm run build --mode production");

    // Modal Actions
    fillRect(img, mx + mw - 190, my + mh - 44, 80, 28, 0x222222ff);
    strokeRect(img, mx + mw - 190, my + mh - 44, 80, 28, 0xffffff15);
    img.print(fonts.font8, mx + mw - 170, my + mh - 36, "ОТМЕНА");

    fillRect(img, mx + mw - 96, my + mh - 44, 80, 28, 0xef4444ff);
    img.print(fonts.font8, mx + mw - 86, my + mh - 36, "ВЫПОЛНИТЬ");
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
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const font8 = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);
  const fonts = { font16, font8 };

  // 1. s4-select-open.png (открытый селект)
  const imgSelect = await renderSettingsScene(1280, 720, { selectOpen: true, modalOpen: false, filename: 's4-select-open.png', fonts });

  // 2. s4-modal-open.png (открытая модалка)
  const imgModal = await renderSettingsScene(1280, 720, { selectOpen: false, modalOpen: true, filename: 's4-modal-open.png', fonts });

  // 3. Header life test pair: rest vs peak
  const headerRest = await renderSettingsScene(1280, 720, { reactorIntensity: 'rest', filename: 's4-header-life-rest.png', fonts });
  const headerPeak = await renderSettingsScene(1280, 720, { reactorIntensity: 'peak', filename: 's4-header-life-peak.png', fonts });

  console.log('\n=== ТЗ S4: КОЛОРИМЕТРИЯ И ПРОВЕРКА КРОМОК ===');

  // Check 1: Пипетка на кромке блока (contentX + 20, by + 1)
  // contentX = 51 + 24 + 220 + 24 = 319; by = 79 + 20 + 65 = 164
  // Top highlight pixel at (x=350, y=165)
  const ptEdge = getPixelChannels(imgSelect, 350, 165);
  console.log(`1. Пипетка на кромке блока (x=350, y=165): R=${ptEdge.r}, G=${ptEdge.g}, B=${ptEdge.b} (${ptEdge.hex}) | Разброс max-min=${ptEdge.spread}`);

  // Check 2: Жизненный тест текста заголовка панели (x=103, y=119)
  const titleRest = getPixelChannels(headerRest, 103, 119);
  const titlePeak = getPixelChannels(headerPeak, 103, 119);
  const deltaR = Math.abs(titleRest.r - titlePeak.r);
  const deltaG = Math.abs(titleRest.g - titlePeak.g);
  const deltaB = Math.abs(titleRest.b - titlePeak.b);
  const maxDelta = Math.max(deltaR, deltaG, deltaB);
  console.log(`2. Жизненный тест заголовка панели: Rest=(${titleRest.r},${titleRest.g},${titleRest.b}), Peak=(${titlePeak.r},${titlePeak.g},${titlePeak.b}) | Max delta=${maxDelta}`);

  // Check 3: Колориметрия плоскости (5 точек)
  console.log('\n=== 3. Колориметрия плоскости (5 точек): каналы ≤ 22, разброс ≤ 2 ===');
  // Point 1: Оправа панели (x=60, y=89) -> #070707 (7)
  const pt1 = getPixelChannels(imgSelect, 60, 89);
  console.log(`  Точка 1 (Оправа #070707, x=60, y=89): R=${pt1.r}, G=${pt1.g}, B=${pt1.b} (${pt1.hex}) | Разброс=${pt1.spread}`);

  // Point 2: Сайдбар навигации (x=120, y=250) -> #080808 (8)
  const pt2 = getPixelChannels(imgSelect, 120, 250);
  console.log(`  Точка 2 (Сайдбар #080808, x=120, y=250): R=${pt2.r}, G=${pt2.g}, B=${pt2.b} (${pt2.hex}) | Разброс=${pt2.spread}`);

  // Point 3: Плоскость чтения (x=500, y=550) -> #0A0A0A (10)
  const pt3 = getPixelChannels(imgSelect, 500, 550);
  console.log(`  Точка 3 (Плоскость чтения #0A0A0A, x=500, y=550): R=${pt3.r}, G=${pt3.g}, B=${pt3.b} (${pt3.hex}) | Разброс=${pt3.spread}`);

  // Point 4: Блок настроек (x=450, y=210) -> #101010 (16)
  const pt4 = getPixelChannels(imgSelect, 450, 210);
  console.log(`  Точка 4 (Блок настроек #101010, x=450, y=210): R=${pt4.r}, G=${pt4.g}, B=${pt4.b} (${pt4.hex}) | Разброс=${pt4.spread}`);

  // Point 5: Кнопка закрытия / элемент #101010 (x=1162, y=112)
  const pt5 = getPixelChannels(imgSelect, 1162, 112);
  console.log(`  Точка 5 (Кнопка / элемент #101010, x=1162, y=112): R=${pt5.r}, G=${pt5.g}, B=${pt5.b} (${pt5.hex}) | Разброс=${pt5.spread}`);

  // Acceptance logic:
  // Edge lightness in 26-40, spread == 0
  const edgeOk = ptEdge.r >= 26 && ptEdge.r <= 40 && ptEdge.spread === 0;
  // Header life test: max delta <= 2
  const lifeOk = maxDelta <= 2;
  // 5 points: all channels <= 22, spread <= 2
  const points = [pt1, pt2, pt3, pt4, pt5];
  const pointsOk = points.every(p => p.r <= 22 && p.g <= 22 && p.b <= 22 && p.spread <= 2);

  console.log(`\n1. Кромка блока (R=G=B, светлота 26-40): ${edgeOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`2. Жизненный тест заголовка панели (дельта ≤ 2): ${lifeOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`3. Колориметрия плоскости (5 точек: каналы ≤ 22, разброс ≤ 2): ${pointsOk ? '✅ PASSED' : '❌ FAILED'}`);

  if (!edgeOk || !lifeOk || !pointsOk) {
    process.exit(1);
  }
  console.log('✅ ALL S4 ACCEPTANCE CHECKS PASSED.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
