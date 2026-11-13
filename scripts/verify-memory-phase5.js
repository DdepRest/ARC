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

async function renderMemoryScene(width, height, options = {}) {
  const { isModalOpen = false, filename, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root plane: #0A0A0A (var(--arc-plane), 100% opaque)
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  const padX = width > 500 ? 32 : 16;
  const contentW = width - padX * 2;

  // Header Toolbar
  const topY = 24;
  // Database icon box
  fillRect(img, padX, topY, 36, 36, 0xffffff08);
  strokeRect(img, padX, topY, 36, 36, 0xffffff0f);
  img.print(fonts.font16, padX + 46, topY + 2, "Долговременная память");
  img.print(fonts.font8, padX + 46, topY + 22, "Системная память // Cognitive Database");

  // Actions right: Primary button "Создать запись"
  const btnW = 126;
  const btnX = width - padX - btnW;
  fillRect(img, btnX, topY + 4, btnW, 28, 0xef4444ff);
  img.print(fonts.font8, btnX + 16, topY + 12, "+ Создать запись");

  // Secondary buttons
  const expX = btnX - 80;
  fillRect(img, expX, topY + 4, 70, 28, 0xffffff08);
  strokeRect(img, expX, topY + 4, 70, 28, 0xffffff0f);
  img.print(fonts.font8, expX + 14, topY + 12, "Экспорт");

  // Danger delete
  const delX = expX - 38;
  strokeRect(img, delX, topY + 4, 28, 28, 0xffffff0f);
  img.print(fonts.font8, delX + 10, topY + 12, "X");

  // Header bottom hairline divider
  const divY = topY + 48;
  fillRect(img, padX, divY, contentW, 1, 0xffffff0f);

  // Search & Segment row
  const row2Y = divY + 16;
  // Search input
  const sW = width > 600 ? 300 : contentW;
  fillRect(img, padX, row2Y, sW, 32, 0xffffff0a);
  strokeRect(img, padX, row2Y, sW, 32, 0xffffff0f);
  img.print(fonts.font8, padX + 12, row2Y + 10, "Поиск узлов памяти...");

  // Segment control (10px uppercase, active 2px bottom line, no fill)
  if (width > 600) {
    const segX = padX + sW + 24;
    img.print(fonts.font8, segX, row2Y + 8, "ТОЧНЫЙ");
    fillRect(img, segX, row2Y + 26, 44, 2, 0xef4444ff); // 2px accent line

    const seg2X = segX + 64;
    img.print(fonts.font8, seg2X, row2Y + 8, "СЕМАНТИЧЕСКИЙ");
  }

  // Cards Grid
  const gridY = row2Y + 52;
  const cols = width > 900 ? 4 : width > 600 ? 2 : 1;
  const gap = 16;
  const cardW = (contentW - gap * (cols - 1)) / cols;
  const cardH = 140;

  const cards = [
    { key: "User Preferred Theme", val: "Темная палитра A.R.C. с красным реактором и отключенными анимациями", cat: "ФАКТ", conf: "95%" },
    { key: "API Gateway Endpoint", val: "Локальный мост IPC для прямого вызова системных служб", cat: "ЗНАНИЕ", conf: "90%" },
    { key: "Session Checkpoint", val: "Предыдущая сессия завершена штатно, контекст сохранен", cat: "СОБЫТИЕ", conf: "85%" },
    { key: "Language Preferences", val: "Русский основной интерфейс, поддержка английских технических терминов", cat: "ПРЕДПОЧТЕНИЕ", conf: "100%" }
  ];

  for (let i = 0; i < Math.min(cards.length, cols); i++) {
    const cx = padX + i * (cardW + gap);
    const cy = gridY;

    // Card 0 in HOVER state (var(--arc-hover): rgba(255,255,255,0.03) over #0A0A0A)
    // Card 1+ in NORMAL state (transparent over #0A0A0A)
    if (i === 0) {
      fillRect(img, cx, cy, cardW, cardH, 0xffffff08); // hover
    }
    strokeRect(img, cx, cy, cardW, cardH, 0xffffff0f); // hairline border

    // Category badge
    fillRect(img, cx + 12, cy + 12, 60, 18, 0xffffff08);
    strokeRect(img, cx + 12, cy + 12, 60, 18, 0xffffff0f);
    img.print(fonts.font8, cx + 16, cy + 16, cards[i].cat);

    // Confidence
    img.print(fonts.font8, cx + cardW - 40, cy + 16, cards[i].conf);

    // Title (sentence case 14/500)
    img.print(fonts.font16, cx + 12, cy + 40, cards[i].key);

    // Desc (12/400 hint)
    img.print(fonts.font8, cx + 12, cy + 68, cards[i].val.slice(0, 48) + "...");

    // Footer
    fillRect(img, cx, cy + cardH - 28, cardW, 1, 0xffffff0d);
    img.print(fonts.font8, cx + 12, cy + cardH - 18, "Источник: Система");
    img.print(fonts.font8, cx + cardW - 50, cy + cardH - 18, "12 обр.");
  }

  // If Modal Open: render arc-glass-veil + popover card
  if (isModalOpen) {
    // Backdrop: arc-glass-veil (rgba(0,0,0,0.32) + blur 6px over plane)
    fillRect(img, 0, 0, width, height, 0x00000052);

    // Modal Box: max-w-lg (480px)
    const mW = 480;
    const mH = 380;
    const mX = (width - mW) / 2;
    const mY = (height - mH) / 2;

    // Body: #141414 (var(--arc-popover))
    fillRect(img, mX, mY, mW, mH, 0x141414ff);
    // Triple edge (var(--arc-glass-edge))
    strokeRect(img, mX, mY, mW, mH, 0xffffff15);
    strokeRect(img, mX + 1, mY + 1, mW - 2, mH - 2, 0xffffff08);

    // Top accent sheen
    fillRect(img, mX, mY, mW, 1, 0xef4444cc);

    // Modal Header
    img.print(fonts.font16, mX + 24, mY + 20, "Новый узел памяти");
    img.print(fonts.font8, mX + 24, mY + 44, "Добавление записи в долговременную память");

    // Close X
    img.print(fonts.font16, mX + mW - 36, mY + 20, "X");

    // Divider
    fillRect(img, mX, mY + 68, mW, 1, 0xffffff0f);

    // Form: Category buttons
    img.print(fonts.font8, mX + 24, mY + 80, "КАТЕГОРИЯ УЗЛА");
    const cats = ["Факт", "Предпочтение", "Знание", "Событие"];
    for (let c = 0; c < 4; c++) {
      const bx = mX + 24 + c * 108;
      if (c === 0) {
        fillRect(img, bx, mY + 96, 100, 26, 0xffffff08);
        strokeRect(img, bx, mY + 96, 100, 26, 0xef4444ff);
      } else {
        strokeRect(img, bx, mY + 96, 100, 26, 0xffffff0f);
      }
      img.print(fonts.font8, bx + 12, mY + 104, cats[c]);
    }

    // Input Key
    img.print(fonts.font8, mX + 24, mY + 134, "КЛЮЧ / ЗАГОЛОВОК");
    fillRect(img, mX + 24, mY + 148, mW - 48, 28, 0xffffff0a);
    strokeRect(img, mX + 24, mY + 148, mW - 48, 28, 0xffffff0f);
    img.print(fonts.font8, mX + 34, mY + 156, "User Preferred Theme");

    // Input Value
    img.print(fonts.font8, mX + 24, mY + 188, "СОДЕРЖИМОЕ (ТЕКСТ ИЛИ JSON)");
    fillRect(img, mX + 24, mY + 202, mW - 48, 70, 0xffffff0a);
    strokeRect(img, mX + 24, mY + 202, mW - 48, 70, 0xffffff0f);
    img.print(fonts.font8, mX + 34, mY + 212, "Темная палитра A.R.C. с красным реактором...");

    // Footer divider
    fillRect(img, mX, mY + mH - 56, mW, 1, 0xffffff0f);

    // Footer actions: Cancel + Save (Single primary)
    const canX = mX + mW - 170;
    strokeRect(img, canX, mY + mH - 42, 64, 28, 0xffffff0f);
    img.print(fonts.font8, canX + 12, mY + mH - 34, "Отмена");

    const saveX = mX + mW - 96;
    fillRect(img, saveX, mY + mH - 42, 72, 28, 0xef4444ff);
    img.print(fonts.font8, saveX + 14, mY + mH - 34, "Создать");
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

  // 1. memory-grid-1280x720.png
  const imgGrid = await renderMemoryScene(1280, 720, { isModalOpen: false, filename: 'memory-grid-1280x720.png', fonts });

  // 2. memory-column-400x800.png
  const imgColumn = await renderMemoryScene(400, 800, { isModalOpen: false, filename: 'memory-column-400x800.png', fonts });

  // 3. memory-form-modal-1280x720.png
  const imgModal = await renderMemoryScene(1280, 720, { isModalOpen: true, filename: 'memory-form-modal-1280x720.png', fonts });

  console.log('\n=== ТЗ ФАЗА 5, ЧАНК 2: КОЛОРИМЕТРИЯ MEMORY ===');

  // Check 1: Плоскость #0A0A0A (каналы <= 12, разброс <= 2)
  const ptPlane = getPixelChannels(imgGrid, 500, 500);
  console.log(`1. Плоскость var(--arc-plane) (x=500, y=500): R=${ptPlane.r}, G=${ptPlane.g}, B=${ptPlane.b} (${ptPlane.hex}) | Разброс max-min=${ptPlane.spread}`);

  // Check 2: Карточка в покое нейтральна R=G=B (x=450, y=200 - card 1 inside)
  const ptCardRest = getPixelChannels(imgGrid, 450, 200);
  console.log(`2. Карточка в покое (x=450, y=200): R=${ptCardRest.r}, G=${ptCardRest.g}, B=${ptCardRest.b} (${ptCardRest.hex}) | Разброс max-min=${ptCardRest.spread}`);

  // Check 3: Карточка в hover нейтральна R=G=B (x=150, y=200 - card 0 inside hover)
  const ptCardHover = getPixelChannels(imgGrid, 150, 200);
  console.log(`3. Карточка в hover (x=150, y=200): R=${ptCardHover.r}, G=${ptCardHover.g}, B=${ptCardHover.b} (${ptCardHover.hex}) | Разброс max-min=${ptCardHover.spread}`);

  // Check 4: Корпус модалки (var(--arc-popover), #141414)
  const ptModal = getPixelChannels(imgModal, 640, 360);
  console.log(`4. Корпус модалки var(--arc-popover) (x=640, y=360): R=${ptModal.r}, G=${ptModal.g}, B=${ptModal.b} (${ptModal.hex}) | Разброс max-min=${ptModal.spread}`);

  const planeOk = ptPlane.r <= 12 && ptPlane.g <= 12 && ptPlane.b <= 12 && ptPlane.spread <= 2;
  const cardRestOk = ptCardRest.spread <= 2 && ptCardRest.r <= 12;
  const cardHoverOk = ptCardHover.spread <= 1 && ptCardHover.r <= 22;
  const modalOk = ptModal.spread <= 1 && ptModal.r >= 18 && ptModal.r <= 22;

  console.log(`\nПлоскость <= 12, разброс <= 2: ${planeOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Карточка в покое нейтральна: ${cardRestOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Карточка в hover нейтральна: ${cardHoverOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Корпус модалки popover нейтрален: ${modalOk ? '✅ PASSED' : '❌ FAILED'}`);

  if (!planeOk || !cardRestOk || !cardHoverOk || !modalOk) {
    process.exit(1);
  }
  console.log('✅ ALL MEMORY PHASE 5 CHECKS PASSED.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
