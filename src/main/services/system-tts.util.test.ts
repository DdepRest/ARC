import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ChildProcess } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSystemTtsInvocation,
  computeSystemTtsTimeoutMs,
  runSystemTtsProcess,
  sanitizeSystemTtsText,
  SYSTEM_TTS_MAX_TIMEOUT_MS,
  SYSTEM_TTS_MIN_TIMEOUT_MS,
  SYSTEM_TTS_TEXT_FILE_ENV,
  terminateChildProcessTree,
  WINDOWS_SAPI_POWERSHELL_SCRIPT,
} from './system-tts.util';

class FakeChildProcess extends EventEmitter {
  public pid: number | undefined;
  public exitCode: number | null = null;
  public killed = false;
  public stderr = new EventEmitter();
  public kill = vi.fn((_signal?: NodeJS.Signals | number) => {
    this.killed = true;
    return true;
  });

  constructor(pid = 4321) {
    super();
    this.pid = pid;
  }
}

describe('system-tts.util (S3-09 PowerShell/SAPI safe path & process control)', () => {
  let tmpBaseDir: string;

  beforeEach(() => {
    tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc tts Тест O'Connor (x86) [1]-"));
  });

  afterEach(() => {
    fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('passes Windows temp file path strictly via ARC_TTS_TEXT_FILE env with shell:false and never interpolates it into PowerShell code', () => {
    const hostilePath =
      "C:\\Users\\Иван O'Connor (Work) [Dev]\\AppData\\Local\\Temp\\$calc;Start-Process notepad;\"`evil`.txt";
    const inv = buildSystemTtsInvocation(hostilePath, {
      platform: 'win32',
      baseEnv: { PATH: 'C:\\Windows\\System32' },
      textLength: 50,
    });

    expect(inv.command).toBe('powershell.exe');
    expect(inv.shell).toBe(false);
    expect(inv.windowsHide).toBe(true);
    expect(inv.args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      WINDOWS_SAPI_POWERSHELL_SCRIPT,
    ]);
    expect(inv.env[SYSTEM_TTS_TEXT_FILE_ENV]).toBe(hostilePath);
    for (const arg of inv.args) {
      expect(arg).not.toContain(hostilePath);
      expect(arg).not.toContain("O'Connor");
      expect(arg).not.toContain('Start-Process');
    }
    expect(WINDOWS_SAPI_POWERSHELL_SCRIPT).toContain(`$env:${SYSTEM_TTS_TEXT_FILE_ENV}`);
    expect(WINDOWS_SAPI_POWERSHELL_SCRIPT).toContain('-LiteralPath');
    expect(WINDOWS_SAPI_POWERSHELL_SCRIPT).toContain('$synth.Dispose()');
  });

  it('uses direct shell:false invocations with -f on darwin and linux', () => {
    const trickyPath = "/tmp/Иван O'Connor (1)/tts text.txt";
    const macInv = buildSystemTtsInvocation(trickyPath, { platform: 'darwin', baseEnv: {} });
    expect(macInv.command).toBe('say');
    expect(macInv.args).toEqual(['-f', trickyPath]);
    expect(macInv.shell).toBe(false);

    const linuxInv = buildSystemTtsInvocation(trickyPath, { platform: 'linux', baseEnv: {} });
    expect(linuxInv.command).toBe('espeak');
    expect(linuxInv.args).toEqual(['-f', trickyPath]);
    expect(linuxInv.shell).toBe(false);
  });

  it('computes bounded adaptive timeouts based on text length', () => {
    expect(computeSystemTtsTimeoutMs(0)).toBe(SYSTEM_TTS_MIN_TIMEOUT_MS);
    expect(computeSystemTtsTimeoutMs(10)).toBe(SYSTEM_TTS_MIN_TIMEOUT_MS);
    const medium = computeSystemTtsTimeoutMs(200);
    expect(medium).toBeGreaterThan(SYSTEM_TTS_MIN_TIMEOUT_MS);
    expect(medium).toBeLessThan(SYSTEM_TTS_MAX_TIMEOUT_MS);
    expect(computeSystemTtsTimeoutMs(5000)).toBe(SYSTEM_TTS_MAX_TIMEOUT_MS);
  });

  it('sanitizes Silero stress marks and NUL bytes while preserving normal quotes and apostrophes', () => {
    expect(sanitizeSystemTtsText("Пр+ивет, O'Connor! «Тест»\0")).toBe("Привет, O'Connor! «Тест»");
  });

  it('writes UTF-8 text into a tricky temp dir, passes path via env, and cleans up temp file on success', async () => {
    let observedPath = '';
    let observedContent = '';
    let observedShell: unknown;

    const spawnMock = vi.fn((_cmd: string, _args: readonly string[], opts: any) => {
      observedShell = opts?.shell;
      observedPath = opts?.env?.[SYSTEM_TTS_TEXT_FILE_ENV] || '';
      observedContent = fs.readFileSync(observedPath, 'utf8');
      const fake = new FakeChildProcess(5501);
      queueMicrotask(() => {
        fake.exitCode = 0;
        fake.emit('close', 0, null);
      });
      return fake as unknown as ChildProcess;
    });

    await runSystemTtsProcess({
      text: "Пр+ивет из каталога с пробелами и O'Connor (тест)",
      tempDir: tmpBaseDir,
      speakId: 7,
      platform: 'win32',
      spawnFn: spawnMock as any,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(observedShell).toBe(false);
    expect(observedPath.startsWith(tmpBaseDir)).toBe(true);
    expect(observedContent).toBe("Привет из каталога с пробелами и O'Connor (тест)");
    expect(fs.existsSync(observedPath)).toBe(false);
  });

  it('rejects on non-zero exit code with stderr detail and cleans up temp file', async () => {
    let observedPath = '';
    const spawnMock = vi.fn((_cmd: string, _args: readonly string[], opts: any) => {
      observedPath = opts?.env?.[SYSTEM_TTS_TEXT_FILE_ENV] || '';
      const fake = new FakeChildProcess(5502);
      queueMicrotask(() => {
        fake.stderr.emit('data', Buffer.from('SAPI voice engine unavailable'));
        fake.exitCode = 2;
        fake.emit('close', 2, null);
      });
      return fake as unknown as ChildProcess;
    });

    await expect(
      runSystemTtsProcess({
        text: 'Тест ошибки SAPI',
        tempDir: tmpBaseDir,
        platform: 'win32',
        spawnFn: spawnMock as any,
      })
    ).rejects.toMatchObject({
      code: 'EXIT_2',
      message: expect.stringContaining('SAPI voice engine unavailable'),
    });

    expect(observedPath).not.toBe('');
    expect(fs.existsSync(observedPath)).toBe(false);
  });

  it('kills process tree via execFile taskkill on timeout and cleans up temp file', async () => {
    let observedPath = '';
    const execFileMock = vi.fn((_file: string, _args: readonly string[], _opts: any, cb?: any) => {
      if (typeof cb === 'function') cb(null, '', '');
      return {} as ChildProcess;
    });
    const spawnMock = vi.fn((_cmd: string, _args: readonly string[], opts: any) => {
      observedPath = opts?.env?.[SYSTEM_TTS_TEXT_FILE_ENV] || '';
      return new FakeChildProcess(7777) as unknown as ChildProcess;
    });

    await expect(
      runSystemTtsProcess({
        text: 'Зависший SAPI',
        tempDir: tmpBaseDir,
        platform: 'win32',
        timeoutMs: 35,
        spawnFn: spawnMock as any,
        execFileFn: execFileMock as any,
      })
    ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '7777', '/t', '/f'],
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function)
    );
    expect(fs.existsSync(observedPath)).toBe(false);
  });

  it('terminates process cleanly and removes temp file without error when aborted', async () => {
    let observedPath = '';
    const ac = new AbortController();
    const execFileMock = vi.fn((_file: string, _args: readonly string[], _opts: any, cb?: any) => {
      if (typeof cb === 'function') cb(null, '', '');
      return {} as ChildProcess;
    });
    const spawnMock = vi.fn((_cmd: string, _args: readonly string[], opts: any) => {
      observedPath = opts?.env?.[SYSTEM_TTS_TEXT_FILE_ENV] || '';
      return new FakeChildProcess(8888) as unknown as ChildProcess;
    });

    const runPromise = runSystemTtsProcess({
      text: 'Прерываемая фраза',
      tempDir: tmpBaseDir,
      platform: 'win32',
      timeoutMs: 5000,
      abortSignal: ac.signal,
      spawnFn: spawnMock as any,
      execFileFn: execFileMock as any,
    });

    ac.abort();
    await expect(runPromise).resolves.toBeUndefined();
    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '8888', '/t', '/f'],
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function)
    );
    expect(fs.existsSync(observedPath)).toBe(false);
  });

  it('terminateChildProcessTree guards invalid PIDs on win32 and falls back to child.kill()', () => {
    const execFileMock = vi.fn();
    const fake = new FakeChildProcess(undefined as any);
    fake.pid = -1;
    terminateChildProcessTree(fake as unknown as ChildProcess, 'win32', execFileMock as any);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(fake.kill).toHaveBeenCalledTimes(1);
  });
});
