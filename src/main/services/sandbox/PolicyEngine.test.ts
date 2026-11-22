import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
    originalRules = [...(PolicyEngine as any).rules];

    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-policy-test-'));

    const validPolicy = {
      defaultPolicy: {
        rules: [
          { actionType: 'FILE_READ', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
          { actionType: 'FILE_WRITE', scope: 'inside_sandbox', requiresApproval: false, allowed: true },
          { actionType: 'FILE_DELETE', scope: 'inside_sandbox', requiresApproval: true, allowed: true },
          { actionType: 'SHELL_RUN', scope: 'any', allowedBinaries: ['node', 'python', 'npm', 'git'], requiresApproval: true, allowed: true },
          { actionType: 'NETWORK', scope: 'any', requiresApproval: false, allowed: true }
        ]
      }
    };
    validPolicyFile = path.join(tempDir, 'valid_policy.json');
    await fsp.writeFile(validPolicyFile, JSON.stringify(validPolicy), 'utf8');

    invalidPolicyFile = path.join(tempDir, 'invalid_policy.json');
    await fsp.writeFile(invalidPolicyFile, '{ invalid_json: ', 'utf8');
  });

  beforeEach(() => {
    (PolicyEngine as any).rules = [...originalRules];
  });

  afterAll(async () => {
    (PolicyEngine as any).rules = originalRules;
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('should load custom policies from a valid JSON file', async () => {
    const loadedRules = await PolicyEngine.loadPolicies(validPolicyFile);
    expect(loadedRules.length).toBe(5);
    expect(loadedRules.find((r) => r.actionType === 'SHELL_RUN')?.allowedBinaries).toContain('node');
  });

  it('should fail gracefully and use existing policy rules when loading an invalid JSON file', async () => {
    await PolicyEngine.loadPolicies(validPolicyFile);
    const loadedRules = await PolicyEngine.loadPolicies(invalidPolicyFile);
    expect(loadedRules.length).toBe(5);
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

  it('should allow SHELL_RUN with configured exact allowed binaries and standard Windows extensions', () => {
    expect(PolicyEngine.evaluate('SHELL_RUN', 'node script.js', true)).toEqual({
      allowed: true,
      requiresApproval: true
    });
    expect(PolicyEngine.evaluate('SHELL_RUN', '"python" main.py', true)).toEqual({
      allowed: true,
      requiresApproval: true
    });
    expect(PolicyEngine.evaluate('SHELL_RUN', 'git.exe status', true).allowed).toBe(true);
    expect(PolicyEngine.evaluate('SHELL_RUN', 'NPM.CMD --version', true).allowed).toBe(true);
  });

  it('should block binary spoofing attempts such as nodeevil, mygit, npm-helper', () => {
    for (const cmd of ['nodeevil script.js', 'mygit status', 'npm-helper install', 'python3evil app.py', 'node.js app.js']) {
      const res = PolicyEngine.evaluate('SHELL_RUN', cmd, true);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('binary_not_allowed');
    }
  });

  it('should block path-prefixed binaries when allowlist only names bare executables', () => {
    for (const cmd of ['/tmp/evil/node script.js', './git status', 'C:\\temp\\node.exe app.js', '..\\npm install']) {
      const res = PolicyEngine.evaluate('SHELL_RUN', cmd, true);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('binary_not_allowed');
    }
  });

  it('should block shell metacharacters inside SHELL_RUN string evaluation', () => {
    for (const cmd of [
      'node app.js && calc.exe',
      'git status | cat',
      'node a.js; rm -rf /',
      'node $(whoami)',
      'python `id`.py'
    ]) {
      const res = PolicyEngine.evaluate('SHELL_RUN', cmd, true);
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('shell_metacharacters_not_allowed');
    }
  });

  it('should block SHELL_RUN with binary not in the whitelist (e.g., rm or del)', () => {
    const evaluation = PolicyEngine.evaluate('SHELL_RUN', 'rm -rf /', true);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toContain('binary_not_allowed');
  });

  it('should default-deny unknown action types without matching rule', () => {
    const evaluation = PolicyEngine.evaluate('UNKNOWN_ACTION' as any, 'anything', true);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.requiresApproval).toBe(true);
    expect(evaluation.reason).toBe('no_matching_rule');
  });

  it('should deny SHELL_RUN when allowedBinaries is empty', () => {
    (PolicyEngine as any).rules = [
      { actionType: 'SHELL_RUN', scope: 'any', allowedBinaries: [], requiresApproval: true, allowed: true }
    ];
    const evaluation = PolicyEngine.evaluate('SHELL_RUN', 'node -v', true);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toBe('no_allowed_binaries');
  });

  it('should evaluate actionType properly when scope is any regardless of inside sandbox', () => {
    const evaluation = PolicyEngine.evaluate('NETWORK', 'https://google.com', false);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.requiresApproval).toBe(false);
  });
});
