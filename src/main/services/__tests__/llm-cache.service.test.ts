import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/arc-test-userdata')
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([])
  },
  ipcMain: {
    handle: vi.fn()
  }
}));

import { DatabaseService } from '../database';
import { LlmCacheService, LLM_CACHE_TTL_MS } from '../llm-cache.service';

describe('LlmCacheService (smart-cache-v1)', () => {
  let cache: LlmCacheService;

  beforeEach(() => {
    DatabaseService.init();
    cache = new LlmCacheService();
    cache.clear();
  });

  it('1. set + get returns cached response, provider, latencyMs and updates hits/last_hit_at', () => {
    cache.set('Привет, кто ты?', 'google/gemini-2.5-flash', 'SysPrompt-v1', 'OpenRouter', 'Я A.R.C.', 142);

    const hit = cache.get('Привет, кто ты?', 'google/gemini-2.5-flash', 'SysPrompt-v1');
    expect(hit).not.toBeNull();
    expect(hit?.response).toBe('Я A.R.C.');
    expect(hit?.provider).toBe('OpenRouter');
    expect(hit?.latencyMs).toBe(142);

    const stats = cache.stats();
    expect(stats.count).toBe(1);
    expect(stats.sizeBytes).toBe(Buffer.byteLength('Я A.R.C.', 'utf8'));
    expect(typeof stats.oldestCreatedAt).toBe('number');

    const { id } = cache.computeKeys('Привет, кто ты?', 'google/gemini-2.5-flash', 'SysPrompt-v1');
    const row = DatabaseService.db.prepare('SELECT hits FROM llm_response_cache WHERE id = ?').get(id) as any;
    expect(Number(row?.hits)).toBe(1);
  });

  it('2. different model with identical prompt and systemPrompt results in cache miss', () => {
    cache.set('Что такое квантовый реактор?', 'gpt-4o-mini', 'SysPrompt-v1', 'OpenAI', 'Ответ модели 1', 120);

    const miss = cache.get('Что такое квантовый реактор?', 'claude-3-5-sonnet', 'SysPrompt-v1');
    expect(miss).toBeNull();

    const hit = cache.get('Что такое квантовый реактор?', 'gpt-4o-mini', 'SysPrompt-v1');
    expect(hit?.response).toBe('Ответ модели 1');
  });

  it('3. different systemPrompt with identical prompt and model results in cache miss', () => {
    cache.set('Статус систем', 'qwen2.5-7b', 'Ты краткий ассистент', 'Local Ollama', 'Все системы в норме.', 85);

    const miss = cache.get('Статус систем', 'qwen2.5-7b', 'Ты подробный аналитик');
    expect(miss).toBeNull();

    const hit = cache.get('Статус систем', 'qwen2.5-7b', 'Ты краткий ассистент');
    expect(hit?.response).toBe('Все системы в норме.');
  });

  it('4. expired entry (> 24h TTL) returns null and is removed from database', () => {
    const baseTime = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    cache.set('Устаревший запрос', 'gemini-2.5-flash', 'SysPrompt', 'Gemini', 'Старый ответ', 90);
    expect(cache.stats().count).toBe(1);

    // Advance past 24 hours TTL
    nowSpy.mockReturnValue(baseTime + LLM_CACHE_TTL_MS + 1000);

    const expiredHit = cache.get('Устаревший запрос', 'gemini-2.5-flash', 'SysPrompt');
    expect(expiredHit).toBeNull();
    expect(cache.stats().count).toBe(0);

    nowSpy.mockRestore();
  });

  it('5. LRU eviction removes entry with oldest last_hit_at when MAX_ENTRIES is exceeded', () => {
    (cache as any).maxEntries = 3;
    const baseTime = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(baseTime + 100);
    cache.set('prompt-1', 'model-a', 'sys', 'ProviderA', 'resp-1', 10);

    nowSpy.mockReturnValue(baseTime + 200);
    cache.set('prompt-2', 'model-a', 'sys', 'ProviderA', 'resp-2', 10);

    nowSpy.mockReturnValue(baseTime + 300);
    cache.set('prompt-3', 'model-a', 'sys', 'ProviderA', 'resp-3', 10);

    // Touch prompt-1 at t+400 so prompt-2 becomes the least recently used (oldest last_hit_at = t+200)
    nowSpy.mockReturnValue(baseTime + 400);
    expect(cache.get('prompt-1', 'model-a', 'sys')?.response).toBe('resp-1');

    // Insert prompt-4 at t+500 -> should evict prompt-2
    nowSpy.mockReturnValue(baseTime + 500);
    cache.set('prompt-4', 'model-a', 'sys', 'ProviderA', 'resp-4', 10);

    expect(cache.stats().count).toBe(3);
    expect(cache.get('prompt-2', 'model-a', 'sys')).toBeNull();
    expect(cache.get('prompt-1', 'model-a', 'sys')?.response).toBe('resp-1');
    expect(cache.get('prompt-3', 'model-a', 'sys')?.response).toBe('resp-3');
    expect(cache.get('prompt-4', 'model-a', 'sys')?.response).toBe('resp-4');

    nowSpy.mockRestore();
  });

  it('6. clear() deletes all cached entries and resets stats to zero', () => {
    cache.set('q1', 'm1', 's1', 'P1', 'r1', 10);
    cache.set('q2', 'm1', 's1', 'P1', 'r2', 20);
    expect(cache.stats().count).toBe(2);

    const res = cache.clear();
    expect(res.deleted).toBe(2);

    const after = cache.stats();
    expect(after.count).toBe(0);
    expect(after.sizeBytes).toBe(0);
    expect(after.oldestCreatedAt).toBeNull();
  });

  it('7. empty or whitespace-only response is not saved to cache', () => {
    cache.set('пустой', 'm1', 's1', 'P1', '', 15);
    cache.set('пробелы', 'm1', 's1', 'P1', '   \n\t  ', 15);

    expect(cache.stats().count).toBe(0);
    expect(cache.get('пустой', 'm1', 's1')).toBeNull();
    expect(cache.get('пробелы', 'm1', 's1')).toBeNull();
  });
});
