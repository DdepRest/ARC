import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeShellCommand } from './shell-executor';
import { PolicyEngine } from '../sandbox/PolicyEngine';
import { shellApprovalService } from '../security/shell-approval.service';

describe('executeShellCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty or whitespace-only commands', async () => {
    const res = await executeShellCommand('   ');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Command is empty');
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

  it('requests approval when requiresApproval is true and halts if user rejects', async () => {
    vi.spyOn(PolicyEngine, 'evaluate').mockReturnValue({
      allowed: true,
      requiresApproval: true,
      reason: 'Выполнение shell команды'
    });
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(false);

    const res = await executeShellCommand('dir');
    expect(res.success).toBe(false);
    expect(res.error).toBe('User approval rejected or timed out');
  });

  it('executes command when user approves', async () => {
    vi.spyOn(PolicyEngine, 'evaluate').mockReturnValue({
      allowed: true,
      requiresApproval: true,
      reason: 'Выполнение shell команды'
    });
    vi.spyOn(shellApprovalService, 'requestShellApproval').mockResolvedValue(true);

    const res = await executeShellCommand('echo test_arc_shell');
    expect(res.success).toBe(true);
    expect(res.stdout).toContain('test_arc_shell');
  });
});
