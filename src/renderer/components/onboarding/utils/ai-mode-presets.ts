import { PRESETS, type ProviderPreset } from '../../../features/settings/components/sections/providers/presetsData';

export type LocalRuntimeId =
  | 'ollama'
  | 'builtin'
  | 'freellmapi'
  | 'freeapillm'
  | 'lmstudio'
  | 'llamacpp'
  | 'jan'
  | 'vllm';

export interface LocalRuntimeOption {
  id: LocalRuntimeId;
  title: string;
  subtitle: string;
  endpoint: string;
  model: string;
  isGateway: boolean;
}

export const LOCAL_RUNTIME_OPTIONS: LocalRuntimeOption[] = [
  {
    id: 'freellmapi',
    title: 'FreeLLMAPI',
    subtitle: 'Free Router http://127.0.0.1:31415',
    endpoint: 'http://127.0.0.1:31415/v1/chat/completions',
    model: 'auto',
    isGateway: true
  },
  {
    id: 'freeapillm',
    title: 'FreeAPILLM',
    subtitle: 'Free Router http://127.0.0.1:3067',
    endpoint: 'http://127.0.0.1:3067/v1/chat/completions',
    model: 'auto',
    isGateway: true
  },
  {
    id: 'ollama',
    title: 'Ollama Daemon',
    subtitle: 'Локальный сервер http://127.0.0.1:11434',
    endpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    isGateway: false
  },
  {
    id: 'builtin',
    title: 'Встроенный GGUF',
    subtitle: 'Прямой контур llama.cpp',
    endpoint: 'builtin',
    model: 'builtin',
    isGateway: false
  },
  {
    id: 'lmstudio',
    title: 'LM Studio',
    subtitle: 'Локальный сервер http://127.0.0.1:1234',
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    model: 'local-model',
    isGateway: true
  },
  {
    id: 'llamacpp',
    title: 'Llama.cpp Server',
    subtitle: 'Локальный сервер http://127.0.0.1:8080',
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
    model: 'local-model',
    isGateway: true
  },
  {
    id: 'jan',
    title: 'Jan Local',
    subtitle: 'Локальный сервер http://127.0.0.1:1337',
    endpoint: 'http://127.0.0.1:1337/v1/chat/completions',
    model: 'local-model',
    isGateway: true
  },
  {
    id: 'vllm',
    title: 'vLLM / LocalAI',
    subtitle: 'Локальный сервер http://127.0.0.1:8000',
    endpoint: 'http://127.0.0.1:8000/v1/chat/completions',
    model: 'local-model',
    isGateway: true
  }
];

export interface CloudPresetOption {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  freeTierInfo: string;
}

export const CLOUD_PRESET_OPTIONS: CloudPresetOption[] = PRESETS.filter(
  (p: ProviderPreset) => p.type === 'cloud'
).map((p: ProviderPreset) => {
  const lower = p.name.toLowerCase();
  let id = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (lower.includes('openrouter')) id = 'openrouter';
  else if (lower.includes('gemini')) id = 'gemini';
  else if (lower.includes('groq')) id = 'groq';
  else if (lower.includes('deepseek')) id = 'deepseek';
  else if (lower.includes('nvidia')) id = 'nvidia';
  else if (lower.includes('cerebras')) id = 'cerebras';
  else if (lower.includes('sambanova')) id = 'sambanova';
  else if (lower.includes('openai')) id = 'openai';
  else if (lower.includes('anthropic')) id = 'anthropic';
  else if (lower.includes('mistral')) id = 'mistral';
  return {
    id,
    name: p.name,
    endpoint: p.endpoint,
    model: p.model,
    freeTierInfo: p.freeTierInfo
  };
});

import { normalizeOpenAiEndpoint } from '../../../../shared/utils/free-llm.util';

export function normalizeGatewayEndpoint(raw: string): string {
  const val = raw.trim();
  if (!val) return 'http://127.0.0.1:31415/v1/chat/completions';
  return normalizeOpenAiEndpoint(val);
}
