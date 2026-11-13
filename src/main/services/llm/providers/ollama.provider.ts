import axios from 'axios';
import { memoryManager } from '../../memory/memory-manager';
import { ToolDispatcher } from '../../tools/tool-dispatcher';
import { ttsService } from '../../tts.service';
import type { AiProvider } from './provider.interface';
import { getToolsPrompt, parseToolCall } from '../tools-utils';
import { stripThinkingProcess, StreamingThinkingFilter } from '../thinking-cleaner';
import { buildAssistantSystemPrompt } from '../prompt-builder';
import { kvPrefillService } from '../kv-prefill.service';

function parseOllamaNdjsonStream(
  stream: any,
  onToken: (token: string, isDone: boolean) => void,
  abortController: AbortController,
  idleTimeoutMs = 30000
): Promise<{ fullRaw: string }> {
  return new Promise((resolve, reject) => {
    let lineBuffer = '';
    let fullRaw = '';
    let finished = false;
    let idleTimer: NodeJS.Timeout | null = null;

    const clearIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const resetIdle = () => {
      clearIdle();
      idleTimer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { abortController.abort(); } catch {}
          reject(new Error('Ollama stream idle timeout (30s)'));
        }
      }, idleTimeoutMs);
    };

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj.response === 'string' && obj.response.length > 0) {
          fullRaw += obj.response;
          onToken(obj.response, false);
        }
        if (obj.done === true && !finished) {
          finished = true;
          clearIdle();
          onToken('', true);
          resolve({ fullRaw });
        }
      } catch {
        // Ignore malformed partial line
      }
    };

    resetIdle();

    stream.on('data', (chunk: Buffer | string) => {
      if (finished) return;
      resetIdle();
      lineBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        processLine(line);
        if (finished) return;
      }
    });

    stream.on('end', () => {
      if (finished) return;
      clearIdle();
      if (lineBuffer.trim()) {
        processLine(lineBuffer);
      }
      if (!finished) {
        finished = true;
        onToken('', true);
        resolve({ fullRaw });
      }
    });

    stream.on('error', (err: any) => {
      if (finished) return;
      finished = true;
      clearIdle();
      reject(err);
    });
  });
}

async function runToolExecution(
  parsedToolCall: ReturnType<typeof parseToolCall>,
  responseText: string,
  fullPrompt: string,
  endpointUrl: string,
  provider: AiProvider,
  abortController: AbortController,
  callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
  alreadyStreamedPrefix: boolean
) {
  const toolDispatcher = ToolDispatcher.getInstance();
  let beforeText = parsedToolCall.responseTextBeforeTool.trim();
  if (parsedToolCall.toolName === 'wikipedia' && !beforeText) {
    beforeText = "Минуту, уточняю в энциклопедии...";
  }
  if (beforeText && !alreadyStreamedPrefix) {
    callback(beforeText + ' ', false, true);
  }
  callback('', false, true);

  if (parsedToolCall.toolName === 'wikipedia') {
    try {
      await ttsService.speakAndWait(beforeText || "Минуту, уточняю в энциклопедии...", 5000);
    } catch (e: any) {
      console.error("Failed to speak interim:", e?.message || e);
    }
  }

  try {
    const toolExecResult = await toolDispatcher.executeTool(parsedToolCall.toolName, parsedToolCall.params);
    let count = 1;
    let actualTool = parsedToolCall.toolName;
    let toolResult = '';

    if (toolExecResult && toolExecResult.data) {
      if (Array.isArray(toolExecResult.data)) {
        count = toolExecResult.data.length;
      } else if (toolExecResult.data.results && Array.isArray(toolExecResult.data.results)) {
        count = toolExecResult.data.results.length;
      } else if (typeof toolExecResult.data === 'string' && toolExecResult.data.includes('не найдено')) {
        count = 0;
      }
      if (toolExecResult.data.source === 'web_search_fallback' || (toolExecResult as any).source === 'web_search_fallback') {
        actualTool = 'web_search';
      }
      toolResult = toolDispatcher.formatResult(toolExecResult.data);
    } else if (toolExecResult && toolExecResult.error) {
      toolResult = `Error: ${toolExecResult.error}`;
      count = 0;
    } else {
      toolResult = JSON.stringify(toolExecResult);
    }
    const followUpPrompt = `${fullPrompt}\nA.R.C.: ${responseText}\nСистема: Результат поиска:\n${toolResult}\n\nСформулируй краткий и точный ответ на основе этих данных.`;

    const finalResponse = await axios.post(endpointUrl, {
      model: provider.model,
      prompt: followUpPrompt,
      stream: false,
      options: {
        num_predict: provider.maxTokens,
        temperature: provider.temperature
      }
    }, {
      signal: abortController.signal,
      timeout: 30000
    });

    const finalResponseText = stripThinkingProcess(finalResponse.data.response || '');
    const toolSource = {
      tool: actualTool,
      count
    };
    callback(finalResponseText, true, false, toolSource);
  } catch {
    callback(`К сожалению, поиск информации не удался.`, true, false);
  }
}

export async function executeOllamaRequest(
  provider: AiProvider, 
  text: string, 
  context: any[], 
  abortController: AbortController, 
  callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
  settings?: any
) {
  const hasToolContext = Array.isArray(context) && context.some(c => c && c.role === 'tool');
  const prefillEnv = !hasToolContext ? kvPrefillService.consumeOllamaPrefillEnvelope(text, provider.model) : null;
  let systemPrompt = prefillEnv?.systemPrompt || '';
  let fullPrompt = '';

  if (prefillEnv) {
    fullPrompt = `${prefillEnv.basePromptPrefix}Пользователь: ${text}`;
  } else {
    const memoryContext = await memoryManager.enrichContext(text);
    await memoryManager.getContextMessages();
    const toolDefs = ToolDispatcher.getInstance().getToolDefinitions();
    const toolsPrompt = getToolsPrompt(toolDefs);
    let memoryPrompt = '';
    if (memoryContext.relevantFacts.length > 0 || memoryContext.userPreferences.length > 0) {
      memoryPrompt = '\n\n[Память пользователя]\n' +
        memoryContext.relevantFacts.map(f => `- ${f.value}`).join('\n') + '\n' +
        memoryContext.userPreferences.map(p => `- ${p.value}`).join('\n');
    }
    systemPrompt = buildAssistantSystemPrompt({ customSystemPrompt: settings?.systemPrompt, memoryPrompt, toolsPrompt });
    fullPrompt = `${systemPrompt}\n\n`;
    const dialogHistory = (context || []).filter(c => c && (c.role === 'user' || c.role === 'assistant') && typeof c.content === 'string' && c.content.trim().length > 0);
    for (let i = 0; i < dialogHistory.length; i++) {
      const m = dialogHistory[i];
      if (i === dialogHistory.length - 1 && m.role === 'user' && m.content.trim() === text.trim()) continue;
      fullPrompt += `${m.role === 'user' ? 'Пользователь' : 'A.R.C.'}: ${m.content}\n`;
    }
    if (context && context.length > 0) {
      for (const c of context) {
        if (c.role === 'system') fullPrompt += `[Системная информация]: ${c.content}\n`;
        else if (c.role === 'tool') fullPrompt += `[Результат инструмента ${c.name}]: ${c.content}\n`;
      }
    }
    fullPrompt += `Пользователь: ${text}`;
  }

  let endpointUrl = provider.endpoint;
  if (endpointUrl.includes('localhost:11434')) {
    endpointUrl = endpointUrl.replace('localhost:11434', '127.0.0.1:11434');
  }

  const isStreamingEnabled = settings?.streamingEnabled !== false;

  if (isStreamingEnabled) {
    try {
      const streamRes = await axios.post(endpointUrl, {
        model: provider.model,
        prompt: fullPrompt,
        system: systemPrompt,
        stream: true,
        options: {
          num_predict: provider.maxTokens,
          temperature: provider.temperature
        }
      }, {
        responseType: 'stream',
        signal: abortController.signal,
        timeout: 0
      });

      if (streamRes.data && typeof streamRes.data.on === 'function') {
        const thinkingFilter = new StreamingThinkingFilter();
        let fullCleanText = '';
        let suppressOutput = false;
        let toolBuffer = '';
        let hasEmittedUserChunk = false;

        const handleCleanDelta = (cleanDelta: string) => {
          if (!cleanDelta) return;
          fullCleanText += cleanDelta;
          const trimmedClean = fullCleanText.trim();
          if (
            !suppressOutput &&
            (trimmedClean.startsWith('TOOL:') ||
              trimmedClean.startsWith('<|tool_call_start|>') ||
              trimmedClean.startsWith('<tool_call>') ||
              trimmedClean.startsWith('{"name"') ||
              trimmedClean.startsWith('{"tool"') ||
              cleanDelta.includes('TOOL:') ||
              cleanDelta.includes('<|tool_call_start|>') ||
              cleanDelta.includes('<tool_call>') ||
              cleanDelta.includes('{"tool"'))
          ) {
            suppressOutput = true;
            const markerIdx = cleanDelta.search(/TOOL:|<\|tool_call_start\|>|<tool_call>|\{"(?:name|tool)"/);
            if (markerIdx > 0) {
              const prefix = cleanDelta.slice(0, markerIdx);
              hasEmittedUserChunk = true;
              callback(prefix, false);
              toolBuffer += cleanDelta.slice(markerIdx);
              return;
            }
          }
          if (!suppressOutput) {
            hasEmittedUserChunk = true;
            callback(cleanDelta, false);
          } else {
            toolBuffer += cleanDelta;
          }
        };

        await parseOllamaNdjsonStream(
          streamRes.data,
          (token, isDone) => {
            if (isDone) return;
            thinkingFilter.processChunk(token, handleCleanDelta);
          },
          abortController,
          30000
        );

        thinkingFilter.finalize(handleCleanDelta);

        const finalCleaned = stripThinkingProcess(fullCleanText);
        const parsedToolCall = parseToolCall(finalCleaned);

        if (parsedToolCall.isToolCall) {
          await runToolExecution(
            parsedToolCall,
            finalCleaned,
            fullPrompt,
            endpointUrl,
            provider,
            abortController,
            callback,
            hasEmittedUserChunk
          );
        } else {
          if (suppressOutput && toolBuffer) {
            callback(toolBuffer, false);
          }
          callback('', true, false);
        }
        return;
      }
    } catch (streamErr: any) {
      const status = streamErr?.response?.status;
      if (abortController.signal.aborted && streamErr?.message !== 'Ollama stream idle timeout (30s)') {
        throw streamErr;
      }
      if (status !== 400 && status !== 415 && streamErr?.message === 'Ollama stream idle timeout (30s)') {
        throw streamErr;
      }
      console.warn(`[Ollama Provider] Streaming failed (${status || streamErr?.message || streamErr}), falling back to stream: false...`);
    }
  }

  const response = await axios.post(endpointUrl, {
    model: provider.model,
    prompt: fullPrompt,
    system: systemPrompt,
    stream: false,
    options: {
      num_predict: provider.maxTokens,
      temperature: provider.temperature
    }
  }, { 
    signal: abortController.signal,
    timeout: 30000
  });

  const responseText = stripThinkingProcess(response.data?.response || '');
  const parsedToolCall = parseToolCall(responseText);
  
  if (parsedToolCall.isToolCall) {
    await runToolExecution(
      parsedToolCall,
      responseText,
      fullPrompt,
      endpointUrl,
      provider,
      abortController,
      callback,
      false
    );
  } else {
    callback(responseText, true, false);
  }
}

