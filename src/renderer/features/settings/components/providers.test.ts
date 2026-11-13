import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { PRESETS } from './sections/providers/presetsData';
import { useAiConfigStore } from '../../../stores/aiConfig';

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
        model: 'meta-llama/llama-3.3-70b-instruct',
        selectedModels: ['meta-llama/llama-3.3-70b-instruct'],
        routingStrategy: 'smart_route',
        priority: 1,
        maxTokens: 2048,
        temperature: 0.7,
        enabled: true
      }
    ];

    // Mock window & window.api
    const mockApi = {
      getAiProviders: vi.fn().mockImplementation(async () => [...mockProvidersList]),
      saveAiProvider: vi.fn().mockImplementation(async (provider) => {
        const idx = mockProvidersList.findIndex(p => p.id === provider.id);
        if (idx > -1) mockProvidersList[idx] = provider;
        else mockProvidersList.push(provider);
      }),
      deleteAiProvider: vi.fn().mockImplementation(async (id) => {
        mockProvidersList = mockProvidersList.filter(p => p.id !== id);
      }),
      testAiConnection: vi.fn().mockResolvedValue({ success: true })
    };

    Object.defineProperty(global, 'window', {
      value: { api: mockApi },
      writable: true,
      configurable: true
    });

    // Mock localStorage
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

      // Verify OpenRouter & Ollama are present
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

    it('should mock connection test gracefully', async () => {
      const store = useAiConfigStore();
      const testProvider = {
        id: 'test_1',
        name: 'Test Cloud',
        type: 'cloud' as const,
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-fake-key',
        model: 'gpt-4o',
        priority: 1,
        maxTokens: 2048,
        temperature: 0.7,
        enabled: true
      };

      const res = await store.testConnection(testProvider);
      expect(res.success).toBe(true);
    });
  });

  describe('Provider Model Selection Logic', () => {
    it('should toggle model selections for multi-model routing', () => {
      const provider = {
        id: 'p1',
        name: 'Test Provider',
        model: 'model-1',
        selectedModels: ['model-1'],
        routingStrategy: 'smart_route' as const
      };

      // Helper simulating ProviderModelCatalog toggleModelSelection
      const toggleModelSelection = (mName: string) => {
        if (!provider.selectedModels) provider.selectedModels = [];
        const idx = provider.selectedModels.indexOf(mName);
        if (idx > -1) {
          provider.selectedModels.splice(idx, 1);
        } else {
          provider.selectedModels.push(mName);
        }
      };

      toggleModelSelection('model-2');
      expect(provider.selectedModels).toContain('model-1');
      expect(provider.selectedModels).toContain('model-2');

      toggleModelSelection('model-1');
      expect(provider.selectedModels).not.toContain('model-1');
      expect(provider.selectedModels).toContain('model-2');
    });

    it('should filter models by search query and category', () => {
      const fetchedModels = [
        'meta-llama/llama-3.3-70b-instruct',
        'google/gemini-2.0-flash-exp:free',
        'deepseek/deepseek-r1',
        'qwen/qwen-2.5-coder-32b-instruct'
      ];

      const filterModels = (query: string, category: string) => {
        return fetchedModels.filter(m => {
          const name = m.toLowerCase();
          if (category === 'llama' && !name.includes('llama')) return false;
          if (category === 'gemini' && !name.includes('gemini')) return false;
          if (category === 'deepseek' && !name.includes('deepseek') && !name.includes('r1')) return false;
          if (category === 'free' && !name.includes('free')) return false;

          if (!query) return true;
          return name.includes(query.toLowerCase());
        });
      };

      expect(filterModels('', 'llama')).toEqual(['meta-llama/llama-3.3-70b-instruct']);
      expect(filterModels('', 'free')).toEqual(['google/gemini-2.0-flash-exp:free']);
      expect(filterModels('coder', 'all')).toEqual(['qwen/qwen-2.5-coder-32b-instruct']);
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
});
