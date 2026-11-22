import { ChildProcess, spawn } from 'child_process';
import { maskSecrets } from '../../../shared/utils/log-sanitizer';
import { PolicyEngine } from '../sandbox/PolicyEngine';
import type { ShellExecutionMode } from '../sandbox/types';
import { shellApprovalService, ShellApprovalOptions } from '../security/shell-approval.service';
import { parseShellCommand, ShellCommandInput } from './shell-command.parser';
import { collectBoundedChunk, killProcessTree, toSafeSnippet } from './shell-process.helper';

export const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export interface ShellExecutionOptions extends Omit<ShellApprovalOptions, 'timeoutMs'> {
  timeoutMs?: number;
  approvalTimeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  cwd?: string;
  purpose?: string;
  allowUnsafeRawShell?: boolean;
}

export interface ShellExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  blocked?: boolean;
  timedOut?: boolean;
  aborted?: boolean;
  exitCode?: number | null;
  outputTruncated?: boolean;
  executable?: string;
  args?: string[];
  cwd?: string;
  shellMode?: ShellExecutionMode;
}

export async function executeShellCommand(
  input: ShellCommandInput,
  options?: ShellExecutionOptions
): Promise<ShellExecutionResult> {
  if (options?.signal?.aborted) {
    return { success: false, aborted: true, error: 'Command execution aborted before start' };
  }

  // 1. Parse and validate structured/tokenized command without invoking shell
  const parsedResult = parseShellCommand(input, {
    allowUnsafeRawShell: options?.allowUnsafeRawShell === true,
    cwd: options?.cwd
  });

  if (!parsedResult.ok || !parsedResult.value) {
    console.error(`[ShellExecutor] Command rejected (${parsedResult.reason || 'invalid_command'})`);
    return {
      success: false,
      blocked: true,
      error: parsedResult.error || 'Command validation failed'
    };
  }

  const parsed = parsedResult.value;
  const effectivePurpose =
    parsed.purpose || options?.purpose || options?.reason || 'Выполнение системной команды';
  const commandHash = shellApprovalService.getCommandHash(parsed.displayCommand);

  // 2. Policy check via PolicyEngine (exact binary matching + default-deny)
  const policyTarget =
    parsed.shellMode === 'unsafe_raw_shell' ? parsed.displayCommand : parsed.executable;
  const policy = PolicyEngine.evaluate('SHELL_RUN', policyTarget, false);

  if (!policy.allowed) {
    console.error(
      `[ShellExecutor] Blocked command hash=${commandHash} exec=${maskSecrets(parsed.executable)} reason=${policy.reason}`
    );
    return {
      success: false,
      blocked: true,
      executable: parsed.executable,
      args: parsed.args,
      cwd: parsed.cwd,
      shellMode: parsed.shellMode,
      error: `PolicyEngine blocked: ${policy.reason}`
    };
  }

  // 3. Explicit interactive approval (forced for unsafe raw shell mode)
  const requiresApproval = policy.requiresApproval || parsed.shellMode === 'unsafe_raw_shell';
  if (requiresApproval) {
    const approved = await shellApprovalService.requestShellApproval(
      {
        executable: parsed.executable,
        args: parsed.args,
        cwd: parsed.cwd,
        purpose: effectivePurpose,
        displayCommand: parsed.displayCommand,
        shellMode: parsed.shellMode
      },
      {
        macroId: options?.macroId,
        reason: options?.reason,
        purpose: effectivePurpose,
        cwd: parsed.cwd,
        timeoutMs: options?.approvalTimeoutMs
      }
    );

    if (!approved) {
      console.warn(
        `[ShellExecutor] Rejected or timed out approval hash=${commandHash} exec=${maskSecrets(parsed.executable)}`
      );
      return {
        success: false,
        executable: parsed.executable,
        args: parsed.args,
        cwd: parsed.cwd,
        shellMode: parsed.shellMode,
        error: 'User approval rejected or timed out'
      };
    }
  }

  if (options?.signal?.aborted) {
    return {
      success: false,
      aborted: true,
      executable: parsed.executable,
      args: parsed.args,
      cwd: parsed.cwd,
      shellMode: parsed.shellMode,
      error: 'Command execution aborted'
    };
  }

  // 4. Hardened execution (shell: false for structured/tokenized commands)
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_SHELL_TIMEOUT_MS;
  const maxOutputBytes =
    typeof options?.maxOutputBytes === 'number' && options.maxOutputBytes > 0
      ? options.maxOutputBytes
      : DEFAULT_MAX_OUTPUT_BYTES;

  return new Promise<ShellExecutionResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let outputTruncated = false;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    let timer: NodeJS.Timeout | undefined;
    let child: ChildProcess;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    };

    const finish = (result: ShellExecutionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const baseMeta = {
      executable: parsed.executable,
      args: parsed.args,
      cwd: parsed.cwd,
      shellMode: parsed.shellMode
    };

    const onAbort = () => {
      if (settled || aborted) return;
      aborted = true;
      killProcessTree(child);
      finish({
        ...baseMeta,
        success: false,
        aborted: true,
        stdout: maskSecrets(Buffer.concat(stdoutChunks).toString('utf8')),
        stderr: maskSecrets(Buffer.concat(stderrChunks).toString('utf8')),
        outputTruncated,
        error: 'Command execution aborted'
      });
    };

    try {
      const spawnUseShell = parsed.shellMode === 'unsafe_raw_shell';
      const spawnTarget = spawnUseShell ? parsed.rawCommand || parsed.displayCommand : parsed.executable;
      const spawnArgs = spawnUseShell ? [] : parsed.args;

      child = spawn(spawnTarget, spawnArgs, {
        cwd: parsed.cwd,
        shell: spawnUseShell,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (spawnErr: any) {
      finish({
        ...baseMeta,
        success: false,
        error: maskSecrets(spawnErr?.message || String(spawnErr))
      });
      return;
    }

    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (settled || timedOut) return;
      timedOut = true;
      killProcessTree(child);
      console.error(
        `[ShellExecutor] Timed out hash=${commandHash} exec=${maskSecrets(parsed.executable)} timeoutMs=${timeoutMs}`
      );
      finish({
        ...baseMeta,
        success: false,
        timedOut: true,
        stdout: maskSecrets(Buffer.concat(stdoutChunks).toString('utf8')),
        stderr: maskSecrets(Buffer.concat(stderrChunks).toString('utf8')),
        outputTruncated,
        error: `Command timed out after ${timeoutMs}ms`
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const collected = collectBoundedChunk(chunk, stdoutChunks, stdoutBytes, maxOutputBytes);
      stdoutBytes = collected.nextBytes;
      if (collected.truncated) outputTruncated = true;
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const collected = collectBoundedChunk(chunk, stderrChunks, stderrBytes, maxOutputBytes);
      stderrBytes = collected.nextBytes;
      if (collected.truncated) outputTruncated = true;
    });

    child.on('error', (err: Error) => {
      const safeMsg = maskSecrets(err.message);
      console.error(
        `[ShellExecutor] Spawn error hash=${commandHash} exec=${maskSecrets(parsed.executable)}: ${safeMsg}`
      );
      finish({
        ...baseMeta,
        success: false,
        stdout: maskSecrets(Buffer.concat(stdoutChunks).toString('utf8')),
        stderr: maskSecrets(Buffer.concat(stderrChunks).toString('utf8')),
        outputTruncated,
        error: safeMsg
      });
    });

    child.on('close', (exitCode: number | null) => {
      if (settled) return;
      const stdout = maskSecrets(Buffer.concat(stdoutChunks).toString('utf8'));
      const stderr = maskSecrets(Buffer.concat(stderrChunks).toString('utf8'));

      if (stderr) {
        console.warn(
          `[ShellExecutor] stderr hash=${commandHash} exec=${maskSecrets(parsed.executable)}: ${toSafeSnippet(stderr)}`
        );
      }

      if (exitCode !== 0) {
        console.error(
          `[ShellExecutor] Failed hash=${commandHash} exec=${maskSecrets(parsed.executable)} exit=${exitCode}`
        );
        finish({
          ...baseMeta,
          success: false,
          exitCode,
          stdout,
          stderr,
          outputTruncated,
          error: `Command exited with code ${exitCode ?? 'unknown'}`
        });
        return;
      }

      console.log(
        `[ShellExecutor] Completed hash=${commandHash} exec=${maskSecrets(parsed.executable)} exit=0`
      );
      finish({
        ...baseMeta,
        success: true,
        exitCode: 0,
        stdout,
        stderr,
        outputTruncated
      });
    });
  });
}
