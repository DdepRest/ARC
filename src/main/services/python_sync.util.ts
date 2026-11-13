import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, BrowserWindow } from 'electron';

export function calculateHash(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
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
      const sourceHash = calculateHash(sourcePath);
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
    console.log(`[SILERO SERVER] Code synced, hash: ${lastHash}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:log', { type: 'INFO', message: `[SILERO SERVER] Code synced, hash: ${lastHash}` });
    }
  }
}

export function isValidSileroModelFile(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  try {
    if (!fs.existsSync(filePath)) return false;
    if (process.env.VITEST) return true;
    return fs.statSync(filePath).size > 10 * 1024 * 1024;
  } catch {
    return false;
  }
}

export async function cleanupStaleSileroServerOn8002(): Promise<void> {
  if (process.env.VITEST) return;
  try {
    const axios = require('axios');
    await axios.get('http://127.0.0.1:8002/status', { timeout: 800 });
    return; // Already online with 200 OK
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

function downloadFileWithRedirects(url: string, destPath: string, onProgress?: (pct: number) => void): Promise<void> {
  const https = require('https');
  const http = require('http');
  const tmpPath = `${destPath}.tmp`;
  return new Promise((resolve, reject) => {
    const fetchUrl = (targetUrl: string, redirectsLeft: number) => {
      if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
      const mod = targetUrl.startsWith('https') ? https : http;
      const req = mod.get(targetUrl, { headers: { 'User-Agent': 'ARC-Silero-Provisioner/1.0' } }, (res: any) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          res.resume();
          return fetchUrl(nextUrl, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        let lastPct = -1;
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const fileStream = fs.createWriteStream(tmpPath);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0 && onProgress) {
            const pct = Math.round((received / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              lastPct = pct;
              onProgress(pct);
            }
          }
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(tmpPath, destPath);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
        fileStream.on('error', (err: Error) => {
          try { fs.unlinkSync(tmpPath); } catch {}
          reject(err);
        });
      });
      req.on('error', (err: Error) => {
        try { fs.unlinkSync(tmpPath); } catch {}
        reject(err);
      });
      req.setTimeout(180000, () => {
        req.destroy(new Error('Download timeout'));
      });
    };
    fetchUrl(url, 5);
  });
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

export async function ensureSileroModelReady(
  getPath: (rel: string) => string,
  resolveModelPath: () => string | null,
  mainWindow?: BrowserWindow | null
): Promise<string | null> {
  // Always purge legacy v5.5 model files across known locations
  removeLegacySileroV55Model(getPath);

  const existing = resolveModelPath();
  if (isValidSileroModelFile(existing)) {
    if (!process.env.VITEST) {
      try {
        const bundledDest = getPath(path.join('resources', 'models', 'silero-v5', 'v5_6_ru.pt'));
        if (bundledDest && existing !== bundledDest && !isValidSileroModelFile(bundledDest)) {
          fs.mkdirSync(path.dirname(bundledDest), { recursive: true });
          fs.copyFileSync(existing!, bundledDest);
        }
      } catch {}
    }
    return existing;
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

  console.log(`[Python Server] v5_6_ru.pt missing locally. Downloading Silero v5.6 model to ${destPath}...`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:loading-progress', 'Скачивание модели Silero TTS v5.6 (~100 МБ)...');
  }
  try {
    await downloadFileWithRedirects('https://models.silero.ai/models/tts/ru/v5_6_ru.pt', destPath, (pct) => {
      console.log(`[Python Server] Silero v5.6 model download: ${pct}%`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:loading-progress', `Скачивание Silero TTS v5.6: ${pct}%`);
      }
    });
    if (isValidSileroModelFile(destPath)) {
      console.log(`[Python Server] Silero v5.6 model downloaded successfully to ${destPath}`);
      return destPath;
    }
  } catch (err: any) {
    console.warn(`[Python Server] Failed to download Silero v5.6 model: ${err?.message || err}`);
  }
  return resolveModelPath();
}
