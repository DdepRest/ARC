import type {
  DatabaseMigrationRecord,
  DatabaseMigrationStatus
} from './database-recovery.types';
import {
  LATEST_SCHEMA_VERSION,
  type MigrationDefinition
} from './database-migrations.registry';

export interface SchemaMigrationDbRow {
  version: number;
  id: string;
  name: string;
  checksum: string;
  applied_at: string;
  execution_ms: number;
  status: string;
}

export const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    execution_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'APPLIED'
  );
`;

export function toMigrationRecord(row: SchemaMigrationDbRow): DatabaseMigrationRecord {
  return {
    version: Number(row.version),
    id: String(row.id),
    name: String(row.name),
    checksum: String(row.checksum),
    appliedAt: String(row.applied_at),
    executionMs: Number(row.execution_ms ?? 0),
    status: 'APPLIED'
  };
}

function hasSchemaMigrationsTable(db: any): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get() as { name?: string } | undefined;
  return Boolean(row?.name);
}

function readAppliedMigrationRows(db: any): SchemaMigrationDbRow[] {
  return db
    .prepare(
      'SELECT version, id, name, checksum, applied_at, execution_ms, status FROM schema_migrations ORDER BY version ASC'
    )
    .all() as SchemaMigrationDbRow[];
}

export function validateMigrationState(
  db: any,
  migrations: readonly MigrationDefinition[]
):
  | {
      ok: true;
      userVersion: number;
      targetVersion: number;
      appliedMigrations: DatabaseMigrationRecord[];
    }
  | {
      ok: false;
      status: DatabaseMigrationStatus;
    } {
  const targetVersion =
    migrations.length > 0 ? migrations[migrations.length - 1].version : LATEST_SCHEMA_VERSION;
  const rawUserVersion = db.pragma('user_version', { simple: true });
  const userVersion = Number(rawUserVersion);

  if (!Number.isInteger(userVersion) || userVersion < 0) {
    return {
      ok: false,
      status: {
        status: 'SCHEMA_DRIFT',
        fromVersion: 0,
        currentVersion: 0,
        targetVersion,
        appliedMigrations: [],
        appliedInRun: [],
        errorCode: 'SQLITE_SCHEMA_DRIFT',
        errorMessage: `Invalid PRAGMA user_version value: ${String(rawUserVersion)}`
      }
    };
  }

  const hasAuditTable = hasSchemaMigrationsTable(db);
  const auditRows = hasAuditTable ? readAppliedMigrationRows(db) : [];
  const appliedMigrations = auditRows
    .filter((r) => String(r.status).toUpperCase() === 'APPLIED')
    .map(toMigrationRecord);

  const failDrift = (
    errorCode: string,
    errorMessage: string
  ): { ok: false; status: DatabaseMigrationStatus } => ({
    ok: false,
    status: {
      status: 'SCHEMA_DRIFT',
      fromVersion: userVersion,
      currentVersion: userVersion,
      targetVersion,
      appliedMigrations,
      appliedInRun: [],
      errorCode,
      errorMessage
    }
  });

  if (userVersion > targetVersion) {
    return failDrift(
      'SQLITE_UNSUPPORTED_SCHEMA_VERSION',
      `Database schema version (${userVersion}) is newer than supported version (${targetVersion}).`
    );
  }

  if (!hasAuditTable && userVersion > 0) {
    return failDrift(
      'SQLITE_SCHEMA_DRIFT',
      `PRAGMA user_version is ${userVersion}, but audit table "schema_migrations" is missing.`
    );
  }

  if (hasAuditTable && auditRows.length === 0 && userVersion > 0) {
    return failDrift(
      'SQLITE_SCHEMA_DRIFT',
      `PRAGMA user_version is ${userVersion}, but "schema_migrations" contains no applied records.`
    );
  }

  const byVersion = new Map<number, MigrationDefinition>(
    migrations.map((m) => [m.version, m])
  );

  for (let i = 0; i < auditRows.length; i++) {
    const row = auditRows[i];
    const rowVersion = Number(row.version);
    if (String(row.status).toUpperCase() !== 'APPLIED') {
      return failDrift(
        'SQLITE_SCHEMA_DRIFT',
        `Migration v${rowVersion} (${row.id}) has non-applied status "${row.status}".`
      );
    }
    const def = byVersion.get(rowVersion);
    if (!def) {
      return failDrift(
        'SQLITE_UNKNOWN_MIGRATION',
        `Database references unknown applied migration version ${rowVersion} (${row.id}).`
      );
    }
    if (row.id !== def.id) {
      return failDrift(
        'SQLITE_UNKNOWN_MIGRATION',
        `Applied migration v${rowVersion} ID mismatch: database has "${row.id}", expected "${def.id}".`
      );
    }
    if (row.checksum !== def.checksum) {
      return failDrift(
        'SQLITE_MIGRATION_CHECKSUM_MISMATCH',
        `Applied migration v${rowVersion} (${row.id}) checksum mismatch.`
      );
    }
    const expectedSeqVersion = migrations[i]?.version;
    if (expectedSeqVersion !== rowVersion) {
      return failDrift(
        'SQLITE_SCHEMA_DRIFT',
        `Non-contiguous migration history at position ${i}: expected v${expectedSeqVersion}, found v${rowVersion}.`
      );
    }
  }

  const maxAuditVersion =
    auditRows.length > 0 ? Number(auditRows[auditRows.length - 1].version) : 0;
  if (userVersion !== maxAuditVersion) {
    return failDrift(
      'SQLITE_SCHEMA_DRIFT',
      `Version drift between PRAGMA user_version (${userVersion}) and schema_migrations max version (${maxAuditVersion}).`
    );
  }

  return { ok: true, userVersion, targetVersion, appliedMigrations };
}
