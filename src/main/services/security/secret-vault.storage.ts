import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { sanitizeError } from '../../../shared/utils/log-sanitizer';
import type { SecretReadStatus, SecretStorageMode, SystemSecurityStatus } from '../database-recovery.types';

export type { SecretReadStatus, SecretStorageMode, SystemSecurityStatus };

export const MASKED_SECRET_PLACEHOLDER = '••••••••••••••••';
export const CANONICAL_GEMINI_SECRET_KEY = 'gemini_api_key';
export const SESSION_WARNING =
  'DPAPI (safeStorage) недоступен: секрет сохранён только в памяти текущей сессии и не записан на диск.';
export const UNREADABLE_ERROR =
  'Секрет зашифрован под другим профилем Windows (DPAPI) или повреждён. Введите ключ заново.';

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

export interface RawVaultReadStatus {
  exists: boolean;
  validJson: boolean;
  data: any | null;
}

export interface VaultWriteCheck {
  ok: boolean;
  error?: string;
}

export function formatSafeDiskError(err: any): string {
  const code = typeof err?.code === 'string' && err.code ? err.code : 'IO_ERROR';
  if (code === 'EACCES' || code === 'EPERM') {
    return `Ключ не сохранён: нет прав на запись (${code}).`;
  }
  if (code === 'ENOSPC') {
    return 'Ключ не сохранён: недостаточно места на диске (ENOSPC).';
  }
  if (code === 'EROFS') {
    return 'Ключ не сохранён: файловая система доступна только для чтения (EROFS).';
  }
  return `Ключ не сохранён: ошибка записи на диск (${code}).`;
}

export function isGeminiAliasKey(keyName: string): boolean {
  const lower = keyName.trim().toLowerCase();
  return (
    lower === CANONICAL_GEMINI_SECRET_KEY ||
    (lower.startsWith('provider:') && lower.endsWith(':api_key') && lower.includes('gemini'))
  );
}

export function readRawVaultFileWithStatus(filePath: string): RawVaultReadStatus {
  try {
    if (!fs.existsSync(filePath)) return { exists: false, validJson: false, data: null };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { exists: true, validJson: Boolean(parsed && typeof parsed === 'object'), data: parsed };
  } catch (err) {
    console.error(`[SecretVault] Failed to read "${filePath}": ${sanitizeError(err)}`);
    return { exists: true, validJson: false, data: null };
  }
}

export function quarantineCorruptVaultFileIfNeeded(filePath: string): void {
  const status = readRawVaultFileWithStatus(filePath);
  if (status.exists && !status.validJson) {
    const backupPath = `${filePath}.corrupt.${Date.now()}.bak`;
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch (err) {
      console.warn(`[SecretVault] Failed to quarantine corrupt vault file: ${sanitizeError(err)}`);
    }
  }
}

export function verifyVaultFileOnDisk(
  filePath: string,
  expectedVault: SecretVaultFileV2,
  expectedPlainByKey?: Record<string, string>
): void {
  const rawDisk = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(rawDisk) as Partial<SecretVaultFileV2>;
  if (!parsed || parsed.schemaVersion !== 2 || !parsed.entries || typeof parsed.entries !== 'object') {
    throw Object.assign(new Error('Schema v2 verification failed after write'), { code: 'VERIFY_SCHEMA_ERROR' });
  }
  for (const [k, expectedEntry] of Object.entries(expectedVault.entries)) {
    const actualEntry = parsed.entries[k];
    if (!actualEntry || actualEntry.encrypted !== true || actualEntry.ciphertextBase64 !== expectedEntry.ciphertextBase64) {
      throw Object.assign(new Error(`Entry mismatch on disk for "${k}"`), { code: 'VERIFY_MISMATCH' });
    }
  }
  if (expectedPlainByKey) {
    for (const [k, expectedPlain] of Object.entries(expectedPlainByKey)) {
      const actualEntry = parsed.entries[k];
      if (!actualEntry || typeof actualEntry.ciphertextBase64 !== 'string') {
        throw Object.assign(new Error(`Missing verified key "${k}" after write`), { code: 'VERIFY_MISSING' });
      }
      const decrypted = safeStorage.decryptString(Buffer.from(actualEntry.ciphertextBase64, 'base64')).trim();
      if (decrypted !== expectedPlain) {
        throw Object.assign(new Error(`DPAPI round-trip verification failed for "${k}"`), { code: 'VERIFY_DECRYPT' });
      }
    }
  }
}

export function writeVaultFileV2Atomic(
  filePath: string,
  vault: SecretVaultFileV2,
  tmpSeq: number,
  expectedPlainByKey?: Record<string, string>
): VaultWriteCheck {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}.${tmpSeq}`);
  let fd: number | null = null;
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    quarantineCorruptVaultFileIfNeeded(filePath);
    const payload = Buffer.from(JSON.stringify(vault, null, 2), 'utf-8');
    fd = fs.openSync(tmpPath, 'w', 0o600);
    fs.writeSync(fd, payload, 0, payload.length);
    try {
      fs.fsyncSync(fd);
    } catch (fsyncErr: any) {
      const code = fsyncErr?.code;
      if (code !== 'EINVAL' && code !== 'ENOTSUP' && code !== 'ENOSYS') throw fsyncErr;
    }
    fs.closeSync(fd);
    fd = null;
    try {
      fs.chmodSync(tmpPath, 0o600);
    } catch {
      /* Windows no-op */
    }
    verifyVaultFileOnDisk(tmpPath, vault, expectedPlainByKey);
    fs.renameSync(tmpPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      /* Windows no-op */
    }
    verifyVaultFileOnDisk(filePath, vault);
    return { ok: true };
  } catch (err: any) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup */
    }
    console.error(`[SecretVault] Failed to persist secrets.json: ${sanitizeError(err)}`);
    return { ok: false, error: formatSafeDiskError(err) };
  }
}
