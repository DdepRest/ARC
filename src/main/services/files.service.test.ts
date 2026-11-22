import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isPathAllowed,
  setCustomAllowedRoots,
  addAllowedRoot,
  clearCustomAllowedRoots,
  getAllowedRoots
} from './files.service';

describe('FilesService - S1-02 Path Traversal & Symlink/Junction Protection', () => {
  let tmpBase: string;
  let allowedRoot: string;
  let outsideRoot: string;
  let outsideFile: string;

  beforeEach(() => {
    clearCustomAllowedRoots();
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-files-svc-test-'));
    allowedRoot = path.join(tmpBase, 'allowed_workspace');
    outsideRoot = path.join(tmpBase, 'outside_sensitive');
    fs.mkdirSync(allowedRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    outsideFile = path.join(outsideRoot, 'credentials.txt');
    fs.writeFileSync(outsideFile, 'SECRET_CREDENTIALS', 'utf8');
  });

  afterEach(() => {
    clearCustomAllowedRoots();
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it('should block system directories, lexical ../ traversal, and null bytes', () => {
    setCustomAllowedRoots(['/app/sandbox/user_data']);

    expect(isPathAllowed('/etc/passwd')).toBe(false);
    expect(isPathAllowed('/etc/shadow')).toBe(false);
    expect(isPathAllowed('C:\\Windows\\System32\\config\\SAM')).toBe(false);
    expect(isPathAllowed('C:\\Program Files')).toBe(false);

    expect(isPathAllowed('/app/sandbox/user_data/../../etc/passwd')).toBe(false);
    expect(isPathAllowed('/app/sandbox/user_data/../other')).toBe(false);
    expect(isPathAllowed('/app/sandbox/user_data/test\0.txt')).toBe(false);
  });

  it('should allow paths within authorized roots and protect root directory from write/delete mode', () => {
    setCustomAllowedRoots(['/app/sandbox/user_data']);

    expect(isPathAllowed('/app/sandbox/user_data')).toBe(true);
    expect(isPathAllowed('/app/sandbox/user_data', 'list')).toBe(true);
    expect(isPathAllowed('/app/sandbox/user_data', 'delete')).toBe(false);
    expect(isPathAllowed('/app/sandbox/user_data', 'write')).toBe(false);
    expect(isPathAllowed('/app/sandbox/user_data/arc.db')).toBe(true);
    expect(isPathAllowed('/app/sandbox/user_data/arc.db', 'write')).toBe(true);
    expect(isPathAllowed('/app/sandbox/user_data/nested/folder/file.json')).toBe(true);
  });

  it('S1-02: rejects direct symlink, nested symlink, parent directory junction, and broken symlink inside allowedRoot', () => {
    setCustomAllowedRoots([allowedRoot]);

    const directLink = path.join(allowedRoot, 'direct-link.txt');
    fs.symlinkSync(outsideFile, directLink);

    const subDir = path.join(allowedRoot, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    const nestedLink = path.join(subDir, 'nested-link.txt');
    fs.symlinkSync(outsideFile, nestedLink);

    const parentJunction = path.join(subDir, 'junction-outside');
    fs.symlinkSync(outsideRoot, parentJunction, 'junction');

    const brokenLink = path.join(allowedRoot, 'broken-link.txt');
    fs.symlinkSync(path.join(outsideRoot, 'missing.txt'), brokenLink);

    expect(isPathAllowed(directLink)).toBe(false);
    expect(isPathAllowed(nestedLink)).toBe(false);
    expect(isPathAllowed(parentJunction)).toBe(false);
    expect(isPathAllowed(path.join(parentJunction, 'credentials.txt'))).toBe(false);
    expect(isPathAllowed(path.join(parentJunction, 'new-created-file.txt'), 'write')).toBe(false);
    expect(isPathAllowed(brokenLink)).toBe(false);

    const realInsideFile = path.join(subDir, 'legit.txt');
    fs.writeFileSync(realInsideFile, 'OK', 'utf8');
    expect(isPathAllowed(realInsideFile, 'read')).toBe(true);
    expect(isPathAllowed(realInsideFile, 'write')).toBe(true);
  });

  it('S1-02: prevents custom root from expanding sandbox boundaries via symlink or junction', () => {
    const symlinkCustomRoot = path.join(tmpBase, 'evil-custom-root-link');
    fs.symlinkSync(outsideRoot, symlinkCustomRoot, 'junction');

    setCustomAllowedRoots([symlinkCustomRoot]);
    expect(getAllowedRoots()).not.toContain(path.resolve(symlinkCustomRoot));
    expect(isPathAllowed(path.join(symlinkCustomRoot, 'credentials.txt'))).toBe(false);

    addAllowedRoot(symlinkCustomRoot);
    expect(getAllowedRoots()).not.toContain(path.resolve(symlinkCustomRoot));
    expect(isPathAllowed(path.join(symlinkCustomRoot, 'credentials.txt'))).toBe(false);
  });
});
