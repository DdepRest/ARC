import { app, BrowserWindow, shell, protocol, ipcMain, session, powerMonitor } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { registerIpcHandlers } from './ipc';
import { macroScheduler } from './services/macro-scheduler.service';
import { DatabaseService } from './services/database';
import { initMemory } from './services/memory/memory-manager';
import { objectiveEngine } from './services/objective/ObjectiveEngine';
import { objectiveExecutionLoop } from './services/objective/ObjectiveExecutionLoop';
import { PythonServerService } from './services/python_server.service';
import { BuiltInLlmService } from './services/built-in-llm.service';
import { vkWebSocketServer } from './services/media/vk-websocket-server';
import { sttService } from './services/stt.service';
import { resolveSherpaModelDir } from './services/sherpa-paths.util';
import { aiCache } from './services/ai-cache';
import { cacheService } from './services/cache.service';
import { StorageManagerService } from './services/storage-manager.service';
import { getCspPolicy, isTrustedOrigin } from '../shared/config/csp.config';
import { sanitizeError } from '../shared/utils/log-sanitizer';
import { ipcLifecycle } from '../shared/utils/ipc-resilience';
import { logger } from './utils/logger';

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#000000',
    frame: false,
    titleBarStyle: 'hidden', // User might have turned it off, ensure solid black background
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      offscreen: false,
      webgl: true,
      experimentalFeatures: false,
      // @ts-ignore
      hardwareAcceleration: true
    },
  });

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
    mainWindow.show();
    mainWindow.focus();
    
    // Send app:modules-loaded immediately to allow instant window interactivity
    mainWindow.webContents.send('app:modules-loaded');

    const dbHealth = DatabaseService.getHealthStatus();
    if (
      (dbHealth.mode === 'DB_SAFE_MODE' || dbHealth.mode === 'RECOVERED_FROM_CORRUPTION') &&
      dbHealth.userNotice
    ) {
      mainWindow.webContents.send('ui:show-toast', {
        message: dbHealth.userNotice,
        type: dbHealth.isSafeMode ? 'error' : 'info',
        duration: dbHealth.isSafeMode ? 15000 : 9000
      });
    }
    
    // Start Python TTS server (Silero v5.6) completely asynchronously in the background
    PythonServerService.start(mainWindow).catch(err => {
      console.error(`[TTS Startup] Error in background startup: ${sanitizeError(err)}`);
    });

    // Verify and start STT models (Whisper Small or Zipformer RU)
    const whisperRes = resolveSherpaModelDir('whisper-small');
    const zipformerRes = resolveSherpaModelDir('zipformer-ru');

    if (whisperRes.isComplete || zipformerRes.isComplete) {
      console.log('[STT] Base models verified, initializing STT service...');
      sttService.initializeModels().catch(() => {});
    } else {
      console.log('[STT] Base model missing, auto-downloading base STT models...');
      sttService.autoDownloadMissingModels(false).then((res) => {
        if (res.success) {
          sttService.initializeModels().catch(() => {});
        }
      }).catch(err => {
        console.warn(`[STT Startup] Auto-download error: ${sanitizeError(err)}`);
      });
    }
  });

  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details: any) => {
    if (permission === 'media') {
      const requestingUrl = details?.requestingUrl || (webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : '');
      const trusted = isTrustedOrigin(requestingUrl, isDev, process.env.ELECTRON_RENDERER_URL);
      callback(trusted);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission === 'media') {
      return isTrustedOrigin(requestingOrigin, isDev, process.env.ELECTRON_RENDERER_URL);
    }
    return false;
  });

  // Open external links in user's default browser instead of blank Electron popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
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

  // Toggle DevTools on F12 or Ctrl+Shift+I in any environment for quick troubleshooting
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i')))) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Load Vite dev server if running locally, else load index.html
  console.log(`ARC Main: Loading URL ${process.env.ELECTRON_RENDERER_URL || 'from file system'}`);
  
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = process.env.ELECTRON_RENDERER_URL.replace('localhost', '127.0.0.1');
    mainWindow.loadURL(url);
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools();
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

  // Настройка сетевых заголовков, CORS и Content-Security-Policy (вкл. https://fonts.googleapis.com и https://fonts.gstatic.com из csp.config.ts)
  const isDevMode = Boolean(process.env.ELECTRON_RENDERER_URL);
  const activeCsp = getCspPolicy(isDevMode);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    // Set dynamic Content-Security-Policy (style-src https://fonts.googleapis.com, font-src https://fonts.gstatic.com)
    responseHeaders['Content-Security-Policy'] = [activeCsp];

    // Handle CORS for HuggingFace and mirrors in renderer web contexts
    if (details.url.includes('hf-mirror.com') || details.url.includes('huggingface.co')) {
      if (responseHeaders['access-control-allow-origin']) delete responseHeaders['access-control-allow-origin'];
      if (responseHeaders['Access-Control-Allow-Origin']) delete responseHeaders['Access-Control-Allow-Origin'];
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    }

    callback({ responseHeaders });
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
  PythonServerService.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => macroScheduler.stop());

let isQuitting = false;
app.on('before-quit', (e) => {
  macroScheduler.stop();
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;

  PythonServerService.stop();

  Promise.race([
    Promise.allSettled([
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
