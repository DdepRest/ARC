import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { reactive, ref } from 'vue';
import { useChatStore } from './chat.store';

describe('useChatStore IPC sanitization & resilience', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const storageMap = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear()
    };
  });

  it('strips Vue reactive Proxy before dialogAddMessage (structuredClone succeeds without throwing)', async () => {
    const clonedPayloads: any[] = [];
    (globalThis as any).window = {
      api: {
        dialogCreateSession: vi.fn().mockImplementation(async (name: any) => {
          structuredClone(name);
          return { id: 42 };
        }),
        dialogAddMessage: vi.fn().mockImplementation(async (sessionId: any, role: any, content: any, metadata: any) => {
          // Simulate Electron IPC structuredClone enforcement
          const cloned = structuredClone({ sessionId, role, content, metadata });
          clonedPayloads.push(cloned);
          return { id: 101, created_at: new Date().toISOString() };
        }),
        dialogGenerateSummary: vi.fn().mockResolvedValue(undefined)
      }
    };

    const store = useChatStore();

    // Pass a reactive Proxy containing nested ref/reactive objects and non-cloneable functions
    const reactiveMeta = reactive({
      source: 'live' as const,
      provider: 'FreeLLM',
      latency: 120,
      isCache: false,
      reqId: 'req-777',
      ttsEngine: 'silero' as const,
      ttsCached: false,
      uncloneableFn: () => 'should be stripped',
      nestedProxy: ref({ componentRef: () => {} })
    });

    const proxyMessage = reactive({
      id: 'msg-1',
      role: 'assistant' as const,
      content: 'Привет! Система готова к работе.',
      timestamp: Date.now(),
      executionSteps: reactive([
        { id: 'step-1', description: 'Синтез', status: 'success' as const }
      ]),
      meta: reactiveMeta as any
    });

    await expect(store.addMessage(proxyMessage as any)).resolves.toBeUndefined();

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].id).toBe('101');
    expect(store.messages[0].content).toBe('Привет! Система готова к работе.');
    expect(store.messages[0].meta?.ttsEngine).toBe('silero');
    expect((store.messages[0].meta as any)?.uncloneableFn).toBeUndefined();
    expect(clonedPayloads).toHaveLength(1);
    expect(clonedPayloads[0].metadata.meta).toEqual({
      source: 'live',
      provider: 'FreeLLM',
      latency: 120,
      isCache: false,
      reqId: 'req-777',
      ttsEngine: 'silero',
      ttsCached: false
    });
  });

  it('keeps message in UI even if dialogAddMessage throws an IPC error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (globalThis as any).window = {
      api: {
        dialogCreateSession: vi.fn().mockResolvedValue({ id: 7 }),
        dialogAddMessage: vi.fn().mockRejectedValue(new Error('An object could not be cloned'))
      }
    };

    const store = useChatStore();
    await expect(
      store.addMessage({
        id: 'msg-err-test',
        role: 'user',
        content: 'Проверка устойчивости UI',
        timestamp: Date.now()
      })
    ).resolves.toBeUndefined();

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].content).toBe('Проверка устойчивости UI');
    errorSpy.mockRestore();
  });

  it('updates ttsMeta reactively via updateMessageTtsMeta with sanitized primitives', async () => {
    (globalThis as any).window = { api: {} };
    const store = useChatStore();
    store.setActiveSessionId(5);

    await store.addMessage({
      id: 'msg-tts-1',
      role: 'assistant',
      content: 'Тест синтеза речи',
      timestamp: Date.now(),
      meta: { source: 'live', reqId: 'q-999' }
    });

    const reactiveTtsPayload = reactive({
      engine: 'silero' as const,
      isCached: true,
      queryId: 'q-999',
      extraFn: () => {}
    });

    const updated = store.updateMessageTtsMeta(reactiveTtsPayload as any);
    expect(updated).toBe(true);
    expect(store.messages[0].meta?.ttsEngine).toBe('silero');
    expect(store.messages[0].meta?.ttsCached).toBe(true);
    expect(() => structuredClone(JSON.parse(JSON.stringify(store.messages[0].meta)))).not.toThrow();
  });
});
