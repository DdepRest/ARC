import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}));

vi.mock('../../memory/memory-manager', () => ({
  memoryManager: {
    enrichContext: vi.fn().mockResolvedValue({ relevantFacts: [], userPreferences: [] }),
    getContextMessages: vi.fn().mockResolvedValue([])
  }
}));

const mockExecuteTool = vi.fn().mockResolvedValue({ data: [{ title: 'Квазар', snippet: 'Астрономический объект' }] });
const mockFormatResult = vi.fn().mockReturnValue('Квазар — яркий астрономический объект.');

vi.mock('../../tools/tool-dispatcher', () => ({
  ToolDispatcher: {
    getInstance: () => ({
      getToolDefinitions: () => [{ name: 'wikipedia', description: 'Search Wikipedia', parameters: {} }],
      executeTool: mockExecuteTool,
      formatResult: mockFormatResult
    })
  }
}));

const mockSpeakAndWait = vi.fn().mockResolvedValue(undefined);
vi.mock('../../tts.service', () => ({
  ttsService: {
    speakAndWait: (...args: any[]) => mockSpeakAndWait(...args),
    speak: vi.fn().mockResolvedValue(undefined)
  }
}));

import axios from 'axios';
import { executeOllamaRequest } from './ollama.provider';
import type { AiProvider } from './provider.interface';

describe('Ollama Provider - NDJSON Streaming, Thinking Filter & Tool Calls (Task 2.2)', () => {
  const mockProvider: AiProvider = {
    id: 'ollama',
    name: 'Ollama Local',
    type: 'local',
    endpoint: 'http://localhost:11434/api/generate',
    model: 'qwen2.5:7b',
    priority: 1,
    apiKey: '',
    hasApiKey: false,
    maxTokens: 1024,
    temperature: 0.7,
    enabled: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (axios.post as any).mockReset();
  });

  it('streams NDJSON chunks and strips <think> blocks via StreamingThinkingFilter', async () => {
    const stream = new EventEmitter();
    (axios.post as any).mockImplementationOnce(() => {
      setImmediate(() => {
        stream.emit('data', Buffer.from(JSON.stringify({ response: '<think>Анализирую запрос...', done: false }) + '\n'));
        stream.emit('data', Buffer.from(JSON.stringify({ response: ' готово.</think>Привет', done: false }) + '\n'));
        stream.emit('data', Buffer.from(JSON.stringify({ response: ', я A.R.C.!', done: false }) + '\n'));
        stream.emit('data', Buffer.from(JSON.stringify({ response: '', done: true }) + '\n'));
        stream.emit('end');
      });
      return Promise.resolve({ data: stream });
    });

    const chunks: Array<{ chunk: string; done: boolean }> = [];
    const abortController = new AbortController();

    await executeOllamaRequest(mockProvider, 'Привет', [], abortController, (chunk, done) => {
      chunks.push({ chunk, done });
    });

    const combinedText = chunks.map(c => c.chunk).join('');
    expect(combinedText).toBe('Привет, я A.R.C.!');
    expect(combinedText).not.toContain('<think>');
    expect(chunks[chunks.length - 1].done).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/generate',
      expect.objectContaining({ stream: true }),
      expect.objectContaining({ responseType: 'stream' })
    );
  });

  it('parses tool call at done:true, invokes ttsService.speakAndWait for wikipedia, and executes tool', async () => {
    const stream = new EventEmitter();
    (axios.post as any)
      .mockImplementationOnce(() => {
        setImmediate(() => {
          stream.emit('data', Buffer.from(JSON.stringify({ response: 'Ищу в Википедии.\n', done: false }) + '\n'));
          stream.emit('data', Buffer.from(JSON.stringify({ response: 'TOOL: wikipedia {"query": "Квазар"}', done: false }) + '\n'));
          stream.emit('data', Buffer.from(JSON.stringify({ response: '', done: true }) + '\n'));
          stream.emit('end');
        });
        return Promise.resolve({ data: stream });
      })
      .mockResolvedValueOnce({
        data: { response: 'Квазар — это активное ядро галактики.' }
      });

    const chunks: Array<{ chunk: string; done: boolean; toolSource?: any }> = [];
    const abortController = new AbortController();

    await executeOllamaRequest(mockProvider, 'Что такое квазар?', [], abortController, (chunk, done, _isSearching, toolSource) => {
      chunks.push({ chunk, done, toolSource });
    });

    expect(mockSpeakAndWait).toHaveBeenCalledWith('Ищу в Википедии.', 5000);
    expect(mockExecuteTool).toHaveBeenCalledWith('wikipedia', { query: 'Квазар' });
    const finalCall = chunks.find(c => c.done);
    expect(finalCall?.chunk).toContain('Квазар — это активное ядро галактики.');
    expect(finalCall?.toolSource).toEqual({ tool: 'wikipedia', count: 1 });
  });

  it('falls back to stream: false when streaming request returns 400 Bad Request', async () => {
    const err400: any = new Error('Request failed with status code 400');
    err400.response = { status: 400 };

    (axios.post as any)
      .mockRejectedValueOnce(err400)
      .mockResolvedValueOnce({
        data: { response: 'Ответ через fallback без стриминга.' }
      });

    const chunks: Array<{ chunk: string; done: boolean }> = [];
    const abortController = new AbortController();

    await executeOllamaRequest(mockProvider, 'Тест фолбэка', [], abortController, (chunk, done) => {
      chunks.push({ chunk, done });
    });

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(chunks[chunks.length - 1]).toEqual({
      chunk: 'Ответ через fallback без стриминга.',
      done: true
    });
  });
});
