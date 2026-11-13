export function generateMockChunks(duration: number): { text: string; startSec: number; endSec: number }[] {
  const phrases = ["Это", "пример", "распознанного", "текста", "из", "заглушки."];
  const chunks = [];
  let currentSec = 0.0;
  let i = 0;
  while (currentSec < duration && i < phrases.length * 3) {
    const startSec = currentSec;
    const endSec = Math.min(startSec + 1.5, duration);
    chunks.push({ 
      text: phrases[i % phrases.length], 
      startSec, 
      endSec 
    });
    currentSec = endSec;
    i++;
  }
  return chunks;
}

export function getMockTranscriptionHandlers() {
  return {
    transcriptionCheckModel: async (data: { modelName: string }) => {
      const isDownloaded = (window as any)._mockDownloadedModels?.has(data.modelName) ?? true;
      return {
        modelName: data.modelName,
        isDownloaded,
        sizeFormatted: '142 MB',
        path: '/mock/path/' + data.modelName
      };
    },
    transcriptionDownloadModel: async (data: { modelName: string }) => {
      const callbacks = (window as any)._mockDownloadProgressCallbacks || [];
      for (let p = 10; p <= 100; p += 30) {
        await new Promise(r => setTimeout(r, 80));
        callbacks.forEach((cb: any) => cb({ modelName: data.modelName, progress: p, status: 'downloading' }));
      }
      callbacks.forEach((cb: any) => cb({ modelName: data.modelName, progress: 100, status: 'ready' }));
      if (!(window as any)._mockDownloadedModels) (window as any)._mockDownloadedModels = new Set();
      (window as any)._mockDownloadedModels.add(data.modelName);
      return { success: true };
    },
    transcriptionTranscribeWhisper: async (data: { modelName: string; samples: Float32Array }) => {
      const duration = Math.max(2, Math.min(30, (data.samples?.length || 16000) / 16000));
      const chunks = generateMockChunks(duration);
      return {
        success: true,
        result: {
          text: chunks.map(c => c.text).join(' '),
          chunks: chunks.map(c => ({ timestamp: [c.startSec, c.endSec], text: c.text }))
        }
      };
    },
    transcriptionSendAudioChunk: async () => ({ success: true }),
    transcriptionTranscribeWhisperChunked: async () => {
      const chunks = generateMockChunks(15);
      return {
        success: true,
        result: {
          text: chunks.map(c => c.text).join(' '),
          chunks: chunks.map(c => ({ timestamp: [c.startSec, c.endSec], text: c.text }))
        }
      };
    },
    transcriptionTranscribeGemini: async () => {
      const chunks = generateMockChunks(15);
      return {
        success: true,
        text: chunks.map(c => `[${c.startSec.toFixed(1)} - ${c.endSec.toFixed(1)}]: ${c.text}`).join('\n')
      };
    },
    transcriptionCancel: async () => {
      (window as any)._mockTranscriptionCancelled = true;
      return { success: true };
    },
    onTranscriptionDownloadProgress: (callback: any) => {
      if (!(window as any)._mockDownloadProgressCallbacks) (window as any)._mockDownloadProgressCallbacks = [];
      (window as any)._mockDownloadProgressCallbacks.push(callback);
      return () => {
        (window as any)._mockDownloadProgressCallbacks = 
          ((window as any)._mockDownloadProgressCallbacks || []).filter((cb: any) => cb !== callback);
      };
    },
    onTranscriptionChunk: (callback: any) => {
      if (!(window as any)._mockChunkCallbacks) (window as any)._mockChunkCallbacks = [];
      (window as any)._mockChunkCallbacks.push(callback);
      return () => {
        (window as any)._mockChunkCallbacks = 
          ((window as any)._mockChunkCallbacks || []).filter((cb: any) => cb !== callback);
      };
    }
  };
}
