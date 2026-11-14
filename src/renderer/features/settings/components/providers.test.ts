import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { PRESETS } from './sections/providers/presetsData';
import { useAiConfigStore, type AIProvider } from '../../../stores/aiConfig';
import {
  getProviderListStatus,
  useProviderInspectorDraft,
  useQuarantineWatch
} from '../composables/useProviderInspectorDraft';

describe('Providers & Settings Vue Unit Tests', () => {
  let mockProvidersList: any[] = [];

  beforeEach(() => {
    setActivePinia(createPinia());
    mockProvidersList = [
      {
        id: 'p_1',
        name: 'OpenRouter',
        type: 'cloud',
        endpoint: 'https://openrouter.ai/api/v1',
        apiKey: '••••••••••••••••',
        model: 'meta-llama/llama-3.3-70b-instruct',
        selectedModels: ['meta-llama/llama-3.3-70b-instruct'],
        routingStrategy: 'smart_route',
        priority: 1,
        maxTokens: 2048,
        temperature: 0.7,
        enabled: true
      },
      {
        id: 'p_2',
        name: 'DeepSeek',
        type: 'cloud',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: '••••••••••••••••',
        model: 'deepseek-chat',
        selectedModels: ['deepseek-chat'],
        routingStrategy: 'smart_route',
        priority: 2,
        maxTokens: 4096,
        temperature: 0.7,
        enabled: true
      }
    ];

    const mockApi = {
      getAiProviders: vi.fn().mockImplementation(async () => JSON.parse(JSON.stringify(mockProvidersList))),
      saveAiProvider: vi.fn().mockImplementation(async (provider) => {
        const idx = mockProvidersList.findIndex(p => p.id === provider.id);
        if (idx > -1) mockProvidersList[idx] = JSON.parse(JSON.stringify(provider));
        else mockProvidersList.push(JSON.parse(JSON.stringify(provider)));
        return { success: true };
      }),
      deleteAiProvider: vi.fn().mockImplementation(async (id) => {
        mockProvidersList = mockProvidersList.filter(p => p.id !== id);
      }),
      testAiConnection: vi.fn().mockResolvedValue({ success: true }),
      getQuarantinedAiProviders: vi.fn().mockResolvedValue([])
    };

    Object.defineProperty(global, 'window', {
      value: { api: mockApi },
      writable: true,
      configurable: true
    });

    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString();
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        }
      };
    })();
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Presets Database (presetsData.ts)', () => {
    it('should contain valid preset configurations', () => {
      expect(PRESETS.length).toBeGreaterThan(20);
      PRESETS.forEach(preset => {
        expect(preset.name).toBeTruthy();
        expect(['cloud', 'local']).toContain(preset.type);
        expect(typeof preset.endpoint).toBe('string');
        expect(typeof preset.model).toBe('string');
      });
    });

    it('should correctly categorize free tier vs paid vs local presets', () => {
      const freePresets = PRESETS.filter(p => p.freeTier === 'free' || p.freeTier === 'freemium');
      const localPresets = PRESETS.filter(p => p.type === 'local');
      const cloudPresets = PRESETS.filter(p => p.type === 'cloud');

      expect(freePresets.length).toBeGreaterThan(0);
      expect(localPresets.length).toBeGreaterThan(0);
      expect(cloudPresets.length).toBeGreaterThan(0);
      expect(PRESETS.some(p => p.name === 'OpenRouter')).toBe(true);
      expect(PRESETS.some(p => p.name.includes('Ollama'))).toBe(true);
    });
  });

  describe('useAiConfigStore Operations', () => {
    it('should load default providers when store is initialized', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();
      expect(Array.isArray(store.providers)).toBe(true);
      expect(store.providers.length).toBeGreaterThan(0);
    });

    it('should update routing strategy and save provider', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();
      const firstProvider = store.providers[0];
      expect(firstProvider).toBeDefined();

      firstProvider.routingStrategy = 'fallback';
      firstProvider.selectedModels = ['model-a', 'model-b'];
      await store.saveProvider(firstProvider);

      const savedProvider = mockProvidersList.find((p: any) => p.id === firstProvider.id);
      expect(savedProvider).toBeDefined();
      expect(savedProvider.routingStrategy).toBe('fallback');
      expect(savedProvider.selectedModels).toEqual(['model-a', 'model-b']);
    });

    it('should delete a provider by ID', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();
      const initialCount = store.providers.length;
      const targetId = store.providers[0].id;

      await store.deleteProvider(targetId);
      expect(store.providers.length).toBe(initialCount - 1);
      expect(store.providers.some(p => p.id === targetId)).toBe(false);
    });

    it('should support apiKey on both local and cloud providers (e.g. FreeLLMAPI)', async () => {
      const store = useAiConfigStore();
      const freeLlmProvider = {
        id: 'new_freellm',
        name: 'FreeLLMAPI',
        type: 'local' as const,
        endpoint: 'http://127.0.0.1:3001/v1/chat/completions',
        apiKey: 'sk-freellm-test-key',
        model: 'gpt-4o',
        selectedModels: ['gpt-4o'],
        routingStrategy: 'smart_route' as const,
        priority: 1,
        maxTokens: 4096,
        temperature: 0.7,
        enabled: true
      };

      await store.saveProvider(freeLlmProvider);
      expect(store.providers.find(p => p.id === 'new_freellm')?.apiKey).toBe('sk-freellm-test-key');
    });
  });

  describe('P1 3.4 — Semantic Non-Nested Controls & Keyboard Accessibility in ProvidersSection', () => {
    it('does not nest <button> inside <div role="button"> and renders two sibling semantic <button type="button"> controls with aria-pressed', () => {
      const sfcPath = path.resolve(__dirname, './sections/ProvidersSection.vue');
      const source = fs.readFileSync(sfcPath, 'utf-8');

      // Ensure no <div ... role="button"> exists in ProvidersSection
      expect(source).not.toMatch(/role=["']button["']/);
      // Ensure list item uses role="listitem" with two sibling buttons (toggleProviderEnabled and selectProvider)
      expect(source).toContain('role="listitem"');
      expect(source).toContain('@click="toggleProviderEnabled(p)"');
      expect(source).toContain('@click="selectProvider(p)"');
      expect(source).toContain(':aria-pressed="Boolean(p.enabled)"');
      expect(source).toContain(':aria-pressed="selectedProvider?.id === p.id"');
    });
  });

  describe('P2 4.1 — Reactive Quarantine Expiration Timer (useQuarantineWatch)', () => {
    it('automatically clears two quarantined providers with different expiration deadlines sequentially without manual action', async () => {
      vi.useFakeTimers();
      const t0 = new Date('2026-11-14T12:00:00Z').getTime();
      vi.setSystemTime(t0);

      const store = useAiConfigStore();
      store.quarantinedProviders = [
        { id: 'p_1', name: 'OpenRouter', quarantineUntil: t0 + 1000 },
        { id: 'p_2', name: 'DeepSeek', quarantineUntil: t0 + 3000 }
      ];

      const refreshSpy = vi.fn();
      const watcher = useQuarantineWatch(
        computed(() => store.quarantinedProviders),
        refreshSpy
      );

      expect(watcher.activeQuarantineCount.value).toBe(2);
      expect(watcher.isProviderQuarantined('p_1')).toBe(true);
      expect(watcher.isProviderQuarantined('p_2')).toBe(true);

      // Advance past first provider's quarantine (1000ms + 25ms buffer)
      await vi.advanceTimersByTimeAsync(1050);
      expect(watcher.isProviderQuarantined('p_1')).toBe(false);
      expect(watcher.isProviderQuarantined('p_2')).toBe(true);
      expect(watcher.activeQuarantineCount.value).toBe(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      // Advance past second provider's quarantine (remaining ~2000ms)
      await vi.advanceTimersByTimeAsync(2050);
      expect(watcher.isProviderQuarantined('p_2')).toBe(false);
      expect(watcher.activeQuarantineCount.value).toBe(0);
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      watcher.dispose();
    });
  });

  describe('P2 4.2 — Unified Inspector Draft Lifecycle, enabled Race Protection, & Masked Key Preservation', () => {
    it('manages clean -> dirty -> saving -> saved -> error lifecycle and protects against concurrent saves', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();

      const inspector = useProviderInspectorDraft({
        providers: computed(() => store.providers),
        saveProvider: (p) => store.saveProvider(p)
      });

      expect(inspector.saveLifecycleState.value).toBe('clean');
      expect(inspector.isDirty.value).toBe(false);

      // Mutate draft fields across tabs (access, models, params)
      inspector.draftProvider.value!.endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      inspector.draftProvider.value!.routingStrategy = 'fallback';
      inspector.draftProvider.value!.temperature = 0.3;
      expect(inspector.isDirty.value).toBe(true);
      expect(inspector.saveLifecycleState.value).toBe('dirty');

      // Concurrency protection: two simultaneous saveDraft calls invoke saveAiProvider only once
      const saveSpy = (window as any).api.saveAiProvider;
      const [r1, r2] = await Promise.all([inspector.saveDraft(), inspector.saveDraft()]);
      expect(r1.success).toBe(true);
      expect(r2.skipped).toBe(true);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(inspector.isDirty.value).toBe(false);
      expect(inspector.saveLifecycleState.value).toBe('saved');

      // On save failure, retains dirty state and user edits
      inspector.draftProvider.value!.name = 'OpenRouter Edited';
      expect(inspector.isDirty.value).toBe(true);
      saveSpy.mockResolvedValueOnce({ success: false, error: 'DPAPI write failed' });
      const errRes = await inspector.saveDraft();
      expect(errRes.success).toBe(false);
      expect(inspector.saveLifecycleState.value).toBe('error');
      expect(inspector.isDirty.value).toBe(true);
      expect(inspector.draftProvider.value!.name).toBe('OpenRouter Edited');
      expect(inspector.saveError.value).toBe('DPAPI write failed');
    });

    it('prevents enabled race condition: toggling enabled in list while draft is open is preserved upon draft Save', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();

      const inspector = useProviderInspectorDraft({
        providers: computed(() => store.providers),
        saveProvider: (p) => store.saveProvider(p)
      });

      // 1. Open draft and modify temperature (while provider was initially enabled = true)
      expect(store.providers[0].enabled).toBe(true);
      inspector.draftProvider.value!.temperature = 0.2;
      expect(inspector.isDirty.value).toBe(true);

      // 2. Toggle provider enabled OFF in the Master list
      store.providers[0].enabled = false;
      await store.saveProvider(store.providers[0]);
      expect(store.providers[0].enabled).toBe(false);
      // Draft remains dirty with user's temperature edit
      expect(inspector.isDirty.value).toBe(true);

      // 3. Save draft -> enabled MUST stay false (not reverted to true)
      const res = await inspector.saveDraft();
      expect(res.success).toBe(true);
      expect(store.providers[0].enabled).toBe(false);
      expect(store.providers[0].temperature).toBe(0.2);
    });

    it('preserves untouched MASKED_SECRET_PLACEHOLDER on draft Save without wiping the key', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();

      const inspector = useProviderInspectorDraft({
        providers: computed(() => store.providers),
        saveProvider: (p) => store.saveProvider(p)
      });

      expect(inspector.draftProvider.value!.apiKey).toBe('••••••••••••••••');
      inspector.draftProvider.value!.maxTokens = 8192;

      const saveSpy = (window as any).api.saveAiProvider;
      await inspector.saveDraft();

      expect(saveSpy).toHaveBeenCalledTimes(1);
      const savedPayload = saveSpy.mock.calls[0][0];
      expect(savedPayload.apiKey).toBe('••••••••••••••••');
      expect(savedPayload.maxTokens).toBe(8192);
    });

    it('guards unsaved draft edits when switching providers (Save & Switch, Discard & Switch, Cancel)', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();

      const inspector = useProviderInspectorDraft({
        providers: computed(() => store.providers),
        saveProvider: (p) => store.saveProvider(p)
      });

      expect(inspector.selectedProviderId.value).toBe('p_1');
      inspector.draftProvider.value!.priority = 9;
      expect(inspector.isDirty.value).toBe(true);

      // Request switch to p_2 while dirty -> blocked, sets pendingSwitchProvider
      const switchedImmediately = inspector.requestSelectProvider(store.providers[1]);
      expect(switchedImmediately).toBe(false);
      expect(inspector.selectedProviderId.value).toBe('p_1');
      expect(inspector.pendingSwitchProvider.value?.id).toBe('p_2');

      // 1. Cancel switch -> stays on p_1 with dirty edits intact
      inspector.cancelSwitch();
      expect(inspector.pendingSwitchProvider.value).toBeNull();
      expect(inspector.selectedProviderId.value).toBe('p_1');
      expect(inspector.draftProvider.value!.priority).toBe(9);

      // 2. Request switch again and Discard -> switches to p_2 and discards p_1 draft edits
      inspector.requestSelectProvider(store.providers[1]);
      inspector.discardAndSwitch();
      expect(inspector.selectedProviderId.value).toBe('p_2');
      expect(inspector.isDirty.value).toBe(false);
      expect(store.providers[0].priority).toBe(1);

      // 3. Edit p_2, request switch to p_1, and Confirm Save & Switch -> saves p_2 and switches to p_1
      inspector.draftProvider.value!.priority = 5;
      inspector.requestSelectProvider(store.providers[0]);
      await inspector.confirmSaveAndSwitch();
      expect(inspector.selectedProviderId.value).toBe('p_1');
      expect(store.providers.find(p => p.id === 'p_2')?.priority).toBe(5);
    });

    it('keeps saved provider list badge as НЕ ПРОВЕРЕН when testing an unsaved draft with modified fingerprint', async () => {
      const store = useAiConfigStore();
      await store.loadProviders();

      const inspector = useProviderInspectorDraft({
        providers: computed(() => store.providers),
        saveProvider: (p) => store.saveProvider(p)
      });

      // Edit model in draft (without saving)
      inspector.draftProvider.value!.model = 'google/gemini-2.5-pro';
      const draftPayload = inspector.buildMergedProviderPayload()!;

      // Run connection test on the modified draft
      await store.testConnection(draftPayload);

      // Inspector sees test success for draft fingerprint
      expect(store.getProviderTestState(inspector.draftProvider.value!)?.status).toBe('success');

      // Saved provider in store has old model, so its fingerprint does NOT match -> list status stays configured_untested (НЕ ПРОВЕРЕН)
      const savedProvider = store.providers[0];
      expect(store.getProviderTestState(savedProvider)).toBeNull();
      expect(getProviderListStatus(savedProvider, store.getProviderTestState(savedProvider), false).state).toBe('configured_untested');
    });
  });

  describe('P2 4.3 — 7-State Provider List Status Classification (getProviderListStatus)', () => {
    const baseProvider: AIProvider = {
      id: 'p_test',
      name: 'OpenRouter',
      type: 'cloud',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: '••••••••••••••••',
      model: 'gpt-4o',
      priority: 1,
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true
    };

    it('distinguishes all 7 required states and never returns ГОТОВ for untested config', () => {
      // 1. Quarantined
      expect(getProviderListStatus(baseProvider, null, true)).toMatchObject({
        state: 'quarantined',
        label: 'КАРАНТИН'
      });

      // 2. Disabled
      expect(getProviderListStatus({ ...baseProvider, enabled: false }, null, false)).toMatchObject({
        state: 'disabled',
        label: 'ОТКЛ'
      });

      // 3. Testing in progress
      expect(
        getProviderListStatus(baseProvider, { status: 'loading', configFingerprint: 'fp' }, false)
      ).toMatchObject({
        state: 'testing',
        label: 'ТЕСТ...'
      });

      // 4. Test error
      expect(
        getProviderListStatus(baseProvider, { status: 'error', configFingerprint: 'fp' }, false)
      ).toMatchObject({
        state: 'test_error',
        label: 'ОШИБКА'
      });

      // 5. Unconfigured (missing key or invalid URL)
      expect(
        getProviderListStatus({ ...baseProvider, apiKey: '' }, null, false)
      ).toMatchObject({
        state: 'unconfigured',
        label: 'НЕ НАСТРОЕН'
      });

      // 6. Configured, untested -> НЕ ПРОВЕРЕН (never ГОТОВ)
      const untestedBadge = getProviderListStatus(baseProvider, null, false);
      expect(untestedBadge).toMatchObject({
        state: 'configured_untested',
        label: 'НЕ ПРОВЕРЕН'
      });
      expect(untestedBadge.label).not.toBe('ГОТОВ');

      // 7. Verified connection -> ПОДТВЕРЖДЁН
      expect(
        getProviderListStatus(baseProvider, { status: 'success', configFingerprint: 'fp' }, false)
      ).toMatchObject({
        state: 'verified',
        label: 'ПОДТВЕРЖДЁН'
      });
    });
  });
});
