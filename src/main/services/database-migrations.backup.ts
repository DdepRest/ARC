import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { normalizeIntegrityCheckResult } from './database-recovery.util';

export interface MigrationBackupHooks {
  createSnapshot?: (backupFilePath: string) => void;
  verifySnapshot?: (backupFilePath: string, expectedVersion: number) => void;
}

export interface CreateBackupParams {
  db: any;
  dbPath: string;
  backupRootDir: string;
  DatabaseClass?: any;
  fromVersion: number;
  targetVersion: number;
  expectedAuditCount: number;
  backupHooks?: MigrationBackupHooks;
}

export interface VerifiedBackupResult {
  backupDir: string;
  backupFile: string;
  backupSha256: string;
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function hasExistingUserObjects(db: any): boolean {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view', 'trigger') AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'"
    )
    .all() as Array<{ name?: string }>;
  return Array.isArray(rows) && rows.length > 0;
}

export function verifySourceIntegrity(db: any): void {
  const normalized = normalizeIntegrityCheckResult(db.pragma('integrity_check'));
  if (normalized.status !== 'OK') {
    throw new Error(`Source DB integrity_check failed before backup: ${normalized.details}`);
  }
}

export function createAndVerifyPreMigrationBackup(
  params: CreateBackupParams
): VerifiedBackupResult {
  const {
    db,
    dbPath,
    backupRootDir,
    DatabaseClass,
    fromVersion,
    targetVersion,
    expectedAuditCount,
    backupHooks
  } = params;

  verifySourceIntegrity(db);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(
    backupRootDir,
    `pre-migration-v${fromVersion}-to-v${targetVersion}-${ts}`
  );
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, path.basename(dbPath) || 'arc.db');

  if (backupHooks?.createSnapshot) {
    backupHooks.createSnapshot(backupFile);
  } else {
    const escapedPath = backupFile.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);
  }

  if (!fs.existsSync(backupFile)) {
    throw new Error(`Pre-migration backup file was not created: ${backupFile}`);
  }
  const stat = fs.statSync(backupFile);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Pre-migration backup file is empty: ${backupFile}`);
  }

  if (backupHooks?.verifySnapshot) {
    backupHooks.verifySnapshot(backupFile, fromVersion);
  } else {
    const VerifierCtor =
      DatabaseClass ||
      (typeof db.constructor === 'function' && db.constructor.name !== 'JSONDatabase'
        ? db.constructor
        : null);
    if (!VerifierCtor) {
      throw new Error('No SQLite constructor available to verify pre-migration backup snapshot');
    }

    let verifyDb: any = null;
    try {
      verifyDb = new VerifierCtor(backupFile, { readonly: true, fileMustExist: true });
      const check = normalizeIntegrityCheckResult(verifyDb.pragma('integrity_check'));
      if (check.status !== 'OK') {
        throw new Error(`Backup integrity_check failed: ${check.details}`);
      }
      const backupUv = Number(verifyDb.pragma('user_version', { simple: true }));
      if (!Number.isInteger(backupUv) || backupUv !== fromVersion) {
        throw new Error(
          `Backup user_version mismatch: expected ${fromVersion}, got ${String(backupUv)}`
        );
      }
      if (expectedAuditCount > 0) {
        const countRow = verifyDb
          .prepare('SELECT COUNT(*) as n FROM schema_migrations')
          .get() as { n?: number } | undefined;
        const backupAuditCount = Number(countRow?.n ?? 0);
        if (backupAuditCount !== expectedAuditCount) {
          throw new Error(
            `Backup schema_migrations count mismatch: expected ${expectedAuditCount}, got ${backupAuditCount}`
          );
        }
      }
    } finally {
      try {
        if (verifyDb && typeof verifyDb.close === 'function') verifyDb.close();
      } catch {
        // ignore close failure
      }
    }
  }

  const backupSha256 = sha256File(backupFile);
  const metaPath = path.join(backupDir, 'migration-backup-meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        sourceDbPath: dbPath,
        backupFile,
        fromVersion,
        targetVersion,
        sizeBytes: stat.size,
        sha256: backupSha256,
        integrityCheck: 'ok',
        expectedAuditCount
      },
      null,
      2
    ),
    'utf8'
  );

  return { backupDir, backupFile, backupSha256 };
}
