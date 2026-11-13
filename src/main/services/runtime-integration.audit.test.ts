import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const mockWins = vi.hoisted(() => ({ list: [] as any[] }));
const mockIpcOnce = vi.hoisted(() => vi.fn());
const mockIpcRemove = vi.hoisted(() => vi.fn());
const mockTempDir = vi.hoisted(() => ({ path: '' }));
const mockExecuteOpenAI = vi.hoisted(() => vi.fn());
const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockAxiosPost = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      if (name === 'temp') return mockTempDir.path || os.tmpdir();
      return mockTempDir.path || os.tmpdir();
    },
    getAppPath: () => mockTempDir.path || os.tmpdir(),
    getVersion: () => '1.0.12'
  },
  BrowserWindow: {
    getAllWindows: () => mockWins.list
  },
  ipcMain: {
    once: (...args: any[]) => mockIpcOnce(...args),
    removeListener: (...args: any[]) => mockIpcRemove(...args),
    handle: vi.fn()
  },
  dialog: {
    showSaveDialog: vi.fn()
  }
}));

vi.mock('axios', () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
    post: (...args: any[]) => mockAxiosPost(...args),
    isCancel: (err: any) => Boolean(err && (err.__CANCEL__ || err.code === 'ERR_CANCELED'))
  },
  get: (...args: any[]) => mockAxiosGet(...args),
  post: (...args: any[]) => mockAxiosPost(...args),
  isCancel: (err: any) => Boolean(err && (err.__CANCEL__ || err.code === 'ERR_CANCELED'))
}));

vi.mock('./llm/providers/openai.provider', () => ({
  executeOpenAICompatibleRequest: (...args: any[]) => mockExecuteOpenAI(...args)
}));

import { executeRequestFallbackChain } from './llm/request-executor';
import { providerHealthManager } from './llm/providers/provider-health';
import { TTSService } from './tts.service';
import { PythonServerService } from './python_server.service';
import { DatabaseService } from './database';
import { DatabaseSafeModeError } from './database-recovery.util';
import { maskSecrets, sanitizeError, sanitizeStackTrace } from '../../shared/utils/log-sanitizer';
import { ipcLifecycle, withIpcRetryAndTimeout } from '../../shared/utils/ipc-resilience';
import { sanitizeLogLine } from './diagnostics.service';
import { logger } from '../utils/logger';

describe('v1.0.13 Deep Runtime Audit — Multi-Subsystem Integration Suite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-runtime-audit-'));
    mockTempDir.path = tmpDir;
    mockWins.list = [];
    mockIpcOnce.mockReset();
    mockIpcRemove.mockReset();
    mockExecuteOpenAI.mockReset();
    mockAxiosGet.mockReset();
    mockAxiosPost.mockReset();
    providerHealthManager.resetAll();
  });

  afterEach(() => {
    PythonServerService.stop();
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Contour 1 & 2: LLM Failover, Provider Health & Immediate Abort Cancellation', () => {
    it('fails over from primary model to secondary model on error and marks provider healthy when secondary succeeds', async () => {
      const provider: any = {
        id: 'cloud_openrouter',
        name: 'OpenRouter',
        type: 'cloud',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'model-primary',
        selectedModels: ['model-primary', 'model-secondary'],
        enabled: true
      };

      mockExecuteOpenAI
        .mockImplementationOnce(async () => {
          const err: any = new Error('Model Not Found');
          err.response = { status: 404 };
          throw err;
        })
        .mockImplementationOnce(async (_prov: any, _text: string, _ctx: any[], _abort: AbortController, cb: any) => {
          cb('Ответ резервной модели', true);
        });

      const chunks: string[] = [];
      const abortController = new AbortController();
      const usedModel = await executeRequestFallbackChain(
        provider,
        'Проверка отказоустойчивости',
        [],
        abortController,
        (chunk) => { if (chunk) chunks.push(chunk); }
      );

      expect(usedModel).toBe('model-secondary');
      expect(chunks.join('')).toBe('Ответ резервной модели');
      expect(providerHealthManager.getHealth('cloud_openrouter').healthy).toBe(true);
    });

    it('terminates retry backoff immediately on AbortController cancellation without penalizing provider health', async () => {
      const provider: any = {
        id: 'cloud_timeout_test',
        name: 'TimeoutTestProvider',
        type: 'cloud',
        endpoint: 'https://api.example.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        selectedModels: ['gpt-4o-mini'],
        enabled: true
      };

      const abortController = new AbortController();

      mockExecuteOpenAI.mockImplementationOnce(async () => {
        // Trigger a timeout error that normally causes a 2000ms retry sleep
        setTimeout(() => abortController.abort(), 30);
        const err: any = new Error('timeout of 15000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      });

      const startMs = Date.now();
      await executeRequestFallbackChain(
        provider,
        'Тест отмены во время retry',
        [],
        abortController,
        () => {}
      );
      const elapsedMs = Date.now() - startMs;

      // Should abort in ~30-150ms instead of waiting the full 2000ms backoff
      expect(elapsedMs).toBeLessThan(750);
      // Provider health must NOT be marked failed or quarantined on user cancellation
      const health = providerHealthManager.getHealth('cloud_timeout_test');
      expect(health.consecutiveFails).toBe(0);
      expect(health.inQuarantineUntil).toBe(0);
    });

    it('enforces DB_SAFE_MODE write-lock while allowing read-only queries', () => {
      const dbPath = path.join(tmpDir, 'corrupt_sim.db');
      const status = DatabaseService.initWithConfig({
        dbPath,
        DatabaseClass: undefined,
        isTestEnv: false
      });

      expect(status.mode).toBe('DB_SAFE_MODE');
      expect(status.isSafeMode).toBe(true);
      expect(status.readOnly).toBe(true);

      // Read-only SELECT works without throwing
      const rows = DatabaseService.db.prepare('SELECT * FROM arc_tasks').all();
      expect(Array.isArray(rows)).toBe(true);

      // Mutating INSERT throws DatabaseSafeModeError
      expect(() => {
        DatabaseService.db.prepare('INSERT INTO arc_tasks (id, text, created_at) VALUES (?, ?, ?)').run('1', 'test', Date.now());
      }).toThrow(DatabaseSafeModeError);

      // Restore test memory DB for subsequent tests
      DatabaseService.initWithConfig({ dbPath: ':memory:', isTestEnv: true });
    });
  });

  describe('Contour 1, 2 & 3: TTSService Temp File Cleanup, Destroyed Window Safety & Python Circuit Breaker', () => {
    it('deletes temp_speech_*.wav after Silero synthesis & playback and safely ignores destroyed BrowserWindows', async () => {
      const tts = new TTSService();
      tts.notifySileroOnline();

      // Include one destroyed window (whose send throws if called) and one healthy window
      const destroyedWin = {
        isDestroyed: () => true,
        webContents: {
          isDestroyed: () => true,
          send: vi.fn(() => {
            throw new Error('TypeError: Object has been destroyed');
          })
        }
      };
      const healthyWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn()
        }
      };
      mockWins.list = [destroyedWin, healthyWin];

      mockAxiosPost.mockResolvedValueOnce({
        data: Buffer.from('RIFF_DUMMY_WAV_AUDIO_CONTENT'),
        headers: { 'x-dsp-error': 'ffmpeg_missing' }
      });

      mockIpcOnce.mockImplementation((channel: string, listener: () => void) => {
        if (channel === 'voice:play-audio-done') {
          setTimeout(() => listener(), 10);
        }
      });

      await tts.speak('Проверка очистки временного файла и защиты окна', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true, 'q-audit-1');

      // Destroyed window must never have its webContents.send invoked
      expect(destroyedWin.webContents.send).not.toHaveBeenCalled();
      expect(healthyWin.webContents.send).toHaveBeenCalledWith('voice:play-audio', expect.stringContaining('data:audio/wav;base64,'));

      // Verify zero temp_speech_*.wav files remain in tmpDir
      const remainingTempWavFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith('temp_speech_') && f.endsWith('.wav'));
      expect(remainingTempWavFiles).toEqual([]);

      // Also verify stop() does not throw when destroyed window is in BrowserWindow.getAllWindows()
      expect(() => tts.stop(true)).not.toThrow();
      expect(destroyedWin.webContents.send).not.toHaveBeenCalled();
    });

    it('prevents duplicate concurrent PythonServerService.start() calls when isStarting is active', async () => {
      const resolveSpy = vi.spyOn(PythonServerService, 'resolvePythonExe').mockImplementation(() => {
        return null;
      });
      const fakeWin: any = {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: vi.fn() }
      };

      const p1 = PythonServerService.start(fakeWin);
      const p2 = PythonServerService.start(fakeWin);
      await Promise.all([p1, p2]);

      // Second concurrent call was skipped by isStarting guard
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Contour 3: Secret Masking Across Logs, URLs, Headers & Diagnostics', () => {
    it('masks Bearer tokens, sk-/AIza/hf_/ghp_ keys, x-api-key headers, and URL query keys in maskSecrets, sanitizeError, and logger', () => {
      const rawUrlError: any = new Error('Request failed with status code 403');
      rawUrlError.code = 'ERR_BAD_REQUEST';
      rawUrlError.config = {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyDummySecretKey1234567890&token=my_query_token_999',
        headers: {
          Authorization: 'Bearer sk-proj-1234567890abcdefSECRET',
          'x-api-key': 'custom-secret-header-value'
        }
      };

      const sanitized = sanitizeError(rawUrlError);
      expect(sanitized).not.toContain('AIzaSyDummySecretKey1234567890');
      expect(sanitized).not.toContain('my_query_token_999');
      expect(sanitized).not.toContain('sk-proj-1234567890abcdefSECRET');
      expect(sanitized).not.toContain('custom-secret-header-value');
      expect(sanitized).toContain('key=***');
      expect(sanitized).toContain('token=***');

      const headerJson = JSON.stringify({
        'x-api-key': 'super-secret-x-key',
        'x-goog-api-key': 'AIzaSyGoogleSecretKey987654321',
        hfToken: 'hf_abcdef1234567890secret',
        ghToken: 'ghp_abcdef1234567890secret'
      });
      const maskedJson = maskSecrets(headerJson);
      expect(maskedJson).not.toContain('super-secret-x-key');
      expect(maskedJson).not.toContain('AIzaSyGoogleSecretKey987654321');
      expect(maskedJson).not.toContain('hf_abcdef1234567890secret');
      expect(maskedJson).not.toContain('ghp_abcdef1234567890secret');

      const diagLine = sanitizeLogLine('{"userText":"hello","err":"https://example.com/api?api_key=secret_url_param_123&other=1"}');
      expect(diagLine).toContain('"[STRIPPED]"');
      expect(diagLine).not.toContain('secret_url_param_123');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('Auth failure with Bearer sk-live-9876543210secret and ?key=urlSecret777');
      expect(warnSpy).toHaveBeenCalledWith(
        '[WARN]',
        expect.not.stringContaining('sk-live-9876543210secret')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[WARN]',
        expect.not.stringContaining('urlSecret777')
      );
    });

    it('scrubs PII emails, OS user paths, and stack traces via centralized logging middleware before writing to disk', () => {
      const logsDir = path.join(tmpDir, 'central-logs');
      logger.enableDiskLogging(logsDir);
      const seenEntries: any[] = [];
      logger.use((entry) => {
        seenEntries.push(entry);
        return entry;
      });

      const errWithStack = new Error('Crash for operator@secret-domain.org at /Users/ivan_petrov/secret_project/main.ts');
      errWithStack.stack = [
        'Error: Crash for operator@secret-domain.org with sk-secretKey99999999',
        '    at Object.run (/Users/ivan_petrov/secret_project/src/main/index.ts:42:13)',
        '    at Module._compile (node:internal/modules/cjs/loader:1376:14)',
        '    at node_modules/axios/index.js:10:5'
      ].join('\n');

      vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('Fatal failure for user operator@secret-domain.org', errWithStack);
      logger.disableDiskLogging();
      logger.clearMiddlewares();

      expect(seenEntries.length).toBe(1);
      const appLogFile = path.join(logsDir, 'app.log');
      expect(fs.existsSync(appLogFile)).toBe(true);
      const rawDiskContent = fs.readFileSync(appLogFile, 'utf8');
      expect(rawDiskContent).not.toContain('operator@secret-domain.org');
      expect(rawDiskContent).toContain('[EMAIL_REDACTED]');
      expect(rawDiskContent).not.toContain('ivan_petrov');
      expect(rawDiskContent).not.toContain('sk-secretKey99999999');
      expect(rawDiskContent).not.toContain('node_modules/axios');
      expect(sanitizeStackTrace(errWithStack.stack)).not.toContain('ivan_petrov');
    });

    it('implements IPC timeouts, exponential backoff retries, and graceful shutdown draining', async () => {
      ipcLifecycle.resetForTesting();
      let attempts = 0;
      const result = await withIpcRetryAndTimeout(
        async () => {
          attempts++;
          if (attempts < 3) {
            const busyErr: any = new Error('SQLITE_BUSY: database is locked');
            busyErr.code = 'SQLITE_BUSY';
            throw busyErr;
          }
          return 'ok-after-retry';
        },
        { maxRetries: 3, baseDelayMs: 10, jitterMs: 5, timeoutMs: 500 }
      );
      expect(result).toBe('ok-after-retry');
      expect(attempts).toBe(3);

      // Verify in-flight tracking and graceful shutdown drain
      let finishInFlight!: () => void;
      const wrapped = ipcLifecycle.wrapHandler('tasks:save', async () => {
        await new Promise<void>((r) => { finishInFlight = r; });
        return 'saved';
      });

      const inFlightPromise = wrapped();
      expect(ipcLifecycle.getInFlightCount()).toBe(1);

      const mockWin = {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: vi.fn() }
      };
      setTimeout(() => finishInFlight(), 25);
      const drainOutcome = await ipcLifecycle.gracefulShutdown([mockWin], 1000);
      expect(drainOutcome.drained).toBe(true);
      expect(drainOutcome.remainingInFlight).toBe(0);
      expect(await inFlightPromise).toBe('saved');
      expect(mockWin.webContents.send).toHaveBeenCalledWith('app:shutting-down', expect.objectContaining({ timestamp: expect.any(Number) }));

      // New calls after shutdown are rejected with IPC_SHUTTING_DOWN
      await expect(wrapped()).rejects.toThrow(/IPC_SHUTTING_DOWN/);
      ipcLifecycle.resetForTesting();
    });
  });
});

