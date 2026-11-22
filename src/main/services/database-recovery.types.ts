import type fs from 'fs';

export type DatabaseStatusMode =
  | 'NORMAL'
  | 'DEGRADED'
  | 'RECOVERED_FROM_CORRUPTION'
  | 'DB_SAFE_MODE'
  | 'TEST_MEMORY';

export type SqliteErrorCategory =
  | 'LOCK_ERROR'
  | 'ACCESS_ERROR'
  | 'CORRUPT_ERROR'
  | 'OTHER_ERROR';

export type StoragePersistenceStatus =
  | 'PERSISTENT_SQLITE'
  | 'PERSISTENT_JSON_DEGRADED'
  | 'VOLATILE_STORAGE'
  | 'TEST_EPHEMERAL';

export type DatabaseEngineType =
  | 'sqlite'
  | 'sqlite-memory'
  | 'json-degraded'
  | 'json-safe-mode'
  | 'json-test';

export interface DatabaseEngineCapabilities {
  persistent: boolean;
  supportsTransactions: boolean;
  supportsRollback: boolean;
  supportsFts5: boolean;
  supportsForeignKeys: boolean;
  supportsSqlIndexes: boolean;
}

export type SecretStorageMode = 'dpapi' | 'session_memory_only';
export type SecretReadStatus = 'ok' | 'missing' | 'unreadable';

export interface SystemSecurityStatus {
  safeStorageAvailable: boolean;
  secretsStorageMode: SecretStorageMode;
  unreadableKeysCount: number;
}

export interface QuarantinedFileRecord {
  fileName: string;
  originalPath: string;
  quarantinePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface DatabaseMigrationRecord {
  version: number;
  id: string;
  name: string;
  checksum: string;
  appliedAt: string;
  executionMs: number;
  status: 'APPLIED';
}

export interface DatabaseMigrationStatus {
  status: 'CURRENT' | 'MIGRATED' | 'FAILED' | 'SCHEMA_DRIFT' | 'BACKUP_FAILED' | 'SKIPPED';
  fromVersion: number;
  currentVersion: number;
  targetVersion: number;
  appliedMigrations: DatabaseMigrationRecord[];
  appliedInRun: number[];
  backupDir?: string;
  backupFile?: string;
  backupSha256?: string;
  failedMigrationId?: string;
  failedVersion?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface DatabaseHealthStatus {
  mode: DatabaseStatusMode;
  isSafeMode: boolean;
  readOnly: boolean;
  storageStatus: StoragePersistenceStatus;
  engine: DatabaseEngineType;
  dbPath: string;
  schemaVersion?: number;
  backupPath?: string;
  capabilities?: DatabaseEngineCapabilities;
  limitations?: string[];
  errorCategory?: SqliteErrorCategory;
  errorCode?: string;
  errorMessage?: string;
  userNotice?: string;
  timestamp: string;
  lastRecovery?: {
    timestamp: string;
    reason: string;
    quarantined: boolean;
    backupDir?: string;
  };
  migration?: DatabaseMigrationStatus;
  security?: SystemSecurityStatus;
}

export class DatabaseSafeModeError extends Error {
  public readonly code = 'DB_SAFE_MODE_WRITE_BLOCKED';
  public readonly storageStatus: StoragePersistenceStatus = 'VOLATILE_STORAGE';

  constructor(operationSql?: string) {
    const preview = operationSql ? operationSql.trim().slice(0, 60) : 'WRITE';
    super(
      `[DB_SAFE_MODE] Write operation blocked in diagnostic safe mode (${preview}). Storage status: VOLATILE_STORAGE.`
    );
    this.name = 'DatabaseSafeModeError';
  }
}

export type IntegrityCheckNormalized =
  | { status: 'OK'; details: string }
  | { status: 'CORRUPT'; details: string }
  | { status: 'INVALID_FORMAT'; details: string };

export interface QuarantineFsHooks {
  existsSync?: (p: string) => boolean;
  mkdirSync?: (p: string, opts?: fs.MakeDirectoryOptions) => void;
  readFileSync?: (p: string) => Buffer;
  statSync?: (p: string) => { size: number };
  copyFileSync?: (src: string, dest: string) => void;
  renameSync?: (oldPath: string, newPath: string) => void;
  writeFileSync?: (p: string, data: string, encoding: BufferEncoding) => void;
  unlinkSync?: (p: string) => void;
}

export interface QuarantineResult {
  success: boolean;
  backupDir?: string;
  manifestPath?: string;
  files: QuarantinedFileRecord[];
  errorReason?: string;
}

export interface OpenSqliteOptions {
  dbPath: string;
  backupRootDir: string;
  DatabaseClass: any;
  retryDelaysMs?: number[];
  waitFn?: (ms: number) => void;
  fsHooks?: QuarantineFsHooks;
}

export interface OpenSqliteOutcome {
  instance: any | null;
  health: DatabaseHealthStatus;
}
