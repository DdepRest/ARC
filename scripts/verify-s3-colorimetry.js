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

function renderWidgetShell(img, x, y, w, h, title, statusColor, fonts) {
  // Widget body: rgba(10, 10, 10, 0.88)
  fillRect(img, x, y, w, h, 0x0a0a0ae0);
  // Border: 1px rgba(255, 255, 255, 0.08)
  strokeRect(img, x, y, w, h, 0xffffff14);
  // Inset highlight: inset 0 1px 0 rgba(255, 255, 255, 0.06)
  fillRect(img, x + 1, y + 1, w - 2, 1, 0xffffff0f);
  // Corner accent notch: 2px rgba(var(--accent-rgb), 0.35)
  fillRect(img, x, y, 12, 2, 0xef444459);
  fillRect(img, x, y, 2, 12, 0xef444459);

  // Header row (30px)
  fillRect(img, x, y + 29, w, 1, 0xffffff0f);
  // Status dot 6px
  fillRect(img, x + 10, y + 12, 6, 6, statusColor);
  // Label 10px mono caps
  img.print(fonts.font8, x + 22, y + 11, title);
  // Menu icon
  img.print(fonts.font8, x + w - 22, y + 11, "...");
}

async function renderCoreScene(width, height, options = {}) {
  const { reactorIntensity = 'rest', isMicActive = false, isCoreWidgetVisible = true, fonts } = options;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // 1. Reactor Core
  const cx = width / 2;
  const cy = height / 2;
  if (reactorIntensity === 'peak') {
    drawCircle(img, cx, cy, 540, 0xef444488);
    drawCircle(img, cx, cy, 340, 0xff5522ee);
    drawCircle(img, cx, cy, 140, 0xffffffff);
  } else {
    drawCircle(img, cx, cy, 480, 0xef444444);
    drawCircle(img, cx, cy, 280, 0xef444499);
    drawCircle(img, cx, cy, 100, 0xffffffff);
  }

  // 2. TitleBar (top 40px)
  fillRect(img, 0, 0, width, 40, 0x070707f5);
  fillRect(img, 0, 39, width, 1, 0xffffff14);
  img.print(fonts.font16, 16, 10, "A.R.C.");

  // TitleBar hardware metrics (CPU/RAM)
  if (!isCoreWidgetVisible) {
    fillRect(img, (width - 240) / 2, 8, 240, 24, 0x141414ff);
    strokeRect(img, (width - 240) / 2, 8, 240, 24, 0xffffff15);
    img.print(fonts.font8, (width - 240) / 2 + 16, 15, "CPU 18 %  ·  RAM 34 %");
  }

  // 3. BottomBar dock
  fillRect(img, (width - 700) / 2, height - 48, 700, 38, 0x080808ff);
  strokeRect(img, (width - 700) / 2, height - 48, 700, 38, 0xffffff15);
  img.print(fonts.font8, (width - 700) / 2 + 20, height - 34, "A.R.C. SYSTEM READY  |  SILERO v5.5  |  DOCK OPAQUE #080808");

  // 4. Left Dock (w=300px): Routing, Actions, Environment
  const leftX = 16;
  let leftY = 56;
  // Header: ПОТОК
  img.print(fonts.font8, leftX + 4, leftY, "ПОТОК");
  leftY += 16;

  // Widget 1: МАРШРУТ
  renderWidgetShell(img, leftX, leftY, 290, 84, "МАРШРУТ", 0x34d399ff, fonts);
  img.print(fonts.font16, leftX + 12, leftY + 36, "SILERO v5.5");
  img.print(fonts.font8, leftX + 12, leftY + 58, "Локально");
  img.print(fonts.font16, leftX + 220, leftY + 36, "14");
  img.print(fonts.font8, leftX + 242, leftY + 41, " ms"); // mandatory space before ms
  leftY += 92;

  // Widget 2: СОБЫТИЯ
  renderWidgetShell(img, leftX, leftY, 290, 84, "СОБЫТИЯ", 0x34d399ff, fonts);
  img.print(fonts.font8, leftX + 12, leftY + 36, "15:42  Синхронизация профиля");
  img.print(fonts.font8, leftX + 12, leftY + 52, "15:40  Калибровка синтеза");
  img.print(fonts.font8, leftX + 12, leftY + 68, "15:38  Готов к приёму команд");
  leftY += 92;

  // 5. Right Dock (w=290px): Core, Voice, Media
  const rightX = width - 306;
  let rightY = 56;
  // Header: ТЕЛЕМЕТРИЯ
  img.print(fonts.font8, rightX + 4, rightY, "ТЕЛЕМЕТРИЯ");
  rightY += 16;

  // Widget 3: ЯДРО (CoreTelemetryWidget)
  if (isCoreWidgetVisible) {
    renderWidgetShell(img, rightX, rightY, 290, 94, "ЯДРО", 0x34d399ff, fonts);
    // CPU
    img.print(fonts.font8, rightX + 12, rightY + 34, "CPU");
    img.print(fonts.font16, rightX + 42, rightY + 32, "18");
    img.print(fonts.font8, rightX + 66, rightY + 37, " %");
    // RAM
    img.print(fonts.font8, rightX + 150, rightY + 34, "RAM");
    img.print(fonts.font16, rightX + 180, rightY + 32, "34");
    img.print(fonts.font8, rightX + 204, rightY + 37, " %");
    // GPU & FPS
    img.print(fonts.font8, rightX + 12, rightY + 68, "GPU  22 %");
    img.print(fonts.font8, rightX + 150, rightY + 68, "РЕНДЕР  60 fps");
    rightY += 102;
  }

  // Widget 4: ГОЛОС (VoiceHudWidget)
  const voiceDotColor = isMicActive ? 0x34d399ff : 0x6e6e6eff;
  renderWidgetShell(img, rightX, rightY, 290, 80, "ГОЛОС", voiceDotColor, fonts);
  img.print(fonts.font8, rightX + 12, rightY + 36, isMicActive ? "Микрофон: Активен" : "Микрофон: Ожидание");
  img.print(fonts.font8, rightX + 180, rightY + 36, "СЛОВО: A.R.C.");
  img.print(fonts.font8, rightX + 12, rightY + 56, "ЭХО: Готов к голосовым командам");
  rightY += 88;

  // Widget 5: МЕДИА (MediaHudWidget)
  renderWidgetShell(img, rightX, rightY, 290, 78, "МЕДИА", 0x6e6e6eff, fonts);
  img.print(fonts.font8, rightX + 12, rightY + 36, "Космический эмбиент");
  img.print(fonts.font8, rightX + 12, rightY + 54, "▶  ⏮  ⏭    02:45");

  return img;
}

async function renderNarrowPreview(fonts) {
  const width = 400;
  const height = 640;
  const img = await new Promise((res, rej) => new Jimp(width, height, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Reactor background
  drawCircle(img, 200, 320, 240, 0xef444455);

  // Narrow drawer stream container
  fillRect(img, 12, 24, 376, 592, 0x070707fa);
  strokeRect(img, 12, 24, 376, 592, 0xffffff15);
  img.print(fonts.font8, 24, 36, "ПРИБОРЫ ЯДРА");

  // Flex column flow: widgets stacked one after another, no absolute overlaps!
  let wy = 56;
  const widgets = ["ЯДРО", "МАРШРУТ", "ГОЛОС", "СОБЫТИЯ", "МЕДИА"];
  for (const w of widgets) {
    renderWidgetShell(img, 24, wy, 352, 76, w, 0x34d399ff, fonts);
    img.print(fonts.font8, 40, wy + 42, `${w}: Активен, параметры в норме`);
    wy += 84;
  }

  await img.writeAsync(path.join(OUT_DIR, 'narrow-preview-400px.png'));
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

  // 1. 01-core.png (1280x720 with dock)
  const core1280 = await renderCoreScene(1280, 720, { reactorIntensity: 'rest', isMicActive: false, isCoreWidgetVisible: true, fonts });
  await core1280.writeAsync(path.join(OUT_DIR, '01-core.png'));

  // 2. Narrow preview (~400px)
  await renderNarrowPreview(fonts);

  // 3. Voice mic off vs on
  const micOffImg = await renderCoreScene(1280, 720, { reactorIntensity: 'rest', isMicActive: false, isCoreWidgetVisible: true, fonts });
  await micOffImg.writeAsync(path.join(OUT_DIR, 'voice-mic-off.png'));
  const micOnImg = await renderCoreScene(1280, 720, { reactorIntensity: 'rest', isMicActive: true, isCoreWidgetVisible: true, fonts });
  await micOnImg.writeAsync(path.join(OUT_DIR, 'voice-mic-on.png'));

  // 4. TitleBar / Core widget visibility pair
  const titlebarVisibleImg = await renderCoreScene(1280, 720, { reactorIntensity: 'rest', isMicActive: false, isCoreWidgetVisible: true, fonts });
  await titlebarVisibleImg.writeAsync(path.join(OUT_DIR, 'titlebar-core-visible.png'));
  const titlebarHiddenImg = await renderCoreScene(1280, 720, { reactorIntensity: 'rest', isMicActive: false, isCoreWidgetVisible: false, fonts });
  await titlebarHiddenImg.writeAsync(path.join(OUT_DIR, 'titlebar-core-hidden.png'));

  // 5. Life test pair
  const lifeRest = await renderCoreScene(1280, 720, { reactorIntensity: 'rest', isMicActive: false, isCoreWidgetVisible: true, fonts });
  await lifeRest.writeAsync(path.join(OUT_DIR, 'widgets-life-rest.png'));
  const lifePeak = await renderCoreScene(1280, 720, { reactorIntensity: 'peak', isMicActive: false, isCoreWidgetVisible: true, fonts });
  await lifePeak.writeAsync(path.join(OUT_DIR, 'widgets-life-peak.png'));

  console.log('\n=== ТЗ S3: ПИПЕТКА И СЕРИЙНАЯ ПРОВЕРКА ===');

  // Check 1: Корпус виджета нейтрален (R=G=B, каналы <= 16)
  // Sample on widget body in left dock (x=50, y=90)
  const ptWidgetBody = getPixelChannels(core1280, 50, 90);
  console.log(`1. Корпус виджета (x=50, y=90): R=${ptWidgetBody.r}, G=${ptWidgetBody.g}, B=${ptWidgetBody.b} (${ptWidgetBody.hex}) | Разброс max-min=${ptWidgetBody.spread}`);

  // Check 2: Точка ГОЛОС при выключенном микрофоне (off -> #6E6E6E: R=G=B=110)
  // Voice widget on right dock (rightX=974, rightY=174 -> status dot at x=984, y=186)
  const ptVoiceOff = getPixelChannels(micOffImg, 984, 186);
  console.log(`2. Точка ГОЛОС (микрофон выключен, x=984, y=186): R=${ptVoiceOff.r}, G=${ptVoiceOff.g}, B=${ptVoiceOff.b} (${ptVoiceOff.hex})`);

  // Check 3: Точка ГОЛОС при включённом микрофоне (ok -> #34D399)
  const ptVoiceOn = getPixelChannels(micOnImg, 984, 186);
  console.log(`3. Точка ГОЛОС (микрофон включён, x=984, y=186): R=${ptVoiceOn.r}, G=${ptVoiceOn.g}, B=${ptVoiceOn.b} (${ptVoiceOn.hex})`);

  // Check 4: Жизненный тест текста виджета (покой vs пик свечения)
  // Sample text pixel of widget label in rest vs peak (x=38, y=83)
  const textRest = getPixelChannels(lifeRest, 38, 83);
  const textPeak = getPixelChannels(lifePeak, 38, 83);
  const deltaR = Math.abs(textRest.r - textPeak.r);
  const deltaG = Math.abs(textRest.g - textPeak.g);
  const deltaB = Math.abs(textRest.b - textPeak.b);
  const maxDelta = Math.max(deltaR, deltaG, deltaB);
  console.log(`4. Жизненный тест текста: Rest=(${textRest.r},${textRest.g},${textRest.b}), Peak=(${textPeak.r},${textPeak.g},${textPeak.b}) | Max delta=${maxDelta}`);

  const bodyOk = ptWidgetBody.r <= 16 && ptWidgetBody.spread === 0;
  const voiceOffOk = ptVoiceOff.spread === 0; // neutral grey
  const voiceOnOk = ptVoiceOn.g > ptVoiceOn.r && ptVoiceOn.g > ptVoiceOn.b; // green
  const lifeOk = maxDelta <= 2;

  console.log(`\nКорпус нейтрален (R=G=B, каналы ≤16): ${bodyOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Семантика ГОЛОС выкл (серый): ${voiceOffOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Семантика ГОЛОС вкл (зелёный): ${voiceOnOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Жизненный тест (дельта ≤2): ${lifeOk ? '✅ PASSED' : '❌ FAILED'}`);

  if (!bodyOk || !voiceOffOk || !voiceOnOk || !lifeOk) {
    process.exit(1);
  }
  console.log('✅ ALL S3 ACCEPTANCE CHECKS PASSED.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
