import { spawn, execFile, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const SYSTEM_TTS_TEXT_FILE_ENV = 'ARC_TTS_TEXT_FILE';
export const SYSTEM_TTS_MIN_TIMEOUT_MS = 15_000;
export const SYSTEM_TTS_BASE_TIMEOUT_MS = 12_000;
export const SYSTEM_TTS_MS_PER_CHAR = 140;
export const SYSTEM_TTS_MAX_TIMEOUT_MS = 180_000;
const MAX_STDERR_BYTES = 1024;

/**
 * Static Windows PowerShell SAPI script.
 * Path and text are NEVER interpolated into this source string:
 * the UTF-8 temp file path is passed strictly via the ARC_TTS_TEXT_FILE env variable
 * and read via -LiteralPath / [System.IO.File]::ReadAllText.
 */
export const WINDOWS_SAPI_POWERSHELL_SCRIPT = [
  "$ErrorActionPreference = 'Stop';",
  `$textFile = $env:${SYSTEM_TTS_TEXT_FILE_ENV};`,
  "if ([string]::IsNullOrWhiteSpace($textFile) -or -not (Test-Path -LiteralPath $textFile -PathType Leaf)) { [Console]::Error.WriteLine('SAPI text file missing'); exit 2 };",
  '$text = [System.IO.File]::ReadAllText($textFile, [System.Text.Encoding]::UTF8);',
  'if ([string]::IsNullOrWhiteSpace($text)) { exit 0 };',
  'Add-Type -AssemblyName System.Speech;',
  '$synth = $null;',
  'try {',
  '  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
  "  $ruVoices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -match '^ru' });",
  '  if ($ruVoices.Count -gt 0) { $synth.SelectVoice($ruVoices[0].VoiceInfo.Name) } else { Write-Warning "No Russian voice found" };',
  '  $synth.Speak($text);',
  '} finally {',
  '  if ($null -ne $synth) { $synth.Dispose() }',
  '}',
].join(' ');

export interface SystemTtsInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  shell: false;
  windowsHide: true;
  timeoutMs: number;
}

export interface RunSystemTtsOptions {
  text: string;
  tempDir: string;
  speakId?: number;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  isStale?: () => boolean;
  onProcessStarted?: (child: ChildProcess) => void;
  onProcessCleared?: (child: ChildProcess) => void;
  spawnFn?: typeof spawn;
  execFileFn?: typeof execFile;
}

export function sanitizeSystemTtsText(text: string): string {
  return String(text ?? '')
    .replace(/\+([а-яёА-ЯЁ])/g, '$1')
    .replace(/\0/g, '')
    .trim();
}

export function computeSystemTtsTimeoutMs(textLength: number): number {
  const safeLen = Number.isFinite(textLength) && textLength > 0 ? Math.floor(textLength) : 0;
  const computed = SYSTEM_TTS_BASE_TIMEOUT_MS + Math.ceil(safeLen * SYSTEM_TTS_MS_PER_CHAR);
  return Math.min(SYSTEM_TTS_MAX_TIMEOUT_MS, Math.max(SYSTEM_TTS_MIN_TIMEOUT_MS, computed));
}

export function buildSystemTtsInvocation(
  textFile: string,
  options?: {
    platform?: NodeJS.Platform;
    baseEnv?: NodeJS.ProcessEnv;
    textLength?: number;
    timeoutMs?: number;
  }
): SystemTtsInvocation {
  const platform = options?.platform ?? process.platform;
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.floor(options.timeoutMs)
      : computeSystemTtsTimeoutMs(options?.textLength ?? 0);
  const baseEnv: NodeJS.ProcessEnv = { ...(options?.baseEnv ?? process.env) };

  if (platform === 'win32') {
    baseEnv[SYSTEM_TTS_TEXT_FILE_ENV] = textFile;
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        WINDOWS_SAPI_POWERSHELL_SCRIPT,
      ],
      env: baseEnv,
      shell: false,
      windowsHide: true,
      timeoutMs,
    };
  }

  if (platform === 'darwin') {
    return {
      command: 'say',
      args: ['-f', textFile],
      env: baseEnv,
      shell: false,
      windowsHide: true,
      timeoutMs,
    };
  }

  return {
    command: 'espeak',
    args: ['-f', textFile],
    env: baseEnv,
    shell: false,
    windowsHide: true,
    timeoutMs,
  };
}

export function terminateChildProcessTree(
  child: ChildProcess | null | undefined,
  platform: NodeJS.Platform = process.platform,
  execFileFn: typeof execFile = execFile
): void {
  if (!child) return;
  const pid = child.pid;
  if (platform === 'win32') {
    if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0) {
      try {
        execFileFn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true }, () => {});
        return;
      } catch {
        // Fall back to direct kill below if taskkill fails to spawn
      }
    }
    try { child.kill(); } catch {}
    return;
  }

  try { child.kill('SIGTERM'); } catch {}
  const forceTimer = setTimeout(() => {
    try {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
    } catch {}
  }, 400);
  if (typeof forceTimer.unref === 'function') {
    forceTimer.unref();
  }
}

function makeSystemTtsError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

export async function runSystemTtsProcess(options: RunSystemTtsOptions): Promise<void> {
  const cleanText = sanitizeSystemTtsText(options.text);
  if (!cleanText) return;
  if (options.abortSignal?.aborted || options.isStale?.()) return;

  const platform = options.platform ?? process.platform;
  const spawnImpl = options.spawnFn ?? spawn;
  const execFileImpl = options.execFileFn ?? execFile;

  const nonce = crypto.randomBytes(4).toString('hex');
  const textFile = path.join(
    options.tempDir,
    `temp_tts_system_${Date.now()}_${options.speakId ?? 0}_${nonce}.txt`
  );

  let cleanedUp = false;
  const cleanupTempFile = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
    } catch {
      // Ignore best-effort temp cleanup error
    }
  };

  try {
    fs.writeFileSync(textFile, cleanText, 'utf8');
  } catch (writeErr) {
    cleanupTempFile();
    throw writeErr;
  }

  if (options.abortSignal?.aborted || options.isStale?.()) {
    cleanupTempFile();
    return;
  }

  const invocation = buildSystemTtsInvocation(textFile, {
    platform,
    textLength: cleanText.length,
    timeoutMs: options.timeoutMs,
  });

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let stderrText = '';
    let child: ChildProcess;

    const finalize = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (options.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }
      options.onProcessCleared?.(child);
      cleanupTempFile();
      if (error !== undefined) reject(error);
      else resolve();
    };

    const onAbort = () => {
      if (settled) return;
      aborted = true;
      terminateChildProcessTree(child, platform, execFileImpl);
      finalize();
    };

    try {
      child = spawnImpl(invocation.command, invocation.args, {
        env: invocation.env,
        shell: false,
        windowsHide: invocation.windowsHide,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (spawnErr) {
      cleanupTempFile();
      reject(spawnErr);
      return;
    }

    options.onProcessStarted?.(child);

    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk: Buffer | string) => {
        if (stderrText.length >= MAX_STDERR_BYTES) return;
        const piece = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        stderrText = (stderrText + piece).slice(0, MAX_STDERR_BYTES);
      });
    }

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminateChildProcessTree(child, platform, execFileImpl);
      finalize(
        makeSystemTtsError(
          `System TTS timed out after ${invocation.timeoutMs}ms`,
          'ETIMEDOUT'
        )
      );
    }, invocation.timeoutMs);

    if (options.abortSignal) {
      if (options.abortSignal.aborted) {
        onAbort();
        return;
      }
      options.abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    child.once('error', (err: NodeJS.ErrnoException) => {
      if (aborted || options.isStale?.()) {
        finalize();
        return;
      }
      finalize(err);
    });

    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (aborted || options.isStale?.()) {
        finalize();
        return;
      }
      if (timedOut) return;
      if (code === 0) {
        finalize();
        return;
      }
      const stderrSummary = stderrText.replace(/\s+/g, ' ').trim().slice(0, 200);
      const detail = stderrSummary ? `: ${stderrSummary}` : '';
      const exitDesc = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      finalize(
        makeSystemTtsError(
          `System TTS process exited with ${exitDesc}${detail}`,
          signal ? 'SIGTERM' : `EXIT_${code ?? 'UNKNOWN'}`
        )
      );
    });
  });
}
