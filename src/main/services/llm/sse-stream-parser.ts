import { Readable } from 'stream';

export interface ParsedStreamResult {
  fullText: string;
  toolCalls?: any[];
  finishReason?: string;
}

/**
 * Parses Server-Sent Events (SSE) stream from OpenAI-compatible LLM endpoints.
 * Handles broken JSON boundaries, tool_calls accumulation, and graceful stream completion.
 */
export async function parseSseStream(
  stream: Readable,
  onChunk: (deltaText: string, isDone: boolean) => void,
  abortSignal?: AbortSignal
): Promise<ParsedStreamResult> {
  let buffer = '';
  let rawBody = '';
  let fullText = '';
  const toolCallsAcc: Record<number, { id?: string; type?: string; function: { name?: string; arguments: string } }> = {};
  let finishReason = '';

  const processDataPayload = (dataStr: string) => {
    if (!dataStr || dataStr === '[DONE]') return;
    try {
      const parsed = JSON.parse(dataStr);
      const choice = parsed.choices?.[0];
      if (!choice) {
        const directText = typeof parsed.response === 'string' ? parsed.response : (typeof parsed.content === 'string' ? parsed.content : '');
        if (directText) {
          fullText += directText;
          onChunk(directText, false);
        }
        return;
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta = choice.delta;
      const chunkContent =
        delta?.content ??
        (typeof choice.message?.content === 'string' ? choice.message.content : undefined) ??
        (typeof choice.text === 'string' ? choice.text : undefined);

      if (chunkContent) {
        fullText += chunkContent;
        onChunk(chunkContent, false);
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsAcc[idx]) {
            toolCallsAcc[idx] = {
              id: tc.id || '',
              type: tc.type || 'function',
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || ''
              }
            };
          } else {
            if (tc.id) toolCallsAcc[idx].id = tc.id;
            if (tc.function?.name) {
              toolCallsAcc[idx].function.name = (toolCallsAcc[idx].function.name || '') + tc.function.name;
            }
            if (tc.function?.arguments) {
              toolCallsAcc[idx].function.arguments += tc.function.arguments;
            }
          }
        }
      }
    } catch {
      // Incomplete or non-JSON chunk
    }
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) return;
    if (line.startsWith('data:')) {
      processDataPayload(line.slice(5).trim());
    }
  };

  if (!stream || typeof (stream as any).on !== 'function') {
    if (typeof stream === 'string') {
      for (const rawLine of (stream as string).split('\n')) processLine(rawLine);
      if (!fullText && (stream as string).trim().startsWith('{')) processDataPayload((stream as string).trim());
    } else if (stream && typeof stream === 'object') {
      processDataPayload(JSON.stringify(stream));
    }
    const finalToolCalls = Object.values(toolCallsAcc);
    onChunk('', true);
    return {
      fullText,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      finishReason
    };
  }

  return new Promise<ParsedStreamResult>((resolve, reject) => {
    const cleanup = () => {
      if (typeof stream.removeAllListeners === 'function') stream.removeAllListeners();
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        stream.destroy();
        return reject(new Error('Stream aborted'));
      }
      abortSignal.addEventListener('abort', () => {
        stream.destroy();
        reject(new Error('Stream aborted'));
      }, { once: true });
    }

    stream.on('data', (chunk: Buffer | string) => {
      const str = chunk.toString('utf-8');
      rawBody += str;
      buffer += str;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const rawLine of lines) {
        processLine(rawLine);
      }
    });

    stream.on('end', () => {
      cleanup();
      if (buffer.trim()) {
        processLine(buffer);
        buffer = '';
      }
      // Fallback: if gateway ignored stream:true and returned a standard JSON body without "data:" prefix
      if (!fullText && rawBody.trim().startsWith('{')) {
        processDataPayload(rawBody.trim());
      }
      const finalToolCalls = Object.values(toolCallsAcc);
      onChunk('', true);
      resolve({
        fullText,
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        finishReason
      });
    });

    stream.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}
