import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../database';
import { importMemoryBatchAtomic, validateAndNormalizeMemoryBatch } from './memory-batch-import';

describe('Memory Batch Import — Pre-validation & Atomic SQLite Transaction', () => {
  beforeEach(() => {
    DatabaseService.initWithConfig({
      dbPath: ':memory:',
      isTestEnv: true
    });
    DatabaseService.db.prepare('DELETE FROM ltm').run();
  });

  it('1. rejects non-array, empty keys, invalid categories, out-of-range confidence, or invalid timestamps before touching DB', () => {
    expect(validateAndNormalizeMemoryBatch(null as any).ok).toBe(false);
    expect(validateAndNormalizeMemoryBatch({} as any).ok).toBe(false);
    expect(validateAndNormalizeMemoryBatch([{ key: '', value: 'test' }]).ok).toBe(false);
    expect(validateAndNormalizeMemoryBatch([{ key: 'k1', value: '' }]).ok).toBe(false);
    expect(validateAndNormalizeMemoryBatch([{ key: 'k1', value: 'v1', category: 'invalid_cat' }]).ok).toBe(false);
    expect(validateAndNormalizeMemoryBatch([{ key: 'k1', value: 'v1', confidence: 1.5 }]).ok).toBe(false);
    expect(validateAndNormalizeMemoryBatch([{ key: 'k1', value: 'v1', created_at: 'not-a-date' }]).ok).toBe(false);
  });

  it('2. does not leave partially imported records when the N-th record in a batch is invalid', () => {
    const batch = [
      { id: 'm1', key: 'user:name', value: 'Arthur', category: 'fact', confidence: 0.9 },
      { id: 'm2', key: 'user:lang', value: 'Russian', category: 'preference', confidence: 1.0 },
      { id: 'm3', key: '', value: 'Broken record with empty key', category: 'fact' }
    ];

    const res = importMemoryBatchAtomic(DatabaseService.db, batch);
    expect(res.success).toBe(false);
    expect(res.importedCount).toBe(0);

    const rows = DatabaseService.db.prepare('SELECT * FROM ltm').all();
    expect(rows.length).toBe(0);
  });

  it('3. atomically inserts and updates records in a single transaction, handling duplicate keys cleanly', () => {
    const batch = [
      { id: 'm1', key: 'project:codename', value: 'A.R.C. v1', category: 'fact', confidence: 0.8 },
      { id: 'm2', key: 'user:theme', value: { mode: 'dark', accent: 'red' }, category: 'preference', confidence: 1.0 },
      { id: 'm3', key: 'project:codename', value: 'A.R.C. v3.4', category: 'fact', confidence: 0.95 }
    ];

    const res = importMemoryBatchAtomic(DatabaseService.db, batch);
    expect(res.success).toBe(true);
    expect(res.importedCount).toBe(3);

    const rows = DatabaseService.db.prepare('SELECT * FROM ltm').all();
    expect(rows.length).toBe(2);
    const codenameRow = rows.find((r: any) => r.key === 'project:codename');
    expect(codenameRow.value).toBe('A.R.C. v3.4');
    expect(codenameRow.confidence).toBe(0.95);
  });
});
