import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { app } from 'electron';
import { SHERPA_MODELS_CONFIG } from './sherpa-downloader.service';
import { getActiveGigaamSource } from './gigaam-sources.service';
import { EXEC_TIMEOUT_MS } from '../config/timeouts';
import { inspectDirectorySupplyChain } from './model-integrity.util';
import type { ModelIntegrityRecord, ModelProvenanceRecord } from '../../shared/types/model-integrity';

export interface ModelDirResult {
  dir: string;
  isComplete: boolean;
  missingFiles: string[];
}

export interface ModelFilesVerificationResult {
  isComplete: boolean;
  missingFiles: string[];
  totalSize: number;
  integrity?: ModelIntegrityRecord;
  provenance?: ModelProvenanceRecord;
}

/**
 * Returns candidate directories where Sherpa models can be located.
 */
export function getSherpaCandidateDirs(modelSubdir: string = 'sherpa-ru'): string[] {
  const dirs: string[] = [];
  const isPackaged = Boolean(app && app.isPackaged);

  if (isPackaged && process.platform === 'win32' && process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, 'ARC_Voice', 'models', modelSubdir));
  }

  // Project workspace directory (used by start_app.bat, download_models.js)
  dirs.push(path.join(process.cwd(), 'Voice', 'models', modelSubdir));
  if (modelSubdir !== 'sherpa-ru') {
    dirs.push(path.join(process.cwd(), 'Voice', 'models', 'sherpa-ru'));
  }

  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, 'Voice', 'models', modelSubdir));
  }

  try {
    if (app && typeof app.getAppPath === 'function') {
      dirs.push(path.join(app.getAppPath(), 'Voice', 'models', modelSubdir));
      if (modelSubdir !== 'sherpa-ru') {
        dirs.push(path.join(app.getAppPath(), 'Voice', 'models', 'sherpa-ru'));
      }
    }
  } catch {}

  try {
    if (app && typeof app.getPath === 'function') {
      dirs.push(path.join(app.getPath('userData'), 'Voice', 'models', modelSubdir));
      if (modelSubdir !== 'sherpa-ru') {
        dirs.push(path.join(app.getPath('userData'), 'Voice', 'models', 'sherpa-ru'));
      }
    }
  } catch {}

  if (process.platform === 'win32' && process.env.PROGRAMDATA) {
    dirs.push(path.join(process.env.PROGRAMDATA, 'a.r.c', 'Voice', 'models', modelSubdir));
  }

  return Array.from(new Set(dirs.filter(Boolean)));
}

/**
 * Resolves model and tokens file paths for GigaAM CTC in a flexible, repository-agnostic manner.
 */
export function resolveGigaamFiles(dir: string): { modelPath: string; tokensPath: string } | null {
  if (!dir || !fs.existsSync(dir)) return null;

  const activeSource = getActiveGigaamSource();

  // 1. Check download_meta.json
  const metaPath = path.join(dir, 'download_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const isBad = meta.incompatible === true || meta.sourceId === 'istupakov-multilingual' || (meta.source && meta.source.includes('istupakov'));
      if (isBad) {
        return null;
      }
      if (meta.modelFile && meta.tokensFile) {
        const m = path.join(dir, meta.modelFile);
        const t = path.join(dir, meta.tokensFile);
        if (fs.existsSync(m) && fs.existsSync(t) && fs.statSync(m).size > 1000000) {
          return { modelPath: m, tokensPath: t };
        }
      }
    } catch {}
  }

  // 2. Candidate names matching active source or standard naming
  const modelCandidates = [activeSource.defaultModelFile, 'model.int8.onnx', 'model.onnx'];
  let foundModel: string | null = null;
  for (const name of modelCandidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && fs.statSync(p).size > 1000000) {
      foundModel = p;
      break;
    }
  }

  // 3. Candidate token names
  const tokenCandidates = [activeSource.defaultTokensFile, 'tokens.txt'];
  let foundTokens: string | null = null;
  for (const name of tokenCandidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && fs.statSync(p).size > 50) {
      foundTokens = p;
      break;
    }
  }

  if (foundModel && foundTokens) {
    return { modelPath: foundModel, tokensPath: foundTokens };
  }
  return null;
}

/**
 * Checks if a directory contains all required model files with valid size and supply-chain SHA-256 verification.
 */
export function verifyModelFiles(
  dir: string,
  modelId: string,
  opts?: { forceRehash?: boolean }
): ModelFilesVerificationResult {
  if (modelId === 'gigaam-ctc') {
    const activeSource = getActiveGigaamSource();
    const metaPath = path.join(dir, 'download_meta.json');
    let meta: any = null;
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
    }

    if (meta && (meta.incompatible === true || meta.sourceId === 'istupakov-multilingual' || (meta.source && meta.source.includes('istupakov')))) {
      return {
        isComplete: false,
        missingFiles: [`GigaAM source ${meta.sourceId || meta.source || 'unknown'} is incompatible`],
        totalSize: 0,
        integrity: { status: 'tampered', algorithm: 'sha256', reason: 'Несовместимый источник GigaAM' }
      };
    }

    const resolved = resolveGigaamFiles(dir);
    if (resolved) {
      const mName = path.basename(resolved.modelPath);
      const tName = path.basename(resolved.tokensPath);
      const res = inspectDirectorySupplyChain(
        dir,
        'gigaam-ctc',
        [
          { name: mName, minBytes: 1000000 },
          { name: tName, minBytes: 10 }
        ],
        opts
      );
      return res;
    }
    return {
      isComplete: false,
      missingFiles: [activeSource.defaultModelFile, activeSource.defaultTokensFile],
      totalSize: 0,
      integrity: { status: 'missing', algorithm: 'sha256', reason: 'Файлы GigaAM не найдены' },
      provenance: { origin: 'manual_local' }
    };
  }

  if (modelId === 'silero-vad') {
    const vadConfig = SHERPA_MODELS_CONFIG['silero-vad']?.files?.[0];
    const localVad = path.join(dir, 'silero_vad.onnx');
    if (fs.existsSync(localVad) && fs.statSync(localVad).size > 0) {
      return inspectDirectorySupplyChain(
        dir,
        'silero-vad',
        [{ name: 'silero_vad.onnx', minBytes: 1, expectedSha256: vadConfig?.sha256, expectedSize: vadConfig?.size }],
        opts
      );
    }
    const bundled = getBundledSileroVadPath();
    if (bundled) {
      return {
        isComplete: true,
        missingFiles: [],
        totalSize: fs.statSync(bundled).size,
        integrity: { status: 'verified', algorithm: 'sha256', reason: 'Встроен в ресурсы сборки' },
        provenance: { origin: 'bundled', source: 'bundled/silero_vad.onnx' }
      };
    }
    return {
      isComplete: false,
      missingFiles: ['silero_vad.onnx'],
      totalSize: 0,
      integrity: { status: 'missing', algorithm: 'sha256' },
      provenance: { origin: 'manual_local' }
    };
  }

  const config = SHERPA_MODELS_CONFIG[modelId];
  if (!config || !fs.existsSync(dir)) {
    return {
      isComplete: false,
      missingFiles: config ? config.files.map((f) => f.name) : [],
      totalSize: 0,
      integrity: { status: 'missing', algorithm: 'sha256' },
      provenance: { origin: 'manual_local' }
    };
  }

  return inspectDirectorySupplyChain(
    dir,
    modelId,
    config.files.map((f) => ({
      name: f.name,
      minBytes: 1,
      expectedSha256: f.sha256,
      expectedSize: f.size
    })),
    opts
  );
}

/**
 * On Windows, converts paths with trailing dot segments (e.g. \a.r.c.\), spaces or non-ASCII
 * to an 8.3 short path or mirrors them to a clean ASCII directory.
 */
export function makePathAsciiSafe(dirPath: string): string {
  if (process.platform !== 'win32') {
    return dirPath;
  }

  // Windows Win32 API strips trailing periods from folder segments (e.g. \a.r.c.\ -> \a.r.c\),
  // which breaks fopen / ifstream in C++ modules like sherpa-onnx.
  // Also spaces or non-ASCII characters can break native loaders.
  const hasTrailingDotSegment = /[\\/][^\\/]*\.[\\/]/.test(dirPath) || dirPath.endsWith('.');
  const hasNonAsciiOrSpaces = /[^\u0000-\u007f]|\s/.test(dirPath);

  if (!hasTrailingDotSegment && !hasNonAsciiOrSpaces) {
    return dirPath;
  }

  // 1. Try 8.3 short path via Windows cmd.exe
  try {
    const out = cp.execSync(`cmd.exe /c for %I in ("${dirPath}") do @echo %~sI`, {
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS
    }).trim();
    if (out && fs.existsSync(out) && !/[^\u0000-\u007f]/.test(out) && !/[\\/][^\\/]*\.[\\/]/.test(out) && !out.endsWith('.')) {
      return out;
    }
  } catch (e) {
    console.warn('[SherpaPaths] 8.3 short path resolution failed:', (e as any)?.message || e);
  }

  // 2. Fallback: Mirror to clean ASCII directory
  try {
    const leaf = path.basename(dirPath) || 'sherpa-ru';
    const baseClean = (app?.isPackaged && process.env.LOCALAPPDATA)
      ? path.join(process.env.LOCALAPPDATA, 'ARC_Voice')
      : process.cwd();
    const cleanDir = path.join(baseClean, 'Voice', 'models', leaf);
    if (cleanDir !== dirPath && fs.existsSync(dirPath)) {
      if (!fs.existsSync(cleanDir)) {
        fs.mkdirSync(cleanDir, { recursive: true });
      }
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const src = path.join(dirPath, file);
        const dest = path.join(cleanDir, file);
        if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
          try {
            fs.copyFileSync(src, dest);
          } catch (copyErr) {
            console.warn('[SherpaPaths] Failed copying to cleanDir fallback:', copyErr);
          }
        }
      }
      return cleanDir;
    }
  } catch (mirrorErr) {
    console.warn('[SherpaPaths] Mirror to cleanDir fallback failed:', mirrorErr);
  }

  return dirPath;
}

/**
 * Returns path to bundled silero_vad.onnx inside app distribution resources if present.
 */
export function getBundledSileroVadPath(): string | null {
  const candidateFiles: string[] = [
    path.join(process.cwd(), 'resources', 'silero_vad.onnx'),
    path.join(__dirname, '..', '..', 'resources', 'silero_vad.onnx'),
    path.join(__dirname, '..', '..', '..', 'resources', 'silero_vad.onnx'),
  ];
  try {
    if (app && typeof app.getAppPath === 'function') {
      candidateFiles.push(path.join(app.getAppPath(), 'resources', 'silero_vad.onnx'));
    }
  } catch {}
  if (process.resourcesPath) {
    candidateFiles.push(path.join(process.resourcesPath, 'silero_vad.onnx'));
    candidateFiles.push(path.join(process.resourcesPath, 'resources', 'silero_vad.onnx'));
  }
  for (const p of candidateFiles) {
    if (p && fs.existsSync(p)) {
      try {
        if (fs.statSync(p).size > 500000) return p;
      } catch {}
    }
  }
  return null;
}

/**
 * Resolves the active model directory for the given modelId.
 */
export function resolveSherpaModelDir(modelId: string = 'zipformer-ru'): ModelDirResult {
  const modelSubdir = modelId === 'silero-vad'
    ? 'silero-vad'
    : (modelId === 'gigaam-ctc' ? 'gigaam-ctc' : 'sherpa-ru');

  const candidates = getSherpaCandidateDirs(modelSubdir);

  // Silero VAD zero-network bundle priority check
  if (modelId === 'silero-vad') {
    const bundledPath = getBundledSileroVadPath();
    const defaultVadDir = candidates[0] || path.join(process.cwd(), 'Voice', 'models', 'silero-vad');
    if (bundledPath) {
      try {
        if (!fs.existsSync(defaultVadDir)) {
          fs.mkdirSync(defaultVadDir, { recursive: true });
        }
        const targetVadFile = path.join(defaultVadDir, 'silero_vad.onnx');
        if (!fs.existsSync(targetVadFile) || fs.statSync(targetVadFile).size < 500000) {
          fs.copyFileSync(bundledPath, targetVadFile);
        }
        return {
          dir: makePathAsciiSafe(defaultVadDir),
          isComplete: true,
          missingFiles: []
        };
      } catch (err) {
        console.warn('[SherpaPaths] Copying bundled VAD failed, using bundle directory directly:', err);
        return {
          dir: makePathAsciiSafe(path.dirname(bundledPath)),
          isComplete: true,
          missingFiles: []
        };
      }
    }
  }

  // Search for an existing directory containing complete files
  for (const candidate of candidates) {
    const check = verifyModelFiles(candidate, modelId);
    if (check.isComplete) {
      const safeDir = makePathAsciiSafe(candidate);
      return {
        dir: safeDir,
        isComplete: true,
        missingFiles: []
      };
    }
  }

  // Default directory to use for downloading or error reporting
  const defaultDir = candidates[0] || path.join(process.cwd(), 'Voice', 'models', modelSubdir);
  const check = verifyModelFiles(defaultDir, modelId);

  return {
    dir: defaultDir,
    isComplete: false,
    missingFiles: check.missingFiles
  };
}
