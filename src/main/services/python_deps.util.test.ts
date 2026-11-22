import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockTreeKill = vi.hoisted(() => vi.fn((_pid?: any, _sig?: any, cb?: any) => cb && cb()));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawn(...args),
    exec: (...args: any[]) => mockExec(...args)
  };
});

vi.mock('tree-kill', () => ({
  default: (pid: number, sig?: any, cb?: any) => (cb !== undefined ? mockTreeKill(pid, sig, cb) : mockTreeKill(pid, sig))
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}));

import {
  buildPythonProbeCommand,
  CORE_REQUIRED_MODULES,
  parsePythonProbeOutput,
  parseSileroRequirements
} from './python_deps.contract';
import {
  cancelDependencyInstall,
  ensureDependenciesAsync,
  getDependencyInstallerState,
  getLastDependencyReadiness,
  resetDependencyInstallerForTests
} from './python_deps.util';

function makeProbePayload(overrides: {
  version?: string;
  major?: number;
  minor?: number;
  arch?: string;
  platform?: string;
  pipAvailable?: boolean;
  missing?: string[];
} = {}): string {
  const missing = new Set(overrides.missing ?? []);
  const allMods = [...CORE_REQUIRED_MODULES, 'scipy', 'onnxruntime', 'ruaccent'];
  const modules: Record<string, { ok: boolean; error?: string }> = {};
  for (const mod of allMods) {
    modules[mod] = missing.has(mod)
      ? { ok: false, error: `ModuleNotFoundError: No module named '${mod}'` }
      : { ok: true };
  }
  return 'ARC_DEP_PROBE:' + JSON.stringify({
    version: overrides.version ?? '3.11.8',
    major: overrides.major ?? 3,
    minor: overrides.minor ?? 11,
    arch: overrides.arch ?? 'AMD64',
    platform: overrides.platform ?? 'win32',
    pipAvailable: overrides.pipAvailable ?? true,
    modules
  });
}

function makeFakeWin() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  } as any;
}

describe('S2-02 — python_deps.contract & requirements-silero parsing', () => {
  it('parses requirements-silero.txt cleanly into Core specs and Optional Accent specs with upper bounds', () => {
    const reqPath = path.resolve(process.cwd(), 'requirements-silero.txt');
    const content = fs.readFileSync(reqPath, 'utf-8');
    const parsed = parseSileroRequirements(content);

    expect(parsed.coreSpecs.some((s) => s.startsWith('torch>=') && s.includes('<2.6.0'))).toBe(true);
    expect(parsed.coreSpecs.some((s) => s.startsWith('Flask>='))).toBe(true);
    expect(parsed.coreSpecs.some((s) => s.startsWith('scipy>='))).toBe(true);
    expect(parsed.coreSpecs.some((s) => s.startsWith('ruaccent'))).toBe(false);
    expect(parsed.coreSpecs.some((s) => s.startsWith('onnxruntime'))).toBe(false);

    expect(parsed.accentSpecs.some((s) => s.startsWith('onnxruntime>=') && s.includes('<1.21.0'))).toBe(true);
    expect(parsed.accentSpecs.some((s) => s.startsWith('ruaccent>=') && s.includes('<1.6.0'))).toBe(true);
  });

  const hasPython3 = (() => {
    try {
      execSync('python3 -c "print(1)"', { stdio: 'ignore', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasPython3)('executes buildPythonProbeCommand against real python3 runtime and parses JSON snapshot', () => {
    const pyExe = execSync('which python3', { encoding: 'utf-8' }).trim();
    const cmd = buildPythonProbeCommand(pyExe);
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
    const parsed = parsePythonProbeOutput(pyExe, stdout, false);

    expect(parsed).not.toBeNull();
    expect(parsed?.pythonRuntime.major).toBe(3);
    expect(parsed?.pythonRuntime.minor).toBeTypeOf('number');
    expect(parsed?.ffmpegReady).toBe(false);
  });
});

describe('S2-02 — ensureDependenciesAsync readiness contract, two-stage pip & concurrency', () => {
  let tempRoot: string;
  let origIdleSec: string | undefined;
  let origWallSec: string | undefined;

  beforeEach(() => {
    resetDependencyInstallerForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-s202-deps-'));
    fs.writeFileSync(
      path.join(tempRoot, 'requirements-silero.txt'),
      [
        '# --- CORE ---',
        'torch>=2.0.0,<2.6.0',
        'Flask>=2.2.0,<3.2.0',
        'scipy>=1.10.0,<1.15.0',
        '# --- OPTIONAL ACCENT ---',
        'onnxruntime>=1.16.0,<1.21.0',
        'ruaccent>=1.4.0,<1.6.0'
      ].join('\n')
    );
    origIdleSec = process.env.ARC_PIP_IDLE_TIMEOUT_SEC;
    origWallSec = process.env.ARC_PIP_WALL_TIMEOUT_SEC;
    mockSpawn.mockReset();
    mockExec.mockReset();
    mockTreeKill.mockReset();
  });

  afterEach(() => {
    resetDependencyInstallerForTests();
    if (origIdleSec === undefined) delete process.env.ARC_PIP_IDLE_TIMEOUT_SEC;
    else process.env.ARC_PIP_IDLE_TIMEOUT_SEC = origIdleSec;
    if (origWallSec === undefined) delete process.env.ARC_PIP_WALL_TIMEOUT_SEC;
    else process.env.ARC_PIP_WALL_TIMEOUT_SEC = origWallSec;
    vi.useRealTimers();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('returns ERROR (pip_failed) when required core package import fails and Core pip fails', async () => {
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: ['torch', 'onnxruntime', 'ruaccent'] }));
    });

    const child: any = new EventEmitter();
    child.pid = 1001;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockSpawn.mockImplementationOnce(() => {
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('ERROR: Could not find a version that satisfies torch\n'));
        child.emit('close', 1);
      });
      return child;
    });

    const res = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(res.success).toBe(false);
    expect(res.state).toBe('ERROR');
    expect(res.coreReady).toBe(false);
    expect(res.reason).toBe('pip_failed');
    expect(res.missingCore).toContain('torch');
    expect(getLastDependencyReadiness()?.state).toBe('ERROR');
  });

  it('fails closed (import_check_failed) when pip exits 0 but required flask still fails to import', async () => {
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: ['flask'] }));
    });

    const child: any = new EventEmitter();
    child.pid = 1002;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockSpawn.mockImplementationOnce(() => {
      setImmediate(() => child.emit('close', 0));
      return child;
    });

    const res = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(res.success).toBe(false);
    expect(res.coreReady).toBe(false);
    expect(res.state).toBe('ERROR');
    expect(res.reason).toBe('import_check_failed');
    expect(res.missingCore).toEqual(['flask']);
  });

  it('returns DEGRADED with coreReady=true when optional onnxruntime/ruaccent fail install/import', async () => {
    let stage = 0;
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) {
        callback(null, 'ffmpeg 6.1');
        return;
      }
      stage++;
      if (stage === 1) {
        callback(null, makeProbePayload({ missing: ['torch', 'onnxruntime', 'ruaccent'] }));
      } else {
        // Core + scipy succeeded, optional accent still missing
        callback(null, makeProbePayload({ missing: ['onnxruntime', 'ruaccent'] }));
      }
    });

    mockSpawn.mockImplementation((_exe: string, args: string[]) => {
      const child: any = new EventEmitter();
      child.pid = 2000 + mockSpawn.mock.calls.length;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const isAccentStage = args.some((a) => a.startsWith('ruaccent'));
      setImmediate(() => child.emit('close', isAccentStage ? 1 : 0));
      return child;
    });

    const res = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
    expect(res.state).toBe('DEGRADED');
    expect(res.coreReady).toBe(true);
    expect(res.dspReady).toBe(true);
    expect(res.accentReady).toBe(false);
    expect(res.missingCore).toEqual([]);
    expect(res.missingOptional).toEqual(['onnxruntime', 'ruaccent']);
    expect(res.errors.some((e) => e.includes('Accent optional install degraded'))).toBe(true);
  });

  it('skips Core pip stage on restart after partial install (only installs Accent specs)', async () => {
    let probeCalls = 0;
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else {
        probeCalls++;
        if (probeCalls === 1) {
          callback(null, makeProbePayload({ missing: ['onnxruntime', 'ruaccent'] }));
        } else {
          callback(null, makeProbePayload({ missing: [] }));
        }
      }
    });

    const child: any = new EventEmitter();
    child.pid = 1004;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockSpawn.mockImplementationOnce(() => {
      setImmediate(() => child.emit('close', 0));
      return child;
    });

    const res = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const pipArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(pipArgs.some((a) => a.startsWith('torch'))).toBe(false);
    expect(pipArgs.some((a) => a.startsWith('onnxruntime'))).toBe(true);
    expect(pipArgs.some((a) => a.startsWith('ruaccent'))).toBe(true);
    expect(res.success).toBe(true);
    expect(res.state).toBe('READY');
    expect(res.accentReady).toBe(true);
  });

  it('rejects unsupported Python runtime (3.13 / 32-bit win32) when core is missing and warns on ABI when core is present', async () => {
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ version: '3.13.1', major: 3, minor: 13, arch: 'x86', platform: 'win32', missing: ['torch'] }));
    });

    const errRes = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(errRes.success).toBe(false);
    expect(errRes.reason).toBe('python_unsupported');
    expect(errRes.pythonRuntime.supported).toBe(false);
    expect(errRes.errors.some((e) => e.includes('3.10–3.12'))).toBe(true);

    // Core pre-installed on 3.13 without pip -> DEGRADED with onnxruntime ABI warning
    resetDependencyInstallerForTests();
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ version: '3.13.1', major: 3, minor: 13, pipAvailable: false, missing: ['onnxruntime'] }));
    });
    const degRes = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(degRes.success).toBe(true);
    expect(degRes.state).toBe('DEGRADED');
    expect(degRes.errors.some((e) => e.includes('wheel/ABI'))).toBe(true);
  });

  it('reports pip_unavailable only when Core is missing, and checks FFmpeg independently from Core', async () => {
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ pipAvailable: false, missing: ['torch'] }));
    });
    const noPipCore = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(noPipCore.success).toBe(false);
    expect(noPipCore.reason).toBe('pip_unavailable');

    // No FFmpeg while Python packages are all present -> no pip spawned, coreReady=true, state=DEGRADED
    resetDependencyInstallerForTests();
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(new Error('ffmpeg not found'));
      else callback(null, makeProbePayload({ missing: [] }));
    });
    const noFfmpeg = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(noFfmpeg.success).toBe(true);
    expect(noFfmpeg.coreReady).toBe(true);
    expect(noFfmpeg.ffmpegReady).toBe(false);
    expect(noFfmpeg.dspReady).toBe(false);
    expect(noFfmpeg.accentReady).toBe(true);
    expect(noFfmpeg.state).toBe('DEGRADED');
  });

  it('shares a single-flight promise for concurrent ensureDependenciesAsync calls without spawning a second pip', async () => {
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: ['torch'] }));
    });

    const child: any = new EventEmitter();
    child.pid = 5555;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(child);

    const p1 = ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    const p2 = ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(p1).toBe(p2);

    await new Promise((r) => setTimeout(r, 15));
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: [] }));
    });
    child.emit('close', 0);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(r1.state).toBe('READY');
  });

  it('cancels active pip installation cleanly, kills child tree, clears lock, and tracks activePackage', async () => {
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: ['torch'] }));
    });

    const child: any = new EventEmitter();
    child.pid = 6666;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockSpawn.mockReturnValueOnce(child);

    const promise = ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    await new Promise((r) => setTimeout(r, 15));

    child.stdout.emit('data', Buffer.from('Collecting torch>=2.0.0\n'));
    const midState = getDependencyInstallerState();
    expect(midState.inProgress).toBe(true);
    expect(midState.phase).toBe('INSTALLING_CORE');
    expect(midState.activePackage).toBe('torch');

    expect(cancelDependencyInstall()).toBe(true);
    const res = await promise;

    expect(mockTreeKill).toHaveBeenCalledWith(6666, 'SIGKILL');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('cancelled');
    expect(res.state).toBe('ERROR');
    expect(getDependencyInstallerState().inProgress).toBe(false);

    // Retry after cancel runs from a clean unlocked state
    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: [] }));
    });
    const retryRes = await ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    expect(retryRes.success).toBe(true);
    expect(retryRes.state).toBe('READY');
  });

  it('enforces pip_wall_timeout even when output keeps streaming', async () => {
    vi.useFakeTimers();
    process.env.ARC_PIP_IDLE_TIMEOUT_SEC = '300';
    process.env.ARC_PIP_WALL_TIMEOUT_SEC = '30';

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.startsWith('ffmpeg')) callback(null, 'ffmpeg 6.1');
      else callback(null, makeProbePayload({ missing: ['torch'] }));
    });

    const child: any = new EventEmitter();
    child.pid = 7771;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockSpawn.mockReturnValueOnce(child);

    const p = ensureDependenciesAsync('python', makeFakeWin(), (rel) => path.join(tempRoot, rel));
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(10000);
      child.stdout.emit('data', Buffer.from(`Downloading chunk ${i}\n`));
    }

    const res = await p;
    expect(res.success).toBe(false);
    expect(res.reason).toBe('pip_wall_timeout');
    expect(mockTreeKill).toHaveBeenCalledWith(7771, 'SIGKILL');
  });
});
