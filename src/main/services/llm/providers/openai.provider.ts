import axios from 'axios';
import http from 'http';
import https from 'https';
import { memoryManager } from '../../memory/memory-manager';
import { ToolDispatcher } from '../../tools/tool-dispatcher';
import { ttsService } from '../../tts.service';
import type { AiProvider } from './provider.interface';
import { getToolsPrompt, parseToolCall } from '../tools-utils';
import { secretVault } from '../../security/secret-vault.service';
import { logger } from '../../../utils/logger';
import { parseSseStream } from '../sse-stream-parser';
import { stripThinkingProcess, StreamingThinkingFilter } from '../thinking-cleaner';
import { TASK_SYSTEM_PROMPT_RULE, getSystemDateTimeContext } from '../prompt-builder';
import { resolveChatEndpoint } from '../endpoint-normalizer';
import { isFreeLlmGateway } from '../../../../shared/utils/free-llm.util';

async function handleToolExecution(
  parsedToolCall: any,
  responseText: string,
  messages: any[],
  provider: AiProvider,
  maxTokens: number,
  temperature: number,
  headers: Record<string, string>,
  abortController: any,
  callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
  isStreaming: boolean
) {
  const toolDispatcher = ToolDispatcher.getInstance();
  let beforeText = parsedToolCall.responseTextBeforeTool.trim();
  if (parsedToolCall.toolName === 'wikipedia' && !beforeText) {
    beforeText = "Секунду, уточняю в энциклопедии...";
  }
  
  if (beforeText) callback(beforeText + ' ', false, true);
  callback('', false, true);
  
  if (parsedToolCall.toolName === 'wikipedia') {
    try {
      await ttsService.speakAndWait(beforeText || "Секунду, уточняю в энциклопедии...", 5000);
    } catch {}
  }
  
  try {
    const toolExecResult = await toolDispatcher.executeTool(parsedToolCall.toolName, parsedToolCall.params);
    let count = 1;
    let actualTool = parsedToolCall.toolName;
    let toolResult = '';

    if (toolExecResult?.data) {
      if (Array.isArray(toolExecResult.data)) count = toolExecResult.data.length;
      else if (Array.isArray(toolExecResult.data.results)) count = toolExecResult.data.results.length;
      else if (typeof toolExecResult.data === 'string' && toolExecResult.data.includes('не найдено')) count = 0;
      if (toolExecResult.data.source === 'web_search_fallback' || (toolExecResult as any).source === 'web_search_fallback') actualTool = 'web_search';
      toolResult = toolDispatcher.formatResult(toolExecResult.data);
    } else if (toolExecResult?.error) {
      toolResult = `Error: ${toolExecResult.error}`;
      count = 0;
    } else {
      toolResult = JSON.stringify(toolExecResult);
    }

    const isSearchTool = actualTool === 'wikipedia' || actualTool === 'web_search';
    if (!toolResult || toolResult.trim() === '' || toolResult === '[]' || toolResult === '{}' || (toolResult.startsWith('Error:') && isSearchTool)) {
      console.log('[Tool] Empty result detected, returning fallback message');
      logger.info('[Tool] Empty result detected, returning fallback message');

      const fallbackMessage = `Я не нашёл релевантной информации по вашему запросу. ${
        actualTool === 'wikipedia' ? 'Возможно, статья ещё не написана или название указано неточно.' :
        actualTool === 'web_search' ? 'Веб-поиск не дал результатов. Попробуйте переформулировать вопрос.' :
        'Инструмент не смог получить данные.'
      }`;

      callback(fallbackMessage, true, false, { tool: actualTool, count: 0, isEmpty: true });
      return;
    }

    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: responseText },
      { role: 'user', content: `Результат поиска:\n${toolResult}\n\nСформулируй краткий и точный ответ на основе этих данных.` }
    ];
    
    const chatUrl = resolveChatEndpoint(provider.endpoint);
    const reqConfig = { headers, signal: abortController.signal, timeout: 30000 };
    if (isStreaming) {
      const followUpStream = await axios.post(
        chatUrl,
        { model: provider.model, messages: followUpMessages, stream: true, max_tokens: maxTokens, temperature },
        { ...reqConfig, responseType: 'stream' }
      );
      await parseSseStream(followUpStream.data, (delta, isDone) => { if (!isDone) callback(delta, false); }, abortController.signal);
      callback('', true, false, { tool: actualTool, count });
    } else {
      const finalResponse = await axios.post(
        chatUrl,
        { model: provider.model, messages: followUpMessages, stream: false, max_tokens: maxTokens, temperature },
        reqConfig
      );
      callback(finalResponse.data?.choices?.[0]?.message?.content || '', true, false, { tool: actualTool, count });
    }
  } catch (err: any) {
    console.error('[OpenAI Provider] Tool execution / follow-up failed:', err?.message || err);
    callback(`К сожалению, поиск информации не удался.`, true, false);
  }
}

export async function executeOpenAICompatibleRequest(
  provider: AiProvider, 
  text: string, 
  context: any[], 
  parentSignal: any, 
  callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
  settings?: any
) {
  const memoryContext = await memoryManager.enrichContext(text);
  const historyMessages = await memoryManager.getContextMessages();
  
  const toolDispatcher = ToolDispatcher.getInstance();
  const toolDefs = toolDispatcher.getToolDefinitions();
  const toolsPrompt = getToolsPrompt(toolDefs);
  let memoryPrompt = '';
  const topFacts = memoryContext.relevantFacts ? memoryContext.relevantFacts.slice(0, 5) : [];
  const topPrefs = memoryContext.userPreferences ? memoryContext.userPreferences.slice(0, 5) : [];
  if (topFacts.length > 0 || topPrefs.length > 0) {
    const lines = [...topFacts.map(f => `- ${typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}`), ...topPrefs.map(p => `- ${typeof p.value === 'string' ? p.value : JSON.stringify(p.value)}`)];
    memoryPrompt = '\n\n[Память пользователя]\n' + lines.join('\n');
  }
  const endpointLower = (provider.endpoint || '').toLowerCase();
  const isFreeLLM = isFreeLlmGateway(provider);
  const antiReasoningRule = '\nКАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить рассуждения, внутренний монолог, английский текст ("Here is a thinking process"), этапы анализа или теги <think>. Сразу выводи ТОЛЬКО готовый итоговый ответ пользователю на русском языке.';
  const baseSystemPrompt = 'Ты — A.R.C., интеллектуальный ассистент и компетентный цифровой напарник. Твой пол — ИСКЛЮЧИТЕЛЬНО МУЖСКОЙ. О себе говори в мужском роде. Общайся уверенно, уважительно и профессионально. Грубость, дерзость, уличный сленг (например, "Чё надо?", "Нормально") и панибратство СТРОГО ЗАПРЕЩЕНЫ. Держи тон компетентного напарника — без излишнего подобострастия ("что изволите", "я раб", "что угодно"), но всегда вежливо и тактично. Кальки и канцелярит запрещены. Обращение "сэр" использовать запрещено. Запрещена конструкция "готов" + глагол ("готов помогать", "готов выполнить"). Используй конкретные глаголы ("найду", "сделаю", "подскажу"). Отвечай строго по существу реплики пользователя. Не задавай в каждом сообщении навязчивые дежурные вопросы о планах или задачах. Если пользователь пишет короткие фразы ("Привет", "Как дела"), отвечай кратко, естественно и спокойно, без шаблонных вопросов. Отвечай лаконично и по делу. Всегда отвечай ТОЛЬКО на русском языке. Термины переводи или транслитерируй. Пользователь общается голосом — понимай живую речь.\n' + getSystemDateTimeContext() + antiReasoningRule + TASK_SYSTEM_PROMPT_RULE + memoryPrompt;
  const extraSysDirectives = (context || []).filter(m => m?.role === 'system' && m?.content).map(m => m.content).join('\n');
  const systemPrompt = baseSystemPrompt + (extraSysDirectives ? '\n' + extraSysDirectives : '') + (isFreeLLM ? '' : '\n' + toolsPrompt);

  const keyRes = secretVault.resolveProviderApiKey(provider.id, provider.apiKey);
  if (keyRes.value === null && provider.type === 'cloud' && !provider.noAuthHeader && !isFreeLLM) {
    const errMsg = keyRes.status === 'unreadable'
      ? `[${provider.name}] Ключ API повреждён или зашифрован под другим профилем Windows (DPAPI). Введите ключ заново в Настройках.`
      : `[${provider.name}] Ключ API не задан. Укажите ключ в Настройках провайдера.`;
    const keyErr: any = new Error(errMsg);
    keyErr.code = keyRes.status === 'unreadable' ? 'SECRET_UNREADABLE' : 'SECRET_MISSING';
    throw keyErr;
  }

  const cleanRawKey = (keyRes.value || '').trim();
  const availableKeys = cleanRawKey
    .split(/[\n,;]+/)
    .map(k => k.trim().replace(/^["']|["']$/g, ''))
    .filter(k => k.length > 3 && !k.startsWith('enc:') && !k.startsWith('b64:'));
  const keysToTry = availableKeys.length > 0
    ? (isFreeLLM && !availableKeys.includes('') ? [...availableKeys, ''] : availableKeys)
    : (cleanRawKey ? [cleanRawKey.replace(/^["']|["']$/g, '')] : (isFreeLLM && !provider.noAuthHeader ? ['', 'free'] : ['']));

  const contextChatMsgs = (context || []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0);
  const rawHistory = contextChatMsgs
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .map(m => ({ role: m.role, content: m.content }));
  if (rawHistory.length > 0 && rawHistory[rawHistory.length - 1].role === 'user' && rawHistory[rawHistory.length - 1].content.trim() === text.trim()) {
    rawHistory.pop();
  }
  let messages: any[] = [{ role: 'system', content: systemPrompt }, ...rawHistory.slice(-10), { role: 'user', content: text }];

  const rawMaxTokens = provider.maxTokens && provider.maxTokens > 0 ? provider.maxTokens : 2048;
  const maxTokens = isFreeLLM && rawMaxTokens > 4096 ? 4096 : rawMaxTokens;
  const temperature = provider.temperature ?? 0.7;
  const isStreamingEnabled = Boolean(settings?.llmStreamingEnabled ?? true);
  const isOpenRouter = endpointLower.includes('openrouter');
  const chatUrl = resolveChatEndpoint(provider.endpoint);

  let targetModel = provider.model;
  if (!targetModel || targetModel === 'auto') {
    targetModel = isOpenRouter ? 'openrouter/auto' : isFreeLLM ? 'auto' : (provider.selectedModels?.find(m => m !== 'auto') || 'gpt-4o');
  }

  const basePayload = {
    model: targetModel,
    max_tokens: maxTokens,
    temperature,
    ...(isOpenRouter ? { include_reasoning: false } : {})
  };

  let lastKeyErr: any = null;
  const httpAgent = new http.Agent({ keepAlive: true });
  const httpsAgent = new https.Agent({ keepAlive: true });

  const postWithRetry = async (url: string, data: any, config: any, maxRetries = 2) => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await axios.post(url, data, config);
      } catch (err: any) {
        if (abortController.signal.aborted) throw err;
        const isSocketOrNetErr = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ERR_NETWORK'].includes(err.code) ||
          (err.message && /socket hang up|network error/i.test(err.message));
        if (isSocketOrNetErr && attempt < maxRetries) {
          attempt++;
          await new Promise(resolve => setTimeout(resolve, 300 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Max retries reached');
  };

  const isLocalOrCustom = provider.type === 'local' || isFreeLLM ||
    Boolean(endpointLower.includes('127.0.0.1') || endpointLower.includes('localhost'));
  const hardTimeoutMs = isLocalOrCustom ? 90000 : 45000;
  const abortController = new AbortController();
  if (parentSignal) {
    if (parentSignal.signal?.aborted) abortController.abort();
    else parentSignal.signal?.addEventListener?.('abort', () => { try { abortController.abort(); } catch {} }, { once: true });
  }
  let isHardTimeout = false;
  const hardTimeoutId = setTimeout(() => {
    isHardTimeout = true;
    try { abortController.abort(); } catch (e) {}
  }, hardTimeoutMs);

  try {
    for (let kIdx = 0; kIdx < keysToTry.length; kIdx++) {
      const currentKey = keysToTry[kIdx];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': isStreamingEnabled ? 'text/event-stream, application/json' : 'application/json',
        'User-Agent': 'ARC-Assistant/1.0'
      };
      
      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://github.com/arc-assistant';
        headers['X-Title'] = 'A.R.C. Assistant';
      }
      
      if (!provider.noAuthHeader && currentKey && !currentKey.startsWith('enc:') && !currentKey.startsWith('b64:')) {
        headers['Authorization'] = `Bearer ${currentKey}`;
        headers['x-api-key'] = currentKey;
      }

      const requestTimeout = isFreeLLM ? 45000 : (isLocalOrCustom ? 45000 : 30000);
      const baseAxiosConfig = {
        headers,
        httpAgent,
        httpsAgent,
        signal: abortController.signal,
        timeout: requestTimeout
      };

      try {
        let streamedToClient = '';
        if (isStreamingEnabled) {
          try {
            let streamResponse: any;
            try {
              streamResponse = await postWithRetry(chatUrl, { ...basePayload, messages, stream: true }, { ...baseAxiosConfig, responseType: 'stream' });
            } catch (err: any) {
              if (err.response?.status === 400) {
                messages = [...rawHistory.slice(-6), { role: 'user', content: `[Инструкция: ${systemPrompt}]\n\n${text}` }];
                streamResponse = await postWithRetry(chatUrl, { ...basePayload, messages, stream: true }, { ...baseAxiosConfig, responseType: 'stream' });
              } else {
                throw err;
              }
            }

            let accumulatedText = '';
            let isPotentialTool = false;
            let toolBuffer = '';
            const thinkingFilter = new StreamingThinkingFilter();

            const parsedResult = await parseSseStream(
              streamResponse.data,
              (delta, isDone) => {
                if (isDone) return;
                accumulatedText += delta;
                thinkingFilter.processChunk(delta, (cleanDelta) => {
                  if (!isPotentialTool && accumulatedText.length < 50) {
                    const trimmed = accumulatedText.trim();
                    if (trimmed.startsWith('<tool_call>') || trimmed.startsWith('{"name"') || trimmed.startsWith('{"tool"')) {
                      isPotentialTool = true;
                    }
                  }
                  if (!isPotentialTool) {
                    streamedToClient += cleanDelta;
                    callback(cleanDelta, false);
                  } else toolBuffer += cleanDelta;
                });
              },
              abortController.signal
            );

            thinkingFilter.finalize((cleanDelta) => {
              if (!isPotentialTool) {
                streamedToClient += cleanDelta;
                callback(cleanDelta, false);
              } else toolBuffer += cleanDelta;
            });

            const fullResponse = stripThinkingProcess(parsedResult.fullText);
            const parsedToolCall = parseToolCall(fullResponse);

            if (parsedToolCall.isToolCall) {
              await handleToolExecution(parsedToolCall, fullResponse, messages, provider, maxTokens, temperature, headers, abortController, callback, true);
            } else {
              if (isPotentialTool && toolBuffer) callback(toolBuffer, false);
              if (!fullResponse || !fullResponse.trim()) {
                throw new Error('EMPTY_RESPONSE');
              }
              callback('', true, false);
            }
            return;
          } catch (streamErr: any) {
            if (!isLocalOrCustom || parentSignal?.signal?.aborted || isHardTimeout) {
              throw streamErr;
            }
            if (streamedToClient.trim().length >= 80) {
              callback('', true, false);
              return;
            }
            console.warn(`[OpenAI Provider] Streaming failed on local/FreeLLM gateway (${streamErr?.message || streamErr}), falling back to stream: false...`);
          }
        }

        let response: any;
        try {
          response = await postWithRetry(chatUrl, {
            ...basePayload,
            messages,
            stream: false
          }, {
            ...baseAxiosConfig
          });
        } catch (err: any) {
          const errorDetail = err.response?.data?.error?.message || err.response?.data?.error || '';
          if (err.response?.status === 400 && typeof errorDetail === 'string' && /system/i.test(errorDetail)) {
            messages = [
              ...historyMessages,
              { role: 'user', content: `[Инструкция: ${systemPrompt}]\n\n${text}` }
            ];
            response = await postWithRetry(chatUrl, {
              ...basePayload,
              messages,
              stream: false
            }, {
              ...baseAxiosConfig
            });
          } else {
            throw err;
          }
        }

        const resData = response.data;
        if (typeof resData === 'string' && (resData.trim().startsWith('<') || resData.includes('<!DOCTYPE'))) {
          throw new Error(`Эндпоинт ${provider.name} вернул веб-страницу (HTML) вместо JSON API.`);
        }
        if (resData?.error) {
          throw new Error(`[${provider.name}] Ошибка: ${resData.error?.message || JSON.stringify(resData.error)}`);
        }
        const rawResponseText = resData?.choices?.[0]?.message?.content ?? resData?.choices?.[0]?.text ?? '';
        const responseText = stripThinkingProcess(rawResponseText);
        const parsedToolCall = parseToolCall(responseText);
        
        if (parsedToolCall.isToolCall) {
          await handleToolExecution(parsedToolCall, responseText, messages, provider, maxTokens, temperature, headers, abortController, callback, false);
        } else {
          if (!responseText || !responseText.trim()) {
            throw new Error('EMPTY_RESPONSE');
          }
          const finalOut = streamedToClient && responseText.startsWith(streamedToClient) ? responseText.slice(streamedToClient.length) : responseText;
          callback(finalOut, true, false);
        }
        return;
      } catch (err: any) {
        if (isHardTimeout) {
          throw new Error(`timeout (${hardTimeoutMs}ms hard limit exceeded)`);
        }
        lastKeyErr = err;
        const status = err.response?.status;
        if ((status === 401 || status === 403 || status === 429 || status === 402) && kIdx < keysToTry.length - 1) {
          console.warn(`[OpenAI Provider] Key ${kIdx + 1}/${keysToTry.length} failed (${status}). Trying backup key ${kIdx + 2}...`);
          continue;
        }
        throw err;
      }
    }
  } finally {
    clearTimeout(hardTimeoutId);
  }

  if (lastKeyErr) throw lastKeyErr;
}
