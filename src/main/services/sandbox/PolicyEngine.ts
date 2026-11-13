import fs from 'fs/promises';
import { ActionType, PolicyRule, PolicyConfig } from './types';

export class PolicyEngine {
  private static rules: PolicyRule[] = [
    { actionType: 'FILE_READ', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
    { actionType: 'FILE_WRITE', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
    { actionType: 'FILE_DELETE', scope: 'inside_sandbox', requiresApproval: true, allowed: true },
    { actionType: 'FILE_RENAME', scope: 'inside_sandbox', requiresApproval: true, allowed: true },
    { actionType: 'SHELL_RUN', scope: 'any', allowedBinaries: ['node', 'python', 'npm', 'git'], requiresApproval: true, allowed: true },
    { actionType: 'NETWORK', scope: 'any', requiresApproval: false, allowed: true },
    { actionType: 'SYSTEM', scope: 'any', requiresApproval: true, allowed: true }
  ];

  public static async loadPolicies(policiesPath: string): Promise<PolicyRule[]> {
    try {
      const content = await fs.readFile(policiesPath, 'utf8');
      const config: PolicyConfig = JSON.parse(content);
      if (config && config.defaultPolicy && Array.isArray(config.defaultPolicy.rules)) {
        this.rules = config.defaultPolicy.rules;
        console.log(`[PolicyEngine] Loaded ${this.rules.length} custom policy rules from ${policiesPath}`);
      }
    } catch (err: any) {
      console.warn(`[PolicyEngine] Failed to load custom policies from ${policiesPath}, using default rules. Reason: ${err.message}`);
    }
    return this.rules;
  }

  public static evaluate(
    actionType: ActionType,
    targetPath: string,
    isInsideSandbox: boolean = true
  ): { allowed: boolean; requiresApproval: boolean; reason?: string } {
    const rule = this.rules.find(r => r.actionType === actionType);
    
    if (!rule) {
      if (!isInsideSandbox && ['FILE_WRITE', 'FILE_DELETE', 'FILE_RENAME'].includes(actionType)) {
        return { allowed: false, requiresApproval: true, reason: 'outside_sandbox' };
      }
      return { allowed: true, requiresApproval: true, reason: 'no_matching_rule' };
    }

    if (rule.scope === 'inside_sandbox' && !isInsideSandbox) {
      return { allowed: false, requiresApproval: true, reason: 'outside_sandbox' };
    }

    if (actionType === 'SHELL_RUN' && rule.allowedBinaries) {
      const firstWord = targetPath.trim().split(/\s+/)[0];
      const binaryName = firstWord.replace(/['"]+/g, '');
      const isAllowedBinary = rule.allowedBinaries.some(b => binaryName.toLowerCase().includes(b.toLowerCase()));
      if (!isAllowedBinary) {
        return { 
          allowed: false, 
          requiresApproval: true, 
          reason: `binary_not_allowed: '${binaryName}' not in list [${rule.allowedBinaries.join(', ')}]` 
        };
      }
    }

    return { 
      allowed: rule.allowed !== false, 
      requiresApproval: rule.requiresApproval 
    };
  }
}
