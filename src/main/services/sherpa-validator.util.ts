import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { app } from 'electron';

export interface ModelValidationResult {
  success: boolean;
  verified: boolean;
  cancelled?: boolean;
  incompatible?: boolean;
  error?: string;
  source?: string;
}

export function computeFileChecksum(filePath: string): string {
  try {
    const stats = fs.statSync(filePath);
    const { computeFileSha256Sync } = require('./model-integrity.util') as typeof import('./model-integrity.util');
    const hash = computeFileSha256Sync(filePath, true);
    return hash ? `${stats.size}_${hash}` : '';
  } catch {
    return '';
  }
}

/**
 * Executes native OfflineRecognizer initialization in an isolated sacrificial process.
 * Any C++ exit(-1), SIGSEGV or native abort will be isolated and will not terminate Electron.
 */
export function validateSherpaModelSacrificial(
  modelPath: string,
  tokensPath: string,
  timeoutMs: number = 15000,
  signal?: AbortSignal
): Promise<ModelValidationResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      return resolve({
        success: false,
        verified: false,
        cancelled: true,
        incompatible: false,
        error: 'Validation cancelled by user'
      });
    }

    if (!fs.existsSync(modelPath) || !fs.existsSync(tokensPath)) {
      return resolve({
        success: false,
        verified: false,
        incompatible: true,
        error: 'Model or tokens file does not exist'
      });
    }

    const candidateScripts = [
      path.join(process.cwd(), 'scripts', 'validate_sherpa_model.js'),
      path.join(__dirname, '..', '..', 'scripts', 'validate_sherpa_model.js'),
      path.join(__dirname, 'scripts', 'validate_sherpa_model.js')
    ];
    try {
      if (app && typeof app.getAppPath === 'function') {
        candidateScripts.unshift(path.join(app.getAppPath(), 'scripts', 'validate_sherpa_model.js'));
      }
    } catch {}

    const scriptPath = candidateScripts.find(p => fs.existsSync(p));
    if (!scriptPath) {
      console.warn('[SherpaValidator] validate_sherpa_model.js script missing, fallback to true');
      return resolve({ success: true, verified: false });
    }

    let resolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const child = cp.fork(scriptPath, [modelPath, tokensPath], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    if (child.stdout) {
      child.stdout.on('data', (d) => { stdoutBuffer += d.toString(); });
    }
    if (child.stderr) {
      child.stderr.on('data', (d) => { stderrBuffer += d.toString(); });
    }

    const cleanupSignal = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch {}
      resolve({
        success: false,
        verified: false,
        cancelled: true,
        incompatible: false,
        error: 'Validation cancelled by user'
      });
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanupSignal();
        try { child.kill('SIGKILL'); } catch {}
        console.warn(`[SherpaValidator] Validation timed out after ${timeoutMs}ms for ${modelPath}`);
        resolve({
          success: false,
          verified: false,
          incompatible: true,
          error: `Sacrificial validation timed out (${timeoutMs}ms)`
        });
      }
    }, timeoutMs);

    child.on('exit', (code, signalCode) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanupSignal();

      if (code === 0) {
        console.log(`[SherpaValidator] Sacrificial validation SUCCESS for ${modelPath}`);
        return resolve({ success: true, verified: true });
      }

      const errMsg = stderrBuffer.trim() || stdoutBuffer.trim() || `Process exited with code ${code} (signal: ${signalCode})`;
      console.warn(`[SherpaValidator] Sacrificial validation FAILED (code ${code}): ${errMsg}`);
      return resolve({
        success: false,
        verified: false,
        incompatible: true,
        error: errMsg
      });
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanupSignal();
      console.warn(`[SherpaValidator] Sacrificial child process error: ${err.message}`);
      return resolve({
        success: false,
        verified: false,
        incompatible: true,
        error: err.message
      });
    });
  });
}
