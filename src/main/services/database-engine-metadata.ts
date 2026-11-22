import type {
  DatabaseEngineCapabilities,
  DatabaseEngineType,
  StoragePersistenceStatus
} from './database-recovery.types';

export const JSON_DATABASE_LIMITATIONS: readonly string[] = [
  'Нет ACID-транзакций и автоматического rollback (transaction() не откатывает изменения при ошибке)',
  'Поддерживается только ограниченное подмножество SQL (базовые INSERT, UPDATE, DELETE, SELECT)',
  'Отсутствуют полнотекстовый поиск FTS5, внешние ключи (FOREIGN KEY) и SQL-индексы'
];

export const SAFE_MODE_READONLY_LIMITATION =
  'Запись полностью заблокирована (VOLATILE_STORAGE / DB_SAFE_MODE): изменения не сохраняются на диск';

export const EPHEMERAL_MEMORY_LIMITATION =
  'Данные хранятся только в оперативной памяти процесса и не сохраняются на диск';

export function getDatabaseEngineMetadata(
  engine: DatabaseEngineType,
  storageStatus: StoragePersistenceStatus
): {
  capabilities: DatabaseEngineCapabilities;
  limitations: string[];
} {
  if (engine === 'sqlite') {
    return {
      capabilities: {
        persistent: storageStatus === 'PERSISTENT_SQLITE',
        supportsTransactions: true,
        supportsRollback: true,
        supportsFts5: true,
        supportsForeignKeys: true,
        supportsSqlIndexes: true
      },
      limitations: []
    };
  }

  if (engine === 'sqlite-memory') {
    return {
      capabilities: {
        persistent: false,
        supportsTransactions: true,
        supportsRollback: true,
        supportsFts5: true,
        supportsForeignKeys: true,
        supportsSqlIndexes: true
      },
      limitations: [EPHEMERAL_MEMORY_LIMITATION]
    };
  }

  if (engine === 'json-safe-mode') {
    return {
      capabilities: {
        persistent: false,
        supportsTransactions: false,
        supportsRollback: false,
        supportsFts5: false,
        supportsForeignKeys: false,
        supportsSqlIndexes: false
      },
      limitations: [SAFE_MODE_READONLY_LIMITATION, ...JSON_DATABASE_LIMITATIONS]
    };
  }

  if (engine === 'json-degraded') {
    return {
      capabilities: {
        persistent: storageStatus === 'PERSISTENT_JSON_DEGRADED',
        supportsTransactions: false,
        supportsRollback: false,
        supportsFts5: false,
        supportsForeignKeys: false,
        supportsSqlIndexes: false
      },
      limitations: [...JSON_DATABASE_LIMITATIONS]
    };
  }

  // json-test
  return {
    capabilities: {
      persistent: false,
      supportsTransactions: false,
      supportsRollback: false,
      supportsFts5: false,
      supportsForeignKeys: false,
      supportsSqlIndexes: false
    },
    limitations: [EPHEMERAL_MEMORY_LIMITATION, ...JSON_DATABASE_LIMITATIONS]
  };
}
