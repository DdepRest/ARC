import treeKill from 'tree-kill';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger } from '../utils/logger';
import { BrowserWindow, app } from 'electron';
import { cacheService } from './cache.service';
import { ecoService, type EcoState } from './eco.service';
import { HTTP_TIMEOUT_MS } from '../config/timeouts';
import {
  syncPythonFiles, ensureSileroModelReady, cleanupStaleSileroServerOn8002,
  isValidSileroModelFile, resolveTtsDictsPaths, prepareTtsDictsSpawnEnv,
  verifyPythonBundleFiles, cancelSileroModelDownload, type TtsDictsPaths, type EnsureSileroModelOptions
} from './python_sync.util';
import { evaluateSileroModelWithReport } from './python_integrity.util';
import type { PythonBundleIntegrityReport } from '../../shared/types/model-integrity';
import {
  ensureDependenciesAsync, cancelDependencyInstall, getLastDependencyReadiness,
  getDependencyInstallerState, recordPythonNotFound, type DependencyCheckResult
} from './python_deps.util';
import { ttsService } from './tts.service';

export const SILERO_PACKAGED_MODEL_REL_PATH = path.join('resources', 'models', 'silero-v5', 'v5_6_ru.pt');

export interface ResolvedPython {
  exe: string;
  kind: 'python-embed' | 'silero-env' | 'system';
}

export type { DependencyCheckResult };

export class PythonServerService {
  public static readonly MAX_AUTO_RESPAWNS = 5;
  private static child: ChildProcess | null = null;
  private static pythonPid: number | null = null;
  private static isShuttingDown = false;
  private static isStarting = false;
  private static monitorInterval: NodeJS.Timeout | null = null;
  private static respawnTimer: NodeJS.Timeout | null = null;
  private static mainWindowRef: BrowserWindow | null = null;
  private static consecutiveFailures = 0;
  private static autoRespawnCount = 0;
  private static isHealthy = true;
  private static lastIntegrityReport: PythonBundleIntegrityReport | null = null;

  public static getPythonPid(): number | null { return this.pythonPid ?? this.child?.pid ?? null; }
  public static getAutoRespawnCount(): number { return this.autoRespawnCount; }
  public static getLastIntegrityReport(): PythonBundleIntegrityReport | null { return this.lastIntegrityReport; }
  public static isServerStarting(): boolean { return this.isStarting; }
  private static sendWin(win: BrowserWindow | null | undefined, channel: string, payload?: any): void {
    try { if (win && !win.isDestroyed?.() && !win.webContents?.isDestroyed?.()) win.webContents.send(channel, payload); } catch {}
  }

  public static getPath(relativePath: string): string {
    const isDev = !app?.isPackaged || process.env.NODE_ENV === 'development';
    const appPath = app?.getAppPath ? app.getAppPath() : process.cwd();
    const resPath = process.resourcesPath || path.join(appPath, '..');
    const possiblePaths = isDev
      ? [path.join(process.cwd(), relativePath), path.join(appPath, relativePath), path.join(resPath, relativePath)]
      : [path.join(resPath, relativePath), path.join(appPath, '..', relativePath), path.join(process.cwd(), relativePath), path.join(appPath, relativePath)];
    for (const p of possiblePaths) { if (p && fs.existsSync(p)) return p; }
    return isDev ? path.join(process.cwd(), relativePath) : path.join(resPath, relativePath);
  }

  public static resolveSileroModelPath(): string | null {
    const envModel = process.env.ARC_SILERO_MODEL_PATH?.trim();
    if (envModel && isValidSileroModelFile(envModel)) return envModel;
    const relCandidates = [
      SILERO_PACKAGED_MODEL_REL_PATH, path.join('models', 'silero-v5', 'v5_6_ru.pt'),
      path.join('data', 'models', 'silero-v5', 'v5_6_ru.pt'), path.join('data', 'v5_6_ru.pt'),
      path.join('Voice', 'models', 'v5_6_ru.pt'), path.join('Voice', 'models', 'silero-v5', 'v5_6_ru.pt'), 'v5_6_ru.pt'
    ];
    for (const rel of relCandidates) {
      const resolved = this.getPath(rel);
      if (resolved && isValidSileroModelFile(resolved)) return resolved;
    }
    try {
      const userModel = app?.getPath ? path.join(app.getPath('userData'), 'models', 'silero-v5', 'v5_6_ru.pt') : '';
      if (userModel && isValidSileroModelFile(userModel)) return userModel;
    } catch {}
    if (!process.env.VITEST) {
      const appData = process.env.APPDATA || '';
      const localAppData = process.env.LOCALAPPDATA || '';
      const home = os.homedir();
      const extra = [
        appData ? path.join(appData, 'a.r.c.', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
        appData ? path.join(appData, 'A.R.C.', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
        appData ? path.join(appData, 'Electron', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
        localAppData ? path.join(localAppData, 'ARC_Voice', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
        path.join(home, '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_6_ru.pt'),
        path.join(home, '.cache', 'torch', 'hub', 'checkpoints', 'v5_6_ru.pt')
      ];
      for (const c of extra) { if (c && isValidSileroModelFile(c)) return c; }
    }
    return null;
  }

  public static resolveTtsDictsPaths(): TtsDictsPaths { return resolveTtsDictsPaths((rel) => this.getPath(rel)); }
  public static getLastDependencyReadiness(): DependencyCheckResult | null { return getLastDependencyReadiness(); }
  public static getDependencyInstallerState() { return getDependencyInstallerState(); }

  private static createVenvAsync(pythonExe: string, envPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(pythonExe, ['-m', 'venv', envPath], { shell: false, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`venv exited with code ${code}`))));
    });
  }

  public static resolvePythonExe(): ResolvedPython | null {
    const isWin = process.platform === 'win32';
    const embedSub = isWin ? path.join('python-embed', 'python.exe') : path.join('python-embed', 'bin', 'python3');
    const resEmbed = this.getPath(path.join('resources', embedSub));
    if (resEmbed && fs.existsSync(resEmbed)) return { exe: resEmbed, kind: 'python-embed' };
    const directEmbed = this.getPath(embedSub);
    if (directEmbed && fs.existsSync(directEmbed)) return { exe: directEmbed, kind: 'python-embed' };
    try {
      const userEmbed = app?.getPath ? path.join(app.getPath('userData'), embedSub) : '';
      if (userEmbed && fs.existsSync(userEmbed)) return { exe: userEmbed, kind: 'python-embed' };
    } catch {}
    const venvRel = isWin ? path.join('silero_env', 'Scripts', 'python.exe') : path.join('silero_env', 'bin', 'python');
    const venvExe = this.getPath(venvRel);
    if (venvExe && fs.existsSync(venvExe)) return { exe: venvExe, kind: 'silero-env' };
    try {
      const userVenv = app?.getPath ? path.join(app.getPath('userData'), venvRel) : '';
      if (userVenv && fs.existsSync(userVenv)) return { exe: userVenv, kind: 'silero-env' };
    } catch {}
    let candidate: string | null = null;
    try {
      if (isWin) {
        const whereOut = execFileSync('where.exe', ['python'], { encoding: 'utf-8', timeout: 3000 });
        const valid = whereOut.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.toLowerCase().includes('windowsapps'));
        if (valid.length > 0) candidate = valid[0];
      } else {
        const whichOut = execFileSync('which', ['python3'], { encoding: 'utf-8', timeout: 3000 }).trim();
        if (whichOut) candidate = whichOut;
      }
    } catch {}
    if (candidate && fs.existsSync(candidate)) {
      try {
        const testOut = execFileSync(candidate, ['-c', 'print(1)'], { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' });
        if (testOut.trim() === '1') return { exe: candidate, kind: 'system' };
      } catch {}
    }
    return null;
  }

  public static syncPythonFiles(mainWindow?: BrowserWindow | null): void { syncPythonFiles((rel) => this.getPath(rel), mainWindow); }
  private static logDev(level: 'log' | 'warn' | 'error', message: string): void {
    const isDev = !app?.isPackaged || process.env.NODE_ENV === 'development';
    if (level === 'error') console.error(message); else if (level === 'warn') console.warn(message); else if (isDev) console.log(message);
  }

  static async start(
    mainWindow?: BrowserWindow | null,
    options?: { allowProvisioning?: boolean; onModelProgress?: EnsureSileroModelOptions['onProgress'] }
  ): Promise<void> {
    if (this.isStarting) { logger.warn('[Python Server] Start already in progress, skipping duplicate start call.'); return; }
    this.isStarting = true;
    if (mainWindow) this.mainWindowRef = mainWindow;
    const allowProvisioning = options?.allowProvisioning !== false;
    return new Promise(async (resolve) => {
      const finishStart = () => { this.isStarting = false; resolve(); };
      try {
        cacheService.clear();
        if (this.child) this.stop(true);
        await cleanupStaleSileroServerOn8002();
        this.isShuttingDown = false;
        syncPythonFiles((rel) => this.getPath(rel), mainWindow);

        const bundleCheck = verifyPythonBundleFiles((rel) => this.getPath(rel));
        this.lastIntegrityReport = bundleCheck;
        if (bundleCheck.state === 'ERROR') {
          this.logDev('error', `[Python Server] Supply-chain verification blocked startup: ${bundleCheck.reason}`);
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка целостности');
          this.sendWin(mainWindow, 'terminal:log', { type: 'ERROR', message: `[Python Server] ${bundleCheck.reason}` });
          this.sendWin(mainWindow, 'ui:show-toast', { type: 'warning', title: 'TTS: Ошибка целостности', message: 'Нарушена контрольная сумма SHA-256 файлов Silero TTS. Переключение на системный голос.' });
          return finishStart();
        }

        const resolved = this.resolvePythonExe();
        if (!resolved) {
          recordPythonNotFound();
          this.logDev('warn', '[Python Server] error: Python runtime not found. Silero TTS disabled, falling back to system/Edge TTS.');
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: Python не найден');
          this.sendWin(mainWindow, 'terminal:log', { type: 'WARN', message: '[Python Server] Python not found. Falling back to Edge TTS / SAPI.' });
          if (allowProvisioning) this.sendWin(mainWindow, 'ui:show-toast', { type: 'warning', title: 'TTS: Silero недоступен', message: 'Python не найден. Переключение на системный голос.' });
          return finishStart();
        }

        let targetPython = resolved.exe;
        if (resolved.kind !== 'silero-env') {
          const isWin = process.platform === 'win32';
          let envPath = this.getPath('silero_env');
          let venvExe = isWin ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');
          const userVenvExe = app?.getPath ? path.join(app.getPath('userData'), 'silero_env', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python') : '';
          if (!fs.existsSync(venvExe) && userVenvExe && fs.existsSync(userVenvExe)) venvExe = userVenvExe;
          else if (!fs.existsSync(venvExe) && allowProvisioning) {
            this.sendWin(mainWindow, 'app:loading-progress', 'Creating Python virtual environment...');
            try { await this.createVenvAsync(resolved.exe, envPath); }
            catch (e) {
              if (app?.getPath) {
                envPath = path.join(app.getPath('userData'), 'silero_env');
                venvExe = isWin ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');
                try { await this.createVenvAsync(resolved.exe, envPath); } catch (e2) { console.error('[Python Server] Failed to create venv:', e2); }
              } else { console.error('[Python Server] Failed to create venv:', e); }
            }
          }
          targetPython = fs.existsSync(venvExe) ? venvExe : resolved.exe;
        }

        const scriptPath = this.getPath('silero_server.py');
        if (!fs.existsSync(scriptPath)) {
          this.logDev('error', '[Python Server] error: silero_server.py script not found.');
          this.sendWin(mainWindow, 'app:loading-progress', '[ERROR] silero_server.py script not found.');
          return finishStart();
        }

        this.logDev('log', `[Python Server] start: exe=${targetPython}, script=${scriptPath}`);
        if (allowProvisioning) {
          this.sendWin(mainWindow, 'app:loading-progress', 'Starting A.R.C. TTS (Silero v5.6)...');
          this.sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: '[Python Server] Starting...' });
        }

        const depsResult = await ensureDependenciesAsync(targetPython, mainWindow, (p) => this.getPath(p), { allowInstall: allowProvisioning });
        if (!depsResult.success || !depsResult.coreReady) {
          if (!allowProvisioning) {
            this.logDev('log', `[Python Server] Startup check: Python dependencies not installed yet (${depsResult.reason || 'missing'}); awaiting user setup.`);
            return finishStart();
          }
          this.logDev('warn', `[Python Server] error: Core dependencies failed (${depsResult.reason || 'import_check_failed'})`);
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка [Повторить]');
          this.sendWin(mainWindow, 'terminal:log', { type: 'ERROR', message: `[Python Server] Dependencies failed (${depsResult.reason}): ${depsResult.errors.join('; ')}` });
          if (depsResult.reason !== 'cancelled') this.sendWin(mainWindow, 'ui:show-toast', { type: 'warning', title: 'TTS: Ошибка зависимостей', message: `Не удалось установить базовые зависимости Silero (${depsResult.reason}). Переключение на системный голос.` });
          return finishStart();
        }
        if (depsResult.state === 'DEGRADED') {
          this.logDev('warn', `[Python Server] Dependencies degraded (accentReady=${depsResult.accentReady}, dspReady=${depsResult.dspReady}): ${depsResult.errors.join('; ')}`);
          this.sendWin(mainWindow, 'terminal:log', { type: 'WARN', message: `[Python Server] Silero running in DEGRADED mode: ${depsResult.errors.join('; ')}` });
        }

        const resolvedModelPath = await ensureSileroModelReady((p) => this.getPath(p), () => this.resolveSileroModelPath(), mainWindow, { allowDownload: allowProvisioning, onProgress: options?.onModelProgress });
        const modelEval = evaluateSileroModelWithReport(resolvedModelPath, bundleCheck);
        this.lastIntegrityReport = modelEval.report;
        if (!modelEval.ok) {
          this.logDev('error', `[Python Server] Silero model SHA-256 verification failed: ${modelEval.reason}`);
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка целостности');
          this.sendWin(mainWindow, 'terminal:log', { type: 'ERROR', message: `[Python Server] ${modelEval.reason}` });
          return finishStart();
        }
        if (!resolvedModelPath && !allowProvisioning && !process.env.VITEST) {
          this.logDev('log', '[Python Server] Startup check: Silero model v5_6_ru.pt not installed yet; awaiting user setup.');
          return finishStart();
        }
        const { dictsPaths, spawnEnv } = prepareTtsDictsSpawnEnv((p) => this.getPath(p), process.env);
        this.logDev(dictsPaths.bundledExists ? 'log' : 'warn', `[Python Server] TTS dicts: bundled=${dictsPaths.bundledDictsDir} (${dictsPaths.bundledExists}), user=${dictsPaths.userDictsDir}`);
        if (resolvedModelPath) {
          spawnEnv.ARC_SILERO_MODEL_PATH = resolvedModelPath;
          this.logDev('log', `[Python Server] model resolved: ${resolvedModelPath}`);
        } else {
          this.logDev('warn', '[Python Server] model resolved: not found (Local v5_6_ru.pt model not found via getPath; relying on silero_server.py candidate lookup.)');
        }
        this.child = spawn(targetPython, [scriptPath], { cwd: this.getPath('.'), env: spawnEnv, shell: false });
        this.pythonPid = this.child.pid ?? null;
        if (this.child?.pid) {
          try {
            os.setPriority(this.child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
            console.log(`[Python Server] Process priority set to BELOW_NORMAL (PID ${this.child.pid})`);
          } catch (pErr: any) { console.warn('[Python Server] Could not adjust process priority (non-fatal):', pErr?.message); }
        }
        if (!this.child) {
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка [Повторить]');
          return finishStart();
        }
        this.child.on('error', (err: any) => {
          this.logDev('error', `[Python Server] error: ${err?.message || 'spawn error'}`);
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка [Повторить]');
          finishStart();
        });
        this.child.stdout?.on('data', (data) => {
          for (const line of data.toString().split('\n')) {
            const str = line.trim();
            if (!str) continue;
            if (str.startsWith('__PROGRESS__')) {
              try { this.sendWin(mainWindow, 'model:download-progress', JSON.parse(str.substring('__PROGRESS__'.length))); } catch {}
              continue;
            }
            console.log(`[Python Server] ${str}`);
            this.sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: `[Python Server] ${str}` });
          }
        });
        this.child.stderr?.on('data', (data) => { const s = data.toString().trim(); if (s) console.error(`[Python Server] ${s}`); });
        this.child.on('close', () => { this.pythonPid = null; if (!this.isShuttingDown) this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка [Повторить]'); });

        const checkHealth = async (maxSeconds: number) => {
          for (let i = 0; i < maxSeconds; i++) {
            if (this.isShuttingDown) return finishStart();
            try {
              const res = await require('axios').get('http://127.0.0.1:8002/status', { timeout: 2000 });
              if (res.data && res.data.status === 'online') {
                this.logDev('log', '[Python Server] online on :8002');
                this.autoRespawnCount = 0;
                ttsService.notifySileroOnline();
                this.sendWin(mainWindow, 'app:loading-progress', 'TTS: loaded successfully');
                this.sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: '[Python Server] Health Check OK.' });
                finishStart();
                this.startMonitor();
                return;
              }
            } catch (e: any) {
              if (e?.response?.status === 503) {
                this.logDev('warn', '[Python Server] Server responded with HTTP 503 (model v5_6_ru.pt missing); fallback active.');
                this.sendWin(mainWindow, 'app:loading-progress', 'TTS: fallback (Edge/SAPI)');
                return finishStart();
              }
              if (i > 0 && i % 10 === 0) console.log(`[Python Server] waiting for server readiness... (${i}s/${maxSeconds}s) [${e.code || 'ERR'}]`);
            }
            await new Promise(r => setTimeout(r, 1000));
          }
          this.logDev('error', '[Python Server] error: Server failed to start or respond on :8002');
          this.sendWin(mainWindow, 'terminal:log', { type: 'ERROR', message: '[Python Server] Server failed to start or respond.' });
          this.sendWin(mainWindow, 'app:loading-progress', 'Голос: ошибка [Повторить]');
          finishStart();
        };
        checkHealth(60);
      } catch (err: any) {
        console.error(`[Python Server] start failed: ${err.message || 'Unknown'}`);
        finishStart();
      }
    });
  }

  public static setEcoState(state: EcoState, reason = 'unspecified') { ecoService.setState(state, reason); if (this.monitorInterval) this.startMonitor(); }
  public static setIdleMode(isIdle: boolean, reason = 'idle_mode') { this.setEcoState(isIdle ? 'idle' : 'active', reason); }

  private static startMonitor() {
    if (!ecoService.listenerCount('state-change')) ecoService.on('state-change', () => { if (!this.isShuttingDown) this.startMonitor(); });
    if (this.monitorInterval) { clearTimeout(this.monitorInterval); clearInterval(this.monitorInterval); this.monitorInterval = null; }
    this.consecutiveFailures = 0;
    this.isHealthy = true;
    const scheduleNext = () => {
      if (this.isShuttingDown) return;
      const baseMs = ecoService.getIntervalMs();
      const delay = this.consecutiveFailures === 0 ? baseMs : Math.min(baseMs * Math.pow(2, this.consecutiveFailures), 40000);
      this.monitorInterval = setTimeout(async () => {
        if (this.isShuttingDown) return;
        try {
          const res = await require('axios').get('http://127.0.0.1:8002/status', { timeout: 15000 });
          if (res.data?.status === 'online') {
            if (!this.isHealthy) console.log('[Python Server] health check OK (recovered)');
            this.isHealthy = true; this.consecutiveFailures = 0; this.autoRespawnCount = 0;
            ttsService.notifySileroOnline();
          } else { throw new Error('Bad status'); }
        } catch (e: any) {
          if (ttsService.isBusy() && (e?.code === 'ECONNABORTED' || /timeout/i.test(String(e?.message || '')))) { scheduleNext(); return; }
          this.consecutiveFailures++;
          if (this.isHealthy) { this.isHealthy = false; console.warn(`[Python Server] health check failed: ${e.code || 'ERR'} ${e.message || 'Unknown'}`); }
          if (this.consecutiveFailures >= 3) {
            this.consecutiveFailures = 0;
            if (this.autoRespawnCount >= this.MAX_AUTO_RESPAWNS) {
              console.error(`[Python Server] Circuit breaker tripped: exceeded max auto-respawns (${this.MAX_AUTO_RESPAWNS}). Stopping monitor.`);
              this.sendWin(this.mainWindowRef, 'terminal:log', { type: 'ERROR', message: `[Python Server] Circuit breaker tripped after ${this.MAX_AUTO_RESPAWNS} failed restarts.` });
              this.stop(true); return;
            }
            this.autoRespawnCount++;
            console.warn(`[Python Server] respawning (cycle ${this.autoRespawnCount}/${this.MAX_AUTO_RESPAWNS})`);
            this.sendWin(this.mainWindowRef, 'terminal:log', { type: 'WARN', message: '[Python Server] Restarting dead server...' });
            this.stop(true);
            this.respawnTimer = setTimeout(() => { this.respawnTimer = null; if (this.mainWindowRef && !this.mainWindowRef.isDestroyed?.()) this.start(this.mainWindowRef); }, 2000);
            return;
          }
        }
        scheduleNext();
      }, delay);
    };
    console.log(`[Python Server] Healthcheck timer restarted: ${ecoService.getIntervalMs()}ms`);
    scheduleNext();
  }

  static stop(preserveRespawnCount: boolean = false) {
    this.isShuttingDown = true; this.isStarting = false;
    cancelDependencyInstall();
    cancelSileroModelDownload();
    if (!preserveRespawnCount) this.autoRespawnCount = 0;
    if (this.respawnTimer) { clearTimeout(this.respawnTimer); this.respawnTimer = null; }
    if (this.monitorInterval) { clearTimeout(this.monitorInterval); clearInterval(this.monitorInterval); this.monitorInterval = null; }
    const pid = this.pythonPid || (this.child ? this.child.pid : null);
    if (pid) {
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) logger.error(`[Python Server] Failed to kill process tree for PID ${pid}:`, err);
        else logger.info(`[Python Server] Successfully killed process tree for PID ${pid}`);
      });
    } else {
      logger.warn('[Python Server] Python PID not found. Skipping system kill to prevent killing user processes.');
    }
    this.child = null; this.pythonPid = null;
  }
}
