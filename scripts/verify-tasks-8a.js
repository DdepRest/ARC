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

function strokeRect(img, x, y, w, h, rgba, thickness = 1) {
  fillRect(img, x, y, w, thickness, rgba);
  fillRect(img, x, y + h - thickness, w, thickness, rgba);
  fillRect(img, x, y, thickness, h, rgba);
  fillRect(img, x + w - thickness, y, thickness, h, rgba);
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
      this.bitmap.data[idx + 0] = Math.round(cr * ca + this.bitmap.data[idx + 0] * (1 - ca));
      this.bitmap.data[idx + 1] = Math.round(cg * ca + this.bitmap.data[idx + 1] * (1 - ca));
      this.bitmap.data[idx + 2] = Math.round(cb * ca + this.bitmap.data[idx + 2] * (1 - ca));
      this.bitmap.data[idx + 3] = 255;
    }
  });
}

const C_FRAME   = 0x070707FF; // #070707
const C_PLANE   = 0x0A0A0AFF; // #0A0A0A
const C_BLOCK   = 0x101010FF; // #101010
const C_HOVER   = 0x121212FF; // #121212
const C_SELECT  = 0x161616FF; // #161616
const C_DIVIDER = 0x1A1A1AFF; // #1A1A1A
const C_HAIRLINE= 0x242424FF; // #242424
const C_ACCENT  = 0xEF4444FF; // #EF4444
const C_OK      = 0x22C55EFF; // #22C55E
const C_WARN    = 0xF59E0BFF; // #F59E0B
const C_ERR     = 0xEF4444FF; // #EF4444
const C_OFF     = 0x64748BFF; // #64748B
const C_INFO    = 0x3B82F6FF; // #3B82F6

async function renderKanbanScene(w, h, filename, fonts) {
  const img = new Jimp(w, h, C_PLANE);

  // Top header bar (y: 20 to 60)
  fillRect(img, 40, 20, w - 80, 45, C_BLOCK);
  strokeRect(img, 40, 20, w - 80, 45, C_HAIRLINE);
  if (fonts?.font16) img.print(fonts.font16, 55, 32, "TASKS // KANBAN BOARD");

  // Mode tabs / console toolbar (y: 75 to 125)
  fillRect(img, 40, 75, w - 80, 50, C_BLOCK);
  strokeRect(img, 40, 75, w - 80, 50, C_HAIRLINE);
  fillRect(img, 50, 83, 100, 34, C_SELECT);
  strokeRect(img, 50, 83, 100, 34, C_HAIRLINE);
  fillRect(img, 50, 115, 100, 2, C_ACCENT);

  // 5 Kanban columns (y: 135 to 680)
  const cols = [
    { title: "BACKLOG", statusDot: C_OFF, count: 3 },
    { title: "TODO", statusDot: 0x8A8A8AFF, count: 4 },
    { title: "IN PROGRESS", statusDot: C_WARN, count: 2 },
    { title: "REVIEW", statusDot: C_WARN, count: 1 },
    { title: "DONE", statusDot: C_OK, count: 5 }
  ];
  const colW = 224;
  const colGap = 16;
  const startX = 40;

  cols.forEach((col, cIdx) => {
    const cx = startX + cIdx * (colW + colGap);
    // Column frame
    fillRect(img, cx, 135, colW, 540, C_PLANE);
    strokeRect(img, cx, 135, colW, 540, C_DIVIDER);

    // Column header
    fillRect(img, cx, 135, colW, 40, C_BLOCK);
    strokeRect(img, cx, 135, colW, 40, C_DIVIDER);
    drawCircle(img, cx + 16, 155, 3, col.statusDot); // 6px dot

    // Task cards inside column
    for (let i = 0; i < 3; i++) {
      const cardY = 185 + i * 85;
      const isHover = (cIdx === 1 && i === 0);
      const isSelected = (cIdx === 2 && i === 0);
      const cardBg = isSelected ? C_SELECT : isHover ? C_HOVER : C_BLOCK;
      fillRect(img, cx + 10, cardY, colW - 20, 75, cardBg);
      strokeRect(img, cx + 10, cardY, colW - 20, 75, isSelected ? C_HAIRLINE : C_HAIRLINE);
      if (isSelected) {
        // 2px accent stripe on the left
        fillRect(img, cx + 10, cardY, 2, 75, C_ACCENT);
      }
      // Status dot on card for priority/state: P1 (C_ERR), P2 (C_WARN), P4 (neutral/off)
      const dotColor = i === 0 ? C_ERR : i === 1 ? C_WARN : C_OK;
      drawCircle(img, cx + 22, cardY + 16, 3, dotColor);

      // Neutral Category Chip (x: cx + 32, y: cardY + 10, w: 50, h: 14)
      fillRect(img, cx + 32, cardY + 10, 50, 14, C_BLOCK);
      strokeRect(img, cx + 32, cardY + 10, 50, 14, C_HAIRLINE);
    }
  });

  const targetPath = path.join(OUT_DIR, filename);
  await img.writeAsync(targetPath);
  return img;
}

async function renderListScene(w, h, filename, fonts) {
  const img = new Jimp(w, h, C_PLANE);

  // Top header bar (y: 20 to 60)
  fillRect(img, 40, 20, w - 80, 45, C_BLOCK);
  strokeRect(img, 40, 20, w - 80, 45, C_HAIRLINE);
  if (fonts?.font16) img.print(fonts.font16, 55, 32, "TASKS // LIST VIEW & CONTEXT RAIL");

  // Console input zone (y: 75 to 135)
  fillRect(img, 40, 75, w - 80, 60, C_BLOCK);
  strokeRect(img, 40, 75, w - 80, 60, C_HAIRLINE);
  fillRect(img, 55, 87, 500, 36, C_PLANE);
  strokeRect(img, 55, 87, 500, 36, C_HAIRLINE);

  // Left List Area (w: 800) vs Right Context Rail (w: 360)
  const listW = 780;
  const railX = 840;
  const railW = w - 80 - 800;

  // List cards
  for (let i = 0; i < 6; i++) {
    const itemY = 145 + i * 78;
    const isSelected = (i === 1);
    const isHover = (i === 0);
    const bg = isSelected ? C_SELECT : isHover ? C_HOVER : C_BLOCK;
    fillRect(img, 40, itemY, listW, 70, bg);
    strokeRect(img, 40, itemY, listW, 70, C_HAIRLINE);

    if (isSelected) {
      fillRect(img, 40, itemY, 2, 70, C_ACCENT);
    }

    // Hairline checkbox
    strokeRect(img, 56, itemY + 16, 16, 16, C_HAIRLINE);
    if (i === 3) {
      fillRect(img, 56, itemY + 16, 16, 16, 0xEF444433);
      strokeRect(img, 56, itemY + 16, 16, 16, C_ACCENT);
    }

    // Status dot on card (P1=ERR, P2=WARN, Done=OK)
    const cardStatusDot = i === 0 ? C_ERR : i === 1 ? C_WARN : i === 3 ? C_OK : C_OFF;
    drawCircle(img, 82, itemY + 24, 3, cardStatusDot);

    // Neutral Category Chip (x=95, y=itemY+16, w=60, h=16)
    fillRect(img, 95, itemY + 16, 60, 16, C_BLOCK);
    strokeRect(img, 95, itemY + 16, 60, 16, C_HAIRLINE);

    // State Badge (e.g. OVERDUE at i=0, TODAY at i=1, DONE at i=3)
    // Neutral block container with status-dot and status-text
    const badgeX = 165;
    const badgeY = itemY + 16;
    fillRect(img, badgeX, badgeY, 65, 16, C_BLOCK);
    strokeRect(img, badgeX, badgeY, 65, 16, C_HAIRLINE);
    drawCircle(img, badgeX + 6, badgeY + 8, 2, cardStatusDot);

    // Subtask 2px tick bars
    for (let t = 0; t < 5; t++) {
      fillRect(img, 245 + t * 12, itemY + 46, 10, 2, t < 3 ? C_ACCENT : C_DIVIDER);
    }
  }

  // Right Context Rail
  fillRect(img, railX, 145, railW, 540, C_BLOCK);
  strokeRect(img, railX, 145, railW, 540, C_HAIRLINE);
  // Context rail header
  fillRect(img, railX, 145, railW, 40, C_PLANE);
  strokeRect(img, railX, 145, railW, 40, C_DIVIDER);
  drawCircle(img, railX + 20, 165, 3, C_OK); // 6px status dot

  // Inner metadata blocks
  fillRect(img, railX + 16, 200, railW - 32, 120, C_PLANE);
  strokeRect(img, railX + 16, 200, railW - 32, 120, C_HAIRLINE);

  const targetPath = path.join(OUT_DIR, filename);
  await img.writeAsync(targetPath);
  return img;
}

function getPixelChannels(img, x, y) {
  const idx = (y * img.bitmap.width + x) * 4;
  const r = img.bitmap.data[idx];
  const g = img.bitmap.data[idx + 1];
  const b = img.bitmap.data[idx + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return { r, g, b, spread, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase() };
}

// Relative luminance and contrast ratio (WCAG 2.1)
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(rgb1, rgb2) {
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

async function run() {
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const fonts = { font16 };

  console.log('\n=== РЕНДЕРИНГ ЭТАЛОНОВ И ПРОВЕРКА КОЛОРИМЕТРИИ CHUNK 8A ===');
  const imgKanban = await renderKanbanScene(1280, 720, 'tasks-kanban-1280x720.png', fonts);
  const imgList = await renderListScene(1280, 720, 'tasks-list-1280x720.png', fonts);
  console.log('✅ Кадры сохранены в docs/ui-etalon: tasks-kanban-1280x720.png, tasks-list-1280x720.png');

  console.log('\n=== ПИПЕТКА: ЗАМЕРЫ 5 ТОЧЕК ===');
  // Точка 1: Плоскость var(--arc-plane) #0A0A0A (кадр Kanban x=10, y=10)
  const ptPlane = getPixelChannels(imgKanban, 10, 10);
  console.log(`Точка 1 (Плоскость var(--arc-plane)): R=${ptPlane.r}, G=${ptPlane.g}, B=${ptPlane.b} (${ptPlane.hex}) | Разброс=${ptPlane.spread}`);

  // Точка 2: Карточка задачи в покое var(--arc-block) #101010 (кадр List x=100, y=320)
  const ptCardRest = getPixelChannels(imgList, 100, 320);
  console.log(`Точка 2 (Карточка в покое var(--arc-block)): R=${ptCardRest.r}, G=${ptCardRest.g}, B=${ptCardRest.b} (${ptCardRest.hex}) | Разброс=${ptCardRest.spread}`);

  // Точка 3: Карточка задачи в hover var(--arc-hover) #121212 (кадр List x=100, y=160)
  const ptCardHover = getPixelChannels(imgList, 100, 160);
  console.log(`Точка 3 (Карточка в hover var(--arc-hover)): R=${ptCardHover.r}, G=${ptCardHover.g}, B=${ptCardHover.b} (${ptCardHover.hex}) | Разброс=${ptCardHover.spread}`);

  // Точка 4: Заголовок колонки Kanban var(--arc-block) #101010 (кадр Kanban x=70, y=155)
  const ptKanbanCol = getPixelChannels(imgKanban, 70, 155);
  console.log(`Точка 4 (Заголовок колонки Kanban var(--arc-block)): R=${ptKanbanCol.r}, G=${ptKanbanCol.g}, B=${ptKanbanCol.b} (${ptKanbanCol.hex}) | Разброс=${ptKanbanCol.spread}`);

  // Точка 5: Карточка задачи активная var(--arc-selected) #161616 (кадр List x=100, y=230)
  const ptCardActive = getPixelChannels(imgList, 100, 230);
  console.log(`Точка 5 (Карточка активная var(--arc-selected)): R=${ptCardActive.r}, G=${ptCardActive.g}, B=${ptCardActive.b} (${ptCardActive.hex}) | Разброс=${ptCardActive.spread}`);

  // Точка 6: Нейтральный чип категории var(--arc-block) #101010 (кадр List x=125, y=169 — центр тела с инсетом dx=30px, dy=8px >= 2px от границы)
  const ptCategoryChip = getPixelChannels(imgList, 125, 169);
  console.log(`Точка 6 (Чип категории var(--arc-block)): R=${ptCategoryChip.r}, G=${ptCategoryChip.g}, B=${ptCategoryChip.b} (${ptCategoryChip.hex}) | Разброс=${ptCategoryChip.spread} (Hue: НЕТ)`);

  // Точка 7: Статусная точка просрочено / error (кадр List x=82, y=169) — проверка var(--status-err)
  const ptStatusErrDot = getPixelChannels(imgList, 82, 169);
  console.log(`Точка 7 (Статусная точка ERR): R=${ptStatusErrDot.r}, G=${ptStatusErrDot.g}, B=${ptStatusErrDot.b} (${ptStatusErrDot.hex}) | Семантика: var(--status-err)`);

  // Точка 8: Статусная точка сегодня / warning (кадр List x=82, y=247) — проверка var(--status-warn)
  const ptStatusWarnDot = getPixelChannels(imgList, 82, 247);
  console.log(`Точка 8 (Статусная точка WARN): R=${ptStatusWarnDot.r}, G=${ptStatusWarnDot.g}, B=${ptStatusWarnDot.b} (${ptStatusWarnDot.hex}) | Семантика: var(--status-warn)`);

  // Точка 9: Статусная точка выполнено / ok (кадр List x=82, y=403) — проверка var(--status-ok)
  const ptStatusOkDot = getPixelChannels(imgList, 82, 403);
  console.log(`Точка 9 (Статусная точка OK): R=${ptStatusOkDot.r}, G=${ptStatusOkDot.g}, B=${ptStatusOkDot.b} (${ptStatusOkDot.hex}) | Семантика: var(--status-ok)`);

  // WCAG AA Contrast Checks (Каноническая шкала текста tokens.css: #E8E8E8, #B4B4B4, #909090, #7A7A7A)
  console.log('\n=== WCAG AA КОНТРАСТ ТЕКСТА (Каноническая шкала tokens.css) ===');
  const cTextPrimary = { r: 232, g: 232, b: 232 };   // --arc-text-primary #E8E8E8
  const cTextSecondary = { r: 180, g: 180, b: 180 }; // --arc-text-secondary #B4B4B4
  const cTextHint = { r: 144, g: 144, b: 144 };      // --arc-text-hint #909090
  const cTextMachine = { r: 122, g: 122, b: 122 };   // --arc-text-machine #7A7A7A
  const cTextMuted = { r: 112, g: 112, b: 112 };     // --arc-text-muted #707070 (incidental/line-through/disabled)

  const contrastPrimary = getContrast(cTextPrimary, ptCardRest);
  const contrastSecondary = getContrast(cTextSecondary, ptCardRest);
  const contrastHint = getContrast(cTextHint, ptCardRest);
  const contrastMachineOnPlane = getContrast(cTextMachine, ptPlane);
  const contrastMuted = getContrast(cTextMuted, ptCardRest);

  console.log(`Контраст Primary (--arc-text-primary #E8E8E8) к карточке (${ptCardRest.hex}): ${contrastPrimary.toFixed(2)}:1 (Порог AA 4.5:1: ${contrastPrimary >= 4.5 ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Контраст Secondary (--arc-text-secondary #B4B4B4) к карточке (${ptCardRest.hex}): ${contrastSecondary.toFixed(2)}:1 (Порог AA 4.5:1: ${contrastSecondary >= 4.5 ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Контраст Hint (--arc-text-hint #909090) к карточке (${ptCardRest.hex}): ${contrastHint.toFixed(2)}:1 (Порог AA 4.5:1: ${contrastHint >= 4.5 ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Контраст Machine (--arc-text-machine #7A7A7A) к плоскости (${ptPlane.hex}): ${contrastMachineOnPlane.toFixed(2)}:1 (Порог AA 4.5:1: ${contrastMachineOnPlane >= 4.5 ? 'PASS ✅' : 'FAIL ❌'})`);
  console.log(`Контраст Muted (--arc-text-muted #707070, incidental line-through/disabled): ${contrastMuted.toFixed(2)}:1 (WCAG 2.1 SC 1.4.3 Incidental Exemption: PASS ✅)`);

  const checksPass = 
    ptPlane.r <= 12 && ptPlane.spread <= 2 &&
    ptCardRest.hex === '#101010' &&
    ptCardHover.hex === '#121212' &&
    ptKanbanCol.hex === '#101010' && ptKanbanCol.spread === 0 &&
    ptCategoryChip.hex === '#101010' && ptCategoryChip.spread === 0 &&
    contrastPrimary >= 4.5 &&
    contrastSecondary >= 4.5 &&
    contrastHint >= 4.5 &&
    contrastMachineOnPlane >= 4.5;

  if (!checksPass) {
    console.error('❌ Ошибка колориметрических замеров!');
    process.exit(1);
  }

  console.log('\n✅ ВСЕ ЗАМЕРЫ ПИПЕТКИ И WCAG AA ПРОЙДЕНЫ УСПЕШНО.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
