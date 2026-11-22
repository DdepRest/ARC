import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import {
    DatabaseSafeModeError,
    isMutatingSql,
    isReadOnlySql,
    openOrRecoverSqliteDatabase,
    type DatabaseHealthStatus,
    type QuarantineFsHooks,
    type StoragePersistenceStatus
} from './database-recovery.util';
import {
    runDatabaseMigrations,
    type MigrationRunnerOptions
} from './database-migrations.runner';
import { CORE_EMPTY_SCHEMA_DDL } from './database-migrations.registry';
import { getDatabaseEngineMetadata } from './database-engine-metadata';

// Graceful, Zero-Dependency JSON Database Fallback to mimic better-sqlite3's API
export class JSONStatement {
    private sql: string;
    private data: { [table: string]: any[] };
    private saveCallback: () => void;
    private isWriteLocked?: () => boolean;

    constructor(
        sql: string,
        data: { [table: string]: any[] },
        saveCallback: () => void,
        isWriteLocked?: () => boolean
    ) {
        this.sql = sql.trim();
        this.data = data;
        this.saveCallback = saveCallback;
        this.isWriteLocked = isWriteLocked;
    }

    public run(...args: any[]): { changes: number; lastInsertRowid: number | string; storageStatus?: StoragePersistenceStatus } {
        if (this.isWriteLocked && this.isWriteLocked()) {
            throw new DatabaseSafeModeError(this.sql);
        }
        const sqlUpper = this.sql.toUpperCase();
        let changes = 0;
        let lastInsertRowid: number | string = 0;
        const params = args.flat();

        try {
            if (sqlUpper.startsWith('INSERT')) {
                const match = this.sql.match(/INSERT\s+(?:OR\s+[A-Z]+\s+)?INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
                if (match) {
                    const tableName = match[1];
                    const cols = match[2].split(',').map(c => c.trim());
                    
                    if (!this.data[tableName]) {
                        this.data[tableName] = [];
                    }

                    const newRow: any = {};
                    cols.forEach((col, index) => {
                        const paramVal = params[index];
                        newRow[col] = paramVal !== undefined ? paramVal : null;
                    });

                    // Ensure timestamps if not provided
                    if (!newRow.created_at) newRow.created_at = new Date().toISOString();
                    if (!newRow.updated_at) newRow.updated_at = new Date().toISOString();
                    if (newRow.is_pinned === undefined) newRow.is_pinned = 0;
                    if (newRow.is_archived === undefined) newRow.is_archived = 0;
                    if (newRow.is_deleted === undefined) newRow.is_deleted = 0;
                    if (newRow.deleted_at === undefined) newRow.deleted_at = null;
                    if (newRow.message_count === undefined) newRow.message_count = 0;

                    const idIndex = cols.findIndex(c => c.toLowerCase() === 'id');
                    const hasId = idIndex !== -1 && newRow[cols[idIndex]] !== null && newRow[cols[idIndex]] !== undefined;
                    const idVal = hasId ? newRow[cols[idIndex]] : (Date.now() + Math.floor(Math.random() * 1000));
                    newRow.id = idVal;

                    if (hasId && (sqlUpper.includes('REPLACE') || sqlUpper.includes('INSERT OR REPLACE') || sqlUpper.includes('ON CONFLICT'))) {
                        const existingIndex = this.data[tableName].findIndex(row => row.id === idVal);
                        if (existingIndex !== -1) {
                            const existingRow = this.data[tableName][existingIndex];
                            const mergedRow = { ...existingRow, ...newRow };
                            if (sqlUpper.includes('MAX(EXCLUDED.UPDATED_AT, ARC_TASKS.UPDATED_AT)')) {
                                mergedRow.updated_at = Math.max(
                                    Number(newRow.updated_at) || 0,
                                    Number(existingRow.updated_at) || 0
                                );
                            }
                            this.data[tableName][existingIndex] = mergedRow;
                            lastInsertRowid = idVal;
                            changes = 1;
                        } else {
                            this.data[tableName].push(newRow);
                            lastInsertRowid = idVal;
                            changes = 1;
                        }
                    } else {
                        this.data[tableName].push(newRow);
                        lastInsertRowid = idVal;
                        changes = 1;
                    }
                }
            } else if (sqlUpper.startsWith('UPDATE')) {
                const match = this.sql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i);
                if (match) {
                    const tableName = match[1];
                    const setClause = match[2];
                    const whereClause = match[3];

                    if (this.data[tableName]) {
                        const setAssignments = setClause.split(',').map(s => s.trim());
                        const setParamCount = (setClause.match(/\?/g) || []).length;
                        const rowsToUpdate = this.data[tableName].filter(row => {
                            if (!whereClause) return true;
                            return this.evaluateWhere(whereClause, row, params, setParamCount);
                        });

                        rowsToUpdate.forEach(row => {
                            let tempParamIdx = 0;
                            setAssignments.forEach(assignment => {
                                const parts = assignment.split('=');
                                if (parts.length === 2) {
                                    const colName = parts[0].trim();
                                    const valExpr = parts[1].trim();
                                    if (valExpr === '?') {
                                        row[colName] = params[tempParamIdx++];
                                    } else if (/^COALESCE\s*\(\s*created_at\s*,\s*0\s*\)$/i.test(valExpr)) {
                                        row[colName] = row.created_at ?? 0;
                                    } else if (valExpr.toUpperCase() === 'CURRENT_TIMESTAMP') {
                                        row[colName] = new Date().toISOString();
                                    } else if (valExpr.includes('+') || valExpr.includes('-')) {
                                        // e.g. message_count = message_count + 1
                                        const mathMatch = valExpr.match(/([a-zA-Z0-9_]+)\s*(\+|\-)\s*(\d+)/);
                                        if (mathMatch) {
                                            const baseCol = mathMatch[1];
                                            const op = mathMatch[2];
                                            const amount = parseInt(mathMatch[3], 10);
                                            const currentVal = Number(row[baseCol] || 0);
                                            row[colName] = op === '+' ? currentVal + amount : Math.max(0, currentVal - amount);
                                        }
                                    } else if ((valExpr.startsWith("'") && valExpr.endsWith("'")) || (valExpr.startsWith('"') && valExpr.endsWith('"'))) {
                                        row[colName] = valExpr.slice(1, -1);
                                    } else if (!isNaN(Number(valExpr))) {
                                        row[colName] = Number(valExpr);
                                    } else {
                                        row[colName] = valExpr;
                                    }
                                }
                            });
                            changes++;
                        });
                    }
                }
            } else if (sqlUpper.startsWith('DELETE')) {
                const match = this.sql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+))?$/i);
                if (match) {
                    const tableName = match[1];
                    const whereClause = match[2];

                    if (this.data[tableName]) {
                        const originalLen = this.data[tableName].length;
                        this.data[tableName] = this.data[tableName].filter(row => {
                            if (!whereClause) return false;
                            return !this.evaluateWhere(whereClause, row, params, 0);
                        });
                        changes = originalLen - this.data[tableName].length;
                    }
                }
            }
            this.saveCallback();
        } catch (e) {
            console.error('[FallbackDB] Error executing Statement.run:', e);
        }

        return { changes, lastInsertRowid };
    }

    public get(...args: any[]): any {
        if (this.isWriteLocked && this.isWriteLocked() && !isReadOnlySql(this.sql)) {
            throw new DatabaseSafeModeError(this.sql);
        }
        const rows = this.all(...args);
        return rows.length > 0 ? rows[0] : undefined;
    }

    public all(...args: any[]): any[] {
        if (this.isWriteLocked && this.isWriteLocked() && !isReadOnlySql(this.sql)) {
            throw new DatabaseSafeModeError(this.sql);
        }
        const params = args.flat();

        try {
            const pragmaMatch = this.sql.match(/PRAGMA\s+table_info\s*\(\s*([a-zA-Z0-9_]+)\s*\)/i);
            if (pragmaMatch) {
                const tbl = pragmaMatch[1];
                const sample = this.data[tbl] && this.data[tbl][0];
                if (sample) {
                    return Object.keys(sample).map((name, cid) => ({ cid, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: name === 'id' ? 1 : 0 }));
                }
                return [];
            }

            if (this.sql.includes('sqlite_master')) {
                const matchName = this.sql.match(/name\s*=\s*['"]([a-zA-Z0-9_]+)['"]/i) || (params[0] && { 1: params[0] });
                if (matchName) {
                    const tbl = matchName[1];
                    if (this.data[tbl]) {
                        return [{ name: tbl, sql: `CREATE TABLE ${tbl} (id TEXT PRIMARY KEY, ROLLED_BACK)` }];
                    }
                    return [];
                }
                return Object.keys(this.data)
                    .filter((k) => !k.startsWith('sqlite_'))
                    .map((name) => ({ name, sql: `CREATE TABLE ${name} (id TEXT PRIMARY KEY, ROLLED_BACK)` }));
            }

            const match = this.sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+([0-9?]+)(?:\s+OFFSET\s+([0-9?]+))?)?$/i);
            if (match) {
                const selectClause = match[1].trim();
                const tableName = match[2].trim();
                const whereClause = match[3];
                const orderByClause = match[4];
                const limitClause = match[5];
                const offsetClause = match[6];

                let rows = this.data[tableName] || [];

                if (whereClause) {
                    rows = rows.filter(row => this.evaluateWhere(whereClause, row, params, 0));
                }

                if (/COUNT\s*\(\s*\*\s*\)/i.test(selectClause)) {
                    const aggRow: Record<string, any> = {};
                    const countAlias = selectClause.match(/COUNT\s*\(\s*\*\s*\)\s+as\s+([a-zA-Z0-9_]+)/i)?.[1] || 'COUNT(*)';
                    aggRow[countAlias] = rows.length;
                    const sumMatch = selectClause.match(/SUM\s*\(\s*([a-zA-Z0-9_]+)\s*\)(?:\s*,\s*0\s*\))?\s+as\s+([a-zA-Z0-9_]+)/i);
                    if (sumMatch) {
                        const sumCol = sumMatch[1];
                        const sumAlias = sumMatch[2];
                        aggRow[sumAlias] = rows.reduce((acc, r) => acc + (Number(r[sumCol]) || 0), 0);
                    }
                    const minMatch = selectClause.match(/MIN\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s+as\s+([a-zA-Z0-9_]+)/i);
                    if (minMatch) {
                        const minCol = minMatch[1];
                        const minAlias = minMatch[2];
                        aggRow[minAlias] = rows.length > 0
                            ? rows.reduce((min, r) => (r[minCol] !== null && r[minCol] !== undefined && r[minCol] < min ? r[minCol] : min), rows[0][minCol])
                            : null;
                    }
                    return [aggRow];
                }

                let resultRows = rows.map(r => ({ ...r }));

                if (orderByClause) {
                    const orderParts = orderByClause.split(',').map(o => o.trim());
                    resultRows.sort((a, b) => {
                        for (const part of orderParts) {
                            const [col, direction] = part.split(/\s+/);
                            const isDesc = direction && direction.toUpperCase() === 'DESC';
                            const valA = a[col];
                            const valB = b[col];

                            if (valA === valB) continue;
                            if (valA === undefined || valA === null) return 1;
                            if (valB === undefined || valB === null) return -1;

                            if (col === 'updated_at' || col === 'created_at' || col === 'deleted_at') {
                                const timeA = new Date(valA).getTime();
                                const timeB = new Date(valB).getTime();
                                if (!isNaN(timeA) && !isNaN(timeB)) {
                                    return isDesc ? timeB - timeA : timeA - timeB;
                                }
                            }

                            if (typeof valA === 'number' && typeof valB === 'number') {
                                return isDesc ? valB - valA : valA - valB;
                            }
                            const strA = String(valA);
                            const strB = String(valB);
                            return isDesc ? strB.localeCompare(strA) : strA.localeCompare(strB);
                        }
                        return 0;
                    });
                }

                let offsetVal = 0;
                if (offsetClause) {
                    offsetVal = parseInt(offsetClause, 10);
                    if (isNaN(offsetVal)) {
                        offsetVal = params[params.length - 1] || 0;
                    }
                }

                if (limitClause) {
                    let limitVal = parseInt(limitClause, 10);
                    if (isNaN(limitVal)) {
                        limitVal = offsetClause ? params[params.length - 2] : params[params.length - 1];
                    }
                    if (typeof limitVal === 'number' && !isNaN(limitVal)) {
                        resultRows = resultRows.slice(offsetVal, offsetVal + limitVal);
                    }
                } else if (offsetVal > 0) {
                    resultRows = resultRows.slice(offsetVal);
                }

                return resultRows;
            }
        } catch (e) {
            console.error('[FallbackDB] Error executing Statement.all:', e);
        }

        return [];
    }

    private evaluateWhere(whereClause: string, row: any, params: any[], paramOffset: number): boolean {
        let formattedWhere = whereClause;
        let paramIdx = paramOffset;
        
        formattedWhere = formattedWhere.replace(/\?/g, () => {
            const val = params[paramIdx++];
            if (val === undefined || val === null) return 'null';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return String(val);
        });

        try {
            const parts = formattedWhere.split(/\s+AND\s+/i);
            for (const part of parts) {
                const condition = part.trim();
                
                if (condition === '1=1' || condition === '1 = 1') {
                    continue;
                }
                if (condition === '1=0' || condition === '1 = 0') {
                    return false;
                }

                if (condition.toUpperCase().includes('IS NULL')) {
                    const col = condition.replace(/IS\s+NULL/i, '').trim();
                    if (row[col] !== null && row[col] !== undefined) return false;
                    continue;
                }
                
                if (condition.toUpperCase().includes('IS NOT NULL')) {
                    const col = condition.replace(/IS\s+NOT\s+NULL/i, '').trim();
                    if (row[col] === null || row[col] === undefined) return false;
                    continue;
                }

                const opMatch = condition.match(/^([a-zA-Z0-9_]+)\s*(=|!=|<>|<|>|LIKE)\s*([\s\S]+)$/i);
                if (opMatch) {
                    const col = opMatch[1];
                    const op = opMatch[2];
                    let valStr = opMatch[3].trim();
                    
                    if ((valStr.startsWith("'") && valStr.endsWith("'")) || (valStr.startsWith('"') && valStr.endsWith('"'))) {
                        valStr = valStr.substring(1, valStr.length - 1);
                    }

                    const rowVal = row[col];
                    
                    if (op === '=') {
                        if (String(rowVal) !== String(valStr)) return false;
                    } else if (op === '!=' || op === '<>') {
                        if (String(rowVal) === String(valStr)) return false;
                    } else if (op === '<') {
                        if (Number(rowVal) >= Number(valStr)) return false;
                    } else if (op === '>') {
                        if (Number(rowVal) <= Number(valStr)) return false;
                    } else if (op.toUpperCase() === 'LIKE') {
                        const regexStr = valStr.replace(/%/g, '.*');
                        const regex = new RegExp(`^${regexStr}$`, 'i');
                        if (!regex.test(String(rowVal))) return false;
                    }
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }
}

export class JSONDatabase {
    public readonly isJsonDatabase = true;
    public readonly supportsTransactions = false;
    public readonly supportsRollback = false;
    private data: { [table: string]: any[] } = {};
    private dbFilePath: string;
    private inMemoryOnly: boolean;
    private isTestStorage: boolean;
    private safeModeWriteLocked: boolean = false;
    private userVersion: number = 0;

    constructor(
        dbFilePath: string,
        options?: { inMemoryOnly?: boolean; safeModeReadOnly?: boolean; isTestMode?: boolean }
    ) {
        this.dbFilePath = dbFilePath.replace(/\.db$/, '_fallback.json');
        this.inMemoryOnly = Boolean(options?.inMemoryOnly || options?.safeModeReadOnly);
        this.isTestStorage = Boolean(options?.isTestMode);
        if (!this.inMemoryOnly) {
            this.load();
        }
        if (options?.safeModeReadOnly) {
            this.safeModeWriteLocked = true;
        }
    }

    public getDbFilePath(): string {
        return this.dbFilePath;
    }

    public isInMemoryOnly(): boolean {
        return this.inMemoryOnly;
    }

    public getSnapshotData(): Record<string, any[]> {
        return JSON.parse(JSON.stringify(this.data));
    }

    public enableSafeModeWriteLock() {
        this.safeModeWriteLocked = true;
        this.inMemoryOnly = true;
    }

    public isSafeModeWriteLocked(): boolean {
        return this.safeModeWriteLocked;
    }

    public getStorageStatus(): StoragePersistenceStatus {
        if (this.inMemoryOnly || this.safeModeWriteLocked) {
            return 'VOLATILE_STORAGE';
        }
        return this.isTestStorage ? 'TEST_EPHEMERAL' : 'PERSISTENT_JSON_DEGRADED';
    }

    private load() {
        if (this.inMemoryOnly) return;
        try {
            if (fs.existsSync(this.dbFilePath)) {
                const content = fs.readFileSync(this.dbFilePath, 'utf8');
                this.data = JSON.parse(content);
                if (Array.isArray(this.data.schema_migrations)) {
                    const appliedVersions = this.data.schema_migrations
                        .filter((r) => String(r?.status || '').toUpperCase() === 'APPLIED')
                        .map((r) => Number(r?.version || 0))
                        .filter((v) => Number.isInteger(v) && v > 0);
                    this.userVersion = appliedVersions.length > 0 ? Math.max(...appliedVersions) : 0;
                }
            }
        } catch (e) {
            console.error('[FallbackDB] Failed to load JSON database file:', e);
            this.data = {};
            this.userVersion = 0;
        }
    }

    private save() {
        if (this.inMemoryOnly) return;
        const tmpPath = `${this.dbFilePath}.tmp-${process.pid}`;
        try {
            const dir = path.dirname(this.dbFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
            fs.renameSync(tmpPath, this.dbFilePath);
        } catch (e) {
            try {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch { /* ignore */ }
            console.error('[FallbackDB] Failed to save JSON database file:', e);
        }
    }

    public pragma(sql: string, options?: { simple?: boolean }) {
        const pragmaSql = /^\s*PRAGMA\b/i.test(sql) ? sql : `PRAGMA ${sql}`;
        if (this.safeModeWriteLocked && !isReadOnlySql(pragmaSql)) {
            throw new DatabaseSafeModeError(pragmaSql);
        }
        const setVersionMatch = sql.match(/user_version\s*=\s*(\d+)/i);
        if (setVersionMatch) {
            this.userVersion = parseInt(setVersionMatch[1], 10);
            return [];
        }
        if (/\buser_version\b/i.test(sql)) {
            return options?.simple ? this.userVersion : [{ user_version: this.userVersion }];
        }
        return [];
    }

    public exec(sql: string) {
        if (this.safeModeWriteLocked && !isReadOnlySql(sql)) {
            throw new DatabaseSafeModeError(sql);
        }
        const cleanSql = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
        const commands = cleanSql.split(';').map(cmd => cmd.trim()).filter(Boolean);

        for (const cmd of commands) {
            const uvSet = cmd.match(/^PRAGMA\s+user_version\s*=\s*(\d+)$/i);
            if (uvSet) {
                this.userVersion = parseInt(uvSet[1], 10);
                continue;
            }
            if (cmd.toUpperCase().startsWith('CREATE TABLE')) {
                const match = cmd.match(/CREATE TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
                if (match) {
                    const tableName = match[1];
                    if (!this.data[tableName]) {
                        this.data[tableName] = [];
                    }
                }
            } else if (cmd.toUpperCase().startsWith('ALTER TABLE')) {
                const match = cmd.match(/ALTER TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+([a-zA-Z0-9_]+)/i);
                if (match) {
                    const tableName = match[1];
                    const columnName = match[2];
                    if (this.data[tableName]) {
                        for (const row of this.data[tableName]) {
                            if (row[columnName] === undefined) {
                                row[columnName] = null;
                            }
                        }
                    }
                }
            }
        }
        this.save();
        return this;
    }

    public prepare(sql: string) {
        return new JSONStatement(
            sql,
            this.data,
            () => this.save(),
            () => this.safeModeWriteLocked
        );
    }

    public transaction<T extends (...args: any[]) => any>(fn: T): T {
        return ((...args: any[]) => {
            if (this.safeModeWriteLocked) {
                throw new DatabaseSafeModeError('TRANSACTION');
            }
            return fn(...args);
        }) as unknown as T;
    }
}

export class DatabaseService {
    public static db: any;
    public static healthStatus: DatabaseHealthStatus = {
        mode: 'NORMAL',
        isSafeMode: false,
        readOnly: false,
        storageStatus: 'PERSISTENT_SQLITE',
        engine: 'sqlite',
        dbPath: '',
        ...getDatabaseEngineMetadata('sqlite', 'PERSISTENT_SQLITE'),
        timestamp: new Date().toISOString()
    };

    public static getHealthStatus(): DatabaseHealthStatus {
        return this.healthStatus;
    }

    public static isSafeMode(): boolean {
        return Boolean(this.healthStatus?.isSafeMode);
    }

    public static initWithConfig(config: {
        dbPath: string;
        backupRootDir?: string;
        DatabaseClass?: any;
        isTestEnv?: boolean;
        isPackaged?: boolean;
        allowDevJsonFallback?: boolean;
        retryDelaysMs?: number[];
        waitFn?: (ms: number) => void;
        fsHooks?: QuarantineFsHooks;
        migrationOptions?: Omit<MigrationRunnerOptions, 'dbPath' | 'backupRootDir' | 'DatabaseClass'>;
    }): DatabaseHealthStatus {
        const {
            dbPath,
            DatabaseClass,
            isTestEnv = false,
            isPackaged = true,
            allowDevJsonFallback = false,
            retryDelaysMs,
            waitFn,
            fsHooks,
            migrationOptions
        } = config;
        const backupRootDir =
            config.backupRootDir ||
            path.join(path.dirname(path.dirname(dbPath)), 'backups');

        if (isTestEnv) {
            if (DatabaseClass) {
                this.db = new DatabaseClass(':memory:');
                this.healthStatus = {
                    mode: 'TEST_MEMORY',
                    isSafeMode: false,
                    readOnly: false,
                    storageStatus: 'TEST_EPHEMERAL',
                    engine: 'sqlite-memory',
                    dbPath: ':memory:',
                    ...getDatabaseEngineMetadata('sqlite-memory', 'TEST_EPHEMERAL'),
                    timestamp: new Date().toISOString()
                };
            } else {
                this.db = new JSONDatabase('test_arc_fallback.json', { isTestMode: true });
                this.healthStatus = {
                    mode: 'TEST_MEMORY',
                    isSafeMode: false,
                    readOnly: false,
                    storageStatus: 'TEST_EPHEMERAL',
                    engine: 'json-test',
                    dbPath: 'test_arc_fallback.json',
                    ...getDatabaseEngineMetadata('json-test', 'TEST_EPHEMERAL'),
                    timestamp: new Date().toISOString()
                };
            }
            this.initTables({
                dbPath: isTestEnv ? ':memory:' : dbPath,
                backupRootDir,
                DatabaseClass,
                ...migrationOptions
            });
            return this.healthStatus;
        }

        if (!DatabaseClass) {
            const sqliteFileExists = Boolean(dbPath && dbPath !== ':memory:' && fs.existsSync(dbPath));
            if (!isPackaged && allowDevJsonFallback && !sqliteFileExists) {
                const jsonDb = new JSONDatabase(dbPath, { inMemoryOnly: false, isTestMode: false });
                this.db = jsonDb;
                this.healthStatus = {
                    mode: 'DEGRADED',
                    isSafeMode: false,
                    readOnly: false,
                    storageStatus: 'PERSISTENT_JSON_DEGRADED',
                    engine: 'json-degraded',
                    dbPath: jsonDb.getDbFilePath(),
                    ...getDatabaseEngineMetadata('json-degraded', 'PERSISTENT_JSON_DEGRADED'),
                    errorCategory: 'OTHER_ERROR',
                    errorCode: 'SQLITE_NATIVE_MISSING_DEV_JSON',
                    errorMessage:
                        'Native better-sqlite3 module unavailable in dev mode; using limited JSON fallback without ACID transactions.',
                    userNotice:
                        'Нативный драйвер SQLite (better-sqlite3) недоступен. Включён ограниченный dev-режим JSON fallback (без ACID-транзакций, rollback и FTS5).',
                    timestamp: new Date().toISOString()
                };
                this.initTables({
                    dbPath: '',
                    backupRootDir,
                    ...migrationOptions
                });
                return this.healthStatus;
            }

            const safeDb = new JSONDatabase(dbPath, { inMemoryOnly: true });
            this.db = safeDb;
            this.healthStatus = {
                mode: 'DB_SAFE_MODE',
                isSafeMode: true,
                readOnly: true,
                storageStatus: 'VOLATILE_STORAGE',
                engine: 'json-safe-mode',
                dbPath,
                ...getDatabaseEngineMetadata('json-safe-mode', 'VOLATILE_STORAGE'),
                errorCategory: 'OTHER_ERROR',
                errorCode: 'SQLITE_NATIVE_MISSING',
                errorMessage: sqliteFileExists && !isPackaged
                    ? 'Native better-sqlite3 module unavailable while existing arc.db is present on disk.'
                    : 'Native better-sqlite3 module is unavailable in production runtime.',
                userNotice:
                    'Драйвер SQLite недоступен. Активирован защищённый диагностический режим DB_SAFE_MODE (запись заблокирована).',
                timestamp: new Date().toISOString()
            };
            this.bootstrapSafeModeTables(safeDb);
            safeDb.enableSafeModeWriteLock();
            return this.healthStatus;
        }

        const outcome = openOrRecoverSqliteDatabase({
            dbPath,
            backupRootDir,
            DatabaseClass,
            retryDelaysMs,
            waitFn,
            fsHooks
        });

        this.healthStatus = {
            ...outcome.health,
            ...getDatabaseEngineMetadata(outcome.health.engine, outcome.health.storageStatus)
        };

        if (outcome.instance) {
            this.db = outcome.instance;
            const migResult = runDatabaseMigrations(this.db, {
                dbPath,
                backupRootDir,
                DatabaseClass,
                ...migrationOptions
            });

            if (migResult.ok) {
                this.healthStatus.schemaVersion = migResult.status.currentVersion;
                this.healthStatus.migration = migResult.status;
                if (migResult.status.backupDir && !this.healthStatus.backupPath) {
                    this.healthStatus.backupPath = migResult.status.backupDir;
                }
            } else {
                try {
                    if (typeof outcome.instance.close === 'function') {
                        outcome.instance.close();
                    }
                } catch {
                    // ignore close errors
                }
                const safeDb = new JSONDatabase(dbPath, { inMemoryOnly: true });
                this.db = safeDb;
                this.bootstrapSafeModeTables(safeDb);
                safeDb.enableSafeModeWriteLock();

                const now = new Date().toISOString();
                this.healthStatus = {
                    mode: 'DB_SAFE_MODE',
                    isSafeMode: true,
                    readOnly: true,
                    storageStatus: 'VOLATILE_STORAGE',
                    engine: 'json-safe-mode',
                    dbPath,
                    schemaVersion: migResult.status.currentVersion,
                    backupPath: migResult.status.backupDir || outcome.health.backupPath,
                    ...getDatabaseEngineMetadata('json-safe-mode', 'VOLATILE_STORAGE'),
                    errorCategory: 'OTHER_ERROR',
                    errorCode: migResult.status.errorCode || 'SQLITE_MIGRATION_FAILED',
                    errorMessage: migResult.status.errorMessage || 'Database schema migration failed.',
                    userNotice:
                        'Ошибка проверки или обновления схемы БД. Исходная база и резервная копия сохранены; активирован режим DB_SAFE_MODE (запись заблокирована).',
                    timestamp: now,
                    lastRecovery: {
                        timestamp: now,
                        reason: migResult.status.errorMessage || 'Migration failed',
                        quarantined: false,
                        backupDir: migResult.status.backupDir
                    },
                    migration: migResult.status
                };
            }
        } else {
            const safeDb = new JSONDatabase(dbPath, { inMemoryOnly: true });
            this.db = safeDb;
            this.bootstrapSafeModeTables(safeDb);
            safeDb.enableSafeModeWriteLock();
        }

        return this.healthStatus;
    }

    static init() {
        let dbPath = '';
        let DatabaseClass: any;

        try {
            const CandidateClass = require('better-sqlite3');
            const probe = new CandidateClass(':memory:');
            probe.close();
            DatabaseClass = CandidateClass;
        } catch (err: any) {
            DatabaseClass = undefined;
            console.warn('[DatabaseService] Native better-sqlite3 binding unavailable:', err?.message || err);
        }

        const isTestEnv = Boolean(process.env.NODE_ENV === 'test' || process.env.VITEST);

        try {
            if (isTestEnv) {
                this.initWithConfig({
                    dbPath: ':memory:',
                    DatabaseClass,
                    isTestEnv: true
                });
            } else {
                const userDataPath = app ? app.getPath('userData') : '';
                if (!userDataPath) {
                    throw new Error('Electron app userData path not available');
                }
                if (!fs.existsSync(userDataPath)) {
                    fs.mkdirSync(userDataPath, { recursive: true });
                }
                const dbDir = path.join(userDataPath, 'database');
                if (!fs.existsSync(dbDir)) {
                    fs.mkdirSync(dbDir, { recursive: true });
                }
                const backupRootDir = path.join(userDataPath, 'backups');
                const nestedDb = path.join(dbDir, 'arc.db');
                const rootDb = path.join(userDataPath, 'arc.db');
                if (fs.existsSync(rootDb) && !fs.existsSync(nestedDb)) {
                    try {
                        fs.renameSync(rootDb, nestedDb);
                        if (fs.existsSync(`${rootDb}-wal`)) fs.renameSync(`${rootDb}-wal`, `${nestedDb}-wal`);
                        if (fs.existsSync(`${rootDb}-shm`)) fs.renameSync(`${rootDb}-shm`, `${nestedDb}-shm`);
                    } catch {
                        // migration fallback
                    }
                }
                dbPath = fs.existsSync(nestedDb) ? nestedDb : (fs.existsSync(rootDb) ? rootDb : nestedDb);
                const isPackaged = Boolean(app?.isPackaged);
                this.initWithConfig({
                    dbPath,
                    backupRootDir,
                    DatabaseClass,
                    isTestEnv: false,
                    isPackaged,
                    allowDevJsonFallback: !isPackaged
                });
            }
        } catch (e: any) {
            console.warn('[DatabaseService] Could not open db at userData, entering safe fallback setup:', e);
            dbPath = isTestEnv ? ':memory:' : path.join(process.cwd(), 'arc.db');
            if (isTestEnv) {
                this.initWithConfig({ dbPath: ':memory:', DatabaseClass, isTestEnv: true });
            } else {
                const safeDb = new JSONDatabase(dbPath, { inMemoryOnly: true });
                this.db = safeDb;
                this.healthStatus = {
                    mode: 'DB_SAFE_MODE',
                    isSafeMode: true,
                    readOnly: true,
                    storageStatus: 'VOLATILE_STORAGE',
                    engine: 'json-safe-mode',
                    dbPath,
                    ...getDatabaseEngineMetadata('json-safe-mode', 'VOLATILE_STORAGE'),
                    errorCategory: 'OTHER_ERROR',
                    errorCode: e?.code || 'USERDATA_UNAVAILABLE',
                    errorMessage: e?.message || String(e),
                    userNotice:
                        'Директория данных недоступна. Активирован защищённый диагностический режим DB_SAFE_MODE (запись заблокирована).',
                    timestamp: new Date().toISOString()
                };
                this.bootstrapSafeModeTables(safeDb);
                safeDb.enableSafeModeWriteLock();
            }
        }

        console.log(
            `[DatabaseService] Initialized (mode=${this.healthStatus.mode}, storage=${this.healthStatus.storageStatus}) at`,
            dbPath || this.healthStatus.dbPath
        );
    }

    static close() {
        try {
            if (this.db && typeof this.db.close === 'function') {
                this.db.close();
                this.db = null;
                console.log('[DatabaseService] SQLite Database connection successfully closed.');
            }
        } catch (e) {
            console.warn('[DatabaseService] Error closing database connection:', e);
        }
    }

    private static bootstrapSafeModeTables(safeDb: JSONDatabase) {
        safeDb.exec(CORE_EMPTY_SCHEMA_DDL);
    }

    private static initTables(options?: Partial<MigrationRunnerOptions>) {
        if (!this.db) return;
        const dbPath = options?.dbPath ?? this.healthStatus?.dbPath ?? '';
        const migResult = runDatabaseMigrations(this.db, {
            dbPath,
            backupRootDir: options?.backupRootDir,
            DatabaseClass: options?.DatabaseClass,
            migrations: options?.migrations,
            beforeMigrationStep: options?.beforeMigrationStep,
            backupHooks: options?.backupHooks
        });
        if (this.healthStatus && migResult.status) {
            this.healthStatus.schemaVersion = migResult.status.currentVersion;
            this.healthStatus.migration = migResult.status;
        }
        if (!migResult.ok) {
            console.error('[DatabaseService] Migration failed during initTables:', migResult.status);
        }
    }
}
