import path from 'path';
import os from 'os';
import { app } from 'electron';
import {
  isPathAllowedInRootsSync,
  validateSandboxRootSync,
  type SandboxOperationMode,
  type SandboxPathCheckOptions
} from './sandbox/path-guard';

let customAllowedRoots: string[] = [];

function isSafeRootCandidate(rootPath: string): boolean {
  if (!rootPath || typeof rootPath !== 'string' || rootPath.includes('\0')) {
    return false;
  }
  try {
    validateSandboxRootSync(rootPath);
    return true;
  } catch {
    return false;
  }
}

export function getAllowedRoots(): string[] {
  const roots: string[] = [];

  try {
    if (typeof app !== 'undefined' && typeof app.getPath === 'function') {
      const userData = app.getPath('userData');
      if (userData) roots.push(path.resolve(userData));
      try {
        const docs = app.getPath('documents');
        if (docs) roots.push(path.resolve(docs, 'A.R.C.'));
      } catch {
        // documents may not be available on all systems
      }
    }
  } catch {
    // Electron app may not be initialized in test environments
  }

  try {
    roots.push(path.resolve(os.homedir(), 'ARC_Workspace'));
  } catch {
    // Ignore error
  }

  roots.push(...customAllowedRoots);

  const uniqueResolved = Array.from(new Set(roots.map((r) => path.resolve(r))));
  return uniqueResolved.filter(isSafeRootCandidate);
}

export function setCustomAllowedRoots(roots: string[]): void {
  if (!Array.isArray(roots)) {
    customAllowedRoots = [];
    return;
  }
  customAllowedRoots = roots
    .filter((r) => typeof r === 'string' && r.trim().length > 0 && !r.includes('\0'))
    .map((r) => path.resolve(r))
    .filter(isSafeRootCandidate);
}

export function addAllowedRoot(rootPath: string): void {
  if (!rootPath || typeof rootPath !== 'string' || rootPath.includes('\0')) {
    return;
  }
  const resolved = path.resolve(rootPath);
  if (isSafeRootCandidate(resolved)) {
    customAllowedRoots.push(resolved);
  }
}

export function clearCustomAllowedRoots(): void {
  customAllowedRoots = [];
}

export function isPathAllowed(
  targetPath: string,
  modeOrOptions?: SandboxOperationMode | SandboxPathCheckOptions
): boolean {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) {
    return false;
  }

  const options: SandboxPathCheckOptions | undefined =
    typeof modeOrOptions === 'string' ? { mode: modeOrOptions } : modeOrOptions;

  return isPathAllowedInRootsSync(getAllowedRoots(), targetPath, options);
}
