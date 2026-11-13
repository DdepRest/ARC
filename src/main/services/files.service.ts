import path from 'path';
import os from 'os';
import { app } from 'electron';

let customAllowedRoots: string[] = [];

export function getAllowedRoots(): string[] {
  const roots: string[] = [];

  try {
    if (typeof app !== 'undefined' && typeof app.getPath === 'function') {
      roots.push(path.resolve(app.getPath('userData')));
      try {
        roots.push(path.resolve(app.getPath('documents'), 'A.R.C.'));
      } catch {
        // documents may not be available on all systems
      }
    }
  } catch {
    // Electron app may not be initialized in test environments
  }

  // ARC workspace root
  try {
    roots.push(path.resolve(os.homedir(), 'ARC_Workspace'));
  } catch {
    // Ignore error
  }

  roots.push(...customAllowedRoots);

  return Array.from(new Set(roots.map(r => path.resolve(r))));
}

export function setCustomAllowedRoots(roots: string[]): void {
  customAllowedRoots = [...roots];
}

export function addAllowedRoot(rootPath: string): void {
  customAllowedRoots.push(path.resolve(rootPath));
}

export function clearCustomAllowedRoots(): void {
  customAllowedRoots = [];
}

export function isPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') {
    return false;
  }

  // Prevent null byte injections
  if (targetPath.includes('\0')) {
    return false;
  }

  const resolved = path.resolve(targetPath);
  const roots = getAllowedRoots();

  return roots.some(root => {
    const normalizedRoot = path.resolve(root);
    if (resolved === normalizedRoot) {
      return true;
    }
    return resolved.startsWith(normalizedRoot + path.sep);
  });
}
