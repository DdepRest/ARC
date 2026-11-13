import type { AIProvider } from '../../../stores/aiConfig';
import { CURATED_MODELS } from '../../settings/components/sections/model-hub.registry';
import {
  inferModelThinkingCapabilities,
  type ComposerMode,
  type EffortLevel,
  type ConcreteEffortLevel,
} from '../../../../shared/utils/auto-workflow';

export type { ComposerMode, EffortLevel, ConcreteEffortLevel };
export type ProviderBadgeType = 'local' | 'ollama' | 'openai' | 'spark' | 'kimi';
export type ModelFilterTab = 'fav' | 'all';
export type ModelPingStatus = 'online' | 'verified' | 'checking' | 'standby';

export interface ComposerModelOption {
  id: string;
  name: string;
  effort: EffortLevel;
  efforts: EffortLevel[];
  isThinkingCapKnown: boolean;
  maxKnownEffort: ConcreteEffortLevel | null;
  capabilityLabel: string;
  provider: ProviderBadgeType;
  providerId?: string;
  providerName?: string;
  modelKey: string;
  isLocal?: boolean;
  localKind?: 'builtin' | 'ollama';
  isFav: boolean;
  pingStatus: ModelPingStatus;
  latencyMs?: number;
  sourceLabel: string;
}

export interface ContextTagOption {
  tag: string;
  category: string;
}

export interface ProviderProbeRecord {
  online: boolean;
  checking: boolean;
  latencyMs?: number;
  discoveredModels: string[];
  verifiedAt?: number;
}

export const ALL_MODES: ComposerMode[] = ['Auto', 'Plan', 'Ask', 'Build'];

export const MODE_META: Record<ComposerMode, { label: string; hint: string }> = {
  Auto: { label: 'Auto', hint: 'Сам решает' },
  Plan: { label: 'Plan', hint: 'Пошагово' },
  Ask: { label: 'Ask', hint: 'Вопрос' },
  Build: { label: 'Build', hint: 'Сразу в код' },
};

export const CONTEXT_OPTIONS: ContextTagOption[] = [
  { tag: '@codebase', category: 'Workspace' },
  { tag: '@memory', category: 'RAG база' },
  { tag: '@tasks', category: 'Задачи' },
  { tag: '@docs', category: 'Документация' },
  { tag: '@terminal', category: 'Вывод консоли' },
];

export const COMPOSER_MODE_STORAGE_KEY = 'arc_composer_mode_v3';
export const FAV_STORAGE_KEY = 'arc_composer_fav_models_v3';
export const EFFORT_STORAGE_KEY = 'arc_composer_model_efforts_v4';
export const ACTIVE_MODEL_STORAGE_KEY = 'arc_composer_active_model_v3';
export const DEFAULT_BUILTIN_GGUF = 'LFM3-1.7B-Q4_K_M.gguf';

export const BUILTIN_CANDIDATE_MODELS: { file: string; label: string }[] = [
  { file: 'LFM3-1.7B-Q4_K_M.gguf', label: 'LFM 3 (1.7B)' },
  { file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', label: 'Qwen 2.5 (1.5B)' },
  { file: 'qwen2.5-3b-instruct-q4_k_m.gguf', label: 'Qwen 2.5 (3B)' },
  { file: 'qwen2.5-7b-instruct-q4_k_m.gguf', label: 'Qwen 2.5 (7B)' },
  { file: 'Qwen3.5-4B-Q4_K_M.gguf', label: 'Qwen 3.5 (4B)' },
  { file: 'Qwen3.5-2B-Q4_K_M.gguf', label: 'Qwen 3.5 (2B)' },
  { file: 'LFM2.5-2.6B-Q4_K_M.gguf', label: 'LFM 2.5 (2.6B)' },
  { file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', label: 'Qwen 2.5 (0.5B)' },
];

export function getCanonicalModelId(modelKey: string, localKind?: 'builtin' | 'ollama', providerId?: string): string {
  const norm = (modelKey || 'default').trim().toLowerCase();
  if (localKind === 'builtin') return `builtin:${norm}`;
  if (localKind === 'ollama') return `ollama:${norm}`;
  if (providerId) return `provider:${providerId.toLowerCase()}:${norm}`;
  return `cloud:${norm}`;
}

export function inferProviderBadge(nameOrEndpoint: string, isLocal?: boolean): ProviderBadgeType {
  const lower = (nameOrEndpoint || '').toLowerCase();
  if (lower.includes('ollama') || lower.includes('11434')) return 'ollama';
  if (isLocal) return 'local';
  if (lower.includes('kimi') || lower.includes('moonshot') || lower.includes('deepseek')) return 'kimi';
  if (/(anthropic|claude|sonnet|opus|gemini|google)/.test(lower)) return 'spark';
  return 'openai';
}

export function formatReadableModelName(rawModel: string, providerName?: string): string {
  const lower = (rawModel || '').toLowerCase();
  if (lower.includes('lfm3-1.7b') || lower.includes('lfm3')) return 'LFM 3 (1.7B)';
  if (lower.includes('lfm2.5-2.6b')) return 'LFM 2.5 (2.6B)';
  if (lower.includes('qwen3.5-4b')) return 'Qwen 3.5 (4B)';
  if (lower.includes('qwen3.5-2b')) return 'Qwen 3.5 (2B)';
  if (lower.includes('qwen2.5-7b')) return 'Qwen 2.5 (7B)';
  if (lower.includes('qwen2.5-3b')) return 'Qwen 2.5 (3B)';
  if (lower.includes('qwen2.5-1.5b') || lower === 'qwen2.5:1.5b') return 'Qwen 2.5 (1.5B)';
  if (lower.includes('qwen2.5-0.5b')) return 'Qwen 2.5 (0.5B)';
  if (lower.includes('qwen1.5-0.5b')) return 'Qwen 1.5 (0.5B)';
  if (lower.includes('llama-3-8b')) return 'Llama 3 (8B)';
  if (lower.includes('llama-3-70b')) return 'Llama 3 (70B)';
  if (lower.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
  if (lower.includes('llama3.2') || lower.includes('llama-3.2')) return 'Llama 3.2';
  if (lower.includes('mistral-7b')) return 'Mistral 7B';
  if (lower.includes('gemma-2-9b')) return 'Gemma 2 (9B)';
  if (lower.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (lower.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (lower.includes('claude-3-7-sonnet') || lower.includes('claude-3.7-sonnet')) return 'Claude 3.7 Sonnet';
  if (lower.includes('claude-3-5-sonnet') || lower.includes('claude-3.5-sonnet')) return 'Claude 3.5 Sonnet';
  if (lower.includes('deepseek-r1') || lower.includes('deepseek-reasoner')) return 'DeepSeek R1';
  if (lower.includes('deepseek-chat') || lower.includes('deepseek-v3')) return 'DeepSeek V3';
  if (lower.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (lower.includes('gpt-4o')) return 'GPT-4o';
  if ((lower === 'auto' || lower === 'openrouter/auto' || lower === 'free') && providerName) return `${providerName} · Auto`;
  const withoutExt = rawModel.replace(/\.gguf$/i, '').replace(/-instruct.*$/i, '').replace(/-chat.*$/i, '');
  const seg = withoutExt.split('/').pop() || withoutExt;
  return seg.length <= 24 ? seg : `${seg.slice(0, 22)}…`;
}

export function isProviderConnectedAndConfigured(
  p: AIProvider,
  quarantinedIds: Set<string>,
  ollamaOnline: boolean,
  probe?: ProviderProbeRecord
): boolean {
  if (!p || !p.endpoint || quarantinedIds.has(p.id)) return false;
  const isOllama =
    p.type === 'local' &&
    (p.endpoint.includes('11434') || p.name?.toLowerCase().includes('ollama') || p.id.toLowerCase().includes('ollama'));
  if (isOllama) return ollamaOnline || Boolean(probe?.online);

  if (p.type === 'cloud') {
    const hasKey = Boolean(p.apiKey && p.apiKey.trim().length > 0);
    const isKeyless =
      Boolean(p.noAuthHeader) || Boolean(p.name && /free/i.test(p.name)) || Boolean(p.endpoint && /freellm|horde/i.test(p.endpoint));
    if (!hasKey && !isKeyless && !probe?.online) return false;
    return Boolean(p.enabled || probe?.online || p.modelsUpdatedAt);
  }
  return Boolean(p.enabled || probe?.online);
}

export function buildComposerModelOption(
  params: {
    id: string;
    name: string;
    modelKey: string;
    provider: ProviderBadgeType;
    providerId?: string;
    providerName?: string;
    isLocal?: boolean;
    localKind?: 'builtin' | 'ollama';
    pingStatus: ModelPingStatus;
    latencyMs?: number;
    sourceLabel: string;
  },
  customEfforts: Record<string, EffortLevel>,
  favIds: string[]
): ComposerModelOption {
  const cap = inferModelThinkingCapabilities(params.modelKey, params.providerName, params.isLocal);
  const savedEffort = customEfforts[params.id];
  const effort: EffortLevel = savedEffort && cap.efforts.includes(savedEffort) ? savedEffort : cap.defaultEffort;
  return {
    ...params,
    effort,
    efforts: cap.efforts,
    isThinkingCapKnown: cap.isThinkingCapKnown,
    maxKnownEffort: cap.maxKnownEffort,
    capabilityLabel: cap.capabilityLabel,
    isFav: favIds.includes(params.id),
  };
}

export function collectGgufCandidateFiles(activeBuiltinModel?: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of BUILTIN_CANDIDATE_MODELS) map.set(c.file, c.label);
  for (const cm of CURATED_MODELS.filter((m) => m.type === 'llm-gguf')) {
    for (const q of cm.quants) {
      if (!map.has(q.id)) map.set(q.id, cm.name);
    }
  }
  if (activeBuiltinModel && !map.has(activeBuiltinModel)) {
    map.set(activeBuiltinModel, formatReadableModelName(activeBuiltinModel));
  }
  return map;
}

export function assembleConnectedModels(params: {
  downloadedGgufSet: Set<string>;
  useLocalLLM: boolean;
  localLLMModel: string;
  builtinLLMModel: string;
  ollamaOnline: boolean;
  ollamaInstalledModels: string[];
  ollamaLatencyMs?: number;
  providers: AIProvider[];
  quarantinedIds: Set<string>;
  providerProbes: Record<string, ProviderProbeRecord>;
  customEfforts: Record<string, EffortLevel>;
  favIds: string[];
}): ComposerModelOption[] {
  const list: ComposerModelOption[] = [];
  const ggufEntries = collectGgufCandidateFiles(params.builtinLLMModel);

  for (const [file, label] of ggufEntries.entries()) {
    const isDownloaded = params.downloadedGgufSet.has(file);
    const isActive = params.useLocalLLM && params.localLLMModel === 'builtin' && params.builtinLLMModel === file;
    if (!isDownloaded && !isActive) continue;
    const id = getCanonicalModelId(file, 'builtin');
    if (list.some((m) => m.id === id)) continue;
    list.push(
      buildComposerModelOption(
        {
          id,
          name: label,
          modelKey: file,
          provider: 'local',
          isLocal: true,
          localKind: 'builtin',
          pingStatus: isDownloaded ? 'verified' : 'standby',
          sourceLabel: isDownloaded ? 'GGUF · Установлена' : 'GGUF · Встроенная',
        },
        params.customEfforts,
        params.favIds
      )
    );
  }

  if (params.ollamaOnline) {
    const ollamaKeys = new Set<string>(params.ollamaInstalledModels);
    if (params.localLLMModel && params.localLLMModel !== 'builtin') ollamaKeys.add(params.localLLMModel);
    if (ollamaKeys.size === 0) ollamaKeys.add('llama3.2');
    for (const oKey of ollamaKeys) {
      const id = getCanonicalModelId(oKey, 'ollama');
      if (list.some((m) => m.id === id)) continue;
      list.push(
        buildComposerModelOption(
          {
            id,
            name: `Ollama · ${formatReadableModelName(oKey)}`,
            modelKey: oKey,
            provider: 'ollama',
            isLocal: true,
            localKind: 'ollama',
            pingStatus: 'online',
            latencyMs: params.ollamaLatencyMs,
            sourceLabel: params.ollamaLatencyMs ? `Ollama · ${params.ollamaLatencyMs} ms` : 'Ollama · Онлайн',
          },
          params.customEfforts,
          params.favIds
        )
      );
    }
  }

  for (const p of params.providers) {
    const probe = params.providerProbes[p.id];
    if (!isProviderConnectedAndConfigured(p, params.quarantinedIds, params.ollamaOnline, probe)) continue;
    const configuredModels =
      p.selectedModels && p.selectedModels.length > 0
        ? p.selectedModels
        : p.model
          ? [p.model]
          : probe?.discoveredModels?.slice(0, 5) || [];

    for (const mKey of configuredModels) {
      if (!mKey) continue;
      const id = getCanonicalModelId(mKey, undefined, p.id);
      if (list.some((item) => item.id === id)) continue;
      const pingStatus: ModelPingStatus = probe?.checking
        ? 'checking'
        : probe?.online
          ? 'online'
          : p.enabled
            ? 'verified'
            : 'standby';
      list.push(
        buildComposerModelOption(
          {
            id,
            name: formatReadableModelName(mKey, p.name),
            modelKey: mKey,
            provider: inferProviderBadge(`${p.name} ${mKey} ${p.endpoint}`, p.type === 'local'),
            providerId: p.id,
            providerName: p.name,
            isLocal: p.type === 'local',
            pingStatus,
            latencyMs: probe?.latencyMs,
            sourceLabel: probe?.latencyMs ? `${p.name} · ${probe.latencyMs} ms` : `${p.name} · Подключен`,
          },
          params.customEfforts,
          params.favIds
        )
      );
    }
  }

  return list;
}
