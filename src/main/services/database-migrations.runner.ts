import fs from 'fs';
import path from 'path';
import type { DatabaseMigrationStatus } from './database-recovery.types';
import {
  CORE_EMPTY_SCHEMA_DDL,
  DATABASE_MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  type MigrationDefinition
} from './database-migrations.registry';
import {
  createAndVerifyPreMigrationBackup,
  hasExistingUserObjects,
  type MigrationBackupHooks
} from './database-migrations.backup';
import {
  SCHEMA_MIGRATIONS_DDL,
  validateMigrationState
} from './database-migrations.validation';

export type { MigrationBackupHooks };

export interface MigrationRunnerOptions {
  dbPath: string;
  backupRootDir?: string;
  DatabaseClass?: any;
  migrations?: readonly MigrationDefinition[];
  beforeMigrationStep?: (migration: MigrationDefinition) => void;
  backupHooks?: MigrationBackupHooks;
}

export interface MigrationRunResult {
  ok: boolean;
  status: DatabaseMigrationStatus;
}

function runJsonDatabaseMigrations(
  db: any,
  migrations: readonly MigrationDefinition[]
): MigrationRunResult {
  const validation = validateMigrationState(db, migrations);
  if ('status' in validation) return { ok: false, status: validation.status };

  const { userVersion, targetVersion, appliedMigrations } = validation;
  const appliedSet = new Set(appliedMigrations.map((r) => r.version));
  const pending = migrations.filter((m) => m.version > userVersion && !appliedSet.has(m.version));
  if (pending.length === 0) {
    return {
      ok: true,
      status: {
        status: 'CURRENT',
        fromVersion: userVersion,
        currentVersion: userVersion,
        targetVersion,
        appliedMigrations,
        appliedInRun: []
      }
    };
  }

  let currentVersion = userVersion;
  const appliedInRun: number[] = [];
  db.exec(SCHEMA_MIGRATIONS_DDL);
  for (const def of pending) {
    const startMs = Date.now();
    def.up(db);
    const appliedAt = new Date().toISOString();
    const executionMs = Math.max(0, Date.now() - startMs);
    db.prepare(
      'INSERT INTO schema_migrations (version, id, name, checksum, applied_at, execution_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(def.version, def.id, def.name, def.checksum, appliedAt, executionMs, 'APPLIED');
    db.pragma(`user_version = ${def.version}`);
    currentVersion = def.version;
    appliedInRun.push(def.version);
    appliedMigrations.push({
      version: def.version,
      id: def.id,
      name: def.name,
      checksum: def.checksum,
      appliedAt,
      executionMs,
      status: 'APPLIED'
    });
  }

  return {
    ok: true,
    status: {
      status: 'MIGRATED',
      fromVersion: userVersion,
      currentVersion,
      targetVersion,
      appliedMigrations,
      appliedInRun
    }
  };
}

export function runDatabaseMigrations(
  db: any,
  options: MigrationRunnerOptions
): MigrationRunResult {
  const migrations = options.migrations ?? DATABASE_MIGRATIONS;
  const targetVersion =
    migrations.length > 0 ? migrations[migrations.length - 1].version : LATEST_SCHEMA_VERSION;

  if (db?.isJsonDatabase) {
    return runJsonDatabaseMigrations(db, migrations);
  }

  const probeUserVersion = db.pragma('user_version', { simple: true });
  if (typeof probeUserVersion !== 'number') {
    try {
      db.exec(CORE_EMPTY_SCHEMA_DDL);
      return {
        ok: true,
        status: {
          status: 'SKIPPED',
          fromVersion: 0,
          currentVersion: targetVersion,
          targetVersion,
          appliedMigrations: [],
          appliedInRun: []
        }
      };
    } catch (err: any) {
      return {
        ok: false,
        status: {
          status: 'FAILED',
          fromVersion: 0,
          currentVersion: 0,
          targetVersion,
          appliedMigrations: [],
          appliedInRun: [],
          errorCode: 'SQLITE_MIGRATION_FAILED',
          errorMessage: err?.message || String(err)
        }
      };
    }
  }

  const validation = validateMigrationState(db, migrations);
  if ('status' in validation) return { ok: false, status: validation.status };

  const { userVersion, appliedMigrations } = validation;
  const appliedSet = new Set(appliedMigrations.map((r) => r.version));
  const pending = migrations.filter((m) => m.version > userVersion && !appliedSet.has(m.version));

  if (pending.length === 0) {
    return {
      ok: true,
      status: {
        status: 'CURRENT',
        fromVersion: userVersion,
        currentVersion: userVersion,
        targetVersion,
        appliedMigrations,
        appliedInRun: []
      }
    };
  }

  let backupInfo: { backupDir: string; backupFile: string; backupSha256: string } | undefined;
  const isFileDb = Boolean(
    options.dbPath && options.dbPath !== ':memory:' && fs.existsSync(options.dbPath)
  );
  const isNonEmpty = isFileDb && (userVersion > 0 || hasExistingUserObjects(db));

  if (isFileDb && isNonEmpty) {
    const backupRootDir =
      options.backupRootDir ||
      path.join(path.dirname(path.dirname(options.dbPath)), 'backups');
    try {
      backupInfo = createAndVerifyPreMigrationBackup({
        db,
        dbPath: options.dbPath,
        backupRootDir,
        DatabaseClass: options.DatabaseClass,
        fromVersion: userVersion,
        targetVersion,
        expectedAuditCount: appliedMigrations.length,
        backupHooks: options.backupHooks
      });
    } catch (backupErr: any) {
      return {
        ok: false,
        status: {
          status: 'BACKUP_FAILED',
          fromVersion: userVersion,
          currentVersion: userVersion,
          targetVersion,
          appliedMigrations,
          appliedInRun: [],
          errorCode: 'SQLITE_MIGRATION_BACKUP_FAILED',
          errorMessage: backupErr?.message || String(backupErr)
        }
      };
    }
  }

  let currentVersion = userVersion;
  const appliedInRun: number[] = [];

  for (const def of pending) {
    let prevFk: number | null = null;
    if (def.requiresForeignKeysOff) {
      try {
        prevFk = Number(db.pragma('foreign_keys', { simple: true }) ?? 1);
        db.pragma('foreign_keys = OFF');
      } catch {
        prevFk = null;
      }
    }

    try {
      const startMs = Date.now();
      db.exec('BEGIN IMMEDIATE');
      db.exec(SCHEMA_MIGRATIONS_DDL);

      const existing = db
        .prepare('SELECT version FROM schema_migrations WHERE version = ?')
        .get(def.version) as { version?: number } | undefined;
      if (existing?.version !== undefined) {
        throw new Error(`Migration v${def.version} (${def.id}) is already recorded in schema_migrations.`);
      }

      def.up(db);
      if (options.beforeMigrationStep) {
        options.beforeMigrationStep(def);
      }

      const appliedAt = new Date().toISOString();
      const executionMs = Math.max(0, Date.now() - startMs);
      db.prepare(
        'INSERT INTO schema_migrations (version, id, name, checksum, applied_at, execution_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(def.version, def.id, def.name, def.checksum, appliedAt, executionMs, 'APPLIED');

      db.pragma(`user_version = ${def.version}`);
      const verifiedUv = Number(db.pragma('user_version', { simple: true }));
      if (verifiedUv !== def.version) {
        throw new Error(
          `Failed to update PRAGMA user_version to ${def.version} (got ${verifiedUv}).`
        );
      }

      db.exec('COMMIT');

      currentVersion = def.version;
      appliedInRun.push(def.version);
      appliedMigrations.push({
        version: def.version,
        id: def.id,
        name: def.name,
        checksum: def.checksum,
        appliedAt,
        executionMs,
        status: 'APPLIED'
      });
    } catch (stepErr: any) {
      try {
        if (db.inTransaction !== false) {
          db.exec('ROLLBACK');
        }
      } catch {
        // ignore rollback cleanup failure
      }

      return {
        ok: false,
        status: {
          status: 'FAILED',
          fromVersion: userVersion,
          currentVersion,
          targetVersion,
          appliedMigrations,
          appliedInRun,
          backupDir: backupInfo?.backupDir,
          backupFile: backupInfo?.backupFile,
          backupSha256: backupInfo?.backupSha256,
          failedMigrationId: def.id,
          failedVersion: def.version,
          errorCode: 'SQLITE_MIGRATION_FAILED',
          errorMessage: stepErr?.message || String(stepErr)
        }
      };
    } finally {
      if (def.requiresForeignKeysOff && prevFk !== null) {
        try {
          db.pragma(`foreign_keys = ${prevFk ? 'ON' : 'OFF'}`);
        } catch {
          // ignore pragma restore failure
        }
      }
    }
  }

  return {
    ok: true,
    status: {
      status: 'MIGRATED',
      fromVersion: userVersion,
      currentVersion,
      targetVersion,
      appliedMigrations,
      appliedInRun,
      backupDir: backupInfo?.backupDir,
      backupFile: backupInfo?.backupFile,
      backupSha256: backupInfo?.backupSha256
    }
  };
}
