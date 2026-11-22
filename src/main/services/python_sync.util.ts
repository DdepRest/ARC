import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, BrowserWindow } from 'electron';
import { computeFileSha256Sync, verifyStagedFileDigest } from './model-integrity.util';
import { SILERO_TTS_MODEL_MANIFEST } from './model-supply-chain.manifest';
import {
  SILERO_V56_EXPECTED_SHA256,
  SILERO_V56_EXPECTED_SIZE,
  verifyBundledPythonSourceFile,
  verifyPythonBundleFiles,
  verifySileroModelOnDisk,
  writeSileroModelProvenanceMeta
} from './python_integrity.util';
import { downloadFileWithSignal } from './sherpa-http-download.util';

export { verifyPythonBundleFiles, verifySileroModelOnDisk };

export function calculateHash(filePath: string): string | null {
  return computeFileSha256Sync(filePath, true);
}

export function syncPythonFiles(getPath: (rel: string) => string, mainWindow?: BrowserWindow | null): void {
  const isDev = !app?.isPackaged || process.env.NODE_ENV === 'development';
  if (isDev) return;

  const filesToSync = [
    'silero_server.py',
    'silero_number_converter.py',
    'silero_text_prep.py',
    'requirements-silero.txt',
    'tts_dict_loader.py'
  ];
  const targetDir = getPath('.');

  let changed = false;
  let lastHash = '';

  for (const file of filesToSync) {
    const resCandidate = process.resourcesPath ? path.join(process.resourcesPath, file) : '';
    const sourcePath = resCandidate && fs.existsSync(resCandidate)
      ? resCandidate
      : (app?.getAppPath ? path.join(app.getAppPath(), file) : '');
    const targetPath = path.join(targetDir, file);

    if (!sourcePath || path.resolve(sourcePath) === path.resolve(targetPath)) continue;

    if (fs.existsSync(sourcePath)) {
      const sourceVerification = verifyBundledPythonSourceFile(file, sourcePath);
      if (!sourceVerification.ok) {
        const msg = `[Python Server] Supply-chain check blocked sync of ${file}: ${sourceVerification.reason}`;
        console.error(msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:log', { type: 'ERROR', message: msg });
        }
        continue;
      }

      const sourceHash = sourceVerification.sha256 || calculateHash(sourcePath);
      const targetHash = calculateHash(targetPath);

      if (sourceHash !== targetHash) {
        try {
          fs.copyFileSync(sourcePath, targetPath);
          changed = true;
          if (file === 'silero_server.py') lastHash = sourceHash || '';
        } catch (e) {
          console.error('[Python Server] Failed to sync file:', file, e);
        }
      }
    }
  }

  if (changed) {
    console.log(`[SILERO SERVER] Code synced, sha256: ${lastHash}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:log', { type: 'INFO', message: `[SILERO SERVER] Code synced, hash: ${lastHash}` });
    }
  }
}

export function isValidSileroModelFile(filePath: string | null | undefined, opts?: { strict?: boolean }): boolean {
  if (!filePath) return false;
  try {
    if (!fs.existsSync(filePath)) return false;
    const check = verifySileroModelOnDisk(filePath, opts);
    return check.ok;
  } catch {
    return false;
  }
}

export async function cleanupStaleSileroServerOn8002(): Promise<void> {
  if (process.env.VITEST) return;
  try {
    const axios = require('axios');
    await axios.get('http://127.0.0.1:8002/status', { timeout: 800 });
    return;
  } catch (err: any) {
    if (err?.response?.status !== 503) return;
  }
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const out = execSync('netstat -ano | findstr :8002', { encoding: 'utf-8', timeout: 3000 });
      const pids = new Set<string>();
      for (const line of out.split(/\r?\n/)) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 3000 });
          console.log(`[Python Server] Killed stale degraded process on :8002 (PID ${pid})`);
        } catch {}
      }
    } catch {}
  }
}

export function removeLegacySileroV55Model(getPath?: (rel: string) => string): void {
  try {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const home = os.homedir();
    const candidateV55Paths: (string | null | undefined)[] = [
      getPath ? getPath(path.join('resources', 'models', 'silero-v5', 'v5_5_ru.pt')) : null,
      getPath ? getPath(path.join('models', 'silero-v5', 'v5_5_ru.pt')) : null,
      getPath ? getPath(path.join('data', 'models', 'silero-v5', 'v5_5_ru.pt')) : null,
      getPath ? getPath(path.join('data', 'v5_5_ru.pt')) : null,
      getPath ? getPath(path.join('Voice', 'models', 'v5_5_ru.pt')) : null,
      getPath ? getPath(path.join('Voice', 'models', 'silero-v5', 'v5_5_ru.pt')) : null,
      getPath ? getPath('v5_5_ru.pt') : null,
      path.join(process.cwd(), 'v5_5_ru.pt'),
      path.join(process.cwd(), 'resources', 'models', 'silero-v5', 'v5_5_ru.pt'),
      app?.getPath ? path.join(app.getPath('userData'), 'models', 'silero-v5', 'v5_5_ru.pt') : null,
      appData ? path.join(appData, 'a.r.c.', 'models', 'silero-v5', 'v5_5_ru.pt') : null,
      appData ? path.join(appData, 'A.R.C.', 'models', 'silero-v5', 'v5_5_ru.pt') : null,
      appData ? path.join(appData, 'Electron', 'models', 'silero-v5', 'v5_5_ru.pt') : null,
      localAppData ? path.join(localAppData, 'ARC_Voice', 'models', 'silero-v5', 'v5_5_ru.pt') : null,
      path.join(home, '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_5_ru.pt'),
      path.join(home, '.cache', 'torch', 'hub', 'checkpoints', 'v5_5_ru.pt')
    ];

    for (const p of candidateV55Paths) {
      if (p && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          console.log(`[Python Server] Removed legacy Silero v5.5 model: ${p}`);
        } catch (delErr: any) {
          console.warn(`[Python Server] Could not remove legacy Silero v5.5 at ${p}:`, delErr?.message);
        }
      }
    }
  } catch (err: any) {
    console.warn('[Python Server] Error while cleaning legacy v5.5 model:', err?.message);
  }
}

let activeSileroDownloadAbort: AbortController | null = null;

export function cancelSileroModelDownload(): boolean {
  if (!activeSileroDownloadAbort) return false;
  activeSileroDownloadAbort.abort();
  activeSileroDownloadAbort = null;
  return true;
}

export function isSileroModelDownloading(): boolean {
  return activeSileroDownloadAbort !== null;
}

export interface EnsureSileroModelOptions {
  allowDownload?: boolean;
  onProgress?: (data: {
    modelId: string;
    bytesDone: number;
    totalBytes: number;
    percent: number;
    status: 'downloading' | 'verifying' | 'completed' | 'cancelled' | 'error';
    error?: string;
  }) => void;
}

export async function ensureSileroModelReady(
  getPath: (rel: string) => string,
  resolveModelPath: () => string | null,
  mainWindow?: BrowserWindow | null,
  options?: EnsureSileroModelOptions
): Promise<string | null> {
  removeLegacySileroV55Model(getPath);

  const existing = resolveModelPath();
  if (existing && isValidSileroModelFile(existing)) {
    if (!process.env.VITEST) {
      try {
        const bundledDest = getPath(path.join('resources', 'models', 'silero-v5', 'v5_6_ru.pt'));
        if (bundledDest && existing !== bundledDest && !isValidSileroModelFile(bundledDest)) {
          fs.mkdirSync(path.dirname(bundledDest), { recursive: true });
          fs.copyFileSync(existing, bundledDest);
        }
      } catch {}
    }
    options?.onProgress?.({
      modelId: 'silero-tts-v5',
      bytesDone: SILERO_V56_EXPECTED_SIZE,
      totalBytes: SILERO_V56_EXPECTED_SIZE,
      percent: 100,
      status: 'completed'
    });
    return existing;
  }
  if (options?.allowDownload === false) {
    return null;
  }
  if (process.env.VITEST) return existing;

  let destPath = getPath(path.join('resources', 'models', 'silero-v5', 'v5_6_ru.pt'));
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
  } catch {
    if (app?.getPath) {
      destPath = path.join(app.getPath('userData'), 'models', 'silero-v5', 'v5_6_ru.pt');
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
    }
  }

  const destDir = path.dirname(destPath);
  const stagingDir = path.join(destDir, '.staging', `silero-v5-${Date.now()}`);
  const stagedPart = path.join(stagingDir, 'v5_6_ru.pt.part');
  const modelUrl = SILERO_TTS_MODEL_MANIFEST.files[0].url;

  console.log(`[Python Server] v5_6_ru.pt missing locally. Downloading verified Silero v5.6 model to ${destPath}...`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:loading-progress', 'Скачивание модели Silero TTS v5.6 (~141 МБ)...');
  }

  const controller = new AbortController();
  activeSileroDownloadAbort = controller;
  const emitProg = (bytesDone: number, percent: number, status: 'downloading' | 'verifying' | 'completed' | 'cancelled' | 'error', error?: string) => {
    options?.onProgress?.({ modelId: 'silero-tts-v5', bytesDone, totalBytes: SILERO_V56_EXPECTED_SIZE, percent, status, error });
  };

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    let loaded = 0;
    let lastPct = -1;
    emitProg(0, 0, 'downloading');
    await downloadFileWithSignal({
      url: modelUrl,
      destPartPath: stagedPart,
      signal: controller.signal,
      retries: 2,
      maxBytes: SILERO_V56_EXPECTED_SIZE,
      headers: { 'User-Agent': 'ARC-Silero-Provisioner/1.0' },
      onProgressChunk: (chunkSize) => {
        loaded += chunkSize;
        const pct = Math.min(99, Math.round((loaded / SILERO_V56_EXPECTED_SIZE) * 100));
        emitProg(loaded, pct, 'downloading');
        if (pct !== lastPct && pct % 10 === 0) {
          lastPct = pct;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:loading-progress', `Скачивание Silero TTS v5.6: ${pct}%`);
          }
        }
      }
    });

    emitProg(SILERO_V56_EXPECTED_SIZE, 99, 'verifying');
    const digestCheck = verifyStagedFileDigest(stagedPart, SILERO_V56_EXPECTED_SIZE, SILERO_V56_EXPECTED_SHA256);
    if (!digestCheck.ok || !digestCheck.actualSha256) {
      throw new Error(digestCheck.reason || 'Silero v5.6 SHA-256 verification failed');
    }

    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    fs.renameSync(stagedPart, destPath);
    writeSileroModelProvenanceMeta(destPath, digestCheck.actualSize, digestCheck.actualSha256);
    emitProg(digestCheck.actualSize, 100, 'completed');
    console.log(`[Python Server] Silero v5.6 model verified & published to ${destPath}`);
    return destPath;
  } catch (err: any) {
    const isCancelled = controller.signal.aborted || /cancel|abort/i.test(String(err?.message || ''));
    emitProg(0, 0, isCancelled ? 'cancelled' : 'error', isCancelled ? undefined : (err?.message || String(err)));
    console.warn(`[Python Server] Failed to download/verify Silero v5.6 model: ${err?.message || err}`);
    return null;
  } finally {
    if (activeSileroDownloadAbort === controller) activeSileroDownloadAbort = null;
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
  }
}

export interface TtsDictsPaths {
  bundledDictsDir: string;
  userDictsDir: string;
  logsDir: string;
  bundledExists: boolean;
}

export function resolveTtsDictsPaths(getPath: (rel: string) => string): TtsDictsPaths {
  const relDicts = path.join('Voice', 'dicts');
  const isDev = !app?.isPackaged || process.env.NODE_ENV === 'development';
  const appPath = app?.getAppPath ? app.getAppPath() : process.cwd();
  const resPath = process.resourcesPath || path.join(appPath, '..');

  const envBundled = process.env.ARC_TTS_DICTS_DIR?.trim();
  const candidates: string[] = [];
  if (envBundled) candidates.push(envBundled);
  if (isDev) {
    candidates.push(path.join(process.cwd(), relDicts), path.join(appPath, relDicts), getPath(relDicts));
  } else {
    candidates.push(path.join(resPath, relDicts), path.join(resPath, 'app.asar.unpacked', relDicts), path.join(appPath, '..', relDicts), getPath(relDicts));
  }

  let bundledDictsDir = '';
  let bundledExists = false;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        bundledDictsDir = candidate;
        bundledExists = true;
        break;
      }
    } catch {}
  }
  if (!bundledDictsDir) bundledDictsDir = isDev ? path.join(process.cwd(), relDicts) : path.join(resPath, relDicts);

  let userDataBase = '';
  try { if (app?.getPath) userDataBase = app.getPath('userData'); } catch {}
  if (!userDataBase) {
    userDataBase = process.env.APPDATA ? path.join(process.env.APPDATA, 'A.R.C.') : path.join(os.tmpdir(), 'arc_user_data');
  }

  const userDictsDir = process.env.ARC_TTS_USER_DICTS_DIR?.trim() || path.join(userDataBase, 'tts_dicts');
  const logsDir = process.env.ARC_TTS_LOGS_DIR?.trim() || path.join(userDataBase, 'logs');
  return { bundledDictsDir, userDictsDir, logsDir, bundledExists };
}

export function ensureTtsDictsWritableDirs(paths: TtsDictsPaths): void {
  for (const dir of [paths.userDictsDir, paths.logsDir]) {
    if (!dir) continue;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (err: any) {
      console.warn(`[Python Server] Failed to create writable directory ${dir}:`, err?.message || err);
    }
  }
}

export function prepareTtsDictsSpawnEnv(
  getPath: (rel: string) => string,
  baseEnv: NodeJS.ProcessEnv = process.env
): { dictsPaths: TtsDictsPaths; spawnEnv: NodeJS.ProcessEnv } {
  const dictsPaths = resolveTtsDictsPaths(getPath);
  ensureTtsDictsWritableDirs(dictsPaths);
  const spawnEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    ARC_TTS_DICTS_DIR: dictsPaths.bundledDictsDir,
    ARC_TTS_USER_DICTS_DIR: dictsPaths.userDictsDir,
    ARC_TTS_LOGS_DIR: dictsPaths.logsDir
  };
  if (app?.isPackaged && app?.getPath) {
    spawnEnv.ARC_TTS_CACHE_DIR = path.join(app.getPath('userData'), 'tts_cache');
  }
  return { dictsPaths, spawnEnv };
}
