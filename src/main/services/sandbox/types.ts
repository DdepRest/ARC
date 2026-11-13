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

export type ActionType = 'FILE_READ' | 'FILE_WRITE' | 'FILE_DELETE' | 'FILE_RENAME' | 'SHELL_RUN' | 'NETWORK' | 'SYSTEM';

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
