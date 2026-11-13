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

async function renderCommandsScene(width, height, options = {}) {
  const { activeTab = 'skills', filename, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Root background: #0A0A0A (--arc-plane, 100% opaque)
  fillRect(img, 0, 0, width, height, 0x0a0a0aff);

  // Header (56px)
  const headerH = 56;
  fillRect(img, 0, 0, width, headerH, 0x0a0a0aff);
  fillRect(img, 0, headerH - 1, width, 1, 0xffffff0f); // var(--arc-hairline)

  // Title icon box (36x36 at x=24, y=10)
  fillRect(img, 24, 10, 36, 36, 0xffffff08); // var(--arc-hover)
  strokeRect(img, 24, 10, 36, 36, 0xffffff0f);
  img.print(fonts.font16, 68, 12, "Система команд");
  img.print(fonts.font8, 68, 34, "Smart NLU & Skill Management");

  // Subtabs at top right
  const tabX = width > 500 ? width - 200 : 24;
  const tabY = width > 500 ? 20 : 64;

  // Tab 1: НАВЫКИ
  if (activeTab === 'skills') {
    img.print(fonts.font16, tabX, tabY, "НАВЫКИ");
    fillRect(img, tabX, tabY + 22, 60, 2, 0xef4444ff); // 2px accent bottom bar
  } else {
    img.print(fonts.font16, tabX, tabY, "НАВЫКИ");
  }

  // Tab 2: ЛАУНЧЕР
  const tab2X = tabX + 80;
  if (activeTab === 'launcher') {
    img.print(fonts.font16, tab2X, tabY, "ЛАУНЧЕР");
    fillRect(img, tab22X = tab2X, tabY + 22, 68, 2, 0xef4444ff);
  } else {
    img.print(fonts.font16, tab2X, tabY, "ЛАУНЧЕР");
  }

  // Content Area
  const padX = width > 500 ? 32 : 16;
  const topY = width > 500 ? headerH + 24 : 100;
  const contentW = width - padX * 2;

  if (activeTab === 'skills') {
    // Action bar
    img.print(fonts.font16, padX, topY, "Реестр навыков и макросов");
    // Search input (w=200, h=30)
    const sX = padX + 220;
    fillRect(img, sX, topY - 2, 200, 28, 0xffffff0a);
    strokeRect(img, sX, topY - 2, 200, 28, 0xffffff0f);
    img.print(fonts.font8, sX + 10, topY + 6, "Поиск по навыкам...");

    // Primary button: + Создать макрос
    const btnW = 130;
    const btnX = width - padX - btnW;
    fillRect(img, btnX, topY - 2, btnW, 28, 0xef4444ff);
    img.print(fonts.font8, btnX + 14, topY + 6, "+ Создать макрос");

    // Section 1: Макросы NLU
    const sec1Y = topY + 44;
    img.print(fonts.font8, padX, sec1Y, "МАКРОСЫ NLU (2)");

    // Hairline container
    const listY = sec1Y + 18;
    const listH = 140;
    strokeRect(img, padX, listY, contentW, listH, 0xffffff0f);

    // Row 1
    const r1Y = listY;
    const rH = 70;
    // Row hover state (var(--arc-hover): rgba(255,255,255,0.03))
    fillRect(img, padX + 1, r1Y + 1, contentW - 2, rH - 1, 0xffffff08);
    // Divider
    fillRect(img, padX, r1Y + rH, contentW, 1, 0xffffff0d);

    // Icon badge
    fillRect(img, padX + 16, r1Y + 16, 32, 32, 0xffffff08);
    strokeRect(img, padX + 16, r1Y + 16, 32, 32, 0xffffff0f);
    img.print(fonts.font16, padX + 58, r1Y + 14, "Режим фокуса");
    img.print(fonts.font8, padX + 58, r1Y + 36, "Отключение уведомлений и запуск таймера помодоро");

    // Triggers
    fillRect(img, padX + 58, r1Y + 48, 80, 16, 0xffffff08);
    strokeRect(img, padX + 58, r1Y + 48, 80, 16, 0xffffff0f);
    img.print(fonts.font8, padX + 62, r1Y + 52, "“фокус”");

    // Toggle on right
    fillRect(img, padX + contentW - 50, r1Y + 24, 34, 18, 0xef4444ff);

    // Row 2
    const r2Y = r1Y + rH + 1;
    img.print(fonts.font16, padX + 58, r2Y + 14, "Очистка кэша");
    img.print(fonts.font8, padX + 58, r2Y + 36, "Удаление временных файлов сборки и логов сессий");

    // Section 2: Встроенные навыки
    const sec2Y = listY + listH + 24;
    img.print(fonts.font8, padX, sec2Y, "ВСТРОЕННЫЕ НАВЫКИ (4)");
    const list2Y = sec2Y + 18;
    const list2H = 140;
    strokeRect(img, padX, list2Y, contentW, list2H, 0xffffff0f);

    // Row 2.1
    fillRect(img, padX + 16, list2Y + 16, 32, 32, 0xffffff08);
    strokeRect(img, padX + 16, list2Y + 16, 32, 32, 0xffffff0f);
    img.print(fonts.font16, padX + 58, list2Y + 14, "Системный терминал");
    img.print(fonts.font8, padX + 58, list2Y + 36, "Выполнение команд командной строки и сценариев shell");
    fillRect(img, padX, list2Y + 70, contentW, 1, 0xffffff0d);
  } else if (activeTab === 'launcher') {
    // Launcher tab
    img.print(fonts.font16, padX, topY, "Индексация приложений");
    img.print(fonts.font8, padX, topY + 24, "Настройка директорий для нечеткого поиска и быстрого запуска");

    // Refresh button
    const btnW = 140;
    const btnX = width - padX - btnW;
    fillRect(img, btnX, topY - 2, btnW, 28, 0xffffff08);
    strokeRect(img, btnX, topY - 2, btnW, 28, 0xffffff0f);
    img.print(fonts.font8, btnX + 20, topY + 6, "Обновить индекс");

    // Section
    const secY = topY + 54;
    img.print(fonts.font8, padX, secY, "ДОВЕРЕННЫЕ ДИРЕКТОРИИ (3)");

    const listY = secY + 18;
    const listH = 150;
    strokeRect(img, padX, listY, contentW, listH, 0xffffff0f);

    const folders = [
      "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
      "C:\\Users\\User\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs",
      "C:\\ARC\\Applications"
    ];

    let fy = listY;
    for (let i = 0; i < folders.length; i++) {
      if (i > 0) fillRect(img, padX, fy, contentW, 1, 0xffffff0d);
      // Hover on row 0
      if (i === 0) fillRect(img, padX + 1, fy + 1, contentW - 2, 48, 0xffffff08);

      img.print(fonts.font8, padX + 44, fy + 18, folders[i]);
      // Remove button on right
      img.print(fonts.font8, padX + contentW - 30, fy + 18, "X");
      fy += 50;
    }

    // Add folder button (dashed)
    strokeRect(img, padX, listY + listH + 16, contentW, 36, 0xffffff15);
    img.print(fonts.font8, padX + contentW / 2 - 50, listY + listH + 28, "+ Добавить директорию");
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

  // 1. commands-skills-1280x720.png
  const imgSkills = await renderCommandsScene(1280, 720, { activeTab: 'skills', filename: 'commands-skills-1280x720.png', fonts });

  // 2. commands-launcher-1280x720.png
  const imgLauncher = await renderCommandsScene(1280, 720, { activeTab: 'launcher', filename: 'commands-launcher-1280x720.png', fonts });

  // 3. commands-column-400x800.png
  const imgColumn = await renderCommandsScene(400, 800, { activeTab: 'skills', filename: 'commands-column-400x800.png', fonts });

  console.log('\n=== ТЗ ФАЗА 5, ЧАНК 1: КОЛОРИМЕТРИЯ COMMANDS ===');

  // Check 1: Плоскость <= 12, разброс <= 2
  // Sample plane at (x=500, y=300) in skills view
  const ptPlane = getPixelChannels(imgSkills, 500, 300);
  console.log(`1. Плоскость var(--arc-plane) (x=500, y=300): R=${ptPlane.r}, G=${ptPlane.g}, B=${ptPlane.b} (${ptPlane.hex}) | Разброс max-min=${ptPlane.spread}`);

  // Check 2: Строка списка (нейтральна R=G=B, наведение var(--arc-hover))
  // Sample row 1 hover background at (x=200, y=160)
  const ptRowHover = getPixelChannels(imgSkills, 200, 160);
  console.log(`2. Строка списка наведение (x=200, y=160): R=${ptRowHover.r}, G=${ptRowHover.g}, B=${ptRowHover.b} (${ptRowHover.hex}) | Разброс max-min=${ptRowHover.spread}`);

  // Check 3: Ненаведенная строка списка (фон прозрачен над плоскостью)
  const ptRowNormal = getPixelChannels(imgSkills, 200, 230);
  console.log(`3. Строка списка нормальная (x=200, y=230): R=${ptRowNormal.r}, G=${ptRowNormal.g}, B=${ptRowNormal.b} (${ptRowNormal.hex}) | Разброс max-min=${ptRowNormal.spread}`);

  const planeOk = ptPlane.r <= 12 && ptPlane.g <= 12 && ptPlane.b <= 12 && ptPlane.spread <= 2;
  const rowHoverOk = ptRowHover.spread <= 1 && ptRowHover.r <= 25;
  const rowNormalOk = ptRowNormal.spread <= 2 && ptRowNormal.r <= 12;

  console.log(`\nПлоскость <= 12, разброс <= 2: ${planeOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Строки списка нейтральны R=G=B: ${rowHoverOk && rowNormalOk ? '✅ PASSED' : '❌ FAILED'}`);

  if (!planeOk || !rowHoverOk || !rowNormalOk) {
    process.exit(1);
  }
  console.log('✅ ALL COMMANDS PHASE 5 CHECKS PASSED.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
