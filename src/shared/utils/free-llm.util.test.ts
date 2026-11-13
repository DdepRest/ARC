import { describe, it, expect } from 'vitest';
import { isFreeLlmGateway, extractHostPort, normalizeOpenAiEndpoint } from './free-llm.util';
import { resolveChatEndpoint, resolveBaseUrl, resolveModelsEndpoint } from '../../main/services/llm/endpoint-normalizer';
import { getFallbackModelsForProvider } from '../../main/services/llm/providers/provider.api';

describe('FreeLLM Utility & Endpoint Normalizer', () => {
  it('detects FreeLLM gateway by apiKey prefix', () => {
    expect(isFreeLlmGateway({ apiKey: 'freellmapi-72abcd1234567890' })).toBe(true);
  });

  it('detects FreeLLM gateway by dynamic ports', () => {
    expect(isFreeLlmGateway({ endpoint: 'http://127.0.0.1:31415/v1/chat/completions' })).toBe(true);
    expect(isFreeLlmGateway({ endpoint: 'http://127.0.0.1:31416/v1/chat/completions' })).toBe(true);
    expect(isFreeLlmGateway({ endpoint: 'http://192.168.1.50:31422/v1' })).toBe(true);
    expect(isFreeLlmGateway({ endpoint: 'http://localhost:3067/v1/chat/completions' })).toBe(true);
  });

  it('detects FreeLLM gateway by name or id', () => {
    expect(isFreeLlmGateway({ name: 'FreeLLMAPI' })).toBe(true);
    expect(isFreeLlmGateway({ id: 'freellm_local' })).toBe(true);
    expect(isFreeLlmGateway({ name: 'FreeAPILLM' })).toBe(true);
  });

  it('extracts host and port cleanly from various endpoint formats', () => {
    expect(extractHostPort('http://127.0.0.1:31415/v1')).toBe('127.0.0.1:31415');
    expect(extractHostPort('http://127.0.0.1:31416/v1/chat/completions')).toBe('127.0.0.1:31416');
    expect(extractHostPort('192.168.1.100:31415')).toBe('192.168.1.100:31415');
    expect(extractHostPort('https://gateway.local:8080/api/v1')).toBe('gateway.local:8080');
  });

  it('normalizes base URLs and chat endpoints properly without /v1/v1 duplication', () => {
    // User enters Base URL: http://127.0.0.1:31415/v1
    expect(resolveChatEndpoint('http://127.0.0.1:31415/v1')).toBe('http://127.0.0.1:31415/v1/chat/completions');

    // User enters dynamic port Base URL: http://127.0.0.1:31416/v1
    expect(resolveChatEndpoint('http://127.0.0.1:31416/v1')).toBe('http://127.0.0.1:31416/v1/chat/completions');

    // User enters naked IP:port
    expect(resolveChatEndpoint('127.0.0.1:31415')).toBe('http://127.0.0.1:31415/v1/chat/completions');

    // User enters full endpoint
    expect(resolveChatEndpoint('http://127.0.0.1:31415/v1/chat/completions')).toBe('http://127.0.0.1:31415/v1/chat/completions');

    // User enters /responses or /embeddings endpoint from FreeLLM dashboard
    expect(resolveChatEndpoint('http://127.0.0.1:31415/v1/responses')).toBe('http://127.0.0.1:31415/v1/chat/completions');
    expect(normalizeOpenAiEndpoint('http://127.0.0.1:31415/v1/embeddings')).toBe('http://127.0.0.1:31415/v1/chat/completions');
    expect(normalizeOpenAiEndpoint('http://127.0.0.1:31415/v1/v1/chat/completions')).toBe('http://127.0.0.1:31415/v1/chat/completions');

    // Base URL resolver
    expect(resolveBaseUrl('http://127.0.0.1:31415/v1/chat/completions')).toBe('http://127.0.0.1:31415/v1');
    expect(resolveBaseUrl('http://127.0.0.1:31416')).toBe('http://127.0.0.1:31416/v1');

    // Models endpoint resolver
    expect(resolveModelsEndpoint('http://127.0.0.1:31415/v1/chat/completions')).toBe('http://127.0.0.1:31415/v1/models');
  });

  it('returns fallback models auto and auto:fast for FreeLLM gateways', () => {
    const models = getFallbackModelsForProvider({
      id: 'custom_1',
      name: 'MyLocalProxy',
      type: 'local',
      endpoint: 'http://127.0.0.1:31416/v1/chat/completions',
      model: 'auto',
      priority: 1,
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true
    });
    expect(models).toEqual(['auto', 'auto:fast']);
  });
});
