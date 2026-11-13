import { ipcMain, BrowserWindow } from 'electron';
import { sanitizeError } from '../../shared/utils/log-sanitizer';
import {
  secretVault,
  type SecretVaultFileV2
} from '../services/security/secret-vault.service';

export interface SecureStorageFile {
  [keyName: string]: {
    encrypted: boolean;
    data: string;
  };
}

let hasLoggedSessionMemoryFallback = false;

export function resetPlaintextFallbackLogForTest(): void {
  hasLoggedSessionMemoryFallback = false;
  secretVault.clearSessionMemoryForTest();
}

export function logPlaintextFallbackOnce(): void {
  if (!hasLoggedSessionMemoryFallback) {
    hasLoggedSessionMemoryFallback = true;
    console.warn('[Security] safeStorage unavailable: session_memory_only mode active (no plaintext written to disk)');
  }
}

export function getSecureStoragePath(): string {
  return secretVault.getVaultFilePath();
}

export function readSecureStorage(): SecretVaultFileV2 {
  return secretVault.readVaultV2();
}

function sendSecurityToast(message: string, type: 'info' | 'warning' | 'error' = 'warning', duration = 6500): void {
  try {
    if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (!win.isDestroyed()) {
        win.webContents.send('ui:show-toast', { message, type, duration });
      }
    }
  } catch {
    // ignore in headless/test mode
  }
}

export function handleGetKey(keyName: string) {
  try {
    if (!keyName) return { success: false, error: 'Key name is required' };
    const result = secretVault.getSecret(keyName);
    const isEncAvailable = secretVault.isSafeStorageAvailable();

    if (result.status === 'missing') {
      return {
        success: true,
        value: '',
        status: 'missing' as const,
        storageMode: result.storageMode,
        isEncrypted: isEncAvailable,
        warning: isEncAvailable
          ? undefined
          : 'DPAPI недоступен: ключи хранятся только в памяти текущей сессии'
      };
    }

    if (result.status === 'unreadable') {
      return {
        success: false,
        value: '',
        status: 'unreadable' as const,
        storageMode: result.storageMode,
        isEncrypted: false,
        error: result.errorMessage || 'Ключ повреждён или зашифрован под другим профилем Windows (DPAPI)'
      };
    }

    return {
      success: true,
      value: result.value || '',
      status: 'ok' as const,
      storageMode: result.storageMode,
      isEncrypted: result.storageMode === 'dpapi',
      warning:
        result.storageMode === 'session_memory_only'
          ? 'Ключ сохранён только в памяти текущей сессии (DPAPI недоступен)'
          : undefined
    };
  } catch (err: any) {
    console.error(`[Settings-IPC] Error retrieving key "${keyName}": ${sanitizeError(err)}`);
    return { success: false, error: err.message || 'Decryption failed' };
  }
}

export function handleHasKey(keyName: string) {
  if (!keyName) return { success: false, hasKey: false, status: 'missing' as const };
  const res = secretVault.hasSecret(keyName);
  return {
    success: true,
    hasKey: res.hasKey,
    status: res.status,
    storageMode: res.storageMode
  };
}

export function handleSetKey(keyName: string, value: string) {
  try {
    if (!keyName) return { success: false, error: 'Key name is required' };
    const normalized = keyName.trim();
    const isGemini = normalized.toLowerCase() === 'gemini_api_key' || normalized === 'GEMINI_API_KEY';

    if (isGemini) {
      process.env.GEMINI_API_KEY = value ? value.trim() : '';
    }

    const writeRes = secretVault.setSecret(normalized, value);
    if (isGemini && value && value.trim()) {
      secretVault.setSecret(secretVault.getProviderSecretKey('gemini'), value.trim());
    } else if (isGemini && (!value || !value.trim())) {
      secretVault.deleteProviderApiKey('gemini');
    }

    if (writeRes.storageMode === 'session_memory_only' && value && value.trim()) {
      logPlaintextFallbackOnce();
      sendSecurityToast(
        'DPAPI недоступен: ключ сохранён только в памяти текущей сессии и не записан на диск.',
        'warning'
      );
    }

    return {
      success: writeRes.success,
      storageMode: writeRes.storageMode,
      isEncrypted: writeRes.isEncrypted,
      warning: writeRes.warning,
      error: writeRes.error
    };
  } catch (err: any) {
    console.error(`[Settings-IPC] Error saving key "${keyName}": ${sanitizeError(err)}`);
    return { success: false, error: err.message || 'Encryption failed' };
  }
}

export function loadStoredKeysToEnv(): void {
  try {
    secretVault.migrateLegacySecretsOnStartup();
    if (!process.env.GEMINI_API_KEY) {
      const geminiRes = secretVault.resolveGeminiApiKey();
      if (geminiRes.status === 'ok' && geminiRes.value) {
        process.env.GEMINI_API_KEY = geminiRes.value.trim();
      }
    }
  } catch (err) {
    console.warn(`[Settings-IPC] Failed to hydrate keys on startup: ${sanitizeError(err)}`);
  }
}

export function registerSettingsIpc() {
  loadStoredKeysToEnv();

  ipcMain.handle('settings:is-safe-storage-available', () => {
    return {
      available: secretVault.isSafeStorageAvailable(),
      security: secretVault.getSecurityStatus()
    };
  });

  ipcMain.handle('settings:get-key', (_event, keyName: string) => {
    return handleGetKey(keyName);
  });

  ipcMain.handle('settings:has-key', (_event, keyName: string) => {
    return handleHasKey(keyName);
  });

  ipcMain.handle('settings:set-key', (_event, keyName: string, value: string) => {
    return handleSetKey(keyName, value);
  });
}
