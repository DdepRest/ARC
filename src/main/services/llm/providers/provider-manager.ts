import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import { AiProvider } from './provider.interface';
import { sanitizeBuiltinModelName } from '../prompt-builder';
import { providerHealthManager } from './provider-health';
import {
  secretVault,
  SecretVaultService,
  MASKED_SECRET_PLACEHOLDER,
  type SecretReadResult
} from '../../security/secret-vault.service';

export { MASKED_SECRET_PLACEHOLDER };

function extractLegacyPlainKey(storedKey: string): { plain: string | null; unreadable: boolean } {
  if (!storedKey || typeof storedKey !== 'string') return { plain: null, unreadable: false };
  const trimmed = storedKey.trim();
  if (!trimmed || trimmed === MASKED_SECRET_PLACEHOLDER) return { plain: null, unreadable: false };

  try {
    if (trimmed.startsWith('enc:')) {
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        const payload = trimmed.slice(4);
        const buf = /^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0
          ? Buffer.from(payload, 'hex')
          : Buffer.from(payload, 'base64');
        const decrypted = safeStorage.decryptString(buf).trim();
        return { plain: decrypted || null, unreadable: !decrypted };
      }
      return { plain: null, unreadable: true };
    }
    if (trimmed.startsWith('b64:')) {
      const b64 = trimmed.slice(4);
      const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
      return { plain: decoded || null, unreadable: false };
    }
  } catch (err: any) {
    console.warn(`[ProviderManager] Legacy API key decryption failed: ${err?.message || err}`);
    return { plain: null, unreadable: true };
  }

  return { plain: trimmed.replace(/^["']|["']$/g, ''), unreadable: false };
}

function isGeminiProviderObj(p: Partial<AiProvider>): boolean {
  const id = (p.id || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  const endpoint = (p.endpoint || '').toLowerCase();
  return id.includes('gemini') || name.includes('gemini') || endpoint.includes('googleapis');
}

export class ProviderManager {
  private lastSettings: any = null;
  private configPath: string;
  private providers: AiProvider[] = [];
  private vault: SecretVaultService;
  private initialized = false;

  constructor(customConfigPath?: string, customVault?: SecretVaultService) {
    this.vault = customVault || secretVault;
    if (customConfigPath) {
      this.configPath = customConfigPath;
      this.ensureInitialized();
    } else {
      this.configPath = '';
    }
  }

  private resolveConfigPath(): string {
    if (this.configPath) return this.configPath;
    try {
      if (typeof app === 'undefined' || typeof app.getPath !== 'function') throw new Error('Not in electron env');
      this.configPath = path.join(app.getPath('userData'), 'config', 'ai-providers.json');
    } catch {
      this.configPath = path.join(process.cwd(), '.test-cache', 'ai-providers.json');
    }
    return this.configPath;
  }

  private getDefaultProviders(): AiProvider[] {
    return [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'cloud',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-2.5-flash',
        priority: 1,
        apiKey: '',
        hasApiKey: false,
        maxTokens: 2048,
        temperature: 0.7,
        enabled: true
      }
    ];
  }

  private ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;
    this.resolveConfigPath();
    if (this.ensureConfigExists()) {
      this.loadProviders();
    } else {
      this.providers = this.getDefaultProviders();
    }
  }

  private ensureConfigExists(): boolean {
    try {
      const cfgPath = this.resolveConfigPath();
      const dir = path.dirname(cfgPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(cfgPath)) {
        fs.writeFileSync(cfgPath, JSON.stringify(this.getDefaultProviders(), null, 2));
      }
      return true;
    } catch (e: any) {
      console.warn(`[ProviderManager] Config path unavailable (${e?.message || e}), using in-memory defaults.`);
      return false;
    }
  }

  private loadProviders() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.resolveConfigPath(), 'utf8'));
      let shouldSave = false;
      this.providers = (raw || []).map((p: AiProvider) => {
        let isExclusive = Boolean(p.isExclusive);
        if (isExclusive) {
          console.info(`[ProviderManager] Reset stale isExclusive on provider ${p.name}`);
          isExclusive = false;
          shouldSave = true;
        }

        const storedKey = (p.apiKey || '').trim();
        if (storedKey && storedKey !== MASKED_SECRET_PLACEHOLDER) {
          const { plain, unreadable } = extractLegacyPlainKey(storedKey);
          if (plain) {
            this.vault.setProviderApiKey(p.id, plain, isGeminiProviderObj(p));
            shouldSave = true;
          } else if (!unreadable) {
            shouldSave = true;
          }
        }

        const resolved = this.vault.resolveProviderApiKey(p.id);
        const hasKey = resolved.status === 'ok' && Boolean(resolved.value);

        return {
          ...p,
          isExclusive,
          apiKey: '',
          hasApiKey: hasKey || Boolean(p.hasApiKey && resolved.status === 'unreadable'),
          apiKeyStatus: resolved.status
        };
      });

      if (this.providers.length === 1 && this.providers[0].id === 'ollama') {
        this.providers[0] = this.getDefaultProviders()[0];
        shouldSave = true;
      }

      if (shouldSave) {
        this.saveToFile();
      }
    } catch (e) {
      console.error('Failed to load AI providers', e);
      if (this.providers.length === 0) {
        this.providers = this.getDefaultProviders();
      }
    }
  }

  private saveToFile() {
    try {
      const dataToSave = this.providers.map((p) => {
        const resolved = this.vault.resolveProviderApiKey(p.id);
        const hasApiKey = (resolved.status === 'ok' && Boolean(resolved.value)) || resolved.status === 'unreadable';
        return {
          ...p,
          apiKey: '',
          hasApiKey,
          apiKeyStatus: undefined
        };
      });
      fs.writeFileSync(this.resolveConfigPath(), JSON.stringify(dataToSave, null, 2));
    } catch (e: any) {
      console.warn(`[ProviderManager] Failed to save AI providers config: ${e?.message || e}`);
    }
  }

  public resolveProviderKey(providerId?: string, candidateRawKey?: string): SecretReadResult {
    return this.vault.resolveProviderApiKey(providerId, candidateRawKey);
  }

  public getProviders(): AiProvider[] {
    this.ensureInitialized();
    return this.providers.map((p) => {
      const resolved = this.vault.resolveProviderApiKey(p.id);
      const hasApiKey = resolved.status === 'ok' && Boolean(resolved.value);
      return {
        ...p,
        hasApiKey,
        apiKeyStatus: resolved.status,
        apiKey: hasApiKey ? MASKED_SECRET_PLACEHOLDER : ''
      };
    });
  }

  public getActiveProviders(_settings?: any): AiProvider[] {
    const all = this.getProviders();
    const list: AiProvider[] = [];

    for (const p of all) {
      const resolved = this.vault.resolveProviderApiKey(p.id);
      const hasResolvedKey = resolved.status === 'ok' && Boolean(resolved.value);
      const isKeyAcceptable = hasResolvedKey || p.type !== 'cloud' || Boolean(p.noAuthHeader);

      if (!p.enabled || !isKeyAcceptable) {
        continue;
      }
      list.push(p);
    }

    list.sort((a, b) => {
      const aResolved = this.vault.resolveProviderApiKey(a.id);
      const bResolved = this.vault.resolveProviderApiKey(b.id);
      const aUnresolvedCloud = a.type === 'cloud' && !a.noAuthHeader && aResolved.status !== 'ok';
      const bUnresolvedCloud = b.type === 'cloud' && !b.noAuthHeader && bResolved.status !== 'ok';
      if (aUnresolvedCloud !== bUnresolvedCloud) {
        return aUnresolvedCloud ? 1 : -1;
      }
      return (a.priority || 0) - (b.priority || 0);
    });
    return list;
  }

  public getActiveProvider(settings?: any): AiProvider | undefined {
    const s = settings || this.lastSettings;
    if (s?.useLocalLLM && s?.localLLMModel === 'builtin') {
      return {
        id: 'builtin',
        name: 'Built-in Local AI',
        type: 'local',
        endpoint: 'localhost',
        model: sanitizeBuiltinModelName(s?.builtinLLMModel),
        apiKey: '',
        hasApiKey: false,
        enabled: true,
        priority: 0,
        maxTokens: 2048,
        temperature: 0.1
      };
    }
    const list = this.getActiveProviders(settings);
    return list[0];
  }

  public saveProvider(provider: AiProvider) {
    this.ensureInitialized();
    const rawKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : undefined;
    const isGemini = isGeminiProviderObj(provider);

    if (rawKey !== undefined) {
      if (rawKey === MASKED_SECRET_PLACEHOLDER) {
        // Keep existing key in SecretVaultService untouched
      } else if (rawKey === '') {
        this.vault.deleteProviderApiKey(provider.id);
      } else {
        const { plain } = extractLegacyPlainKey(rawKey);
        if (plain) {
          this.vault.setProviderApiKey(provider.id, plain, isGemini);
        }
      }
    }

    const resolved = this.vault.resolveProviderApiKey(provider.id);
    const hasApiKey = resolved.status === 'ok' && Boolean(resolved.value);

    const cleanProvider: AiProvider = {
      ...provider,
      isExclusive: Boolean(provider.isExclusive),
      apiKey: '',
      hasApiKey,
      apiKeyStatus: resolved.status
    };

    const index = this.providers.findIndex((p) => p.id === cleanProvider.id);
    if (cleanProvider.isExclusive) {
      this.providers.forEach((p) => {
        if (p.id !== cleanProvider.id) p.isExclusive = false;
      });
    }
    if (index !== -1) {
      this.providers[index] = cleanProvider;
    } else {
      this.providers.push(cleanProvider);
    }
    this.saveToFile();
    providerHealthManager.reset(cleanProvider.id);
    this.getActiveProviders();
  }

  public deleteProvider(id: string) {
    this.ensureInitialized();
    this.vault.deleteProviderApiKey(id);
    this.providers = this.providers.filter((p) => p.id !== id);
    this.saveToFile();
  }

  public resolveMultimodalGeminiConfig(settings?: any): MultimodalGeminiConfig {
    const active = this.getActiveProvider(settings);
    const geminiCandidates: AiProvider[] = [];
    if (active && isGeminiProviderObj(active)) {
      geminiCandidates.push(active);
    }
    for (const p of this.getProviders()) {
      if (p.enabled && isGeminiProviderObj(p) && !geminiCandidates.some(c => c.id === p.id)) {
        geminiCandidates.push(p);
      }
    }

    for (const candidate of geminiCandidates) {
      const rawModel = (candidate.model || '').replace(/^(google\/|models\/)/i, '').trim();
      const normalizedModel = rawModel.toLowerCase().includes('gemini') ? rawModel : 'gemini-2.5-flash';
      const keyRes = this.vault.resolveProviderApiKey(candidate.id, candidate.apiKey);
      if (keyRes.status === 'ok' && keyRes.value) {
        return { model: normalizedModel, apiKey: keyRes, source: 'active_provider' };
      }
    }

    const defaultKeyRes = this.vault.resolveGeminiApiKey();
    const firstGeminiModel = geminiCandidates[0]?.model
      ? geminiCandidates[0].model.replace(/^(google\/|models\/)/i, '').trim()
      : '';
    const resolvedModel = firstGeminiModel.toLowerCase().includes('gemini') ? firstGeminiModel : 'gemini-2.5-flash';

    return {
      model: resolvedModel,
      apiKey: defaultKeyRes,
      source: defaultKeyRes.status === 'ok' && defaultKeyRes.value ? 'vault' : 'default'
    };
  }
}

export interface MultimodalGeminiConfig {
  model: string;
  apiKey: SecretReadResult;
  source: 'active_provider' | 'vault' | 'default';
}

export const providerManager = new ProviderManager();

