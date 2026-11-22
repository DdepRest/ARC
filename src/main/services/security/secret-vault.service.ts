import { app, safeStorage } from 'electron';
import path from 'path';
import { sanitizeError } from '../../../shared/utils/log-sanitizer';
import {
  CANONICAL_GEMINI_SECRET_KEY,
  MASKED_SECRET_PLACEHOLDER,
  SESSION_WARNING,
  UNREADABLE_ERROR,
  readRawVaultFileWithStatus,
  writeVaultFileV2Atomic,
  type SecretReadResult,
  type SecretReadStatus,
  type SecretStorageMode,
  type SecretVaultEntryV2,
  type SecretVaultFileV2,
  type SecretWriteResult,
  type SystemSecurityStatus
} from './secret-vault.storage';
import { runLegacyVaultMigration, type LegacyVaultMigrationResult } from './secret-vault.migration';

export {
  CANONICAL_GEMINI_SECRET_KEY,
  MASKED_SECRET_PLACEHOLDER,
  type SecretReadResult,
  type SecretReadStatus,
  type SecretStorageMode,
  type SecretVaultEntryV2,
  type SecretVaultFileV2,
  type SecretWriteResult,
  type SystemSecurityStatus
};

export class SecretVaultService {
  private sessionMemorySecrets = new Map<string, string>();
  private unreadableKeys = new Set<string>();
  private customVaultPath?: string;
  private tmpSeq = 0;

  constructor(customVaultPath?: string) {
    this.customVaultPath = customVaultPath;
  }

  public isSafeStorageAvailable(): boolean {
    try {
      return Boolean(
        safeStorage &&
          typeof safeStorage.isEncryptionAvailable === 'function' &&
          safeStorage.isEncryptionAvailable()
      );
    } catch {
      return false;
    }
  }

  public getVaultFilePath(): string {
    if (this.customVaultPath) return this.customVaultPath;
    try {
      if (app && typeof app.getPath === 'function') {
        const userDataDir = app.getPath('userData');
        if (userDataDir) return path.join(userDataDir, 'secrets.json');
      }
    } catch {
      /* fallback below */
    }
    return path.join(process.cwd(), '.test-cache', 'secrets.json');
  }

  private getLegacySecureKeysPath(): string | null {
    if (this.customVaultPath) return null;
    try {
      if (app && typeof app.getPath === 'function') {
        const userDataDir = app.getPath('userData');
        if (userDataDir) return path.join(userDataDir, 'config', 'secure-keys.json');
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private writeVaultFileV2(
    vault: SecretVaultFileV2,
    expectedPlainByKey?: Record<string, string>
  ): { ok: boolean; error?: string } {
    this.tmpSeq += 1;
    return writeVaultFileV2Atomic(this.getVaultFilePath(), vault, this.tmpSeq, expectedPlainByKey);
  }

  public readVaultV2(): SecretVaultFileV2 {
    const status = readRawVaultFileWithStatus(this.getVaultFilePath());
    const raw = status.validJson ? status.data : null;
    if (raw && raw.schemaVersion === 2 && raw.entries && typeof raw.entries === 'object') {
      return { schemaVersion: 2, entries: { ...raw.entries } } as SecretVaultFileV2;
    }
    return { schemaVersion: 2, entries: {} };
  }

  public migrateLegacySecretsOnStartup(): LegacyVaultMigrationResult {
    return runLegacyVaultMigration({
      isDpapi: this.isSafeStorageAvailable(),
      vaultPath: this.getVaultFilePath(),
      legacyConfigPath: this.getLegacySecureKeysPath(),
      v2Vault: this.readVaultV2(),
      unreadableKeys: this.unreadableKeys,
      sessionMemorySecrets: this.sessionMemorySecrets,
      nextTmpSeq: () => {
        this.tmpSeq += 1;
        return this.tmpSeq;
      }
    });
  }

  public setSecret(keyName: string, plainValue: string): SecretWriteResult {
    const isDpapi = this.isSafeStorageAvailable();
    if (!keyName || !keyName.trim()) {
      return {
        success: false,
        storageMode: isDpapi ? 'dpapi' : 'session_memory_only',
        isEncrypted: false,
        error: 'Key name is required'
      };
    }
    const normalizedKey = keyName.trim();
    const trimmedVal = (plainValue || '').trim();

    if (!trimmedVal) {
      return this.deleteSecret(normalizedKey);
    }

    if (isDpapi) {
      try {
        const encryptedBuf = safeStorage.encryptString(trimmedVal);
        const vault = this.readVaultV2();
        vault.entries[normalizedKey] = {
          encrypted: true,
          ciphertextBase64: encryptedBuf.toString('base64'),
          updatedAt: new Date().toISOString()
        };
        const writeCheck = this.writeVaultFileV2(vault, { [normalizedKey]: trimmedVal });
        if (!writeCheck.ok) {
          return { success: false, storageMode: 'dpapi', isEncrypted: false, error: writeCheck.error };
        }
        this.unreadableKeys.delete(normalizedKey);
        this.sessionMemorySecrets.delete(normalizedKey);
        return { success: true, storageMode: 'dpapi', isEncrypted: true };
      } catch (err: any) {
        console.error(`[SecretVault] Encryption failed for "${normalizedKey}": ${sanitizeError(err)}`);
        return { success: false, storageMode: 'dpapi', isEncrypted: false, error: err?.message || 'Encryption failed' };
      }
    }

    this.unreadableKeys.delete(normalizedKey);
    this.sessionMemorySecrets.set(normalizedKey, trimmedVal);
    return { success: true, storageMode: 'session_memory_only', isEncrypted: false, warning: SESSION_WARNING };
  }

  public getSecret(keyName: string): SecretReadResult {
    if (!keyName || !keyName.trim()) return { status: 'missing', value: null, storageMode: 'dpapi' };
    const normalizedKey = keyName.trim();

    if (this.sessionMemorySecrets.has(normalizedKey)) {
      return {
        status: 'ok',
        value: this.sessionMemorySecrets.get(normalizedKey) || null,
        storageMode: 'session_memory_only'
      };
    }

    const vault = this.readVaultV2();
    const entry = vault.entries[normalizedKey];
    if (!entry) {
      return {
        status: 'missing',
        value: null,
        storageMode: this.isSafeStorageAvailable() ? 'dpapi' : 'session_memory_only'
      };
    }

    if (!this.isSafeStorageAvailable()) {
      this.unreadableKeys.add(normalizedKey);
      return {
        status: 'unreadable',
        value: null,
        storageMode: 'session_memory_only',
        errorMessage: 'DPAPI (safeStorage) недоступен в текущем окружении для расшифровки сохранённого ключа.'
      };
    }

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(entry.ciphertextBase64, 'base64')).trim();
      this.unreadableKeys.delete(normalizedKey);
      return { status: 'ok', value: decrypted, storageMode: 'dpapi' };
    } catch (err: any) {
      this.unreadableKeys.add(normalizedKey);
      console.warn(`[SecretVault] Key "${normalizedKey}" is unreadable under current DPAPI profile: ${sanitizeError(err)}`);
      return { status: 'unreadable', value: null, storageMode: 'dpapi', errorMessage: UNREADABLE_ERROR };
    }
  }

  public deleteSecret(keyName: string): SecretWriteResult {
    const isDpapi = this.isSafeStorageAvailable();
    const storageMode: SecretStorageMode = isDpapi ? 'dpapi' : 'session_memory_only';
    if (!keyName || !keyName.trim()) {
      return { success: false, storageMode, isEncrypted: isDpapi, error: 'Key name is required' };
    }
    const normalizedKey = keyName.trim();
    const vault = this.readVaultV2();
    if (vault.entries[normalizedKey]) {
      delete vault.entries[normalizedKey];
      const writeCheck = this.writeVaultFileV2(vault);
      if (!writeCheck.ok) {
        return { success: false, storageMode, isEncrypted: false, error: writeCheck.error };
      }
    }
    this.sessionMemorySecrets.delete(normalizedKey);
    this.unreadableKeys.delete(normalizedKey);
    return { success: true, storageMode, isEncrypted: isDpapi };
  }

  public hasSecret(keyName: string): { hasKey: boolean; status: SecretReadStatus; storageMode: SecretStorageMode } {
    const res = this.getSecret(keyName);
    return { hasKey: res.status === 'ok' && Boolean(res.value), status: res.status, storageMode: res.storageMode };
  }

  public getProviderSecretKey(providerId: string): string {
    return `provider:${providerId}:api_key`;
  }

  public resolveProviderApiKey(providerId?: string, candidateRawKey?: string): SecretReadResult {
    const trimmedCandidate = (candidateRawKey || '').trim().replace(/^["']|["']$/g, '');
    if (
      trimmedCandidate &&
      trimmedCandidate !== MASKED_SECRET_PLACEHOLDER &&
      !trimmedCandidate.startsWith('enc:') &&
      !trimmedCandidate.startsWith('b64:')
    ) {
      return {
        status: 'ok',
        value: trimmedCandidate,
        storageMode: this.isSafeStorageAvailable() ? 'dpapi' : 'session_memory_only'
      };
    }
    if (!providerId) return { status: 'missing', value: null, storageMode: 'dpapi' };
    if (providerId.toLowerCase().includes('gemini')) {
      const canonical = this.resolveGeminiApiKey();
      if (canonical.status !== 'missing') return canonical;
    }
    return this.getSecret(this.getProviderSecretKey(providerId));
  }

  public setProviderApiKey(providerId: string, plainKey: string, isGeminiProvider: boolean = false): SecretWriteResult {
    const isGemini = isGeminiProvider || providerId.toLowerCase().includes('gemini');
    if (isGemini) {
      const res = this.setSecret(CANONICAL_GEMINI_SECRET_KEY, plainKey);
      if (res.success) {
        this.deleteSecret(this.getProviderSecretKey(providerId));
        if (providerId !== 'gemini') this.deleteSecret(this.getProviderSecretKey('gemini'));
        const clean = (plainKey || '').trim();
        if (clean) process.env.GEMINI_API_KEY = clean;
        else delete process.env.GEMINI_API_KEY;
      }
      return res;
    }
    return this.setSecret(this.getProviderSecretKey(providerId), plainKey);
  }

  public deleteProviderApiKey(providerId: string): SecretWriteResult {
    const isGemini = providerId.toLowerCase().includes('gemini');
    const aliasRes = this.deleteSecret(this.getProviderSecretKey(providerId));
    if (!aliasRes.success) return aliasRes;
    if (isGemini) {
      const canonicalRes = this.deleteSecret(CANONICAL_GEMINI_SECRET_KEY);
      if (!canonicalRes.success) return canonicalRes;
      if (providerId !== 'gemini') this.deleteSecret(this.getProviderSecretKey('gemini'));
      delete process.env.GEMINI_API_KEY;
    }
    return aliasRes;
  }

  public resolveGeminiApiKey(): SecretReadResult {
    const direct = this.getSecret(CANONICAL_GEMINI_SECRET_KEY);
    if (direct.status === 'ok' && direct.value) return direct;
    const prov = this.getSecret(this.getProviderSecretKey('gemini'));
    if (prov.status === 'ok' && prov.value) return prov;
    const envVal = (process.env.GEMINI_API_KEY || '').trim();
    if (envVal && envVal !== MASKED_SECRET_PLACEHOLDER) {
      return { status: 'ok', value: envVal, storageMode: 'session_memory_only' };
    }
    if (direct.status === 'unreadable') return direct;
    if (prov.status === 'unreadable') return prov;
    return { status: 'missing', value: null, storageMode: this.isSafeStorageAvailable() ? 'dpapi' : 'session_memory_only' };
  }

  public getSecurityStatus(): SystemSecurityStatus {
    const safeStorageAvailable = this.isSafeStorageAvailable();
    const hasSessionSecrets = this.sessionMemorySecrets.size > 0;
    return {
      safeStorageAvailable,
      secretsStorageMode: !safeStorageAvailable || hasSessionSecrets ? 'session_memory_only' : 'dpapi',
      unreadableKeysCount: this.unreadableKeys.size
    };
  }

  public clearSessionMemoryForTest(): void {
    this.sessionMemorySecrets.clear();
    this.unreadableKeys.clear();
  }
}

export const secretVault = new SecretVaultService();
