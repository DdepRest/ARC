import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { app } from 'electron';

export interface ModelValidationResult {
  success: boolean;
  verified: boolean;
  incompatible?: boolean;
  error?: string;
  source?: string;
}

export function computeFileChecksum(filePath: string): string {
  try {
    const stats = fs.statSync(filePath);
    // Use size + mtime as fast signature; for smaller files sha256
    const headerBuffer = Buffer.alloc(Math.min(stats.size, 65536));
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
    fs.closeSync(fd);
    const hash = crypto.createHash('sha256').update(headerBuffer).digest('hex');
    return `${stats.size}_${hash}`;
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
  timeoutMs: number = 15000
): Promise<ModelValidationResult> {
  return new Promise((resolve) => {
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

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
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

    child.on('exit', (code, signal) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);

      if (code === 0) {
        console.log(`[SherpaValidator] Sacrificial validation SUCCESS for ${modelPath}`);
        return resolve({ success: true, verified: true });
      }

      const errMsg = stderrBuffer.trim() || stdoutBuffer.trim() || `Process exited with code ${code} (signal: ${signal})`;
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
