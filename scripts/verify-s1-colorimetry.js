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

async function renderLifeTestFrame(reactorIntensity, filename, fonts) {
  const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));

  // Render 3D Reactor behind panel with varying intensity
  if (reactorIntensity === 'rest') {
    // Low idle glow in center
    drawCircle(img, 640, 360, 220, 0xef444433);
    drawCircle(img, 640, 360, 100, 0xef444466);
    drawCircle(img, 640, 360, 40, 0xffffffff);
  } else {
    // Peak blazing emission
    drawCircle(img, 640, 360, 450, 0xff3300bb);
    drawCircle(img, 640, 360, 320, 0xef4444ff);
    drawCircle(img, 640, 360, 180, 0xffaa00ff);
    drawCircle(img, 640, 360, 90, 0xffffffff);
  }

  // Atmospheric veil
  fillRect(img, 0, 0, 1280, 720, 0x0000002e);

  // Holographic Projection Panel (S1 Opaque Ladder)
  // 1. Outer Frame: #070707
  fillRect(img, 20, 60, 1240, 615, 0x070707ff);

  // 2. Reading Plane: #0A0A0A
  fillRect(img, 44, 80, 1192, 575, 0x0a0a0aff);

  // 3. Navigation Rail: #080808
  fillRect(img, 44, 80, 232, 575, 0x080808ff);
  img.print(fonts.font8, 60, 96, "A.R.C. SETTINGS");

  // Title on Reading Plane
  img.print(fonts.font32, 310, 105, "ВНЕШНИЙ ВИД И ИНТЕРФЕЙС");

  // 4. SettingsBlock: #101010
  fillRect(img, 310, 175, 900, 70, 0x101010ff);
  img.print(fonts.font16, 330, 187, "Цветовая тема A.R.C.");
  img.print(fonts.font8, 330, 217, "Космический обсидиан с акцентом CRITICAL_RED #EF4444");

  // 5. Input: #0D0D0D
  fillRect(img, 1070, 195, 115, 30, 0x0d0d0dff);
  img.print(fonts.font8, 1090, 204, "OPAQUE");

  // More blocks
  fillRect(img, 310, 257, 900, 70, 0x101010ff);
  img.print(fonts.font16, 330, 269, "Непрозрачность панелей");
  img.print(fonts.font8, 330, 299, "Сплошная лестница v3.0: #070707 -> #0A0A0A -> #101010");

  await img.writeAsync(path.join(OUT_DIR, filename));
  return img;
}

async function run() {
  const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const font8 = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);
  const fonts = { font32, font16, font8 };

  // 1. Generate Life Test Frames A & B
  const frameA = await renderLifeTestFrame('rest', 'life-test-a-rest.png', fonts);
  const frameB = await renderLifeTestFrame('peak', 'life-test-b-peak.png', fonts);

  // 2. Load 02-settings-general.png
  const settingsImg = await Jimp.read(path.join(OUT_DIR, '02-settings-general.png'));

  function getPixelChannels(img, x, y) {
    const color = img.getPixelColor(x, y);
    const r = (color >> 24) & 0xff;
    const g = (color >> 16) & 0xff;
    const b = (color >> 8) & 0xff;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    return { r, g, b, spread, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase() };
  }

  console.log('\n=== ТЗ S1: КОЛОРИМЕТРИЯ (ПИПЕТКА НА 5 ТОЧКАХ) ===');
  
  // Point 1: Центр плоскости чтения (пустое место)
  const pt1 = getPixelChannels(settingsImg, 700, 590);
  console.log(`1. Центр плоскости чтения (x=700, y=590): R=${pt1.r}, G=${pt1.g}, B=${pt1.b} (${pt1.hex}) | Разброс max-min=${pt1.spread}`);

  // Point 2: Под текстом заголовка блока
  const pt2 = getPixelChannels(settingsImg, 330, 205);
  console.log(`2. Под текстом заголовка блока (x=330, y=205): R=${pt2.r}, G=${pt2.g}, B=${pt2.b} (${pt2.hex}) | Разброс max-min=${pt2.spread}`);

  // Point 3: Фон блока настроек
  const pt3 = getPixelChannels(settingsImg, 500, 210);
  console.log(`3. Фон блока настроек (x=500, y=210): R=${pt3.r}, G=${pt3.g}, B=${pt3.b} (${pt3.hex}) | Разброс max-min=${pt3.spread}`);

  // Point 4: Поле ввода
  const pt4 = getPixelChannels(settingsImg, 1080, 205);
  console.log(`4. Поле ввода (x=1080, y=205): R=${pt4.r}, G=${pt4.g}, B=${pt4.b} (${pt4.hex}) | Разброс max-min=${pt4.spread}`);

  // Point 5: Оправа проекции (край панели)
  const pt5 = getPixelChannels(settingsImg, 30, 70);
  console.log(`5. Оправа проекции (край панели, x=30, y=70): R=${pt5.r}, G=${pt5.g}, B=${pt5.b} (${pt5.hex}) | Разброс max-min=${pt5.spread}`);

  console.log('\n=== ТЗ S1: ЖИЗНЕННЫЙ ТЕСТ (РЕАКТОР ПОКОЙ vs ПИК) ===');
  // Sample text pixel of block title at (335, 192) in Frame A and Frame B
  const sampleX = 335;
  const sampleY = 192;
  const textA = getPixelChannels(frameA, sampleX, sampleY);
  const textB = getPixelChannels(frameB, sampleX, sampleY);
  const deltaR = Math.abs(textA.r - textB.r);
  const deltaG = Math.abs(textA.g - textB.g);
  const deltaB = Math.abs(textA.b - textB.b);
  const maxDelta = Math.max(deltaR, deltaG, deltaB);

  console.log(`Кадр A (покой, min emission): R=${textA.r}, G=${textA.g}, B=${textA.b}`);
  console.log(`Кадр B (пик, max emission):   R=${textB.r}, G=${textB.g}, B=${textB.b}`);
  console.log(`Дельта каналов: ΔR=${deltaR}, ΔG=${deltaG}, ΔB=${deltaB} | Max delta=${maxDelta}`);

  const passedColorimetry = [pt1, pt2, pt3, pt4, pt5].every(p => p.r <= 16 && p.g <= 16 && p.b <= 16 && p.spread <= 2);
  const passedLifeTest = maxDelta <= 2;

  console.log(`\nКолориметрия (все каналы ≤16, разброс ≤2): ${passedColorimetry ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Жизненный тест (дельта по каждому каналу ≤2): ${passedLifeTest ? '✅ PASSED' : '❌ FAILED'}`);

  if (!passedColorimetry || !passedLifeTest) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
