import { ipcMain } from 'electron';
import { builtInWhisperService } from '../services/built-in-whisper.service';
import { GoogleGenAI } from '@google/genai';
import { providerManager } from '../services/llm/providers/provider-manager';

export function registerTranscriptionIpc() {
  // Check if a specific Whisper model is downloaded
  ipcMain.handle('transcription:check-whisper-model', async (event, { modelName }) => {
    try {
      return await builtInWhisperService.isModelDownloaded(modelName);
    } catch (err: any) {
      console.error('[Transcription-IPC] Error checking Whisper model:', err);
      return false;
    }
  });

  // Download a Whisper model with progress tracking
  ipcMain.handle('transcription:download-whisper-model', async (event, { modelName, device }) => {
    try {
      await builtInWhisperService.downloadModel(modelName, (loaded, total, file) => {
        event.sender.send('transcription:download-progress', {
          modelName,
          bytes_done: loaded,
          total_bytes: total,
          filename: file
        });
      }, device || 'cpu');
      return { success: true };
    } catch (err: any) {
      console.error('[Transcription-IPC] Error downloading Whisper model:', err);
      return { success: false, error: err.message || err };
    }
  });

  // Transcribe audio using local Whisper model
  ipcMain.handle('transcription:transcribe-whisper', async (event, { modelName, samples, device }) => {
    try {
      console.log(`[Transcription-IPC] Requesting local Whisper transcription with model ${modelName} on device ${device || 'cpu'}...`);
      const result = await builtInWhisperService.transcribe(modelName, samples, device || 'cpu', (chunk) => {
        event.sender.send('transcription:chunk', chunk);
      });
      return { success: true, result };
    } catch (err: any) {
      console.error('[Transcription-IPC] Local Whisper transcription failed:', err);
      return { success: false, error: err.message || err };
    }
  });

  const sessionBuffers = new Map<string, Uint8Array>();
  const MAX_BUFFER_SIZE_BYTES = 100 * 1024 * 1024; // 100MB limit per audio session
  const MAX_SESSIONS = 10;

  ipcMain.handle('transcription:send-audio-chunk', async (event, { sessionId, chunk, offset, totalSize }) => {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        return { success: false, error: 'Invalid sessionId' };
      }
      if (typeof totalSize !== 'number' || totalSize <= 0 || totalSize > MAX_BUFFER_SIZE_BYTES) {
        return { success: false, error: `Invalid totalSize. Must be positive and <= ${MAX_BUFFER_SIZE_BYTES / (1024*1024)}MB` };
      }

      if (!sessionBuffers.has(sessionId)) {
        if (sessionBuffers.size >= MAX_SESSIONS) {
          // Evict oldest session
          const oldest = sessionBuffers.keys().next().value;
          if (oldest) sessionBuffers.delete(oldest);
        }
        sessionBuffers.set(sessionId, new Uint8Array(totalSize));
      }
      const buffer = sessionBuffers.get(sessionId)!;
      const chunkData = new Uint8Array(chunk);
      if (offset + chunkData.length > buffer.length) {
        return { success: false, error: 'Chunk offset out of bounds' };
      }
      buffer.set(chunkData, offset);
      return { success: true };
    } catch (err: any) {
      console.error('[Transcription-IPC] Error receiving audio chunk:', err);
      return { success: false, error: err.message || err };
    }
  });

  ipcMain.handle('transcription:transcribe-whisper-chunked', async (event, { modelName, sessionId, device }) => {
    try {
      const buffer = sessionBuffers.get(sessionId);
      if (!buffer) {
        throw new Error(`Audio buffer for session ${sessionId} not found`);
      }
      
      // Convert the concatenated Uint8Array back to Float32Array
      // The array comes from the Float32Array's underlying ArrayBuffer
      const samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
      
      // Clean up memory
      sessionBuffers.delete(sessionId);

      console.log(`[Transcription-IPC] Requesting chunked local Whisper transcription with model ${modelName} on device ${device || 'cpu'}...`);
      const result = await builtInWhisperService.transcribe(modelName, samples, device || 'cpu', (chunk) => {
        event.sender.send('transcription:chunk', chunk);
      });
      return { success: true, result };
    } catch (err: any) {
      console.error('[Transcription-IPC] Chunked local Whisper transcription failed:', err);
      return { success: false, error: err.message || err };
    }
  });

  // Cancel/Abort current active transcription
  ipcMain.handle('transcription:cancel', async () => {
    try {
      console.log('[Transcription-IPC] Request to cancel/abort transcription received.');
      builtInWhisperService.abort();
      return { success: true };
    } catch (err: any) {
      console.error('[Transcription-IPC] Cancel failed:', err);
      return { success: false, error: err.message || err };
    }
  });

  // Transcribe audio using multimodal Gemini model
  ipcMain.handle('transcription:transcribe-gemini', async (event, { base64Data, mimeType }) => {
    try {
      const config = providerManager.resolveMultimodalGeminiConfig();
      if (!config.apiKey.value) {
        if (config.apiKey.status === 'unreadable') {
          throw new Error('Ключ API GEMINI_API_KEY повреждён или зашифрован под другим профилем Windows (DPAPI). Пожалуйста, введите его заново в Settings > Secrets.');
        }
        throw new Error('Ключ API GEMINI_API_KEY не задан в параметрах системы. Пожалуйста, добавьте его в панель Settings > Secrets.');
      }

      console.log(`[Transcription-IPC] Requesting ${config.model} cloud transcription...`);
      const ai = new GoogleGenAI({
        apiKey: config.apiKey.value,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Транскрибируй это аудио на русском языке. Обязательно добавь временные метки (timeline) в формате [минуты:секунды - минуты:секунды] для каждой фразы, разделяя текст на логические/смысловые блоки для удобного чтения. Будь максимально точен, сохрани все речевые нюансы. Не добавляй никаких лишних предисловий или технических комментариев, верни только красиво отформатированный текст с таймлайнами.`;

      const response = await ai.models.generateContent({
        model: config.model,
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          prompt
        ]
      });

      const text = response.text || '';
      if (!text) {
        throw new Error('От Gemini пришел пустой ответ.');
      }

      return { success: true, text };
    } catch (err: any) {
      console.error('[Transcription-IPC] Gemini transcription failed:', err);
      return { success: false, error: err.message || err };
    }
  });
}
