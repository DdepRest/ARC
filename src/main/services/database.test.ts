import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { DatabaseService, JSONDatabase } from './database';
import {
  DatabaseSafeModeError,
  classifySqliteError,
  cleanupOrRollbackOrphanedStaging,
  isReadOnlySql,
  normalizeIntegrityCheckResult,
  quarantineWalTriplet
} from './database-recovery.util';

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('JSONStatement and JSONDatabase', () => {
  const testDbPath = path.join(__dirname, 'test_fallback.json');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize and execute basic INSERT, UPDATE, DELETE in JSONDatabase', () => {
    const db = new JSONDatabase(testDbPath);

    db.exec('CREATE TABLE IF NOT EXISTS test_table (id TEXT PRIMARY KEY, name TEXT)');

    const insertStmt = db.prepare('INSERT INTO test_table (id, name) VALUES (?, ?)');
    const result = insertStmt.run('1', 'Test Name');
    expect(result.changes).toBe(1);

    const selectStmt = db.prepare('SELECT * FROM test_table WHERE id = ?');
    const row = selectStmt.get('1');
    expect(row).toBeDefined();
    expect(row.id).toBe('1');
    expect(row.name).toBe('Test Name');

    const updateStmt = db.prepare('UPDATE test_table SET name = ? WHERE id = ?');
    updateStmt.run('Updated Name', '1');

    const updatedRow = selectStmt.get('1');
    expect(updatedRow.name).toBe('Updated Name');

    const deleteStmt = db.prepare('DELETE FROM test_table WHERE id = ?');
    deleteStmt.run('1');

    const deletedRow = selectStmt.get('1');
    expect(deletedRow).toBeUndefined();
  });

  it('should handle INSERT OR REPLACE correctly', () => {
    const db = new JSONDatabase(testDbPath);

    const insertStmt = db.prepare('INSERT OR REPLACE INTO test_table (id, name) VALUES (?, ?)');
    insertStmt.run('2', 'Initial');

    let row = db.prepare('SELECT * FROM test_table WHERE id = ?').get('2');
    expect(row.name).toBe('Initial');

    insertStmt.run('2', 'Replaced');
    row = db.prepare('SELECT * FROM test_table WHERE id = ?').get('2');
    expect(row.name).toBe('Replaced');
  });
});

describe('Task 1.1 — SQLite Protection, WAL Quarantine, and DB_SAFE_MODE', () => {
  let tmpDir: string;
  let dbPath: string;
  let walPath: string;
  let shmPath: string;
  let backupRootDir: string;

  const sampleDbBytes = Buffer.from('SQLite format 3\0-MAIN-DB-PAYLOAD-1234567890');
  const sampleWalBytes = Buffer.from('WAL-FRAME-UNCHECKPOINTED-TRANSACTIONS-987654321');
  const sampleShmBytes = Buffer.from('SHM-INDEX-HEADER-DATA-112233');

  function writeSampleTriplet() {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, sampleDbBytes);
    fs.writeFileSync(walPath, sampleWalBytes);
    fs.writeFileSync(shmPath, sampleShmBytes);
  }

  function assertOriginalTripletIntact() {
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.existsSync(walPath)).toBe(true);
    expect(fs.existsSync(shmPath)).toBe(true);
    expect(fs.readFileSync(dbPath).equals(sampleDbBytes)).toBe(true);
    expect(fs.readFileSync(walPath).equals(sampleWalBytes)).toBe(true);
    expect(fs.readFileSync(shmPath).equals(sampleShmBytes)).toBe(true);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-db-recovery-test-'));
    dbPath = path.join(tmpDir, 'database', 'arc.db');
    walPath = `${dbPath}-wal`;
    shmPath = `${dbPath}-shm`;
    backupRootDir = path.join(tmpDir, 'backups');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe('1. normalizeIntegrityCheckResult', () => {
    it('normalizes standard better-sqlite3 [{ integrity_check: "ok" }] and variants as OK', () => {
      expect(normalizeIntegrityCheckResult([{ integrity_check: 'ok' }])).toEqual({
        status: 'OK',
        details: 'ok'
      });
      expect(normalizeIntegrityCheckResult([{ INTEGRITY_CHECK: 'OK' }])).toEqual({
        status: 'OK',
        details: 'ok'
      });
      expect(normalizeIntegrityCheckResult([{ quick_check: 'ok' }])).toEqual({
        status: 'OK',
        details: 'ok'
      });
      expect(normalizeIntegrityCheckResult(['ok'])).toEqual({
        status: 'OK',
        details: 'ok'
      });
      expect(normalizeIntegrityCheckResult('ok')).toEqual({
        status: 'OK',
        details: 'ok'
      });
    });

    it('detects explicit corruption reports as CORRUPT', () => {
      const res = normalizeIntegrityCheckResult([
        { integrity_check: '*** in database main ***' },
        { integrity_check: 'row 1 missing from index idx_ltm_key' }
      ]);
      expect(res.status).toBe('CORRUPT');
      expect(res.details).toContain('row 1 missing');
    });

    it('classifies empty or malformed pragma return structures as INVALID_FORMAT (never CORRUPT)', () => {
      expect(normalizeIntegrityCheckResult([]).status).toBe('INVALID_FORMAT');
      expect(normalizeIntegrityCheckResult(null).status).toBe('INVALID_FORMAT');
      expect(normalizeIntegrityCheckResult(undefined).status).toBe('INVALID_FORMAT');
      expect(normalizeIntegrityCheckResult([{}]).status).toBe('INVALID_FORMAT');
      expect(normalizeIntegrityCheckResult({ integrity_check: 'ok' }).status).toBe('INVALID_FORMAT');
    });

    it('does NOT quarantine or delete a healthy DB if integrity_check returns an unexpected format', () => {
      writeSampleTriplet();

      class WeirdPragmaDb {
        pragma(sql: string) {
          if (sql.includes('integrity_check')) return []; // invalid empty array format
          return [];
        }
        exec() { return this; }
        prepare() { return { run: () => ({ changes: 0, lastInsertRowid: 0 }), get: () => undefined, all: () => [] }; }
        close() {}
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: WeirdPragmaDb,
        isTestEnv: false
      });

      expect(health.mode).toBe('DB_SAFE_MODE');
      expect(health.errorCategory).toBe('OTHER_ERROR');
      expect(health.errorCode).toBe('SQLITE_INTEGRITY_FORMAT_ERROR');
      assertOriginalTripletIntact();
      expect(fs.existsSync(backupRootDir)).toBe(false);
    });
  });

  describe('2. Error Classification & Lock/Access Protection', () => {
    it('separates LOCK_ERROR (SQLITE_BUSY / EBUSY) from ACCESS_ERROR (EPERM / EACCES)', () => {
      expect(classifySqliteError({ code: 'SQLITE_BUSY', message: 'database is locked' }).category).toBe('LOCK_ERROR');
      expect(classifySqliteError({ code: 'SQLITE_LOCKED', message: 'database table is locked' }).category).toBe('LOCK_ERROR');
      expect(classifySqliteError({ code: 'EBUSY', message: 'resource busy or locked' }).category).toBe('LOCK_ERROR');

      expect(classifySqliteError({ code: 'EPERM', message: 'operation not permitted' }).category).toBe('ACCESS_ERROR');
      expect(classifySqliteError({ code: 'EACCES', message: 'permission denied' }).category).toBe('ACCESS_ERROR');
      expect(classifySqliteError({ code: 'SQLITE_PERM', message: 'access denied' }).category).toBe('ACCESS_ERROR');
    });

    it('recovers after transient SQLITE_BUSY retries without deleting files or entering quarantine', () => {
      writeSampleTriplet();
      let attempts = 0;
      const delaysRecorded: number[] = [];

      class TransientBusyDb {
        constructor() {
          attempts++;
          if (attempts <= 2) {
            const err: any = new Error('SQLITE_BUSY: database is locked');
            err.code = 'SQLITE_BUSY';
            throw err;
          }
        }
        pragma(sql: string) {
          if (sql.includes('integrity_check')) return [{ integrity_check: 'ok' }];
          return [];
        }
        exec() { return this; }
        prepare() {
          return {
            run: () => ({ changes: 0, lastInsertRowid: 0 }),
            get: () => undefined,
            all: () => []
          };
        }
        close() {}
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: TransientBusyDb,
        isTestEnv: false,
        retryDelaysMs: [10, 20, 40],
        waitFn: (ms) => delaysRecorded.push(ms)
      });

      expect(attempts).toBe(3);
      expect(delaysRecorded).toEqual([10, 20]);
      expect(health.mode).toBe('NORMAL');
      expect(health.isSafeMode).toBe(false);
      expect(health.storageStatus).toBe('PERSISTENT_SQLITE');
      assertOriginalTripletIntact();
      expect(fs.existsSync(backupRootDir)).toBe(false);
    });

    it('preserves original WAL triplet and enters DB_SAFE_MODE when SQLITE_BUSY / EBUSY persists across all retries', () => {
      writeSampleTriplet();
      let attempts = 0;

      class PersistentBusyDb {
        constructor() {
          attempts++;
          const err: any = new Error('EBUSY: resource busy or locked, open arc.db');
          err.code = 'EBUSY';
          throw err;
        }
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: PersistentBusyDb,
        isTestEnv: false,
        retryDelaysMs: [5, 10, 15],
        waitFn: () => {}
      });

      expect(attempts).toBe(4); // 1 initial + 3 retries
      expect(health.mode).toBe('DB_SAFE_MODE');
      expect(health.isSafeMode).toBe(true);
      expect(health.errorCategory).toBe('LOCK_ERROR');
      expect(health.errorCode).toBe('EBUSY');
      assertOriginalTripletIntact();
      expect(fs.existsSync(backupRootDir)).toBe(false);
    });

    it('does NOT retry EPERM / EACCES as a lock error, preserves original files, and enters DB_SAFE_MODE with ACCESS_ERROR', () => {
      writeSampleTriplet();
      let attempts = 0;

      class PermissionDeniedDb {
        constructor() {
          attempts++;
          const err: any = new Error('EPERM: operation not permitted, open arc.db');
          err.code = 'EPERM';
          throw err;
        }
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: PermissionDeniedDb,
        isTestEnv: false,
        retryDelaysMs: [10, 20, 30],
        waitFn: () => {}
      });

      expect(attempts).toBe(1); // Must NOT retry permission errors
      expect(health.mode).toBe('DB_SAFE_MODE');
      expect(health.errorCategory).toBe('ACCESS_ERROR');
      expect(health.errorCode).toBe('EPERM');
      assertOriginalTripletIntact();
      expect(fs.existsSync(backupRootDir)).toBe(false);
    });
  });

  describe('3. WAL-Triplet Quarantine Verification & Failure Scenarios', () => {
    it('quarantines all 3 WAL files, verifies SHA-256 & sizes, writes recovery-meta.json, and sets RECOVERED_FROM_CORRUPTION', () => {
      writeSampleTriplet();
      const expectedDbHash = sha256File(dbPath);
      const expectedWalHash = sha256File(walPath);
      const expectedShmHash = sha256File(shmPath);

      let openCallCount = 0;
      class CorruptThenCleanDb {
        constructor(targetPath: string) {
          openCallCount++;
          if (openCallCount > 1) {
            fs.writeFileSync(targetPath, Buffer.from('CLEAN-SQLITE-DB'));
          }
        }
        pragma(sql: string) {
          if (sql.includes('integrity_check')) {
            if (openCallCount === 1) {
              return [{ integrity_check: 'database disk image is malformed' }];
            }
            return [{ integrity_check: 'ok' }];
          }
          return [];
        }
        exec() { return this; }
        prepare() {
          return {
            run: () => ({ changes: 0, lastInsertRowid: 0 }),
            get: () => undefined,
            all: () => []
          };
        }
        close() {}
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: CorruptThenCleanDb,
        isTestEnv: false
      });

      expect(health.mode).toBe('RECOVERED_FROM_CORRUPTION');
      expect(health.isSafeMode).toBe(false);
      expect(health.storageStatus).toBe('PERSISTENT_SQLITE');
      expect(health.backupPath).toBeDefined();

      const backupDir = health.backupPath!;
      expect(fs.existsSync(path.join(backupDir, 'arc.db'))).toBe(true);
      expect(fs.existsSync(path.join(backupDir, 'arc.db-wal'))).toBe(true);
      expect(fs.existsSync(path.join(backupDir, 'arc.db-shm'))).toBe(true);
      expect(sha256File(path.join(backupDir, 'arc.db'))).toBe(expectedDbHash);
      expect(sha256File(path.join(backupDir, 'arc.db-wal'))).toBe(expectedWalHash);
      expect(sha256File(path.join(backupDir, 'arc.db-shm'))).toBe(expectedShmHash);

      const manifestPath = path.join(backupDir, 'recovery-meta.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.status).toBe('RECOVERED_FROM_CORRUPTION');
      expect(manifest.files).toHaveLength(3);
      expect(manifest.files.map((f: any) => f.sha256)).toEqual([
        expectedDbHash,
        expectedWalHash,
        expectedShmHash
      ]);

      // Old WAL and SHM were unlinked after verification; new clean DB exists
      expect(fs.existsSync(walPath)).toBe(false);
      expect(fs.existsSync(shmPath)).toBe(false);
      expect(fs.readFileSync(dbPath).toString()).toBe('CLEAN-SQLITE-DB');
    });

    it('aborts recovery, preserves ALL original files, and enters DB_SAFE_MODE on partially completed quarantine', () => {
      writeSampleTriplet();

      let copyCount = 0;
      class CorruptDb {
        pragma(sql: string) {
          if (sql.includes('integrity_check')) {
            return [{ integrity_check: 'malformed' }];
          }
          return [];
        }
        close() {}
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: CorruptDb,
        isTestEnv: false,
        fsHooks: {
          copyFileSync: (src, dest) => {
            copyCount++;
            if (copyCount === 2) {
              const err: any = new Error('ENOSPC: no space left on device while copying WAL');
              err.code = 'ENOSPC';
              throw err;
            }
            fs.copyFileSync(src, dest);
          }
        }
      });

      expect(health.mode).toBe('DB_SAFE_MODE');
      expect(health.isSafeMode).toBe(true);
      expect(health.errorMessage).toContain('ENOSPC');

      // Original triplet MUST NOT be deleted
      assertOriginalTripletIntact();

      // Manifest must NOT be written when quarantine is incomplete
      if (health.backupPath) {
        expect(fs.existsSync(path.join(health.backupPath, 'recovery-meta.json'))).toBe(false);
      }
    });

    it('aborts recovery, preserves ALL original files, and enters DB_SAFE_MODE when SHA-256 checksum verification fails', () => {
      writeSampleTriplet();

      const result = quarantineWalTriplet(
        dbPath,
        backupRootDir,
        { code: 'SQLITE_CORRUPT', message: 'corrupted' },
        {
          copyFileSync: (src, dest) => {
            fs.copyFileSync(src, dest);
            if (dest.endsWith('-wal')) {
              // Corrupt 1 byte in destination while keeping the exact same file size
              const buf = fs.readFileSync(dest);
              buf[0] = buf[0] ^ 0xff;
              fs.writeFileSync(dest, buf);
            }
          }
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('SHA-256 mismatch');
      assertOriginalTripletIntact();
      if (result.backupDir) {
        expect(fs.existsSync(path.join(result.backupDir, 'recovery-meta.json'))).toBe(false);
      }
    });
  });

  describe('4. DB_SAFE_MODE Write-Blocking & VOLATILE_STORAGE Policy', () => {
    it('blocks INSERT, UPDATE, DELETE, EXEC, and TRANSACTION in DB_SAFE_MODE while allowing SELECT reads', () => {
      writeSampleTriplet();

      class LockedProductionDb {
        constructor() {
          const err: any = new Error('SQLITE_BUSY: database is locked');
          err.code = 'SQLITE_BUSY';
          throw err;
        }
      }

      const health = DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: LockedProductionDb,
        isTestEnv: false,
        retryDelaysMs: [],
        waitFn: () => {}
      });

      expect(health.mode).toBe('DB_SAFE_MODE');
      expect(health.isSafeMode).toBe(true);
      expect(health.readOnly).toBe(true);
      expect(health.storageStatus).toBe('VOLATILE_STORAGE');

      // Read queries must succeed without crashing UI consumers
      const sessions = DatabaseService.db.prepare('SELECT * FROM sessions').all();
      expect(Array.isArray(sessions)).toBe(true);

      // Write queries must throw DatabaseSafeModeError and never pretend to persist
      expect(() => {
        DatabaseService.db.prepare('INSERT INTO sessions (name) VALUES (?)').run('New Session');
      }).toThrowError(DatabaseSafeModeError);

      try {
        DatabaseService.db.prepare('INSERT INTO sessions (name) VALUES (?)').run('New Session');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DatabaseSafeModeError);
        expect(err.code).toBe('DB_SAFE_MODE_WRITE_BLOCKED');
        expect(err.storageStatus).toBe('VOLATILE_STORAGE');
      }

      expect(() => {
        DatabaseService.db.prepare('DELETE FROM sessions WHERE id = ?').run(1);
      }).toThrowError(DatabaseSafeModeError);

      expect(() => {
        DatabaseService.db.exec('DROP TABLE sessions');
      }).toThrowError(DatabaseSafeModeError);

      const tx = DatabaseService.db.transaction(() => {});
      expect(() => tx()).toThrowError(DatabaseSafeModeError);

      // Verify no _fallback.json was written to disk
      const fallbackJsonPath = dbPath.replace(/\.db$/, '_fallback.json');
      expect(fs.existsSync(fallbackJsonPath)).toBe(false);
      assertOriginalTripletIntact();
    });

    it('blocks CTE WITH ... INSERT, .get(INSERT ... RETURNING *), mutating PRAGMA, and ATTACH in DB_SAFE_MODE', () => {
      writeSampleTriplet();

      class LockedProductionDb {
        constructor() {
          const err: any = new Error('SQLITE_BUSY: database is locked');
          err.code = 'SQLITE_BUSY';
          throw err;
        }
      }

      DatabaseService.initWithConfig({
        dbPath,
        backupRootDir,
        DatabaseClass: LockedProductionDb,
        isTestEnv: false,
        retryDelaysMs: [],
        waitFn: () => {}
      });

      // 1. CTE WITH ... INSERT via .all() / .get() / .run()
      const cteSql = `
        -- leading comment
        /* block comment */
        WITH temp_cte AS (SELECT 1 AS id)
        INSERT INTO sessions (name) VALUES ('bypass')
      `;
      expect(isReadOnlySql(cteSql)).toBe(false);
      expect(() => DatabaseService.db.prepare(cteSql).all()).toThrowError(DatabaseSafeModeError);
      expect(() => DatabaseService.db.prepare(cteSql).get()).toThrowError(DatabaseSafeModeError);
      expect(() => DatabaseService.db.prepare(cteSql).run()).toThrowError(DatabaseSafeModeError);

      // 2. .get('INSERT ... RETURNING *')
      const returningSql = 'INSERT INTO sessions (name) VALUES (?) RETURNING *';
      expect(isReadOnlySql(returningSql)).toBe(false);
      expect(() => DatabaseService.db.prepare(returningSql).get('test')).toThrowError(DatabaseSafeModeError);
      expect(() => DatabaseService.db.prepare(returningSql).all('test')).toThrowError(DatabaseSafeModeError);

      // 3. Mutating PRAGMA (with '=') vs read-only PRAGMA (without '=')
      expect(isReadOnlySql('PRAGMA journal_mode = DELETE')).toBe(false);
      expect(isReadOnlySql('PRAGMA integrity_check')).toBe(true);
      expect(() => DatabaseService.db.pragma('journal_mode = DELETE')).toThrowError(DatabaseSafeModeError);
      expect(() => DatabaseService.db.exec('PRAGMA user_version = 99')).toThrowError(DatabaseSafeModeError);
      expect(() => DatabaseService.db.pragma('integrity_check')).not.toThrow();

      // 4. ATTACH / DETACH / VACUUM
      expect(isReadOnlySql("ATTACH DATABASE 'other.db' AS other")).toBe(false);
      expect(() => DatabaseService.db.exec("ATTACH DATABASE 'other.db' AS other")).toThrowError(DatabaseSafeModeError);
      expect(() => DatabaseService.db.prepare("DETACH DATABASE other").all()).toThrowError(DatabaseSafeModeError);

      // 5. Unconditional .run() block even on SELECT
      expect(() => DatabaseService.db.prepare('SELECT * FROM sessions').run()).toThrowError(DatabaseSafeModeError);
    });

    it('rolls back already staged files and preserves original WAL triplet when renameSync throws EBUSY during staging capture', () => {
      writeSampleTriplet();

      let renameCalls = 0;
      const result = quarantineWalTriplet(
        dbPath,
        backupRootDir,
        { code: 'SQLITE_CORRUPT', message: 'malformed' },
        {
          renameSync: (oldPath, newPath) => {
            // Only intercept forward staging capture (into .quarantine-staging)
            if (newPath.endsWith('.quarantine-staging')) {
              renameCalls++;
              if (renameCalls === 2) {
                const err: any = new Error('EBUSY: resource busy or locked during WAL staging rename');
                err.code = 'EBUSY';
                throw err;
              }
            }
            fs.renameSync(oldPath, newPath);
          }
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('Staging capture failed');
      expect(result.errorReason).toContain('EBUSY');

      // All original files must be back in place and intact, with zero leftover .quarantine-staging files
      assertOriginalTripletIntact();
      expect(fs.existsSync(`${dbPath}.quarantine-staging`)).toBe(false);
      expect(fs.existsSync(`${walPath}.quarantine-staging`)).toBe(false);
      expect(fs.existsSync(`${shmPath}.quarantine-staging`)).toBe(false);
    });

    it('cleans up or rolls back orphaned .quarantine-staging files from a previous interrupted crash before starting capture', () => {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      // Case A: main arc.db is missing, only arc.db.quarantine-staging exists -> must roll back to arc.db
      fs.writeFileSync(`${dbPath}.quarantine-staging`, sampleDbBytes);

      // Case B: main arc.db-wal AND arc.db-wal.quarantine-staging both exist -> must keep arc.db-wal and unlink orphan staging
      fs.writeFileSync(walPath, sampleWalBytes);
      fs.writeFileSync(`${walPath}.quarantine-staging`, Buffer.from('STALE-ORPHAN-WAL'));

      cleanupOrRollbackOrphanedStaging(dbPath);

      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.readFileSync(dbPath).equals(sampleDbBytes)).toBe(true);
      expect(fs.existsSync(`${dbPath}.quarantine-staging`)).toBe(false);

      expect(fs.existsSync(walPath)).toBe(true);
      expect(fs.readFileSync(walPath).equals(sampleWalBytes)).toBe(true);
      expect(fs.existsSync(`${walPath}.quarantine-staging`)).toBe(false);
    });
  });

  describe('Task 1.4 — arc_tasks.updated_at Idempotent Migration', () => {
    it('adds updated_at column, backfills updated_at = created_at on legacy table, creates idx_tasks_updated, and is idempotent on repeated init', () => {
      let NativeSqlite: any = null;
      try {
        const Candidate = require('better-sqlite3');
        const probe = new Candidate(':memory:');
        probe.close();
        NativeSqlite = Candidate;
      } catch {
        NativeSqlite = null;
      }

      if (NativeSqlite) {
        const legacyDbPath = path.join(tmpDir, 'legacy_tasks.db');
        const rawDb = new NativeSqlite(legacyDbPath);

        // Create legacy arc_tasks table WITHOUT updated_at column
        rawDb.exec(`
          CREATE TABLE arc_tasks (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            description TEXT,
            completed INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            completed_at INTEGER,
            priority TEXT DEFAULT 'medium',
            category TEXT DEFAULT 'ops',
            due_date TEXT,
            status TEXT DEFAULT 'todo',
            importance TEXT DEFAULT 'regular',
            estimated_minutes INTEGER DEFAULT 30,
            spent_minutes INTEGER DEFAULT 0,
            ai_decomposed INTEGER DEFAULT 0,
            is_my_day INTEGER DEFAULT 0,
            recurrence TEXT,
            attachments TEXT,
            auto_rest_seconds INTEGER,
            objective_id TEXT,
            subtasks TEXT
          );
          INSERT INTO arc_tasks (id, text, created_at) VALUES ('legacy-1', 'Legacy Task One', 1700000000000);
          INSERT INTO arc_tasks (id, text, created_at) VALUES ('legacy-2', 'Legacy Task Two', 1700000050000);
        `);
        rawDb.close();

        // Run DatabaseService.initWithConfig against the legacy database
        DatabaseService.initWithConfig({
          dbPath: legacyDbPath,
          backupRootDir,
          DatabaseClass: NativeSqlite,
          isTestEnv: false
        });

        const cols = DatabaseService.db.prepare('PRAGMA table_info(arc_tasks)').all() as any[];
        expect(cols.some((c: any) => c.name === 'updated_at')).toBe(true);

        const rows = DatabaseService.db
          .prepare('SELECT id, created_at, updated_at FROM arc_tasks ORDER BY id ASC')
          .all() as any[];
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ id: 'legacy-1', created_at: 1700000000000, updated_at: 1700000000000 });
        expect(rows[1]).toEqual({ id: 'legacy-2', created_at: 1700000050000, updated_at: 1700000050000 });

        const indexes = DatabaseService.db.prepare("PRAGMA index_list('arc_tasks')").all() as any[];
        expect(indexes.some((idx: any) => idx.name === 'idx_tasks_updated')).toBe(true);

        // Second init must be idempotent and not throw or duplicate rows
        DatabaseService.close();
        expect(() =>
          DatabaseService.initWithConfig({
            dbPath: legacyDbPath,
            backupRootDir,
            DatabaseClass: NativeSqlite,
            isTestEnv: false
          })
        ).not.toThrow();

        const rowsAfterSecondInit = DatabaseService.db
          .prepare('SELECT id, created_at, updated_at FROM arc_tasks ORDER BY id ASC')
          .all() as any[];
        expect(rowsAfterSecondInit).toHaveLength(2);
        expect(rowsAfterSecondInit[0].updated_at).toBe(1700000000000);
        DatabaseService.close();
      } else {
        // Fallback verification on JSONDatabase when native module is unavailable
        const jsonDbPath = path.join(tmpDir, 'legacy_json.db');
        const jsonDb = new JSONDatabase(jsonDbPath);
        jsonDb.exec('CREATE TABLE arc_tasks (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL)');
        jsonDb.prepare('INSERT INTO arc_tasks (id, text, created_at) VALUES (?, ?, ?)').run(
          'legacy-1',
          'Legacy Task One',
          1700000000000
        );
        // Simulate legacy row without updated_at
        const rawRow = (jsonDb as any).data.arc_tasks[0];
        delete rawRow.updated_at;

        const colsBefore = jsonDb.prepare('PRAGMA table_info(arc_tasks)').all() as any[];
        expect(colsBefore.some((c: any) => c.name === 'updated_at')).toBe(false);

        jsonDb.exec('ALTER TABLE arc_tasks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
        jsonDb.prepare('UPDATE arc_tasks SET updated_at = COALESCE(created_at, 0) WHERE updated_at IS NULL').run();

        const colsAfter = jsonDb.prepare('PRAGMA table_info(arc_tasks)').all() as any[];
        expect(colsAfter.some((c: any) => c.name === 'updated_at')).toBe(true);
        const migratedRow = jsonDb.prepare('SELECT * FROM arc_tasks WHERE id = ?').get('legacy-1');
        expect(migratedRow.updated_at).toBe(1700000000000);
      }
    });
  });
});


