export class SandboxError extends Error {
  public code: 'OUT_OF_BOUNDS' | 'PERMISSION_DENIED' | 'BACKUP_FAILED' | 'OPERATION_FAILED';
  public path?: string;

  constructor(
    code: 'OUT_OF_BOUNDS' | 'PERMISSION_DENIED' | 'BACKUP_FAILED' | 'OPERATION_FAILED',
    message: string,
    path?: string
  ) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
    this.path = path;
    Object.setPrototypeOf(this, SandboxError.prototype);
  }
}

export type ActionType =
  | 'FILE_READ'
  | 'FILE_WRITE'
  | 'FILE_DELETE'
  | 'FILE_RENAME'
  | 'SHELL_RUN'
  | 'NETWORK'
  | 'SYSTEM';

export interface PolicyEvaluationResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export type ShellExecutionMode = 'direct' | 'unsafe_raw_shell';

export interface StructuredShellCommand {
  executable: string;
  args?: string[];
  cwd?: string;
  purpose?: string;
  unsafeRawShell?: boolean;
}

export interface PolicyRule {
  actionType: ActionType;
  scope: 'inside_sandbox' | 'any';
  allowedBinaries?: string[];
  requiresApproval: boolean;
  allowed?: boolean;
}

export interface ExecutionPolicy {
  rules: PolicyRule[];
}

export interface PolicyConfig {
  defaultPolicy: ExecutionPolicy;
}
