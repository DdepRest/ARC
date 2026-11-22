import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { SandboxedFS } from './SandboxedFS';
import { SandboxError } from './types';
import { approvalService } from '../approval.service';

describe('SandboxedFS Unit & S1-02 Boundary Security Tests', () => {
  let tempDir: string;
  let outsideDir: string;
  let outsideSecretFile: string;
  let sfs: SandboxedFS;

  beforeAll(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-sandbox-test-'));
    outsideDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arc-outside-secret-'));
    outsideSecretFile = path.join(outsideDir, 'outside-secret.txt');
    await fsp.writeFile(outsideSecretFile, 'TOP_SECRET_OUTSIDE_DATA', 'utf8');
    sfs = new SandboxedFS(tempDir, 'test-objective-id');
  });

  afterAll(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
    await fsp.rm(outsideDir, { recursive: true, force: true });
  });

  it('1. should successfully write, read, stat, mkdir, readdir, copy, rename, and delete normal in-root files', async () => {
    const filename = 'test-file.txt';
    const fileContent = 'Hello from SandboxedFS!';

    await sfs.writeFile(filename, fileContent);
    expect(await sfs.exists(filename)).toBe(true);

    const readBack = await sfs.readFile(filename, 'utf8');
    expect(readBack).toBe(fileContent);

    const st = await sfs.stat(filename);
    expect(st.isFile()).toBe(true);

    await sfs.mkdir('nested/sub');
    await sfs.copyFile(filename, 'nested/sub/copied.txt');
    expect(await sfs.readFile('nested/sub/copied.txt', 'utf8')).toBe(fileContent);

    const entries = await sfs.readdir('nested/sub');
    expect(entries).toContain('copied.txt');
  });

  it('2. should prevent lexical ../ path traversal and null bytes outside of sandbox bounds', async () => {
    for (const badPath of ['../dangerous-traversal.txt', 'nested/../../escape.txt', 'valid\0evil.txt']) {
      await expect(sfs.writeFile(badPath, 'Will fail!')).rejects.toMatchObject({
        name: 'SandboxError',
        code: 'OUT_OF_BOUNDS'
      });
    }
  });

  it('3. should block absolute paths pointing outside of the sandbox', async () => {
    const absoluteOutsidePath = os.platform() === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/etc/passwd';

    await expect(sfs.readFile(absoluteOutsidePath)).rejects.toMatchObject({
      name: 'SandboxError',
      code: 'OUT_OF_BOUNDS'
    });
  });

  it('4. should create backups prior to overwriting files', async () => {
    const filename = 'backup-experiment.txt';
    const initContent = 'Original content version 1';
    const updateContent = 'New updated content version 2';

    await sfs.writeFile(filename, initContent);
    await sfs.writeFile(filename, updateContent);

    const home = os.homedir();
    const backupDir = path.join(home, '.arc', 'backups', 'test-objective-id');
    const backups = await fsp.readdir(backupDir);

    expect(backups.length).toBeGreaterThanOrEqual(1);
    const relevantBackup = backups.find((b) => b.endsWith(`${filename}.bak`));
    expect(relevantBackup).toBeDefined();

    const backupContent = await fsp.readFile(path.join(backupDir, relevantBackup!), 'utf8');
    expect(backupContent).toBe(initContent);
  });

  it('5. should bypass database query and use cachedDecisionId if provided', async () => {
    const customSandbox = new SandboxedFS(tempDir, 'test-objective-id', 'preloaded-cache-id');
    expect(customSandbox.cachedDecisionId).toBe('preloaded-cache-id');

    const resolvedId = await (customSandbox as any).resolveDecisionId();
    expect(resolvedId).toBe('preloaded-cache-id');

    customSandbox.setDecisionId('dynamic-overridden-id');
    expect(customSandbox.cachedDecisionId).toBe('dynamic-overridden-id');
    const resolvedOverridden = await (customSandbox as any).resolveDecisionId();
    expect(resolvedOverridden).toBe('dynamic-overridden-id');
  });

  it('6. should respect user approval for deleteFile and rename', async () => {
    const filename = 'delete-me.txt';
    await sfs.writeFile(filename, 'secret');

    approvalService.setInterceptor(() => false);
    await expect(sfs.deleteFile(filename)).rejects.toThrow();
    expect(await sfs.exists(filename)).toBe(true);

    approvalService.setInterceptor(() => true);
    await sfs.deleteFile(filename);
    expect(await sfs.exists(filename)).toBe(false);

    const oldFile = 'rename-from.txt';
    const newFile = 'rename-to.txt';
    await sfs.writeFile(oldFile, 'content');

    approvalService.setInterceptor(() => false);
    await expect(sfs.rename(oldFile, newFile)).rejects.toThrow();
    expect(await sfs.exists(oldFile)).toBe(true);

    approvalService.setInterceptor(() => true);
    await sfs.rename(oldFile, newFile);
    expect(await sfs.exists(oldFile)).toBe(false);
    expect(await sfs.exists(newFile)).toBe(true);
  });

  it('7. S1-02: blocks direct root/link -> outside for readFile, writeFile, deleteFile, stat, and exists', async () => {
    const linkPath = path.join(tempDir, 'direct-outside-link.txt');
    await fsp.symlink(outsideSecretFile, linkPath);

    try {
      approvalService.setInterceptor(() => true);
      await expect(sfs.readFile('direct-outside-link.txt', 'utf8')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.writeFile('direct-outside-link.txt', 'OVERWRITE_ATTEMPT')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.deleteFile('direct-outside-link.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.stat('direct-outside-link.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.exists('direct-outside-link.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });

      // Verify external file was never modified or deleted
      expect(await fsp.readFile(outsideSecretFile, 'utf8')).toBe('TOP_SECRET_OUTSIDE_DATA');
    } finally {
      await fsp.unlink(linkPath).catch(() => {});
    }
  });

  it('8. S1-02: blocks nested symlink and parent directory link (including non-existent leaf creation)', async () => {
    const deepDir = path.join(tempDir, 'deep', 'level');
    await fsp.mkdir(deepDir, { recursive: true });
    const nestedFileLink = path.join(deepDir, 'nested-link.txt');
    const parentDirLink = path.join(deepDir, 'linked-outside-dir');

    await fsp.symlink(outsideSecretFile, nestedFileLink);
    await fsp.symlink(outsideDir, parentDirLink, 'dir');

    try {
      await expect(sfs.readFile('deep/level/nested-link.txt', 'utf8')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });

      // Reading existing file through parent directory symlink
      await expect(sfs.readFile('deep/level/linked-outside-dir/outside-secret.txt', 'utf8')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });

      // Writing a NEW (non-existent leaf) file inside a symlinked parent directory
      await expect(
        sfs.writeFile('deep/level/linked-outside-dir/brand-new-escape.txt', 'ESCAPED')
      ).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      expect(fs.existsSync(path.join(outsideDir, 'brand-new-escape.txt'))).toBe(false);

      // mkdir and readdir through parent symlink
      await expect(sfs.mkdir('deep/level/linked-outside-dir/new-subdir')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.readdir('deep/level/linked-outside-dir')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
    } finally {
      await fsp.unlink(nestedFileLink).catch(() => {});
      await fsp.unlink(parentDirLink).catch(() => {});
    }
  });

  it('9. S1-02: blocks broken symlink for read, write, delete, stat, and exists', async () => {
    const brokenLink = path.join(tempDir, 'broken-dangling-link.txt');
    const nonExistentOutside = path.join(outsideDir, 'does-not-exist-yet.txt');
    await fsp.symlink(nonExistentOutside, brokenLink);

    try {
      approvalService.setInterceptor(() => true);
      await expect(sfs.readFile('broken-dangling-link.txt')).rejects.toMatchObject({ code: 'OUT_OF_BOUNDS' });
      await expect(sfs.writeFile('broken-dangling-link.txt', 'CREATE_THROUGH_DANGLING')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.deleteFile('broken-dangling-link.txt')).rejects.toMatchObject({ code: 'OUT_OF_BOUNDS' });
      await expect(sfs.stat('broken-dangling-link.txt')).rejects.toMatchObject({ code: 'OUT_OF_BOUNDS' });
      expect(fs.existsSync(nonExistentOutside)).toBe(false);
    } finally {
      await fsp.unlink(brokenLink).catch(() => {});
    }
  });

  it('10. S1-02: blocks source and destination symlinks on rename and copyFile', async () => {
    await sfs.writeFile('legit-source.txt', 'LEGIT_CONTENT');
    const destLink = path.join(tempDir, 'dest-symlink.txt');
    const srcLink = path.join(tempDir, 'src-symlink.txt');
    await fsp.symlink(outsideSecretFile, destLink);
    await fsp.symlink(outsideSecretFile, srcLink);

    try {
      approvalService.setInterceptor(() => true);
      await expect(sfs.rename('legit-source.txt', 'dest-symlink.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.rename('src-symlink.txt', 'renamed-inside.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.copyFile('legit-source.txt', 'dest-symlink.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.copyFile('src-symlink.txt', 'copied-inside.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });

      expect(await fsp.readFile(outsideSecretFile, 'utf8')).toBe('TOP_SECRET_OUTSIDE_DATA');
    } finally {
      await fsp.unlink(destLink).catch(() => {});
      await fsp.unlink(srcLink).catch(() => {});
    }
  });

  it('11. S1-02: blocks Windows junction (`junction` type) and reparse-point canonical redirection', async () => {
    const junctionDir = path.join(tempDir, 'win-junction-dir');
    await fsp.symlink(outsideDir, junctionDir, 'junction');

    try {
      await expect(sfs.readFile('win-junction-dir/outside-secret.txt', 'utf8')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.writeFile('win-junction-dir/injected.txt', 'HACK')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
    } finally {
      await fsp.unlink(junctionDir).catch(() => {});
    }

    // Simulate a custom Windows NTFS reparse point / volume mount where lstat.isSymbolicLink() is false
    // but OS GetFinalPathNameByHandle (fs.realpathSync) resolves outside canonicalRoot
    const mountDir = path.join(tempDir, 'simulated-reparse-mount');
    await fsp.mkdir(mountDir, { recursive: true });
    const realRealpathSync = fs.realpathSync;
    const realpathSpy = vi.spyOn(fs, 'realpathSync').mockImplementation(((p: fs.PathLike, options?: any) => {
      const str = String(p);
      if (path.resolve(str) === path.resolve(mountDir)) {
        return outsideDir as any;
      }
      return realRealpathSync(p, options);
    }) as any);

    try {
      await expect(sfs.writeFile('simulated-reparse-mount/file.txt', 'MOUNT_ESCAPE')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      await expect(sfs.readFile('simulated-reparse-mount/outside-secret.txt')).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
    } finally {
      realpathSpy.mockRestore();
      await fsp.rm(mountDir, { recursive: true, force: true });
    }
  });

  it('12. S1-02: blocks custom sandbox root that is itself a symlink and blocks post-approval TOCTOU swap', async () => {
    const symlinkRoot = path.join(tempDir, 'symlink-custom-root');
    await fsp.symlink(outsideDir, symlinkRoot, 'dir');

    try {
      expect(() => new SandboxedFS(symlinkRoot, 'evil-root-obj')).toThrowError(SandboxError);
    } finally {
      await fsp.unlink(symlinkRoot).catch(() => {});
    }

    // Simulate TOCTOU swap during async approval wait in deleteFile
    const toctouFile = 'toctou-target.txt';
    const fullToctouPath = path.join(tempDir, toctouFile);
    await sfs.writeFile(toctouFile, 'SAFE_INITIAL');

    approvalService.setInterceptor(async () => {
      // Attacker swaps the file with a symlink pointing outside while waiting for user approval
      await fsp.unlink(fullToctouPath);
      await fsp.symlink(outsideSecretFile, fullToctouPath);
      return true;
    });

    try {
      await expect(sfs.deleteFile(toctouFile)).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS'
      });
      // Outside file MUST remain intact
      expect(await fsp.readFile(outsideSecretFile, 'utf8')).toBe('TOP_SECRET_OUTSIDE_DATA');
    } finally {
      await fsp.unlink(fullToctouPath).catch(() => {});
    }
  });
});
