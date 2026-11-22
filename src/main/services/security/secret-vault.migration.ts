import { safeStorage } from 'electron';
import fs from 'fs';
import { sanitizeError } from '../../../shared/utils/log-sanitizer';
import {
  CANONICAL_GEMINI_SECRET_KEY,
  isGeminiAliasKey,
  readRawVaultFileWithStatus,
  writeVaultFileV2Atomic,
  type SecretVaultFileV2
} from './secret-vault.storage';

export interface LegacyVaultMigrationContext {
  isDpapi: boolean;
  vaultPath: string;
  legacyConfigPath: string | null;
  v2Vault: SecretVaultFileV2;
  unreadableKeys: Set<string>;
  sessionMemorySecrets: Map<string, string>;
  nextTmpSeq: () => number;
}

export interface LegacyVaultMigrationResult {
  migratedCount: number;
  movedToSessionCount: number;
  success: boolean;
  error?: string;
}

export function runLegacyVaultMigration(ctx: LegacyVaultMigrationContext): LegacyVaultMigrationResult {
  let migratedCount = 0;
  let movedToSessionCount = 0;
  const { isDpapi, vaultPath, legacyConfigPath, v2Vault } = ctx;
  const candidateFiles = [vaultPath];
  if (legacyConfigPath && legacyConfigPath !== vaultPath && fs.existsSync(legacyConfigPath)) {
    candidateFiles.push(legacyConfigPath);
  }

  const expectedPlainByKey: Record<string, string> = {};
  const pendingSessionSecrets = new Map<string, string>();
  let v2Modified = false;
  let legacyFileHadSkippedEntries = false;

  for (const filePath of candidateFiles) {
    const rawStatus = readRawVaultFileWithStatus(filePath);
    const raw = rawStatus.validJson ? rawStatus.data : null;
    if (!raw || typeof raw !== 'object' || raw.schemaVersion === 2) continue;

    for (const [keyName, record] of Object.entries(raw)) {
      if (!record || typeof record !== 'object') continue;
      const rec = record as { encrypted?: boolean; data?: string; ciphertextBase64?: string };
      const targetKey = isGeminiAliasKey(keyName) ? CANONICAL_GEMINI_SECRET_KEY : keyName;

      if (rec.encrypted === true && typeof rec.ciphertextBase64 === 'string') {
        if (isDpapi) {
          try {
            const dec = safeStorage.decryptString(Buffer.from(rec.ciphertextBase64, 'base64')).trim();
            if (dec && !v2Vault.entries[targetKey]) {
              v2Vault.entries[targetKey] = {
                encrypted: true,
                ciphertextBase64: rec.ciphertextBase64,
                updatedAt: new Date().toISOString()
              };
              expectedPlainByKey[targetKey] = dec;
              migratedCount++;
            }
          } catch {
            ctx.unreadableKeys.add(targetKey);
            if (filePath === legacyConfigPath) legacyFileHadSkippedEntries = true;
          }
        } else {
          if (!v2Vault.entries[targetKey]) {
            v2Vault.entries[targetKey] = {
              encrypted: true,
              ciphertextBase64: rec.ciphertextBase64,
              updatedAt: new Date().toISOString()
            };
          }
          if (filePath === legacyConfigPath) legacyFileHadSkippedEntries = true;
        }
        v2Modified = true;
        continue;
      }
      if (typeof rec.data !== 'string' || !rec.data) continue;

      let plainText: string | null = null;
      if (rec.encrypted === true) {
        if (isDpapi) {
          try {
            const buf =
              /^[0-9a-fA-F]+$/.test(rec.data) && rec.data.length % 2 === 0
                ? Buffer.from(rec.data, 'hex')
                : Buffer.from(rec.data, 'base64');
            plainText = safeStorage.decryptString(buf);
          } catch {
            ctx.unreadableKeys.add(targetKey);
            if (filePath === legacyConfigPath) legacyFileHadSkippedEntries = true;
          }
        } else if (filePath === legacyConfigPath) {
          legacyFileHadSkippedEntries = true;
        }
      } else {
        try {
          plainText = Buffer.from(rec.data, 'base64').toString('utf-8');
        } catch {
          plainText = null;
        }
      }

      if (plainText && plainText.trim()) {
        const clean = plainText.trim();
        if (isDpapi) {
          const encryptedBuf = safeStorage.encryptString(clean);
          v2Vault.entries[targetKey] = {
            encrypted: true,
            ciphertextBase64: encryptedBuf.toString('base64'),
            updatedAt: new Date().toISOString()
          };
          expectedPlainByKey[targetKey] = clean;
          migratedCount++;
        } else {
          pendingSessionSecrets.set(targetKey, clean);
          movedToSessionCount++;
        }
        v2Modified = true;
      }
    }
    if (filePath === vaultPath) v2Modified = true;
  }

  if (isDpapi) {
    for (const existingKey of Object.keys(v2Vault.entries)) {
      if (existingKey !== CANONICAL_GEMINI_SECRET_KEY && isGeminiAliasKey(existingKey)) {
        try {
          const dec = safeStorage
            .decryptString(Buffer.from(v2Vault.entries[existingKey].ciphertextBase64, 'base64'))
            .trim();
          if (dec && !v2Vault.entries[CANONICAL_GEMINI_SECRET_KEY]) {
            const enc = safeStorage.encryptString(dec);
            v2Vault.entries[CANONICAL_GEMINI_SECRET_KEY] = {
              encrypted: true,
              ciphertextBase64: enc.toString('base64'),
              updatedAt: new Date().toISOString()
            };
            expectedPlainByKey[CANONICAL_GEMINI_SECRET_KEY] = dec;
            migratedCount++;
          }
          delete v2Vault.entries[existingKey];
          v2Modified = true;
        } catch {
          ctx.unreadableKeys.add(existingKey);
        }
      }
    }
  }

  if (v2Modified) {
    const writeCheck = writeVaultFileV2Atomic(
      vaultPath,
      v2Vault,
      ctx.nextTmpSeq(),
      Object.keys(expectedPlainByKey).length > 0 ? expectedPlainByKey : undefined
    );
    if (!writeCheck.ok) {
      return { migratedCount: 0, movedToSessionCount: 0, success: false, error: writeCheck.error };
    }
  }

  for (const [k, v] of pendingSessionSecrets.entries()) {
    ctx.sessionMemorySecrets.set(k, v);
  }

  if (!legacyFileHadSkippedEntries && legacyConfigPath && legacyConfigPath !== vaultPath && fs.existsSync(legacyConfigPath)) {
    try {
      fs.unlinkSync(legacyConfigPath);
    } catch (err) {
      console.warn(`[SecretVault] Failed to remove legacy secret file: ${sanitizeError(err)}`);
    }
  }
  return { migratedCount, movedToSessionCount, success: true };
}
