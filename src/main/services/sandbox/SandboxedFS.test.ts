import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { SandboxedFS } from './SandboxedFS';
import { SandboxError } from './types';
import { approvalService } from '../approval.service';

describe('SandboxedFS Unit Tests', () => {
  let tempDir: string;
  let sfs: SandboxedFS;

  beforeAll(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-sandbox-test-'));
    sfs = new SandboxedFS(tempDir, 'test-objective-id');
  });

  afterAll(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('should successfully write and read files within the sandbox', async () => {
    const filename = 'test-file.txt';
    const fileContent = 'Hello from SandboxedFS!';

    await sfs.writeFile(filename, fileContent);
    const exists = await sfs.exists(filename);
    expect(exists).toBe(true);

    const readBack = await sfs.readFile(filename, 'utf8');
    expect(readBack).toBe(fileContent);
  });

  it('should prevent path traversal outside of sandbox bounds', async () => {
    const dangerousPath = '../dangerous-traversal.txt';
    const fileContent = 'Will fail!';

    await expect(sfs.writeFile(dangerousPath, fileContent)).rejects.toThrow();

    try {
      await sfs.writeFile(dangerousPath, fileContent);
    } catch (err: any) {
      expect(err).toBeInstanceOf(SandboxError);
      expect(err.code).toBe('OUT_OF_BOUNDS');
    }
  });

  it('should block absolute paths pointing outside of the sandbox', async () => {
    const absoluteOutsidePath = os.platform() === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/etc/passwd';
    
    await expect(sfs.readFile(absoluteOutsidePath)).rejects.toThrow();
    
    try {
      await sfs.readFile(absoluteOutsidePath);
    } catch (err: any) {
      expect(err).toBeInstanceOf(SandboxError);
      expect(err.code).toBe('OUT_OF_BOUNDS');
    }
  });

  it('should create backups prior to overwriting files', async () => {
    const filename = 'backup-experiment.txt';
    const initContent = 'Original content version 1';
    const updateContent = 'New updated content version 2';

    // 1. Write initial
    await sfs.writeFile(filename, initContent);

    // 2. Overwrite
    await sfs.writeFile(filename, updateContent);

    // 3. Confirm backup is written in ~/.arc/backups/test-objective-id/
    const home = os.homedir();
    const backupDir = path.join(home, '.arc', 'backups', 'test-objective-id');
    const backups = await fsp.readdir(backupDir);

    expect(backups.length).toBeGreaterThanOrEqual(1);
    
    const relevantBackup = backups.find(b => b.endsWith(`${filename}.bak`));
    expect(relevantBackup).toBeDefined();

    const backupContent = await fsp.readFile(path.join(backupDir, relevantBackup!), 'utf8');
    expect(backupContent).toBe(initContent);
  });

  it('should bypass database query and use cachedDecisionId if provided', async () => {
    const customSandbox = new SandboxedFS(tempDir, 'test-objective-id', 'preloaded-cache-id');
    expect(customSandbox.cachedDecisionId).toBe('preloaded-cache-id');

    // Access the private method using any cast to check returned decision ID
    const resolvedId = await (customSandbox as any).resolveDecisionId();
    expect(resolvedId).toBe('preloaded-cache-id');

    customSandbox.setDecisionId('dynamic-overridden-id');
    expect(customSandbox.cachedDecisionId).toBe('dynamic-overridden-id');
    const resolvedOverridden = await (customSandbox as any).resolveDecisionId();
    expect(resolvedOverridden).toBe('dynamic-overridden-id');
  });

  it('should block deleteFile when user rejects approval', async () => {
    const filename = 'delete-me.txt';
    await sfs.writeFile(filename, 'secret');

    approvalService.setInterceptor(() => false);

    await expect(sfs.deleteFile(filename)).rejects.toThrow();
    expect(await sfs.exists(filename)).toBe(true);
  });

  it('should deleteFile when user approves', async () => {
    const filename = 'delete-me-approved.txt';
    await sfs.writeFile(filename, 'bye');

    approvalService.setInterceptor(() => true);

    await sfs.deleteFile(filename);
    expect(await sfs.exists(filename)).toBe(false);
  });

  it('should block rename when user rejects approval', async () => {
    const oldFile = 'rename-from.txt';
    const newFile = 'rename-to.txt';
    await sfs.writeFile(oldFile, 'content');

    approvalService.setInterceptor(() => false);

    await expect(sfs.rename(oldFile, newFile)).rejects.toThrow();
    expect(await sfs.exists(oldFile)).toBe(true);
  });

  it('should rename when user approves', async () => {
    const oldFile = 'rename-ok.txt';
    const newFile = 'rename-ok-target.txt';
    await sfs.writeFile(oldFile, 'ok-content');

    approvalService.setInterceptor(() => true);

    await sfs.rename(oldFile, newFile);
    expect(await sfs.exists(oldFile)).toBe(false);
    expect(await sfs.exists(newFile)).toBe(true);
  });
});
