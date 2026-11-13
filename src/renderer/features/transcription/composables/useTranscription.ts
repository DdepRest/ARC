import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';

// Keep needed imports
import { 
  FileAudio, 
  Upload, 
  Check, 
  Sparkles, 
  Download, 
  RefreshCw, 
  Save, 
  Clock, 
  AlertCircle, 
  Mic, 
  Activity,
  Cpu,
  Zap,
  Info,
  AlertTriangle
} from 'lucide-vue-next';

export function useTranscription() {


interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

interface ModelItem {
  id: string;
  name: string;
  badge: string;
  badgeClass: string;
  size: string;
  isCloud: boolean;
  description: string;
}

// State
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const audioUrl = ref<string>('');
const audioDuration = ref<number>(0);
const cloudGeminiModelId = ref<string>('gemini-2.5-flash');
const hasGeminiKey = ref<boolean>(true);
const selectedModelId = ref<string>(cloudGeminiModelId.value);
const errorMessage = ref<string>('');

// Hardware Acceleration settings
const selectedDevice = ref<string>('cpu');
const gpuName = ref<string>('ОБНАРУЖЕНИЕ...');
const gpuWarningActive = ref<boolean>(false);
const gpuWarningMessage = ref<string>('');

const setDevice = (device: string) => {
  selectedDevice.value = device;
  gpuWarningActive.value = false;
  logToDebug('LOG', `[TranscriptionView] Переключен ускоритель инференса: ${device.toUpperCase()}`);
};

// Loading / Processing states
const isProcessing = ref(false);
const processStep = ref<'idle' | 'decoding' | 'uploading' | 'transcribing'>('idle');
const elapsedTimer = ref<number>(0);
const remainingTimer = ref<number>(0);
let timerInterval: any = null;

const showDebug = ref<boolean>(false);
const debugLogs = ref<string[]>([]);

const logToDebug = (level: string, ...args: any[]) => {
  const msg = args.map(a => {
    if (a instanceof Error) return a.message;
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  debugLogs.value.push(`[${time}] [${level}] ${msg}`);
  if (debugLogs.value.length > 200) {
    debugLogs.value.shift();
  }
};

// Download Models state
const modelDownloadedMap = ref<Record<string, boolean>>({
  'gemini-2.5-flash': true, // cloud, always ready
  'Xenova/whisper-tiny': false,
  'Xenova/whisper-base': false,
  'Xenova/whisper-small': false
});
const isDownloading = ref(false);
const activeDownloadModelId = ref<string>('');
const activeDownloadFile = ref<string>('');
const downloadPercentage = ref<number>(0);

// Audio Player state
const audioElement = ref<HTMLAudioElement | null>(null);
const playerCurrentTime = ref<number>(0);
const playerDuration = ref<number>(0);

// Transcript outputs
const transcriptText = ref<string>('');
const transcriptSegments = ref<TranscriptSegment[]>([]);
const transcriptSearch = ref<string>('');

// Models list (Worst to Best quality)
const models: ModelItem[] = [
  {
    id: 'Xenova/whisper-tiny',
    name: 'Whisper Tiny (Local)',
    badge: 'СЛАБАЯ ТОЧНОСТЬ // WORST',
    badgeClass: 'text-[var(--status-err)] border border-[var(--arc-hairline)]',
    size: '~75 MB',
    isCloud: false,
    description: 'Самая маленькая локальная модель. Моментальное скачивание и сверхбыстрый запуск, но допускает много грамматических и смысловых ошибок на русском языке.'
  },
  {
    id: 'Xenova/whisper-base',
    name: 'Whisper Base (Local)',
    badge: 'СЛЕДУЮЩИЙ УРОВЕНЬ // MEDIUM',
    badgeClass: 'text-[var(--status-warn)] border border-[var(--arc-hairline)]',
    size: '~140 MB',
    isCloud: false,
    description: 'Сбалансированное локальное решение. Средняя точность распознавания русского языка, умеренное потребление процессорных ресурсов при обработке.'
  },
  {
    id: 'Xenova/whisper-small',
    name: 'Whisper Small (Local)',
    badge: 'ХОРОШАЯ ТОЧНОСТЬ // GOOD',
    badgeClass: 'text-[var(--accent)] border border-[var(--arc-hairline)]',
    size: '~460 MB',
    isCloud: false,
    description: 'Лучшая локальная модель. Очень высокая точность и понимание сложных русских фраз, но требует больше времени на первоначальное скачивание и мощный процессор.'
  },
  {
    id: cloudGeminiModelId.value,
    name: 'Gemini Flash (Cloud)',
    badge: 'НЕПРЕВЗОЙДЕННО // THE BEST',
    badgeClass: 'text-[var(--status-ok)] border border-[var(--arc-hairline)] font-bold',
    size: '0 MB',
    isCloud: true,
    description: 'Самая точная и продвинутая нейросеть. Моментальный анализ аудио любого формата за секунды, идеальная пунктуация и выделение говорящих без нагрузки на ваш компьютер.'
  }
];

const isCloudSelected = computed(() => {
  return selectedModelId.value === cloudGeminiModelId.value || Boolean(models.find(m => m.id === selectedModelId.value)?.isCloud);
});

// Computed estimates
const timeEstimate = computed(() => {
  if (!selectedFile.value) return '0 с.';
  const dur = audioDuration.value || 30; // fallback to 30s
  
  if (isCloudSelected.value) {
    return 'до 3-5 секунд';
  }

  // Factor depends on hardware accelerator: CUDA (fastest) ~0.2, DirectML ~0.35, CPU WASM ~1.0
  let speedFactor = 1.0;
  if (selectedDevice.value === 'cuda') {
    speedFactor = 0.2;
  } else if (selectedDevice.value === 'dml') {
    speedFactor = 0.35;
  } else {
    speedFactor = 1.0;
  }

  if (selectedModelId.value === 'Xenova/whisper-tiny') {
    return `~${Math.max(1, Math.round(dur * 0.15 * speedFactor))} секунд`;
  } else if (selectedModelId.value === 'Xenova/whisper-base') {
    return `~${Math.max(2, Math.round(dur * 0.35 * speedFactor))} секунд`;
  } else if (selectedModelId.value === 'Xenova/whisper-small') {
    return `~${Math.max(3, Math.round(dur * 1.1 * speedFactor))} секунд`;
  }
  return 'рассчитывается...';
});

const deviceInfo = computed(() => {
  if (selectedDevice.value === 'cuda') {
    return {
      title: 'УСКОРИТЕЛЬ: NVIDIA CUDA (TENSOR CORES)',
      activeDeviceName: gpuName.value && !gpuName.value.includes('ЦП') ? gpuName.value : 'NVIDIA GPU (CUDA Driver Active)',
      speedMultiplier: '30x – 50x ускорение',
      memoryUsage: 'VRAM ~1.2 - 2.5 GB',
      engine: 'ONNX Runtime (CUDA Execution Provider)',
      badgeText: 'МАКСИМАЛЬНАЯ СКОРОСТЬ',
      badgeClass: 'text-[var(--status-ok)] border border-[var(--arc-hairline)]',
      description: 'Используются аппаратные тензорные ядра NVIDIA GPU. Инференс модели выполняется с минимальной задержкой в фоновом GPU-потоке.',
      iconColor: 'text-[var(--status-ok)]'
    };
  } else if (selectedDevice.value === 'dml') {
    return {
      title: 'УСКОРИТЕЛЬ: DIRECTML (DIRECTX 12 GPU)',
      activeDeviceName: gpuName.value && !gpuName.value.includes('ЦП') ? gpuName.value : 'Универсальный GPU (DirectML)',
      speedMultiplier: '15x – 30x ускорение',
      memoryUsage: 'Shared VRAM ~1.0 - 2.0 GB',
      engine: 'ONNX Runtime (DirectML Execution Provider)',
      badgeText: 'УНИВЕРСАЛЬНЫЙ GPU',
      badgeClass: 'text-[var(--accent)] border border-[var(--arc-hairline)]',
      description: 'Ускорение через кросс-платформенный API DirectML (DirectX 12). Совместимо с видеокартами AMD Radeon, Intel Arc / Iris, Apple Silicon и NVIDIA.',
      iconColor: 'text-[var(--accent)]'
    };
  } else {
    return {
      title: 'УСКОРИТЕЛЬ: ЦП (WASM / CPU RUNTIME)',
      activeDeviceName: 'Центральный процессор (Multi-threaded WebAssembly)',
      speedMultiplier: '1x – 3x (Базовая скорость)',
      memoryUsage: 'RAM ~400 MB - 1.1 GB',
      engine: 'ONNX Runtime Web (WASM / SIMD execution)',
      badgeText: 'МАКСИМАЛЬНАЯ СОВМЕСТИМОСТЬ',
      badgeClass: 'text-[var(--status-warn)] border border-[var(--arc-hairline)]',
      description: 'Инференс выполняется силами стандартного процессора (CPU) через SIMD-ускоренный WebAssembly. Не требует наличия дискретной видеокарты и специализированных драйверов.',
      iconColor: 'text-[var(--status-warn)]'
    };
  }
});

const audioDurationFormatted = computed(() => {
  return formatTime(audioDuration.value);
});

const wordCount = computed(() => {
  if (!transcriptText.value) return 0;
  return transcriptText.value.split(/\s+/).filter(w => w.trim().length > 0).length;
});

const processStepText = computed(() => {
  switch (processStep.value) {
    case 'decoding': return 'ДЕКОДИРОВАНИЕ И ФИЛЬТРАЦИЯ АУДИОЧАСТОТ В PCM...';
    case 'uploading': return 'ПОДГОТОВКА И ОТПРАВКА ДАННЫХ ИИ...';
    case 'transcribing': return 'НЕЙРОННЫЙ СЕМАНТИЧЕСКИЙ АНАЛИЗ И СИНХРОНИЗАЦИЯ ТАЙМЛАЙНА...';
    default: return 'ОБРАБОТКА...';
  }
});

const elapsedTimerFormatted = computed(() => formatTime(elapsedTimer.value));
const remainingTimerFormatted = computed(() => formatTime(Math.max(0, remainingTimer.value)));

// Timelines & segments filtering
const filteredSegments = computed(() => {
  if (!transcriptSearch.value) return transcriptSegments.value;
  const s = transcriptSearch.value.toLowerCase();
  return transcriptSegments.value.filter(seg => seg.text.toLowerCase().includes(s));
});

// Watch to handle audio elements updates
watch(selectedFile, (newFile) => {
  if (newFile) {
    audioUrl.value = URL.createObjectURL(newFile);
    const audioObj = new Audio(audioUrl.value);
    audioObj.onloadedmetadata = () => {
      audioDuration.value = audioObj.duration;
    };
  } else {
    audioUrl.value = '';
    audioDuration.value = 0;
  }
});

// Methods
const downloadLocalModel = async (modelId: string) => {
  if (modelId === cloudGeminiModelId.value || modelDownloadedMap.value[modelId]) return;
  if (isDownloading.value) return;

  try {
    isDownloading.value = true;
    activeDownloadModelId.value = modelId;
    downloadPercentage.value = 0;
    errorMessage.value = '';

    logToDebug('LOG', `[TranscriptionView] Immediate model download requested for ${modelId}`);
    const response = await window.api.transcriptionDownloadModel(modelId);
    if (!response.success) {
      throw new Error(response.error || 'Не удалось скачать файлы локальной нейросети.');
    }

    modelDownloadedMap.value[modelId] = true;
  } catch (err: any) {
    errorMessage.value = `Ошибка загрузки модели: ${err.message || err}`;
  } finally {
    isDownloading.value = false;
  }
};

const selectModel = async (model: ModelItem) => {
  selectedModelId.value = model.id;
  
  if (!model.isCloud && !modelDownloadedMap.value[model.id]) {
    await downloadLocalModel(model.id);
  }
};

const checkAllModelsDownloaded = async () => {
  if (window.api && window.api.transcriptionCheckModel) {
    for (const model of models) {
      if (model.isCloud) {
        modelDownloadedMap.value[model.id] = true;
      } else {
        const downloaded = await window.api.transcriptionCheckModel(model.id);
        modelDownloadedMap.value[model.id] = downloaded;
      }
    }
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Check if player is currently playing the specified segment
const isPlayingSegment = (seg: TranscriptSegment) => {
  return playerCurrentTime.value >= seg.startSec && playerCurrentTime.value <= seg.endSec;
};

// Seek player to timestamp
const seekPlayerTo = (seconds: number) => {
  if (audioElement.value) {
    audioElement.value.currentTime = seconds;
    audioElement.value.play().catch(() => {});
  }
};

// Player callbacks
const onPlayerTimeUpdate = () => {
  if (audioElement.value) {
    playerCurrentTime.value = audioElement.value.currentTime;
  }
};

const onPlayerLoadedMetadata = () => {
  if (audioElement.value) {
    playerDuration.value = audioElement.value.duration;
  }
};

// File uploading handlers
const handleDrop = (e: DragEvent) => {
  dragOver.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
      selectedFile.value = file;
      errorMessage.value = '';
    } else {
      errorMessage.value = 'Пожалуйста, загружайте только файлы аудио или видео.';
    }
  }
};

const handleFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0];
    errorMessage.value = '';
  }
};

const clearFile = () => {
  selectedFile.value = null;
  errorMessage.value = '';
  transcriptText.value = '';
  transcriptSegments.value = [];
  playerCurrentTime.value = 0;
  playerDuration.value = 0;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

// Trigger download/save as txt
const downloadAsTxt = () => {
  if (!transcriptSegments.value.length) return;
  
  let content = `=== РАСШИФРОВКА АУДИОФАЙЛА: ${selectedFile.value?.name || 'AUDIO'} ===\n`;
  content += `Модель обработки: ${selectedModelId.value}\n`;
  content += `Дата создания: ${new Date().toLocaleString()}\n`;
  content += `Длительность: ${audioDurationFormatted.value}\n\n`;
  
  transcriptSegments.value.forEach(seg => {
    content += `[${formatTime(seg.startSec)} - ${formatTime(seg.endSec)}]: ${seg.text}\n`;
  });
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${selectedFile.value?.name.split('.')[0] || 'transcript'}_timeline.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Prepare local Float32Array mono samples resampled to 16000Hz using native browser audioCtx
async function prepareLocalAudioSamples(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // High accuracy decodation
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  // Resample
  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1, // mono
    audioBuffer.duration * targetSampleRate,
    targetSampleRate
  );
  
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start();
  
  const resampledBuffer = await offlineCtx.startRendering();
  return resampledBuffer.getChannelData(0);
}

// Convert File to Base64 helper for Gemini
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// Cancel current running transcription
const cancelActiveTranscription = async () => {
  try {
    logToDebug('LOG', '[TranscriptionView] User requested cancellation of active transcription.');
    if (window.api && window.api.transcriptionCancel) {
      await window.api.transcriptionCancel();
    }
  } catch (err) {
    logToDebug('WARN', '[TranscriptionView] Cancel call error:', err);
  } finally {
    isProcessing.value = false;
    processStep.value = 'idle';
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
};

// Start Main Audio Processing Flow
const startTranscription = async () => {
  if (!selectedFile.value) return;
  
  errorMessage.value = '';
  gpuWarningActive.value = false;
  gpuWarningMessage.value = '';
  transcriptText.value = '';
  transcriptSegments.value = [];
  
  if (isCloudSelected.value && !hasGeminiKey.value) {
    errorMessage.value = 'Ошибка: Ключ Gemini API не настроен. Укажите ключ в настройках A.R.C.';
    return;
  }

  // Ensure the model is downloaded if it is local
  if (!isCloudSelected.value && !modelDownloadedMap.value[selectedModelId.value]) {
    try {
      isDownloading.value = true;
      activeDownloadModelId.value = selectedModelId.value;
      downloadPercentage.value = 0;
      
      logToDebug('LOG', `[TranscriptionView] Local model download requested for ${selectedModelId.value}`);
      const response = await window.api.transcriptionDownloadModel(selectedModelId.value, selectedDevice.value);
      if (!response.success) {
        throw new Error(response.error || 'Не удалось скачать файлы локальной нейросети.');
      }
      
      modelDownloadedMap.value[selectedModelId.value] = true;
    } catch (err: any) {
      errorMessage.value = `Ошибка загрузки модели: ${err.message || err}`;
      isDownloading.value = false;
      return;
    } finally {
      isDownloading.value = false;
    }
  }

  isProcessing.value = true;
  processStep.value = 'decoding';
  elapsedTimer.value = 0;
  
  // Force Vue to update DOM before heavy synchronous tasks
  await new Promise(r => setTimeout(r, 50));
  
  // Establish timers
  let totalEstimatedSec = 5;
  if (selectedModelId.value === 'Xenova/whisper-tiny') {
    totalEstimatedSec = Math.round(audioDuration.value * 0.15);
  } else if (selectedModelId.value === 'Xenova/whisper-base') {
    totalEstimatedSec = Math.round(audioDuration.value * 0.35);
  } else if (selectedModelId.value === 'Xenova/whisper-small') {
    totalEstimatedSec = Math.round(audioDuration.value * 1.1);
  }
  remainingTimer.value = totalEstimatedSec;

  timerInterval = setInterval(() => {
    elapsedTimer.value++;
    remainingTimer.value = Math.max(0, remainingTimer.value - 1);
  }, 1000);

  try {
    if (isCloudSelected.value) {
      // 1. Cloud Gemini Flow
      processStep.value = 'uploading';
      const base64Data = await fileToBase64(selectedFile.value);
      
      // Infer mimeType
      let mimeType = selectedFile.value.type;
      if (!mimeType) {
        // Fallback checks
        const ext = selectedFile.value.name.split('.').pop()?.toLowerCase();
        if (ext === 'mp3') mimeType = 'audio/mp3';
        else if (ext === 'wav') mimeType = 'audio/wav';
        else if (ext === 'm4a') mimeType = 'audio/m4a';
        else if (ext === 'ogg') mimeType = 'audio/ogg';
        else mimeType = 'audio/mp3'; // general default
      }

      processStep.value = 'transcribing';
      const response = await window.api.transcriptionTranscribeGemini(base64Data, mimeType);
      
      if (!response.success) {
        throw new Error(response.error || 'Ошибка в процессе работы облака Gemini.');
      }

      transcriptText.value = response.text || '';
      parseTimelineFromText(response.text || '');
    } else {
      // 2. Local Whisper Flow
      processStep.value = 'decoding';
      const samples = await prepareLocalAudioSamples(selectedFile.value);
      
      processStep.value = 'transcribing';
      
      let response;
      try {
        logToDebug('LOG', `[TranscriptionView] Initiating local Whisper with device: ${selectedDevice.value}`);
        
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks
        const totalBytes = samples.buffer.byteLength;
        const sessionId = Date.now().toString();

        logToDebug('LOG', `[TranscriptionView] Sending audio to main process in chunks of ${CHUNK_SIZE} bytes. Total size: ${totalBytes} bytes.`);
        for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
          const chunk = samples.buffer.slice(offset, offset + CHUNK_SIZE);
          await window.api.transcriptionSendAudioChunk(sessionId, chunk as any, offset, totalBytes);
          // Yield to UI thread to prevent freezing
          await new Promise(r => setTimeout(r, 10));
        }

        response = await window.api.transcriptionTranscribeWhisperChunked(selectedModelId.value, sessionId, selectedDevice.value);
      } catch (whisperErr: any) {
        logToDebug('WARN', '[TranscriptionView] Primary Whisper transcription attempt crashed:', whisperErr);
        response = { success: false, error: whisperErr.message || whisperErr };
      }
      
      const isCancelled = response.error && (
        String(response.error).includes('cancelled') || 
        String(response.error).includes('Cancel') || 
        String(response.error).includes('Отмена')
      );
      
      // If GPU run failed, auto fallback to CPU WASM! (Unless it was manually cancelled by the user)
      if (!response.success && selectedDevice.value !== 'cpu' && !isCancelled) {
        gpuWarningActive.value = true;
        gpuWarningMessage.value = response.error || '';
        logToDebug('WARN', '[TranscriptionView] GPU run failed. Falling back to CPU...');
        
        // Notify the user via processStep or warning label
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks
        const totalBytes = samples.buffer.byteLength;
        const sessionId = Date.now().toString() + '_fallback';
        for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
          const chunk = samples.buffer.slice(offset, offset + CHUNK_SIZE);
          await window.api.transcriptionSendAudioChunk(sessionId, chunk as any, offset, totalBytes);
          // Yield to UI thread to prevent freezing
          await new Promise(r => setTimeout(r, 10));
        }

        response = await window.api.transcriptionTranscribeWhisperChunked(selectedModelId.value, sessionId, 'cpu');
      }
      
      if (!response.success) {
        throw new Error(response.error || 'Внутренняя ошибка при инференсе Whisper.');
      }

      const result = response.result;
      transcriptText.value = result.text || '';
      
      // Parse local whisper segments
      if (result.chunks && Array.isArray(result.chunks)) {
        transcriptSegments.value = result.chunks.map((chunk: any) => {
          const start = chunk.timestamp && Array.isArray(chunk.timestamp) ? chunk.timestamp[0] : 0;
          const end = chunk.timestamp && Array.isArray(chunk.timestamp) ? chunk.timestamp[1] : 0;
          return {
            startSec: start,
            endSec: end,
            text: chunk.text || ''
          };
        });
      }
    }
  } catch (err: any) {
    logToDebug('ERR', '[TranscriptionView] Transcription failed:', err);
    errorMessage.value = err.message || err;
  } finally {
    isProcessing.value = false;
    processStep.value = 'idle';
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
};

const parseTimelineFromText = (rawText: string) => {
  const segments: TranscriptSegment[] = [];
  const lines = rawText.split('\n');
  const timestampRegex = /\[\s*(\d+):(\d+)(?:\.(\d+))?\s*(?:-|–)\s*(\d+):(\d+)(?:\.(\d+))?\s*\]:\s*(.*)/i;
  
  for (const line of lines) {
    const match = line.match(timestampRegex);
    if (match) {
      const startMins = parseInt(match[1], 10);
      const startSecs = parseInt(match[2], 10);
      const startMs = match[3] ? parseInt(match[3], 10) / 100 : 0;
      const endMins = parseInt(match[4], 10);
      const endSecs = parseInt(match[5], 10);
      const endMs = match[6] ? parseInt(match[6], 10) / 100 : 0;
      const text = match[7].trim();
      const startSec = startMins * 60 + startSecs + startMs;
      const endSec = endMins * 60 + endSecs + endMs;
      segments.push({ startSec, endSec, text });
    }
  }
  
  if (segments.length === 0) {
    const textClean = rawText.replace(/\[\s*\d+:\d+.*?\s*\]/g, '').trim();
    const sentences = textClean.split(/(?<=[.!?])\s+/);
    const step = audioDuration.value / Math.max(1, sentences.length);
    sentences.forEach((sentence, idx) => {
      if (sentence.trim()) {
        segments.push({
          startSec: idx * step,
          endSec: (idx + 1) * step,
          text: sentence.trim()
        });
      }
    });
  }
  transcriptSegments.value = segments;
};

let chunkBuffer: any[] = [];
let flushTimeout: any = null;

const flushChunks = () => {
  for (const chunk of chunkBuffer) {
    const startSec = chunk.timestamp ? chunk.timestamp[0] : 0;
    const endSec = chunk.timestamp ? chunk.timestamp[1] : (startSec || 0);
    const textClean = (chunk.text || '').trim();
    const recentSegments = transcriptSegments.value.slice(-20);
    const duplicate = recentSegments.some(s => s.text === textClean && Math.abs(s.startSec - startSec) < 1.0);
    if (!duplicate && textClean) {
      transcriptSegments.value.push({
        startSec,
        endSec,
        text: textClean
      });
    }
  }
  chunkBuffer = [];
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
};

let removeDownloadListener: (() => void) | null = null;
let removeChunkListener: (() => void) | null = null;

const detectGpu = async () => {
  try {
    if (window.api && window.api.getSystemInfo) {
      const info = await window.api.getSystemInfo();
      if (info && info.gpu) {
        gpuName.value = info.gpu;
        const gpuLower = info.gpu.toLowerCase();
        if (gpuLower.includes('nvidia') || gpuLower.includes('geforce') || gpuLower.includes('rtx') || gpuLower.includes('gtx')) {
          selectedDevice.value = 'cuda';
        } else if (gpuLower.includes('amd') || gpuLower.includes('radeon') || gpuLower.includes('intel') || gpuLower.includes('apple') || gpuLower.includes('directml')) {
          selectedDevice.value = 'dml';
        } else {
          selectedDevice.value = 'cpu';
        }
      } else {
        gpuName.value = 'ЛОКАЛЬНЫЙ ЦП (CPU)';
        selectedDevice.value = 'cpu';
      }
    }
  } catch (err) {
    logToDebug('WARN', 'Failed to detect GPU:', err);
    gpuName.value = 'ЛОКАЛЬНЫЙ ЦП (CPU)';
    selectedDevice.value = 'cpu';
  }
};

const syncMultimodalModel = async () => {
  try {
    if (window.api?.getMultimodalModel) {
      const info = await window.api.getMultimodalModel();
      if (info && info.model) {
        const prevCloudId = cloudGeminiModelId.value;
        cloudGeminiModelId.value = info.model;
        hasGeminiKey.value = Boolean(info.hasKey);
        modelDownloadedMap.value[info.model] = true;
        const cloudEntry = models.find(m => m.isCloud);
        if (cloudEntry) {
          cloudEntry.id = info.model;
          cloudEntry.name = `${info.model} (Cloud)`;
        }
        if (selectedModelId.value === prevCloudId) {
          selectedModelId.value = info.model;
        }
      }
    }
  } catch (err) {
    logToDebug('WARN', '[TranscriptionView] Failed to sync multimodal model:', err);
  }
};

onMounted(async () => {
  await syncMultimodalModel();
  await checkAllModelsDownloaded();
  await detectGpu();

  if (window.api) {
    if (window.api.onTranscriptionDownloadProgress) {
      removeDownloadListener = window.api.onTranscriptionDownloadProgress((data: any) => {
        if (data && data.modelName === activeDownloadModelId.value) {
          if (data.total_bytes > 0) {
            downloadPercentage.value = Math.round((data.bytes_done / data.total_bytes) * 100);
          }
          if (data.filename) {
            activeDownloadFile.value = data.filename;
          }
        }
      });
    }

    if (window.api.onTranscriptionChunk) {
      removeChunkListener = window.api.onTranscriptionChunk((chunk: any) => {
        if (chunk) {
          chunkBuffer.push(chunk);
          if (!flushTimeout) {
            flushTimeout = setTimeout(flushChunks, 200);
          }
        }
      });
    }
  }
});

onUnmounted(() => {
  if (removeDownloadListener) {
    removeDownloadListener();
  }
  if (removeChunkListener) {
    removeChunkListener();
  }
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

  return {
    selectedFile,
    fileInput,
    dragOver,
    audioUrl,
    audioDuration,
    selectedModelId,
    errorMessage,
    selectedDevice,
    setDevice,
    deviceInfo,
    gpuName,
    gpuWarningActive,
    gpuWarningMessage,
    isProcessing,
    processStep,
    elapsedTimer,
    remainingTimer,
    showDebug,
    debugLogs,
    modelDownloadedMap,
    isDownloading,
    activeDownloadModelId,
    activeDownloadFile,
    downloadPercentage,
    audioElement,
    playerCurrentTime,
    playerDuration,
    transcriptText,
    transcriptSegments,
    transcriptSearch,
    models,
    isCloudSelected,
    timeEstimate,
    audioDurationFormatted,
    wordCount,
    processStepText,
    filteredSegments,
    elapsedTimerFormatted,
    remainingTimerFormatted,
    handleDrop,
    handleFileSelected,
    clearFile,
    selectModel,
    downloadLocalModel,
    startTranscription,
    cancelActiveTranscription,
    downloadAsTxt,
    isPlayingSegment,
    seekPlayerTo,
    onPlayerTimeUpdate,
    onPlayerLoadedMetadata,
    formatBytes,
    formatTime
  };
}
