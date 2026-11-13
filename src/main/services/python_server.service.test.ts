import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockExecFileSync = vi.hoisted(() => vi.fn());
const mockTreeKill = vi.hoisted(() => vi.fn((_pid?: any, _sig?: any, cb?: any) => cb && cb()));
const mockAppState = vi.hoisted(() => ({
  isPackaged: true,
  appPath: ''
}));

vi.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
  exec: (...args: any[]) => mockExec(...args),
  execFileSync: (...args: any[]) => mockExecFileSync(...args)
}));

vi.mock('tree-kill', () => ({
  default: (pid: number, sig?: any, cb?: any) => (cb !== undefined ? mockTreeKill(pid, sig, cb) : mockTreeKill(pid, sig))
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockAppState.isPackaged;
    },
    getAppPath: () => mockAppState.appPath,
    getPath: (name: string) => path.join(mockAppState.appPath, name)
  },
  BrowserWindow: vi.fn()
}));

import { PythonServerService } from './python_server.service';
import { ensureDependenciesAsync } from './python_deps.util';

describe('Task 2.1 — PythonServerService.start() spawn env propagation', () => {
  let tempRoot: string;
  let origResourcesPath: string | undefined;
  let origNodeEnv: string | undefined;
  let origModelEnv: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-task21-srv-'));
    origResourcesPath = (process as any).resourcesPath;
    origNodeEnv = process.env.NODE_ENV;
    origModelEnv = process.env.ARC_SILERO_MODEL_PATH;
    delete process.env.ARC_SILERO_MODEL_PATH;

    process.env.NODE_ENV = 'production';
    mockAppState.isPackaged = true;
    mockAppState.appPath = path.join(tempRoot, 'app.asar');
    (process as any).resourcesPath = tempRoot;
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);

    fs.writeFileSync(path.join(tempRoot, 'silero_server.py'), '# dummy server');

    mockSpawn.mockReset();
    mockExec.mockReset();
    mockExecFileSync.mockReset();
    mockTreeKill.mockReset();

    // Default exec: success
    mockExec.mockImplementation((_cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (callback) callback(null, 'OK', '');
    });

    const fakeSysPython = path.join(tempRoot, process.platform === 'win32' ? 'python.exe' : 'python3');
    fs.writeFileSync(fakeSysPython, '#!mock python');

    // Default execFileSync: system python candidate that exists on disk on both Windows and Linux
    mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === 'which' || cmd === 'where.exe') return fakeSysPython;
      if (args && args.includes('print(1)')) return '1\n';
      return '';
    });

    // Default spawn: child process with error emission for immediate exit
    mockSpawn.mockImplementation(() => {
      const fakeChild: any = new EventEmitter();
      fakeChild.pid = 42424;
      fakeChild.stdout = new EventEmitter();
      fakeChild.stderr = new EventEmitter();
      setImmediate(() => {
        fakeChild.emit('error', new Error('mock exit'));
      });
      return fakeChild;
    });
  });

  afterEach(() => {
    PythonServerService.stop();
    (process as any).resourcesPath = origResourcesPath;
    process.env.NODE_ENV = origNodeEnv;
    if (origModelEnv === undefined) {
      delete process.env.ARC_SILERO_MODEL_PATH;
    } else {
      process.env.ARC_SILERO_MODEL_PATH = origModelEnv;
    }
    vi.restoreAllMocks();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('passes ARC_SILERO_MODEL_PATH in spawn env when model exists in resources/models/silero-v5/v5_6_ru.pt', async () => {
    const modelFile = path.join(tempRoot, 'resources', 'models', 'silero-v5', 'v5_6_ru.pt');
    fs.mkdirSync(path.dirname(modelFile), { recursive: true });
    fs.writeFileSync(modelFile, 'dummy-weights');

    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    await PythonServerService.start(fakeWin);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [_exe, args, spawnOpts] = mockSpawn.mock.calls[0];
    expect(args).toEqual([path.join(tempRoot, 'silero_server.py')]);
    expect(spawnOpts.env).toBeDefined();
    expect(spawnOpts.env.ARC_SILERO_MODEL_PATH).toBe(modelFile);
  });

  it('omits ARC_SILERO_MODEL_PATH from spawn env and logs warning when model is not found locally', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    await PythonServerService.start(fakeWin);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [_exe, _args, spawnOpts] = mockSpawn.mock.calls[0];
    expect(spawnOpts.env).toBeDefined();
    expect(spawnOpts.env.ARC_SILERO_MODEL_PATH).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Local v5_6_ru.pt model not found via getPath')
    );
  });
});

describe('Task 2.3 — PythonServerService.resolvePythonExe()', () => {
  let tempRoot: string;
  let origPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-task23-resolve-'));
    mockAppState.isPackaged = false;
    mockAppState.appPath = tempRoot;
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    mockExecFileSync.mockReset();
    origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (origPlatform) Object.defineProperty(process, 'platform', origPlatform);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('resolves portable python-embed from resources when present', () => {
    const isWin = process.platform === 'win32';
    const embedRel = isWin ? path.join('python-embed', 'python.exe') : path.join('python-embed', 'bin', 'python3');
    const embedPath = path.join(tempRoot, 'resources', embedRel);
    fs.mkdirSync(path.dirname(embedPath), { recursive: true });
    fs.writeFileSync(embedPath, '#!mock python embed');

    (process as any).resourcesPath = tempRoot;

    const resolved = PythonServerService.resolvePythonExe();
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('python-embed');
    expect(resolved?.exe).toBe(embedPath);
  });

  it('resolves silero_env when present', () => {
    const isWin = process.platform === 'win32';
    const venvRel = isWin ? path.join('silero_env', 'Scripts', 'python.exe') : path.join('silero_env', 'bin', 'python');
    const venvPath = path.join(tempRoot, venvRel);
    fs.mkdirSync(path.dirname(venvPath), { recursive: true });
    fs.writeFileSync(venvPath, '#!mock venv python');

    const resolved = PythonServerService.resolvePythonExe();
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('silero-env');
    expect(resolved?.exe).toBe(venvPath);
  });

  it('filters out Microsoft Store WindowsApps alias on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    mockExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'where.exe') {
        return 'C:\\Users\\User\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\r\n';
      }
      return '';
    });

    const resolved = PythonServerService.resolvePythonExe();
    expect(resolved).toBeNull();
  });

  it('resolves system python when candidate outputs 1 from -c print(1)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const sysPath = path.join(tempRoot, 'RealPython', 'python.exe');
    fs.mkdirSync(path.dirname(sysPath), { recursive: true });
    fs.writeFileSync(sysPath, '#!real python');

    mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === 'where.exe') {
        return `C:\\Users\\User\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\r\n${sysPath}\r\n`;
      }
      if (args && args.includes('print(1)')) {
        return '1\n';
      }
      return '';
    });

    const resolved = PythonServerService.resolvePythonExe();
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('system');
    expect(resolved?.exe).toBe(sysPath);
  });

  it('returns null when system candidate fails -c print(1) verification', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const brokenPath = path.join(tempRoot, 'BrokenPython', 'python.exe');
    fs.mkdirSync(path.dirname(brokenPath), { recursive: true });
    fs.writeFileSync(brokenPath, '#!broken');

    mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === 'where.exe') return `${brokenPath}\r\n`;
      if (args && args.includes('print(1)')) throw new Error('Exit code 9009');
      return '';
    });

    const resolved = PythonServerService.resolvePythonExe();
    expect(resolved).toBeNull();
  });
});

describe('Task 2.3 — PythonServerService.start() graceful degradation and venv routing', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-task23-start-'));
    mockAppState.isPackaged = false;
    mockAppState.appPath = tempRoot;
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    mockSpawn.mockReset();
    mockExec.mockReset();
    mockExecFileSync.mockReset();
    mockTreeKill.mockReset();

    fs.writeFileSync(path.join(tempRoot, 'silero_server.py'), '# dummy');
  });

  afterEach(() => {
    PythonServerService.stop();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('degrades gracefully without spawning when Python is not found', async () => {
    vi.spyOn(PythonServerService, 'resolvePythonExe').mockReturnValue(null);

    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    await PythonServerService.start(fakeWin);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(fakeWin.webContents.send).toHaveBeenCalledWith('app:loading-progress', 'Голос: Python не найден');
    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      'ui:show-toast',
      expect.objectContaining({ type: 'warning', title: 'TTS: Silero недоступен' })
    );
  });

  it('does NOT create venv when resolved kind is silero-env', async () => {
    const isWin = process.platform === 'win32';
    const venvRel = isWin ? path.join('silero_env', 'Scripts', 'python.exe') : path.join('silero_env', 'bin', 'python');
    const venvExe = path.join(tempRoot, venvRel);
    fs.mkdirSync(path.dirname(venvExe), { recursive: true });
    fs.writeFileSync(venvExe, '#!dummy');

    vi.spyOn(PythonServerService, 'resolvePythonExe').mockReturnValue({
      exe: venvExe,
      kind: 'silero-env'
    });

    mockExec.mockImplementation((_cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (callback) callback(null, 'OK', '');
    });

    mockSpawn.mockImplementation(() => {
      const fakeChild: any = new EventEmitter();
      fakeChild.pid = 999;
      fakeChild.stdout = new EventEmitter();
      fakeChild.stderr = new EventEmitter();
      setImmediate(() => fakeChild.emit('error', new Error('mock exit')));
      return fakeChild;
    });

    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    await PythonServerService.start(fakeWin);

    // Verify runCmdAsync was not called with "-m venv"
    const calls = mockExec.mock.calls.map(c => c[0]);
    const venvCall = calls.find(c => typeof c === 'string' && c.includes('-m venv'));
    expect(venvCall).toBeUndefined();
    expect(mockSpawn).toHaveBeenCalled();
  });
});

describe('Task 2.3 — ensureDependenciesAsync idle monitoring', () => {
  let tempRoot: string;
  let origIdleSec: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-task23-deps-'));
    origIdleSec = process.env.ARC_PIP_IDLE_TIMEOUT_SEC;
    mockSpawn.mockReset();
    mockExec.mockReset();
    mockTreeKill.mockReset();
  });

  afterEach(() => {
    if (origIdleSec === undefined) delete process.env.ARC_PIP_IDLE_TIMEOUT_SEC;
    else process.env.ARC_PIP_IDLE_TIMEOUT_SEC = origIdleSec;
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('resets idle timer on \\r progress without \\n: 250s of \\r chunks succeeds on default 300s timeout, but fails on 60s timeout', async () => {
    vi.useFakeTimers();

    const reqPath = path.join(tempRoot, 'requirements-silero.txt');
    fs.writeFileSync(reqPath, 'torch');

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.includes('import torch')) {
        if (callback) callback(new Error('no torch'));
      } else {
        if (callback) callback(null, 'OK');
      }
    });

    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    // Scenario 1: Default 300s idle timeout with 250s of \r chunks (chunks sent every 50s)
    delete process.env.ARC_PIP_IDLE_TIMEOUT_SEC;

    const child1: any = new EventEmitter();
    child1.pid = 8881;
    child1.stdout = new EventEmitter();
    child1.stderr = new EventEmitter();
    mockSpawn.mockReturnValueOnce(child1);

    const promise1 = ensureDependenciesAsync('python', fakeWin, (rel) => path.join(tempRoot, rel));

    // Send \r chunks without \n every 50s across 250s
    for (let i = 1; i <= 5; i++) {
      await vi.advanceTimersByTimeAsync(50000);
      child1.stdout.emit('data', Buffer.from(`\rDownloading torch ${i * 20}%`));
    }
    expect(mockTreeKill).not.toHaveBeenCalled();

    // Finish process after 250s
    mockExec.mockImplementation((_cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (callback) callback(null, 'OK');
    });
    child1.emit('close', 0);
    const result1 = await promise1;
    expect(result1.success).toBe(true);

    // Scenario 2: With ARC_PIP_IDLE_TIMEOUT_SEC = 60, 70s of silence triggers pip_idle_timeout
    process.env.ARC_PIP_IDLE_TIMEOUT_SEC = '60';

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.includes('import torch')) {
        if (callback) callback(new Error('no torch'));
      } else {
        if (callback) callback(null, 'OK');
      }
    });

    const child2: any = new EventEmitter();
    child2.pid = 8882;
    child2.stdout = new EventEmitter();
    child2.stderr = new EventEmitter();
    mockSpawn.mockReturnValueOnce(child2);

    const promise2 = ensureDependenciesAsync('python', fakeWin, (rel) => path.join(tempRoot, rel));

    // Initial \r activity at start
    child2.stdout.emit('data', Buffer.from('\rDownloading torch 5%'));

    // Advance 70s (exceeding 60s idle threshold)
    await vi.advanceTimersByTimeAsync(70000);

    const result2 = await promise2;
    expect(result2.success).toBe(false);
    expect(result2.reason).toBe('pip_idle_timeout');
    expect(mockTreeKill).toHaveBeenCalledWith(8882, 'SIGKILL');

    vi.useRealTimers();
  });

  it('triggers pip_idle_timeout after 400s of complete silence following initial \\n line', async () => {
    vi.useFakeTimers();
    delete process.env.ARC_PIP_IDLE_TIMEOUT_SEC; // default 300s timeout

    const reqPath = path.join(tempRoot, 'requirements-silero.txt');
    fs.writeFileSync(reqPath, 'torch');

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.includes('import torch')) {
        if (callback) callback(new Error('no torch'));
      } else {
        if (callback) callback(null, 'OK');
      }
    });

    const fakePipChild: any = new EventEmitter();
    fakePipChild.pid = 7777;
    fakePipChild.stdout = new EventEmitter();
    fakePipChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(fakePipChild);

    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    const promise = ensureDependenciesAsync('python', fakeWin, (rel) => path.join(tempRoot, rel));

    // Initial line with \n
    fakePipChild.stdout.emit('data', Buffer.from('Collecting torch\n'));

    // 400s of complete silence (exceeds default 300s idle timeout)
    await vi.advanceTimersByTimeAsync(400000);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.reason).toBe('pip_idle_timeout');
    expect(mockTreeKill).toHaveBeenCalledWith(7777, 'SIGKILL');

    vi.useRealTimers();
  });

  it('ensures checkTimer is cleared after process close and error to prevent timer leaks', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const reqPath = path.join(tempRoot, 'requirements-silero.txt');
    fs.writeFileSync(reqPath, 'torch');

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.includes('import torch')) {
        if (callback) callback(new Error('no torch'));
      } else {
        if (callback) callback(null, 'OK');
      }
    });

    const fakeWin: any = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    // Subtest A: cleared on close
    const childClose: any = new EventEmitter();
    childClose.pid = 9101;
    childClose.stdout = new EventEmitter();
    childClose.stderr = new EventEmitter();
    mockSpawn.mockReturnValueOnce(childClose);

    const closePromise = ensureDependenciesAsync('python', fakeWin, (rel) => path.join(tempRoot, rel));
    await vi.advanceTimersByTimeAsync(10);
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    mockExec.mockImplementation((_cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (callback) callback(null, 'OK');
    });
    childClose.emit('close', 0);
    await closePromise;
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Subtest B: cleared on error
    clearIntervalSpy.mockClear();

    mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.includes('import torch')) {
        if (callback) callback(new Error('no torch'));
      } else {
        if (callback) callback(null, 'OK');
      }
    });

    const childError: any = new EventEmitter();
    childError.pid = 9102;
    childError.stdout = new EventEmitter();
    childError.stderr = new EventEmitter();
    mockSpawn.mockReturnValueOnce(childError);

    const errorPromise = ensureDependenciesAsync('python', fakeWin, (rel) => path.join(tempRoot, rel));
    await vi.advanceTimersByTimeAsync(10);
    childError.emit('error', new Error('spawn failure'));
    await errorPromise;
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });
});
