import type { AIProvider } from '../../../stores/aiConfig';
import { normalizeGatewayEndpoint, type CloudPresetOption, type LocalRuntimeOption } from './ai-mode-presets';

export interface ProviderPersistResult {
  success: boolean;
  provider: AIProvider;
  error?: string;
}

export async function persistLocalGatewayConfig(params: {
  opt: LocalRuntimeOption;
  rawEndpoint: string;
  rawModel: string;
  rawApiKey: string;
  settingsStore: { useLocalLLM: boolean };
  saveProvider: (provider: AIProvider) => Promise<{ success?: boolean; error?: string } | undefined>;
}): Promise<ProviderPersistResult> {
  const endpoint = normalizeGatewayEndpoint(params.rawEndpoint || params.opt.endpoint);
  const model = params.rawModel.trim() || params.opt.model || 'auto';
  const cleanKey = params.rawApiKey.trim();
  const candidate: AIProvider = {
    id: params.opt.id,
    name: params.opt.title,
    type: 'local',
    endpoint,
    apiKey: cleanKey,
    model,
    selectedModels: [model],
    priority: 1,
    maxTokens: 2048,
    temperature: 0.7,
    enabled: true,
    noAuthHeader: !Boolean(cleanKey)
  };
  params.settingsStore.useLocalLLM = false;
  const res = await params.saveProvider(candidate);
  if (res && res.success === false) {
    return { success: false, provider: candidate, error: res.error || 'Не удалось сохранить локальный шлюз' };
  }
  return { success: true, provider: candidate };
}

export async function persistCloudContourConfig(params: {
  preset: CloudPresetOption;
  trimmedKey: string;
  saveProvider: (provider: AIProvider) => Promise<{ success?: boolean; error?: string } | undefined>;
}): Promise<ProviderPersistResult> {
  const candidate: AIProvider = {
    id: params.preset.id,
    name: params.preset.name,
    type: 'cloud',
    endpoint: params.preset.endpoint,
    apiKey: params.trimmedKey,
    model: params.preset.model,
    priority: 1,
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true
  };
  if (params.preset.id === 'gemini' && typeof window !== 'undefined' && (window.api as any)?.settingsSetKey) {
    const keyRes = await (window.api as any).settingsSetKey('gemini_api_key', params.trimmedKey);
    if (keyRes && keyRes.success === false) {
      return { success: false, provider: candidate, error: keyRes.error || 'Ошибка записи ключа Gemini в сейф' };
    }
  }
  const res = await params.saveProvider(candidate);
  if (res && res.success === false) {
    return { success: false, provider: candidate, error: res.error || 'Не удалось сохранить провайдера ИИ' };
  }
  return { success: true, provider: candidate };
}
