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
                        return [{ sql: `CREATE TABLE ${tbl} (id TEXT PRIMARY KEY, ROLLED_BACK)` }];
                    }
                }
                return [];
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
    private data: { [table: string]: any[] } = {};
    private dbFilePath: string;
    private inMemoryOnly: boolean;
    private safeModeWriteLocked: boolean = false;

    constructor(dbFilePath: string, options?: { inMemoryOnly?: boolean; safeModeReadOnly?: boolean }) {
        this.dbFilePath = dbFilePath.replace(/\.db$/, '_fallback.json');
        this.inMemoryOnly = Boolean(options?.inMemoryOnly || options?.safeModeReadOnly);
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
        return this.inMemoryOnly || this.safeModeWriteLocked ? 'VOLATILE_STORAGE' : 'TEST_EPHEMERAL';
    }

    private load() {
        if (this.inMemoryOnly) return;
        try {
            if (fs.existsSync(this.dbFilePath)) {
                const content = fs.readFileSync(this.dbFilePath, 'utf8');
                this.data = JSON.parse(content);
            }
        } catch (e) {
            console.error('[FallbackDB] Failed to load JSON database file:', e);
            this.data = {};
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

    public pragma(sql: string) {
        const pragmaSql = /^\s*PRAGMA\b/i.test(sql) ? sql : `PRAGMA ${sql}`;
        if (this.safeModeWriteLocked && !isReadOnlySql(pragmaSql)) {
            throw new DatabaseSafeModeError(pragmaSql);
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
        retryDelaysMs?: number[];
        waitFn?: (ms: number) => void;
        fsHooks?: QuarantineFsHooks;
    }): DatabaseHealthStatus {
        const {
            dbPath,
            DatabaseClass,
            isTestEnv = false,
            retryDelaysMs,
            waitFn,
            fsHooks
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
                    timestamp: new Date().toISOString()
                };
            } else {
                this.db = new JSONDatabase('test_arc_fallback.json');
                this.healthStatus = {
                    mode: 'TEST_MEMORY',
                    isSafeMode: false,
                    readOnly: false,
                    storageStatus: 'TEST_EPHEMERAL',
                    engine: 'json-test',
                    dbPath: 'test_arc_fallback.json',
                    timestamp: new Date().toISOString()
                };
            }
            this.initTables();
            return this.healthStatus;
        }

        if (!DatabaseClass) {
            const safeDb = new JSONDatabase(dbPath, { inMemoryOnly: true });
            this.db = safeDb;
            this.healthStatus = {
                mode: 'DB_SAFE_MODE',
                isSafeMode: true,
                readOnly: true,
                storageStatus: 'VOLATILE_STORAGE',
                engine: 'json-safe-mode',
                dbPath,
                errorCategory: 'OTHER_ERROR',
                errorCode: 'SQLITE_NATIVE_MISSING',
                errorMessage: 'Native better-sqlite3 module is unavailable in production runtime.',
                userNotice:
                    'Драйвер SQLite недоступен. Активирован защищённый диагностический режим DB_SAFE_MODE (запись заблокирована).',
                timestamp: new Date().toISOString()
            };
            this.initTables();
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

        this.healthStatus = outcome.health;

        if (outcome.instance) {
            this.db = outcome.instance;
            this.initTables();
        } else {
            const safeDb = new JSONDatabase(dbPath, { inMemoryOnly: true });
            this.db = safeDb;
            this.initTables();
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
                if (!DatabaseClass && (!fs.existsSync(dbPath) || !app?.isPackaged)) {
                    this.db = new JSONDatabase(dbPath, { inMemoryOnly: false });
                    this.healthStatus = {
                        mode: 'NORMAL',
                        isSafeMode: false,
                        readOnly: false,
                        storageStatus: 'PERSISTENT_SQLITE',
                        engine: 'json-test',
                        dbPath,
                        timestamp: new Date().toISOString()
                    };
                    this.initTables();
                } else {
                    this.initWithConfig({
                        dbPath,
                        backupRootDir,
                        DatabaseClass,
                        isTestEnv: false
                    });
                }
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
                    errorCategory: 'OTHER_ERROR',
                    errorCode: e?.code || 'USERDATA_UNAVAILABLE',
                    errorMessage: e?.message || String(e),
                    userNotice:
                        'Директория данных недоступна. Активирован защищённый диагностический режим DB_SAFE_MODE (запись заблокирована).',
                    timestamp: new Date().toISOString()
                };
                this.initTables();
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

    private static initTables() {
        try {
            const columnsInfo = this.db.pragma('table_info(ltm)');
            const hasValueType = columnsInfo.some((col) => col.name === 'value_type');
            if (!hasValueType) {
                this.db.exec('ALTER TABLE ltm ADD COLUMN value_type TEXT DEFAULT "string"');
                this.db.exec('UPDATE ltm SET value_type = "string" WHERE value_type IS NULL');
                console.log('[DatabaseService] Migrated ltm: added value_type column');
            }
        } catch (e) {
            // Ignore if ltm doesn't exist yet
        }

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ltm (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                key TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                value_type TEXT DEFAULT 'string',
                embedding TEXT,
                confidence REAL DEFAULT 1.0,
                source TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                last_accessed_at INTEGER,
                access_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS behavioral_events (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                context TEXT,
                metadata TEXT,
                timestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_ltm_category ON ltm(category);
            CREATE INDEX IF NOT EXISTS idx_ltm_key ON ltm(key);
            CREATE INDEX IF NOT EXISTS idx_be_type ON behavioral_events(type);
            CREATE INDEX IF NOT EXISTS idx_be_timestamp ON behavioral_events(timestamp);

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                is_pinned INTEGER DEFAULT 0,
                is_archived INTEGER DEFAULT 0,
                is_deleted INTEGER DEFAULT 0,
                deleted_at DATETIME DEFAULT NULL,
                tags TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                role TEXT CHECK (role IN ('user','assistant','system')),
                content TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                session_id,
                content='messages',
                content_rowid='id'
            );

            CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content, session_id) VALUES (new.id, new.content, new.session_id);
            END;

            CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content, session_id) VALUES('delete', old.id, old.content, old.session_id);
            END;

            CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content, session_id) VALUES('delete', old.id, old.content, old.session_id);
                INSERT INTO messages_fts(rowid, content, session_id) VALUES (new.id, new.content, new.session_id);
            END;

            CREATE TABLE IF NOT EXISTS search_cache (
                id TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                provider TEXT NOT NULL,
                results TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_search_query ON search_cache(query);
            CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_cache(timestamp);

            CREATE TABLE IF NOT EXISTS llm_response_cache (
                id TEXT PRIMARY KEY,
                prompt_hash TEXT NOT NULL,
                model TEXT NOT NULL,
                system_hash TEXT NOT NULL,
                response TEXT NOT NULL,
                provider TEXT NOT NULL,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_hit_at INTEGER NOT NULL,
                hits INTEGER NOT NULL DEFAULT 0,
                size_bytes INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_llm_cache_hash ON llm_response_cache(prompt_hash);
            CREATE INDEX IF NOT EXISTS idx_llm_cache_hit ON llm_response_cache(last_hit_at);

            -- Objective Engine tables using Standard SQLite syntax
            CREATE TABLE IF NOT EXISTS arc_objectives (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                owner TEXT CHECK(owner IN ('CHAIRMAN', 'COO_AGENT', 'SYSTEM_AUTO')),
                priority INTEGER NOT NULL,
                status TEXT CHECK(status IN ('DRAFT', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'ABANDONED', 'ROLLED_BACK')),
                confidence REAL NOT NULL,
                created_at TEXT NOT NULL,
                deadline TEXT
            );

            CREATE TABLE IF NOT EXISTS arc_outcomes (
                id TEXT PRIMARY KEY,
                objective_id TEXT NOT NULL,
                title TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                metric_source TEXT NOT NULL,        -- JSON stringifier of source script details
                baseline_value REAL NOT NULL,
                current_value REAL NOT NULL,
                target_value REAL NOT NULL,
                progress REAL NOT NULL,
                status TEXT CHECK(status IN ('PENDING', 'PROGRESSING', 'ACHIEVED', 'FAILED')),
                FOREIGN KEY(objective_id) REFERENCES arc_objectives(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS arc_objective_dependencies (
                parent_id TEXT NOT NULL,
                child_id TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                PRIMARY KEY (parent_id, child_id),
                FOREIGN KEY(parent_id) REFERENCES arc_objectives(id) ON DELETE CASCADE,
                FOREIGN KEY(child_id) REFERENCES arc_objectives(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS arc_objective_risks (
                id TEXT PRIMARY KEY,
                objective_id TEXT NOT NULL,
                description TEXT NOT NULL,
                likelihood REAL NOT NULL,
                impact REAL NOT NULL,
                is_active INTEGER DEFAULT 0,
                FOREIGN KEY(objective_id) REFERENCES arc_objectives(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS arc_decisions (
                id TEXT PRIMARY KEY,
                objective_id TEXT,
                title TEXT NOT NULL,
                status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTING', 'DONE', 'FAILED', 'ROLLED_BACK', 'ABANDONED')),
                rationale TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                FOREIGN KEY(objective_id) REFERENCES arc_objectives(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS arc_actions (
                id TEXT PRIMARY KEY,
                decision_id TEXT NOT NULL,
                type TEXT NOT NULL,                 -- e.g. 'FILE_WRITE', 'SQL_EXEC'
                status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'ROLLED_BACK')),
                params TEXT,                         -- JSON payload
                result TEXT,                         -- JSON artifact
                inverse TEXT,                        -- JSON rollback data for Actions
                created_at INTEGER,
                FOREIGN KEY(decision_id) REFERENCES arc_decisions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS arc_artifacts (
                id TEXT PRIMARY KEY,
                action_id TEXT,
                path_uri TEXT NOT NULL,
                type TEXT NOT NULL,
                hash TEXT,
                created_at INTEGER,
                FOREIGN KEY(action_id) REFERENCES arc_actions(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS arc_prediction_graph (
                id TEXT PRIMARY KEY,
                decision_id TEXT,
                node_type TEXT CHECK(node_type IN ('REALITY_EXECUTED', 'SIMULATED_ONLY', 'SUPPRESSED_BRANCH')),
                title TEXT NOT NULL,
                execution_weight REAL,
                entropy_at_prediction REAL,
                created_at INTEGER,
                FOREIGN KEY(decision_id) REFERENCES arc_decisions(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS arc_coherence_history (
                id TEXT PRIMARY KEY,
                coherence_index REAL,
                exploration_pressure REAL,
                execution_pressure REAL,
                suppression_pressure REAL,
                stability_drift_index REAL,
                created_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS arc_tasks (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                description TEXT,
                completed INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                completed_at INTEGER,
                updated_at INTEGER NOT NULL DEFAULT 0,
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
                subtasks TEXT,
                FOREIGN KEY(objective_id) REFERENCES arc_objectives(id) ON DELETE SET NULL
            );

            -- Index optimization
            CREATE INDEX IF NOT EXISTS idx_tasks_objective ON arc_tasks(objective_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_created ON arc_tasks(created_at);
            CREATE INDEX IF NOT EXISTS idx_outcomes_parent ON arc_outcomes(objective_id);
            CREATE INDEX IF NOT EXISTS idx_obj_deps_child ON arc_objective_dependencies(child_id);
            CREATE INDEX IF NOT EXISTS idx_decisions_objective ON arc_decisions(objective_id);
            CREATE INDEX IF NOT EXISTS idx_actions_decision ON arc_actions(decision_id);
            CREATE INDEX IF NOT EXISTS idx_artifacts_action ON arc_artifacts(action_id);
            CREATE INDEX IF NOT EXISTS idx_prediction_node ON arc_prediction_graph(node_type);
            CREATE INDEX IF NOT EXISTS idx_coherence_created ON arc_coherence_history(created_at);
        `);

        // Migration to handle older databases gracefully
        try {
            const cols = this.db.prepare(`PRAGMA table_info(arc_tasks)`).all() as any[];
            if (cols.length > 0 && !cols.some(c => c.name === 'updated_at')) {
                this.db.exec(`ALTER TABLE arc_tasks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
                this.db.exec(`UPDATE arc_tasks SET updated_at = COALESCE(created_at, 0) WHERE updated_at IS NULL OR updated_at = 0`);
            }
            this.db.exec(`UPDATE arc_tasks SET updated_at = COALESCE(created_at, 0) WHERE updated_at IS NULL OR updated_at = 0`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_updated ON arc_tasks(updated_at)`);
        } catch (e) {
            console.error('Failed to migrate arc_tasks.updated_at:', e);
        }
        try {
            const cols = this.db.prepare(`PRAGMA table_info(sessions)`).all() as any[];
            if (!cols.some(c => c.name === 'summary')) {
                this.db.exec(`ALTER TABLE sessions ADD COLUMN summary TEXT`);
            }
            if (!cols.some(c => c.name === 'is_deleted')) {
                this.db.exec(`ALTER TABLE sessions ADD COLUMN is_deleted INTEGER DEFAULT 0`);
            }
            this.db.prepare(`UPDATE sessions SET is_deleted = 0 WHERE is_deleted IS NULL`).run();
            if (!cols.some(c => c.name === 'deleted_at')) {
                this.db.exec(`ALTER TABLE sessions ADD COLUMN deleted_at DATETIME DEFAULT NULL`);
            }
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_deleted ON sessions(is_deleted, deleted_at)`);
        } catch (e) {
            console.error('Failed to migrate sessions columns:', e);
        }
        try {
            const cols = this.db.prepare(`PRAGMA table_info(arc_decisions)`).all() as any[];
            if (!cols.some(c => c.name === 'decision_type')) {
                this.db.exec(`ALTER TABLE arc_decisions ADD COLUMN decision_type TEXT DEFAULT 'EXECUTIVE'`);
            }
        } catch (e) {
            console.error('Failed to migrate arc_decisions.decision_type:', e);
        }
        try {
            const cols = this.db.prepare(`PRAGMA table_info(arc_decisions)`).all() as any[];
            if (!cols.some(c => c.name === 'execution_weight')) {
                this.db.exec(`ALTER TABLE arc_decisions ADD COLUMN execution_weight REAL DEFAULT 1.0`);
            }
        } catch (e) {
            console.error('Failed to migrate arc_decisions.execution_weight:', e);
        }
        try {
            const cols = this.db.prepare(`PRAGMA table_info(arc_objectives)`).all() as any[];
            if (!cols.some(c => c.name === 'route_layout')) {
                this.db.exec(`ALTER TABLE arc_objectives ADD COLUMN route_layout TEXT`);
            }
        } catch (e) {
            console.error('Failed to migrate arc_objectives.route_layout:', e);
        }
        try {
            const cols = this.db.prepare(`PRAGMA table_info(arc_actions)`).all() as any[];
            if (!cols.some(c => c.name === 'inverse')) {
                this.db.exec(`ALTER TABLE arc_actions ADD COLUMN inverse TEXT`);
            }
        } catch (e) {
            console.error('Failed to migrate arc_actions.inverse:', e);
        }

        // Rebuild arc_objectives if ROLLED_BACK is missing in check constraints
        try {
            const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='arc_objectives'").get() as { sql: string } | undefined;
            if (row && row.sql && !row.sql.includes('ROLLED_BACK')) {
                this.db.exec(`
                    PRAGMA foreign_keys = OFF;
                    BEGIN TRANSACTION;
                    ALTER TABLE arc_objectives RENAME TO arc_objectives_old;
                    CREATE TABLE arc_objectives (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL,
                        owner TEXT CHECK(owner IN ('CHAIRMAN', 'COO_AGENT', 'SYSTEM_AUTO')),
                        priority INTEGER NOT NULL,
                        status TEXT CHECK(status IN ('DRAFT', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'ABANDONED', 'ROLLED_BACK')),
                        confidence REAL NOT NULL,
                        created_at TEXT NOT NULL,
                        deadline TEXT,
                        route_layout TEXT
                    );
                    INSERT INTO arc_objectives (id, title, description, owner, priority, status, confidence, created_at, deadline, route_layout)
                    SELECT id, title, description, owner, priority, status, confidence, created_at, deadline, route_layout FROM arc_objectives_old;
                    DROP TABLE arc_objectives_old;
                    COMMIT;
                    PRAGMA foreign_keys = ON;
                `);
            }
        } catch (e) {
            console.error("Migration offset error on arc_objectives check constraint upgrade:", e);
            try { this.db.exec('ROLLBACK;'); } catch (_) { console.warn('Ignored error in catch', _); }
        }

        // Rebuild arc_decisions if ROLLED_BACK is missing in check constraints
        try {
            const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='arc_decisions'").get() as { sql: string } | undefined;
            if (row && row.sql && !row.sql.includes('ROLLED_BACK')) {
                this.db.exec(`
                    PRAGMA foreign_keys = OFF;
                    BEGIN TRANSACTION;
                    ALTER TABLE arc_decisions RENAME TO arc_decisions_old;
                    CREATE TABLE arc_decisions (
                        id TEXT PRIMARY KEY,
                        objective_id TEXT,
                        title TEXT NOT NULL,
                        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTING', 'DONE', 'FAILED', 'ROLLED_BACK', 'ABANDONED')),
                        rationale TEXT,
                        created_at INTEGER,
                        updated_at INTEGER,
                        decision_type TEXT DEFAULT 'EXECUTIVE',
                        execution_weight REAL DEFAULT 1.0,
                        FOREIGN KEY(objective_id) REFERENCES arc_objectives(id) ON DELETE SET NULL
                    );
                    INSERT INTO arc_decisions (id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight)
                    SELECT id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight FROM arc_decisions_old;
                    DROP TABLE arc_decisions_old;
                    COMMIT;
                    PRAGMA foreign_keys = ON;
                `);
            }
        } catch (e) {
            console.error("Migration offset error on arc_decisions check constraint upgrade:", e);
            try { this.db.exec('ROLLBACK;'); } catch (_) { console.warn('Ignored error in catch', _); }
        }

        // Rebuild arc_actions if ROLLED_BACK is missing in check constraints
        try {
            const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='arc_actions'").get() as { sql: string } | undefined;
            if (row && row.sql && !row.sql.includes('ROLLED_BACK')) {
                this.db.exec(`
                    PRAGMA foreign_keys = OFF;
                    BEGIN TRANSACTION;
                    ALTER TABLE arc_actions RENAME TO arc_actions_old;
                    CREATE TABLE arc_actions (
                        id TEXT PRIMARY KEY,
                        decision_id TEXT NOT NULL,
                        type TEXT NOT NULL,
                        status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'ROLLED_BACK')),
                        params TEXT,
                        result TEXT,
                        inverse TEXT,
                        created_at INTEGER,
                        FOREIGN KEY(decision_id) REFERENCES arc_decisions(id) ON DELETE CASCADE
                    );
                    INSERT INTO arc_actions (id, decision_id, type, status, params, result, inverse, created_at)
                    SELECT id, decision_id, type, status, params, result, inverse, created_at FROM arc_actions_old;
                    DROP TABLE arc_actions_old;
                    COMMIT;
                    PRAGMA foreign_keys = ON;
                `);
            }
        } catch (e) {
            console.error("Migration offset error on arc_actions check constraint upgrade:", e);
            try { this.db.exec('ROLLBACK;'); } catch (_) { console.warn('Ignored error in catch', _); }
        }

        // One-time cleanup of synthetic variation records generated by disabled cognitive loop
        try { this.db.prepare("DELETE FROM arc_decisions WHERE title LIKE 'Simulate Alternative Future Path Vector%' OR title LIKE 'Dynamic Objective Dependency Alignment%' OR title LIKE 'Heuristic State Space Expansion Trace%' OR title LIKE 'Exploratory Mutation Scan for Entropy Injection%'").run(); } catch (e) { console.warn('[DatabaseService] Cleanup arc_decisions skipped:', e); }
        try { this.db.prepare("DELETE FROM arc_prediction_graph WHERE title LIKE 'Simulate Alternative Future Path Vector%' OR title LIKE 'Dynamic Objective Dependency Alignment%' OR title LIKE 'Heuristic State Space Expansion Trace%' OR title LIKE 'Exploratory Mutation Scan for Entropy Injection%' OR node_type = 'SIMULATED_ONLY'").run(); } catch (e) { console.warn('[DatabaseService] Cleanup arc_prediction_graph skipped:', e); }
        try { this.db.prepare("DELETE FROM arc_coherence_history WHERE created_at < ?").run(Date.now() - 7 * 24 * 60 * 60 * 1000); } catch (e) { console.warn('[DatabaseService] Cleanup arc_coherence_history skipped:', e); }
    }
}
