import axios from 'axios';
import { BuiltInLlmService } from '../built-in-llm.service';
import { providerManager } from './providers/provider-manager';
import { providerHealthManager } from './providers/provider-health';
import { memoryManager } from '../memory/memory-manager';
import { ToolDispatcher } from '../tools/tool-dispatcher';
import { getToolsPrompt } from './tools-utils';
import { buildAssistantSystemPrompt, sanitizeBuiltinModelName } from './prompt-builder';
import type { AiProvider } from './providers/provider.interface';
import {
  type TokenDiffResult,
  type PrefillTelemetryStats,
  type OllamaPrefillEnvelope,
  stripWakeWordForPrefill,
  extractStableSpeechPrefix,
  computeTokenDiff,
  tokenizeWordsApprox
} from './kv-prefill.utils';

export {
  type TokenDiffResult,
  type PrefillTelemetryStats,
  type OllamaPrefillEnvelope,
  stripWakeWordForPrefill,
  extractStableSpeechPrefix,
  computeTokenDiff,
  tokenizeWordsApprox
};

export interface PrefillPartialArgs {
  partialText: string;
  context?: any[];
  settings?: any;
  utteranceId?: string;
  forceComplete?: boolean;
}

export class KvPrefillService {
  private static instance: KvPrefillService | null = null;

  private activeUtteranceId: string | null = null;
  private lastRawPartialText = '';
  private lastStablePrefix = '';
  private prefilledTokens: number[] = [];
  private ollamaEnvelope: OllamaPrefillEnvelope | null = null;
  private ollamaAbortController: AbortController | null = null;
  private inFlightPromise: Promise<PrefillTelemetryStats> | null = null;
  private queuedPartialArgs: PrefillPartialArgs | null = null;

  private stats: PrefillTelemetryStats = {
    utteranceId: null,
    backend: 'none',
    modelName: '',
    prefilledText: '',
    prefilledTokenCount: 0,
    lastDeltaTokens: 0,
    lastRollbackTokens: 0,
    totalPrefillCalls: 0,
    totalSavedTokensOnFinal: 0,
    lastPrefillLatencyMs: 0,
    updatedAt: 0
  };

  public static getInstance(): KvPrefillService {
    if (!KvPrefillService.instance) {
      KvPrefillService.instance = new KvPrefillService();
    }
    return KvPrefillService.instance;
  }

  public getStats(): PrefillTelemetryStats {
    return { ...this.stats };
  }

  public resolveTargetBackend(settings?: any): {
    backend: 'builtin' | 'ollama' | 'none';
    modelName: string;
    ollamaProvider?: AiProvider;
  } {
    if (settings?.useLocalLLM && settings?.localLLMModel === 'builtin' && settings?.localLLMPriority === 'primary') {
      return { backend: 'builtin', modelName: sanitizeBuiltinModelName(settings?.builtinLLMModel) };
    }

    const activeProviders = providerManager.getActiveProviders(settings);
    const now = Date.now();
    for (const p of activeProviders) {
      if (providerHealthManager.getHealth(p.id).inCooldownUntil > now || providerHealthManager.isQuarantined(p.id)) {
        continue;
      }
      if (p.id === 'temp_builtin_llm') {
        return { backend: 'builtin', modelName: p.model || sanitizeBuiltinModelName(settings?.builtinLLMModel) };
      }
      if (p.type === 'local' && (p.id.includes('ollama') || p.name.toLowerCase().includes('ollama') || p.endpoint.includes('11434'))) {
        return { backend: 'ollama', modelName: p.model, ollamaProvider: p };
      }
      break;
    }

    if (settings?.useLocalLLM && settings?.localLLMModel && settings.localLLMModel !== 'builtin') {
      const tempOllama: AiProvider = {
        id: 'temp_local_ollama',
        name: 'Local Ollama',
        type: 'local',
        endpoint: 'http://127.0.0.1:11434/api/generate',
        model: settings.localLLMModel,
        priority: 0,
        maxTokens: 2048,
        temperature: 0.5,
        enabled: true
      };
      return { backend: 'ollama', modelName: tempOllama.model, ollamaProvider: tempOllama };
    }

    if (settings?.useLocalLLM !== false) {
      return { backend: 'builtin', modelName: sanitizeBuiltinModelName(settings?.builtinLLMModel) };
    }

    return { backend: 'none', modelName: '' };
  }

  public async prefillPartial(params: PrefillPartialArgs): Promise<PrefillTelemetryStats> {
    const cleaned = stripWakeWordForPrefill(params.partialText || '');
    if (!cleaned || cleaned.length < 2) return this.getStats();

    if (this.inFlightPromise) {
      this.queuedPartialArgs = { ...params, context: params.context || [] };
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.executePrefillStep({
      ...params,
      context: params.context || []
    }).finally(async () => {
      this.inFlightPromise = null;
      if (this.queuedPartialArgs) {
        const nextArgs = this.queuedPartialArgs;
        this.queuedPartialArgs = null;
        await this.prefillPartial(nextArgs);
      }
    });

    return this.inFlightPromise;
  }

  private async executePrefillStep(params: Required<Pick<PrefillPartialArgs, 'partialText' | 'context'>> & PrefillPartialArgs): Promise<PrefillTelemetryStats> {
    const startTime = Date.now();
    const utteranceId = params.utteranceId || this.activeUtteranceId || `utt_${startTime}`;

    if (this.activeUtteranceId && this.activeUtteranceId !== utteranceId) {
      this.lastRawPartialText = '';
      this.lastStablePrefix = '';
      this.prefilledTokens = [];
      this.ollamaEnvelope = null;
    }
    this.activeUtteranceId = utteranceId;

    const hasTrailingSpace = /\s$/.test(params.partialText);
    const cleaned = stripWakeWordForPrefill(params.partialText);
    const stablePrefix = extractStableSpeechPrefix(
      hasTrailingSpace && cleaned ? `${cleaned} ` : cleaned,
      this.lastRawPartialText,
      Boolean(params.forceComplete)
    );
    this.lastRawPartialText = cleaned;

    if (!stablePrefix || stablePrefix.length < 2) return this.getStats();
    if (stablePrefix === this.lastStablePrefix && this.stats.prefilledTokenCount > 0) return this.getStats();

    const target = this.resolveTargetBackend(params.settings);
    if (target.backend === 'none') return this.getStats();

    if (target.backend === 'builtin') {
      const builtinResult = await BuiltInLlmService.getInstance().prefillPartial(
        stablePrefix,
        params.context,
        target.modelName,
        params.settings
      );
      if (builtinResult.evaluated) {
        this.lastStablePrefix = stablePrefix;
        this.prefilledTokens = builtinResult.userTokens;
        this.stats = {
          utteranceId,
          backend: 'builtin',
          modelName: target.modelName,
          prefilledText: stablePrefix,
          prefilledTokenCount: builtinResult.userTokens.length,
          lastDeltaTokens: builtinResult.deltaTokens,
          lastRollbackTokens: builtinResult.rollbackTokens,
          totalPrefillCalls: this.stats.totalPrefillCalls + 1,
          totalSavedTokensOnFinal: this.stats.totalSavedTokensOnFinal,
          lastPrefillLatencyMs: Date.now() - startTime,
          updatedAt: Date.now()
        };
      }
      return this.getStats();
    }

    if (target.backend === 'ollama' && target.ollamaProvider) {
      await this.executeOllamaPrefill(utteranceId, stablePrefix, params.context, target.ollamaProvider, params.settings, startTime);
    }

    return this.getStats();
  }

  private async executeOllamaPrefill(
    utteranceId: string,
    stablePrefix: string,
    context: any[],
    provider: AiProvider,
    settings: any,
    startTime: number
  ): Promise<void> {
    let systemPrompt = this.ollamaEnvelope?.systemPrompt || '';
    let basePromptPrefix = this.ollamaEnvelope?.basePromptPrefix || '';

    if (!this.ollamaEnvelope || this.ollamaEnvelope.utteranceId !== utteranceId) {
      const memoryContext =
        typeof memoryManager?.enrichContext === 'function'
          ? await memoryManager.enrichContext(stablePrefix)
          : { relevantFacts: [], userPreferences: [] };
      const toolsPrompt =
        typeof ToolDispatcher?.getInstance === 'function'
          ? getToolsPrompt(ToolDispatcher.getInstance().getToolDefinitions())
          : '';
      let memoryPrompt = '';
      if (memoryContext.relevantFacts.length > 0 || memoryContext.userPreferences.length > 0) {
        memoryPrompt =
          '\n\n[Память пользователя]\n' +
          memoryContext.relevantFacts.map((f: any) => `- ${f.value}`).join('\n') +
          '\n' +
          memoryContext.userPreferences.map((p: any) => `- ${p.value}`).join('\n');
      }
      systemPrompt = buildAssistantSystemPrompt({ customSystemPrompt: settings?.systemPrompt, memoryPrompt, toolsPrompt });
      basePromptPrefix = `${systemPrompt}\n\n`;
      const dialogHistory = (context || []).filter(
        (c) => c && (c.role === 'user' || c.role === 'assistant') && typeof c.content === 'string' && c.content.trim().length > 0
      );
      for (const m of dialogHistory) {
        basePromptPrefix += `${m.role === 'user' ? 'Пользователь' : 'A.R.C.'}: ${m.content}\n`;
      }
    }

    const endpointUrl = (provider.endpoint || 'http://127.0.0.1:11434/api/generate').replace('localhost:11434', '127.0.0.1:11434');
    const prevPseudoTokens = tokenizeWordsApprox(this.lastStablePrefix);
    const nextPseudoTokens = tokenizeWordsApprox(stablePrefix);
    const diff = computeTokenDiff(prevPseudoTokens, nextPseudoTokens);

    if (this.ollamaAbortController) {
      try { this.ollamaAbortController.abort(); } catch {}
    }
    const abortController = new AbortController();
    this.ollamaAbortController = abortController;

    try {
      const response = await axios.post(
        endpointUrl,
        {
          model: provider.model,
          prompt: `${basePromptPrefix}Пользователь: ${stablePrefix}`,
          system: systemPrompt,
          stream: false,
          options: { num_predict: 0, temperature: provider.temperature }
        },
        { signal: abortController.signal, timeout: 8000 }
      );

      this.lastStablePrefix = stablePrefix;
      this.prefilledTokens = nextPseudoTokens;
      this.ollamaEnvelope = {
        utteranceId,
        model: provider.model,
        endpointUrl,
        systemPrompt,
        basePromptPrefix,
        prefilledText: stablePrefix,
        prefilledTokensEstimate: nextPseudoTokens.length,
        ollamaContext: Array.isArray(response?.data?.context) ? response.data.context : undefined,
        updatedAt: Date.now()
      };

      this.stats = {
        utteranceId,
        backend: 'ollama',
        modelName: provider.model,
        prefilledText: stablePrefix,
        prefilledTokenCount: nextPseudoTokens.length,
        lastDeltaTokens: diff.deltaTokens.length,
        lastRollbackTokens: diff.rollbackTokenCount,
        totalPrefillCalls: this.stats.totalPrefillCalls + 1,
        totalSavedTokensOnFinal: this.stats.totalSavedTokensOnFinal,
        lastPrefillLatencyMs: Date.now() - startTime,
        updatedAt: Date.now()
      };
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        console.debug(`[KV-Prefill] Ollama prefill skipped: ${err?.message || err}`);
      }
    } finally {
      if (this.ollamaAbortController === abortController) {
        this.ollamaAbortController = null;
      }
    }
  }

  public async prepareForFinalGeneration(finalText: string): Promise<{
    hadPrefill: boolean;
    savedTokens: number;
    prefilledText: string;
    backend: 'builtin' | 'ollama' | 'none';
  }> {
    this.queuedPartialArgs = null;
    if (this.inFlightPromise) {
      try { await this.inFlightPromise; } catch {}
    }

    const cleanFinal = stripWakeWordForPrefill(finalText);
    if (!this.lastStablePrefix || !cleanFinal) {
      return { hadPrefill: false, savedTokens: 0, prefilledText: '', backend: 'none' };
    }

    const savedTokens = this.stats.prefilledTokenCount;
    const prefilledText = this.lastStablePrefix;
    const backend = this.stats.backend;
    if (savedTokens > 0) this.stats.totalSavedTokensOnFinal += savedTokens;

    this.lastRawPartialText = '';
    this.lastStablePrefix = '';
    this.prefilledTokens = [];
    this.activeUtteranceId = null;

    return { hadPrefill: savedTokens > 0, savedTokens, prefilledText, backend };
  }

  public consumeOllamaPrefillEnvelope(finalText: string, modelName: string): OllamaPrefillEnvelope | null {
    const env = this.ollamaEnvelope;
    this.ollamaEnvelope = null;
    if (!env || env.model !== modelName || Date.now() - env.updatedAt > 30000) return null;
    const cleanFinal = stripWakeWordForPrefill(finalText).toLowerCase();
    const firstWord = env.prefilledText.toLowerCase().split(/\s+/)[0] || '';
    return firstWord && cleanFinal.startsWith(firstWord) ? env : null;
  }

  public async cancelPrefill(reason: string = 'cancelled'): Promise<void> {
    this.queuedPartialArgs = null;
    if (this.ollamaAbortController) {
      try { this.ollamaAbortController.abort(); } catch {}
      this.ollamaAbortController = null;
    }
    this.ollamaEnvelope = null;
    this.lastRawPartialText = '';
    this.lastStablePrefix = '';
    this.prefilledTokens = [];
    this.activeUtteranceId = null;

    await BuiltInLlmService.getInstance().cancelPrefill(reason);

    this.stats = {
      ...this.stats,
      utteranceId: null,
      prefilledText: '',
      prefilledTokenCount: 0,
      lastDeltaTokens: 0,
      lastRollbackTokens: 0,
      updatedAt: Date.now()
    };
  }
}

export const kvPrefillService = KvPrefillService.getInstance();
