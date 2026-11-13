import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeOpenAICompatibleRequest } from './openai.provider';
import type { AiProvider } from './provider.interface';
import axios from 'axios';

vi.mock('axios');
vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../memory/memory-manager', () => ({
  memoryManager: {
    enrichContext: vi.fn().mockResolvedValue(''),
    getContextMessages: vi.fn().mockResolvedValue([]),
    getPromptContext: vi.fn().mockResolvedValue('')
  }
}));

vi.mock('../../tools/tool-dispatcher', () => {
  return {
    ToolDispatcher: {
      getInstance: () => ({
        getToolDefinitions: vi.fn().mockReturnValue([]),
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: [], // empty result from Wikipedia/Web Search
          toolName: 'wikipedia'
        }),
        formatResult: (data: any) => JSON.stringify(data)
      })
    }
  };
});

vi.mock('../../tts.service', () => ({
  ttsService: {
    speak: vi.fn()
  }
}));

vi.mock('../../security/secret-vault.service', () => ({
  MASKED_SECRET_PLACEHOLDER: '••••••••••••••••',
  providerApiKeySlot: (id: string) => `provider:${id}:api_key`,
  secretVault: {
    resolveProviderApiKey: vi.fn().mockReturnValue({ value: 'mock-api-key', status: 'ok' }),
    setSecret: vi.fn().mockReturnValue({ persisted: true, mode: 'safeStorage' }),
    deleteSecret: vi.fn(),
    hasSecret: vi.fn().mockReturnValue(true)
  }
}));

describe('openai.provider (Iteration A - Protection against empty tool results)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return refusal fallback without follow-up request when tool result is empty array', async () => {
    // Mock first response from model: calling tool wikipedia
    const firstCallResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'Минуту, уточняю в энциклопедии...\nTOOL: wikipedia {"query":"несуществующая_компания_xyz"}'
            }
          }
        ]
      }
    };

    vi.mocked(axios.post).mockResolvedValueOnce(firstCallResponse as any);

    const provider: AiProvider = {
      id: 'test-provider',
      name: 'Test',
      type: 'cloud',
      endpoint: 'https://test.api/v1/chat/completions',
      model: 'test-model',
      priority: 0,
      maxTokens: 1000,
      temperature: 0.7,
      enabled: true
    };

    const receivedChunks: string[] = [];
    let isDone = false;
    let finalToolSource: any = null;

    await executeOpenAICompatibleRequest(
      provider,
      'АРК, расскажи о несуществующей_компании_xyz',
      [],
      new AbortController(),
      (chunk, done, isSearching, toolSource) => {
        if (chunk) receivedChunks.push(chunk);
        isDone = done;
        if (toolSource) finalToolSource = toolSource;
      }
    );

    // Only 1 axios.post should have been made (no follow-up call with empty data)
    expect(axios.post).toHaveBeenCalledTimes(1);

    const fullResponse = receivedChunks.join('');
    expect(fullResponse).toContain('Я не нашёл релевантной информации по вашему запросу.');
    expect(fullResponse).toContain('статья ещё не написана');
    expect(isDone).toBe(true);
    expect(finalToolSource?.isEmpty).toBe(true);
  });
});
