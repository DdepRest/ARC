import fs from 'fs/promises';
import path from 'path';
import { extractExecutableToken } from '../commands/shell-command.parser';
import {
  ActionType,
  PolicyConfig,
  PolicyEvaluationResult,
  PolicyRule,
  StructuredShellCommand
} from './types';

const WINDOWS_ALLOWED_EXTENSIONS = ['.exe', '.cmd', '.bat'] as const;

function hasPathOrDriveQualifier(executable: string): boolean {
  return (
    executable.includes('/') ||
    executable.includes('\\') ||
    executable.includes(':') ||
    executable === '.' ||
    executable === '..'
  );
}

function hasExplicitExtension(binaryName: string): boolean {
  return path.posix.extname(binaryName) !== '' || path.win32.extname(binaryName) !== '';
}

function isExecutableExactMatch(executable: string, allowedBinaries: string[]): boolean {
  const execTrimmed = executable.trim();
  if (!execTrimmed || /[\s\0\r\n]/.test(execTrimmed)) {
    return false;
  }

  const execLower = execTrimmed.toLowerCase();
  const execHasPath = hasPathOrDriveQualifier(execLower);

  for (const allowedEntry of allowedBinaries) {
    if (typeof allowedEntry !== 'string') continue;
    const allowedTrimmed = allowedEntry.trim();
    if (!allowedTrimmed) continue;

    const allowedLower = allowedTrimmed.toLowerCase();
    const allowedHasPath = hasPathOrDriveQualifier(allowedLower);

    if (allowedHasPath) {
      if (path.normalize(execLower) === path.normalize(allowedLower)) {
        return true;
      }
      continue;
    }

    // Bare allowlist entry never permits arbitrary path-prefixed binaries (e.g. ./node or C:\temp\node.exe)
    if (execHasPath) {
      continue;
    }

    if (execLower === allowedLower) {
      return true;
    }

    if (!hasExplicitExtension(allowedLower)) {
      for (const ext of WINDOWS_ALLOWED_EXTENSIONS) {
        if (execLower === `${allowedLower}${ext}`) {
          return true;
        }
      }
    }
  }

  return false;
}

function isValidPolicyRule(rule: unknown): rule is PolicyRule {
  if (!rule || typeof rule !== 'object') return false;
  const candidate = rule as Record<string, unknown>;
  return (
    typeof candidate.actionType === 'string' &&
    (candidate.scope === 'inside_sandbox' || candidate.scope === 'any') &&
    typeof candidate.requiresApproval === 'boolean' &&
    (candidate.allowedBinaries === undefined ||
      (Array.isArray(candidate.allowedBinaries) &&
        candidate.allowedBinaries.every((item) => typeof item === 'string')))
  );
}

export class PolicyEngine {
  private static rules: PolicyRule[] = [
    { actionType: 'FILE_READ', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
    { actionType: 'FILE_WRITE', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
    { actionType: 'FILE_DELETE', scope: 'inside_sandbox', requiresApproval: true, allowed: true },
    { actionType: 'FILE_RENAME', scope: 'inside_sandbox', requiresApproval: true, allowed: true },
    {
      actionType: 'SHELL_RUN',
      scope: 'any',
      allowedBinaries: ['node', 'python', 'npm', 'git'],
      requiresApproval: true,
      allowed: true
    },
    { actionType: 'NETWORK', scope: 'any', requiresApproval: false, allowed: true },
    { actionType: 'SYSTEM', scope: 'any', requiresApproval: true, allowed: true }
  ];

  public static async loadPolicies(policiesPath: string): Promise<PolicyRule[]> {
    try {
      const content = await fs.readFile(policiesPath, 'utf8');
      const config: PolicyConfig = JSON.parse(content);
      if (config && config.defaultPolicy && Array.isArray(config.defaultPolicy.rules)) {
        const validRules = config.defaultPolicy.rules.filter(isValidPolicyRule);
        if (validRules.length === config.defaultPolicy.rules.length) {
          this.rules = validRules;
          console.log(`[PolicyEngine] Loaded ${this.rules.length} custom policy rules from ${policiesPath}`);
        } else {
          console.warn(`[PolicyEngine] Rejected malformed policy rules from ${policiesPath}, keeping existing rules.`);
        }
      }
    } catch (err: any) {
      console.warn(
        `[PolicyEngine] Failed to load custom policies from ${policiesPath}, using default rules. Reason: ${err.message}`
      );
    }
    return this.rules;
  }

  public static evaluateShellPayload(
    payload: Pick<StructuredShellCommand, 'executable' | 'args' | 'unsafeRawShell'>,
    isInsideSandbox: boolean = false
  ): PolicyEvaluationResult {
    const rule = this.rules.find((r) => r.actionType === 'SHELL_RUN');
    if (!rule) {
      return { allowed: false, requiresApproval: true, reason: 'no_matching_rule' };
    }

    if (rule.allowed === false) {
      return { allowed: false, requiresApproval: true, reason: 'policy_denied' };
    }

    if (rule.scope === 'inside_sandbox' && !isInsideSandbox) {
      return { allowed: false, requiresApproval: true, reason: 'outside_sandbox' };
    }

    if (!Array.isArray(rule.allowedBinaries) || rule.allowedBinaries.length === 0) {
      return { allowed: false, requiresApproval: true, reason: 'no_allowed_binaries' };
    }

    const extracted = extractExecutableToken({ executable: payload.executable, args: payload.args });
    if (!extracted.ok || !extracted.executable) {
      return { allowed: false, requiresApproval: true, reason: extracted.reason || 'invalid_executable_token' };
    }

    if (!isExecutableExactMatch(extracted.executable, rule.allowedBinaries)) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `binary_not_allowed: '${extracted.executable}' not in exact allowlist [${rule.allowedBinaries.join(', ')}]`
      };
    }

    return {
      allowed: true,
      // Unsafe raw shell mode must ALWAYS require interactive approval regardless of custom policy flags
      requiresApproval: payload.unsafeRawShell ? true : rule.requiresApproval
    };
  }

  public static evaluate(
    actionType: ActionType,
    targetPath: string,
    isInsideSandbox: boolean = true
  ): PolicyEvaluationResult {
    const rule = this.rules.find((r) => r.actionType === actionType);

    // Default-deny for unknown or unconfigured ActionType values
    if (!rule) {
      if (!isInsideSandbox && ['FILE_WRITE', 'FILE_DELETE', 'FILE_RENAME'].includes(actionType)) {
        return { allowed: false, requiresApproval: true, reason: 'outside_sandbox' };
      }
      return { allowed: false, requiresApproval: true, reason: 'no_matching_rule' };
    }

    if (rule.allowed === false) {
      return { allowed: false, requiresApproval: true, reason: 'policy_denied' };
    }

    if (rule.scope === 'inside_sandbox' && !isInsideSandbox) {
      return { allowed: false, requiresApproval: true, reason: 'outside_sandbox' };
    }

    if (actionType === 'SHELL_RUN') {
      if (!Array.isArray(rule.allowedBinaries) || rule.allowedBinaries.length === 0) {
        return { allowed: false, requiresApproval: true, reason: 'no_allowed_binaries' };
      }

      const extracted = extractExecutableToken(targetPath);
      if (!extracted.ok || !extracted.executable) {
        return { allowed: false, requiresApproval: true, reason: extracted.reason || 'invalid_executable_token' };
      }

      if (!isExecutableExactMatch(extracted.executable, rule.allowedBinaries)) {
        return {
          allowed: false,
          requiresApproval: true,
          reason: `binary_not_allowed: '${extracted.executable}' not in exact allowlist [${rule.allowedBinaries.join(', ')}]`
        };
      }
    }

    return {
      allowed: true,
      requiresApproval: rule.requiresApproval
    };
  }
}
