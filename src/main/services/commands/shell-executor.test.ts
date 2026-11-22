import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { executeShellCommand } from './shell-executor';
import { PolicyEngine } from '../sandbox/PolicyEngine';
import { shellApprovalService } from '../security/shell-approval.service';

describe('executeShellCommand (hardened contract)', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-shell-exec-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects empty or whitespace-only commands', async () => {
    const res = await executeShellCommand('   ');
    expect(res.success).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.error).toBe('Command is empty');
  });

  it('blocks shell metacharacters and command injection attempts before approval', async () => {
    const approvalSpy = vi.spyOn(shellApprovalService, 'requestShellApproval');

    const payloads = [
      'node -e "console.log(1)" && whoami',
      'git status; rm -rf /',
      'node app.js | cat',
      'node app.js > /tmp/out.txt',
      'node `id`',
      'node $(whoami)',
      'node -v\nwhoami'
    ];

    for (const cmd of payloads) {
      const res = await executeShellCommand(cmd);
      expect(res.success).toBe(false);
      expect(res.blocked).toBe(true);
    }

    expect(approvalSpy).not.toHaveBeenCalled();
  });

  it('blocks executable spoofing (nodeevil, mygit, npm-helper) without requesting approval', async () => {
    const approvalSpy = vi.spyOn(shellApprovalService, 'requestShellApproval');

    for (const spoof of ['nodeevil -v', 'mygit status', 'npm-helper run build', '/tmp/node -v']) {
      const res = await executeShellCommand(spoof);
      expect(res.success).toBe(false);
      expect(res.blocked).toBe(true);
      expect(res.error).toContain('binary_not_allowed');
    }

    expect(approvalSpy).not.toHaveBeenCalled();
  });

  it('blocks commands that violate PolicyEngine policies', async () => {
    vi.spyOn(PolicyEngine, 'evaluate').mockReturnValue({
      allowed: false,
      requiresApproval: false,
      reason: 'Disallowed destructive command'
    });

    const res = await executeShellCommand('format C:');
    expect(res.success).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.error).toContain('Disallowed destructive command');
  });

  it('requests structured approval and halts without spawning if user rejects', async () => {
    const approvalSpy = vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(false);

    const res = await executeShellCommand({
      executable: 'node',
      args: ['-e', 'console.log("should_not_run")'],
      cwd: tempDir,
      purpose: 'Check runtime'
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('User approval rejected or timed out');
    expect(approvalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: 'node',
        args: ['-e', 'console.log("should_not_run")'],
        cwd: await fsp.realpath(tempDir),
        purpose: 'Check runtime',
        shellMode: 'direct'
      }),
      expect.any(Object)
    );
  });

  it('executes structured node payload directly via shell:false when user approves', async () => {
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);

    const res = await executeShellCommand({
      executable: 'node',
      args: ['-e', 'process.stdout.write("structured_arc_ok")'],
      cwd: tempDir,
      purpose: 'Structured node check'
    });

    expect(res.success).toBe(true);
    expect(res.shellMode).toBe('direct');
    expect(res.executable).toBe('node');
    expect(res.stdout).toBe('structured_arc_ok');
    expect(res.exitCode).toBe(0);
  });

  it('parses legacy command string into argv and executes via shell:false', async () => {
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);

    const res = await executeShellCommand('node -e "process.stdout.write(\'test_arc_shell\')"');
    expect(res.success).toBe(true);
    expect(res.shellMode).toBe('direct');
    expect(res.executable).toBe('node');
    expect(res.args).toEqual(['-e', "process.stdout.write('test_arc_shell')"]);
    expect(res.stdout).toContain('test_arc_shell');
  });

  it('kills spawned process tree on timeout', async () => {
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);
    const pidFile = path.join(tempDir, 'child.pid');

    const res = await executeShellCommand(
      {
        executable: 'node',
        args: [
          '-e',
          `const fs = require('fs'); const { spawn } = require('child_process'); const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']); fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(() => {}, 1000);`
        ],
        cwd: tempDir
      },
      { timeoutMs: 350 }
    );

    expect(res.success).toBe(false);
    expect(res.timedOut).toBe(true);
    expect(res.error).toContain('timed out');

    const pidText = await fsp.readFile(pidFile, 'utf8').catch(() => '');
    if (pidText) {
      const childPid = Number(pidText.trim());
      await new Promise((r) => setTimeout(r, 150));
      let alive = false;
      try {
        process.kill(childPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
      if (alive) {
        try {
          process.kill(childPid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
      expect(alive).toBe(false);
    }
  });

  it('supports AbortSignal before start and during execution', async () => {
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);

    const preAborted = new AbortController();
    preAborted.abort();
    const resBefore = await executeShellCommand('node -v', { signal: preAborted.signal });
    expect(resBefore.success).toBe(false);
    expect(resBefore.aborted).toBe(true);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);

    const resMid = await executeShellCommand(
      { executable: 'node', args: ['-e', 'setInterval(() => {}, 1000)'] },
      { signal: controller.signal, timeoutMs: 5000 }
    );
    expect(resMid.success).toBe(false);
    expect(resMid.aborted).toBe(true);
  });

  it('caps stdout/stderr output buffer at 64 KB and sets outputTruncated', async () => {
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);

    const res = await executeShellCommand({
      executable: 'node',
      args: ['-e', 'process.stdout.write("A".repeat(90000))']
    });

    expect(res.success).toBe(true);
    expect(res.outputTruncated).toBe(true);
    expect(Buffer.byteLength(res.stdout || '', 'utf8')).toBeLessThanOrEqual(64 * 1024);
  });

  it('redacts secrets in captured output and rejects unsafeRawShell without explicit opt-in', async () => {
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);

    const deniedUnsafe = await executeShellCommand({
      executable: 'node',
      args: ['-v'],
      unsafeRawShell: true
    });
    expect(deniedUnsafe.success).toBe(false);
    expect(deniedUnsafe.blocked).toBe(true);

    const res = await executeShellCommand({
      executable: 'node',
      args: ['-e', 'process.stdout.write("token=sk-1234567890abcdef key=AIzaSy1234567890abcdef")']
    });
    expect(res.success).toBe(true);
    expect(res.stdout).not.toContain('sk-1234567890abcdef');
    expect(res.stdout).not.toContain('AIzaSy1234567890abcdef');
    expect(res.stdout).toContain('sk-***');
    expect(res.stdout).toContain('AIza***');
  });
});
