import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  stripWakeWordForPrefill,
  extractStableSpeechPrefix,
  computeTokenDiff,
} from '../llm/kv-prefill.utils';
import { KvPrefillService } from '../llm/kv-prefill.service';
import { BuiltInLlmService } from '../built-in-llm.service';

vi.mock('axios');
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/arc-test'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}));

describe('Dynamic KV-Cache Prefill Pipeline', () => {
  describe('kv-prefill.utils', () => {
    it('strips leading wake-words and extracts command remainder', () => {
      const first = stripWakeWordForPrefill('Арк, расскажи подробно про квантовые вычисления');
      expect(first).toBe('расскажи подробно про квантовые вычисления');

      const second = stripWakeWordForPrefill('A.R.C. какая погода сегодня');
      expect(second).toBe('какая погода сегодня');

      const bare = stripWakeWordForPrefill('Арк');
      expect(bare).toBe('');
    });

    it('holds back incomplete trailing word until space, punctuation, or stabilization across partials', () => {
      // Single incomplete word is held back initially
      const step1 = extractStableSpeechPrefix('расскаж', '');
      expect(step1).toBe('');

      // Multi-word without trailing space holds back the last word so BPE tokens do not churn
      const step2 = extractStableSpeechPrefix('расскажи подробно про квант', 'расскаж');
      expect(step2).toBe('расскажи подробно про');

      // If the same multi-word partial repeats on the next tick (user paused), it becomes stable
      const step3 = extractStableSpeechPrefix(
        'расскажи подробно про квантовые',
        'расскажи подробно про квантовые'
      );
      expect(step3).toBe('расскажи подробно про квантовые');

      // Punctuation at the end commits the entire phrase immediately
      const step4 = extractStableSpeechPrefix('расскажи подробно про квантовые вычисления?', '');
      expect(step4).toBe('расскажи подробно про квантовые вычисления?');
    });

    it('computes token diff for pure append vs tail revision rollback', () => {
      const prev = [10, 20, 30, 40];
      const appended = [10, 20, 30, 40, 50, 60];
      const diffAppend = computeTokenDiff(prev, appended);
      expect(diffAppend.isPureExtension).toBe(true);
      expect(diffAppend.commonPrefixLength).toBe(4);
      expect(diffAppend.rollbackTokenCount).toBe(0);
      expect(diffAppend.deltaTokens).toEqual([50, 60]);

      // STT revised last two tokens (30, 40 -> 35, 45, 55)
      const revised = [10, 20, 35, 45, 55];
      const diffRevised = computeTokenDiff(prev, revised);
      expect(diffRevised.isPureExtension).toBe(false);
      expect(diffRevised.commonPrefixLength).toBe(2);
      expect(diffRevised.rollbackTokenCount).toBe(2);
      expect(diffRevised.deltaTokens).toEqual([35, 45, 55]);
    });
  });

  describe('BuiltInLlmService incremental KV-cache prefill & tail rollback', () => {
    let builtin: BuiltInLlmService;
    let mockContextTokens: number[];
    let mockEraseRanges: any;
    let mockPreloadPrompt: any;
    let mockPrompt: any;
    let mockSetChatHistory: any;
    let mockChatHistory: any[];

    beforeEach(() => {
      builtin = BuiltInLlmService.getInstance();
      mockContextTokens = [1, 2, 3]; // base system prompt tokens
      mockChatHistory = [{ type: 'system', text: 'Ты ИИ-ассистент A.R.C.' }];

      mockEraseRanges = vi.fn((ranges: Array<{ start: number; end: number }>) => {
        for (const r of ranges) {
          mockContextTokens.splice(r.start, r.end - r.start);
        }
        return Promise.resolve();
      });

      const tokenizeSimple = (text: string): number[] =>
        text
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => {
            let h = 100;
            for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) % 100000;
            return h;
          });

      mockPreloadPrompt = vi.fn(async (promptText: string) => {
        const promptTokens = tokenizeSimple(promptText);
        const baseLen = 3; // system tokens [1, 2, 3]
        const target = [1, 2, 3, ...promptTokens];
        let common = 0;
        while (
          common < mockContextTokens.length &&
          common < target.length &&
          mockContextTokens[common] === target[common]
        ) {
          common++;
        }
        if (common < mockContextTokens.length) {
          await mockEraseRanges([{ start: common, end: mockContextTokens.length }]);
        }
        for (let i = Math.max(baseLen, common); i < target.length; i++) {
          mockContextTokens.push(target[i]);
        }
      });

      mockPrompt = vi.fn(async (finalPrompt: string, opts: any) => {
        const promptTokens = tokenizeSimple(finalPrompt);
        mockContextTokens = [1, 2, 3, ...promptTokens, 999];
        if (opts?.onTextChunk) {
          await opts.onTextChunk('Готовый мгновенный ответ.');
        }
        return 'Готовый мгновенный ответ.';
      });

      mockSetChatHistory = vi.fn((nextHistory: any[]) => {
        mockChatHistory = [...nextHistory];
      });

      const mockSequence = {
        get contextTokens() {
          return mockContextTokens;
        },
        get nextTokenIndex() {
          return mockContextTokens.length;
        },
        eraseContextTokenRanges: mockEraseRanges,
      };

      (builtin as any).isLoaded = true;
      (builtin as any).isGenerating = false;
      (builtin as any).model = {
        tokenize: (text: string) => tokenizeSimple(text),
      };
      (builtin as any).currentModelName = 'Qwen2.5-3B-Instruct-Q4_K_M.gguf';
      (builtin as any).isModelDownloaded = vi.fn().mockResolvedValue(true);
      (builtin as any).context = {
        getSequence: () => mockSequence,
      };
      (builtin as any).session = {
        preloadPrompt: mockPreloadPrompt,
        prompt: mockPrompt,
        getChatHistory: () => mockChatHistory,
        setChatHistory: mockSetChatHistory,
        sequence: mockSequence,
        _canUseContextWindowForCompletion: false,
      };
      (builtin as any).lastSyncedHistorySignature = '';
      (builtin as any).prefillActive = false;
      (builtin as any).prefillUserTokens = [];
      (builtin as any).prefillUserStartTokenIndex = -1;
      (builtin as any).prefillBaseHistoryTokenIndex = 0;
    });

    it('incrementally prefills growing chunks, rolls back revised tail tokens, and reuses KV-cache on final generate without resetting history', async () => {
      const dialogContext = [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Здравствуйте, сэр.' }];
      const settings = { useLocalLLM: true, localLLMModel: 'builtin', localLLMPriority: 'primary' };

      // Chunk 1: 3 stable words
      const r1 = await builtin.prefillPartial(
        'расскажи подробно про',
        dialogContext,
        'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        settings
      );
      expect(r1.evaluated).toBe(true);
      expect(r1.deltaTokens).toBe(3);
      expect(r1.rollbackTokens).toBe(0);
      expect(mockSetChatHistory).toHaveBeenCalledTimes(1);
      expect((builtin as any).session._canUseContextWindowForCompletion).toBe(true);

      // Chunk 2: pure extension (+2 words) -> no history reset, no rollback, only +2 tokens evaluated
      const r2 = await builtin.prefillPartial(
        'расскажи подробно про квантовые компьютеры',
        dialogContext,
        'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        settings
      );
      expect(r2.evaluated).toBe(true);
      expect(r2.deltaTokens).toBe(2);
      expect(r2.rollbackTokens).toBe(0);
      expect(mockSetChatHistory).toHaveBeenCalledTimes(1); // Not called again!

      // Chunk 3: STT revises the last word ("компьютеры" -> "алгоритмы и кубиты")
      const r3 = await builtin.prefillPartial(
        'расскажи подробно про квантовые алгоритмы и кубиты',
        dialogContext,
        'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        settings
      );
      expect(r3.evaluated).toBe(true);
      expect(r3.rollbackTokens).toBe(1); // Only the 1 changed tail token rolled back
      expect(r3.deltaTokens).toBe(3); // "алгоритмы", "и", "кубиты"
      expect(mockEraseRanges).toHaveBeenCalled();

      // Final generation: when user finishes speaking, generate() must NOT call setChatHistory again!
      const finalContextWithUserMsg = [
        ...dialogContext,
        { role: 'user', content: 'расскажи подробно про квантовые алгоритмы и кубиты сейчас' },
      ];
      const chunks: string[] = [];
      await builtin.generate(
        'расскажи подробно про квантовые алгоритмы и кубиты сейчас',
        finalContextWithUserMsg,
        'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        settings,
        (chunk) => {
          if (chunk) chunks.push(chunk);
        }
      );

      expect(mockSetChatHistory).toHaveBeenCalledTimes(1); // Still 1! KV-cache preserved!
      expect(chunks.join('')).toContain('Готовый мгновенный ответ.');
    });

    it('rolls back uncommitted user prefill tokens when cancelPrefill is called', async () => {
      const dialogContext = [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'На связи.' }];
      await builtin.prefillPartial(
        'открой пожалуйста большой отчёт',
        dialogContext,
        'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        {}
      );
      expect(mockContextTokens.length).toBe(3 + 4); // 3 base + 4 user tokens

      await builtin.cancelPrefill('local_command');
      // Context tokens must be rolled back to base history length (3)
      expect(mockContextTokens.length).toBe(3);
      expect(builtin.getPrefillState().active).toBe(false);
    });
  });

  describe('KvPrefillService orchestration (Built-in & Ollama)', () => {
    it('prefills local Ollama with options.num_predict=0 and reuses the locked prompt envelope on final generation', async () => {
      const mockedPost = vi.mocked(axios.post).mockResolvedValue({ data: { response: '', done: true } } as any);
      const service = new KvPrefillService();

      const settings = {
        useLocalLLM: true,
        localLLMModel: 'qwen2.5:7b',
        localLLMPriority: 'primary',
      };

      const res1 = await service.prefillPartial({
        partialText: 'Арк расскажи подробно про устройство термоядерного ',
        context: [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Слушаю вас.' }],
        settings,
        utteranceId: 'utt_ollama_1',
      });

      expect(res1.backend).toBe('ollama');
      expect(res1.prefilledTokenCount).toBe(5);
      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [calledUrl, calledBody] = mockedPost.mock.calls[0];
      expect(calledUrl).toContain('127.0.0.1:11434/api/generate');
      expect((calledBody as any).options.num_predict).toBe(0);
      expect((calledBody as any).prompt).toContain('Пользователь: расскажи подробно про устройство термоядерного');

      // Envelope is available for final generation on the same utterance & model
      const prep = await service.prepareForFinalGeneration(
        'расскажи подробно про устройство термоядерного реактора'
      );
      expect(prep.hadPrefill).toBe(true);
      expect(prep.backend).toBe('ollama');
      expect(prep.savedTokens).toBe(5);

      const env = service.consumeOllamaPrefillEnvelope(
        'расскажи подробно про устройство термоядерного реактора',
        'qwen2.5:7b'
      );
      expect(env).not.toBeNull();
      expect(env?.basePromptPrefix).toContain('Пользователь: Привет');
    });
  });
});
