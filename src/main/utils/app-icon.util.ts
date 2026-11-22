import * as fs from 'fs';
import * as path from 'path';

export interface ResolveAppIconOptions {
  isPackaged?: boolean;
  resourcesPath?: string;
  mainDir?: string;
  cwd?: string;
  existsSync?: (targetPath: string) => boolean;
}

/**
 * Resolves the A.R.C. application window icon path safely across packaged and dev modes.
 * Returns undefined instead of throwing if no icon asset is present (e.g. unit test environments).
 */
export function resolveAppWindowIconPath(options: ResolveAppIconOptions = {}): string | undefined {
  const exists = options.existsSync ?? fs.existsSync;
  const isPackaged = Boolean(options.isPackaged);
  const resourcesPath = options.resourcesPath ?? (typeof process.resourcesPath === 'string' ? process.resourcesPath : '');
  const mainDir = options.mainDir ?? __dirname;
  const cwd = options.cwd ?? process.cwd();

  const candidates: string[] = [];

  if (isPackaged && resourcesPath) {
    candidates.push(
      path.join(resourcesPath, 'icon.png'),
      path.join(resourcesPath, 'icon.ico'),
      path.join(resourcesPath, 'build', 'icon.png'),
      path.join(resourcesPath, 'build', 'icon.ico')
    );
  }

  // Dev / out/main relative resolution
  candidates.push(
    path.resolve(mainDir, '../../build/icon.png'),
    path.resolve(mainDir, '../../../build/icon.png'),
    path.resolve(cwd, 'build/icon.png'),
    path.resolve(cwd, 'build/icon.ico')
  );

  for (const candidate of candidates) {
    try {
      if (candidate && exists(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible candidate paths
    }
  }

  return undefined;
}
