import { executeRequestFallbackChain, getOrderedProviderModels } from "./request-executor";
import { broadcastToast } from "../../ipc/ai.ipc";
import { LocalClassifier } from '../local-classifier';
import { llmCacheService } from '../llm-cache.service';
import { memoryManager } from '../memory/memory-manager';
import { macroExecutor } from '../MacroExecutor';
import { BuiltInLlmService } from '../built-in-llm.service';
import { providerManager } from './providers/provider-manager';
import { executeOllamaRequest } from './providers/ollama.provider';
import { executeOpenAICompatibleRequest } from './providers/openai.provider';
import { AiProvider } from './providers/provider.interface';
import { providerHealthManager } from './providers/provider-health';
import { getAiIntentMacros, classifyIntentWithProvider, isSimpleQuery, isConversationalQuery } from './intent-classifier';
import { sanitizeBuiltinModelName } from './prompt-builder';
import { sanitizeError, maskSecrets } from '../../../shared/utils/log-sanitizer';
import { resolveAutoWorkflow } from '../../../shared/utils/auto-workflow';
import { ToolDispatcher } from '../tools/tool-dispatcher';
import { ecoService } from '../eco.service';
import { secretVault } from '../security/secret-vault.service';
import { isFreeLlmGateway } from '../../../shared/utils/free-llm.util';
import { kvPrefillService } from './kv-prefill.service';

export class AiRouter {
  private currentAbortController: AbortController | null = null;
  private currentReject: ((err: Error) => void) | null = null;
  private lastSettings: any = null;
  private pendingMacroToExecute: any = null;
  private pendingMacroName: string = '';
  private intentCache = new Map<string, any>();
  public abortCurrentRequest() {
    void kvPrefillService.cancelPrefill('abort_request');
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    if (this.currentReject) {
      this.currentReject(new Error('Aborted by user barge-in'));
      this.currentReject = null;
    }
  }
  private resolveActiveModel(text: string, settings: any, activeProviders: AiProvider[]): string {
    if (settings?.useLocalLLM && settings?.localLLMModel === 'builtin' && settings?.localLLMPriority === 'primary') {
      return sanitizeBuiltinModelName(settings?.builtinLLMModel);
    }
    const now = Date.now();
    for (const provider of activeProviders) {
      if (providerHealthManager.getHealth(provider.id).inCooldownUntil > now) {
        continue;
      }
      if (provider.id === 'temp_builtin_llm') {
        return provider.model;
      }
      const ordered = getOrderedProviderModels(provider, text);
      return ordered[0] || provider.model || provider.name;
    }
    if (settings?.useLocalLLM !== false) {
      return sanitizeBuiltinModelName(settings?.builtinLLMModel);
    }
    return 'unknown';
  }

  public async request(
    text: string,
    context: any[],
    callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
    rejectFn?: (e: Error) => void,
    settings?: any,
    routeCallback?: (data: { modelName: string; target: 'local' | 'cloud'; cause: string; step?: 'CLASSIFIER' | 'ROUTER' | 'TOOL_API' | 'RESPONSE' | 'TTS' | null; latency?: number; isCache?: boolean; source?: string; provider?: string }) => void
  ) {
    this.lastSettings = settings;
    const reqStart = Date.now();
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    if (this.currentReject) {
      const oldReject = this.currentReject;
      this.currentReject = null;
      oldReject(new Error('Aborted by new request'));
    }
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    const workflow = resolveAutoWorkflow(
      text,
      settings?.composerMode || 'Auto',
      settings?.composerEffort || 'Auto',
      Number(settings?.attachmentCount || 0),
      settings?.activeModelKey || settings?.builtinLLMModel || settings?.localLLMModel,
      settings?.activeModelName,
      Boolean(settings?.useLocalLLM)
    );
    if (Array.isArray(context)) {
      const errorPatterns = /облачный сервис.*недоступен|локальная модель.*не установлена|связь с языковой моделью отсутствует|провайдер.*отклонил запрос|временно заблокированы в карантине|ни один нейросетевой провайдер не активен|ошибка выполнения директивы/i;
      for (let i = context.length - 1; i >= 0; i--) {
        const msg = context[i];
        if (msg?.role === 'assistant' && typeof msg.content === 'string' && errorPatterns.test(msg.content)) {
          context.splice(i, 1);
        }
      }
      context.unshift({ role: 'system', content: workflow.systemDirective });
    }
    if (routeCallback) {
      routeCallback({
        modelName: 'Локальный классификатор',
        target: 'local',
        cause: workflow.routeCause,
        step: 'CLASSIFIER',
        latency: Date.now() - reqStart
      });
    }
    const originalCallback = callback;
    let doneSent = false;
    const wrappedCallback = (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => {
      if (doneSent && done && !chunk) return;
      if (done) doneSent = true;
      originalCallback(chunk, done, isSearching, toolSource);
      if (done) {
        this.currentAbortController = null;
        this.currentReject = null;
      }
    };
    callback = wrappedCallback;
    const wrappedReject = (err: Error) => {
      if (this.currentReject === wrappedReject) {
        this.currentReject = null;
        this.currentAbortController = null;
      }
      if (rejectFn) {
        rejectFn(err);
      }
    };
    this.currentReject = wrappedReject;
    // Check if there is a pending macro to execute based on user confirmation
    if (this.pendingMacroToExecute) {
      const cleanText = text.trim().toLowerCase();
      const isAffirmation = /^(да|давай|запускай|конечно|хочу|ок|хорошо|подтверждаю|yes|go|ok)( |,|\.|\!|$)/i.test(cleanText);
      const isNegation = /^(нет|не надо|отмена|не запускай|не хочу|no|stop|cancel)( |,|\.|\!|$)/i.test(cleanText);
      if (isAffirmation) {
        void kvPrefillService.cancelPrefill('macro_affirmation');
        const macro = this.pendingMacroToExecute;
        const name = this.pendingMacroName;
        this.pendingMacroToExecute = null;
        this.pendingMacroName = '';
        macroExecutor.execute(macro).catch(e => console.error(`[AI-Service] Macro execution error: ${sanitizeError(e)}`));
        if (routeCallback) {
          routeCallback({
            modelName: 'Локальный триггер',
            target: 'local',
            cause: 'Подтверждение исполнения сценария макроса'
          });
        }
        callback(`Конечно. Запускаю сценарий "${name}".`, true);
        return;
      } else if (isNegation) {
        void kvPrefillService.cancelPrefill('macro_negation');
        this.pendingMacroToExecute = null;
        this.pendingMacroName = '';
        if (routeCallback) {
          routeCallback({
            modelName: 'Локальный триггер',
            target: 'local',
            cause: 'Отмена запуска сценария макроса'
          });
        }
        callback(`Понял вас. Отменяю запуск сценария. Чем ещё я могу помочь вам?`, true);
        return;
      } else {
        // Any other response clears the pending macro to avoid getting stuck
        this.pendingMacroToExecute = null;
        this.pendingMacroName = '';
      }
    }
    // 1. Local Classification (Simple Commands)
    const localCmd = await LocalClassifier.classify(text, settings);
    if (localCmd) {
      void kvPrefillService.cancelPrefill('local_command');
      if (routeCallback) {
        routeCallback({
          modelName: 'Локальный классификатор',
          target: 'local',
          cause: 'Прямое совпадение локального классификатора команд',
          step: 'TOOL_API',
          latency: Date.now() - reqStart
        });
      }
      callback(localCmd, true);
      return;
    }

    // 1.5. Weather Pre-routing (ToolDispatcher)
    const toolDispatcher = ToolDispatcher.getInstance();
    const extractedCity = await toolDispatcher.getPreRoutedWeatherLocation(text, settings);
    
    if (extractedCity) {
      if (routeCallback) {
        routeCallback({
          modelName: 'Open-Meteo Weather API',
          target: 'local',
          cause: 'Предварительная маршрутизация прогноза погоды',
          step: 'TOOL_API',
          latency: Date.now() - reqStart
        });
      }
      
      const toolRes = await toolDispatcher.executeTool('get_weather', { location: extractedCity });
      console.log(`[ToolDispatcher] get_weather result success: ${toolRes.success}`);
      
      if (toolRes.success && toolRes.data) {
        const toolCallId = `call_weather_${Date.now()}`;
        const summary = (toolRes.data as any)?.summary || '';
        context.push({
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: { name: 'get_weather', arguments: JSON.stringify({ location: extractedCity }) }
          }]
        });
        context.push({
          role: 'tool',
          tool_call_id: toolCallId,
          name: 'get_weather',
          content: JSON.stringify(toolRes.data)
        });
        context.push({
          role: 'system',
          content: `ИНСТРУКЦИЯ ПО ПОГОДЕ: Актуальный прогноз погоды для "${extractedCity}" уже успешно получен: ${summary || JSON.stringify(toolRes.data)}. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО повторно вызывать инструмент get_weather или web_search. Ответь пользователю сразу естественным языком, используя эти готовые данные.`
        });
      } else {
        // Fallback info if tool fails
        context.push({
          role: 'system',
          content: `Система: Не удалось получить погоду для ${extractedCity}. Причина: ${toolRes.error || 'неизвестна'}`
        });
      }
    }
    let skipCache = !!settings?.skipCache;
    if (text.startsWith('/nc ') || text.startsWith('!nc ')) {
      skipCache = true;
      text = text.replace(/^(\/nc|!nc)\s+/i, '');
    }

    // 3. Select Active Providers (support exclusive mode & bypass quarantined providers)
    const allProviders = providerManager.getProviders();
    const exclusiveProvider = allProviders.find(p => p.enabled && p.isExclusive);

    let activeProviders: AiProvider[] = [];

    if (exclusiveProvider) {
      console.info(`[Router] Exclusive mode ACTIVE. Targeting ONLY ${exclusiveProvider.name}`);
      if (providerHealthManager.isQuarantined(exclusiveProvider.id)) {
        const health = providerHealthManager.getHealth(exclusiveProvider.id);
        const minsLeft = Math.max(1, Math.ceil((health.inQuarantineUntil - Date.now()) / 60000));
        console.warn(`[Router] Skipping ${exclusiveProvider.name} (reason: quarantined, released in ${minsLeft}m)`);
        if (routeCallback) {
          routeCallback({
            modelName: exclusiveProvider.name,
            target: exclusiveProvider.type,
            cause: `Карантин (${minsLeft}м)`,
            step: 'ROUTER',
            latency: Date.now() - reqStart
          });
        }
        callback(`Провайдер ${exclusiveProvider.name} в карантине (ещё ${minsLeft} мин). Включён эксклюзивный режим — переключение на другие шлюзы заблокировано. Нажмите «Сбросить карантин» в настройках.`, true);
        return;
      }
      activeProviders = [exclusiveProvider];
    } else {
      const activeCandidates = providerManager.getActiveProviders(settings);
      for (const p of activeCandidates) {
        if (providerHealthManager.isQuarantined(p.id)) {
          const health = providerHealthManager.getHealth(p.id);
          const minsLeft = Math.max(1, Math.ceil((health.inQuarantineUntil - Date.now()) / 60000));
          console.log(`[Router] Skipping ${p.name} (reason: quarantined, released in ${minsLeft}m)`);
        } else {
          activeProviders.push(p);
        }
      }
    }
    
    // Add Ollama default provider if useLocalLLM is true and localLLMModel is not builtin and not in exclusive mode
    if (!exclusiveProvider && settings?.useLocalLLM && settings?.localLLMModel && settings?.localLLMModel !== 'builtin') {
      const ollamaProvider = activeProviders.find(p => p.type === 'local' && (p.id.includes('ollama') || p.name.toLowerCase().includes('ollama')));
      if (!ollamaProvider) {
         activeProviders.push({
          id: 'temp_local_ollama',
          name: 'Local Ollama',
          type: 'local',
          endpoint: 'http://127.0.0.1:11434/api/generate',
          model: settings.localLLMModel,
          priority: 0,
          maxTokens: 2048,
          temperature: 0.5,
          enabled: true
         });
      }
    }

    if (!exclusiveProvider && settings?.useLocalLLM && settings?.forcedOfflineMode) {
      activeProviders = activeProviders.filter(p => p.type === 'local');
    }

    // Блок 3 (P2): Фоновый эко-режим (Cloud-only mode для сохранения ресурсов GPU/CPU)
    const isBackgroundEco = ecoService.getState() === 'hidden';
    const shouldForceCloud = settings?.cloudLlmInBackgroundEco ?? settings?.cloudLlmInGameMode ?? true;
    const isZeroGpuGateway = (p: AiProvider) =>
      p.type === 'cloud' || isFreeLlmGateway(p);
    
    if (!exclusiveProvider && isBackgroundEco && shouldForceCloud) {
      const cloudProviders = activeProviders.filter(isZeroGpuGateway);
      if (cloudProviders.length > 0) {
        console.log('[AiRouter] Background Eco Mode is active & Cloud-only setting is ON: forcing Cloud/Gateway LLM to conserve GPU/CPU.');
        activeProviders = cloudProviders;
      } else {
        console.warn('[AiRouter] Background Eco Mode is active, but no Cloud LLM is available. Using local fallback.');
      }
    }

    const requestedModelKey = String(settings?.activeModelKey || '').trim().toLowerCase();
    const requestedModelName = String(settings?.activeModelName || '').trim().toLowerCase();

    // Sort active providers: first by explicit composer selection, then health, then resolved keys, then priority
    activeProviders.sort((a, b) => {
       if (requestedModelKey || (requestedModelName && requestedModelName !== 'auto')) {
           const aMatches =
             (requestedModelKey && (a.model?.toLowerCase() === requestedModelKey || a.selectedModels?.some(m => m.toLowerCase() === requestedModelKey))) ||
             (requestedModelName && requestedModelName.includes(a.name.toLowerCase()));
           const bMatches =
             (requestedModelKey && (b.model?.toLowerCase() === requestedModelKey || b.selectedModels?.some(m => m.toLowerCase() === requestedModelKey))) ||
             (requestedModelName && requestedModelName.includes(b.name.toLowerCase()));
           if (Boolean(aMatches) !== Boolean(bMatches)) {
               return aMatches ? -1 : 1;
           }
       }

       const healthA = providerHealthManager.getHealth(a.id);
       const healthB = providerHealthManager.getHealth(b.id);
       if (healthA.healthy !== healthB.healthy) {
           return healthA.healthy ? -1 : 1; // healthy first
       }

       const aUnresolvedCloud = a.type === 'cloud' && !a.noAuthHeader && (!a.hasApiKey && secretVault.resolveProviderApiKey(a.id, a.apiKey).status !== 'ok');
       const bUnresolvedCloud = b.type === 'cloud' && !b.noAuthHeader && (!b.hasApiKey && secretVault.resolveProviderApiKey(b.id, b.apiKey).status !== 'ok');
       if (aUnresolvedCloud !== bUnresolvedCloud) {
           return aUnresolvedCloud ? 1 : -1;
       }

       if (settings?.useLocalLLM && settings?.localLLMPriority === 'primary') {
           const isALocal = a.type === 'local';
           const isBLocal = b.type === 'local';
           if (isALocal !== isBLocal) {
               return isALocal ? -1 : 1; // local first
           }
       }

       return (a.priority || 0) - (b.priority || 0);
    });

    if (activeProviders.length === 0 && (!settings?.useLocalLLM || settings?.localLLMModel !== 'builtin')) {
      const quarantined = allProviders.filter(p => p.enabled && providerHealthManager.isQuarantined(p.id));
      if (quarantined.length > 0) {
        const info = quarantined.map(p => {
          const h = providerHealthManager.getHealth(p.id);
          const m = Math.max(1, Math.ceil((h.inQuarantineUntil - Date.now()) / 60000));
          return `${p.name} (${m} мин)`;
        }).join(', ');
        if (routeCallback) routeCallback({ modelName: 'Карантин', target: 'local', cause: `В карантине: ${info}` });
        callback(`Все доступные провайдеры временно заблокированы в карантине: ${info}. Сбросьте карантин в настройках.`, true);
        return;
      }
      if (routeCallback) routeCallback({ modelName: 'Система', target: 'local', cause: 'Нет активных провайдеров' });
      callback('в данный момент ни один нейросетевой провайдер не активен.', true);
      return;
    }

    // 3.2 Deterministic Smart Cache Check (First Turn Only)
    const isFirstTurn = Array.isArray(context) && (
      context.length === 0 ||
      (context.length === 1 && context[0]?.role === 'user')
    );
    const isTimeQuery = /(?:какое|сколько|который|подскажи|скажи)\s+(?:сейчас\s+)?(?:врем[яени]|час|число|дат[ауы])|сегодня\s+(?:число|дата|день)/i.test(text);
    const cacheable = settings?.smartCacheEnabled === true && isFirstTurn && !skipCache && !isTimeQuery;
    const sysPrompt = String(settings?.systemPrompt ?? settings?.customSystemPrompt ?? '');
    const activeModel = this.resolveActiveModel(text, settings, activeProviders);

    if (cacheable) {
      const hit = llmCacheService.get(text, activeModel, sysPrompt);
      if (hit) {
        void kvPrefillService.cancelPrefill('cache_hit');
        if (routeCallback) {
          routeCallback({
            modelName: hit.provider,
            target: 'local',
            cause: 'Точный кэш',
            step: 'RESPONSE',
            latency: 0,
            isCache: true,
            source: 'cache',
            provider: hit.provider
          });
        }
        callback(hit.response, true);
        return;
      }
    }

    // AI Intent validation check
    const aiIntentMacros = getAiIntentMacros();
    if (aiIntentMacros.length > 0 && !isConversationalQuery(text) && activeProviders.length > 0) {
      const bestProvider = activeProviders[0];
      try {
        let matchResult = null;
        if (this.intentCache.has(text)) {
          matchResult = this.intentCache.get(text);
        } else {
          const timeoutMs = (bestProvider.type === 'local' || bestProvider.model.toLowerCase().includes('builtin')) ? 15000 : 8000;
          matchResult = await classifyIntentWithProvider(bestProvider, text, aiIntentMacros, abortController, timeoutMs);
          this.intentCache.set(text, matchResult);
        }
        if (matchResult !== null && matchResult.index >= 0 && matchResult.index < aiIntentMacros.length) {
          const matchedItem = aiIntentMacros[matchResult.index];
          if (matchResult.mode === 'DIRECT') {
            macroExecutor.execute(matchedItem.macro).catch(e => console.error(`[AI-Routing] Intent macro error: ${sanitizeError(e)}`));
            callback(`Анализ намерений завершен. Запускаю сценарий "${matchedItem.macro.name || 'без названия'}".`, true);
            return;
          } else {
            this.pendingMacroToExecute = matchedItem.macro;
            this.pendingMacroName = matchedItem.macro.name || 'без названия';
            callback(`похоже, что вы хотите запустить "${this.pendingMacroName}". Разрешите запустить сценарий?`, true);
            return;
          }
        }
      } catch (e) {
        console.warn('AI Intent classification failed:', sanitizeError(e));
      }
    }


    const prefillState = await kvPrefillService.prepareForFinalGeneration(text);
    const prefillTag = prefillState.hadPrefill && prefillState.savedTokens > 0
      ? ` [KV-Prefill: +${prefillState.savedTokens}t]`
      : '';

    const runBuiltin = async (cause: string) => {
      const selectedBuiltinModel = sanitizeBuiltinModelName(settings?.builtinLLMModel);
      console.log(`[AI-Routing] Executing Built-in Local LLM: ${selectedBuiltinModel} (${cause}${prefillTag})`);
      if (routeCallback) routeCallback({ modelName: selectedBuiltinModel, target: 'local', cause: `${cause}${prefillTag}`, step: 'ROUTER', latency: Date.now() - reqStart });
      
      try {
        let fullResponse = '';
        let firstChunk = false;
        await BuiltInLlmService.getInstance().generate(text, context, selectedBuiltinModel, settings, (chunk, done) => {
          if (abortController.signal.aborted) return;
          fullResponse += chunk;
          const isMissingModelFallback = fullResponse.includes('недоступен') && fullResponse.includes('не установлена');
          if (!firstChunk && chunk) {
            firstChunk = true;
            if (routeCallback) {
              routeCallback(isMissingModelFallback
                ? ({ modelName: 'Система', target: 'local', cause: 'Нет связи (локальная модель не установлена)', step: 'RESPONSE', latency: Date.now() - reqStart, hasError: true } as any)
                : { modelName: selectedBuiltinModel, target: 'local', cause: `${cause}${prefillTag} (Исполнение)`, step: 'RESPONSE', latency: Date.now() - reqStart });
            }
          }
          if (done && routeCallback) {
            routeCallback(isMissingModelFallback
              ? ({ modelName: 'Система', target: 'local', cause: 'Нет связи (локальная модель не установлена)', step: 'TTS', latency: Date.now() - reqStart, hasError: true } as any)
              : { modelName: selectedBuiltinModel, target: 'local', cause: `${cause} (Исполнение)`, step: 'TTS', latency: Date.now() - reqStart });
          }
          if (done && fullResponse.trim() && !isMissingModelFallback) {
            if (cacheable && !abortController.signal.aborted) {
              llmCacheService.set(text, selectedBuiltinModel, sysPrompt, 'Встроенная LLM', fullResponse, Date.now() - reqStart);
            }
            memoryManager.processInteraction(text, fullResponse).catch(e => console.error(`[Memory] Process interaction error: ${sanitizeError(e)}`));
          }
          callback(chunk, done);
        });
        return true;
      } catch (err: any) {
        if (abortController.signal.aborted) return false;
        console.warn('[AI-Routing] Builtin LLM execution failed:', sanitizeError(err));
        if (routeCallback) routeCallback({ modelName: selectedBuiltinModel, target: 'local', cause: 'Builtin недоступен', step: 'ROUTER', latency: Date.now() - reqStart });
        return false;
      }
    };

    // 4. Try Providers sequentially
    let success = false;
    let lastFailureInfo: { name: string; status: number | string; reason: string } | null = null;
    
    // 3.5 Primary Built-in Local LLM
    if (settings?.useLocalLLM && settings?.localLLMModel === 'builtin' && settings?.localLLMPriority === 'primary') {
      success = await runBuiltin('Локальный режим (Primary)');
      if (success) return;
    }

    console.info(`[Router] Active providers: ${activeProviders.map(p => p.name).join(', ')}`);
    console.info(`[Router] Fallback chain: ${activeProviders.map(p => p.name).join(' → ')}`);
    for (const provider of activeProviders) {
      if (providerHealthManager.getHealth(provider.id).inCooldownUntil > Date.now()) {
         if (routeCallback) {
             routeCallback({ modelName: provider.name, target: provider.type, cause: `${provider.name} восстанавливается...`, step: 'ROUTER', latency: Date.now() - reqStart });
         }
         continue; // skip cooldown provider
      }
      
      try {
        let fullResponse = '';
        let firstChunk = false;
        let hadToolActivity = false;
        
        if (provider.id === 'temp_builtin_llm') {
          console.log(`[AI-Routing] Using Built-in Local LLM: ${provider.model}`);
          if (routeCallback) routeCallback({ modelName: provider.model, target: 'local', cause: settings?.localLLMPriority === 'primary' ? 'Основная локальная модель' : 'Локальный режим (Last-Resort)', step: 'ROUTER', latency: Date.now() - reqStart });
          
          await BuiltInLlmService.getInstance().generate(text, context, provider.model, settings, (chunk, done) => {
            if (abortController.signal.aborted) return;
            if (!firstChunk && chunk) {
              firstChunk = true;
              if (routeCallback) routeCallback({ modelName: provider.model, target: 'local', cause: settings?.localLLMPriority === 'primary' ? 'Основная локальная модель' : 'Локальный режим (Last-Resort)', step: 'RESPONSE', latency: Date.now() - reqStart });
            }
            if (done && routeCallback) routeCallback({ modelName: provider.model, target: 'local', cause: settings?.localLLMPriority === 'primary' ? 'Основная локальная модель' : 'Локальный режим (Last-Resort)', step: 'TTS', latency: Date.now() - reqStart });
            fullResponse += chunk;
            if (done && fullResponse.trim()) {
              if (cacheable && !abortController.signal.aborted) {
                llmCacheService.set(text, provider.model, sysPrompt, 'Встроенная LLM', fullResponse, Date.now() - reqStart);
              }
              memoryManager.processInteraction(text, fullResponse).catch(e => console.error(`[Memory] Process interaction error: ${sanitizeError(e)}`));
            }
            callback(chunk, done);
          });
        } else {
          await executeRequestFallbackChain(provider, text, context, abortController, (chunk, done, isSearching, toolSource) => {
          if (abortController.signal.aborted) return;
          if (isSearching || toolSource) {
            hadToolActivity = true;
          }
          if (!firstChunk && chunk) {
            firstChunk = true;
            if (routeCallback) routeCallback({ modelName: provider.model || provider.name, target: provider.type === 'local' ? 'local' : 'cloud', cause: `Исполнение через ${provider.name}`, step: 'RESPONSE', latency: Date.now() - reqStart });
          }
          if (done && routeCallback) routeCallback({ modelName: provider.model || provider.name, target: provider.type === 'local' ? 'local' : 'cloud', cause: `Исполнение через ${provider.name}`, step: 'TTS', latency: Date.now() - reqStart });
          
          fullResponse += chunk;
          if (done && fullResponse.trim()) {
            if (cacheable && !hadToolActivity && !abortController.signal.aborted) {
              const modelToCache = getOrderedProviderModels(provider, text)[0] || provider.model || provider.name;
              llmCacheService.set(text, modelToCache, sysPrompt, provider.name, fullResponse, Date.now() - reqStart);
            }
            memoryManager.processInteraction(text, fullResponse).catch(e => console.error(`[Memory] Process interaction error: ${sanitizeError(e)}`));
          }
          callback(chunk, done, isSearching, toolSource);
        }, routeCallback, settings);
        } // end else
        
        if (abortController.signal.aborted) {
          callback('', true);
          return;
        }
        success = true;
        break; // Successfully handled by this provider
      } catch (e: any) {
        if (abortController.signal.aborted) {
          callback('', true);
          return;
        }
        const isSocketHangUp = e.code === 'ECONNRESET' || (e.message && e.message.toLowerCase().includes('socket hang up'));
        const status = e.response?.status || (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || isSocketHangUp ? 'Network' : 'ERR');
        let reason = 'Сбой запроса';
        if (isSocketHangUp) reason = 'Прервано соединение';
        else if (status === 429) reason = 'Rate Limit';
        else if (status === 404) reason = 'Модель не найдена';
        else if (status === 401) reason = 'Неверный API ключ';
        else if (status === 402) reason = 'Нет токенов/баланса';
        else if (status === 403) reason = 'Доступ запрещён';
        else if (status === 502) reason = 'Bad Gateway';
        else if (status === 503) reason = 'Service Unavailable';
        else if (status === 504) reason = 'Gateway Timeout';
        else if (status === 'Network') reason = 'Сетевой сбой';
        else if (e.message) reason = e.message.slice(0, 30);

        lastFailureInfo = { name: provider.name, status, reason };

        if (exclusiveProvider) {
          console.warn(`[Router] Exclusive provider ${provider.name} failed (${status}: ${reason}). Fallback is disabled in exclusive mode.`);
          if (routeCallback) {
            routeCallback({
              modelName: provider.name,
              target: provider.type === 'local' ? 'local' : 'cloud',
              cause: `${provider.name} сбой (${status}: ${reason})`,
              step: 'ROUTER',
              latency: Date.now() - reqStart,
              hasError: true,
              errorBadge: status === 429 ? '429 (60s)' : String(status),
              errorNode: provider.type === 'local' ? 'local' : 'cloud'
            } as any);
          }
          callback(`Провайдер ${provider.name} не ответил (${status}: ${reason}). Эксклюзивный режим активен — переключение на другие шлюзы заблокировано.`, true);
          return;
        }

        const currentIdx = activeProviders.indexOf(provider);
        const nextProvider = activeProviders[currentIdx + 1];
        const nextTargetName = nextProvider ? nextProvider.name : (settings?.useLocalLLM !== false ? 'Local Built-in' : 'Offline Handler');

        console.warn(`[Router] Provider ${provider.name} failed, switching to next provider`);
        console.warn(`[A.R.C. Multi-Model Router] Provider ${provider.name} failed (HTTP ${status}: ${reason}). Falling back to ${nextTargetName}.`);
        
        if (!nextProvider && settings?.useLocalLLM === false) {
           broadcastToast(`${provider.name}: ${status} ${reason}`, 'error', 5000);
        }

        if (routeCallback) {
          routeCallback({
            modelName: provider.name,
            target: provider.type === 'local' ? 'local' : 'cloud',
            cause: `${provider.name} сбой (${status}: ${reason})`,
            step: 'ROUTER',
            latency: Date.now() - reqStart,
            hasError: true,
            errorBadge: status === 429 ? '429 (60s)' : String(status),
            errorNode: provider.type === 'local' ? 'local' : 'cloud'
          } as any);
        }
      }
    }

    if (success) return;

    if (abortController.signal.aborted) {
      callback('', true);
      return;
    }

    if (settings?.useLocalLLM !== false) {
      const builtinSuccess = await runBuiltin('Аварийный fallback: провайдеры недоступны');
      if (builtinSuccess) return;
    }

    if (abortController.signal.aborted) {
      callback('', true);
      return;
    }
    const failureCause = lastFailureInfo ? `${lastFailureInfo.name}: ${lastFailureInfo.status} ${lastFailureInfo.reason}` : 'Нет связи';
    if (routeCallback) routeCallback({ modelName: 'Система', target: 'local', cause: failureCause });

    if (lastFailureInfo?.status === 401) {
      broadcastToast(`${lastFailureInfo.name}: 401 Неверный API ключ`, 'error', 6000);
      callback(`Провайдер ${lastFailureInfo.name} отклонил запрос: неверный API-ключ (код 401). Укажите действующий ключ в Настройках или выберите другой сервис.`, true);
    } else if (lastFailureInfo?.status === 402) {
      broadcastToast(`${lastFailureInfo.name}: Закончились токены или баланс`, 'error', 6000);
      callback(`У провайдера ${lastFailureInfo.name} закончился баланс или квота токенов (код 402).`, true);
    } else if (lastFailureInfo?.status === 429) {
      broadcastToast(`${lastFailureInfo.name}: Превышен лимит запросов`, 'error', 6000);
      callback(`Превышен лимит запросов к ${lastFailureInfo.name} (код 429). Повторите попытку через минуту.`, true);
    } else if (lastFailureInfo?.status === 404) {
      broadcastToast(`${lastFailureInfo.name}: Модель не найдена (404)`, 'error', 6000);
      callback(`Модель у провайдера ${lastFailureInfo.name} не найдена (код 404). Проверьте имя модели в настройках.`, true);
    } else {
      callback('Связь с языковой моделью отсутствует, а встроенная локальная модель не установлена. Проверьте подключение или параметры провайдера.', true);
    }
  }
}
export const aiRouter = new AiRouter();
