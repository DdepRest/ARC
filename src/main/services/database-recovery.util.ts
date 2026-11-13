import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DatabaseSafeModeError, type DatabaseHealthStatus, type DatabaseStatusMode,
  type IntegrityCheckNormalized, type OpenSqliteOptions, type OpenSqliteOutcome,
  type QuarantinedFileRecord, type QuarantineFsHooks, type QuarantineResult,
  type SqliteErrorCategory, type StoragePersistenceStatus
} from './database-recovery.types';

export {
  DatabaseSafeModeError, type DatabaseHealthStatus, type DatabaseStatusMode,
  type IntegrityCheckNormalized, type OpenSqliteOptions, type OpenSqliteOutcome,
  type QuarantinedFileRecord, type QuarantineFsHooks, type QuarantineResult,
  type SqliteErrorCategory, type StoragePersistenceStatus
};

export function normalizeIntegrityCheckResult(result: unknown): IntegrityCheckNormalized {
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (!trimmed) return { status: 'INVALID_FORMAT', details: 'Empty string returned from integrity_check' };
    return trimmed.toLowerCase() === 'ok' ? { status: 'OK', details: 'ok' } : { status: 'CORRUPT', details: trimmed };
  }

  if (Array.isArray(result)) {
    if (result.length === 0) return { status: 'INVALID_FORMAT', details: 'Empty array [] returned from integrity_check' };
    const extractedMessages: string[] = [];
    for (const item of result) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return { status: 'INVALID_FORMAT', details: JSON.stringify(result) };
        extractedMessages.push(trimmed);
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const key = Object.keys(record).find((k) => k.toLowerCase() === 'integrity_check' || k.toLowerCase() === 'quick_check');
        const rawVal = key ? record[key] : undefined;
        if (typeof rawVal !== 'string' || !rawVal.trim()) return { status: 'INVALID_FORMAT', details: JSON.stringify(result) };
        extractedMessages.push(rawVal.trim());
      } else {
        return { status: 'INVALID_FORMAT', details: JSON.stringify(result) };
      }
    }
    if (extractedMessages.length === 1 && extractedMessages[0].toLowerCase() === 'ok') {
      return { status: 'OK', details: 'ok' };
    }
    return { status: 'CORRUPT', details: extractedMessages.join('; ') };
  }

  return { status: 'INVALID_FORMAT', details: JSON.stringify(result) };
}

export function classifySqliteError(err: unknown): { category: SqliteErrorCategory; code: string; message: string } {
  const anyErr = err as Record<string, any> | undefined;
  const rawCode = typeof anyErr?.code === 'string' ? anyErr.code.toUpperCase() : '';
  const message = typeof anyErr?.message === 'string' ? anyErr.message : typeof err === 'string' ? err : String(err ?? 'Unknown database error');

  if (rawCode === 'SQLITE_INTEGRITY_FORMAT_ERROR') return { category: 'OTHER_ERROR', code: rawCode, message };
  if (rawCode === 'SQLITE_INTEGRITY_CORRUPT') return { category: 'CORRUPT_ERROR', code: rawCode, message };

  if (
    rawCode === 'EPERM' || rawCode === 'EACCES' || rawCode === 'EROFS' ||
    rawCode === 'SQLITE_PERM' || rawCode === 'SQLITE_READONLY' ||
    /operation not permitted|permission denied|access is denied|attempt to write a readonly database/i.test(message)
  ) {
    return { category: 'ACCESS_ERROR', code: rawCode || 'ACCESS_ERROR', message };
  }

  if (
    rawCode === 'EBUSY' || rawCode === 'SQLITE_BUSY' || rawCode === 'SQLITE_LOCKED' ||
    rawCode.startsWith('SQLITE_BUSY_') || rawCode.startsWith('SQLITE_LOCKED_') ||
    /database is locked|database table is locked|resource busy or locked/i.test(message)
  ) {
    return { category: 'LOCK_ERROR', code: rawCode || 'SQLITE_BUSY', message };
  }

  if (
    rawCode === 'SQLITE_CORRUPT' || rawCode === 'SQLITE_NOTADB' || rawCode.startsWith('SQLITE_CORRUPT_') ||
    /database disk image is malformed|file is not a database/i.test(message)
  ) {
    return { category: 'CORRUPT_ERROR', code: rawCode || 'SQLITE_CORRUPT', message };
  }

  return { category: 'OTHER_ERROR', code: rawCode || 'OTHER_ERROR', message };
}

function computeBufferSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function cleanupOrRollbackOrphanedStaging(dbPath: string, hooks?: QuarantineFsHooks): void {
  const fExists = hooks?.existsSync ?? fs.existsSync;
  const fRename = hooks?.renameSync ?? ((o: string, n: string) => fs.renameSync(o, n));
  const fUnlink = hooks?.unlinkSync ?? ((p: string) => fs.unlinkSync(p));
  for (const basePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    const stagingPath = `${basePath}.quarantine-staging`;
    try {
      if (!fExists(stagingPath)) continue;
      if (!fExists(basePath)) {
        fRename(stagingPath, basePath);
      } else {
        fUnlink(stagingPath);
      }
    } catch { /* ignore best-effort orphan cleanup */ }
  }
}

export function quarantineWalTriplet(
  dbPath: string, backupRootDir: string,
  errorInfo: { code: string; message: string }, hooks?: QuarantineFsHooks
): QuarantineResult {
  const fExists = hooks?.existsSync ?? fs.existsSync;
  const fMkdir = hooks?.mkdirSync ?? ((p: string, opts?: any) => fs.mkdirSync(p, opts));
  const fRead = hooks?.readFileSync ?? ((p: string) => fs.readFileSync(p));
  const fStat = hooks?.statSync ?? ((p: string) => fs.statSync(p));
  const fCopy = hooks?.copyFileSync ?? ((src: string, dest: string) => fs.copyFileSync(src, dest));
  const fRename = hooks?.renameSync ?? ((oldPath: string, newPath: string) => fs.renameSync(oldPath, newPath));
  const fWrite = hooks?.writeFileSync ?? ((p: string, d: string, enc: BufferEncoding) => fs.writeFileSync(p, d, enc));
  const fUnlink = hooks?.unlinkSync ?? ((p: string) => fs.unlinkSync(p));

  cleanupOrRollbackOrphanedStaging(dbPath, hooks);

  const tripletPaths = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const stagedEntries: Array<{ originalPath: string; stagingPath: string; fileName: string }> = [];

  const rollbackStagedFiles = () => {
    for (let i = stagedEntries.length - 1; i >= 0; i--) {
      const item = stagedEntries[i];
      try {
        if (fExists(item.stagingPath) && !fExists(item.originalPath)) fRename(item.stagingPath, item.originalPath);
      } catch { /* preserve staged file on disk if rollback rename fails */ }
    }
  };

  try {
    for (const candidate of tripletPaths) {
      if (fExists(candidate)) {
        const stagingPath = `${candidate}.quarantine-staging`;
        fRename(candidate, stagingPath);
        stagedEntries.push({ originalPath: candidate, stagingPath, fileName: path.basename(candidate) });
      }
    }
  } catch (stageErr: any) {
    rollbackStagedFiles();
    return {
      success: false, files: [],
      errorReason: `Staging capture failed (file locked or inaccessible): ${stageErr?.message || stageErr}`
    };
  }

  const sanitizedTs = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRootDir, `corrupted-${sanitizedTs}`);
  const verifiedFiles: QuarantinedFileRecord[] = [];

  try {
    if (!fExists(backupDir)) fMkdir(backupDir, { recursive: true });

    for (const staged of stagedEntries) {
      const srcStat = fStat(staged.stagingPath);
      const srcBuf = fRead(staged.stagingPath);
      if (srcBuf.length !== srcStat.size) {
        rollbackStagedFiles();
        return { success: false, backupDir, files: verifiedFiles, errorReason: `Staged size changed: "${staged.fileName}"` };
      }
      const srcHash = computeBufferSha256(srcBuf);
      const destPath = path.join(backupDir, staged.fileName);

      fCopy(staged.stagingPath, destPath);
      if (!fExists(destPath)) {
        rollbackStagedFiles();
        return { success: false, backupDir, files: verifiedFiles, errorReason: `Missing copy: "${destPath}"` };
      }
      const destStat = fStat(destPath);
      if (destStat.size !== srcStat.size) {
        rollbackStagedFiles();
        return {
          success: false, backupDir, files: verifiedFiles,
          errorReason: `Quarantine size mismatch for "${staged.fileName}": expected ${srcStat.size}, got ${destStat.size}`
        };
      }
      const destHash = computeBufferSha256(fRead(destPath));
      if (destHash !== srcHash) {
        rollbackStagedFiles();
        return {
          success: false, backupDir, files: verifiedFiles,
          errorReason: `Quarantine SHA-256 mismatch for "${staged.fileName}": expected ${srcHash}, got ${destHash}`
        };
      }
      verifiedFiles.push({
        fileName: staged.fileName, originalPath: staged.originalPath,
        quarantinePath: destPath, sizeBytes: srcStat.size, sha256: srcHash
      });
    }

    const manifestPath = path.join(backupDir, 'recovery-meta.json');
    const manifestPayload = JSON.stringify({
      timestamp: new Date().toISOString(), status: 'RECOVERED_FROM_CORRUPTION',
      originalDbPath: dbPath, errorCode: errorInfo.code, errorMessage: errorInfo.message, files: verifiedFiles
    }, null, 2);

    fWrite(manifestPath, manifestPayload, 'utf8');
    if (!fExists(manifestPath) || fStat(manifestPath).size <= 0) {
      rollbackStagedFiles();
      return { success: false, backupDir, files: verifiedFiles, errorReason: 'Failed to verify recovery-meta.json' };
    }

    for (const staged of stagedEntries) fUnlink(staged.stagingPath);
    return { success: true, backupDir, manifestPath, files: verifiedFiles };
  } catch (quarantineErr: any) {
    rollbackStagedFiles();
    return {
      success: false, backupDir, files: verifiedFiles,
      errorReason: `Quarantine aborted: ${quarantineErr?.message || quarantineErr}`
    };
  }
}

export function isReadOnlySql(sql: string): boolean {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  if (!cleaned) return true;

  if (/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(cleaned)) {
    return false;
  }

  const statements = cleaned.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    if (/^PRAGMA\b/i.test(stmt)) {
      if (stmt.includes('=')) return false;
      continue;
    }
    if (!/^(SELECT|WITH|EXPLAIN)\b/i.test(stmt)) {
      return false;
    }
  }
  return true;
}

export function isMutatingSql(sql: string): boolean {
  return !isReadOnlySql(sql);
}

function defaultSyncWait(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

function buildSafeModeHealth(
  dbPath: string, category: SqliteErrorCategory, code: string, message: string,
  userNotice: string, backupPath?: string, quarantined: boolean = false
): DatabaseHealthStatus {
  const now = new Date().toISOString();
  return {
    mode: 'DB_SAFE_MODE', isSafeMode: true, readOnly: true, storageStatus: 'VOLATILE_STORAGE',
    engine: 'json-safe-mode', dbPath, backupPath, errorCategory: category, errorCode: code,
    errorMessage: message, userNotice, timestamp: now,
    lastRecovery: { timestamp: now, reason: message, quarantined, backupDir: backupPath }
  };
}

export function openOrRecoverSqliteDatabase(options: OpenSqliteOptions): OpenSqliteOutcome {
  const {
    dbPath, backupRootDir, DatabaseClass,
    retryDelaysMs = [150, 400, 1000], waitFn = defaultSyncWait, fsHooks
  } = options;

  const maxAttempts = retryDelaysMs.length + 1;
  let lastClassified: { category: SqliteErrorCategory; code: string; message: string } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let instance: any = null;
    try {
      instance = new DatabaseClass(dbPath);
      try { instance.pragma('busy_timeout = 5000'); } catch { /* ignore */ }

      const normalized = normalizeIntegrityCheckResult(instance.pragma('integrity_check'));
      if (normalized.status === 'INVALID_FORMAT') {
        const fmtErr: any = new Error(`Unexpected SQLite integrity_check result format: ${normalized.details}`);
        fmtErr.code = 'SQLITE_INTEGRITY_FORMAT_ERROR';
        throw fmtErr;
      }
      if (normalized.status === 'CORRUPT') {
        const corruptErr: any = new Error(`SQLite integrity_check failed: ${normalized.details}`);
        corruptErr.code = 'SQLITE_INTEGRITY_CORRUPT';
        throw corruptErr;
      }
      try { instance.pragma('journal_mode = WAL'); } catch { /* ignore */ }

      return {
        instance,
        health: {
          mode: 'NORMAL', isSafeMode: false, readOnly: false,
          storageStatus: 'PERSISTENT_SQLITE', engine: 'sqlite',
          dbPath, timestamp: new Date().toISOString()
        }
      };
    } catch (err: unknown) {
      try { if (instance && typeof instance.close === 'function') instance.close(); } catch { /* ignore */ }
      const classified = classifySqliteError(err);
      lastClassified = classified;

      if (classified.category === 'LOCK_ERROR') {
        if (attempt < retryDelaysMs.length) {
          waitFn(retryDelaysMs[attempt]);
          continue;
        }
        return {
          instance: null,
          health: buildSafeModeHealth(
            dbPath, 'LOCK_ERROR', classified.code, classified.message,
            'База данных заблокирована другим процессом (LOCK_ERROR). Исходные файлы сохранены; активирован режим DB_SAFE_MODE (запись заблокирована).'
          )
        };
      }
      if (classified.category === 'ACCESS_ERROR') {
        return {
          instance: null,
          health: buildSafeModeHealth(
            dbPath, 'ACCESS_ERROR', classified.code, classified.message,
            'Ошибка прав доступа к файлу базы данных (ACCESS_ERROR). Исходные файлы не изменены; активирован режим DB_SAFE_MODE (запись заблокирована).'
          )
        };
      }
      if (classified.category === 'OTHER_ERROR') {
        return {
          instance: null,
          health: buildSafeModeHealth(
            dbPath, 'OTHER_ERROR', classified.code, classified.message,
            'Не удалось верифицировать базу данных (OTHER_ERROR). Исходные файлы сохранены; активирован режим DB_SAFE_MODE (запись заблокирована).'
          )
        };
      }

      const quarantine = quarantineWalTriplet(dbPath, backupRootDir, { code: classified.code, message: classified.message }, fsHooks);
      if (!quarantine.success) {
        return {
          instance: null,
          health: buildSafeModeHealth(
            dbPath, 'CORRUPT_ERROR', classified.code,
            `${classified.message} | Quarantine failed: ${quarantine.errorReason}`,
            'Обнаружено повреждение БД, но резервное копирование не удалось подтвердить. Исходные файлы сохранены; активирован режим DB_SAFE_MODE.',
            quarantine.backupDir, false
          )
        };
      }

      try {
        const cleanInstance = new DatabaseClass(dbPath);
        try {
          cleanInstance.pragma('busy_timeout = 5000');
          cleanInstance.pragma('journal_mode = WAL');
        } catch { /* ignore */ }
        const now = new Date().toISOString();
        return {
          instance: cleanInstance,
          health: {
            mode: 'RECOVERED_FROM_CORRUPTION', isSafeMode: false, readOnly: false,
            storageStatus: 'PERSISTENT_SQLITE', engine: 'sqlite', dbPath,
            backupPath: quarantine.backupDir, errorCategory: 'CORRUPT_ERROR',
            errorCode: classified.code, errorMessage: classified.message,
            userNotice: `База данных была восстановлена после повреждения (RECOVERED_FROM_CORRUPTION). Архивная копия сохранена в: ${quarantine.backupDir}`,
            timestamp: now,
            lastRecovery: { timestamp: now, reason: classified.message, quarantined: true, backupDir: quarantine.backupDir }
          }
        };
      } catch (recreateErr: unknown) {
        const recClassified = classifySqliteError(recreateErr);
        return {
          instance: null,
          health: buildSafeModeHealth(
            dbPath, recClassified.category, recClassified.code, recClassified.message,
            'Не удалось создать новую БД после перемещения повреждённых файлов в карантин. Активирован режим DB_SAFE_MODE.',
            quarantine.backupDir, true
          )
        };
      }
    }
  }

  return {
    instance: null,
    health: buildSafeModeHealth(
      dbPath, lastClassified?.category || 'OTHER_ERROR', lastClassified?.code || 'UNKNOWN',
      lastClassified?.message || 'Unknown error', 'Активирован диагностический режим DB_SAFE_MODE.'
    )
  };
}
