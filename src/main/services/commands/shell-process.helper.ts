import { ChildProcess, spawn } from 'child_process';
import { maskSecrets } from '../../../shared/utils/log-sanitizer';

const LOG_SNIPPET_MAX_CHARS = 256;

export function toSafeSnippet(text: string): string {
  if (!text) return '';
  const masked = maskSecrets(text);
  if (masked.length <= LOG_SNIPPET_MAX_CHARS) return masked;
  return `${masked.slice(0, LOG_SNIPPET_MAX_CHARS)}... [truncated]`;
}

export function collectBoundedChunk(
  chunk: Buffer | string,
  chunks: Buffer[],
  currentBytes: number,
  maxOutputBytes: number
): { nextBytes: number; truncated: boolean } {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  if (currentBytes >= maxOutputBytes) {
    return { nextBytes: currentBytes, truncated: true };
  }
  const remaining = maxOutputBytes - currentBytes;
  if (buf.length <= remaining) {
    chunks.push(buf);
    return { nextBytes: currentBytes + buf.length, truncated: false };
  }
  chunks.push(buf.subarray(0, remaining));
  return { nextBytes: maxOutputBytes, truncated: true };
}

export function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  try {
    if (process.platform === 'win32') {
      if (typeof pid === 'number' && pid > 0) {
        try {
          const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
            shell: false,
            windowsHide: true,
            stdio: 'ignore'
          });
          killer?.unref?.();
        } catch {
          // Ignore taskkill errors if process already exited or spawn is mocked
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore if already terminated
      }
      return;
    }

    if (typeof pid === 'number' && pid > 0) {
      try {
        // Negative PID kills the entire process group created via detached: true
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Fallback to direct child kill when pgid does not exist
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore if already exited
        }
      }
    } else {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore
      }
    }
  } finally {
    try {
      child.stdout?.destroy?.();
      child.stderr?.destroy?.();
      child.stdin?.destroy?.();
    } catch {
      // Ignore stream cleanup errors
    }
  }
}
