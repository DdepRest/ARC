import treeKill from 'tree-kill';
import { spawn, exec, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import {
  buildDependencyResultFromProbe,
  buildPythonProbeCommand,
  CORE_REQUIRED_MODULES,
  createEmptyRuntimeInfo,
  parsePythonProbeOutput,
  parseSileroRequirements,
  type DependencyCheckResult,
  type DependencyFailureReason,
  type DependencyPhase,
  type ParsedProbeSnapshot
} from './python_deps.contract';

export type {
  DependencyCheckResult,
  DependencyFailureReason,
  DependencyPhase,
  DependencyReadinessState,
  PythonRuntimeInfo
} from './python_deps.contract';

interface ActiveInstallerState {
  promise: Promise<DependencyCheckResult> | null;
  pipChild: ChildProcess | null;
  phase: DependencyPhase;
  activePackage: string | null;
  cancelled: boolean;
  cancelAbort: (() => void) | null;
}

const installer: ActiveInstallerState = {
  promise: null,
  pipChild: null,
  phase: 'IDLE',
  activePackage: null,
  cancelled: false,
  cancelAbort: null
};

let lastDependencyReadiness: DependencyCheckResult | null = null;

function sendWin(win: BrowserWindow | null | undefined, channel: string, payload: any): void {
  try {
    if (win && !win.isDestroyed?.() && !win.webContents?.isDestroyed?.()) {
      win.webContents.send(channel, payload);
    }
  } catch {}
}

function runCmdAsync(cmd: string, options: any = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout ? stdout.toString() : '');
    });
  });
}

async function probeFfmpegAsync(): Promise<boolean> {
  const envFfmpeg = process.env.ARC_FFMPEG_PATH?.trim();
  if (envFfmpeg) {
    try {
      if (fs.existsSync(envFfmpeg) && fs.statSync(envFfmpeg).isFile()) return true;
    } catch {}
  }
  try {
    await runCmdAsync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function probePythonEnv(targetPython: string, ffmpegReady: boolean): Promise<ParsedProbeSnapshot | null> {
  try {
    const stdout = await runCmdAsync(buildPythonProbeCommand(targetPython), { encoding: 'utf-8', timeout: 20000 });
    return parsePythonProbeOutput(targetPython, stdout, ffmpegReady);
  } catch {
    return null;
  }
}

function runPipStage(
  targetPython: string,
  specs: string[],
  cwd: string,
  stageLabel: string,
  mainWindow: BrowserWindow | null | undefined
): Promise<{ ok: boolean; reason?: DependencyFailureReason; errorText?: string }> {
  if (installer.cancelled) {
    return Promise.resolve({ ok: false, reason: 'cancelled', errorText: `${stageLabel} cancelled` });
  }

  return new Promise((resolve) => {
    let settled = false;
    let checkTimer: NodeJS.Timeout | null = null;
    let lastActivityAt = Date.now();
    const startTime = Date.now();
    const idleTimeoutMs = (parseInt(process.env.ARC_PIP_IDLE_TIMEOUT_SEC || '', 10) || 300) * 1000;
    const wallClockCapMs = (parseInt(process.env.ARC_PIP_WALL_TIMEOUT_SEC || '', 10) || 1800) * 1000;
    let lastErrLine = '';

    const finish = (res: { ok: boolean; reason?: DependencyFailureReason; errorText?: string }) => {
      if (settled) return;
      settled = true;
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
      if (installer.pipChild === pipChild) installer.pipChild = null;
      installer.cancelAbort = null;
      installer.activePackage = null;
      resolve(res);
    };

    let pipChild: ChildProcess;
    try {
      pipChild = spawn(targetPython, ['-m', 'pip', 'install', '--no-cache-dir', ...specs], { cwd, shell: false });
    } catch (spawnErr: any) {
      return finish({ ok: false, reason: 'pip_failed', errorText: spawnErr?.message || 'pip spawn failed' });
    }

    installer.pipChild = pipChild;
    installer.cancelAbort = () => {
      if (pipChild.pid) treeKill(pipChild.pid, 'SIGKILL');
      finish({ ok: false, reason: 'cancelled', errorText: `${stageLabel} installation cancelled` });
    };

    const onData = (chunk: Buffer | string) => {
      if (chunk && chunk.length > 0) lastActivityAt = Date.now();
      const str = chunk.toString();
      if (!str.includes('\n')) return;
      for (const rawLine of str.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const collectMatch = /^Collecting\s+([A-Za-z0-9_.-]+)/i.exec(trimmed);
        if (collectMatch) installer.activePackage = collectMatch[1];
        if (/ERROR:/i.test(trimmed)) lastErrLine = trimmed;
        sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: `[pip] ${trimmed}` });
      }
    };

    pipChild.stdout?.on('data', onData);
    pipChild.stderr?.on('data', onData);

    checkTimer = setInterval(() => {
      if (installer.cancelled) {
        if (pipChild.pid) treeKill(pipChild.pid, 'SIGKILL');
        finish({ ok: false, reason: 'cancelled', errorText: `${stageLabel} installation cancelled` });
        return;
      }
      const now = Date.now();
      if (now - lastActivityAt > idleTimeoutMs) {
        if (pipChild.pid) treeKill(pipChild.pid, 'SIGKILL');
        finish({ ok: false, reason: 'pip_idle_timeout', errorText: `${stageLabel} pip idle timeout` });
      } else if (now - startTime > wallClockCapMs) {
        if (pipChild.pid) treeKill(pipChild.pid, 'SIGKILL');
        finish({ ok: false, reason: 'pip_wall_timeout', errorText: `${stageLabel} pip wall-clock timeout` });
      }
    }, 5000);

    pipChild.on('close', (code) => {
      if (installer.cancelled) {
        return finish({ ok: false, reason: 'cancelled', errorText: `${stageLabel} installation cancelled` });
      }
      if (code === 0) return finish({ ok: true });
      finish({ ok: false, reason: 'pip_failed', errorText: lastErrLine || `${stageLabel} pip exited with code ${code}` });
    });

    pipChild.on('error', (err: any) => {
      finish({ ok: false, reason: installer.cancelled ? 'cancelled' : 'pip_failed', errorText: err?.message || 'pip error' });
    });
  });
}

function makeErrorResult(
  targetPython: string,
  ffmpegReady: boolean,
  reason: DependencyFailureReason,
  errors: string[],
  probe?: ParsedProbeSnapshot | null
): DependencyCheckResult {
  if (probe) {
    return buildDependencyResultFromProbe(
      { ...probe, coreReady: false },
      errors,
      reason
    );
  }
  return {
    success: false,
    state: 'ERROR',
    phase: 'ERROR',
    reason,
    coreReady: false,
    dspReady: false,
    accentReady: false,
    ffmpegReady,
    pythonRuntime: createEmptyRuntimeInfo(targetPython, false),
    installedPackages: [],
    missingCore: [...CORE_REQUIRED_MODULES],
    missingOptional: ['scipy', 'onnxruntime', 'ruaccent'],
    errors: Array.from(new Set(errors.filter(Boolean)))
  };
}

export function getLastDependencyReadiness(): DependencyCheckResult | null {
  return lastDependencyReadiness;
}

export function recordPythonNotFound(): DependencyCheckResult {
  const result = makeErrorResult('', false, 'python_not_found', ['Python 3.10–3.12 не найден в системе или встроенном пакете (активен системный голос)']);
  installer.phase = 'ERROR';
  lastDependencyReadiness = result;
  return result;
}

export function getDependencyInstallerState(): {
  phase: DependencyPhase;
  activePackage: string | null;
  inProgress: boolean;
} {
  return {
    phase: installer.phase,
    activePackage: installer.activePackage,
    inProgress: Boolean(installer.promise)
  };
}

export function cancelDependencyInstall(): boolean {
  if (!installer.promise) return false;
  installer.cancelled = true;
  if (installer.cancelAbort) {
    installer.cancelAbort();
  } else if (installer.pipChild?.pid) {
    treeKill(installer.pipChild.pid, 'SIGKILL');
  }
  return true;
}

export function resetDependencyInstallerForTests(): void {
  installer.promise = null;
  installer.pipChild = null;
  installer.phase = 'IDLE';
  installer.activePackage = null;
  installer.cancelled = false;
  installer.cancelAbort = null;
  lastDependencyReadiness = null;
}

async function runEnsureDependencies(
  targetPython: string,
  mainWindow: BrowserWindow | null | undefined,
  getPath: (rel: string) => string,
  allowInstall = true
): Promise<DependencyCheckResult> {
  installer.cancelled = false;
  installer.phase = 'CHECKING';

  const ffmpegReady = await probeFfmpegAsync();
  if (!ffmpegReady) {
    console.warn('[Python Server] WARNING: ffmpeg not found. DSP filters will be skipped (raw WAV still works).');
    sendWin(mainWindow, 'terminal:log', { type: 'WARN', message: '[Python Server] ffmpeg missing: DSP effects disabled.' });
  }

  try {
    const initialProbe = await probePythonEnv(targetPython, ffmpegReady);
    if (installer.cancelled) {
      return makeErrorResult(targetPython, ffmpegReady, 'cancelled', ['Проверка зависимостей отменена'], initialProbe);
    }

    if (initialProbe && initialProbe.coreReady && (initialProbe.accentReady || !allowInstall) && (initialProbe.scipyReady || !allowInstall)) {
      console.log('[Python Server] All Silero Core + Accent Python packages verified.');
      sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: '[Python Server] Dependencies OK.' });
      return buildDependencyResultFromProbe(initialProbe);
    }

    if (!allowInstall) {
      const reason = initialProbe && !initialProbe.pythonRuntime.supported ? 'python_unsupported' : 'import_check_failed';
      return makeErrorResult(targetPython, ffmpegReady, reason, ['Зависимости Silero не установлены (требуется запуск настройки голоса)'], initialProbe);
    }

    const reqPath = getPath('requirements-silero.txt');
    const reqRaw = fs.existsSync(reqPath) ? fs.readFileSync(reqPath, 'utf-8') : '';
    const { coreSpecs, accentSpecs } = parseSileroRequirements(reqRaw);

    let currentProbe = initialProbe;
    const extraErrors: string[] = [];

    if (initialProbe && !initialProbe.coreReady && !initialProbe.pythonRuntime.supported) {
      const msgs = initialProbe.pythonRuntime.warnings.length > 0 ? initialProbe.pythonRuntime.warnings : ['Неподдерживаемая версия или архитектура Python (требуется Python 3.10–3.12 x64)'];
      return makeErrorResult(targetPython, ffmpegReady, 'python_unsupported', msgs, initialProbe);
    }

    if (initialProbe && !initialProbe.coreReady && !initialProbe.pythonRuntime.pipAvailable) {
      return makeErrorResult(targetPython, ffmpegReady, 'pip_unavailable', ['pip недоступен в выбранном Python окружении'], initialProbe);
    }

    // Stage 1: Core required packages
    if (!currentProbe || !currentProbe.coreReady) {
      if (!fs.existsSync(reqPath)) {
        return makeErrorResult(targetPython, ffmpegReady, 'pip_failed', ['Файл requirements-silero.txt не найден'], currentProbe);
      }
      installer.phase = 'INSTALLING_CORE';
      console.log('[Python Server] Missing Core Silero packages. Installing required Core dependencies...');
      sendWin(mainWindow, 'app:loading-progress', 'Установка базовых компонентов Silero TTS...');
      sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: '[Python Server] Installing Core dependencies...' });

      const coreInstall = await runPipStage(targetPython, coreSpecs, getPath('.'), 'Core', mainWindow);
      if (!coreInstall.ok) {
        return makeErrorResult(targetPython, ffmpegReady, coreInstall.reason || 'pip_failed', [coreInstall.errorText || 'Core pip install failed'], currentProbe);
      }

      currentProbe = await probePythonEnv(targetPython, ffmpegReady);
      if (installer.cancelled) {
        return makeErrorResult(targetPython, ffmpegReady, 'cancelled', ['Установка отменена'], currentProbe);
      }
      if (!currentProbe || !currentProbe.coreReady) {
        const failReason = currentProbe && !currentProbe.pythonRuntime.supported ? 'python_unsupported' : 'import_check_failed';
        return makeErrorResult(targetPython, ffmpegReady, failReason, ['Обязательные пакеты ядра Silero не импортируются после установки'], currentProbe);
      }
    }

    // Stage 2: Optional Accent packages (best-effort; never fail working Core)
    if (!currentProbe.accentReady && accentSpecs.length > 0) {
      if (!currentProbe.pythonRuntime.pipAvailable) {
        extraErrors.push('pip недоступен: установка опционального RUAccent пропущена');
      } else if (fs.existsSync(reqPath)) {
        installer.phase = 'INSTALLING_ACCENT';
        console.log('[Python Server] Installing optional RUAccent/onnxruntime packages...');
        sendWin(mainWindow, 'app:loading-progress', 'Установка модуля ударений RUAccent (опционально)...');
        sendWin(mainWindow, 'terminal:log', { type: 'INFO', message: '[Python Server] Installing optional Accent dependencies...' });

        const accentInstall = await runPipStage(targetPython, accentSpecs, getPath('.'), 'Accent', mainWindow);
        if (accentInstall.reason === 'cancelled') {
          return makeErrorResult(targetPython, ffmpegReady, 'cancelled', ['Установка отменена'], currentProbe);
        }
        if (!accentInstall.ok && accentInstall.errorText) {
          extraErrors.push(`Accent optional install degraded: ${accentInstall.errorText}`);
        }

        const afterAccentProbe = await probePythonEnv(targetPython, ffmpegReady);
        if (afterAccentProbe) currentProbe = afterAccentProbe;
        if (!currentProbe.coreReady) {
          return makeErrorResult(targetPython, ffmpegReady, 'import_check_failed', ['Ядро Silero нарушено после установки опционального Accent контура'], currentProbe);
        }
      }
    }

    return buildDependencyResultFromProbe(currentProbe, extraErrors);
  } catch (err: any) {
    return makeErrorResult(targetPython, ffmpegReady, 'pip_failed', [err?.message || 'Unexpected dependency check failure']);
  }
}

export function ensureDependenciesAsync(
  targetPython: string,
  mainWindow: BrowserWindow | null | undefined,
  getPath: (rel: string) => string,
  options?: { allowInstall?: boolean }
): Promise<DependencyCheckResult> {
  if (installer.promise) {
    return installer.promise;
  }

  const allowInstall = options?.allowInstall !== false;
  const runPromise = runEnsureDependencies(targetPython, mainWindow, getPath, allowInstall)
    .then((result) => {
      installer.phase = result.state;
      lastDependencyReadiness = result;
      return result;
    })
    .finally(() => {
      installer.promise = null;
      installer.pipChild = null;
      installer.cancelAbort = null;
      installer.activePackage = null;
      installer.cancelled = false;
    });

  installer.promise = runPromise;
  return runPromise;
}
