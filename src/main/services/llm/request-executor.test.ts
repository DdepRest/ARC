import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRequestFallbackChain } from './request-executor';
import type { AiProvider } from './providers/provider.interface';

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('./providers/ollama.provider', () => ({
  executeOllamaRequest: vi.fn()
}));

const mockExecuteOpenAI = vi.fn();
vi.mock('./providers/openai.provider', () => ({
  executeOpenAICompatibleRequest: (...args: any[]) => mockExecuteOpenAI(...args)
}));

const mockBuiltInGenerate = vi.fn();
const mockIsModelDownloaded = vi.fn().mockResolvedValue(true);
vi.mock('../built-in-llm.service', () => ({
  builtInLlmService: {
    generate: (...args: any[]) => mockBuiltInGenerate(...args),
    isModelDownloaded: (...args: any[]) => mockIsModelDownloaded(...args)
  }
}));

vi.mock('./providers/provider-health', () => ({
  providerHealthManager: {
    markSuccess: vi.fn(),
    markFailure: vi.fn(),
    isQuarantined: vi.fn().mockReturnValue(false),
    getHealth: vi.fn().mockReturnValue({ healthy: true })
  }
}));

describe('request-executor (Multi-Model & Provider Execution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should stream response successfully when model succeeds', async () => {
    mockExecuteOpenAI.mockImplementation(async (provider, text, context, model, onChunk) => {
      onChunk('Привет от ИИ', true);
    });

    const provider: AiProvider = {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'cloud',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4o-mini',
      priority: 0,
      maxTokens: 1000,
      temperature: 0.7,
      selectedModels: ['openai/gpt-4o-mini'],
      enabled: true
    };

    const chunks: string[] = [];
    let isDone = false;

    await executeRequestFallbackChain(
      provider,
      'Привет',
      [],
      new AbortController(),
      (chunk, done) => {
        chunks.push(chunk);
        isDone = done;
      }
    );

    expect(mockExecuteOpenAI).toHaveBeenCalledTimes(1);
    expect(chunks.join('')).toBe('Привет от ИИ');
    expect(isDone).toBe(true);
  });

  it('should failover to second model if first model fails', async () => {
    mockExecuteOpenAI
      .mockRejectedValueOnce(new Error('Model 1 overloaded'))
      .mockImplementationOnce(async (provider, text, context, model, onChunk) => {
        onChunk('Ответ от резервной модели', true);
      });

    const provider: AiProvider = {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'cloud',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4o-mini',
      priority: 0,
      maxTokens: 1000,
      temperature: 0.7,
      selectedModels: ['openai/gpt-4o-mini', 'google/gemini-flash'],
      enabled: true
    };

    const chunks: string[] = [];
    let isDone = false;

    await executeRequestFallbackChain(
      provider,
      'Привет',
      [],
      new AbortController(),
      (chunk, done) => {
        chunks.push(chunk);
        isDone = done;
      }
    );

    expect(mockExecuteOpenAI).toHaveBeenCalledTimes(2);
    expect(chunks.join('')).toBe('Ответ от резервной модели');
    expect(isDone).toBe(true);
  });

  it('should throw error when all models fail so router can switch to next provider', async () => {
    mockExecuteOpenAI.mockRejectedValue(new Error('OpenRouter 401 Unauthorized'));

    const provider: AiProvider = {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'cloud',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4o-mini',
      priority: 0,
      maxTokens: 1000,
      temperature: 0.7,
      selectedModels: ['openai/gpt-4o-mini'],
      enabled: true
    };

    await expect(
      executeRequestFallbackChain(
        provider,
        'Привет',
        [],
        new AbortController(),
        () => {}
      )
    ).rejects.toThrow('OpenRouter 401 Unauthorized');
  });

  it('should preserve model "auto" for FreeLLMAPI instead of replacing with gpt-4o', async () => {
    mockExecuteOpenAI.mockImplementation(async (provider, text, context, model, onChunk) => {
      onChunk('FreeLLMAPI auto response', true);
    });

    const provider: AiProvider = {
      id: 'freellm',
      name: 'FreeLLMAPI',
      type: 'local',
      endpoint: 'http://127.0.0.1:31415/v1/chat/completions',
      model: 'auto',
      selectedModels: ['auto'],
      priority: 0,
      maxTokens: 1000,
      temperature: 0.7,
      enabled: true
    };

    const chunks: string[] = [];
    await executeRequestFallbackChain(
      provider,
      'Тест',
      [],
      new AbortController(),
      (chunk) => chunks.push(chunk)
    );

    expect(mockExecuteOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'auto' }),
      'Тест',
      [],
      expect.any(AbortController),
      expect.any(Function),
      undefined
    );
    expect(chunks.join('')).toBe('FreeLLMAPI auto response');
  });
});
