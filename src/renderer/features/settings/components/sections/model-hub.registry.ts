export type ModelType = 'llm-gguf' | 'stt-streaming' | 'stt-file' | 'tts';

export interface ModelQuantization {
  id: string;
  name: string; // e.g. "Q4_K_M", "Q8_0", "FP32"
  sizeBytes: number;
  expectedSizeStr: string;
  minRamGb: number;
  minVramGb?: number; 
  downloadUrl?: string; // If specific download URL is needed
}

export interface CuratedModel {
  id: string;
  name: string;
  vendor: string;
  type: ModelType;
  description: string;
  language: string;
  qualityStars: number; // 1-5
  speedStars: number; // 1-5
  badges: string[];
  quants: ModelQuantization[];
  hfUrl?: string; // HuggingFace URL
  bundledResource?: boolean;
}

export const CURATED_MODELS: CuratedModel[] = [
  {
    id: 'qwen1.5-0.5b',
    name: 'Qwen 1.5 (0.5B)',
    vendor: 'Alibaba / Qwen',
    type: 'llm-gguf',
    description: 'Компактная языковая модель. Идеальна для слабых ПК, быстрых команд и базовой автоматизации.',
    language: 'RU / EN',
    qualityStars: 3,
    speedStars: 5,
    badges: ['Для слабых ПК', 'Быстрый старт'],
    quants: [
      { id: 'qwen1.5-0.5b-chat-q4_k_m.gguf', name: 'Q4_K_M', expectedSizeStr: '390 MB', sizeBytes: 390 * 1024 * 1024, minRamGb: 2, downloadUrl: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1.5-0.5b-chat-q4_k_m.gguf' },
      { id: 'qwen1.5-0.5b-chat-q8_0.gguf', name: 'Q8_0', expectedSizeStr: '650 MB', sizeBytes: 650 * 1024 * 1024, minRamGb: 3, downloadUrl: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1.5-0.5b-chat-q8_0.gguf' }
    ],
    hfUrl: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF'
  },
  {
    id: 'llama-3-8b-instruct',
    name: 'Llama 3 (8B)',
    vendor: 'Meta',
    type: 'llm-gguf',
    description: 'Золотой стандарт. Отличная логика, качественный текст. Требует средний или мощный ПК.',
    language: 'RU / EN',
    qualityStars: 5,
    speedStars: 3,
    badges: ['Топ качество', 'Сбалансированная'],
    quants: [
      { id: 'llama-3-8b-instruct-q4_k_m.gguf', name: 'Q4_K_M', expectedSizeStr: '4.7 GB', sizeBytes: 4.7 * 1024 * 1024 * 1024, minRamGb: 8, downloadUrl: 'https://huggingface.co/lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct-Q4_K_M.gguf' },
      { id: 'llama-3-8b-instruct-q8_0.gguf', name: 'Q8_0', expectedSizeStr: '8.5 GB', sizeBytes: 8.5 * 1024 * 1024 * 1024, minRamGb: 16, downloadUrl: 'https://huggingface.co/lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct-Q8_0.gguf' }
    ],
    hfUrl: 'https://huggingface.co/lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF'
  },
  {
    id: 'mistral-7b-instruct-v0.3',
    name: 'Mistral 7B (v0.3)',
    vendor: 'Mistral AI',
    type: 'llm-gguf',
    description: 'Отличная модель от Mistral. Хорошая логика, поддержка длинного контекста.',
    language: 'RU / EN',
    qualityStars: 4,
    speedStars: 4,
    badges: ['Сбалансированная', 'Кодинг'],
    quants: [
      { id: 'mistral-7b-v0.3-q4_k_m.gguf', name: 'Q4_K_M', expectedSizeStr: '4.4 GB', sizeBytes: 4400 * 1024 * 1024, minRamGb: 8, downloadUrl: 'https://huggingface.co/MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3.Q4_K_M.gguf' },
      { id: 'mistral-7b-v0.3-q8_0.gguf', name: 'Q8_0', expectedSizeStr: '7.7 GB', sizeBytes: 7700 * 1024 * 1024, minRamGb: 12, downloadUrl: 'https://huggingface.co/MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3.Q8_0.gguf' }
    ]
  },
  {
    id: 'llama-3-70b-instruct',
    name: 'Llama 3 (70B)',
    vendor: 'Meta',
    type: 'llm-gguf',
    description: 'Ультимативное качество. Для очень мощных систем или серверов. Уровень GPT-4.',
    language: 'RU / EN',
    qualityStars: 5,
    speedStars: 1,
    badges: ['Максимум логики', 'Тяжеловес'],
    quants: [
      { id: 'llama-3-70b-q4_k_m.gguf', name: 'Q4_K_M', expectedSizeStr: '42.5 GB', sizeBytes: 42500 * 1024 * 1024, minRamGb: 48 }
    ]
  },
  {
    id: 'gemma-2-9b-it',
    name: 'Gemma 2 (9B)',
    vendor: 'Google',
    type: 'llm-gguf',
    description: 'Мощная модель от Google в компактном размере. Отличная поддержка русского языка.',
    language: 'RU / EN',
    qualityStars: 5,
    speedStars: 3,
    badges: ['Google AI', 'Для текста'],
    quants: [
      { id: 'gemma-2-9b-it-q4_k_m.gguf', name: 'Q4_K_M', expectedSizeStr: '5.4 GB', sizeBytes: 5400 * 1024 * 1024, minRamGb: 10 }
    ]
  },
  {
    id: 'sherpa-zipformer-ru',
    name: 'ZipFormer Small (RU)',
    vendor: 'Sherpa-ONNX',
    type: 'stt-streaming',
    description: 'Потоковое распознавание речи (STT) с высокой точностью и низким потреблением CPU.',
    language: 'RU',
    qualityStars: 4,
    speedStars: 5,
    badges: ['Потоковый STT', 'Высокая скорость'],
    quants: [
      { id: 'zipformer-ru', name: 'FP32', expectedSizeStr: '94 MB', sizeBytes: 94 * 1024 * 1024, minRamGb: 1 }
    ]
  },
  {
    id: 'whisper-small',
    name: 'Sherpa Whisper Small (RU)',
    vendor: 'Sherpa-ONNX',
    type: 'stt-streaming',
    description: 'Стандартная модель: Whisper Small INT8 для точной расшифровки команд, названий и терминов.',
    language: 'RU / Multi',
    qualityStars: 5,
    speedStars: 5,
    badges: ['Whisper Small INT8', 'Стандартная'],
    quants: [
      { id: 'whisper-small', name: 'INT8', expectedSizeStr: '375 MB', sizeBytes: 375 * 1024 * 1024, minRamGb: 2 }
    ]
  },
  {
    id: 'sherpa-zipformer-en',
    name: 'ZipFormer Small (EN)',
    vendor: 'Sherpa-ONNX',
    type: 'stt-streaming',
    description: 'Потоковое распознавание речи для английского языка.',
    language: 'EN',
    qualityStars: 4,
    speedStars: 5,
    badges: ['Потоковый STT', 'Легкая'],
    quants: [
      { id: 'sherpa-en-archive.tar.bz2', name: 'FP32', expectedSizeStr: '112 MB', sizeBytes: 112 * 1024 * 1024, minRamGb: 1 }
    ]
  },
  {
    id: 'whisper-base-ru',
    name: 'Whisper Base (RU)',
    vendor: 'OpenAI',
    type: 'stt-file',
    description: 'Быстрая, но базовая модель Whisper для распознавания русского.',
    language: 'RU / Multi',
    qualityStars: 3,
    speedStars: 4,
    badges: ['Файловый STT', 'Для слабых ПК'],
    quants: [
      { id: 'Xenova/whisper-base', name: 'FP16', expectedSizeStr: '145 MB', sizeBytes: 145 * 1024 * 1024, minRamGb: 2 }
    ]
  },
  {
    id: 'whisper-medium-ru',
    name: 'Whisper Medium (RU)',
    vendor: 'OpenAI',
    type: 'stt-file',
    description: 'Сбалансированная модель Whisper. Высокая точность, среднее потребление ресурсов.',
    language: 'RU / Multi',
    qualityStars: 5,
    speedStars: 2,
    badges: ['Файловый STT', 'Топ точность'],
    quants: [
      { id: 'ggml-medium.bin', name: 'FP16', expectedSizeStr: '1.5 GB', sizeBytes: 1536 * 1024 * 1024, minRamGb: 4 }
    ]
  },
  {
    id: 'silero-tts-v5',
    name: 'Silero TTS (v5.6)',
    vendor: 'Silero',
    type: 'tts',
    bundledResource: true,
    description: 'Лучший локальный синтез речи для русского языка. Естественные интонации, контроль ударений.',
    language: 'RU',
    qualityStars: 5,
    speedStars: 4,
    badges: ['Русский TTS', 'Точные ударения'],
    quants: [
      { id: 'v5_6_ru.pt', name: 'FP32', expectedSizeStr: '141 MB', sizeBytes: 147664410, minRamGb: 1, downloadUrl: 'https://models.silero.ai/models/tts/ru/v5_6_ru.pt' }
    ],
    hfUrl: 'https://github.com/snakers4/silero-models'
  }
];

export const MODEL_REGISTRY = CURATED_MODELS;
