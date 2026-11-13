import crypto from 'crypto';
import { DatabaseService } from './database';

export const LLM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LLM_CACHE_MAX_ENTRIES = 500;
export const LLM_CACHE_MAX_BYTES = 50 * 1024 * 1024;

export interface LlmCacheHit {
  response: string;
  provider: string;
  latencyMs: number;
}

export interface LlmCacheStats {
  count: number;
  sizeBytes: number;
  oldestCreatedAt: number | null;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export class LlmCacheService {
  private maxEntries = LLM_CACHE_MAX_ENTRIES;
  private maxBytes = LLM_CACHE_MAX_BYTES;
  private ttlMs = LLM_CACHE_TTL_MS;

  private ensureDb(): any {
    if (!DatabaseService.db) {
      DatabaseService.init();
    }
    return DatabaseService.db;
  }

  public computeKeys(prompt: string, model: string, systemPrompt: string): {
    id: string;
    promptHash: string;
    systemHash: string;
  } {
    const cleanPrompt = String(prompt ?? '');
    const cleanModel = String(model ?? '');
    const cleanSystem = String(systemPrompt ?? '');
    const promptHash = sha256(cleanPrompt);
    const systemHash = sha256(cleanSystem);
    const id = sha256(`${cleanPrompt}\x00${cleanModel}\x00${systemHash}`);
    return { id, promptHash, systemHash };
  }

  public get(prompt: string, model: string, systemPrompt: string): LlmCacheHit | null {
    try {
      const db = this.ensureDb();
      if (!db) return null;

      const { id } = this.computeKeys(prompt, model, systemPrompt);
      const row = db
        .prepare('SELECT response, provider, latency_ms, created_at FROM llm_response_cache WHERE id = ?')
        .get(id) as { response: string; provider: string; latency_ms: number; created_at: number } | undefined;

      if (!row) return null;

      const now = Date.now();
      const createdAt = Number(row.created_at) || 0;
      if (now - createdAt > this.ttlMs) {
        db.prepare('DELETE FROM llm_response_cache WHERE id = ?').run(id);
        return null;
      }

      db.prepare('UPDATE llm_response_cache SET last_hit_at = ?, hits = hits + 1 WHERE id = ?').run(now, id);

      return {
        response: row.response,
        provider: row.provider,
        latencyMs: Number(row.latency_ms) || 0
      };
    } catch (err) {
      console.warn('[LlmCacheService] Error reading from cache:', err);
      return null;
    }
  }

  public set(
    prompt: string,
    model: string,
    systemPrompt: string,
    provider: string,
    response: string,
    latencyMs: number = 0
  ): void {
    try {
      if (!response || !response.trim()) return;

      const db = this.ensureDb();
      if (!db) return;

      const sizeBytes = Buffer.byteLength(response, 'utf8');
      if (sizeBytes > this.maxBytes) return;

      const { id, promptHash, systemHash } = this.computeKeys(prompt, model, systemPrompt);
      const now = Date.now();
      const safeLatency = Math.max(0, Math.round(Number(latencyMs) || 0));
      const safeProvider = String(provider || 'Unknown');
      const safeModel = String(model || 'unknown');

      const executeStoreAndEvict = () => {
        db.prepare(
          `INSERT OR REPLACE INTO llm_response_cache (id, prompt_hash, model, system_hash, response, provider, latency_ms, created_at, last_hit_at, hits, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          promptHash,
          safeModel,
          systemHash,
          response,
          safeProvider,
          safeLatency,
          now,
          now,
          0,
          sizeBytes
        );

        const agg = db
          .prepare('SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as sizeBytes FROM llm_response_cache')
          .get() as { count: number; sizeBytes: number } | undefined;

        let currentCount = Number(agg?.count) || 0;
        let currentBytes = Number(agg?.sizeBytes) || 0;

        while (currentCount > this.maxEntries || currentBytes > this.maxBytes) {
          const oldest = db
            .prepare('SELECT id, size_bytes FROM llm_response_cache ORDER BY last_hit_at ASC LIMIT 1')
            .get() as { id: string; size_bytes: number } | undefined;

          if (!oldest || !oldest.id) break;

          db.prepare('DELETE FROM llm_response_cache WHERE id = ?').run(oldest.id);
          currentCount -= 1;
          currentBytes = Math.max(0, currentBytes - (Number(oldest.size_bytes) || 0));
        }
      };

      if (typeof db.transaction === 'function') {
        const tx = db.transaction(executeStoreAndEvict);
        tx();
      } else {
        executeStoreAndEvict();
      }
    } catch (err) {
      console.warn('[LlmCacheService] Error writing to cache:', err);
    }
  }

  public stats(): LlmCacheStats {
    try {
      const db = this.ensureDb();
      if (!db) return { count: 0, sizeBytes: 0, oldestCreatedAt: null };

      const row = db
        .prepare(
          'SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as sizeBytes, MIN(created_at) as oldestCreatedAt FROM llm_response_cache'
        )
        .get() as { count: number; sizeBytes: number; oldestCreatedAt: number | null } | undefined;

      const count = Number(row?.count) || 0;
      const sizeBytes = Number(row?.sizeBytes) || 0;
      const oldestCreatedAt =
        count > 0 && row?.oldestCreatedAt !== null && row?.oldestCreatedAt !== undefined
          ? Number(row.oldestCreatedAt)
          : null;

      return { count, sizeBytes, oldestCreatedAt };
    } catch (err) {
      console.warn('[LlmCacheService] Error reading cache stats:', err);
      return { count: 0, sizeBytes: 0, oldestCreatedAt: null };
    }
  }

  public clear(): { deleted: number } {
    try {
      const db = this.ensureDb();
      if (!db) return { deleted: 0 };

      const res = db.prepare('DELETE FROM llm_response_cache').run();
      return { deleted: Number(res?.changes) || 0 };
    } catch (err) {
      console.warn('[LlmCacheService] Error clearing cache:', err);
      return { deleted: 0 };
    }
  }
}

export const llmCacheService = new LlmCacheService();
