import treeKill from 'tree-kill';
import { spawn, exec, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';

export interface DependencyCheckResult {
  success: boolean;
  reason?: 'python_not_found' | 'venv_failed' | 'pip_idle_timeout' | 'pip_failed' | 'import_check_failed';
}

function runCmdAsync(cmd: string, options: any = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout ? stdout.toString() : '');
    });
  });
}

export async function ensureDependenciesAsync(
  targetPython: string,
  mainWindow: BrowserWindow,
  getPath: (rel: string) => string
): Promise<DependencyCheckResult> {
  try {
    await runCmdAsync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    console.warn('[Python Server] WARNING: ffmpeg not found in system PATH. DSP processing will fail.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:loading-progress', '[WARN] ffmpeg missing: Silero TTS will lack DSP processing.');
      mainWindow.webContents.send('terminal:log', { type: 'WARN', message: '[Python Server] ffmpeg not found in system PATH.' });
    }
  }

  const checkImportCmd = `"${targetPython}" -c "import torch, scipy, soundfile, flask, onnxruntime, ruaccent"`;
  const checkCoreImportCmd = `"${targetPython}" -c "import torch, scipy, soundfile, flask"`;
  const reqFile = 'requirements-silero.txt';

  try {
    await runCmdAsync(checkImportCmd);
    console.log('[Python Server] All required Python packages are present.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:log', { type: 'INFO', message: '[Python Server] Dependencies OK.' });
    }
    return { success: true };
  } catch {
    console.log('[Python Server] Missing required Python packages (or ruaccent/onnxruntime). Attempting automatic installation...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:loading-progress', 'Installing Silero TTS dependencies...');
      mainWindow.webContents.send('terminal:log', { type: 'INFO', message: '[Python Server] Installing dependencies...' });
    }
  }

  const reqPath = getPath(reqFile);
  if (!fs.existsSync(reqPath)) return { success: false, reason: 'pip_failed' };

  return new Promise<DependencyCheckResult>((resolve) => {
    let checkTimer: NodeJS.Timeout | null = null;
    let lastActivityAt = Date.now();
    const startTime = Date.now();
    const idleTimeoutMs = (parseInt(process.env.ARC_PIP_IDLE_TIMEOUT_SEC || '', 10) || 300) * 1000;
    const wallClockCapMs = 30 * 60 * 1000;

    const cleanupTimer = () => {
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
    };

    let pipChild: ChildProcess;
    try {
      pipChild = spawn(targetPython, ['-m', 'pip', 'install', '-r', reqPath, '--no-cache-dir'], {
        cwd: getPath('.'),
        shell: false
      });
    } catch {
      return resolve({ success: false, reason: 'pip_failed' });
    }

    const onData = (chunk: Buffer | string) => {
      if (chunk && chunk.length > 0) lastActivityAt = Date.now();
      const str = chunk.toString();
      if (str.includes('\n') && mainWindow && !mainWindow.isDestroyed()) {
        for (const line of str.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) mainWindow.webContents.send('terminal:log', { type: 'INFO', message: `[pip] ${trimmed}` });
        }
      }
    };

    pipChild.stdout?.on('data', onData);
    pipChild.stderr?.on('data', onData);

    checkTimer = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityAt > idleTimeoutMs) {
        cleanupTimer();
        if (pipChild.pid) treeKill(pipChild.pid, 'SIGKILL');
        resolve({ success: false, reason: 'pip_idle_timeout' });
      } else if (now - startTime > wallClockCapMs) {
        cleanupTimer();
        if (pipChild.pid) treeKill(pipChild.pid, 'SIGKILL');
        resolve({ success: false, reason: 'pip_failed' });
      }
    }, 5000);

    pipChild.on('close', async (code) => {
      cleanupTimer();
      if (code !== 0) return resolve({ success: false, reason: 'pip_failed' });
      try {
        await runCmdAsync(checkImportCmd);
        resolve({ success: true });
      } catch {
        try {
          await runCmdAsync(checkCoreImportCmd);
          resolve({ success: true });
        } catch {
          resolve({ success: false, reason: 'import_check_failed' });
        }
      }
    });

    pipChild.on('error', () => {
      cleanupTimer();
      resolve({ success: false, reason: 'pip_failed' });
    });
  });
}
