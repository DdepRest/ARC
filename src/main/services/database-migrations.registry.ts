import crypto from 'crypto';

export interface MigrationDefinition {
  version: number;
  id: string;
  name: string;
  purpose: string;
  checksum: string;
  requiresForeignKeysOff?: boolean;
  up: (db: any) => void;
}

export const CORE_EMPTY_SCHEMA_DDL = `
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

  CREATE TABLE IF NOT EXISTS arc_objectives (
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

  CREATE TABLE IF NOT EXISTS arc_outcomes (
    id TEXT PRIMARY KEY,
    objective_id TEXT NOT NULL,
    title TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_source TEXT NOT NULL,
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
    decision_type TEXT DEFAULT 'EXECUTIVE',
    execution_weight REAL DEFAULT 1.0,
    FOREIGN KEY(objective_id) REFERENCES arc_objectives(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS arc_actions (
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

  CREATE INDEX IF NOT EXISTS idx_tasks_objective ON arc_tasks(objective_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_created ON arc_tasks(created_at);
  CREATE INDEX IF NOT EXISTS idx_outcomes_parent ON arc_outcomes(objective_id);
  CREATE INDEX IF NOT EXISTS idx_obj_deps_child ON arc_objective_dependencies(child_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_objective ON arc_decisions(objective_id);
  CREATE INDEX IF NOT EXISTS idx_actions_decision ON arc_actions(decision_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_action ON arc_artifacts(action_id);
  CREATE INDEX IF NOT EXISTS idx_prediction_node ON arc_prediction_graph(node_type);
  CREATE INDEX IF NOT EXISTS idx_coherence_created ON arc_coherence_history(created_at);
`;

function computeMigrationChecksum(input: {
  version: number;
  id: string;
  name: string;
  purpose: string;
  requiresForeignKeysOff?: boolean;
  signature: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
}

function getTableColumns(db: any, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return Array.isArray(rows) ? rows.map((col) => String(col.name)) : [];
}

function tableExists(db: any, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
    .get() as { name?: string; sql?: string } | undefined;
  return Boolean(row && (row.name || row.sql));
}

function getTableDdl(db: any, tableName: string): string | null {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
    .get() as { sql?: string } | undefined;
  return typeof row?.sql === 'string' ? row.sql : null;
}

function rebuildTableWithRowCheck(
  db: any,
  tableName: string,
  createSql: string,
  insertSql: string
): void {
  const beforeRow = db.prepare(`SELECT COUNT(*) as n FROM ${tableName}`).get() as { n?: number } | undefined;
  const beforeCount = Number(beforeRow?.n ?? 0);

  db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old;`);
  db.exec(createSql);
  db.exec(insertSql);

  const afterRow = db.prepare(`SELECT COUNT(*) as n FROM ${tableName}`).get() as { n?: number } | undefined;
  const afterCount = Number(afterRow?.n ?? 0);
  if (afterCount !== beforeCount) {
    throw new Error(
      `Row count mismatch rebuilding "${tableName}": before=${beforeCount}, after=${afterCount}`
    );
  }
  db.exec(`DROP TABLE ${tableName}_old;`);
}

function defineMigration(
  spec: Omit<MigrationDefinition, 'checksum'> & { signature: string }
): MigrationDefinition {
  const { signature, ...rest } = spec;
  return {
    ...rest,
    checksum: computeMigrationChecksum({
      version: spec.version,
      id: spec.id,
      name: spec.name,
      purpose: spec.purpose,
      requiresForeignKeysOff: Boolean(spec.requiresForeignKeysOff),
      signature
    })
  };
}

export const DATABASE_MIGRATIONS: readonly MigrationDefinition[] = [
  defineMigration({
    version: 1,
    id: '001_initial_core_schema',
    name: 'Initial core schema',
    purpose: 'Create all 17 core tables, FTS5 messages index, triggers, and baseline indexes',
    signature: 'v1:core_17_tables_fts5_triggers_indexes',
    up: (db) => {
      db.exec(CORE_EMPTY_SCHEMA_DDL);
    }
  }),
  defineMigration({
    version: 2,
    id: '002_ltm_value_type',
    name: 'LTM value_type column',
    purpose: 'Ensure ltm.value_type column exists and backfill NULL values to string',
    signature: 'v2:ltm.value_type:TEXT:DEFAULT_string',
    up: (db) => {
      if (!tableExists(db, 'ltm')) return;
      const cols = getTableColumns(db, 'ltm');
      if (cols.length > 0 && !cols.includes('value_type')) {
        db.exec(`ALTER TABLE ltm ADD COLUMN value_type TEXT DEFAULT 'string'`);
      }
      db.exec(`UPDATE ltm SET value_type = 'string' WHERE value_type IS NULL`);
    }
  }),
  defineMigration({
    version: 3,
    id: '003_arc_tasks_updated_at',
    name: 'Tasks updated_at column and index',
    purpose: 'Ensure arc_tasks.updated_at exists, backfill from created_at, and create idx_tasks_updated',
    signature: 'v3:arc_tasks.updated_at:INTEGER_NOT_NULL_DEFAULT_0+idx_tasks_updated',
    up: (db) => {
      if (!tableExists(db, 'arc_tasks')) return;
      const cols = getTableColumns(db, 'arc_tasks');
      if (cols.length > 0 && !cols.includes('updated_at')) {
        db.exec(`ALTER TABLE arc_tasks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
      }
      db.exec(
        `UPDATE arc_tasks SET updated_at = COALESCE(created_at, 0) WHERE updated_at IS NULL OR updated_at = 0`
      );
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_updated ON arc_tasks(updated_at)`);
    }
  }),
  defineMigration({
    version: 4,
    id: '004_sessions_soft_delete_and_summary',
    name: 'Sessions soft-delete and summary columns',
    purpose: 'Ensure sessions has summary, is_deleted, deleted_at, and idx_sessions_deleted',
    signature: 'v4:sessions.summary+is_deleted+deleted_at+idx_sessions_deleted',
    up: (db) => {
      if (!tableExists(db, 'sessions')) return;
      const cols = getTableColumns(db, 'sessions');
      if (cols.length > 0 && !cols.includes('summary')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN summary TEXT`);
      }
      if (cols.length > 0 && !cols.includes('is_deleted')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN is_deleted INTEGER DEFAULT 0`);
      }
      db.prepare(`UPDATE sessions SET is_deleted = 0 WHERE is_deleted IS NULL`).run();
      if (cols.length > 0 && !cols.includes('deleted_at')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN deleted_at DATETIME DEFAULT NULL`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_deleted ON sessions(is_deleted, deleted_at)`);
    }
  }),
  defineMigration({
    version: 5,
    id: '005_arc_decisions_metadata',
    name: 'Decisions metadata columns',
    purpose: 'Ensure arc_decisions has decision_type and execution_weight columns',
    signature: 'v5:arc_decisions.decision_type+execution_weight',
    up: (db) => {
      if (!tableExists(db, 'arc_decisions')) return;
      const cols = getTableColumns(db, 'arc_decisions');
      if (cols.length > 0 && !cols.includes('decision_type')) {
        db.exec(`ALTER TABLE arc_decisions ADD COLUMN decision_type TEXT DEFAULT 'EXECUTIVE'`);
      }
      if (cols.length > 0 && !cols.includes('execution_weight')) {
        db.exec(`ALTER TABLE arc_decisions ADD COLUMN execution_weight REAL DEFAULT 1.0`);
      }
    }
  }),
  defineMigration({
    version: 6,
    id: '006_objectives_route_and_actions_inverse',
    name: 'Objectives route_layout and actions inverse',
    purpose: 'Ensure arc_objectives.route_layout and arc_actions.inverse columns exist',
    signature: 'v6:arc_objectives.route_layout+arc_actions.inverse',
    up: (db) => {
      if (tableExists(db, 'arc_objectives')) {
        const objCols = getTableColumns(db, 'arc_objectives');
        if (objCols.length > 0 && !objCols.includes('route_layout')) {
          db.exec(`ALTER TABLE arc_objectives ADD COLUMN route_layout TEXT`);
        }
      }
      if (tableExists(db, 'arc_actions')) {
        const actionCols = getTableColumns(db, 'arc_actions');
        if (actionCols.length > 0 && !actionCols.includes('inverse')) {
          db.exec(`ALTER TABLE arc_actions ADD COLUMN inverse TEXT`);
        }
      }
    }
  }),
  defineMigration({
    version: 7,
    id: '007_objective_engine_rolled_back_constraints',
    name: 'ROLLED_BACK CHECK constraint upgrades',
    purpose: 'Rebuild arc_objectives, arc_decisions, arc_actions missing ROLLED_BACK CHECK constraint safely',
    signature: 'v7:rolled_back_check_constraints_and_indexes',
    requiresForeignKeysOff: true,
    up: (db) => {
      const objDdl = getTableDdl(db, 'arc_objectives');
      if (objDdl && !objDdl.includes('ROLLED_BACK')) {
        rebuildTableWithRowCheck(
          db,
          'arc_objectives',
          `CREATE TABLE arc_objectives (
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
          );`,
          `INSERT INTO arc_objectives (id, title, description, owner, priority, status, confidence, created_at, deadline, route_layout)
           SELECT id, title, description, owner, priority, status, confidence, created_at, deadline, route_layout FROM arc_objectives_old;`
        );
      }

      const decDdl = getTableDdl(db, 'arc_decisions');
      if (decDdl && !decDdl.includes('ROLLED_BACK')) {
        rebuildTableWithRowCheck(
          db,
          'arc_decisions',
          `CREATE TABLE arc_decisions (
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
          );`,
          `INSERT INTO arc_decisions (id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight)
           SELECT id, objective_id, title, status, rationale, created_at, updated_at, decision_type, execution_weight FROM arc_decisions_old;`
        );
        db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_objective ON arc_decisions(objective_id)`);
      }

      const actDdl = getTableDdl(db, 'arc_actions');
      if (actDdl && !actDdl.includes('ROLLED_BACK')) {
        rebuildTableWithRowCheck(
          db,
          'arc_actions',
          `CREATE TABLE arc_actions (
            id TEXT PRIMARY KEY,
            decision_id TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'ROLLED_BACK')),
            params TEXT,
            result TEXT,
            inverse TEXT,
            created_at INTEGER,
            FOREIGN KEY(decision_id) REFERENCES arc_decisions(id) ON DELETE CASCADE
          );`,
          `INSERT INTO arc_actions (id, decision_id, type, status, params, result, inverse, created_at)
           SELECT id, decision_id, type, status, params, result, inverse, created_at FROM arc_actions_old;`
        );
        db.exec(`CREATE INDEX IF NOT EXISTS idx_actions_decision ON arc_actions(decision_id)`);
      }
    }
  }),
  defineMigration({
    version: 8,
    id: '008_cleanup_synthetic_cognitive_records',
    name: 'Synthetic cognitive variation cleanup',
    purpose: 'One-time cleanup of disabled cognitive loop synthetic records and >7d coherence history',
    signature: 'v8:cleanup_synthetic_decisions_prediction_coherence',
    up: (db) => {
      if (tableExists(db, 'arc_decisions')) {
        db.prepare(
          "DELETE FROM arc_decisions WHERE title LIKE 'Simulate Alternative Future Path Vector%' OR title LIKE 'Dynamic Objective Dependency Alignment%' OR title LIKE 'Heuristic State Space Expansion Trace%' OR title LIKE 'Exploratory Mutation Scan for Entropy Injection%'"
        ).run();
      }
      if (tableExists(db, 'arc_prediction_graph')) {
        db.prepare(
          "DELETE FROM arc_prediction_graph WHERE title LIKE 'Simulate Alternative Future Path Vector%' OR title LIKE 'Dynamic Objective Dependency Alignment%' OR title LIKE 'Heuristic State Space Expansion Trace%' OR title LIKE 'Exploratory Mutation Scan for Entropy Injection%' OR node_type = 'SIMULATED_ONLY'"
        ).run();
      }
      if (tableExists(db, 'arc_coherence_history')) {
        db.prepare('DELETE FROM arc_coherence_history WHERE created_at < ?').run(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        );
      }
    }
  })
];

export const LATEST_SCHEMA_VERSION = DATABASE_MIGRATIONS[DATABASE_MIGRATIONS.length - 1].version;
