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

function strokeRect(img, x, y, w, h, rgba, thickness = 1) {
  fillRect(img, x, y, w, thickness, rgba);
  fillRect(img, x, y + h - thickness, w, thickness, rgba);
  fillRect(img, x, y, thickness, h, rgba);
  fillRect(img, x + w - thickness, y, thickness, h, rgba);
}

function drawCircle(img, cx, cy, r, rgba) {
  const r2 = r * r;
  const rIn2 = (r - 2) * (r - 2);
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
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2 && d2 >= rIn2) {
      this.bitmap.data[idx + 0] = Math.round(cr * ca + this.bitmap.data[idx + 0] * (1 - ca));
      this.bitmap.data[idx + 1] = Math.round(cg * ca + this.bitmap.data[idx + 1] * (1 - ca));
      this.bitmap.data[idx + 2] = Math.round(cb * ca + this.bitmap.data[idx + 2] * (1 - ca));
      this.bitmap.data[idx + 3] = 255;
    }
  });
}

async function renderChrome(img, fonts, activeTabName) {
  const { font16, font8 } = fonts;
  // Background
  fillRect(img, 0, 0, 1280, 720, 0x070709ff);

  // TitleBar
  fillRect(img, 0, 0, 1280, 36, 0x0b0b0dff);
  strokeRect(img, 0, 35, 1280, 1, 0xffffff15);
  img.print(font16, 20, 9, "A.R.C. COGNITIVE ENGINE // v1.0.12");
  img.print(font8, 820, 14, "STATUS: NOMINAL  |  CPU: 14%  |  RAM: 1.2 GB  |  FPS: 60.0");

  // Window buttons
  strokeRect(img, 1210, 10, 14, 14, 0xffffff40);
  strokeRect(img, 1235, 10, 14, 14, 0xffffff40);
  strokeRect(img, 1260, 10, 14, 14, 0xef4444aa);

  // TabBar
  fillRect(img, 0, 36, 1280, 36, 0x09090cff);
  strokeRect(img, 0, 71, 1280, 1, 0xffffff15);

  const tabs = ["CORE", "CHAT", "TASKS", "OBJECTIVES", "MEMORY", "COMMANDS", "SETTINGS"];
  let tx = 20;
  for (const tab of tabs) {
    const isActive = tab === activeTabName;
    if (isActive) {
      fillRect(img, tx - 6, 42, 92, 26, 0xef444422);
      strokeRect(img, tx - 6, 68, 92, 2, 0xef4444ff);
      img.print(font16, tx, 46, `[${tab}]`);
    } else {
      img.print(font8, tx + 6, 50, tab);
    }
    tx += 105;
  }

  // BottomBar
  fillRect(img, 0, 686, 1280, 34, 0x09090cff);
  strokeRect(img, 0, 686, 1280, 1, 0xffffff15);
  img.print(font8, 20, 698, "VOICE: READY [WAKE_WORD_ONLY]  |  VAD: ACTIVE (-26dB)  |  DSP: ENABLED  |  LLM: READY");
  img.print(font8, 1050, 698, "SYSTEM INTEGRITY: 100%");
}

async function generateAll() {
  const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const font8 = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);
  const fonts = { font32, font16, font8 };

  // 1. 01-core.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "CORE");

    // 3D Reactor chamber circle
    for (let r = 40; r <= 190; r += 25) {
      drawCircle(img, 640, 360, r, 0xef444488);
    }
    drawCircle(img, 640, 360, 210, 0xffffff20);
    drawCircle(img, 640, 360, 230, 0xffffff10);
    fillRect(img, 620, 340, 40, 40, 0xef4444dd);
    img.print(font16, 608, 350, "CORE");

    // Left HUD
    fillRect(img, 40, 120, 260, 220, 0x0c0c12aa);
    strokeRect(img, 40, 120, 260, 220, 0xffffff15);
    strokeRect(img, 40, 120, 260, 24, 0xef444455);
    img.print(font8, 50, 127, "REACTOR TELEMETRY [PRIMARY]");
    img.print(font16, 50, 160, "POWER: 98.4%");
    img.print(font16, 50, 195, "TEMP: 342.1 K");
    img.print(font16, 50, 230, "FLUX: 1.042 MW");
    img.print(font8, 50, 275, "STABILIZER COHERENCE: LOCKED");
    img.print(font8, 50, 300, "GRID COUPLING: SYNCHRONIZED");

    // Right HUD
    fillRect(img, 980, 120, 260, 220, 0x0c0c12aa);
    strokeRect(img, 980, 120, 260, 220, 0xffffff15);
    strokeRect(img, 980, 120, 260, 24, 0xffffff20);
    img.print(font8, 990, 127, "SYSTEM HEALTH & NODES");
    img.print(font16, 990, 160, "NODES: 8 ACTIVE");
    img.print(font16, 990, 195, "GPU VRAM: 420 MB");
    img.print(font16, 990, 230, "LATENCY: 14 ms");
    img.print(font8, 990, 275, "AUDIO CHANNEL: SILERO v5.5");
    img.print(font8, 990, 300, "STT ENGINE: WHISPER-INT8");

    // Command Center Prompt Capsule at bottom
    fillRect(img, 320, 615, 640, 48, 0x0c0c12ee);
    strokeRect(img, 320, 615, 640, 48, 0xef444466);
    img.print(font16, 345, 630, "> Ask A.R.C. or enter command... [Press Enter]");

    await img.writeAsync(path.join(OUT_DIR, '01-core.png'));
  }

  // 2. 02-settings-general.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "SETTINGS");

    // Holographic Outer Frame: #070707 (RGBA: 7, 7, 7, 255)
    fillRect(img, 20, 60, 1240, 615, 0x070707ff);
    strokeRect(img, 20, 60, 1240, 615, 0xffffff14);

    // Inner Reading Plane: #0A0A0A (RGBA: 10, 10, 10, 255)
    fillRect(img, 44, 80, 1192, 575, 0x0a0a0aff);

    // Navigation Rail / Sidebar: #080808 (RGBA: 8, 8, 8, 255)
    fillRect(img, 44, 80, 232, 575, 0x080808ff);
    strokeRect(img, 44, 80, 232, 575, 0xffffff10);
    img.print(font8, 60, 96, "A.R.C. SETTINGS");

    const sections = ["Внешний вид", "Интеллект и модели", "Голос и звук", "Система", "Безопасность", "Хранилище"];
    let sy = 130;
    for (const sec of sections) {
      if (sec === "Внешний вид") {
        fillRect(img, 52, sy - 4, 216, 28, 0xef444422);
        strokeRect(img, 52, sy - 4, 3, 28, 0xef4444ff);
        img.print(font16, 64, sy, sec);
      } else {
        img.print(font8, 64, sy + 4, sec);
      }
      sy += 40;
    }

    // Main Settings Area (Reading Plane #0A0A0A)
    img.print(font32, 310, 105, "ВНЕШНИЙ ВИД И ИНТЕРФЕЙС");
    strokeRect(img, 310, 150, 900, 1, 0xffffff10);

    // SettingsBlock: #101010 (RGBA: 16, 16, 16, 255)
    const rows = [
      { title: "Цветовая тема A.R.C.", desc: "Космический обсидиан с акцентом CRITICAL_RED #EF4444", val: "DEFAULT" },
      { title: "Непрозрачность панелей", desc: "Сплошная лестница v3.0: #070707 -> #0A0A0A -> #101010 без просвечивания", val: "OPAQUE" },
      { title: "Масштаб интерфейса", desc: "Инженерная плотность элементов 100% (базовый 14px)", val: "100%" },
      { title: "Скрытие второстепенных параметров", desc: "Компактный режим отображения для оперативной работы", val: "ВКЛ" },
      { title: "Положение панели навигации", desc: "Расположение системных вкладок на экране", val: "СНИЗУ" }
    ];

    let ry = 175;
    for (const row of rows) {
      // SettingsBlock container (#101010)
      fillRect(img, 310, ry, 900, 70, 0x101010ff);
      strokeRect(img, 310, ry, 900, 70, 0xffffff10);
      img.print(font16, 330, ry + 12, row.title);
      img.print(font8, 330, ry + 42, row.desc);

      // Input / Action field (#0D0D0D)
      fillRect(img, 1070, ry + 20, 115, 30, 0x0d0d0dff);
      strokeRect(img, 1070, ry + 20, 115, 30, 0xffffff18);
      img.print(font8, 1090, ry + 29, row.val);
      ry += 82;
    }

    await img.writeAsync(path.join(OUT_DIR, '02-settings-general.png'));
  }

  // 3. 03-settings-providers.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "SETTINGS");

    // Sidebar
    fillRect(img, 30, 95, 230, 560, 0x0a0a0ecc);
    strokeRect(img, 30, 95, 230, 560, 0xffffff15);
    img.print(font8, 45, 110, "SETTINGS CATEGORIES");

    const sections = ["General", "AI Providers", "Model Hub", "Routing & Fallback", "Voice Models", "Diagnostics"];
    let sy = 145;
    for (const sec of sections) {
      if (sec === "AI Providers") {
        fillRect(img, 38, sy - 4, 214, 28, 0xef444422);
        strokeRect(img, 38, sy - 4, 3, 28, 0xef4444ff);
        img.print(font16, 50, sy, sec);
      } else {
        img.print(font8, 50, sy + 4, sec);
      }
      sy += 40;
    }

    // Main Panel
    fillRect(img, 280, 95, 970, 560, 0x0b0b0fee);
    strokeRect(img, 280, 95, 970, 560, 0xffffff15);
    img.print(font32, 310, 120, "AI PROVIDERS & MODELS");
    strokeRect(img, 310, 165, 910, 1, 0xffffff15);

    // Provider Cards
    const providers = [
      { name: "OLLAMA ENGINE (LOCAL)", host: "http://127.0.0.1:11434", model: "llama3.2:3b", status: "ONLINE", col: 0x22c55e },
      { name: "GOOGLE GEMINI API", host: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash", status: "READY", col: 0xef4444 },
      { name: "OPENAI COMPATIBLE", host: "https://api.openai.com/v1", model: "gpt-4o-mini", status: "STANDBY", col: 0x3b82f6 }
    ];

    let py = 185;
    for (const prov of providers) {
      fillRect(img, 310, py, 910, 100, 0x111118aa);
      strokeRect(img, 310, py, 910, 100, 0xffffff15);
      img.print(font16, 330, py + 14, prov.name);
      img.print(font8, 330, py + 46, `ENDPOINT: ${prov.host}`);
      img.print(font8, 330, py + 68, `ACTIVE MODEL: ${prov.model}`);

      // Status pill
      fillRect(img, 1110, py + 25, 90, 26, (prov.col << 8) | 0x33);
      strokeRect(img, 1110, py + 25, 90, 26, (prov.col << 8) | 0xbb);
      img.print(font8, 1125, py + 33, prov.status);

      py += 115;
    }

    // Health note
    img.print(font8, 310, 545, "PROVIDER HEALTH RULE: 400 & 404 DO NOT TRIGGER QUARANTINE. RESET COOLDOWN ON TEST.");

    await img.writeAsync(path.join(OUT_DIR, '03-settings-providers.png'));
  }

  // 4. 04-tasks.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "TASKS");

    // Header sub-bar
    fillRect(img, 30, 85, 1220, 44, 0x0c0c12ee);
    strokeRect(img, 30, 85, 1220, 44, 0xffffff15);
    img.print(font16, 45, 98, "TASKS CONSOLE & ACTION MATRIX");
    img.print(font8, 860, 102, "FILTER: ALL CATEGORIES  |  SORT: PRIORITY  |  SPRINT: 25:00");

    // 3 Kanban Columns
    const cols = [
      { name: "BACKLOG & QUEUE (3)", x: 30, tasks: ["Refactor Audio Buffers", "Sync VK Music Tampermonkey", "Index Long-term Memory"] },
      { name: "IN PROGRESS (2)", x: 445, tasks: ["UI Layout Stabilization", "STT Never Dead Circuit Breaker"] },
      { name: "COMPLETED (4)", x: 860, tasks: ["WeakRef Memory Leak Fix", "Silero TTS DSP Pipeline", "Stage 4 Chat Space Lock", "Port 3000 Dev Server Setup"] }
    ];

    for (const c of cols) {
      fillRect(img, c.x, 145, 390, 510, 0x09090ecc);
      strokeRect(img, c.x, 145, 390, 510, 0xffffff15);
      strokeRect(img, c.x, 145, 390, 32, 0xffffff10);
      img.print(font8, c.x + 16, 154, c.name);

      let ty = 190;
      for (const t of c.tasks) {
        fillRect(img, c.x + 12, ty, 366, 68, 0x12121aaa);
        strokeRect(img, c.x + 12, ty, 366, 68, 0xffffff10);
        img.print(font16, c.x + 24, ty + 12, t);
        img.print(font8, c.x + 24, ty + 42, "ID: TSK-0842  |  WEIGHT: 5  |  PRIORITY: HIGH");
        ty += 80;
      }
    }

    await img.writeAsync(path.join(OUT_DIR, '04-tasks.png'));
  }

  // 5. 05-chat.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "CHAT");

    // Left Sessions Sidebar
    fillRect(img, 30, 85, 260, 580, 0x0a0a0ecc);
    strokeRect(img, 30, 85, 260, 580, 0xffffff15);
    img.print(font8, 45, 98, "CHAT SESSIONS ARCHIVE");

    const sessions = [
      { title: "UI Rework Architecture", date: "Today, 17:04", count: "12 msgs", active: true },
      { title: "Silero Audio DSP Tuning", date: "Yesterday", count: "28 msgs", active: false },
      { title: "Memory System Indexing", date: "Sep 23", count: "16 msgs", active: false },
      { title: "GigaAM STT Hot-Swap", date: "Sep 22", count: "42 msgs", active: false }
    ];

    let sy = 130;
    for (const s of sessions) {
      if (s.active) {
        fillRect(img, 38, sy, 244, 56, 0xef444422);
        strokeRect(img, 38, sy, 244, 56, 0xef444488);
      } else {
        fillRect(img, 38, sy, 244, 56, 0x111116aa);
        strokeRect(img, 38, sy, 244, 56, 0xffffff08);
      }
      img.print(font16, 50, sy + 8, s.title);
      img.print(font8, 50, sy + 34, `${s.date} - ${s.count}`);
      sy += 66;
    }

    // Main Chat Conversation Stream
    fillRect(img, 305, 85, 945, 505, 0x0b0b0fee);
    strokeRect(img, 305, 85, 945, 505, 0xffffff15);

    // User Message Bubble
    fillRect(img, 460, 115, 770, 70, 0x1a1a24cc);
    strokeRect(img, 460, 115, 770, 70, 0xffffff15);
    img.print(font8, 475, 125, "USER // 17:02:14");
    img.print(font16, 475, 148, "Run full system diagnostic and confirm reactor stability.");

    // Assistant Response Bubble
    fillRect(img, 325, 205, 820, 160, 0x12121ecc);
    strokeRect(img, 325, 205, 820, 160, 0xef444433);
    img.print(font8, 345, 218, "A.R.C. COGNITIVE ENGINE // RESPONSE");
    img.print(font16, 345, 242, "All diagnostic routines completed successfully.");
    img.print(font8, 345, 276, "- Reactor Core: Nominal (342.1 K, 60.0 FPS stable)");
    img.print(font8, 345, 296, "- Voice Pipeline: Silero v5.5 ready, buffer reset verified");
    img.print(font8, 345, 316, "- Sandbox FS: Secure isolation maintained in ./data/");

    // Chat Input Capsule
    fillRect(img, 305, 605, 945, 55, 0x0c0c12ee);
    strokeRect(img, 305, 605, 945, 55, 0xef444455);
    img.print(font16, 330, 622, "Type your request or speak with wake-word 'Арк'...");

    await img.writeAsync(path.join(OUT_DIR, '05-chat.png'));
  }

  // 6. 06-memory.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "MEMORY");

    // Header Toolbar
    fillRect(img, 30, 85, 1220, 48, 0x0c0c12ee);
    strokeRect(img, 30, 85, 1220, 48, 0xffffff15);
    img.print(font16, 45, 98, "LONG-TERM COGNITIVE MEMORY ARCHIVE");
    img.print(font8, 830, 104, "SEARCH: [ All Tags ]  |  TOTAL NODES: 142  |  INTEGRITY: 100%");

    // 2x3 Grid of Memory Cards
    const cards = [
      { title: "Visual Constitution", tag: "DIRECTIVE", text: "Deep black background #070709, ARC RED accent, glassmorphism." },
      { title: "Silero Audio Server", tag: "AUDIO", text: "Dedicated Python service running v5.5 ru model with custom DSP." },
      { title: "Portable Storage", tag: "STORAGE", text: "app.setPath userData strictly in ./data/ for absolute portability." },
      { title: "STT Never Dead", tag: "VOICE", text: "Sacrificial process validation, circuit breaker after 2 crashes." },
      { title: "400 Lines Limit", tag: "ARCHITECTURE", text: "Enforced via check-file-sizes.js during build step." },
      { title: "VK Music Bridge", tag: "INTEGRATION", text: "Websocket server on port 8089 receiving song telemetry." }
    ];

    for (let i = 0; i < cards.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = 30 + col * 415;
      const cy = 150 + row * 250;

      fillRect(img, cx, cy, 390, 225, 0x0d0d14ee);
      strokeRect(img, cx, cy, 390, 225, 0xffffff15);
      strokeRect(img, cx, cy, 390, 26, 0xffffff10);

      fillRect(img, cx + 295, cy + 4, 85, 18, 0xef444433);
      img.print(font8, cx + 305, cy + 8, cards[i].tag);

      img.print(font16, cx + 18, cy + 40, cards[i].title);
      img.print(font8, cx + 18, cy + 78, cards[i].text);
      img.print(font8, cx + 18, cy + 190, "LAST ACCESSED: 2026-09-25  |  CONFIDENCE: 0.98");
    }

    await img.writeAsync(path.join(OUT_DIR, '06-memory.png'));
  }

  // 7. 07-commands.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "COMMANDS");

    // Sub-header tabs
    fillRect(img, 30, 85, 1220, 44, 0x0c0c12ee);
    strokeRect(img, 30, 85, 1220, 44, 0xffffff15);
    img.print(font16, 45, 98, "COMMAND PALETTE & MACRO PIPELINE");
    img.print(font8, 850, 102, "[LAUNCHER]   [MACRO EDITOR]   [SKILLS]   [KEYS]");

    // Command List / Macro Cards
    const commands = [
      { name: "Start Electron Dev Environment", trigger: "Ctrl+Shift+D", desc: "Runs electron-vite with hot-reload and sandbox IPC" },
      { name: "Execute Silero TTS Verification", trigger: "Ctrl+Shift+S", desc: "Tests voice synthesize pipeline and DSP filters" },
      { name: "Trigger STT Sacrificial Check", trigger: "Ctrl+Shift+W", desc: "Spawns validator process to isolate native ONNX faults" },
      { name: "Database Coherence Audit", trigger: "Ctrl+Shift+B", desc: "Verifies SQLite tables and runs integrity check" },
      { name: "Trigger Emergency System Reset", trigger: "Ctrl+Shift+X", desc: "Closes handles, purges data/ cache, relaunches app" }
    ];

    let cy = 145;
    for (const cmd of commands) {
      fillRect(img, 30, cy, 1220, 88, 0x0e0e16aa);
      strokeRect(img, 30, cy, 1220, 88, 0xffffff12);

      img.print(font16, 50, cy + 18, cmd.name);
      img.print(font8, 50, cy + 50, cmd.desc);

      fillRect(img, 1080, cy + 26, 150, 34, 0xef444422);
      strokeRect(img, 1080, cy + 26, 150, 34, 0xef444466);
      img.print(font8, 1105, cy + 38, cmd.trigger);

      cy += 100;
    }

    await img.writeAsync(path.join(OUT_DIR, '07-commands.png'));
  }

  // 8. 08-widgets.png
  {
    const img = await new Promise((res, rej) => new Jimp(1280, 720, 0x000000ff, (e, i) => e ? rej(e) : res(i)));
    await renderChrome(img, fonts, "CORE");

    // Faded background reactor circle
    drawCircle(img, 640, 360, 120, 0xef444433);
    drawCircle(img, 640, 360, 180, 0xffffff0c);

    // Widget 1: Music Capsule
    fillRect(img, 60, 110, 340, 120, 0x0d0d16ee);
    strokeRect(img, 60, 110, 340, 120, 0xef444488);
    img.print(font8, 75, 122, "VK MUSIC BRIDGE // ACTIVE");
    img.print(font16, 75, 145, "Synthwave Odyssey");
    img.print(font8, 75, 178, "ARTIST: A.R.C. SOUNDTRACK  |  PROGRESS: 02:45 / 04:10");
    fillRect(img, 75, 202, 310, 4, 0xef4444ff);

    // Widget 2: Performance Profiler Overlay
    fillRect(img, 880, 110, 340, 160, 0x0d0d16ee);
    strokeRect(img, 880, 110, 340, 160, 0x3b82f688);
    img.print(font8, 895, 122, "PERFORMANCE PROFILER");
    img.print(font16, 895, 145, "FPS: 60.0 (STABLE)");
    img.print(font8, 895, 180, "VRAM USAGE: 412 MB  |  HEAP: 86 MB");
    img.print(font8, 895, 205, "LAYOUT TREE UPDATE: 0.12 ms");
    img.print(font8, 895, 230, "RAF THROTTLED: YES");

    // Widget 3: Status Overlay / Wake Word Monitor
    fillRect(img, 450, 480, 380, 140, 0x0d0d16ee);
    strokeRect(img, 450, 480, 380, 140, 0x22c55e88);
    img.print(font8, 465, 495, "VOICE FSM STATE MONITOR");
    img.print(font16, 465, 520, "STATE: WAKE_WORD_ONLY");
    img.print(font8, 465, 555, "ENERGY LEVEL: -32 dB  (GATE: -26 dB)");
    img.print(font8, 465, 580, "WAKE FILTER: FIRST 3 WORDS POSITIONAL");

    await img.writeAsync(path.join(OUT_DIR, '08-widgets.png'));
  }

  console.log("All 8 baseline screenshots generated successfully in " + OUT_DIR);
}

generateAll().catch(err => {
  console.error("Error generating screenshots:", err);
  process.exit(1);
});
