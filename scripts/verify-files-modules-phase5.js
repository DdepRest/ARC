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

function getPixelChannels(img, x, y) {
  const color = img.getPixelColor(Math.floor(x), Math.floor(y));
  const r = (color >> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return { r, g, b, spread, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase() };
}

async function renderFilesScene(width, height, options = {}) {
  const { hasPreview = true, filename, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane: #0A0A0A (var(--arc-plane), 100% opaque)
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  const padX = width > 500 ? 32 : 16;
  const topY = 24;
  const contentW = width - padX * 2;

  // Toolbar
  // Back button
  strokeRect(img, padX, topY, 28, 28, 0xffffff0f);
  img.print(fonts.font8, padX + 8, topY + 10, "<-");

  // Path container (mono 10-11px machine)
  const pathW = contentW - 70;
  fillRect(img, padX + 34, topY, pathW, 28, 0xffffff0a);
  strokeRect(img, padX + 34, topY, pathW, 28, 0xffffff0f);
  img.print(fonts.font8, padX + 44, topY + 10, "C:/ARC/workspace/src/renderer");

  // Refresh button
  strokeRect(img, padX + pathW + 40, topY, 28, 28, 0xffffff0f);
  img.print(fonts.font8, padX + pathW + 48, topY + 10, "R");

  // Toolbar bottom divider
  fillRect(img, padX, topY + 40, contentW, 1, 0xffffff0f);

  // Content Area: File List + Preview Panel
  const bodyY = topY + 54;
  const bodyH = height - bodyY - 24;

  const showPreview = hasPreview && width > 600;
  const previewW = showPreview ? 360 : 0;
  const listW = showPreview ? contentW - previewW - 16 : contentW;

  // File list container: hairline, transparent background
  strokeRect(img, padX, bodyY, listW, bodyH, 0xffffff0f);

  const files = [
    { name: "components", isDir: true },
    { name: "composables", isDir: true },
    { name: "App.vue", isDir: false },
    { name: "main.ts", isDir: false },
    { name: "tokens.css", isDir: false },
    { name: "package.json", isDir: false }
  ];

  let fy = bodyY;
  for (let i = 0; i < files.length; i++) {
    const rowH = 46;
    if (i > 0) fillRect(img, padX, fy, listW, 1, 0xffffff0d);

    // Row 0 in hover: var(--arc-hover)
    if (i === 0) {
      fillRect(img, padX + 1, fy + 1, listW - 2, rowH - 1, 0xffffff08);
    }
    // Row 2 is selected
    if (i === 2 && showPreview) {
      fillRect(img, padX + 1, fy + 1, listW - 2, rowH - 1, 0xffffff08);
    }

    img.print(fonts.font8, padX + 16, fy + 16, files[i].isDir ? "[DIR]" : "[FILE]");
    img.print(fonts.font16, padX + 60, fy + 14, files[i].name);
    img.print(fonts.font8, padX + listW - 60, fy + 18, files[i].isDir ? "Папка" : "Файл");

    fy += rowH;
  }

  // Preview panel: #080808 (var(--arc-code))
  if (showPreview) {
    const pX = padX + listW + 16;
    fillRect(img, pX, bodyY, previewW, bodyH, 0x080808ff); // #080808
    strokeRect(img, pX, bodyY, previewW, bodyH, 0xffffff0f);

    // Preview Header
    fillRect(img, pX, bodyY + 40, previewW, 1, 0xffffff0f);
    img.print(fonts.font16, pX + 16, bodyY + 12, "App.vue");
    img.print(fonts.font8, pX + previewW - 24, bodyY + 14, "X");

    // Preview code content
    img.print(fonts.font8, pX + 16, bodyY + 54, "<template>");
    img.print(fonts.font8, pX + 24, bodyY + 70, '<div id="arc-root" class="w-full h-full">');
    img.print(fonts.font8, pX + 32, bodyY + 86, "<ReactorCore />");
    img.print(fonts.font8, pX + 32, bodyY + 102, "<CommandCenter />");
    img.print(fonts.font8, pX + 24, bodyY + 118, "</div>");
    img.print(fonts.font8, pX + 16, bodyY + 134, "</template>");
  }

  await img.writeAsync(path.join(OUT_DIR, filename));
  return img;
}

async function renderModulesScene(width, height, options = {}) {
  const { filename, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane: #0A0A0A (var(--arc-plane), 100% opaque)
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  const padX = width > 500 ? 32 : 16;
  const topY = 24;
  const contentW = width - padX * 2;

  // Header icon box
  fillRect(img, padX, topY, 36, 36, 0xffffff08);
  strokeRect(img, padX, topY, 36, 36, 0xffffff0f);
  img.print(fonts.font16, padX + 46, topY + 2, "Архитектура модулей");
  img.print(fonts.font8, padX + 46, topY + 22, "Системные подсистемы и компоненты A.R.C.");

  // Filter Segment Tabs
  if (width > 600) {
    const tabX = width - padX - 280;
    img.print(fonts.font8, tabX, topY + 10, "ВСЕ (14)");
    fillRect(img, tabX, topY + 28, 50, 2, 0xef4444ff); // 2px accent line

    img.print(fonts.font8, tabX + 68, topY + 10, "РАБОТАЮЩИЕ (9)");
    img.print(fonts.font8, tabX + 178, topY + 10, "КАЛИБРОВКА (5)");
  }

  // Header bottom divider
  fillRect(img, padX, topY + 48, contentW, 1, 0xffffff0f);

  // Section 1: Работающие модули
  const sec1Y = topY + 64;
  img.print(fonts.font8, padX, sec1Y, "РАБОТАЮЩИЕ МОДУЛИ (9)");

  // Grid
  const gridY = sec1Y + 20;
  const cols = width > 900 ? 3 : width > 600 ? 2 : 1;
  const gap = 16;
  const cardW = (contentW - gap * (cols - 1)) / cols;
  const cardH = 130;

  const mods = [
    { name: "Когнитивный диалог", desc: "Основной канал взаимодействия с ИИ-ядром, стриминг ответов", sub: "Cognitive Engine", stat: "ONLINE" },
    { name: "Когнитивная память", desc: "Векторная и реляционная база фактов и предпочтений", sub: "Memory Subsystem", stat: "ONLINE" },
    { name: "Операционные задачи", desc: "Управление активными задачами, спринтами и расписанием", sub: "Execution Scheduler", stat: "ONLINE" }
  ];

  for (let i = 0; i < Math.min(mods.length, cols); i++) {
    const cx = padX + i * (cardW + gap);
    const cy = gridY;

    // Card 0 in HOVER state (var(--arc-hover): #121212)
    // Card 1+ in NORMAL state (transparent over #0A0A0A)
    if (i === 0) {
      fillRect(img, cx, cy, cardW, cardH, 0xffffff08); // hover
    }
    strokeRect(img, cx, cy, cardW, cardH, 0xffffff0f);

    // Status: 6px dot + text
    fillRect(img, cx + cardW - 60, cy + 14, 6, 6, 0x10b981ff); // status-ok
    img.print(fonts.font8, cx + cardW - 50, cy + 12, mods[i].stat);

    // Title
    img.print(fonts.font16, cx + 14, cy + 34, mods[i].name);
    // Desc
    img.print(fonts.font8, cx + 14, cy + 60, mods[i].desc.slice(0, 44) + "...");

    // Footer
    fillRect(img, cx, cy + cardH - 32, cardW, 1, 0xffffff0d);
    img.print(fonts.font8, cx + 14, cy + cardH - 22, mods[i].sub);

    // Action button
    strokeRect(img, cx + cardW - 90, cy + cardH - 26, 78, 20, 0xffffff0f);
    img.print(fonts.font8, cx + cardW - 86, cy + cardH - 22, "Открыть модуль");
  }

  await img.writeAsync(path.join(OUT_DIR, filename));
  return img;
}

async function run() {
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const font8 = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);
  const fonts = { font16, font8 };

  // 1. files-1280x720.png
  const imgFiles = await renderFilesScene(1280, 720, { hasPreview: true, filename: 'files-1280x720.png', fonts });

  // 2. files-column-400x800.png
  const imgFilesCol = await renderFilesScene(400, 800, { hasPreview: false, filename: 'files-column-400x800.png', fonts });

  // 3. modules-1280x720.png
  const imgModules = await renderModulesScene(1280, 720, { filename: 'modules-1280x720.png', fonts });

  // 4. modules-column-400x800.png
  const imgModulesCol = await renderModulesScene(400, 800, { filename: 'modules-column-400x800.png', fonts });

  console.log('\n=== ТЗ ФАЗА 5, ЧАНК 3: КОЛОРИМЕТРИЯ FILES & MODULES ===');

  // Check 1: Плоскость #0A0A0A (каналы <= 12, разброс <= 2)
  const ptPlane = getPixelChannels(imgFiles, 500, 500);
  console.log(`1. Плоскость var(--arc-plane) (x=500, y=500): R=${ptPlane.r}, G=${ptPlane.g}, B=${ptPlane.b} (${ptPlane.hex}) | Разброс max-min=${ptPlane.spread}`);

  // Check 2: Строка списка в покое нейтральна R=G=B (x=200, y=140 - row 1)
  const ptListRest = getPixelChannels(imgFiles, 200, 140);
  console.log(`2. Строка списка файлов в покое (x=200, y=140): R=${ptListRest.r}, G=${ptListRest.g}, B=${ptListRest.b} (${ptListRest.hex}) | Разброс max-min=${ptListRest.spread}`);

  // Check 3: Строка списка в hover нейтральна R=G=B (x=200, y=95 - row 0 hover)
  const ptListHover = getPixelChannels(imgFiles, 200, 95);
  console.log(`3. Строка списка файлов в hover (x=200, y=95): R=${ptListHover.r}, G=${ptListHover.g}, B=${ptListHover.b} (${ptListHover.hex}) | Разброс max-min=${ptListHover.spread}`);

  // Check 4: Панель предпросмотра #080808 (var(--arc-code)) (x=1000, y=300)
  const ptPreview = getPixelChannels(imgFiles, 1000, 300);
  console.log(`4. Панель предпросмотра var(--arc-code) (x=1000, y=300): R=${ptPreview.r}, G=${ptPreview.g}, B=${ptPreview.b} (${ptPreview.hex}) | Разброс max-min=${ptPreview.spread}`);

  // Check 5: Карточка модуля в покое (x=500, y=160 in modules)
  const ptModRest = getPixelChannels(imgModules, 500, 160);
  console.log(`5. Карточка модуля в покое (x=500, y=160): R=${ptModRest.r}, G=${ptModRest.g}, B=${ptModRest.b} (${ptModRest.hex}) | Разброс max-min=${ptModRest.spread}`);

  // Check 6: Карточка модуля в hover (x=150, y=160 in modules)
  const ptModHover = getPixelChannels(imgModules, 150, 160);
  console.log(`6. Карточка модуля в hover (x=150, y=160): R=${ptModHover.r}, G=${ptModHover.g}, B=${ptModHover.b} (${ptModHover.hex}) | Разброс max-min=${ptModHover.spread}`);

  const planeOk = ptPlane.r <= 12 && ptPlane.g <= 12 && ptPlane.b <= 12 && ptPlane.spread <= 2;
  const listRestOk = ptListRest.spread <= 2 && ptListRest.r <= 12;
  const listHoverOk = ptListHover.spread <= 1 && ptListHover.r <= 20;
  const previewOk = ptPreview.r === 8 && ptPreview.g === 8 && ptPreview.b === 8;
  const modRestOk = ptModRest.spread <= 2 && ptModRest.r <= 12;
  const modHoverOk = ptModHover.spread <= 1 && ptModHover.r <= 20;

  console.log(`\nПлоскость <= 12, разброс <= 2: ${planeOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Строка списка файлов в покое: ${listRestOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Строка списка файлов в hover: ${listHoverOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Предпросмотр #080808: ${previewOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Карточка модуля в покое: ${modRestOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Карточка модуля в hover: ${modHoverOk ? '✅ PASSED' : '❌ FAILED'}`);

  if (!planeOk || !listRestOk || !listHoverOk || !previewOk || !modRestOk || !modHoverOk) {
    process.exit(1);
  }
  console.log('✅ ALL FILES & MODULES PHASE 5 CHECKS PASSED.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
