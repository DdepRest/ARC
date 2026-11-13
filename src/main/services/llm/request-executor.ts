import type { AiProvider } from './providers/provider.interface';
import { isSimpleQuery, isConversationalQuery } from './intent-classifier';
import { executeOllamaRequest } from './providers/ollama.provider';
import { executeOpenAICompatibleRequest } from './providers/openai.provider';
import { getAvailableModels } from './providers/provider.api';
import { providerHealthManager } from './providers/provider-health';
import { logger } from '../../utils/logger';

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function formatFailureReason(err: any, latency: number): string {
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return `timeout (${latency}ms exceeded)`;
  }
  if (err.response?.status) {
    const statusText = err.response?.statusText || (err.response.status === 502 ? 'Bad Gateway' : (err.response.status === 504 ? 'Gateway Timeout' : (err.response.status === 500 ? 'Internal Server Error' : '')));
    const detail = err.response?.data?.error?.message || err.response?.data?.error || '';
    return `HTTP ${err.response.status}${statusText ? ' ' + statusText : ''}${detail ? ` (${detail})` : ''}`;
  }
  if (err.code) {
    return err.code;
  }
  return err.message || 'Unknown error';
}

import { isFreeLlmGateway } from '../../../shared/utils/free-llm.util';

export function getOrderedProviderModels(provider: AiProvider, text: string): string[] {
  const rawList: string[] = [];
  if (provider.model) {
    rawList.push(provider.model);
  }
  if (Array.isArray(provider.selectedModels)) {
    for (const m of provider.selectedModels) {
      if (m && !rawList.includes(m)) {
        rawList.push(m);
      }
    }
  }

  const isFreeLLM = isFreeLlmGateway(provider);
  if (rawList.length === 0 && isFreeLLM) {
    rawList.push('auto');
  }

  if (rawList.length === 0) {
    return [];
  }

  const isOpenRouter = Boolean(provider.endpoint && provider.endpoint.includes('openrouter'));

  const orderedModels = rawList.map(m => {
    if (m === 'auto') {
      if (isOpenRouter) return 'openrouter/auto';
      if (isFreeLLM || provider.type === 'local') return 'auto';
      return provider.selectedModels?.find(sm => sm !== 'auto') || 'gpt-4o';
    }
    return m;
  });

  if (provider.routingStrategy === 'smart_route' && orderedModels.length > 1) {
    const isSimple = isSimpleQuery(text) || isConversationalQuery(text);
    if (isSimple) {
      orderedModels.sort((a, b) => {
        if (a === 'fusion' && b !== 'fusion') return 1;
        if (b === 'fusion' && a !== 'fusion') return -1;
        const aFast = /^auto(:fast)?$|flash|mini|haiku|8b|3b|1b|small|lite|instant/i.test(a);
        const bFast = /^auto(:fast)?$|flash|mini|haiku|8b|3b|1b|small|lite|instant/i.test(b);
        return aFast === bFast ? 0 : aFast ? -1 : 1;
      });
    } else {
      orderedModels.sort((a, b) => {
        if (a === 'fusion' && b !== 'fusion') return 1;
        if (b === 'fusion' && a !== 'fusion') return -1;
        const aHeavy = /^auto$|pro|sonnet|opus|70b|405b|r1|reasoner|large|coder|max/i.test(a);
        const bHeavy = /^auto$|pro|sonnet|opus|70b|405b|r1|reasoner|large|coder|max/i.test(b);
        return aHeavy === bHeavy ? 0 : aHeavy ? -1 : 1;
      });
    }
  } else if (orderedModels.length > 1 && orderedModels.includes('auto') && orderedModels[0] === 'fusion') {
    const idx = orderedModels.indexOf('auto');
    orderedModels.splice(idx, 1);
    orderedModels.unshift('auto');
  }

  return orderedModels;
}

export async function executeRequestFallbackChain(
    provider: AiProvider,
    text: string,
    context: any[],
    abortController: AbortController,
    callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
    routeCallback?: (data: { modelName: string; target: 'local' | 'cloud'; cause: string; step?: 'CLASSIFIER' | 'ROUTER' | 'TOOL_API' | 'RESPONSE' | 'TTS' | null; latency?: number }) => void,
    settings?: any
  ): Promise<string> {
    const isOllama = provider.type === 'local' && 
      (provider.endpoint.includes('11434') || provider.name.toLowerCase().includes('ollama') || provider.id.includes('ollama'));

    const orderedModels = getOrderedProviderModels(provider, text);

    // Mirror testConnection behavior for FreeLLM / local gateways: if 'auto' is the only candidate,
    // also discover available models from /v1/models (excluding slow consensus 'fusion') so that gateways requiring an explicit model ID succeed.
    if (isFreeLlmGateway(provider) && orderedModels.includes('auto') && orderedModels.length <= 2) {
      try {
        const discovered = await getAvailableModels(provider);
        for (const dm of discovered.filter(m => m !== 'fusion' && m !== 'openrouter/fusion').slice(0, 3)) {
          if (dm && !orderedModels.includes(dm)) {
            orderedModels.push(dm);
          }
        }
      } catch {
        // Ignore discovery failure and proceed with 'auto'
      }
    }

    if (orderedModels.length === 0) {
      throw new Error(`Нет выбранных моделей для провайдера ${provider.name}.`);
    }

    let lastErr: any = null;
    let success = false;
    let failureMarked = false;
    for (let i = 0; i < orderedModels.length; i++) {
      if (abortController.signal.aborted) {
        callback('', true);
        return '';
      }
      
      const targetModel = orderedModels[i];
      const modelSpecificProvider: AiProvider = { ...provider, model: targetModel };

      const isFallback = i > 0;
      if (routeCallback) {
        routeCallback({
          modelName: targetModel,
          target: provider.type === 'local' ? 'local' : 'cloud',
          cause: isFallback 
            ? `→ ${targetModel}`
            : (provider.routingStrategy === 'smart_route' 
              ? `Умная маршрутизация (кандидат ${i + 1}/${orderedModels.length})` 
              : `Маршрутизация (попытка ${i + 1}/${orderedModels.length})`),
          step: 'ROUTER'
        });
      }

      console.log(`[A.R.C. Multi-Model Router] Attempting model ${i + 1}/${orderedModels.length}: ${targetModel} (Provider: ${provider.name})`);
      
      const maxRetries = 2;
      let attempt = 0;
      
      while (attempt <= maxRetries) {
        if (abortController.signal.aborted) {
          callback('', true);
          return '';
        }
        
        const attemptStartTime = Date.now();
        try {
          if (isOllama) {
            await executeOllamaRequest(modelSpecificProvider, text, context, abortController, callback, settings);
          } else {
            await executeOpenAICompatibleRequest(modelSpecificProvider, text, context, abortController, callback, settings);
          }
          const attemptLatency = Date.now() - attemptStartTime;
          console.log(`[A.R.C. Multi-Model Router] Provider: ${provider.name}, HTTP: 200, Latency: ${attemptLatency}ms`);
          logger.info(`[A.R.C. Multi-Model Router] Provider: ${provider.name}, HTTP: 200, Latency: ${attemptLatency}ms`);
          providerHealthManager.markSuccess(provider.id);
          success = true;
          break;
        } catch (err: any) {
          lastErr = err;
          const attemptLatency = Date.now() - attemptStartTime;

          const isTimeout = err.code === 'ECONNABORTED' || Boolean(err.message && /timeout/i.test(err.message));

          // If the request was aborted by user or application state lifecycle (e.g. window hide / new query),
          // exit cleanly without retrying or marking provider as broken.
          const isCanceled = abortController.signal.aborted ||
            (!isTimeout && (
              err.code === 'ERR_CANCELED' ||
              err.name === 'CanceledError' ||
              Boolean(err.message && /canceled|aborted/i.test(err.message))
            ));

          if (isCanceled) {
            console.log(`[Router] Request to ${provider.name} canceled (aborted by user or lifecycle).`);
            callback('', true);
            return '';
          }

          const status = err.response?.status;
          const is429 = status === 429;
          const isSocketHangUp = err.code === 'ECONNRESET' || 
            err.code === 'ERR_SOCKET_HANG_UP' || 
            err.message?.includes('socket hang up') || 
            err.message?.includes('ECONNRESET');
          const isNetwork = (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') && !isSocketHangUp;
          const codeForLog = status || (isSocketHangUp ? 'SocketHangUp' : (isTimeout ? 'Timeout' : (isNetwork ? 'Network' : (err.code || 500))));
          const failureReason = formatFailureReason(err, attemptLatency);
          console.warn(`[Router] Request to ${provider.name} failed: ${failureReason}`);
          logger.warn(`[Router] Request to ${provider.name} failed: ${failureReason}`);
          console.log(`[A.R.C. Multi-Model Router] Provider: ${provider.name}, HTTP: ${codeForLog}, Latency: ${attemptLatency}ms`);
          logger.info(`[A.R.C. Multi-Model Router] Provider: ${provider.name}, HTTP: ${codeForLog}, Latency: ${attemptLatency}ms`);
          
          if (err.message === 'EMPTY_RESPONSE') {
            console.warn(`[Router] ${provider.name} returned empty response, trying next model/provider`);
            providerHealthManager.markFailure(provider.id, false, false);
            failureMarked = true;
            break;
          } else if (status === 401) {
            // Do not wait or retry with the same key/model on 401; openai.provider already tried keysToTry, so switch immediately to next model/provider
            console.warn(`[Router] ${provider.name} → 401, switching to next key/model`);
            providerHealthManager.markFailure(provider.id, false, false, 401);
            failureMarked = true;
            break;
          } else if (isTimeout) {
            if (attempt < 1 && (!isFreeLlmGateway(provider) || orderedModels.length === 1)) {
              console.warn(`[Router] ${provider.name} → timeout, retry 1/1 in 2s`);
              if (routeCallback) {
                routeCallback({
                  modelName: targetModel,
                  target: provider.type === 'local' ? 'local' : 'cloud',
                  cause: 'повтор (таймаут)...',
                  step: 'ROUTER'
                });
              }
              attempt++;
              await abortableDelay(2000, abortController.signal);
              continue;
            } else {
              providerHealthManager.markFailure(provider.id, false, !isFreeLlmGateway(provider));
              failureMarked = true;
              break;
            }
          } else if (isSocketHangUp) {
            if (attempt < 1) {
              console.warn(`[A.R.C. Multi-Model Router] Socket hang up on ${targetModel}. Silent retry (Attempt ${attempt + 1}/${maxRetries})...`);
              if (routeCallback) {
                routeCallback({
                  modelName: targetModel,
                  target: provider.type === 'local' ? 'local' : 'cloud',
                  cause: 'повтор...',
                  step: 'ROUTER'
                });
              }
              attempt++;
              await abortableDelay(400, abortController.signal);
              continue;
            } else {
              break;
            }
          } else if (is429) {
            if (attempt >= 1) {
              console.warn(`[A.R.C. Multi-Model Router] Model ${targetModel} failed due to 429 Rate Limit. Marking provider ${provider.name} in cooldown (>=60s).`);
              providerHealthManager.markFailure(provider.id, true, false, 429);
              failureMarked = true;
              break;
            }
            if (routeCallback) {
              routeCallback({
                modelName: targetModel,
                target: provider.type === 'local' ? 'local' : 'cloud',
                cause: 'повтор...',
                step: 'ROUTER'
              });
            }
            const jitter = Math.random() * 500;
            const delay = Math.max(5000, (Math.pow(2, attempt) * 2500) + jitter);
            console.log(`[A.R.C. Multi-Model Router] 429 Rate Limit on ${targetModel}. Backoff ${Math.round(delay)}ms (Attempt ${attempt + 1}/${maxRetries})...`);
            await abortableDelay(delay, abortController.signal);
            attempt++;
          } else if (isNetwork) {
            console.warn(`[A.R.C. Multi-Model Router] Network error on ${targetModel}. Marking provider ${provider.name} offline.`);
            providerHealthManager.markFailure(provider.id, false, true);
            failureMarked = true;
            break; // Instant transition
          } else if (status >= 500) {
            if (attempt >= maxRetries) { 
              providerHealthManager.markFailure(provider.id, false, false, status);
              failureMarked = true;
              break;
            }
            const delay5xx = attempt === 0 ? 1000 : 3000;
            if (routeCallback) {
              routeCallback({
                modelName: targetModel,
                target: provider.type === 'local' ? 'local' : 'cloud',
                cause: 'повтор...',
                step: 'ROUTER'
              });
            }
            attempt++;
            await abortableDelay(delay5xx, abortController.signal);
          } else {
            // Other errors (e.g. 400 Bad Request, 404 Not Found)
            if (status) {
              providerHealthManager.markFailure(provider.id, false, false, status);
              failureMarked = true;
            }
            break;
          }
        }
      }
      
      if (success) {
        return targetModel;
      } else {
        console.warn(`[A.R.C. Multi-Model Router] Model ${targetModel} failed. Trying next...`);
        if (lastErr && (lastErr.code === 'ECONNREFUSED' || lastErr.code === 'ENOTFOUND')) {
          // Break out of orderedModels loop immediately on provider network outage
          break;
        }
      }
    }
    
    if (!success) {
      if (!failureMarked) {
        const errStatus = lastErr?.response?.status || (lastErr?.code === 'ECONNREFUSED' || lastErr?.code === 'ENOTFOUND' ? 'Network' : (lastErr?.response ? lastErr.response.status : 500));
        providerHealthManager.markFailure(provider.id, false, false, typeof errStatus === 'number' ? errStatus : undefined);
      }
      throw lastErr || new Error(`Provider ${provider.name} failed with status ${lastErr?.response?.status || 'unknown'}`);
    }
    return provider.model || provider.name;
}
