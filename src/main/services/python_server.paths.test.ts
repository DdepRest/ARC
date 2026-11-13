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
      fs.writeFileSync(path.join(fakeResourcesDir, f), `# from extraResources: ${f}`);
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
      expect(fs.readFileSync(path.join(fakeTargetDir, f), 'utf-8')).toBe(`# from extraResources: ${f}`);
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

