import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

const mockAppState = vi.hoisted(() => ({
  isPackaged: false,
  appPath: process.cwd()
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockAppState.isPackaged;
    },
    getAppPath: () => mockAppState.appPath,
    getPath: () => mockAppState.appPath
  },
  BrowserWindow: vi.fn()
}));

import { PythonServerService, SILERO_PACKAGED_MODEL_REL_PATH } from './python_server.service';
import { prepareTtsDictsSpawnEnv } from './python_sync.util';

describe('Task 2.1 — package.json build.extraResources, PythonServerService paths & silero_server.py model resolution', () => {
  let tempRoot: string;
  let origResourcesPath: string | undefined;
  let origNodeEnv: string | undefined;
  let origModelPathEnv: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-task21-paths-'));
    origResourcesPath = (process as any).resourcesPath;
    origNodeEnv = process.env.NODE_ENV;
    origModelPathEnv = process.env.ARC_SILERO_MODEL_PATH;
    delete process.env.ARC_SILERO_MODEL_PATH;
  });

  afterEach(() => {
    (process as any).resourcesPath = origResourcesPath;
    process.env.NODE_ENV = origNodeEnv;
    if (origModelPathEnv === undefined) {
      delete process.env.ARC_SILERO_MODEL_PATH;
    } else {
      process.env.ARC_SILERO_MODEL_PATH = origModelPathEnv;
    }
    mockAppState.isPackaged = false;
    mockAppState.appPath = process.cwd();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('verifies every build.extraResources entry in package.json exists on disk and includes all 5 Silero files (Revision 1)', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.build).toBeDefined();
    expect(Array.isArray(pkg.build.extraResources)).toBe(true);

    const extraResources: Array<{ from: string; to: string }> = pkg.build.extraResources;
    const requiredSileroFiles = [
      'silero_server.py',
      'silero_text_prep.py',
      'silero_number_converter.py',
      'tts_dict_loader.py',
      'requirements-silero.txt'
    ];

    for (const file of requiredSileroFiles) {
      const entry = extraResources.find((e) => e.from === file && e.to === file);
      expect(entry, `Missing flat extraResources mapping for ${file}`).toBeDefined();
    }

    // Revision 1: Every 'from' path in extraResources MUST exist on disk to prevent electron-builder ENOENT
    for (const entry of extraResources) {
      const fullFrom = path.resolve(process.cwd(), entry.from);
      expect(fs.existsSync(fullFrom), `extraResources.from does not exist on disk: ${entry.from}`).toBe(true);
    }

    // Confirm build.asarUnpack still contains node-llama-cpp and @node-llama-cpp globs untouched
    expect(pkg.build.asarUnpack).toContain('node_modules/node-llama-cpp/**/*');
    expect(pkg.build.asarUnpack).toContain('node_modules/@node-llama-cpp/**/*');
  });

  it('enforces invariant between extraResources destination and resolveSileroModelPath in packaged mode (Revision 2)', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const extraResources: Array<{ from: string; to: string }> = pkg.build.extraResources;

    const resourcesEntry = extraResources.find(
      (e) => e.to === 'resources' || e.to === 'resources/models/silero-v5'
    );
    expect(resourcesEntry).toBeDefined();

    const fakeResourcesDir = path.join(tempRoot, 'resources-dir');
    const fakeAsarDir = path.join(tempRoot, 'resources-dir', 'app.asar');
    fs.mkdirSync(fakeAsarDir, { recursive: true });

    const expectedModelInPackaged =
      resourcesEntry!.to === 'resources'
        ? path.join(fakeResourcesDir, 'resources', 'models', 'silero-v5', 'v5_6_ru.pt')
        : path.join(fakeResourcesDir, resourcesEntry!.to, 'v5_6_ru.pt');

    fs.mkdirSync(path.dirname(expectedModelInPackaged), { recursive: true });
    fs.writeFileSync(expectedModelInPackaged, 'dummy-model-weights');

    mockAppState.isPackaged = true;
    mockAppState.appPath = fakeAsarDir;
    process.env.NODE_ENV = 'production';
    (process as any).resourcesPath = fakeResourcesDir;

    const resolved = PythonServerService.resolveSileroModelPath();
    expect(resolved).toBe(expectedModelInPackaged);
    expect(resolved).toBe(path.join(fakeResourcesDir, SILERO_PACKAGED_MODEL_REL_PATH));
  });

  it('resolves silero_server.py from process.resourcesPath before app.getAppPath() when app.isPackaged is true', () => {
    const fakeResourcesDir = path.join(tempRoot, 'packaged-resources');
    const fakeAsarDir = path.join(tempRoot, 'isolated-asar', 'app.asar');
    fs.mkdirSync(fakeResourcesDir, { recursive: true });
    fs.mkdirSync(fakeAsarDir, { recursive: true });

    const resourceScript = path.join(fakeResourcesDir, 'silero_server.py');
    const shadowAsarScript = path.join(fakeAsarDir, 'silero_server.py');
    fs.writeFileSync(resourceScript, '# resource copy');
    fs.writeFileSync(shadowAsarScript, '# shadow asar copy');

    mockAppState.isPackaged = true;
    mockAppState.appPath = fakeAsarDir;
    process.env.NODE_ENV = 'production';
    (process as any).resourcesPath = fakeResourcesDir;

    const resolved = PythonServerService.getPath('silero_server.py');
    expect(resolved).toBe(resourceScript);
    expect(resolved).not.toContain('app.asar');
  });

  it('preserves cwd priority over resourcesPath when app.isPackaged is false (dev mode)', () => {
    const fakeResourcesDir = path.join(tempRoot, 'dev-resources');
    fs.mkdirSync(fakeResourcesDir, { recursive: true });
    fs.writeFileSync(path.join(fakeResourcesDir, 'silero_server.py'), '# resource copy');

    mockAppState.isPackaged = false;
    mockAppState.appPath = process.cwd();
    process.env.NODE_ENV = 'development';
    (process as any).resourcesPath = fakeResourcesDir;

    const resolved = PythonServerService.getPath('silero_server.py');
    expect(resolved).toBe(path.join(process.cwd(), 'silero_server.py'));
  });

  it('syncPythonFiles reads source from process.resourcesPath without touching app.asar and skips self-copy when targetDir equals sourceDir (Revision 3)', () => {
    const fakeResourcesDir = path.join(tempRoot, 'sync-resources');
    const fakeAsarDir = path.join(tempRoot, 'sync-asar', 'app.asar');
    const fakeTargetDir = path.join(tempRoot, 'sync-target');
    fs.mkdirSync(fakeResourcesDir, { recursive: true });
    fs.mkdirSync(fakeAsarDir, { recursive: true });
    fs.mkdirSync(fakeTargetDir, { recursive: true });

    const filesToSync = [
      'silero_server.py',
      'silero_number_converter.py',
      'silero_text_prep.py',
      'requirements-silero.txt',
      'tts_dict_loader.py'
    ];

    for (const f of filesToSync) {
      fs.copyFileSync(path.join(process.cwd(), f), path.join(fakeResourcesDir, f));
    }

    mockAppState.isPackaged = true;
    mockAppState.appPath = fakeAsarDir; // Note: fakeAsarDir has NO files inside!
    process.env.NODE_ENV = 'production';
    (process as any).resourcesPath = fakeResourcesDir;

    const sendMock = vi.fn();

    // Case A: targetDir === process.resourcesPath (default getPath('.') in packaged mode) -> skips self-copy (no sync log sent)
    (PythonServerService as any).syncPythonFiles({ isDestroyed: () => false, webContents: { send: sendMock } });
    expect(sendMock).not.toHaveBeenCalled();

    // Case B: targetDir differs from process.resourcesPath -> copies all 5 files from process.resourcesPath without touching app.asar
    const getPathSpy = vi.spyOn(PythonServerService, 'getPath').mockImplementation((rel: string) => {
      if (rel === '.') return fakeTargetDir;
      return path.join(fakeResourcesDir, rel);
    });

    (PythonServerService as any).syncPythonFiles({ isDestroyed: () => false, webContents: { send: sendMock } });
    expect(sendMock).toHaveBeenCalledWith(
      'terminal:log',
      expect.objectContaining({ message: expect.stringContaining('[SILERO SERVER] Code synced, hash:') })
    );
    for (const f of filesToSync) {
      expect(fs.readFileSync(path.join(fakeTargetDir, f))).toEqual(
        fs.readFileSync(path.join(fakeResourcesDir, f))
      );
    }

    getPathSpy.mockRestore();
  });

  const PYTHON_BIN = process.env.ARC_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  let hasPython = false;
  try {
    execFileSync(PYTHON_BIN, ['--version'], { stdio: 'ignore' });
    hasPython = true;
  } catch {
    hasPython = false;
  }

  it.skipIf(!hasPython)('silero_server.py candidate_model_paths resolves ARC_SILERO_MODEL_PATH, script_dir/models/silero-v5, script_dir/../models/silero-v5, skips empty/invalid env, and exits with code 1 when ARC_SILERO_ALLOW_DOWNLOAD is false (Revision 4)', () => {
    const sileroContent = fs.readFileSync(path.resolve(process.cwd(), 'silero_server.py'), 'utf-8');
    const startIdx = sileroContent.indexOf('script_dir = os.path.dirname(os.path.abspath(__file__))');
    const endMarker = 'sys.exit(1)';
    const endIdx = sileroContent.indexOf(endMarker, startIdx) + endMarker.length;
    expect(startIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(startIdx);

    const resolutionSnippet = sileroContent.slice(startIdx, endIdx);
    const runnerDir = path.join(tempRoot, 'py-runner', 'sub');
    fs.mkdirSync(runnerDir, { recursive: true });
    const runnerScript = path.join(runnerDir, 'test_resolve.py');

    fs.writeFileSync(
      runnerScript,
      `import os, sys\n${resolutionSnippet}\nprint("RESOLVED_MODEL=" + str(model_path), flush=True)\n`
    );

    const createSparseModel = (filePath: string) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const fd = fs.openSync(filePath, 'w');
      fs.ftruncateSync(fd, 11 * 1024 * 1024); // 11 MB > 10 MB threshold
      fs.closeSync(fd);
    };

    // 1. No model anywhere and ARC_SILERO_ALLOW_DOWNLOAD not set -> exits with code 1 and clear error message
    let failedAsExpected = false;
    try {
      execFileSync(PYTHON_BIN, [runnerScript], {
        cwd: runnerDir,
        env: { ...process.env, HOME: tempRoot, ARC_SILERO_ALLOW_DOWNLOAD: 'false', ARC_SILERO_MODEL_PATH: '' },
        encoding: 'utf-8'
      });
    } catch (err: any) {
      failedAsExpected = true;
      expect(err.status).toBe(1);
      expect(String(err.stdout) + String(err.stderr)).toContain(
        "Model file 'v5_6_ru.pt' not found in candidate paths"
      );
    }
    expect(failedAsExpected).toBe(true);

    // 2. Model in script_dir/../models/silero-v5/v5_6_ru.pt with empty/invalid ARC_SILERO_MODEL_PATH (Revision 4)
    const parentModel = path.resolve(runnerDir, '..', 'models', 'silero-v5', 'v5_6_ru.pt');
    createSparseModel(parentModel);
    const outParent = execFileSync(PYTHON_BIN, [runnerScript], {
      cwd: runnerDir,
      env: { ...process.env, HOME: tempRoot, ARC_SILERO_MODEL_PATH: '/non/existent/path.pt' },
      encoding: 'utf-8'
    });
    expect(outParent).toContain(`RESOLVED_MODEL=${parentModel}`);

    // 3. Model in script_dir/models/silero-v5/v5_6_ru.pt takes priority over ../models/silero-v5
    const localSubModel = path.join(runnerDir, 'models', 'silero-v5', 'v5_6_ru.pt');
    createSparseModel(localSubModel);
    const outLocalSub = execFileSync(PYTHON_BIN, [runnerScript], {
      cwd: runnerDir,
      env: { ...process.env, HOME: tempRoot, ARC_SILERO_MODEL_PATH: '' },
      encoding: 'utf-8'
    });
    expect(outLocalSub).toContain(`RESOLVED_MODEL=${localSubModel}`);

    // 4. Valid ARC_SILERO_MODEL_PATH takes highest priority over all directory candidates
    const explicitEnvModel = path.join(tempRoot, 'custom-env-model', 'v5_6_ru.pt');
    createSparseModel(explicitEnvModel);
    const outEnv = execFileSync(PYTHON_BIN, [runnerScript], {
      cwd: runnerDir,
      env: { ...process.env, HOME: tempRoot, ARC_SILERO_MODEL_PATH: explicitEnvModel },
      encoding: 'utf-8'
    });
    expect(outEnv).toContain(`RESOLVED_MODEL=${explicitEnvModel}`);
  });
});

describe('S2-01 — TTS dictionaries packaging, Main resolution & Python loader runtime', () => {
  let tempRoot: string;
  let origResourcesPath: string | undefined;
  let origNodeEnv: string | undefined;
  let origDictsEnv: string | undefined;
  let origUserDictsEnv: string | undefined;
  let origLogsEnv: string | undefined;

  const copyDirSync = (src: string, dst: string) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDirSync(s, d);
      else fs.copyFileSync(s, d);
    }
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-s201-dicts-'));
    origResourcesPath = (process as any).resourcesPath;
    origNodeEnv = process.env.NODE_ENV;
    origDictsEnv = process.env.ARC_TTS_DICTS_DIR;
    origUserDictsEnv = process.env.ARC_TTS_USER_DICTS_DIR;
    origLogsEnv = process.env.ARC_TTS_LOGS_DIR;
    delete process.env.ARC_TTS_DICTS_DIR;
    delete process.env.ARC_TTS_USER_DICTS_DIR;
    delete process.env.ARC_TTS_LOGS_DIR;
  });

  afterEach(() => {
    (process as any).resourcesPath = origResourcesPath;
    process.env.NODE_ENV = origNodeEnv;
    const restoreEnv = (key: string, val: string | undefined) => {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    };
    restoreEnv('ARC_TTS_DICTS_DIR', origDictsEnv);
    restoreEnv('ARC_TTS_USER_DICTS_DIR', origUserDictsEnv);
    restoreEnv('ARC_TTS_LOGS_DIR', origLogsEnv);
    mockAppState.isPackaged = false;
    mockAppState.appPath = process.cwd();
    try {
      // Restore write perms if a read-only test modified them
      if (fs.existsSync(tempRoot)) {
        const walkChmod = (p: string) => {
          for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
            const full = path.join(p, entry.name);
            if (entry.isDirectory()) {
              fs.chmodSync(full, 0o755);
              walkChmod(full);
            } else {
              fs.chmodSync(full, 0o644);
            }
          }
        };
        walkChmod(tempRoot);
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('places Voice/dicts exclusively in package.json build.extraResources and avoids duplicate asar/asarUnpack copies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
    const extraResources: Array<{ from: string; to: string }> = pkg.build.extraResources;

    const dictsRes = extraResources.find((e) => e.from === 'Voice/dicts' && e.to === 'Voice/dicts');
    expect(dictsRes).toBeDefined();
    expect(fs.existsSync(path.resolve(process.cwd(), 'Voice/dicts'))).toBe(true);

    expect(pkg.build.asarUnpack).not.toContain('Voice/dicts/**/*');
    expect(pkg.build.files).toContain('!Voice/dicts/**/*');
    expect(pkg.build.files).not.toContain('Voice/dicts/**/*');

    for (const reqFile of ['tts_dict_it.json', 'tts_dict_abbreviations.json', 'tts_dict_homographs.json', 'tts_pronunciation.db']) {
      expect(fs.existsSync(path.resolve(process.cwd(), 'Voice', 'dicts', reqFile))).toBe(true);
    }
  });

  it('resolves bundled Voice/dicts in Dev, Packaged (outside app.asar), compat app.asar.unpacked, and writable userData dirs', () => {
    // Dev mode
    mockAppState.isPackaged = false;
    mockAppState.appPath = process.cwd();
    process.env.NODE_ENV = 'development';
    const devResolved = PythonServerService.resolveTtsDictsPaths();
    expect(devResolved.bundledExists).toBe(true);
    expect(devResolved.bundledDictsDir).toBe(path.join(process.cwd(), 'Voice', 'dicts'));

    // Packaged mode with resources/Voice/dicts
    const fakeRes = path.join(tempRoot, 'packaged', 'resources');
    const fakeAsar = path.join(fakeRes, 'app.asar');
    const fakeUserData = path.join(tempRoot, 'packaged', 'userData');
    const packagedDicts = path.join(fakeRes, 'Voice', 'dicts');
    fs.mkdirSync(fakeAsar, { recursive: true });
    fs.mkdirSync(packagedDicts, { recursive: true });

    mockAppState.isPackaged = true;
    mockAppState.appPath = fakeUserData;
    process.env.NODE_ENV = 'production';
    (process as any).resourcesPath = fakeRes;

    const pkgResolved = PythonServerService.resolveTtsDictsPaths();
    expect(pkgResolved.bundledExists).toBe(true);
    expect(pkgResolved.bundledDictsDir).toBe(packagedDicts);
    expect(pkgResolved.bundledDictsDir).not.toContain('app.asar');
    expect(pkgResolved.userDictsDir).toBe(path.join(fakeUserData, 'tts_dicts'));
    expect(pkgResolved.logsDir).toBe(path.join(fakeUserData, 'logs'));

    // Compat fallback: app.asar.unpacked/Voice/dicts if resources/Voice/dicts absent
    fs.rmSync(packagedDicts, { recursive: true, force: true });
    const compatDicts = path.join(fakeRes, 'app.asar.unpacked', 'Voice', 'dicts');
    fs.mkdirSync(compatDicts, { recursive: true });
    const compatResolved = PythonServerService.resolveTtsDictsPaths();
    expect(compatResolved.bundledExists).toBe(true);
    expect(compatResolved.bundledDictsDir).toBe(compatDicts);

    // Env override takes precedence
    const envDir = path.join(tempRoot, 'env-dicts');
    fs.mkdirSync(envDir, { recursive: true });
    process.env.ARC_TTS_DICTS_DIR = envDir;
    const envResolved = PythonServerService.resolveTtsDictsPaths();
    expect(envResolved.bundledDictsDir).toBe(envDir);
    expect(envResolved.bundledExists).toBe(true);
  });

  const PYTHON_BIN = process.env.ARC_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  let hasPython = false;
  try {
    execFileSync(PYTHON_BIN, ['--version'], { stdio: 'ignore' });
    hasPython = true;
  } catch {
    hasPython = false;
  }

  const runPy = (script: string, extraEnv: Record<string, string>) => {
    const out = execFileSync(PYTHON_BIN, ['-c', script], {
      cwd: os.tmpdir(), // Deliberately NOT repo root to verify zero cwd reliance
      env: {
        ...process.env,
        PYTHONPATH: process.cwd(),
        ...extraEnv
      },
      encoding: 'utf-8'
    });
    return JSON.parse(out.trim().split(/\r?\n/).pop()!);
  };

  it.skipIf(!hasPython)('Python tts_dict_loader loads bundled dicts from unrelated cwd without writing WAL/logs into read-only bundled dir and applies rules to text', () => {
    const bundledCopy = path.join(tempRoot, 'ro-resources', 'Voice', 'dicts');
    const userDir = path.join(tempRoot, 'userData', 'tts_dicts');
    const logsDir = path.join(tempRoot, 'userData', 'logs');
    copyDirSync(path.resolve(process.cwd(), 'Voice', 'dicts'), bundledCopy);

    // Make bundled directory and files strictly read-only
    for (const f of fs.readdirSync(bundledCopy)) {
      fs.chmodSync(path.join(bundledCopy, f), 0o444);
    }
    fs.chmodSync(bundledCopy, 0o555);

    const beforeFiles = fs.readdirSync(bundledCopy).sort();

    const res = runPy(
      `
import json, tts_dict_loader, silero_text_prep
diag = tts_dict_loader.reload()
tts_dict_loader.log_unknown_word('foobar_unknown_s201')
cmu = tts_dict_loader.lookup_cmu('PayPal')
prep = silero_text_prep.normalize_text('PayPal АРК здорово')
print(json.dumps({'diag': diag, 'cmu': cmu, 'prep': prep}, ensure_ascii=False))
`,
      {
        ARC_TTS_DICTS_DIR: bundledCopy,
        ARC_TTS_USER_DICTS_DIR: userDir,
        ARC_TTS_LOGS_DIR: logsDir
      }
    );

    const afterFiles = fs.readdirSync(bundledCopy).sort();
    expect(afterFiles).toEqual(beforeFiles);
    expect(afterFiles.some((f) => f.endsWith('-wal') || f.endsWith('-shm') || f.endsWith('.log'))).toBe(false);

    expect(res.diag.state).toBe('READY');
    expect(res.diag.bundledCounts.totalFilesLoaded).toBe(3);
    expect(res.diag.bundledCounts.it).toBeGreaterThan(100);
    expect(res.diag.cmuDbReady).toBe(true);
    expect(res.diag.cmuDbMode).toBe('read_only_bundled');
    expect(res.diag.errors).toEqual([]);
    expect(res.prep).toContain('пэйпэл');
    expect(res.prep).toContain('арк');
    expect(res.prep).toContain('здор+ово');
    expect(fs.existsSync(path.join(logsDir, 'tts_unknown_words.log'))).toBe(true);
  });

  it.skipIf(!hasPython)('Python tts_dict_loader overlays userData overrides on conflict, degrades safely on invalid user JSON, and enters ERROR on missing bundled dir', () => {
    const bundledCopy = path.join(tempRoot, 'dicts-overlay', 'Voice', 'dicts');
    const userDir = path.join(tempRoot, 'userData-overlay', 'tts_dicts');
    const logsDir = path.join(tempRoot, 'userData-overlay', 'logs');
    copyDirSync(path.resolve(process.cwd(), 'Voice', 'dicts'), bundledCopy);
    fs.mkdirSync(userDir, { recursive: true });

    // Case 1: Valid user override wins on conflict without losing un-overridden bundled entries
    fs.writeFileSync(
      path.join(userDir, 'tts_dict_it.json'),
      JSON.stringify({ data: { '\\bPayPal\\b': 'тестпэй', '\\bArcTest\\b': 'арктест' } }),
      'utf-8'
    );

    const overlayRes = runPy(
      `
import json, tts_dict_loader, silero_text_prep
diag = tts_dict_loader.reload()
prep = silero_text_prep.normalize_text('PayPal Tesla ArcTest')
print(json.dumps({'diag': diag, 'prep': prep}, ensure_ascii=False))
`,
      {
        ARC_TTS_DICTS_DIR: bundledCopy,
        ARC_TTS_USER_DICTS_DIR: userDir,
        ARC_TTS_LOGS_DIR: logsDir
      }
    );

    expect(overlayRes.diag.state).toBe('READY');
    expect(overlayRes.diag.userOverrideCounts.it).toBe(2);
    expect(overlayRes.diag.userOverrideCounts.totalOverrides).toBe(2);
    expect(overlayRes.prep).toContain('тестпэй');
    expect(overlayRes.prep).toContain('тесла');
    expect(overlayRes.prep).toContain('арктест');

    // Case 2: Broken user override JSON -> DEGRADED while bundled dictionaries stay active
    fs.writeFileSync(path.join(userDir, 'tts_dict_it.json'), '{ invalid json !!!', 'utf-8');
    const degradedRes = runPy(
      `
import json, tts_dict_loader, silero_text_prep
diag = tts_dict_loader.reload()
prep = silero_text_prep.normalize_text('PayPal')
print(json.dumps({'diag': diag, 'prep': prep}, ensure_ascii=False))
`,
      {
        ARC_TTS_DICTS_DIR: bundledCopy,
        ARC_TTS_USER_DICTS_DIR: userDir,
        ARC_TTS_LOGS_DIR: logsDir
      }
    );
    expect(degradedRes.diag.state).toBe('DEGRADED');
    expect(degradedRes.diag.errors.some((e: string) => e.includes('user'))).toBe(true);
    expect(degradedRes.prep).toContain('пэйпэл');

    // Case 3: Missing bundled file -> DEGRADED
    fs.unlinkSync(path.join(bundledCopy, 'tts_dict_homographs.json'));
    fs.unlinkSync(path.join(userDir, 'tts_dict_it.json'));
    const missingOneRes = runPy(
      `
import json, tts_dict_loader
diag = tts_dict_loader.reload()
print(json.dumps({'diag': diag}, ensure_ascii=False))
`,
      {
        ARC_TTS_DICTS_DIR: bundledCopy,
        ARC_TTS_USER_DICTS_DIR: userDir,
        ARC_TTS_LOGS_DIR: logsDir
      }
    );
    expect(missingOneRes.diag.state).toBe('DEGRADED');
    expect(missingOneRes.diag.bundledCounts.totalFilesLoaded).toBe(2);

    // Case 4: Completely missing bundled directory -> ERROR, normalize_text does not crash
    const missingDirRes = runPy(
      `
import json, tts_dict_loader, silero_text_prep
diag = tts_dict_loader.reload()
prep = silero_text_prep.normalize_text('Проверка текст')
print(json.dumps({'diag': diag, 'prep': prep}, ensure_ascii=False))
`,
      {
        ARC_TTS_DICTS_DIR: path.join(tempRoot, 'nonexistent-dicts-dir'),
        ARC_TTS_USER_DICTS_DIR: userDir,
        ARC_TTS_LOGS_DIR: logsDir
      }
    );
    expect(missingDirRes.diag.state).toBe('ERROR');
    expect(missingDirRes.diag.bundledCounts.totalFilesLoaded).toBe(0);
    expect(missingDirRes.prep).toContain('Проверка текст');
  });

  it('prepareTtsDictsSpawnEnv creates writable userData dirs and populates ARC_TTS_* env vars for packaged spawns', () => {
    const fakeRes = path.join(tempRoot, 'spawn-res');
    const fakeUserData = path.join(tempRoot, 'spawn-userData');
    const packagedDicts = path.join(fakeRes, 'Voice', 'dicts');
    fs.mkdirSync(packagedDicts, { recursive: true });

    mockAppState.isPackaged = true;
    mockAppState.appPath = fakeUserData;
    process.env.NODE_ENV = 'production';
    (process as any).resourcesPath = fakeRes;

    const { dictsPaths, spawnEnv } = prepareTtsDictsSpawnEnv((rel) => PythonServerService.getPath(rel), {});
    expect(dictsPaths.bundledExists).toBe(true);
    expect(dictsPaths.bundledDictsDir).toBe(packagedDicts);
    expect(fs.existsSync(dictsPaths.userDictsDir)).toBe(true);
    expect(fs.existsSync(dictsPaths.logsDir)).toBe(true);
    expect(spawnEnv.ARC_TTS_DICTS_DIR).toBe(packagedDicts);
    expect(spawnEnv.ARC_TTS_USER_DICTS_DIR).toBe(path.join(fakeUserData, 'tts_dicts'));
    expect(spawnEnv.ARC_TTS_LOGS_DIR).toBe(path.join(fakeUserData, 'logs'));
    expect(spawnEnv.ARC_TTS_CACHE_DIR).toBe(path.join(fakeUserData, 'tts_cache'));
  });
});


