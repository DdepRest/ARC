import { app, BrowserWindow, shell, protocol, ipcMain, session, powerMonitor } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { registerIpcHandlers } from './ipc';
import { macroScheduler } from './services/macro-scheduler.service';
import { dialogTrashScheduler } from './services/dialog-trash.service';
import { DatabaseService } from './services/database';
import { initMemory } from './services/memory/memory-manager';
import { objectiveEngine } from './services/objective/ObjectiveEngine';
import { objectiveExecutionLoop } from './services/objective/ObjectiveExecutionLoop';
import { PythonServerService } from './services/python_server.service';
import { BuiltInLlmService } from './services/built-in-llm.service';
import { vkWebSocketServer } from './services/media/vk-websocket-server';
import { sttService } from './services/stt.service';
import { sherpaDownloaderService } from './services/sherpa-downloader.service';
import { resolveSherpaModelDir } from './services/sherpa-paths.util';
import { aiCache } from './services/ai-cache';
import { cacheService } from './services/cache.service';
import { StorageManagerService } from './services/storage-manager.service';
import {
  attachWindowSecurityGuards,
  configureSessionSecurity,
  isDevToolsAllowed,
  resolveTrustedRendererRoot
} from './services/security/electron-security.util';
import { sanitizeError } from '../shared/utils/log-sanitizer';
import { ipcLifecycle } from '../shared/utils/ipc-resilience';
import { logger } from './utils/logger';
import { resolveAppWindowIconPath } from './utils/app-icon.util';
import { approvalService } from './services/approval.service';

// Enforce Single Instance Lock to prevent duplicate background processes and port collisions
const gotTheLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | null = null;

if (!gotTheLock) {
  console.log('[SingleInstance] Another instance of A.R.C. is already running. Quitting duplicate...');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Initialize portable storage layout in application directory
StorageManagerService.initPortablePaths();

// Load Performance settings before appending command-line switches
let targetFpsSetting = 'auto';
let disableVsyncSetting = false;

function getPerfConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'arc-performance-settings.json');
  } catch {
    return path.join(os.homedir(), '.arc-performance-settings.json');
  }
}

try {
  const configPath = getPerfConfigPath();
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // Simple migration inline for main process before IPC
    const cfg = raw || {};
    if (cfg.targetFps === 'unlimited') targetFpsSetting = 'auto';
    else if (cfg.targetFps === '65') targetFpsSetting = '60';
    else if (cfg.targetFps) targetFpsSetting = cfg.targetFps;
    
    if (cfg.disableVsync === true && raw.targetFps === 'unlimited') disableVsyncSetting = false;
    else if (typeof cfg.disableVsync === 'boolean') disableVsyncSetting = cfg.disableVsync;
  }
} catch (e) {
  console.warn('[FPS Config] Pre-ready config load failed:', e);
}

// Optimizations for background performance
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// Prefer discrete / high-performance GPU for Three.js 3D reactor
app.commandLine.appendSwitch('force_high_performance_gpu');

// Windows-specific Process Optimizations
if (process.platform === 'win32') {
  app.setAppUserModelId('com.arc.cognitive'); // Ensures proper Windows taskbar grouping and notifications
}

// Conditionally append VSync / Frame-rate management switches
if (disableVsyncSetting) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
if (targetFpsSetting !== 'unlimited' && targetFpsSetting !== 'auto') {
  app.commandLine.appendSwitch('max-frame-rate', targetFpsSetting);
}

function createWindow() {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  const trustedFileRoot = resolveTrustedRendererRoot(__dirname);
  const allowDevTools = isDevToolsAllowed({
    isDev,
    isPackaged: app.isPackaged,
    nodeEnv: process.env.NODE_ENV,
    argv: process.argv,
    env: process.env
  });

  const appIconPath = resolveAppWindowIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    mainDir: __dirname
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#000000',
    icon: appIconPath,
    frame: false,
    titleBarStyle: 'hidden', // User might have turned it off, ensure solid black background
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: allowDevTools,
      backgroundThrottling: false,
      offscreen: false,
      webgl: true,
      experimentalFeatures: false,
      // @ts-ignore
      hardwareAcceleration: true
    },
  });
  approvalService.setTrustedWindow(mainWindow, trustedFileRoot);

  // Track window focus state for Smart Focus Throttling (Background Eco Mode)
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:focus-changed', false);
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:focus-changed', true);
    }
  });

  // Prevent white flash when resizing or restoring
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.setMenu(null);
  
  mainWindow.once('ready-to-show', () => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    
    // Send app:modules-loaded immediately to allow instant window interactivity
    win.webContents.send('app:modules-loaded');

    const dbHealth = DatabaseService.getHealthStatus();
    if (
      (dbHealth.mode === 'DB_SAFE_MODE' || dbHealth.mode === 'RECOVERED_FROM_CORRUPTION') &&
      dbHealth.userNotice
    ) {
      win.webContents.send('ui:show-toast', {
        message: dbHealth.userNotice,
        type: dbHealth.isSafeMode ? 'error' : 'info',
        duration: dbHealth.isSafeMode ? 15000 : 9000
      });
    }
    
    // Start Python TTS server (Silero v5.6) only if already provisioned locally (never auto-install venv/pip/weights on startup)
    PythonServerService.start(win, { allowProvisioning: false }).catch(err => {
      console.error(`[TTS Startup] Error in background startup: ${sanitizeError(err)}`);
    });

    // Initialize STT only if a local model is already installed (no surprise startup downloads)
    const whisperRes = resolveSherpaModelDir('whisper-small');
    const zipformerRes = resolveSherpaModelDir('zipformer-ru');
    const gigaRes = resolveSherpaModelDir('gigaam-ctc');

    if (whisperRes.isComplete || zipformerRes.isComplete || gigaRes.isComplete) {
      console.log('[STT] Installed model verified, initializing STT service...');
      sttService.initializeModels().catch(() => {});
    } else {
      console.log('[STT] Startup check: no STT models installed yet; awaiting user consent/setup.');
    }
  });

  attachWindowSecurityGuards(mainWindow, {
    isDev,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    trustedFileRoot,
    allowDevTools,
    openExternal: (url) => shell.openExternal(url),
    onBlockedNavigation: (blockedUrl) => {
      console.warn(`[Security] Blocked untrusted navigation attempt: ${sanitizeError(blockedUrl)}`);
    }
  });

  // Renderer diagnostics & disaster observability
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer LOAD ERROR] Code ${errorCode}: ${errorDescription} on URL: ${validatedURL}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const tag = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'INFO';
    if (level >= 2 || process.env.NODE_ENV !== 'production' || process.argv.includes('--debug')) {
      console.log(`[Renderer ${tag}] ${message} (${path.basename(sourceId || '')}:${line})`);
    }
  });

  // Load Vite dev server if running locally, else load index.html
  console.log(`ARC Main: Loading URL ${process.env.ELECTRON_RENDERER_URL || 'from file system'}`);
  
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = process.env.ELECTRON_RENDERER_URL.replace('localhost', '127.0.0.1');
    mainWindow.loadURL(url);
    if (allowDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error(`[Main] CRITICAL: Failed to load ${indexPath}:`, err);
    });
  }
}

app.whenReady().then(async () => {
  // Очистка кэшей только в development-режиме или при явном флаге --reset-cache
  if (process.env.NODE_ENV !== 'production' || process.argv.includes('--reset-cache')) {
    try {
      aiCache.clear();
      cacheService.clear();
      console.log('[Startup] AI & Audio caches cleared for testing/dev mode.');
    } catch(e) {
      console.warn('[Startup] Failed to clear caches:', e);
    }
  } else {
    console.log('[Startup] Using existing caches (production mode).');
  }

  // Настройка сетевых заголовков, узкого HuggingFace CORS и Content-Security-Policy
  const isDevMode = Boolean(process.env.ELECTRON_RENDERER_URL);
  configureSessionSecurity(session.defaultSession, {
    isDev: isDevMode,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    trustedFileRoot: resolveTrustedRendererRoot(__dirname)
  });

  // CSP Reporter Handler (active in dev / violation captures)
  protocol.registerStringProtocol('csp', (request, callback) => {
    if (request.url.includes('violations')) {
      const logPath = path.join(app.getPath('userData'), 'csp-violations.log');
      const timestamp = new Date().toISOString();
      let body = '';
      if (request.uploadData && request.uploadData.length > 0) {
        body = request.uploadData.map(d => d.bytes ? d.bytes.toString('utf-8') : '').join('');
      }
      fs.appendFileSync(logPath, `[${timestamp}] CSP Violation:\n${body}\n\n`, 'utf8');
    }
    callback('');
  });

  // Create the main window immediately so the UI is visible and interactive
  createWindow();

  try {
    logger.enableDiskLogging(path.join(app.getPath('userData'), 'logs'));
  } catch {}
  DatabaseService.init();
  initMemory();
  registerIpcHandlers();
  macroScheduler.start();
  dialogTrashScheduler.start();
  powerMonitor.on('resume', () => macroScheduler.checkNow());
  powerMonitor.on('unlock-screen', () => macroScheduler.checkNow());
  vkWebSocketServer.start();

  // Defer heavy background initializations after window is shown
  setTimeout(() => {
    (async () => {
      // Retrieve and print Electron GPU information for diagnostics in a single concise line
      try {
        app.getGPUInfo('basic').then((gpuInfo: any) => {
          const device = gpuInfo?.gpuDevice?.[0];
          const vendor = device?.vendorId ? `Vendor: ${device.vendorId}` : '';
          const deviceId = device?.deviceId ? `Device: ${device.deviceId}` : '';
          const driver = device?.driverVendor || gpuInfo?.auxAttributes?.glRenderer || 'Integrated GPU';
          console.log(`[GPU Info] ${[driver, vendor, deviceId].filter(Boolean).join(' | ')}`);
        }).catch(() => {});
      } catch (_) {}

      // Activate continuous Execution Loop checks for Objective-First core
      try {
        // AUTONOMOUS COGNITIVE LOOP DISABLED BY DESIGN DECISION.
        // Причина: генерирует фейковые решения в таблицах decisions/prediction_nodes/coherence_records
        // каждые 30 секунд без реальной работы. Не связано с задачами, чатом, голосом, памятью.
        // При необходимости ручного запуска из UI — использовать explicit API, не auto-start.
        // await objectiveExecutionLoop.start();
      } catch (loopErr) {
        console.error(`Failed to start cognitive execution loop: ${sanitizeError(loopErr)}`);
      }

      // Seed the first System Self Objective for Objective-First OS
      try {
        const objectives = objectiveEngine.getAllObjectives();
        const systemTitle = "Transform A.R.C. into Objective-driven OS";
        const exists = objectives.some(o => o.title === systemTitle);
        if (!exists) {
          console.log("Seeding system self-objective...");
          objectiveEngine.createObjective(
            systemTitle,
            "Transition A.R.C. from a flat list of Decisions into a multi-layered, cybernetic Objective-First operating system.",
            "SYSTEM_AUTO",
            999
          );
          console.log("System self-objective successfully initialized!");
        }
      } catch (err) {
        console.error(`Failed to seed system objective: ${sanitizeError(err)}`);
      }
    })();
  }, 1200);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  sttService.shutdown();
  void sherpaDownloaderService.cancelAllDownloads().catch(() => {});
  PythonServerService.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let isQuitting = false;
app.on('before-quit', (e) => {
  macroScheduler.stop();
  dialogTrashScheduler.stop();
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;

  sttService.shutdown();
  PythonServerService.stop();

  Promise.race([
    Promise.allSettled([
      sherpaDownloaderService.cancelAllDownloads(),
      ipcLifecycle.gracefulShutdown(BrowserWindow.getAllWindows(), 3000),
      BuiltInLlmService.getInstance().disposeAll()
    ]),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]).finally(() => {
    logger.flush();
    DatabaseService.close();
    app.quit();
  });
});
