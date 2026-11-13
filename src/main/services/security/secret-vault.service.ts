import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { sanitizeError } from '../../../shared/utils/log-sanitizer';
import type { SecretReadStatus, SecretStorageMode, SystemSecurityStatus } from '../database-recovery.types';

export type { SecretReadStatus, SecretStorageMode, SystemSecurityStatus };

export const MASKED_SECRET_PLACEHOLDER = '••••••••••••••••';
const SESSION_WARNING = 'DPAPI (safeStorage) недоступен: секрет сохранён только в памяти текущей сессии и не записан на диск.';
const UNREADABLE_ERROR = 'Секрет зашифрован под другим профилем Windows (DPAPI) или повреждён. Введите ключ заново.';

export interface SecretVaultEntryV2 {
  encrypted: true;
  ciphertextBase64: string;
  updatedAt: string;
}

export interface SecretVaultFileV2 {
  schemaVersion: 2;
  entries: Record<string, SecretVaultEntryV2>;
}

export interface SecretReadResult {
  status: SecretReadStatus;
  value: string | null;
  storageMode: SecretStorageMode;
  errorMessage?: string;
}

export interface SecretWriteResult {
  success: boolean;
  storageMode: SecretStorageMode;
  isEncrypted: boolean;
  warning?: string;
  error?: string;
}

export class SecretVaultService {
  private sessionMemorySecrets = new Map<string, string>();
  private unreadableKeys = new Set<string>();
  private customVaultPath?: string;

  constructor(customVaultPath?: string) {
    this.customVaultPath = customVaultPath;
  }

  public isSafeStorageAvailable(): boolean {
    try {
      return Boolean(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  public getVaultFilePath(): string {
    if (this.customVaultPath) return this.customVaultPath;
    try {
      if (app && typeof app.getPath === 'function') {
        const userDataDir = app.getPath('userData');
        if (userDataDir) {
          return path.join(userDataDir, 'secrets.json');
        }
      }
    } catch { /* fallback below */ }
    const fallbackDir = path.join(process.cwd(), '.test-cache');
    return path.join(fallbackDir, 'secrets.json');
  }

  private getLegacySecureKeysPath(): string | null {
    if (this.customVaultPath) return null;
    try {
      if (app && typeof app.getPath === 'function') {
        const userDataDir = app.getPath('userData');
        if (userDataDir) return path.join(userDataDir, 'config', 'secure-keys.json');
      }
    } catch { /* ignore */ }
    return null;
  }

  private readRawFile(filePath: string): any | null {
    try {
      if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.error(`[SecretVault] Failed to read "${filePath}": ${sanitizeError(err)}`);
    }
    return null;
  }

  private writeVaultFileV2(vault: SecretVaultFileV2): boolean {
    try {
      const filePath = this.getVaultFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(vault, null, 2), { encoding: 'utf-8', mode: 0o600 });
      try { fs.chmodSync(filePath, 0o600); } catch { /* Windows no-op */ }
      return true;
    } catch (err) {
      console.error(`[SecretVault] Failed to write secrets.json: ${sanitizeError(err)}`);
      return false;
    }
  }

  public readVaultV2(): SecretVaultFileV2 {
    const raw = this.readRawFile(this.getVaultFilePath());
    if (raw && raw.schemaVersion === 2 && raw.entries && typeof raw.entries === 'object') {
      return raw as SecretVaultFileV2;
    }
    return { schemaVersion: 2, entries: {} };
  }

  public migrateLegacySecretsOnStartup(): { migratedCount: number; movedToSessionCount: number } {
    let migratedCount = 0;
    let movedToSessionCount = 0;
    const isDpapi = this.isSafeStorageAvailable();
    const vaultPath = this.getVaultFilePath();
    const legacyConfigPath = this.getLegacySecureKeysPath();
    const candidateFiles = [vaultPath];
    if (legacyConfigPath && legacyConfigPath !== vaultPath && fs.existsSync(legacyConfigPath)) {
      candidateFiles.push(legacyConfigPath);
    }

    const v2Vault = this.readVaultV2();
    let v2Modified = false;

    for (const filePath of candidateFiles) {
      const raw = this.readRawFile(filePath);
      if (!raw || typeof raw !== 'object' || raw.schemaVersion === 2) continue;

      for (const [keyName, record] of Object.entries(raw)) {
        if (!record || typeof record !== 'object') continue;
        const rec = record as { encrypted?: boolean; data?: string; ciphertextBase64?: string };
        if (rec.encrypted === true && typeof rec.ciphertextBase64 === 'string') {
          v2Vault.entries[keyName] = {
            encrypted: true,
            ciphertextBase64: rec.ciphertextBase64,
            updatedAt: new Date().toISOString()
          };
          v2Modified = true;
          continue;
        }
        if (typeof rec.data !== 'string' || !rec.data) continue;

        let plainText: string | null = null;
        if (rec.encrypted === true) {
          if (isDpapi) {
            try {
              const buf = /^[0-9a-fA-F]+$/.test(rec.data) && rec.data.length % 2 === 0
                ? Buffer.from(rec.data, 'hex')
                : Buffer.from(rec.data, 'base64');
              plainText = safeStorage.decryptString(buf);
            } catch {
              this.unreadableKeys.add(keyName);
            }
          }
        } else {
          try { plainText = Buffer.from(rec.data, 'base64').toString('utf-8'); } catch { plainText = null; }
        }

        if (plainText && plainText.trim()) {
          const clean = plainText.trim();
          if (isDpapi) {
            const encryptedBuf = safeStorage.encryptString(clean);
            v2Vault.entries[keyName] = {
              encrypted: true,
              ciphertextBase64: encryptedBuf.toString('base64'),
              updatedAt: new Date().toISOString()
            };
            migratedCount++;
          } else {
            this.sessionMemorySecrets.set(keyName, clean);
            movedToSessionCount++;
          }
          v2Modified = true;
        }
      }
      if (filePath === vaultPath) v2Modified = true;
    }

    if (v2Modified) this.writeVaultFileV2(v2Vault);
    if (legacyConfigPath && legacyConfigPath !== vaultPath && fs.existsSync(legacyConfigPath)) {
      try { fs.unlinkSync(legacyConfigPath); } catch { /* ignore */ }
    }
    return { migratedCount, movedToSessionCount };
  }

  public setSecret(keyName: string, plainValue: string): SecretWriteResult {
    if (!keyName || !keyName.trim()) {
      return { success: false, storageMode: 'dpapi', isEncrypted: false, error: 'Key name is required' };
    }
    const normalizedKey = keyName.trim();
    const trimmedVal = (plainValue || '').trim();

    if (!trimmedVal) {
      this.deleteSecret(normalizedKey);
      const isDpapi = this.isSafeStorageAvailable();
      return {
        success: true,
        storageMode: isDpapi ? 'dpapi' : 'session_memory_only',
        isEncrypted: isDpapi
      };
    }

    this.unreadableKeys.delete(normalizedKey);

    if (this.isSafeStorageAvailable()) {
      try {
        const encryptedBuf = safeStorage.encryptString(trimmedVal);
        const vault = this.readVaultV2();
        vault.entries[normalizedKey] = {
          encrypted: true,
          ciphertextBase64: encryptedBuf.toString('base64'),
          updatedAt: new Date().toISOString()
        };
        this.sessionMemorySecrets.delete(normalizedKey);
        this.writeVaultFileV2(vault);
        return { success: true, storageMode: 'dpapi', isEncrypted: true };
      } catch (err: any) {
        console.error(`[SecretVault] Encryption failed for "${normalizedKey}": ${sanitizeError(err)}`);
        return { success: false, storageMode: 'dpapi', isEncrypted: false, error: err?.message || 'Encryption failed' };
      }
    }

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

  public deleteSecret(keyName: string): void {
    if (!keyName) return;
    const normalizedKey = keyName.trim();
    this.sessionMemorySecrets.delete(normalizedKey);
    this.unreadableKeys.delete(normalizedKey);
    const vault = this.readVaultV2();
    if (vault.entries[normalizedKey]) {
      delete vault.entries[normalizedKey];
      this.writeVaultFileV2(vault);
    }
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

    const primary = this.getSecret(this.getProviderSecretKey(providerId));
    if (primary.status !== 'missing') return primary;
    if (providerId.toLowerCase().includes('gemini')) return this.resolveGeminiApiKey();
    return primary;
  }

  public setProviderApiKey(providerId: string, plainKey: string, isGeminiProvider: boolean = false): SecretWriteResult {
    const keyName = this.getProviderSecretKey(providerId);
    const res = this.setSecret(keyName, plainKey);
    if (isGeminiProvider || providerId.toLowerCase().includes('gemini')) {
      this.setSecret('gemini_api_key', plainKey);
      process.env.GEMINI_API_KEY = (plainKey || '').trim();
    }
    return res;
  }

  public deleteProviderApiKey(providerId: string): void {
    this.deleteSecret(this.getProviderSecretKey(providerId));
  }

  public resolveGeminiApiKey(): SecretReadResult {
    const direct = this.getSecret('gemini_api_key');
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
