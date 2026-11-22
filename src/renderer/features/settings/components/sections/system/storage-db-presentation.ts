export interface DbEngineStatusInfo {
  mode?: string;
  engine?: string;
  storageStatus?: string;
  isSafeMode?: boolean;
  readOnly?: boolean;
  schemaVersion?: number;
  userNotice?: string;
  capabilities?: {
    persistent: boolean;
    supportsTransactions: boolean;
    supportsRollback: boolean;
    supportsFts5: boolean;
    supportsForeignKeys: boolean;
    supportsSqlIndexes: boolean;
  };
  limitations?: string[];
}

export function isDegradedJsonStatus(info: DbEngineStatusInfo | null): boolean {
  return Boolean(
    info &&
      (info.mode === 'DEGRADED' ||
        info.storageStatus === 'PERSISTENT_JSON_DEGRADED' ||
        info.engine === 'json-degraded')
  );
}

export function isSafeModeStatus(info: DbEngineStatusInfo | null): boolean {
  return Boolean(info && (info.isSafeMode || info.mode === 'DB_SAFE_MODE'));
}

export function isSqliteNormalStatus(info: DbEngineStatusInfo | null): boolean {
  return Boolean(info && info.engine === 'sqlite' && !isSafeModeStatus(info));
}

export function buildDbStoragePresentation(info: DbEngineStatusInfo | null, canReadStorage: boolean) {
  const safeMode = isSafeModeStatus(info);
  const degraded = isDegradedJsonStatus(info);
  const sqlite = isSqliteNormalStatus(info);

  const rowLabel = safeMode
    ? 'Хранилище в аварийном режиме (DB_SAFE_MODE)'
    : degraded
    ? 'Локальное JSON-хранилище (ограниченный dev-режим)'
    : info?.engine === 'json-test'
    ? 'Временное JSON-хранилище (тестовый режим)'
    : 'База данных SQLite (диалоги, задачи, история)';

  const bannerTitle = safeMode
    ? `Аварийный read-only режим (${info?.engine || 'json-safe-mode'})`
    : degraded
    ? 'Ограниченный режим JSONDatabase (DEGRADED)'
    : `Ограничения движка (${info?.engine || 'json'})`;

  const caps = info?.capabilities;
  const acid = caps?.supportsTransactions && caps?.supportsRollback ? 'ACID: Да' : 'ACID/Rollback: Нет';
  const rw = info?.readOnly ? 'Read-Only' : 'Read/Write';
  const capabilitiesSummary = `${info?.storageStatus || 'UNKNOWN'} · ${acid} · ${rw}`;

  const engineTag = info?.engine ? `Движок: ${info.engine} (${info.storageStatus || '—'})` : '';

  const summaryTone: 'ok' | 'warn' | 'off' | 'default' = !canReadStorage
    ? 'off'
    : safeMode || degraded
    ? 'warn'
    : sqlite
    ? 'ok'
    : 'default';

  const summaryValue = !canReadStorage
    ? 'Нет IPC'
    : safeMode
    ? 'JSON Safe Mode'
    : degraded
    ? 'JSON Degraded'
    : sqlite
    ? 'SQLite 3'
    : info?.engine || 'Локальный';

  const summaryDetail = safeMode
    ? 'Только чтение (память)'
    : degraded
    ? 'Без ACID / FTS5'
    : sqlite
    ? 'ACID / WAL · Локально'
    : 'Локальная изоляция';

  const diagBadge = !info?.engine
    ? 'IPC недоступен'
    : safeMode
    ? `${info.engine} · READ-ONLY`
    : degraded
    ? `${info.engine} · БЕЗ ACID`
    : `${info.engine} · ${info.storageStatus || 'OK'}`;

  const diagTech = !info
    ? 'Ожидание ответа IPC system:get-db-status'
    : `Режим: ${info.mode || '—'} · ${capabilitiesSummary}${info.limitations?.length ? ` · ${info.limitations[0]}` : ''}`;

  return {
    safeMode,
    degraded,
    sqlite,
    rowLabel,
    bannerTitle,
    capabilitiesSummary,
    engineTag,
    summaryTone,
    summaryValue,
    summaryDetail,
    diagBadge,
    diagTech,
    limitations: info?.limitations ?? []
  };
}
