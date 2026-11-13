import { ref, computed } from 'vue';

export type ModelCategory = 'LLM' | 'STT' | 'TTS';

export interface AggregatedModel {
  id: string;
  name: string;
  category: ModelCategory;
  description: string;
  sizeStr: string;
  status: 'installed' | 'downloading' | 'not_installed';
  progress?: number;
}

export const BASE_SYSTEM_MODELS: AggregatedModel[] = [
  {
    id: 'whisper-small-int8',
    name: 'Whisper Small int8',
    category: 'STT',
    description: 'Локальное распознавание русской речи без отправки в облако.',
    sizeStr: '~375 MB',
    status: 'installed'
  },
  {
    id: 'silero-v5.6',
    name: 'Silero TTS v5.6 (RU)',
    category: 'TTS',
    description: 'Локальный студийный синтез русской речи с 4 дикторами.',
    sizeStr: '~90 MB',
    status: 'installed'
  },
  {
    id: 'qwen2.5-1.5b-gguf',
    name: 'Qwen 2.5 (1.5B GGUF)',
    category: 'LLM',
    description: 'Компактная языковая модель для быстрых команд на ПК.',
    sizeStr: '~1.1 GB',
    status: 'not_installed'
  },
  {
    id: 'llama3.2-3b-gguf',
    name: 'Llama 3.2 (3B GGUF)',
    category: 'LLM',
    description: 'Универсальная диалоговая модель со сбалансированной логикой.',
    sizeStr: '~2.0 GB',
    status: 'not_installed'
  }
];

export function aggregateModelsState(
  installedIds: string[],
  activeDownloads: Record<string, number> = {}
): AggregatedModel[] {
  return BASE_SYSTEM_MODELS.map(model => {
    if (activeDownloads[model.id] !== undefined) {
      return {
        ...model,
        status: 'downloading',
        progress: activeDownloads[model.id]
      };
    }
    if (installedIds.includes(model.id)) {
      return {
        ...model,
        status: 'installed'
      };
    }
    return model;
  });
}
