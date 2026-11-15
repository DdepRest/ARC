import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseService } from './database';
import { normalizeIntegrityCheckResult } from './database-recovery.util';

export interface DatabaseSnapshotMetadata {
  engine: string;
  mode: string;
  storageStatus: string;
  isSafeMode: boolean;
  format: 'sqlite' | 'json';
  snapshotEntry: string;
  integrityVerified: boolean;
}

export interface DatabaseSnapshotResult {
  tempDir: string;
  snapshotFilePath: string;
  zipEntryName: string;
  metadata: DatabaseSnapshotMetadata;
}

function resolveFallbackJsonCandidates(dbPath?: string): string[] {
  if (!dbPath || dbPath === ':memory:') return [];
  const candidates: string[] = [];
  if (dbPath.endsWith('.json')) {
    candidates.push(dbPath);
  } else {
    candidates.push(dbPath.replace(/\.db$/i, '_fallback.json'));
    candidates.push(`${dbPath}_fallback.json`);
  }
  return Array.from(new Set(candidates));
}

function validateJsonDatabaseObject(payload: unknown): payload is Record<string, any[]> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return Object.values(payload as Record<string, unknown>).every((val) => Array.isArray(val));
}

function hasAnyDatabaseRows(payload: Record<string, any[]>): boolean {
  return Object.values(payload).some((rows) => Array.isArray(rows) && rows.length > 0);
}

function resolveSqliteVerifierConstructor(dbInstance: any): any {
  const ctor = dbInstance?.constructor;
  if (typeof ctor === 'function' && ctor !== Object && ctor.name !== 'JSONDatabase') {
    return ctor;
  }
  return require('better-sqlite3');
}

export async function cleanupDatabaseSnapshotTemp(snapshot: DatabaseSnapshotResult | null | undefined): Promise<void> {
  if (!snapshot?.tempDir) return;
  try {
    await fs.promises.rm(snapshot.tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort temp cleanup
  }
}

export async function createVerifiedDatabaseSnapshot(tempBaseDir: string = os.tmpdir()): Promise<DatabaseSnapshotResult> {
  const db = DatabaseService.db;
  const health = DatabaseService.getHealthStatus?.();

  if (!db || !health) {
    throw new Error('База данных не инициализирована: невозможно создать согласованный снимок');
  }

  const tempDir = await fs.promises.mkdtemp(path.join(tempBaseDir, 'arc-db-snap-'));
  try {
    const engine = health.engine || 'unknown';
    const mode = health.mode || 'NORMAL';
    const storageStatus = health.storageStatus || 'PERSISTENT_SQLITE';
    const isSafeMode = Boolean(health.isSafeMode);

    // 1. Live SQLite Online Backup API (better-sqlite3 db.backup)
    if (!isSafeMode && typeof db.backup === 'function' && (engine === 'sqlite' || engine === 'sqlite-memory')) {
      const snapshotFilePath = path.join(tempDir, 'arc.db');
      await db.backup(snapshotFilePath);

      const stat = await fs.promises.stat(snapshotFilePath).catch(() => null);
      if (!stat || !stat.isFile() || stat.size <= 0) {
        throw new Error('Снимок SQLite создан пустым или отсутствует на диске');
      }

      const SqliteCtor = resolveSqliteVerifierConstructor(db);
      let verifyConn: any = null;
      try {
        verifyConn = new SqliteCtor(snapshotFilePath, { readonly: true, fileMustExist: true });
        const checkRaw = verifyConn.pragma('integrity_check');
        const normalized = normalizeIntegrityCheckResult(checkRaw);
        if (normalized.status !== 'OK') {
          throw new Error(`Проверка целостности снимка SQLite не пройдена: ${normalized.details}`);
        }
      } finally {
        try {
          if (verifyConn && typeof verifyConn.close === 'function') {
            verifyConn.close();
          }
        } catch {
          // ignore close error
        }
      }

      return {
        tempDir,
        snapshotFilePath,
        zipEntryName: 'database/arc.db',
        metadata: {
          engine,
          mode,
          storageStatus,
          isSafeMode: false,
          format: 'sqlite',
          snapshotEntry: 'database/arc.db',
          integrityVerified: true
        }
      };
    }

    // 2. JSON fallback or DB_SAFE_MODE path (never mislabeled as .db SQLite)
    let jsonPayload: Record<string, any[]> | null = null;
    const isJsonDb = Boolean(db.isJsonDatabase || typeof db.getSnapshotData === 'function');

    if (isSafeMode) {
      // Check persisted _fallback.json on disk first
      for (const candidate of resolveFallbackJsonCandidates(health.dbPath)) {
        if (!fs.existsSync(candidate)) continue;
        const rawText = await fs.promises.readFile(candidate, 'utf8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch (parseErr: any) {
          throw new Error(`Файл JSON fallback повреждён (${path.basename(candidate)}): ${parseErr?.message || parseErr}`);
        }
        if (!validateJsonDatabaseObject(parsed)) {
          throw new Error(`Некорректная структура JSON fallback (${path.basename(candidate)})`);
        }
        jsonPayload = parsed;
        break;
      }

      // Otherwise allow non-empty read-only JSON snapshot already loaded into JSONDatabase
      if (!jsonPayload && isJsonDb && typeof db.getSnapshotData === 'function') {
        const memSnapshot = db.getSnapshotData();
        if (validateJsonDatabaseObject(memSnapshot) && hasAnyDatabaseRows(memSnapshot)) {
          jsonPayload = memSnapshot;
        }
      }

      if (!jsonPayload) {
        throw new Error(
          `Невозможно создать согласованный снимок в режиме ${mode} (${health.errorCode || 'DB_SAFE_MODE'}): отсутствует доступный источник данных`
        );
      }
    } else if (isJsonDb && typeof db.getSnapshotData === 'function') {
      const memSnapshot = db.getSnapshotData();
      if (!validateJsonDatabaseObject(memSnapshot)) {
        throw new Error('Состояние JSONDatabase имеет некорректную структуру');
      }
      jsonPayload = memSnapshot;
    } else {
      throw new Error(`Неподдерживаемый движок БД для резервного снимка: ${engine}`);
    }

    const serialized = JSON.stringify(jsonPayload, null, 2);
    const verifiedParsed = JSON.parse(serialized);
    if (!validateJsonDatabaseObject(verifiedParsed)) {
      throw new Error('Верификация JSON-снимка не пройдена');
    }

    const snapshotFilePath = path.join(tempDir, 'arc_fallback.json');
    await fs.promises.writeFile(snapshotFilePath, serialized, 'utf8');

    return {
      tempDir,
      snapshotFilePath,
      zipEntryName: 'database/arc_fallback.json',
      metadata: {
        engine,
        mode,
        storageStatus,
        isSafeMode,
        format: 'json',
        snapshotEntry: 'database/arc_fallback.json',
        integrityVerified: true
      }
    };
  } catch (err) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
