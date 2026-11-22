import fsp from 'fs/promises';
import { Stats } from 'fs';
import path from 'path';
import { SandboxError } from './types';
import { PolicyEngine } from './PolicyEngine';
import { approvalService } from '../approval.service';
import {
  readFileNoFollow,
  resolveAndValidateSandboxPathSync,
  validateSandboxRootSync,
  writeFileNoFollow,
  type SandboxOperationMode
} from './path-guard';
import {
  createSandboxBackupFile,
  recordSandboxOperation,
  resolveSandboxDecisionId
} from './sandbox-audit.helper';

export class SandboxedFS {
  public cachedDecisionId?: string;

  constructor(private rootDir: string, private objectiveId?: string, cachedDecisionId?: string) {
    this.rootDir = path.resolve(rootDir);
    validateSandboxRootSync(this.rootDir);
    if (cachedDecisionId) {
      this.cachedDecisionId = cachedDecisionId;
    }
  }

  public setDecisionId(id: string): void {
    this.cachedDecisionId = id;
  }

  /**
   * Resolves and validates that a path (and all its existing ancestors/target)
   * resides strictly within the canonical sandbox root without symlinks, junctions, or reparse points.
   * Throws OUT_OF_BOUNDS SandboxError if boundary escape or link traversal is detected.
   */
  public resolvePath(relativePath: string, mode: SandboxOperationMode = 'read', allowRootSelf?: boolean): string {
    return resolveAndValidateSandboxPathSync(this.rootDir, relativePath, { mode, allowRootSelf });
  }

  private async backupFile(fullPath: string): Promise<string> {
    return createSandboxBackupFile(fullPath, this.objectiveId);
  }

  private async resolveDecisionId(): Promise<string> {
    return resolveSandboxDecisionId(this.objectiveId, this.cachedDecisionId);
  }

  private async logOperation(type: string, targetPath: string, result?: any, inverse?: any): Promise<void> {
    const decisionId = await this.resolveDecisionId();
    await recordSandboxOperation(decisionId, this.objectiveId, type, targetPath, result, inverse);
  }

  // --- API PUBLIC Interface ---

  public async readFile(relativePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    const fullPath = this.resolvePath(relativePath, 'read', false);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read permission denied: ${policy.reason || 'by policies'}`, fullPath);
    }

    try {
      const revalidatedPath = this.resolvePath(relativePath, 'read', false);
      const data = await readFileNoFollow(revalidatedPath);
      await this.logOperation('read_file', revalidatedPath, { byteLength: data.length });
      return encoding ? data.toString(encoding) : data;
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `Failed reading file: ${err.message}`, fullPath);
    }
  }

  public async writeFile(
    relativePath: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; mode?: number; skipBackup?: boolean }
  ): Promise<void> {
    const fullPath = this.resolvePath(relativePath, 'write', false);
    const policy = PolicyEngine.evaluate('FILE_WRITE', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Write permission denied: ${policy.reason || 'by policies'}`, fullPath);
    }

    try {
      let backupPath = '';
      if (!options?.skipBackup) {
        backupPath = await this.backupFile(fullPath);
      }

      // Re-validate immediately before destructive write to close async TOCTOU window
      const verifiedTarget = this.resolvePath(relativePath, 'write', false);
      await writeFileNoFollow(verifiedTarget, data, { encoding: options?.encoding, mode: options?.mode });

      const inverse =
        !options?.skipBackup && backupPath
          ? {
              type: 'RESTORE',
              backupPath,
              originalPath: verifiedTarget
            }
          : undefined;

      await this.logOperation('write_file', verifiedTarget, { size: data.length }, inverse);
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `Writing file failed: ${err.message}`, fullPath);
    }
  }

  public async deleteFile(relativePath: string, options?: { skipBackup?: boolean }): Promise<void> {
    const fullPath = this.resolvePath(relativePath, 'delete', false);
    const policy = PolicyEngine.evaluate('FILE_DELETE', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Delete permission denied: ${policy.reason || 'by policies'}`, fullPath);
    }

    if (policy.requiresApproval) {
      const approved = await approvalService.requestApproval({
        actionType: 'FILE_DELETE',
        target: fullPath,
        reason: 'Запрос на удаление файла в песочнице'
      });
      if (!approved) {
        throw new SandboxError('PERMISSION_DENIED', 'Удаление отклонено пользователем', fullPath);
      }
    }

    try {
      // Re-validate after async user approval and before backup/unlink
      const postApprovalPath = this.resolvePath(relativePath, 'delete', false);
      let backupPath = '';
      if (!options?.skipBackup) {
        backupPath = await this.backupFile(postApprovalPath);
      }

      const verifiedTarget = this.resolvePath(relativePath, 'delete', false);
      const st = await fsp.lstat(verifiedTarget);
      if (st.isSymbolicLink() || st.isDirectory()) {
        throw new SandboxError('OUT_OF_BOUNDS', `Cannot delete symbolic link or directory via deleteFile: ${verifiedTarget}`, verifiedTarget);
      }
      await fsp.unlink(verifiedTarget);

      const inverse =
        !options?.skipBackup && backupPath
          ? {
              type: 'RESTORE',
              backupPath,
              originalPath: verifiedTarget
            }
          : undefined;

      await this.logOperation('delete_file', verifiedTarget, null, inverse);
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `Delete file operation failed: ${err.message}`, fullPath);
    }
  }

  public async rename(oldPath: string, newPath: string, options?: { skipBackup?: boolean }): Promise<void> {
    const fullOld = this.resolvePath(oldPath, 'rename', false);
    const fullNew = this.resolvePath(newPath, 'rename', false);

    const oldPolicy = PolicyEngine.evaluate('FILE_RENAME', fullOld, true);
    const newPolicy = PolicyEngine.evaluate('FILE_WRITE', fullNew, true);

    if (!oldPolicy.allowed || !newPolicy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', 'Rename transaction rejected by sandboxing policies', `${fullOld} -> ${fullNew}`);
    }

    if (oldPolicy.requiresApproval) {
      const approved = await approvalService.requestApproval({
        actionType: 'FILE_RENAME',
        target: `${fullOld} -> ${fullNew}`,
        reason: 'Запрос на переименование файла в песочнице'
      });
      if (!approved) {
        throw new SandboxError('PERMISSION_DENIED', 'Переименование отклонено пользователем', `${fullOld} -> ${fullNew}`);
      }
    }

    try {
      const recheckedOld = this.resolvePath(oldPath, 'rename', false);
      const recheckedNew = this.resolvePath(newPath, 'rename', false);

      if (!options?.skipBackup) {
        await this.backupFile(recheckedOld);
        await this.backupFile(recheckedNew);
      }

      const finalOld = this.resolvePath(oldPath, 'rename', false);
      const finalNew = this.resolvePath(newPath, 'rename', false);
      await fsp.rename(finalOld, finalNew);

      const inverse = !options?.skipBackup
        ? {
            type: 'RENAME_BACK',
            originalPath: finalOld,
            currentPath: finalNew
          }
        : undefined;

      await this.logOperation('rename', finalOld, { destination: finalNew }, inverse);
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `Rename operation failed: ${err.message}`, `${fullOld} -> ${fullNew}`);
    }
  }

  public async mkdir(relativePath: string, options?: { recursive?: boolean }): Promise<void> {
    const fullPath = this.resolvePath(relativePath, 'write', true);
    const policy = PolicyEngine.evaluate('FILE_WRITE', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Write directory structure denied by policy: ${fullPath}`, fullPath);
    }

    try {
      const verifiedPath = this.resolvePath(relativePath, 'write', true);
      await fsp.mkdir(verifiedPath, { recursive: options?.recursive !== false });
      this.resolvePath(relativePath, 'read', true);
      await this.logOperation('mkdir', verifiedPath);
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `mkdir command failed: ${err.message}`, fullPath);
    }
  }

  public async readdir(relativePath: string): Promise<string[]> {
    const fullPath = this.resolvePath(relativePath, 'list', true);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read directory structure denied: ${fullPath}`, fullPath);
    }

    try {
      const verifiedPath = this.resolvePath(relativePath, 'list', true);
      const list = await fsp.readdir(verifiedPath);
      await this.logOperation('readdir', verifiedPath, { count: list.length });
      return list;
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `readdir command failed: ${err.message}`, fullPath);
    }
  }

  public async stat(relativePath: string): Promise<Stats> {
    const fullPath = this.resolvePath(relativePath, 'read', true);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read stats permission denied: ${fullPath}`, fullPath);
    }

    try {
      const verifiedPath = this.resolvePath(relativePath, 'read', true);
      const details = await fsp.lstat(verifiedPath);
      if (details.isSymbolicLink()) {
        throw new SandboxError('OUT_OF_BOUNDS', `Access denied: Symbolic link target in stat: ${verifiedPath}`, verifiedPath);
      }
      return details as any;
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `Accessing file stats failed: ${err.message}`, fullPath);
    }
  }

  public async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(relativePath, 'read', true);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read exists check denied: ${fullPath}`, fullPath);
    }

    try {
      const verifiedPath = this.resolvePath(relativePath, 'read', true);
      const st = await fsp.lstat(verifiedPath);
      return !st.isSymbolicLink();
    } catch {
      return false;
    }
  }

  public async copyFile(src: string, dest: string, options?: { skipBackup?: boolean }): Promise<void> {
    const fullSrc = this.resolvePath(src, 'read', false);
    const fullDest = this.resolvePath(dest, 'copy', false);

    const srcPolicy = PolicyEngine.evaluate('FILE_READ', fullSrc, true);
    const destPolicy = PolicyEngine.evaluate('FILE_WRITE', fullDest, true);

    if (!srcPolicy.allowed || !destPolicy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', 'Forbidden copy transaction between nodes', `${fullSrc} -> ${fullDest}`);
    }

    try {
      let backupPath = '';
      let existed = false;
      try {
        const dstStat = await fsp.lstat(fullDest);
        if (dstStat.isSymbolicLink()) {
          throw new SandboxError('OUT_OF_BOUNDS', `Access denied: Destination is a symbolic link: ${fullDest}`, fullDest);
        }
        existed = true;
      } catch (e: any) {
        if (e instanceof SandboxError) throw e;
      }

      if (!options?.skipBackup && existed) {
        backupPath = await this.backupFile(fullDest);
      }

      const finalSrc = this.resolvePath(src, 'read', false);
      const finalDest = this.resolvePath(dest, 'copy', false);
      const srcData = await readFileNoFollow(finalSrc);
      await writeFileNoFollow(finalDest, srcData);

      let inverse: any = undefined;
      if (!options?.skipBackup) {
        if (existed && backupPath) {
          inverse = { type: 'RESTORE', backupPath, originalPath: finalDest };
        } else if (!existed) {
          inverse = { type: 'DELETE', originalPath: finalDest };
        }
      }

      await this.logOperation('copy_file', finalSrc, { destination: finalDest }, inverse);
    } catch (err: any) {
      if (err instanceof SandboxError) throw err;
      throw new SandboxError('OPERATION_FAILED', `File clone execution failed: ${err.message}`, `${fullSrc} -> ${fullDest}`);
    }
  }
}
