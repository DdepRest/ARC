import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { spawnSync as realSpawnSync } from 'child_process';
import BetterSqlite3 from 'better-sqlite3';

const REPO_ROOT = process.cwd();
const PYTHON_BUNDLE_FILES = [
  'silero_server.py', 'silero_number_converter.py', 'silero_text_prep.py',
  'requirements-silero.txt', 'tts_dict_loader.py'
];

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockExecFileSync = vi.hoisted(() => vi.fn());
const mockTreeKill = vi.hoisted(() => vi.fn((_pid?: any, _sig?: any, cb?: any) => cb && cb()));
const mockAppState = vi.hoisted(() => ({ isPackaged: false, appPath: '', userData: '' }));

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawn(...args),
    exec: (...args: any[]) => mockExec(...args),
    execFileSync: (...args: any[]) => mockExecFileSync(...args)
  };
});

vi.mock('tree-kill', () => ({
  default: (pid: number, sig?: any, cb?: any) =>
    cb !== undefined ? mockTreeKill(pid, sig, cb) : mockTreeKill(pid, sig)
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() { return mockAppState.isPackaged; },
    getAppPath: () => mockAppState.appPath,
    getPath: (name: string) =>
      name === 'userData' && mockAppState.userData
        ? mockAppState.userData
        : path.join(mockAppState.appPath, name)
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) }
}));

import { PythonServerService } from './python_server.service';
import { ensureDependenciesAsync, resetDependencyInstallerForTests } from './python_deps.util';
import { voiceSetupService } from './voice-setup.service';
import { runDatabaseMigrations } from './database-migrations.runner';
import { LATEST_SCHEMA_VERSION } from './database-migrations.registry';
import { isPathAllowedInRootsSync } from './sandbox/path-guard';
import { runSystemTtsProcess, SYSTEM_TTS_TEXT_FILE_ENV } from './system-tts.util';

const makeFakeWindow = () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }) as any;

describe('§12.2 Release Scenarios — No Python, No FFmpeg, and Cyrillic/Spaces Paths', () => {
  let tempRoot: string;
  let cyrillicBaseDir: string;
  let origFfmpegEnv: string | undefined;

  beforeEach(() => {
    resetDependencyInstallerForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-s122-'));
    cyrillicBaseDir = path.join(tempRoot, 'Тестовый Пользователь', 'Данные A.R.C. (тест)');
    fs.mkdirSync(cyrillicBaseDir, { recursive: true });

    origFfmpegEnv = process.env.ARC_FFMPEG_PATH;
    delete process.env.ARC_FFMPEG_PATH;

    mockAppState.isPackaged = false;
    mockAppState.appPath = cyrillicBaseDir;
    mockAppState.userData = path.join(cyrillicBaseDir, 'Профиль Данных');
    fs.mkdirSync(mockAppState.userData, { recursive: true });

    vi.spyOn(process, 'cwd').mockReturnValue(cyrillicBaseDir);
    for (const file of PYTHON_BUNDLE_FILES) {
      fs.copyFileSync(path.join(REPO_ROOT, file), path.join(cyrillicBaseDir, file));
    }

    mockSpawn.mockReset();
    mockExec.mockReset();
    mockExecFileSync.mockReset();
    mockTreeKill.mockReset();
  });

  afterEach(() => {
    PythonServerService.stop();
    resetDependencyInstallerForTests();
    if (origFfmpegEnv === undefined) delete process.env.ARC_FFMPEG_PATH;
    else process.env.ARC_FFMPEG_PATH = origFfmpegEnv;
    vi.restoreAllMocks();
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
  });

  describe('No Python installed: clear supported behavior', () => {
    it('records structured python_not_found readiness without spawning on both startup and provisioning', async () => {
      vi.spyOn(PythonServerService, 'resolvePythonExe').mockReturnValue(null);
      const fakeWin = makeFakeWindow();

      await PythonServerService.start(fakeWin, { allowProvisioning: false });
      const silentState = PythonServerService.getLastDependencyReadiness();
      expect(silentState?.state).toBe('ERROR');
      expect(silentState?.reason).toBe('python_not_found');
      expect(silentState?.coreReady).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(fakeWin.webContents.send).not.toHaveBeenCalledWith('ui:show-toast', expect.anything());

      await PythonServerService.start(fakeWin, { allowProvisioning: true });
      const interactiveState = PythonServerService.getLastDependencyReadiness();
      expect(interactiveState?.state).toBe('ERROR');
      expect(interactiveState?.reason).toBe('python_not_found');
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(fakeWin.webContents.send).toHaveBeenCalledWith(
        'ui:show-toast',
        expect.objectContaining({ type: 'warning', title: 'TTS: Silero недоступен' })
      );
    });

    it('reports runtime_missing in VoiceSetupService status when Python runtime is absent', () => {
      vi.spyOn(PythonServerService, 'resolvePythonExe').mockReturnValue(null);
      vi.spyOn(PythonServerService, 'resolveSileroModelPath').mockReturnValue(null);

      voiceSetupService.setMode('setup_now');
      const status = voiceSetupService.getStatus();
      const pyComp = status.components.find((c) => c.id === 'python-env');
      expect(pyComp?.state).toBe('runtime_missing');
      expect(pyComp?.installed).toBe(false);
      expect(['runtime_missing', 'degraded']).toContain(status.overallState);
    });
  });

  describe('No FFmpeg: clear degraded behavior, no broken startup', () => {
    it('returns DEGRADED with coreReady=true and rejects directory ARC_FFMPEG_PATH without blocking startup', async () => {
      process.env.ARC_FFMPEG_PATH = cyrillicBaseDir;

      mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
        const callback = typeof _opts === 'function' ? _opts : cb;
        if (cmd.startsWith('ffmpeg')) return callback(new Error('ffmpeg not found'));
        callback(
          null,
          'ARC_DEP_PROBE:' + JSON.stringify({
            version: '3.11.5', major: 3, minor: 11, arch: 'AMD64', platform: 'win32', pipAvailable: true,
            modules: {
              torch: { ok: true }, torchaudio: { ok: true }, soundfile: { ok: true },
              flask: { ok: true }, flask_cors: { ok: true }, omegaconf: { ok: true },
              yaml: { ok: true }, numpy: { ok: true }, scipy: { ok: true },
              onnxruntime: { ok: true }, ruaccent: { ok: true }
            }
          })
        );
      });

      const res = await ensureDependenciesAsync(
        'python',
        makeFakeWindow(),
        (rel) => path.join(cyrillicBaseDir, rel),
        { allowInstall: false }
      );

      expect(res.success).toBe(true);
      expect(res.coreReady).toBe(true);
      expect(res.accentReady).toBe(true);
      expect(res.ffmpegReady).toBe(false);
      expect(res.dspReady).toBe(false);
      expect(res.state).toBe('DEGRADED');
    });

    it('compiles silero_server.py and verifies real get_ffmpeg_bin() & self_test_dsp() in Python 3', () => {
      const pyCompile = realSpawnSync(
        'python3',
        ['-m', 'py_compile', path.join(REPO_ROOT, 'silero_server.py'), path.join(REPO_ROOT, 'tts_dict_loader.py')],
        { encoding: 'utf8' }
      );
      expect(pyCompile.status).toBe(0);

      const customFfmpegFile = path.join(cyrillicBaseDir, 'инструменты', 'ffmpeg');
      fs.mkdirSync(path.dirname(customFfmpegFile), { recursive: true });
      fs.writeFileSync(customFfmpegFile, '#!/bin/sh\nexit 0\n');

      const pyProbeScript = [
        'import ast, io, json, os, shutil, contextlib',
        'src = open(os.environ["ARC_SILERO_SRC"], "r", encoding="utf-8").read()',
        'tree = ast.parse(src)',
        'defs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name in ("get_ffmpeg_bin", "self_test_dsp")]',
        'ns = {"os": os, "shutil": shutil}',
        'for fn in defs:',
        '    exec(compile(ast.Module(body=[fn], type_ignores=[]), "silero_server.py", "exec"), ns)',
        'os.environ["PATH"] = ""',
        'os.environ.pop("ARC_FFMPEG_PATH", None)',
        'r_none = ns["get_ffmpeg_bin"]()',
        'buf = io.StringIO()',
        'with contextlib.redirect_stdout(buf): ns["self_test_dsp"]()',
        'os.environ["ARC_FFMPEG_PATH"] = os.environ["ARC_TEST_DIR"]',
        'r_dir = ns["get_ffmpeg_bin"]()',
        'os.environ["ARC_FFMPEG_PATH"] = os.environ["ARC_TEST_FILE"]',
        'r_file = ns["get_ffmpeg_bin"]()',
        'print(json.dumps({"none": r_none, "dir": r_dir, "file": r_file, "dspLog": buf.getvalue().strip()}, ensure_ascii=False))'
      ].join('\n');

      const run = realSpawnSync('python3', ['-c', pyProbeScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ARC_SILERO_SRC: path.join(REPO_ROOT, 'silero_server.py'),
          ARC_TEST_DIR: cyrillicBaseDir,
          ARC_TEST_FILE: customFfmpegFile
        }
      });

      expect(run.status).toBe(0);
      const parsed = JSON.parse(run.stdout.trim());
      expect(parsed.none).toBeNull();
      expect(parsed.dir).toBeNull();
      expect(parsed.file).toBe(customFfmpegFile);
      expect(parsed.dspLog).toBe('[DSP v2] ffmpeg not found; DSP disabled (raw WAV mode)');
    });
  });

  describe('Paths with spaces & Cyrillic across Python, SQLite, Sandbox, and TTS', () => {
    it('spawns venv creation shell-free (shell: false) when Python and venv paths contain spaces & Cyrillic', async () => {
      const pyExe = path.join(cyrillicBaseDir, 'Питон 3.11', 'python.exe');
      fs.mkdirSync(path.dirname(pyExe), { recursive: true });
      fs.writeFileSync(pyExe, '#!mock');

      vi.spyOn(PythonServerService, 'resolvePythonExe').mockReturnValue({ exe: pyExe, kind: 'system' });
      mockExec.mockImplementation((cmd: string, _opts: any, cb?: any) => {
        const callback = typeof _opts === 'function' ? _opts : cb;
        callback(null, cmd.startsWith('ffmpeg') ? 'ffmpeg 6.1' : 'OK');
      });

      mockSpawn.mockImplementation((_exe: string, args?: string[]) => {
        const child: any = new EventEmitter();
        child.pid = 5151;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setImmediate(() => {
          if (Array.isArray(args) && args[0] === '-m' && args[1] === 'venv') child.emit('close', 0);
          else child.emit('error', new Error('mock server exit'));
        });
        return child;
      });

      await PythonServerService.start(makeFakeWindow(), { allowProvisioning: true });

      const venvCall = mockSpawn.mock.calls.find(
        (c) => Array.isArray(c[1]) && c[1][0] === '-m' && c[1][1] === 'venv'
      );
      expect(venvCall).toBeDefined();
      expect(venvCall![0]).toBe(pyExe);
      expect(venvCall![1][2]).toBe(path.join(cyrillicBaseDir, 'silero_env'));
      expect(venvCall![2]).toMatchObject({ shell: false, windowsHide: true });
    });

    it('loads bundled read-only CMU SQLite DB and user dicts/logs in real Python 3 under Cyrillic + spaces paths', () => {
      const bundledDicts = path.join(cyrillicBaseDir, 'Ресурсы Приложения', 'Voice', 'dicts');
      const userDicts = path.join(cyrillicBaseDir, 'Пользовательские словари');
      const logsDir = path.join(cyrillicBaseDir, 'Журналы Голоса');
      fs.mkdirSync(bundledDicts, { recursive: true });
      fs.mkdirSync(userDicts, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });

      for (const fname of fs.readdirSync(path.join(REPO_ROOT, 'Voice', 'dicts'))) {
        fs.copyFileSync(path.join(REPO_ROOT, 'Voice', 'dicts', fname), path.join(bundledDicts, fname));
      }
      fs.writeFileSync(path.join(userDicts, 'tts_dict_it.json'), JSON.stringify({ arc: 'арк' }), 'utf8');

      const pyScript = [
        'import json, sys',
        'sys.path.insert(0, sys.argv[1])',
        'import tts_dict_loader as dl',
        'diag = dl.get_diagnostics()',
        'cmu_hit = dl.lookup_cmu("hello")',
        'it_dict = dl.get_it_dict_raw()',
        'dl.log_unknown_word("тестСлово")',
        'print(json.dumps({"diag": diag, "cmuHit": cmu_hit, "arcWord": it_dict.get("arc")}, ensure_ascii=False))'
      ].join('\n');

      const run = realSpawnSync('python3', ['-c', pyScript, REPO_ROOT], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ARC_TTS_DICTS_DIR: bundledDicts,
          ARC_TTS_USER_DICTS_DIR: userDicts,
          ARC_TTS_LOGS_DIR: logsDir
        }
      });

      expect(run.status).toBe(0);
      const data = JSON.parse(run.stdout.trim().split('\n').pop()!);
      expect(data.diag.state).toBe('READY');
      expect(data.diag.cmuDbReady).toBe(true);
      expect(data.diag.cmuDbMode).toBe('read_only_bundled');
      expect(data.diag.errors).toEqual([]);
      expect(data.cmuHit).toBeTruthy();
      expect(data.arcWord).toBe('арк');
      expect(fs.readFileSync(path.join(logsDir, 'tts_unknown_words.log'), 'utf8')).toContain('тестслово');
      expect(fs.existsSync(path.join(bundledDicts, 'tts_pronunciation.db-wal'))).toBe(false);
      expect(fs.existsSync(path.join(bundledDicts, 'tts_pronunciation.db-shm'))).toBe(false);
    });

    it('runs real SQLite migrations and VACUUM INTO pre-migration backup inside Cyrillic + spaces paths', () => {
      const dbPath = path.join(cyrillicBaseDir, 'База Данных', 'арк база.db');
      const backupRoot = path.join(cyrillicBaseDir, 'Резервные Копии');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      const db = new BetterSqlite3(dbPath);
      try {
        db.exec('CREATE TABLE legacy_notes (id INTEGER PRIMARY KEY, body TEXT)');
        db.prepare('INSERT INTO legacy_notes (body) VALUES (?)').run('Привет из кириллического пути');

        const result = runDatabaseMigrations(db, {
          dbPath,
          backupRootDir: backupRoot,
          DatabaseClass: BetterSqlite3
        });

        expect(result.ok).toBe(true);
        expect(result.status.currentVersion).toBe(LATEST_SCHEMA_VERSION);
        expect(result.status.backupFile).toBeTruthy();
        expect(result.status.backupSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(fs.existsSync(result.status.backupFile!)).toBe(true);
      } finally {
        db.close();
      }
    });

    it('enforces sandbox path-guard and passes Cyrillic + spaces tempDir safely to System TTS', async () => {
      const workspace = path.join(cyrillicBaseDir, 'Рабочая Папка');
      const okFile = path.join(workspace, 'отчёт 2026.txt');
      const outsideFile = path.join(cyrillicBaseDir, 'секрет.txt');
      fs.mkdirSync(workspace, { recursive: true });
      fs.writeFileSync(okFile, 'данные', 'utf8');
      fs.writeFileSync(outsideFile, 'чужие данные', 'utf8');

      expect(isPathAllowedInRootsSync([workspace], okFile, { mode: 'read' })).toBe(true);
      expect(isPathAllowedInRootsSync([workspace], path.join(workspace, '..', 'секрет.txt'), { mode: 'read' })).toBe(false);

      let observedTextFile = '';
      let observedContent = '';
      const fakeSpawn = vi.fn((_cmd: string, _args: string[], opts: any) => {
        observedTextFile = String(opts?.env?.[SYSTEM_TTS_TEXT_FILE_ENV] || '');
        if (observedTextFile && fs.existsSync(observedTextFile)) {
          observedContent = fs.readFileSync(observedTextFile, 'utf8');
        }
        const child: any = new EventEmitter();
        child.pid = 9001;
        child.stderr = new EventEmitter();
        setImmediate(() => child.emit('close', 0, null));
        return child;
      });

      await runSystemTtsProcess({
        text: 'Реактор готов к работе',
        tempDir: workspace,
        platform: 'win32',
        spawnFn: fakeSpawn as any
      });

      expect(fakeSpawn).toHaveBeenCalledTimes(1);
      expect(observedTextFile.startsWith(workspace)).toBe(true);
      expect(observedContent).toBe('Реактор готов к работе');
      expect(fs.existsSync(observedTextFile)).toBe(false);
    });
  });
});
