import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import BetterSqlite3 from 'better-sqlite3';
import { DatabaseService } from './database';
import {
  DATABASE_MIGRATIONS,
  LATEST_SCHEMA_VERSION
} from './database-migrations.registry';
import { runDatabaseMigrations } from './database-migrations.runner';
import { DiagnosticsService } from './diagnostics.service';
import { DatabaseSafeModeError } from './database-recovery.util';

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listBackupDirs(backupRootDir: string): string[] {
  if (!fs.existsSync(backupRootDir)) return [];
  return fs.readdirSync(backupRootDir).filter((name) => name.startsWith('pre-migration-'));
}

describe('S3-01 — Versioned Database Migrations & Pre-Upgrade Backup', () => {
  let tmpDir: string;
  let dbPath: string;
  let backupRootDir: string;

  beforeEach(() => {
    DatabaseService.close();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-db-migrations-test-'));
    dbPath = path.join(tmpDir, 'database', 'arc.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    backupRootDir = path.join(tmpDir, 'backups');
  });

  afterEach(() => {
    DatabaseService.close();
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore temp cleanup errors
    }
  });

  it('initializes fresh DB from v0 to LATEST_SCHEMA_VERSION, records all checksums, and skips backup on empty DB', async () => {
    const health = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });

    expect(health.mode).toBe('NORMAL');
    expect(health.isSafeMode).toBe(false);
    expect(health.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(health.migration?.status).toBe('MIGRATED');
    expect(health.migration?.fromVersion).toBe(0);
    expect(health.migration?.currentVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(health.migration?.appliedInRun).toEqual(DATABASE_MIGRATIONS.map((m) => m.version));

    const uv = DatabaseService.db.pragma('user_version', { simple: true });
    expect(uv).toBe(LATEST_SCHEMA_VERSION);

    const rows = DatabaseService.db
      .prepare('SELECT version, id, checksum, status FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number; id: string; checksum: string; status: string }>;
    expect(rows).toHaveLength(DATABASE_MIGRATIONS.length);
    for (let i = 0; i < DATABASE_MIGRATIONS.length; i++) {
      expect(rows[i].version).toBe(DATABASE_MIGRATIONS[i].version);
      expect(rows[i].id).toBe(DATABASE_MIGRATIONS[i].id);
      expect(rows[i].checksum).toBe(DATABASE_MIGRATIONS[i].checksum);
      expect(rows[i].status).toBe('APPLIED');
    }

    // Empty brand-new DB does not produce redundant pre-migration backups
    expect(listBackupDirs(backupRootDir)).toHaveLength(0);

    // Diagnostics report exposes real schemaVersion
    const report = await DiagnosticsService.collectReport(tmpDir);
    expect(report.schemaVersion).toBe(1);
    expect(report.storage.dbStatus.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
  });

  it('is strictly idempotent on re-open without repeating migrations or creating redundant backups', () => {
    DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });

    const firstTimestamps = DatabaseService.db
      .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC')
      .all();
    DatabaseService.close();

    const secondHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });

    expect(secondHealth.mode).toBe('NORMAL');
    expect(secondHealth.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(secondHealth.migration?.status).toBe('CURRENT');
    expect(secondHealth.migration?.appliedInRun).toEqual([]);
    expect(listBackupDirs(backupRootDir)).toHaveLength(0);

    const secondTimestamps = DatabaseService.db
      .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC')
      .all();
    expect(secondTimestamps).toEqual(firstTimestamps);
  });

  it('upgrades a populated legacy v0 DB without data loss and creates a verified pre-migration backup snapshot', () => {
    const legacy = new BetterSqlite3(dbPath);
    legacy.exec(`
      CREATE TABLE ltm (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL
      );
      INSERT INTO ltm (id, category, key, value) VALUES ('ltm-1', 'prefs', 'theme', 'crimson');

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        is_pinned INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0
      );
      INSERT INTO sessions (id, name, message_count) VALUES (10, 'Legacy Chat', 5);

      CREATE TABLE arc_objectives (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        owner TEXT CHECK(owner IN ('CHAIRMAN', 'COO_AGENT', 'SYSTEM_AUTO')),
        priority INTEGER NOT NULL,
        status TEXT CHECK(status IN ('DRAFT', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'ABANDONED')),
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL,
        deadline TEXT
      );
      INSERT INTO arc_objectives (id, title, description, owner, priority, status, confidence, created_at)
      VALUES ('obj-1', 'Legacy Objective', 'Keep this safe', 'CHAIRMAN', 1, 'ACTIVE', 0.9, '2025-01-01T00:00:00Z');

      CREATE TABLE arc_decisions (
        id TEXT PRIMARY KEY,
        objective_id TEXT,
        title TEXT NOT NULL,
        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTING', 'DONE', 'FAILED', 'ABANDONED')),
        rationale TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
      INSERT INTO arc_decisions (id, objective_id, title, status, created_at, updated_at)
      VALUES ('dec-real', 'obj-1', 'Real Decision', 'DONE', 1700000000000, 1700000000000);
      INSERT INTO arc_decisions (id, objective_id, title, status, created_at, updated_at)
      VALUES ('dec-synth', 'obj-1', 'Simulate Alternative Future Path Vector Alpha', 'DONE', 1700000000000, 1700000000000);

      CREATE TABLE arc_actions (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
        params TEXT,
        result TEXT,
        created_at INTEGER
      );
      INSERT INTO arc_actions (id, decision_id, type, status, params, created_at)
      VALUES ('act-1', 'dec-real', 'SQL_EXEC', 'SUCCESS', '{}', 1700000000000);

      CREATE TABLE arc_tasks (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        objective_id TEXT
      );
      INSERT INTO arc_tasks (id, text, created_at, objective_id)
      VALUES ('task-1', 'Preserve legacy task', 1700000001234, 'obj-1');

      CREATE TABLE arc_prediction_graph (
        id TEXT PRIMARY KEY,
        decision_id TEXT,
        node_type TEXT,
        title TEXT NOT NULL,
        execution_weight REAL,
        entropy_at_prediction REAL,
        created_at INTEGER
      );
      INSERT INTO arc_prediction_graph (id, decision_id, node_type, title, created_at)
      VALUES ('pg-synth', 'dec-real', 'SIMULATED_ONLY', 'Noise Node', 1700000000000);

      CREATE TABLE arc_coherence_history (
        id TEXT PRIMARY KEY,
        coherence_index REAL,
        created_at INTEGER
      );
      INSERT INTO arc_coherence_history (id, coherence_index, created_at) VALUES ('coh-old', 0.5, 1000);
      INSERT INTO arc_coherence_history (id, coherence_index, created_at) VALUES ('coh-fresh', 0.9, ${Date.now()});
    `);
    legacy.close();

    const health = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });

    expect(health.mode).toBe('NORMAL');
    expect(health.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(health.migration?.status).toBe('MIGRATED');
    expect(health.migration?.fromVersion).toBe(0);
    expect(health.migration?.backupDir).toBeDefined();
    expect(health.migration?.backupFile).toBeDefined();

    // Verify pre-migration backup snapshot integrity and pre-upgrade state
    const backupFile = health.migration!.backupFile!;
    const metaPath = path.join(health.migration!.backupDir!, 'migration-backup-meta.json');
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    expect(meta.fromVersion).toBe(0);
    expect(meta.targetVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(meta.sha256).toBe(sha256File(backupFile));

    const backupDb = new BetterSqlite3(backupFile, { readonly: true });
    expect(backupDb.pragma('user_version', { simple: true })).toBe(0);
    expect((backupDb.prepare('SELECT value FROM ltm WHERE id = ?').get('ltm-1') as any).value).toBe('crimson');
    backupDb.close();

    // Verify live upgraded DB kept all user data and upgraded constraints/columns
    const ltmRow = DatabaseService.db.prepare('SELECT value, value_type FROM ltm WHERE id = ?').get('ltm-1') as any;
    expect(ltmRow).toEqual({ value: 'crimson', value_type: 'string' });

    const taskRow = DatabaseService.db.prepare('SELECT text, updated_at FROM arc_tasks WHERE id = ?').get('task-1') as any;
    expect(taskRow).toEqual({ text: 'Preserve legacy task', updated_at: 1700000001234 });

    const sessionRow = DatabaseService.db.prepare('SELECT name, is_deleted FROM sessions WHERE id = 10').get() as any;
    expect(sessionRow).toEqual({ name: 'Legacy Chat', is_deleted: 0 });

    // Rebuild preserved real objective/decision/action AND allows ROLLED_BACK now
    expect(() =>
      DatabaseService.db
        .prepare("UPDATE arc_objectives SET status = 'ROLLED_BACK', route_layout = '{}' WHERE id = 'obj-1'")
        .run()
    ).not.toThrow();
    expect(() =>
      DatabaseService.db
        .prepare("UPDATE arc_decisions SET status = 'ROLLED_BACK' WHERE id = 'dec-real'")
        .run()
    ).not.toThrow();
    expect(() =>
      DatabaseService.db
        .prepare("UPDATE arc_actions SET status = 'ROLLED_BACK', inverse = '{}' WHERE id = 'act-1'")
        .run()
    ).not.toThrow();

    // Indexes rebuilt cleanly
    const decIndexes = DatabaseService.db.prepare("PRAGMA index_list('arc_decisions')").all() as Array<{ name: string }>;
    expect(decIndexes.some((i) => i.name === 'idx_decisions_objective')).toBe(true);
    const actIndexes = DatabaseService.db.prepare("PRAGMA index_list('arc_actions')").all() as Array<{ name: string }>;
    expect(actIndexes.some((i) => i.name === 'idx_actions_decision')).toBe(true);

    // v8 cleanup ran properly without deleting real decision or fresh coherence
    expect(DatabaseService.db.prepare('SELECT id FROM arc_decisions').all()).toHaveLength(1);
    expect(DatabaseService.db.prepare('SELECT id FROM arc_prediction_graph').all()).toHaveLength(0);
    expect(DatabaseService.db.prepare('SELECT id FROM arc_coherence_history').all()).toEqual([{ id: 'coh-fresh' }]);
  });

  it('upgrades an intermediate v2 database sequentially to latest schema and verifies backup version', () => {
    const partial = new BetterSqlite3(dbPath);
    const v1ToV2 = DATABASE_MIGRATIONS.slice(0, 2);
    const partialRes = runDatabaseMigrations(partial, {
      dbPath: ':memory:',
      migrations: v1ToV2
    });
    expect(partialRes.ok).toBe(true);
    expect(partial.pragma('user_version', { simple: true })).toBe(2);
    partial
      .prepare('INSERT INTO ltm (id, category, key, value, value_type) VALUES (?, ?, ?, ?, ?)')
      .run('mem-v2', 'facts', 'k1', 'v1', 'string');
    const v1AppliedAt = (
      partial.prepare('SELECT applied_at FROM schema_migrations WHERE version = 1').get() as any
    ).applied_at;
    partial.close();

    const health = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });

    expect(health.mode).toBe('NORMAL');
    expect(health.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(health.migration?.fromVersion).toBe(2);
    expect(health.migration?.appliedInRun).toEqual([3, 4, 5, 6, 7, 8]);

    // Original v1 audit record untouched
    const v1Row = DatabaseService.db
      .prepare('SELECT applied_at FROM schema_migrations WHERE version = 1')
      .get() as any;
    expect(v1Row.applied_at).toBe(v1AppliedAt);

    // User row preserved and pre-migration backup captures exact v2 state
    expect((DatabaseService.db.prepare('SELECT value FROM ltm WHERE id = ?').get('mem-v2') as any).value).toBe('v1');
    const backupDb = new BetterSqlite3(health.migration!.backupFile!, { readonly: true });
    expect(backupDb.pragma('user_version', { simple: true })).toBe(2);
    expect(backupDb.prepare('SELECT COUNT(*) as n FROM schema_migrations').get()).toEqual({ n: 2 });
    backupDb.close();
  });

  it('preserves intermediate committed version, rolls back failing step, and enters DB_SAFE_MODE on mid-migration failure', () => {
    // Seed v2 DB with user data
    const partial = new BetterSqlite3(dbPath);
    runDatabaseMigrations(partial, { dbPath: ':memory:', migrations: DATABASE_MIGRATIONS.slice(0, 2) });
    partial
      .prepare('INSERT INTO sessions (name) VALUES (?)')
      .run('Before Failure');
    partial.close();

    const failHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false,
      migrationOptions: {
        beforeMigrationStep: (m) => {
          if (m.version === 5) {
            DatabaseService.db.exec("ALTER TABLE arc_decisions ADD COLUMN temp_step5_col TEXT");
            DatabaseService.db.prepare("INSERT INTO sessions (name) VALUES (?)").run("Should Rollback Step 5");
            throw new Error('Injected disk/constraint failure inside step 5');
          }
        }
      }
    });

    expect(failHealth.mode).toBe('DB_SAFE_MODE');
    expect(failHealth.isSafeMode).toBe(true);
    expect(failHealth.readOnly).toBe(true);
    expect(failHealth.storageStatus).toBe('VOLATILE_STORAGE');
    expect(failHealth.errorCode).toBe('SQLITE_MIGRATION_FAILED');
    expect(failHealth.migration?.failedVersion).toBe(5);
    expect(failHealth.migration?.failedMigrationId).toBe('005_arc_decisions_metadata');
    expect(failHealth.migration?.currentVersion).toBe(4);
    expect(failHealth.migration?.appliedInRun).toEqual([3, 4]);
    expect(failHealth.migration?.backupFile).toBeDefined();
    expect(fs.existsSync(failHealth.migration!.backupFile!)).toBe(true);

    // Runtime connection in safe mode blocks writes
    expect(() =>
      DatabaseService.db.prepare('INSERT INTO sessions (name) VALUES (?)').run('Should fail')
    ).toThrowError(DatabaseSafeModeError);

    // Inspect SQLite file directly: v3 and v4 committed cleanly, step 5 DDL+DML rolled back cleanly!
    const rawCheck = new BetterSqlite3(dbPath, { readonly: true });
    expect(rawCheck.pragma('user_version', { simple: true })).toBe(4);
    const appliedVersions = rawCheck
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number }>;
    expect(appliedVersions.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    const decisionCols = rawCheck.pragma('table_info(arc_decisions)') as Array<{ name: string }>;
    expect(decisionCols.some((c) => c.name === 'temp_step5_col')).toBe(false);
    expect((rawCheck.prepare('SELECT name FROM sessions').all() as any[]).map((r) => r.name)).toEqual([
      'Before Failure'
    ]);
    rawCheck.close();

    // Recovery run after cause resolved resumes cleanly from v4 -> v8
    const recoveredHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });
    expect(recoveredHealth.mode).toBe('NORMAL');
    expect(recoveredHealth.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(recoveredHealth.migration?.fromVersion).toBe(4);
    expect(recoveredHealth.migration?.appliedInRun).toEqual([5, 6, 7, 8]);
  });

  it('aborts migration without modifying DB and enters DB_SAFE_MODE when pre-migration backup fails verification', () => {
    const partial = new BetterSqlite3(dbPath);
    partial.pragma('journal_mode = WAL');
    runDatabaseMigrations(partial, { dbPath: ':memory:', migrations: DATABASE_MIGRATIONS.slice(0, 2) });
    partial.prepare('INSERT INTO sessions (name) VALUES (?)').run('Untouched Session');
    partial.pragma('wal_checkpoint(TRUNCATE)');
    partial.close();
    const originalHash = sha256File(dbPath);

    const health = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false,
      migrationOptions: {
        backupHooks: {
          verifySnapshot: () => {
            throw new Error('Simulated checksum/integrity verification failure on backup');
          }
        }
      }
    });

    expect(health.mode).toBe('DB_SAFE_MODE');
    expect(health.isSafeMode).toBe(true);
    expect(health.errorCode).toBe('SQLITE_MIGRATION_BACKUP_FAILED');
    expect(health.migration?.status).toBe('BACKUP_FAILED');
    expect(health.migration?.appliedInRun).toEqual([]);
    expect(sha256File(dbPath)).toBe(originalHash);

    const verifyDb = new BetterSqlite3(dbPath, { readonly: true });
    expect(verifyDb.pragma('user_version', { simple: true })).toBe(2);
    expect(verifyDb.prepare('SELECT COUNT(*) as n FROM schema_migrations').get()).toEqual({ n: 2 });
    expect((verifyDb.prepare('SELECT name FROM sessions').all() as any[]).map((r) => r.name)).toEqual([
      'Untouched Session'
    ]);
    verifyDb.close();
  });

  it('blocks startup in DB_SAFE_MODE on schema drift, tampered checksums, unknown migration IDs, and future versions', () => {
    // 1. Version drift: user_version != schema_migrations max version
    DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });
    DatabaseService.close();

    const driftDb = new BetterSqlite3(dbPath);
    driftDb.pragma('user_version = 3');
    driftDb.close();

    const driftHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });
    expect(driftHealth.mode).toBe('DB_SAFE_MODE');
    expect(driftHealth.errorCode).toBe('SQLITE_SCHEMA_DRIFT');
    DatabaseService.close();

    // 2. Restore user_version = 8, then tamper checksum in schema_migrations
    const tamperDb = new BetterSqlite3(dbPath);
    tamperDb.pragma(`user_version = ${LATEST_SCHEMA_VERSION}`);
    tamperDb.prepare("UPDATE schema_migrations SET checksum = 'deadbeef' WHERE version = 4").run();
    tamperDb.close();

    const tamperHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });
    expect(tamperHealth.mode).toBe('DB_SAFE_MODE');
    expect(tamperHealth.errorCode).toBe('SQLITE_MIGRATION_CHECKSUM_MISMATCH');
    DatabaseService.close();

    // 3. Unknown migration ID
    const unknownDb = new BetterSqlite3(dbPath);
    unknownDb
      .prepare('UPDATE schema_migrations SET id = ?, checksum = ? WHERE version = 4')
      .run('999_mystery_migration', DATABASE_MIGRATIONS[3].checksum);
    unknownDb.close();

    const unknownHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });
    expect(unknownHealth.mode).toBe('DB_SAFE_MODE');
    expect(unknownHealth.errorCode).toBe('SQLITE_UNKNOWN_MIGRATION');
    DatabaseService.close();

    // 4. Future schema version (> LATEST_SCHEMA_VERSION)
    const futureDb = new BetterSqlite3(dbPath);
    futureDb.pragma('user_version = 99');
    futureDb.close();

    const futureHealth = DatabaseService.initWithConfig({
      dbPath,
      backupRootDir,
      DatabaseClass: BetterSqlite3,
      isTestEnv: false
    });
    expect(futureHealth.mode).toBe('DB_SAFE_MODE');
    expect(futureHealth.errorCode).toBe('SQLITE_UNSUPPORTED_SCHEMA_VERSION');
  });
});
