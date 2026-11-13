import axios from 'axios';
import { AiProvider } from './provider.interface';
import { secretVault, MASKED_SECRET_PLACEHOLDER } from '../../security/secret-vault.service';
import { providerHealthManager } from './provider-health';
import { resolveChatEndpoint, resolveModelsEndpoint } from '../endpoint-normalizer';
import { isFreeLlmGateway, extractHostPort } from '../../../../shared/utils/free-llm.util';
import { scanLocalFreeLlm, type FreeLlmDetectionResult } from './free-llm-scanner';

function buildHeaders(rawKey?: string, noAuthHeader?: boolean): Record<string, string> {
  const cleanKey = (rawKey || '').trim().replace(/^["']|["']$/g, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'HTTP-Referer': 'https://github.com/arc-assistant',
    'X-Title': 'A.R.C. Assistant',
    'User-Agent': 'ARC-Assistant/1.0'
  };
  if (
    !noAuthHeader &&
    cleanKey &&
    cleanKey !== MASKED_SECRET_PLACEHOLDER &&
    !cleanKey.startsWith('enc:') &&
    !cleanKey.startsWith('b64:')
  ) {
    headers['Authorization'] = `Bearer ${cleanKey}`;
    headers['x-api-key'] = cleanKey;
  }
  return headers;
}

export async function testConnection(provider: AiProvider): Promise<{ success: boolean; error?: string; models?: string[] }> {
  try {
    if (!provider?.endpoint || !provider.endpoint.trim() || !provider.endpoint.startsWith('http')) {
      return { success: false, error: 'Укажите корректный URL эндпоинта (начиная с http:// или https://).' };
    }
    const isOllama = provider.type === 'local' && 
      (provider.endpoint.includes('11434') || provider.name.toLowerCase().includes('ollama') || provider.id.includes('ollama'));

    if (isOllama) {
      let endpointUrl = provider.endpoint;
      if (endpointUrl.includes('localhost:11434')) {
        endpointUrl = endpointUrl.replace('localhost:11434', '127.0.0.1:11434');
      }
      const urlOptions = new URL(endpointUrl);
      const healthUrl = `${urlOptions.protocol}//${urlOptions.host}/api/tags`;
      const tagsRes = await axios.get(healthUrl, { timeout: 4000 });
      const models = Array.isArray(tagsRes.data?.models) ? tagsRes.data.models.map((m: any) => m.name || m.id).filter(Boolean) : [];
      return { success: true, models };
    }

    const isFreeCloud = provider.type === 'cloud' && (
      provider.name?.toLowerCase().includes('free') ||
      provider.endpoint?.toLowerCase().includes('freellm') ||
      provider.endpoint?.toLowerCase().includes('horde') ||
      (provider as any).freeTier === 'free'
    );

    const keyRes = secretVault.resolveProviderApiKey(provider.id, provider.apiKey);
    if (!provider.noAuthHeader && provider.type === 'cloud' && keyRes.value === null && !isFreeCloud) {
      return {
        success: false,
        error: keyRes.status === 'unreadable'
          ? 'Сохранённый API ключ повреждён или зашифрован под другим профилем Windows (DPAPI). Введите ключ заново.'
          : 'API ключ не указан (введите ключ в поле выше).'
      };
    }

    const rawKey = (keyRes.value || '').trim();
    const parsedKeys = rawKey.split(/[\n,;]+/).map(k => k.trim().replace(/^["']|["']$/g, '')).filter(k => k.length > 5);
    const cleanKey = parsedKeys[0] || rawKey.replace(/^["']|["']$/g, '');

    let effectiveKey = cleanKey;
    if (!provider.noAuthHeader && !cleanKey && isFreeCloud) {
      effectiveKey = 'free';
    }

    const isLocalOrCustom = provider.type === 'local' ||
      isFreeLlmGateway(provider) ||
      Boolean(provider.endpoint && (provider.endpoint.includes('127.0.0.1') || provider.endpoint.includes('localhost')));
    const pingTimeout = isLocalOrCustom ? 30000 : 10000;
    const modelsTimeout = isLocalOrCustom ? 10000 : 5000;

    const headers = buildHeaders(effectiveKey, provider.noAuthHeader);
    const chatUrl = resolveChatEndpoint(provider.endpoint);
    const modelsUrl = resolveModelsEndpoint(provider.endpoint);

    // 1. Try testing via /models endpoint (verifies API key and discovers available models)
    let discoveredModels: string[] = [];
    let modelsCheckPassed = false;
    try {
      const modelsRes = await axios.get(modelsUrl, { headers, timeout: modelsTimeout });
      if (modelsRes.status >= 200 && modelsRes.status < 300) {
        modelsCheckPassed = true;
        discoveredModels = extractModelList(modelsRes.data);
      }
    } catch {
      // Models endpoint check is optional; proceed to completion ping
    }

    // 2. Determine target model for ping
    let targetModel = provider.model || (provider.selectedModels && provider.selectedModels[0]) || '';
    if (provider.endpoint.includes('openrouter') && (targetModel === 'openrouter/free' || targetModel === 'free')) {
      targetModel = 'openrouter/auto';
    } else if (targetModel === 'auto' || targetModel === 'auto:fast') {
      if (isLocalOrCustom || discoveredModels.includes(targetModel) || discoveredModels.includes('auto')) {
        targetModel = targetModel;
      } else {
        targetModel = provider.selectedModels?.find(m => m !== 'auto' && m !== 'fusion') || discoveredModels[0] || 'auto';
      }
    } else if (isLocalOrCustom && targetModel === 'fusion' && (discoveredModels.includes('auto') || provider.selectedModels?.includes('auto'))) {
      // Avoid testing with heavy multi-model consensus 'fusion' during quick health ping
      targetModel = 'auto';
    } else if (!targetModel || targetModel === 'default') {
      targetModel = discoveredModels[0] || (isLocalOrCustom ? 'auto' : 'gpt-4o');
    } else if (discoveredModels.length > 0 && !discoveredModels.includes(targetModel)) {
      targetModel = discoveredModels.includes('auto') ? 'auto' : discoveredModels[0];
    }

    try {
      const pingRes = await axios.post(chatUrl, {
        model: targetModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 16,
        temperature: 0.1
      }, {
        headers,
        timeout: pingTimeout
      });

      const resData = pingRes.data;
      if (typeof resData === 'string' && (resData.trim().startsWith('<') || resData.includes('<!DOCTYPE'))) {
        return { success: false, error: 'Эндпоинт вернул HTML-страницу вместо JSON API. Убедитесь, что сервис запущен на этом порту.' };
      }
      if (resData?.error) {
        const errMsg = resData.error?.message || resData.error?.detail || JSON.stringify(resData.error);
        return { success: false, error: `Провайдер вернул ошибку: ${errMsg}` };
      }
      const pingText = resData?.choices?.[0]?.message?.content ?? resData?.choices?.[0]?.text;
      if (pingText === undefined && !resData?.choices?.length) {
        return { 
          success: false, 
          error: `Эндпоинт ответил кодом 200, но ответ пуст (нет choices для модели "${targetModel}"). Убедитесь, что шлюз активен и модель поддерживается.` 
        };
      }
      providerHealthManager.reset(provider.id);
      return { success: true, models: discoveredModels, workingModel: provider.model === 'auto' ? 'auto' : targetModel } as any;
    } catch (compErr: any) {
      const status = compErr.response?.status;
      const data = compErr.response?.data;
      const detail = data?.error?.message || data?.error || data?.message || compErr.message;

      if (compErr.code === 'ECONNABORTED' || compErr.message?.includes('timeout')) {
        if (modelsCheckPassed) {
          providerHealthManager.reset(provider.id);
            const hostPort = extractHostPort(provider.endpoint) || '127.0.0.1:31415';
            return {
              success: false,
              models: discoveredModels,
              error: `Шлюз подключён и ключ принят (доступно моделей: ${discoveredModels.length}), но генерация модели «${targetModel}» превысила таймаут (30с). Убедитесь, что в веб-панели шлюза (http://${hostPort}) активен хотя бы один рабочий провайдер и выберите модель «auto» (отключив медленный «fusion»).`
            } as any;
          }
          return { success: false, error: 'Сервер не отвечает (таймаут соединения). Убедитесь, что FreeLLMAPI запущен.' };
        }
        if (compErr.code === 'ECONNREFUSED' || compErr.code === 'ENOTFOUND') {
          if (isFreeLlmGateway(provider)) {
            const scan: FreeLlmDetectionResult = await scanLocalFreeLlm().catch((): FreeLlmDetectionResult => ({ found: false }));
            if (scan.found && scan.port) {
              return {
                success: false,
                error: `Сервер не отвечает на ${provider.endpoint}. Обнаружен активный FreeLLM на порту ${scan.port} (${scan.baseUrl}). Нажмите «Автопоиск FreeLLM» или укажите порт ${scan.port}.`
              };
            }
          }
          return { success: false, error: 'Сервер не отвечает (соединение отклонено). Убедитесь, что FreeLLMAPI запущен на указанном порту.' };
        }
        if (status === 401 || status === 403) {
          if (isFreeLlmGateway(provider)) {
            const hostPort = extractHostPort(provider.endpoint) || '127.0.0.1:31415';
            return {
              success: false,
              error: `Ошибка авторизации FreeLLMAPI (код 401). Скопируйте единый ключ (freellmapi-...) из веб-панели (http://${hostPort}) или включите опцию «Без заголовка Authorization».`
            };
          }
          return { success: false, error: 'Неверный ключ или нет доступа (код 401/403). Проверьте правильность введённого ключа.' };
        }
      if (status === 402) {
        return { success: false, error: 'Недостаточно средств на балансе провайдера (402 Payment Required).' };
      }
      if (status === 404 || (typeof detail === 'string' && /model.*not found|does not exist|no endpoints/i.test(detail))) {
        return { 
          success: false, 
          error: `Неверный endpoint (код 404) или модель "${targetModel}" не найдена. Проверьте адрес сервера и имя модели.` 
        };
      }
      if (status === 400) {
        return { 
          success: false, 
          error: `Ошибка запроса к модели "${targetModel}" (код 400): ${detail}. Выберите другую модель из каталога.` 
        };
      }
      if (status === 429) {
        return { 
          success: false, 
          error: 'Превышен лимит запросов или закончился баланс кредитов (429 Too Many Requests).' 
        };
      }

      if (modelsCheckPassed) {
        providerHealthManager.reset(provider.id);
        return {
          success: false,
          models: discoveredModels,
          error: `Шлюз подключён и ключ верен (${discoveredModels.length} моделей), но тестовый запрос к модели "${targetModel}" вернул ошибку: ${detail || compErr.message}. Проверьте апстрим-аккаунты в веб-панели шлюза или выберите другую модель.`
        } as any;
      }

      return { success: false, error: `Ошибка подключения: ${detail || compErr.message}` };
    }
  } catch (e: any) {
    console.error(`Connection test failed for ${provider.name}:`, e?.message || e);
    const status = e.response?.status;
    if (status === 401 || status === 403) {
      return { success: false, error: 'Неверный ключ или нет доступа (код 401/403). Проверьте правильность введённого ключа.' };
    }
    if (status === 404) {
      return { success: false, error: 'Неверный endpoint (код 404). Проверьте адрес сервера.' };
    }
    if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
      return { success: false, error: 'Сервер не отвечает (таймаут соединения). Убедитесь, что FreeLLMAPI запущен.' };
    }
    if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
      return { success: false, error: 'Сервер не отвечает (соединение отклонено). Убедитесь, что FreeLLMAPI запущен на указанном порту.' };
    }
    return { success: false, error: e?.message || 'Не удалось связаться с сервером.' };
  }
}

function extractModelList(data: any): string[] {
  if (!data) return [];
  let rawList: any[] = [];
  if (Array.isArray(data.data)) {
    rawList = data.data;
  } else if (Array.isArray(data.models)) {
    rawList = data.models;
  } else if (Array.isArray(data.result)) {
    rawList = data.result;
  } else if (Array.isArray(data.items)) {
    rawList = data.items;
  } else if (Array.isArray(data)) {
    rawList = data;
  }
  return rawList.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
}

export function getFallbackModelsForProvider(provider: AiProvider): string[] {
  if (isFreeLlmGateway(provider)) {
    const models = ['auto', 'auto:fast'];
    if (provider.model && !models.includes(provider.model)) {
      models.unshift(provider.model);
    }
    return models;
  }
  if (provider.model && provider.model !== 'default') {
    return [provider.model];
  }
  return [];
}

export async function getAvailableModels(provider: AiProvider): Promise<string[]> {
  try {
    if (!provider?.endpoint || !provider.endpoint.trim() || !provider.endpoint.startsWith('http')) {
      return [];
    }
    const isOllama = provider.type === 'local' && 
      (provider.endpoint.includes('11434') || provider.name.toLowerCase().includes('ollama') || provider.id.includes('ollama'));

    if (isOllama) {
      let endpointUrl = provider.endpoint;
      if (endpointUrl.includes('localhost:11434')) {
        endpointUrl = endpointUrl.replace('localhost:11434', '127.0.0.1:11434');
      }
      const urlOptions = new URL(endpointUrl);
      const url = `${urlOptions.protocol}//${urlOptions.host}/api/tags`;
      const response = await axios.get(url, { timeout: 5000 });
      if (response.data && Array.isArray(response.data.models)) {
        return response.data.models.map((m: any) => m.name || m.id).filter(Boolean);
      }
      return [];
    }

    const isFreeLLM = isFreeLlmGateway(provider);
    const isFreeCloud = isFreeLLM || (provider.type === 'cloud' && (
      provider.name?.toLowerCase().includes('free') ||
      provider.endpoint?.toLowerCase().includes('freellm') ||
      provider.endpoint?.toLowerCase().includes('horde') ||
      (provider as any).freeTier === 'free'
    ));
    const keyRes = secretVault.resolveProviderApiKey(provider.id, provider.apiKey);
    if (!provider.noAuthHeader && provider.type === 'cloud' && keyRes.value === null && !isFreeCloud) {
      provider.modelsFetchError = keyRes.status === 'unreadable'
        ? 'Ключ API не удалось расшифровать (DPAPI)'
        : 'Ключ API не задан';
      return [];
    }

    const cleanKey = (keyRes.value || '').trim().replace(/^["']|["']$/g, '');
    const headers = buildHeaders(cleanKey || (isFreeLLM && !provider.noAuthHeader ? 'free' : ''), provider.noAuthHeader);
    
    const primaryUrl = resolveModelsEndpoint(provider.endpoint);
    let candidateUrls: string[] = [primaryUrl];
    try {
      const urlObj = new URL(primaryUrl);
      const origin = `${urlObj.protocol}//${urlObj.host}`;
      candidateUrls = [
        primaryUrl,
        `${origin}/models`,
        `${origin}/api/models`,
        `${origin}/v1/models`
      ].filter((u, idx, arr) => arr.indexOf(u) === idx);
    } catch {}

    for (const url of candidateUrls) {
      try {
        const response = await axios.get(url, { headers, timeout: 5000 });
        const list = extractModelList(response.data);
        if (list.length > 0) {
          return isFreeLLM && !list.includes('auto') ? ['auto', ...list] : list;
        }
      } catch {
        // Try next candidate URL
      }
    }

    return isFreeLLM ? getFallbackModelsForProvider(provider) : [];
  } catch (e: any) {
    console.error(`Failed to fetch models for ${provider.name}:`, e?.message || e);
    return [];
  }
}
