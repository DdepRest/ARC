import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { SandboxError } from './types';

/**
 * S1-02 (P1-02) Unified Sandbox Path Guard.
 *
 * Security invariants enforced:
 * 1. Rejects empty, non-string, or null-byte (`\0`) paths.
 * 2. Validates the sandbox/allowed root itself: rejects roots whose leaf or user-space
 *    ancestors are symbolic links, NTFS junctions, or reparse points redirecting outside.
 * 3. Enforces lexical path containment (`path.resolve` + `path.relative`).
 * 4. Walks every existing path component from root to target with `fs.lstatSync` and
 *    rejects any component where `isSymbolicLink()` is true (covers POSIX symlinks,
 *    broken symlinks, nested/parent symlinks, destination symlinks, and Windows
 *    NTFS junctions / mount-point reparse tags exposed by libuv).
 * 5. Resolves `fs.realpathSync` on the deepest existing component (the target itself if
 *    it exists, or the canonical parent directory when creating a new file/folder) and
 *    verifies that both the existing ancestor and the reconstructed canonical target
 *    remain strictly inside `canonicalRoot` without unexpected path divergence (covers
 *    custom Windows reparse points or volume mounts even if `isSymbolicLink()` is false).
 *
 * Residual platform / Node.js TOCTOU notes (documented per S1-02 §8-9):
 * - Callers MUST re-validate paths immediately before destructive filesystem operations
 *   (after async approval dialogs or backup steps).
 * - On POSIX platforms supporting `fs.constants.O_NOFOLLOW`, `openNoFollow` opens the
 *   leaf file descriptor with `O_NOFOLLOW` so the kernel rejects leaf symlink swaps.
 * - Standard Node.js `fs` APIs do not expose directory-FD relative `openat2(..., RESOLVE_NO_SYMLINKS)`
 *   or Windows `FILE_FLAG_OPEN_REPARSE_POINT` across intermediate path components without
 *   custom native C++ addons.
 */

export type SandboxOperationMode = 'read' | 'list' | 'write' | 'delete' | 'rename' | 'copy';

export interface SandboxPathCheckOptions {
  mode?: SandboxOperationMode;
  allowRootSelf?: boolean;
}

export interface ValidatedRootInfo {
  lexicalRoot: string;
  canonicalRoot: string;
  rootExists: boolean;
}

function normalizeForPlatformCompare(p: string): string {
  const norm = path.normalize(p);
  return process.platform === 'win32' ? norm.toLowerCase() : norm;
}

export function isLexicallyInsideRoot(
  rootDir: string,
  candidatePath: string,
  allowRootSelf: boolean = true
): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);

  const cmpRoot = normalizeForPlatformCompare(resolvedRoot);
  const cmpCandidate = normalizeForPlatformCompare(resolvedCandidate);

  if (cmpCandidate === cmpRoot) {
    return allowRootSelf;
  }

  if (process.platform === 'win32') {
    const rootDrive = path.parse(cmpRoot).root;
    const candidateDrive = path.parse(cmpCandidate).root;
    if (rootDrive !== candidateDrive) {
      return false;
    }
  }

  const rel = path.relative(cmpRoot, cmpCandidate);
  if (!rel) {
    return allowRootSelf;
  }
  if (
    rel === '..' ||
    rel.startsWith(`..${path.sep}`) ||
    rel.startsWith('../') ||
    rel.startsWith('..\\') ||
    path.isAbsolute(rel)
  ) {
    return false;
  }
  return true;
}

function getSystemStopAncestors(): Set<string> {
  const stops = new Set<string>();
  try {
    stops.add(normalizeForPlatformCompare(path.resolve(os.tmpdir())));
  } catch {
    /* ignore */
  }
  try {
    stops.add(normalizeForPlatformCompare(path.resolve(os.homedir())));
  } catch {
    /* ignore */
  }
  return stops;
}

export function validateSandboxRootSync(rootDir: string): ValidatedRootInfo {
  if (!rootDir || typeof rootDir !== 'string' || rootDir.includes('\0')) {
    throw new SandboxError('OUT_OF_BOUNDS', 'Invalid sandbox root path', String(rootDir));
  }

  const lexicalRoot = path.resolve(rootDir);
  const stopAncestors = getSystemStopAncestors();
  const parsedRoot = path.parse(lexicalRoot).root;

  // Walk from lexicalRoot up to system stop ancestors (tmpdir/homedir/fs root)
  // to ensure neither the sandbox root nor any user-space parent is a symlink/junction.
  const chainToCheck: string[] = [];
  let cursor = lexicalRoot;
  while (cursor && normalizeForPlatformCompare(cursor) !== normalizeForPlatformCompare(parsedRoot)) {
    chainToCheck.push(cursor);
    if (stopAncestors.has(normalizeForPlatformCompare(cursor))) {
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  for (const dir of chainToCheck) {
    try {
      const st = fs.lstatSync(dir);
      if (st.isSymbolicLink()) {
        throw new SandboxError(
          'OUT_OF_BOUNDS',
          `Access denied: Sandbox root or its ancestor cannot be a symbolic link or junction: ${dir}`,
          lexicalRoot
        );
      }
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      if (err?.code === 'ENOENT') continue;
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Unable to inspect sandbox root component "${dir}" (${err?.code || 'STAT_ERROR'})`,
        lexicalRoot
      );
    }
  }

  let rootExists = false;
  let canonicalRoot = lexicalRoot;
  try {
    const rootStat = fs.lstatSync(lexicalRoot);
    if (rootStat.isSymbolicLink()) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Sandbox root cannot be a symbolic link or junction: ${lexicalRoot}`,
        lexicalRoot
      );
    }
    if (!rootStat.isDirectory()) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Sandbox root is not a directory: ${lexicalRoot}`,
        lexicalRoot
      );
    }
    rootExists = true;
    canonicalRoot = fs.realpathSync(lexicalRoot);
  } catch (err: any) {
    if (err instanceof SandboxError) throw err;
    if (err?.code !== 'ENOENT') {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Cannot resolve canonical sandbox root: ${lexicalRoot}`,
        lexicalRoot
      );
    }
  }

  return { lexicalRoot, canonicalRoot, rootExists };
}

function isWindowsAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p);
}

export function resolveAndValidateSandboxPathSync(
  rootDir: string,
  targetPath: string,
  options?: SandboxPathCheckOptions
): string {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) {
    throw new SandboxError('OUT_OF_BOUNDS', `Access denied: Invalid target path: ${String(targetPath)}`, String(targetPath));
  }

  const mode: SandboxOperationMode = options?.mode ?? 'read';
  const defaultAllowRootSelf = mode === 'read' || mode === 'list';
  const allowRootSelf = options?.allowRootSelf ?? defaultAllowRootSelf;

  const { lexicalRoot, canonicalRoot, rootExists } = validateSandboxRootSync(rootDir);

  if (process.platform !== 'win32' && isWindowsAbsolutePath(targetPath) && !isWindowsAbsolutePath(lexicalRoot)) {
    throw new SandboxError(
      'OUT_OF_BOUNDS',
      `Access denied: Windows absolute path is outside sandbox boundaries: ${targetPath}`,
      targetPath
    );
  }

  const lexicalTarget = path.isAbsolute(targetPath)
    ? path.normalize(path.resolve(targetPath))
    : path.resolve(lexicalRoot, targetPath);

  if (!isLexicallyInsideRoot(lexicalRoot, lexicalTarget, allowRootSelf)) {
    throw new SandboxError(
      'OUT_OF_BOUNDS',
      `Access denied: Path is outside sandbox boundaries: ${targetPath}`,
      lexicalTarget
    );
  }

  const relFromRoot = path.relative(lexicalRoot, lexicalTarget);
  const segments = relFromRoot ? relFromRoot.split(path.sep).filter(Boolean) : [];

  let currentLexical = lexicalRoot;
  let deepestExistingLexical: string | null = rootExists ? lexicalRoot : null;

  for (let i = 0; i < segments.length; i++) {
    currentLexical = path.join(currentLexical, segments[i]);
    const isLastSegment = i === segments.length - 1;
    try {
      const st = fs.lstatSync(currentLexical);
      if (st.isSymbolicLink()) {
        throw new SandboxError(
          'OUT_OF_BOUNDS',
          `Access denied: Symbolic link or junction detected in sandbox path: ${targetPath}`,
          currentLexical
        );
      }
      if (!isLastSegment && !st.isDirectory()) {
        throw new SandboxError(
          'OUT_OF_BOUNDS',
          `Access denied: Intermediate path component is not a directory: ${targetPath}`,
          currentLexical
        );
      }
      deepestExistingLexical = currentLexical;
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      if (err?.code === 'ENOENT') {
        break;
      }
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Cannot inspect path component "${currentLexical}" (${err?.code || 'STAT_ERROR'})`,
        currentLexical
      );
    }
  }

  if (deepestExistingLexical && rootExists) {
    let canonicalExisting: string;
    try {
      canonicalExisting = fs.realpathSync(deepestExistingLexical);
    } catch (err: any) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Failed to resolve canonical realpath for "${deepestExistingLexical}" (${err?.code || 'REALPATH_ERROR'})`,
        lexicalTarget
      );
    }

    if (!isLexicallyInsideRoot(canonicalRoot, canonicalExisting, true)) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Canonical path escapes sandbox root (reparse point / junction detected): ${targetPath}`,
        lexicalTarget
      );
    }

    const expectedRel = normalizeForPlatformCompare(path.relative(lexicalRoot, deepestExistingLexical));
    const actualCanonicalRel = normalizeForPlatformCompare(path.relative(canonicalRoot, canonicalExisting));
    if (expectedRel !== actualCanonicalRel) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Reparse point or mount redirection detected inside sandbox: ${targetPath}`,
        lexicalTarget
      );
    }

    const nonExistentSuffix = path.relative(deepestExistingLexical, lexicalTarget);
    const canonicalTarget = nonExistentSuffix
      ? path.resolve(canonicalExisting, nonExistentSuffix)
      : canonicalExisting;

    if (!isLexicallyInsideRoot(canonicalRoot, canonicalTarget, allowRootSelf)) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Canonical target path is outside sandbox boundaries: ${targetPath}`,
        lexicalTarget
      );
    }
  }

  return lexicalTarget;
}

export function isPathAllowedInRootsSync(
  roots: string[],
  targetPath: string,
  options?: SandboxPathCheckOptions
): boolean {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) {
    return false;
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    return false;
  }
  if (process.platform !== 'win32' && isWindowsAbsolutePath(targetPath)) {
    return false;
  }

  const resolvedTarget = path.resolve(targetPath);

  for (const candidateRoot of roots) {
    try {
      resolveAndValidateSandboxPathSync(candidateRoot, resolvedTarget, options);
      return true;
    } catch {
      // Try next allowed root
    }
  }
  return false;
}

export async function readFileNoFollow(fullPath: string): Promise<Buffer> {
  const st = await fsp.lstat(fullPath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new SandboxError('OUT_OF_BOUNDS', `Access denied: Target is not a regular file: ${fullPath}`, fullPath);
  }
  const noFollowFlag = typeof fs.constants?.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  if (noFollowFlag !== 0 && process.platform !== 'win32') {
    const handle = await fsp.open(fullPath, fs.constants.O_RDONLY | noFollowFlag);
    try {
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  return await fsp.readFile(fullPath);
}

export async function writeFileNoFollow(
  fullPath: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; mode?: number }
): Promise<void> {
  try {
    const st = await fsp.lstat(fullPath);
    if (st.isSymbolicLink() || st.isDirectory()) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Cannot overwrite symbolic link or directory: ${fullPath}`,
        fullPath
      );
    }
  } catch (err: any) {
    if (err instanceof SandboxError) throw err;
    if (err?.code !== 'ENOENT') throw err;
  }

  const noFollowFlag = typeof fs.constants?.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  if (noFollowFlag !== 0 && process.platform !== 'win32') {
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollowFlag;
    const handle = await fsp.open(fullPath, flags, options?.mode ?? 0o666);
    try {
      if (typeof data === 'string') {
        await handle.writeFile(data, { encoding: options?.encoding || 'utf8' });
      } else {
        await handle.writeFile(data);
      }
    } finally {
      await handle.close();
    }
    return;
  }

  if (typeof data === 'string') {
    await fsp.writeFile(fullPath, data, { encoding: options?.encoding || 'utf8', mode: options?.mode });
  } else {
    await fsp.writeFile(fullPath, data, { mode: options?.mode });
  }
}
