import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { PolicyEngine } from './PolicyEngine';
import { PolicyRule } from './types';

describe('PolicyEngine Unit Tests', () => {
  let tempDir: string;
  let validPolicyFile: string;
  let invalidPolicyFile: string;
  let originalRules: PolicyRule[];

  beforeAll(async () => {
    // Save original rules
    originalRules = [...(PolicyEngine as any).rules];

    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-policy-test-'));
    
    // Create valid policy JSON
    const validPolicy = {
      defaultPolicy: {
        rules: [
          { actionType: 'FILE_READ', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
          { actionType: 'FILE_WRITE', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
          { actionType: 'FILE_DELETE', scope: 'inside_sandbox', requiresApproval: true, allowed: true },
          { actionType: 'SHELL_RUN', scope: 'any', allowedBinaries: ['node', 'python'], requiresApproval: true, allowed: true },
          { actionType: 'NETWORK', scope: 'any', requiresApproval: false, allowed: true }
        ]
      }
    };
    validPolicyFile = path.join(tempDir, 'valid_policy.json');
    await fsp.writeFile(validPolicyFile, JSON.stringify(validPolicy), 'utf8');

    // Create invalid policy JSON
    invalidPolicyFile = path.join(tempDir, 'invalid_policy.json');
    await fsp.writeFile(invalidPolicyFile, '{ invalid_json: ', 'utf8');
  });

  afterAll(async () => {
    // Restore original rules
    (PolicyEngine as any).rules = originalRules;
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('should load custom policies from a valid JSON file', async () => {
    const loadedRules = await PolicyEngine.loadPolicies(validPolicyFile);
    expect(loadedRules.length).toBe(5);
    expect(loadedRules.find(r => r.actionType === 'SHELL_RUN')?.allowedBinaries).toContain('node');
  });

  it('should fail gracefully and use existing policy rules when loading an invalid JSON file', async () => {
    // Load valid first so rules has something known
    await PolicyEngine.loadPolicies(validPolicyFile);
    
    // Load invalid next
    const loadedRules = await PolicyEngine.loadPolicies(invalidPolicyFile);
    expect(loadedRules.length).toBe(5); // should preserve valid rules
  });

  it('should allow FILE_WRITE inside sandbox with no approval required', () => {
    const evaluation = PolicyEngine.evaluate('FILE_WRITE', '/some/path/file.txt', true);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.requiresApproval).toBe(false);
  });

  it('should allow FILE_DELETE but require approval inside sandbox when rule says requiresApproval: true', () => {
    const evaluation = PolicyEngine.evaluate('FILE_DELETE', '/some/path/file.txt', true);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.requiresApproval).toBe(true);
  });

  it('should block FILE_WRITE outside the sandbox for inside_sandbox scope and specify outside_sandbox reason', () => {
    const evaluation = PolicyEngine.evaluate('FILE_WRITE', '/some/outside/path.txt', false);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toBe('outside_sandbox');
  });

  it('should allow SHELL_RUN with configured allowed binaries in whitelist (node, python)', () => {
    const evalNode = PolicyEngine.evaluate('SHELL_RUN', 'node script.js', true);
    expect(evalNode.allowed).toBe(true);
    expect(evalNode.requiresApproval).toBe(true);

    const evalPython = PolicyEngine.evaluate('SHELL_RUN', '"python" main.py', true);
    expect(evalPython.allowed).toBe(true);
    expect(evalPython.requiresApproval).toBe(true);
  });

  it('should block SHELL_RUN with binary not in the whitelist (e.g., rm or del)', () => {
    const evaluation = PolicyEngine.evaluate('SHELL_RUN', 'rm -rf /', true);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toContain('binary_not_allowed');
  });

  it('should evaluate actionType properly when scope is any regardless of inside sandbox', () => {
    const evaluation = PolicyEngine.evaluate('NETWORK', 'https://google.com', false);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.requiresApproval).toBe(false);
  });
});
