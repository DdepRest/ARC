import { LongTermMemoryEntry, MemoryCategory } from '../../../shared/types/memory';

const ALLOWED_CATEGORIES: ReadonlySet<string> = new Set([
  'fact',
  'preference',
  'knowledge',
  'event'
]);

const MAX_IMPORT_BATCH_SIZE = 5000;

export interface MemoryBatchImportResult {
  success: boolean;
  importedCount: number;
  error?: string;
}

function normalizeTimestamp(val: unknown, fallback: number): number | null {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0) return null;
    return Math.floor(val);
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    const num = Number(val);
    if (Number.isFinite(num) && num >= 0) return Math.floor(num);
    return null;
  }
  return null;
}

export function validateAndNormalizeMemoryBatch(
  rawItems: unknown
): { ok: true; entries: LongTermMemoryEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(rawItems)) {
    return { ok: false, error: 'Ожидался JSON-массив записей памяти.' };
  }
  if (rawItems.length === 0) {
    return { ok: true, entries: [] };
  }
  if (rawItems.length > MAX_IMPORT_BATCH_SIZE) {
    return {
      ok: false,
      error: `Превышен лимит пакетного импорта (${rawItems.length} > ${MAX_IMPORT_BATCH_SIZE}).`
    };
  }

  const now = Date.now();
  const normalized: LongTermMemoryEntry[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `Запись #${i + 1}: ожидался объект.` };
    }
    const rec = item as Record<string, unknown>;

    if (typeof rec.key !== 'string' || !rec.key.trim()) {
      return { ok: false, error: `Запись #${i + 1}: отсутствует или некорректно поле "key".` };
    }
    const key = rec.key.trim();

    if (rec.value === undefined || rec.value === null) {
      return { ok: false, error: `Запись #${i + 1} ("${key}"): отсутствует поле "value".` };
    }
    if (typeof rec.value === 'string' && !rec.value.trim()) {
      return { ok: false, error: `Запись #${i + 1} ("${key}"): пустое строковое значение "value".` };
    }

    const rawCategory = rec.category === undefined ? 'fact' : rec.category;
    if (typeof rawCategory !== 'string' || !ALLOWED_CATEGORIES.has(rawCategory)) {
      return {
        ok: false,
        error: `Запись #${i + 1} ("${key}"): недопустимая категория "${String(rawCategory)}".`
      };
    }
    const category = rawCategory as MemoryCategory;

    let confidence = 1.0;
    if (rec.confidence !== undefined && rec.confidence !== null) {
      if (typeof rec.confidence !== 'number' || !Number.isFinite(rec.confidence) || rec.confidence < 0 || rec.confidence > 1) {
        return {
          ok: false,
          error: `Запись #${i + 1} ("${key}"): поле "confidence" должно быть числом от 0 до 1.`
        };
      }
      confidence = rec.confidence;
    }

    const createdAt = normalizeTimestamp(rec.created_at, now);
    const updatedAt = normalizeTimestamp(rec.updated_at, now);
    const lastAccessedAt = normalizeTimestamp(rec.last_accessed_at, now);
    if (createdAt === null || updatedAt === null || lastAccessedAt === null) {
      return {
        ok: false,
        error: `Запись #${i + 1} ("${key}"): некорректный формат временной метки.`
      };
    }

    let embedding: number[] | null = null;
    if (rec.embedding !== undefined && rec.embedding !== null) {
      if (
        !Array.isArray(rec.embedding) ||
        !rec.embedding.every((v) => typeof v === 'number' && Number.isFinite(v))
      ) {
        return {
          ok: false,
          error: `Запись #${i + 1} ("${key}"): поле "embedding" должно быть массивом чисел.`
        };
      }
      embedding = rec.embedding as number[];
    }

    const id =
      typeof rec.id === 'string' && rec.id.trim().length > 0
        ? rec.id.trim()
        : `mem_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`;

    const source =
      typeof rec.source === 'string' && rec.source.trim().length > 0
        ? rec.source.trim()
        : 'user_stated';

    const accessCount =
      typeof rec.access_count === 'number' && Number.isFinite(rec.access_count) && rec.access_count >= 0
        ? Math.floor(rec.access_count)
        : 1;

    normalized.push({
      id,
      category,
      key,
      value: rec.value,
      embedding,
      confidence,
      source,
      created_at: createdAt,
      updated_at: updatedAt,
      last_accessed_at: lastAccessedAt,
      access_count: accessCount
    });
  }

  return { ok: true, entries: normalized };
}

export function importMemoryBatchAtomic(db: any, rawItems: unknown): MemoryBatchImportResult {
  if (!db) {
    return { success: false, importedCount: 0, error: 'База данных недоступна.' };
  }

  const validation = validateAndNormalizeMemoryBatch(rawItems);
  if (validation.ok === false) {
    return { success: false, importedCount: 0, error: (validation as { ok: false; error: string }).error };
  }
  const entries = validation.entries;
  if (entries.length === 0) {
    return { success: true, importedCount: 0 };
  }

  try {
    const selectByKeyStmt = db.prepare('SELECT id FROM ltm WHERE key = ?');
    const updateStmt = db.prepare(`
      UPDATE ltm
      SET category = ?, value = ?, value_type = ?, embedding = ?, confidence = ?, source = ?, updated_at = ?, last_accessed_at = ?, access_count = access_count + 1
      WHERE id = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO ltm (id, category, key, value, value_type, embedding, confidence, source, created_at, updated_at, last_accessed_at, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runBatch = db.transaction((batch: LongTermMemoryEntry[]) => {
      for (const entry of batch) {
        const embeddingStr = entry.embedding ? JSON.stringify(entry.embedding) : null;
        const valueStr = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
        const valueType = typeof entry.value === 'string' ? 'string' : 'json';

        const existing = selectByKeyStmt.get(entry.key) as { id?: string } | undefined;
        if (existing && existing.id) {
          updateStmt.run(
            entry.category,
            valueStr,
            valueType,
            embeddingStr,
            entry.confidence,
            entry.source,
            entry.updated_at,
            entry.last_accessed_at,
            existing.id
          );
        } else {
          insertStmt.run(
            entry.id,
            entry.category,
            entry.key,
            valueStr,
            valueType,
            embeddingStr,
            entry.confidence,
            entry.source,
            entry.created_at,
            entry.updated_at,
            entry.last_accessed_at,
            entry.access_count
          );
        }
      }
    });

    runBatch(entries);
    return { success: true, importedCount: entries.length };
  } catch (err: any) {
    return {
      success: false,
      importedCount: 0,
      error: err?.message || String(err)
    };
  }
}
