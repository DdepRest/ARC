import { exec } from 'child_process';
import { PolicyEngine } from '../sandbox/PolicyEngine';
import { shellApprovalService, ShellApprovalOptions } from '../security/shell-approval.service';

export interface ShellExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  blocked?: boolean;
}

export async function executeShellCommand(
  command: string,
  options?: ShellApprovalOptions
): Promise<ShellExecutionResult> {
  const trimmedCmd = command.trim();
  if (!trimmedCmd) {
    return { success: false, error: 'Command is empty' };
  }

  // 1. Policy check via PolicyEngine
  const policy = PolicyEngine.evaluate('SHELL_RUN', trimmedCmd, false);
  if (!policy.allowed) {
    console.error('[ShellExecutor] Shell command blocked by PolicyEngine:', trimmedCmd, 'Reason:', policy.reason);
    return { success: false, blocked: true, error: `PolicyEngine blocked: ${policy.reason}` };
  }

  // 2. Explicit approval check (SHELL_RUN requires user approval)
  if (policy.requiresApproval) {
    const approved = await shellApprovalService.requestShellApproval(trimmedCmd, options);
    if (!approved) {
      console.warn('[ShellExecutor] Shell command execution rejected or timed out by user:', trimmedCmd);
      return { success: false, error: 'User approval rejected or timed out' };
    }
  }

  // 3. Execution
  return new Promise<ShellExecutionResult>((resolve) => {
    exec(trimmedCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ShellExecutor] Command error: ${error.message}`);
        resolve({ success: false, stdout, stderr, error: error.message });
        return;
      }
      if (stderr) {
        console.warn(`[ShellExecutor] Command stderr: ${stderr}`);
      }
      console.log(`[ShellExecutor] Command stdout: ${stdout}`);
      resolve({ success: true, stdout, stderr });
    });
  });
}
