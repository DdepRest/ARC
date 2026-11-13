import { EventEmitter } from 'events';
import { aiRouter } from './llm/ai.router';
import type { AiProvider } from './llm/providers/provider.interface';
import { providerManager } from './llm/providers/provider-manager';
import { testConnection, getAvailableModels } from './llm/providers/provider.api';
import { preprocessText } from './llm/prompt-builder';
import { kvPrefillService } from './llm/kv-prefill.service';

export class AiService extends EventEmitter {
  constructor() {
    super();
  }

  public async request(
    text: string,
    context: any[],
    callback: (chunk: string, done: boolean, isSearching?: boolean, toolSource?: any) => void,
    rejectFn?: (e: Error) => void,
    settings?: any,
    routeCallback?: (data: { modelName: string; target: 'local' | 'cloud'; cause: string; step?: 'CLASSIFIER' | 'ROUTER' | 'TOOL_API' | 'RESPONSE' | 'TTS' | null; latency?: number }) => void
  ) {
    return aiRouter.request(text, context, callback, rejectFn, settings, routeCallback);
  }

  public abortCurrentRequest() {
    return aiRouter.abortCurrentRequest();
  }

  public async prefillPartial(params: { partialText: string; context?: any[]; settings?: any; utteranceId?: string }) {
    return await kvPrefillService.prefillPartial(params);
  }

  public async cancelPrefill(reason: string = 'cancelled') {
    return await kvPrefillService.cancelPrefill(reason);
  }

  public getPrefillStats() {
    return kvPrefillService.getStats();
  }

  public getProviders() {
    return providerManager.getProviders();
  }

  public getActiveProvider(settings?: any) {
    return providerManager.getActiveProvider(settings);
  }

  public saveProvider(provider: AiProvider) {
    return providerManager.saveProvider(provider);
  }

  public deleteProvider(id: string) {
    return providerManager.deleteProvider(id);
  }

  public async testConnection(provider: AiProvider) {
    return await testConnection(provider);
  }

  public async getAvailableModels(provider: AiProvider) {
    return await getAvailableModels(provider);
  }

  public async preprocessText(text: string, settings?: any) {
    return await preprocessText(text, settings);
  }
}

export const aiService = new AiService();
export type { AiProvider };
