import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { SandboxError } from './types';
import { DatabaseService } from '../database';
import { DecisionEngine } from '../decision/DecisionEngine';

export async function createSandboxBackupFile(fullPath: string, objectiveId?: string): Promise<string> {
  try {
    const lstat = await fsp.lstat(fullPath).catch(() => null);
    if (!lstat) {
      return '';
    }
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      throw new SandboxError(
        'OUT_OF_BOUNDS',
        `Refusing to back up symbolic link or non-regular file: ${fullPath}`,
        fullPath
      );
    }

    const home = os.homedir();
    const backupDir = path.join(home, '.arc', 'backups', objectiveId || 'global');
    await fsp.mkdir(backupDir, { recursive: true });

    const filename = path.basename(fullPath);
    const timestamp = Date.now();
    const backupPath = path.join(backupDir, `${timestamp}_${filename}.bak`);

    await fsp.copyFile(fullPath, backupPath);
    console.log(`[SandboxedFS] [Backup SUCCESS] ${fullPath} backed up to ${backupPath}`);
    return backupPath;
  } catch (err: any) {
    if (err instanceof SandboxError) throw err;
    throw new SandboxError(
      'BACKUP_FAILED',
      `System failed to create reserve backup for ${fullPath}: ${err.message}`,
      fullPath
    );
  }
}

export async function resolveSandboxDecisionId(
  objectiveId?: string,
  cachedDecisionId?: string
): Promise<string> {
  if (cachedDecisionId) {
    return cachedDecisionId;
  }

  if (!DatabaseService.db) {
    return 'global-sandbox-decision';
  }

  if (objectiveId) {
    try {
      const decisions = DecisionEngine.getInstance().getDecisionsByObjective(objectiveId);
      const activeDecision = decisions.find(
        (d) => d.status === 'APPROVED' || d.status === 'EXECUTING' || d.status === 'PENDING'
      );
      if (activeDecision) {
        return activeDecision.id;
      }

      const newDecision = DecisionEngine.getInstance().createDecision(
        objectiveId,
        'Sandbox Autonomous FS Execution',
        `Auto-generated sandbox logger for objective ${objectiveId}`,
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
      DatabaseService.db
        .prepare(
          `
          INSERT INTO arc_decisions (id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight)
          VALUES (?, NULL, ?, 'EXECUTING', ?, ?, ?, 'EXECUTIVE', 1.0)
        `
        )
        .run(
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

export async function recordSandboxOperation(
  decisionId: string,
  objectiveId: string | undefined,
  type: string,
  targetPath: string,
  result?: any,
  inverse?: any
): Promise<void> {
  try {
    const actionType = `SANDBOX_${type.toUpperCase()}`;
    const params = { path: targetPath, objectiveId: objectiveId || 'GLOBAL' };

    if (DatabaseService.db) {
      const action = DecisionEngine.getInstance().createAction(decisionId, actionType, params);

      if (inverse) {
        try {
          DatabaseService.db
            .prepare('UPDATE arc_actions SET inverse = ? WHERE id = ?')
            .run(JSON.stringify(inverse), action.id);
        } catch (e) {
          console.warn('[SandboxedFS] Failed to set inverse field on action:', e);
        }
      }

      DecisionEngine.getInstance().updateActionStatus(action.id, 'SUCCESS', result || { success: true });

      if (['write_file', 'copy_file', 'rename'].includes(type)) {
        let fileHash: string | null = null;
        try {
          const content = await fsp.readFile(targetPath);
          fileHash = createHash('sha256').update(content).digest('hex');
        } catch (e) {
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

    const home = os.homedir();
    const logDir = path.join(home, '.arc', 'logs');
    await fsp.mkdir(logDir, { recursive: true });

    const logPath = path.join(logDir, 'sandbox_operations.log');
    const logLine = `[${new Date().toISOString()}] [${objectiveId || 'GLOBAL'}] [DECISION:${decisionId}] [${type.toUpperCase()}] ${targetPath} - Result: ${JSON.stringify(result || 'SUCCESS')}\n`;
    await fsp.appendFile(logPath, logLine, 'utf8');
  } catch (err) {
    console.warn('[SandboxedFS] Database or local file logging failed:', err);
  }
}
