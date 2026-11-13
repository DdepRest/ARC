import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { shellApprovalService } from './shell-approval.service';
import { approvalService } from '../approval.service';

describe('ShellApprovalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates deterministic 16-character sha256 command hash', () => {
    const hash1 = shellApprovalService.getCommandHash('dir /b');
    const hash2 = shellApprovalService.getCommandHash('dir /b');
    const hash3 = shellApprovalService.getCommandHash('rm -rf /');

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);
    expect(hash1).not.toBe(hash3);
  });

  it('logs audit entry formatted as [AUDIT] SHELL_RUN approval: <hash> | user_choice: <approve|cancel> | <timestamp>', () => {
    const command = 'echo test_audit_log';
    shellApprovalService.logAudit(command, 'approve');

    const logPath = shellApprovalService.getAuditLogPath();
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf8');
    const hash = shellApprovalService.getCommandHash(command);
    expect(content).toContain(`[AUDIT] SHELL_RUN approval: ${hash} | user_choice: approve | `);
  });

  it('rotates audit log when file is older than 7 days', () => {
    const logPath = shellApprovalService.getAuditLogPath();
    fs.writeFileSync(logPath, 'old-audit-entry\n', 'utf8');

    // Artificial mtime > 7 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(logPath, eightDaysAgo, eightDaysAgo);

    shellApprovalService.rotateAuditLogIfNeeded();

    // The old file should have been rotated or new file created
    const dir = path.dirname(logPath);
    const files = fs.readdirSync(dir);
    const rotatedFile = files.find(f => f.startsWith('audit-') && f.endsWith('.log.old'));
    expect(rotatedFile).toBeDefined();

    // Clean up rotated file
    if (rotatedFile) {
      fs.unlinkSync(path.join(dir, rotatedFile));
    }
  });

  it('delegates requestShellApproval with 60s timeout and writes audit record on approve', async () => {
    const requestApprovalSpy = vi.spyOn(approvalService, 'requestApproval').mockResolvedValue(true);
    const logAuditSpy = vi.spyOn(shellApprovalService, 'logAudit');

    const result = await shellApprovalService.requestShellApproval('git status', { macroId: 'test-macro' });
    expect(result).toBe(true);
    expect(requestApprovalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'SHELL_RUN',
        target: 'git status',
        timeoutMs: 60000,
        metadata: expect.objectContaining({
          macroId: 'test-macro'
        })
      })
    );
    expect(logAuditSpy).toHaveBeenCalledWith('git status', 'approve');
  });

  it('writes audit record with cancel choice when approval is rejected or times out', async () => {
    vi.spyOn(approvalService, 'requestApproval').mockResolvedValue(false);
    const logAuditSpy = vi.spyOn(shellApprovalService, 'logAudit');

    const result = await shellApprovalService.requestShellApproval('powershell evil.ps1');
    expect(result).toBe(false);
    expect(logAuditSpy).toHaveBeenCalledWith('powershell evil.ps1', 'cancel');
  });
});
