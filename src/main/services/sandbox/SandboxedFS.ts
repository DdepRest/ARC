import fsp from 'fs/promises';
import { Stats } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { SandboxError, ActionType } from './types';
import { PolicyEngine } from './PolicyEngine';
import { approvalService } from '../approval.service';
import { DatabaseService } from '../database';
import { DecisionEngine } from '../decision/DecisionEngine';

export class SandboxedFS {
  public cachedDecisionId?: string;

  constructor(private rootDir: string, private objectiveId?: string, cachedDecisionId?: string) {
    // Normalise the sandbox root absolute path
    this.rootDir = path.resolve(rootDir);
    if (cachedDecisionId) {
      this.cachedDecisionId = cachedDecisionId;
    }
  }

  public setDecisionId(id: string): void {
    this.cachedDecisionId = id;
  }

  /**
   * Helper: Resolves and checks if a path resides strictly within the root sandbox directory.
   * Throws OUT_OF_BOUNDS SandboxError if path traversal is detected.
   */
  public resolvePath(relativePath: string): string {
    let resolved: string;
    if (path.isAbsolute(relativePath)) {
      resolved = path.normalize(relativePath);
    } else {
      resolved = path.resolve(this.rootDir, relativePath);
    }

    const relative = path.relative(this.rootDir, resolved);

    // If the path tries to climb outside rootDir
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Access denied: Path is outside sandbox boundaries: ${relativePath}`,
        resolved
      );
    }

    return resolved;
  }

  /**
   * Creates a backup copy of the target file under ~/.arc/backups/{objectiveId}/{timestamp}_{filename}.bak
   * Returns the absolute path of the created backup file, or an empty string if file doesn't exist.
   */
  private async backupFile(fullPath: string): Promise<string> {
    try {
      const exists = await fsp.stat(fullPath).then(() => true).catch(() => false);
      if (!exists) {
        return '';
      }

      const home = os.homedir();
      const backupDir = path.join(home, '.arc', 'backups', this.objectiveId || 'global');
      await fsp.mkdir(backupDir, { recursive: true });

      const filename = path.basename(fullPath);
      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `${timestamp}_${filename}.bak`);

      // Copy file content asynchronously
      await fsp.copyFile(fullPath, backupPath);
      console.log(`[SandboxedFS] [Backup SUCCESS] ${fullPath} backed up to ${backupPath}`);
      return backupPath;
    } catch (err: any) {
      throw new SandboxError(
        'BACKUP_FAILED',
        `System failed to create reserve backup for ${fullPath}: ${err.message}`,
        fullPath
      );
    }
  }

  /**
   * Finds or provisions a decision_id to guarantee SQLite schema integrity.
   */
  private async resolveDecisionId(): Promise<string> {
    if (this.cachedDecisionId) {
      return this.cachedDecisionId;
    }

    if (!DatabaseService.db) {
      return 'global-sandbox-decision';
    }

    if (this.objectiveId) {
      try {
        const decisions = DecisionEngine.getInstance().getDecisionsByObjective(this.objectiveId);
        const activeDecision = decisions.find(
          d => d.status === 'APPROVED' || d.status === 'EXECUTING' || d.status === 'PENDING'
        );
        if (activeDecision) {
          return activeDecision.id;
        }

        const newDecision = DecisionEngine.getInstance().createDecision(
          this.objectiveId,
          'Sandbox Autonomous FS Execution',
          `Auto-generated sandbox logger for objective ${this.objectiveId}`,
          'EXECUTIVE'
        );
        DecisionEngine.getInstance().updateDecisionStatus(newDecision.id, 'EXECUTING');
        return newDecision.id;
      } catch (e) {
        console.warn('[SandboxedFS] Error querying decision, falling back to global tracker:', e);
      }
    }

    const globalId = 'global-sandbox-decision';
    try {
      const existing = DecisionEngine.getInstance().getDecision(globalId);
      if (!existing) {
        DatabaseService.db.prepare(`
          INSERT INTO arc_decisions (id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight)
          VALUES (?, NULL, ?, 'EXECUTING', ?, ?, ?, 'EXECUTIVE', 1.0)
        `).run(
          globalId,
          'Global Sandbox Operation Tracker',
          'Systemic tracking decision for file sandbox operations outside objective context',
          Date.now(),
          Date.now()
        );
      }
    } catch (err) {
      console.error('[SandboxedFS] Failed to secure global-sandbox-decision node:', err);
    }
    return globalId;
  }

  /**
   * Logs file operations to SQLite (arc_actions / arc_artifacts) and a physical file log.
   */
  private async logOperation(type: string, targetPath: string, result?: any, inverse?: any): Promise<void> {
    try {
      const decisionId = await this.resolveDecisionId();
      const actionType = `SANDBOX_${type.toUpperCase()}`;
      const params = { path: targetPath, objectiveId: this.objectiveId || 'GLOBAL' };

      if (DatabaseService.db) {
        const action = DecisionEngine.getInstance().createAction(decisionId, actionType, params);
        
        // If we have an inverse object, save it to the action record
        if (inverse) {
          try {
            DatabaseService.db.prepare('UPDATE arc_actions SET inverse = ? WHERE id = ?').run(JSON.stringify(inverse), action.id);
          } catch (e) {
            console.warn('[SandboxedFS] Failed to set inverse field on action:', e);
          }
        }

        DecisionEngine.getInstance().updateActionStatus(action.id, 'SUCCESS', result || { success: true });

        // If write/copy/rename, generate SHA256 context artifact
        if (['write_file', 'copy_file', 'rename'].includes(type)) {
          let fileHash: string | null = null;
          try {
            const content = await fsp.readFile(targetPath);
            fileHash = createHash('sha256').update(content).digest('hex');
          } catch (e) {
            // ignore error
          
        console.warn('[A.R.C] Handled silent error:', e);
    }
          DecisionEngine.getInstance().createArtifact(
            action.id,
            `file://${targetPath}`,
            'SOURCE_CODE',
            fileHash
          );
        }
      }

      // Record to home operations log
      const home = os.homedir();
      const logDir = path.join(home, '.arc', 'logs');
      await fsp.mkdir(logDir, { recursive: true });

      const logPath = path.join(logDir, 'sandbox_operations.log');
      const logLine = `[${new Date().toISOString()}] [${this.objectiveId || 'GLOBAL'}] [DECISION:${decisionId}] [${type.toUpperCase()}] ${targetPath} - Result: ${JSON.stringify(result || 'SUCCESS')}\n`;
      await fsp.appendFile(logPath, logLine, 'utf8');
    } catch (err) {
      console.warn('[SandboxedFS] Database or local file logging failed:', err);
    }
  }

  // --- API PUBLIC Interface ---

  public async readFile(relativePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    const fullPath = this.resolvePath(relativePath);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read permission denied: ${policy.reason || 'by policies'}`, fullPath);
    }

    try {
      const data = await fsp.readFile(fullPath);
      await this.logOperation('read_file', fullPath, { byteLength: data.length });
      return encoding ? data.toString(encoding) : data;
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `Failed reading file: ${err.message}`, fullPath);
    }
  }

  public async writeFile(relativePath: string, data: string | Buffer, options?: { encoding?: BufferEncoding; mode?: number; skipBackup?: boolean }): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const policy = PolicyEngine.evaluate('FILE_WRITE', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Write permission denied: ${policy.reason || 'by policies'}`, fullPath);
    }

    try {
      // 1. Create a safe backup first unless skipBackup is enabled
      let backupPath = '';
      if (!options?.skipBackup) {
        backupPath = await this.backupFile(fullPath);
      }

      // 2. Write file
      if (typeof data === 'string') {
        await fsp.writeFile(fullPath, data, { encoding: options?.encoding || 'utf8', mode: options?.mode });
      } else {
        await fsp.writeFile(fullPath, data, { mode: options?.mode });
      }

      // Maintain rollback parameters
      const inverse = (!options?.skipBackup && backupPath) ? {
        type: 'RESTORE',
        backupPath,
        originalPath: fullPath
      } : undefined;

      await this.logOperation('write_file', fullPath, { size: data.length }, inverse);
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `Writing file failed: ${err.message}`, fullPath);
    }
  }

  public async deleteFile(relativePath: string, options?: { skipBackup?: boolean }): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
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
      let backupPath = '';
      if (!options?.skipBackup) {
        backupPath = await this.backupFile(fullPath);
      }
      await fsp.unlink(fullPath);

      const inverse = (!options?.skipBackup && backupPath) ? {
        type: 'RESTORE',
        backupPath,
        originalPath: fullPath
      } : undefined;

      await this.logOperation('delete_file', fullPath, null, inverse);
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `Delete file operation failed: ${err.message}`, fullPath);
    }
  }

  public async rename(oldPath: string, newPath: string, options?: { skipBackup?: boolean }): Promise<void> {
    const fullOld = this.resolvePath(oldPath);
    const fullNew = this.resolvePath(newPath);

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
      if (!options?.skipBackup) {
        await this.backupFile(fullOld);
        await this.backupFile(fullNew); // backup destination if it already existed
      }

      await fsp.rename(fullOld, fullNew);

      const inverse = !options?.skipBackup ? {
        type: 'RENAME_BACK',
        originalPath: fullOld,
        currentPath: fullNew
      } : undefined;

      await this.logOperation('rename', fullOld, { destination: fullNew }, inverse);
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `Rename operation failed: ${err.message}`, `${fullOld} -> ${fullNew}`);
    }
  }

  public async mkdir(relativePath: string, options?: { recursive?: boolean }): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const policy = PolicyEngine.evaluate('FILE_WRITE', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Write directory structure denied by policy: ${fullPath}`, fullPath);
    }

    try {
      await fsp.mkdir(fullPath, { recursive: options?.recursive !== false });
      await this.logOperation('mkdir', fullPath);
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `mkdir command failed: ${err.message}`, fullPath);
    }
  }

  public async readdir(relativePath: string): Promise<string[]> {
    const fullPath = this.resolvePath(relativePath);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read directory structure denied: ${fullPath}`, fullPath);
    }

    try {
      const list = await fsp.readdir(fullPath);
      await this.logOperation('readdir', fullPath, { count: list.length });
      return list;
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `readdir command failed: ${err.message}`, fullPath);
    }
  }

  public async stat(relativePath: string): Promise<Stats> {
    const fullPath = this.resolvePath(relativePath);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read stats permission denied: ${fullPath}`, fullPath);
    }

    try {
      const details = await fsp.stat(fullPath);
      // Stats objects can be cast directly
      return details as any;
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `Accessing file stats failed: ${err.message}`, fullPath);
    }
  }

  public async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(relativePath);
    const policy = PolicyEngine.evaluate('FILE_READ', fullPath, true);
    if (!policy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', `Read exists check denied: ${fullPath}`, fullPath);
    }

    try {
      return await fsp.stat(fullPath).then(() => true).catch(() => false);
    } catch (err: any) {
      return false;
    }
  }

  public async copyFile(src: string, dest: string, options?: { skipBackup?: boolean }): Promise<void> {
    const fullSrc = this.resolvePath(src);
    const fullDest = this.resolvePath(dest);

    const srcPolicy = PolicyEngine.evaluate('FILE_READ', fullSrc, true);
    const destPolicy = PolicyEngine.evaluate('FILE_WRITE', fullDest, true);

    if (!srcPolicy.allowed || !destPolicy.allowed) {
      throw new SandboxError('PERMISSION_DENIED', 'Forbidden copy transaction between nodes', `${fullSrc} -> ${fullDest}`);
    }

    try {
      let backupPath = '';
      let existed = false;
      try {
        await fsp.access(fullDest);
        existed = true;
      } catch (e) { console.warn('Ignored error in catch', e); }

      if (!options?.skipBackup && existed) {
        backupPath = await this.backupFile(fullDest);
      }

      await fsp.copyFile(fullSrc, fullDest);

      let inverse: any = undefined;
      if (!options?.skipBackup) {
        if (existed && backupPath) {
          inverse = {
            type: 'RESTORE',
            backupPath,
            originalPath: fullDest
          };
        } else if (!existed) {
          inverse = {
            type: 'DELETE',
            originalPath: fullDest
          };
        }
      }

      await this.logOperation('copy_file', fullSrc, { destination: fullDest }, inverse);
    } catch (err: any) {
      throw new SandboxError('OPERATION_FAILED', `File clone execution failed: ${err.message}`, `${fullSrc} -> ${fullDest}`);
    }
  }
}
