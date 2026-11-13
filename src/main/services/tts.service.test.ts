import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeTtsHash, formatTextForSpeech } from './tts-text.util';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
  ipcMain: {
    removeListener: vi.fn(),
    once: vi.fn(),
  },
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { status: 'online' } }),
    post: vi.fn().mockResolvedValue({
      data: Buffer.from('RIFF mock wav'),
      headers: {},
    }),
    isCancel: vi.fn().mockReturnValue(false),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn((cmd, cb) => {
    if (cb) cb(null);
    return { pid: 1234, kill: vi.fn() };
  }),
}));

// Mock cache.service
vi.mock('./cache.service', () => ({
  cacheService: {
    isSpeedTier: vi.fn().mockReturnValue(false),
    generateKey: vi.fn().mockReturnValue('mock-key'),
    get: vi.fn().mockReturnValue(null),
    put: vi.fn(),
    clear: vi.fn(),
  },
}));

// Mock adaptive.service
vi.mock('./adaptive.service', () => ({
  adaptiveService: {
    getCurrentTier: vi.fn().mockReturnValue('balanced'),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('mock-base64'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { TTSService } from './tts.service';
import { logger } from '../utils/logger';
import axios from 'axios';

describe('TTS Service - Delta 10 deduplication & cancellation', () => {
  let tts: TTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    tts = new TTSService();
  });

  afterEach(() => {
    tts.stop(false);
  });

  it('computes deterministic hashes for identical normalized text', () => {
    const hash1 = computeTtsHash('  Привет, мир!  ');
    const hash2 = computeTtsHash('привет, мир!');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);

    const hashWithQuery1 = computeTtsHash('Погода ясная', 'query-123');
    const hashWithQuery2 = computeTtsHash('Погода ясная', 'query-123');
    const hashWithOtherQuery = computeTtsHash('Погода ясная', 'query-456');

    expect(hashWithQuery1).toBe(hashWithQuery2);
    expect(hashWithQuery1).not.toBe(hashWithOtherQuery);
  });

  it('formats text for speech correctly by pronouncing A.R.C. as АРК and stripping markdown', () => {
    const formatted = formatTextForSpeech('Hello A.R.C. and **bold** text `code`');
    expect(formatted).toContain('АРК');
    expect(formatted).not.toContain('**');
    expect(formatted).not.toContain('`');
  });

  it('suppresses duplicate speak requests when called consecutively with identical text', async () => {
    const text = 'Температура в Горловке плюс двадцать один градус.';
    
    // First call
    await tts.speak(text);
    expect(axios.post).toHaveBeenCalledTimes(1);

    // Immediate duplicate call without force
    await tts.speak(text);
    // Should NOT call axios a second time
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[TTS] Duplicate speak request suppressed'));
  });

  it('allows duplicate speak requests when force: true is passed', async () => {
    const text = 'Температура в Горловке плюс двадцать один градус.';
    
    // First call
    await tts.speak(text);
    expect(axios.post).toHaveBeenCalledTimes(1);

    // Duplicate call WITH force: true (e.g. user manually clicked play)
    await tts.speak(text, 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('cancels active synthesis on stop() and aborts in-flight request', async () => {
    tts.stop(true);
    expect(logger.info).toHaveBeenCalledWith('ARC TTS: Stop requested.');
  });

  it('speakAndWait resolves immediately when audio playback completes before timeout', async () => {
    const start = Date.now();
    await tts.speakAndWait('Секунду, уточняю в энциклопедии...', 5000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('speakAndWait fails open after timeoutMs when speak hangs and preserves barge-in stop()', async () => {
    vi.spyOn(tts, 'speak').mockImplementationOnce(() => new Promise<void>(() => {
      // Simulates hung playback that never resolves on its own
    }));

    const start = Date.now();
    await tts.speakAndWait('Зависшая фраза', 80);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(elapsed).toBeLessThan(1000);
  });

  it("setProvider('edge') skips waitForPythonServer/speakWithSileroTTS, calls speakWithEdgeTTS, and sets activeEngine to 'edge'", async () => {
    const waitSpy = vi.fn();
    const sileroSpy = vi.fn();
    const edgeSpy = vi.fn().mockResolvedValue(undefined);
    (tts as any).waitForPythonServer = waitSpy;
    (tts as any).speakWithSileroTTS = sileroSpy;
    (tts as any).speakWithEdgeTTS = edgeSpy;

    tts.setProvider('edge');
    await tts.speak('Проверка прямого вызова Edge', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);

    expect(waitSpy).not.toHaveBeenCalled();
    expect(sileroSpy).not.toHaveBeenCalled();
    expect(edgeSpy).toHaveBeenCalledTimes(1);
    expect(tts.getActiveEngine()).toEqual({ provider: 'edge', activeEngine: 'edge' });
  });

  it("setProvider('native') calls only speakWithSystemTTS and sets activeEngine to 'system'", async () => {
    const waitSpy = vi.fn();
    const sileroSpy = vi.fn();
    const edgeSpy = vi.fn();
    const sysSpy = vi.fn().mockResolvedValue(undefined);
    (tts as any).waitForPythonServer = waitSpy;
    (tts as any).speakWithSileroTTS = sileroSpy;
    (tts as any).speakWithEdgeTTS = edgeSpy;
    (tts as any).speakWithSystemTTS = sysSpy;

    tts.setProvider('native');
    await tts.speak('Проверка системного SAPI', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);

    expect(waitSpy).not.toHaveBeenCalled();
    expect(sileroSpy).not.toHaveBeenCalled();
    expect(edgeSpy).not.toHaveBeenCalled();
    expect(sysSpy).toHaveBeenCalledTimes(1);
    expect(tts.getActiveEngine()).toEqual({ provider: 'native', activeEngine: 'system' });
  });

  it('validates setProvider whitelist and throws descriptive errors for unimplemented or unknown providers', () => {
    expect(() => tts.setProvider('piper')).toThrow('TTS provider not implemented in v1.0');
    expect(() => tts.setProvider('kokoro')).toThrow('TTS provider not implemented in v1.0');
    expect(() => tts.setProvider('unknown-engine')).toThrow('Unknown TTS provider: unknown-engine');

    tts.setProvider('silero');
    expect(tts.getActiveEngine()).toEqual({ provider: 'silero', activeEngine: null });
    tts.setProvider('auto');
    expect(tts.getActiveEngine()).toEqual({ provider: 'auto', activeEngine: null });
  });

  it('runs autoClearCache in non-blocking background mode without awaiting /clear-cache', async () => {
    let clearCacheResolved = false;
    (axios.post as any).mockImplementation((url: string) => {
      if (url.includes('/clear-cache')) {
        return new Promise((resolve) => {
          setTimeout(() => {
            clearCacheResolved = true;
            resolve({ data: { success: true } });
          }, 50);
        });
      }
      return Promise.resolve({ data: Buffer.from('RIFF mock wav'), headers: {} });
    });

    const sileroSpy = vi.fn().mockImplementation(() => {
      // At the moment speakWithSileroTTS starts, /clear-cache must not have blocked it
      expect(clearCacheResolved).toBe(false);
      return Promise.resolve();
    });
    (tts as any).speakWithSileroTTS = sileroSpy;
    (tts as any).isServerKnownReady = true;

    await tts.speak('Проверка фоновой очистки кэша', 'default', 'eugene', 1.0, 0, 48000, true, true, true, true);

    expect(sileroSpy).toHaveBeenCalledTimes(1);
  });

  it('broadcasts tts:meta with engine and isCached status to BrowserWindow instances', async () => {
    const { BrowserWindow } = await import('electron');
    const sendSpy = vi.fn();
    (BrowserWindow.getAllWindows as any).mockReturnValue([
      { isDestroyed: () => false, webContents: { send: sendSpy } }
    ]);
    (tts as any).playAudio = vi.fn().mockResolvedValue(undefined);

    await tts.speak('Проверка метаданных TTS', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true, 'req-42');
    (BrowserWindow.getAllWindows as any).mockReturnValue([]);

    expect(sendSpy).toHaveBeenCalledWith(
      'tts:meta',
      expect.objectContaining({ engine: 'silero', isCached: false, queryId: 'req-42' })
    );
    expect(tts.isBusy()).toBe(false);
  });

  it('resets isBusy() to false after Cache HIT playback and after Python server offline fallback', async () => {
    const { cacheService } = await import('./cache.service');
    (tts as any).isServerKnownReady = true;
    (tts as any).playAudio = vi.fn().mockResolvedValue(undefined);
    (cacheService.get as any).mockReturnValueOnce('/tmp/cached_phrase.wav');

    await tts.speak('Фраза из кэша', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);
    expect(tts.isBusy()).toBe(false);

    // Now simulate Python server offline -> fallback to Edge
    (tts as any).isServerKnownReady = false;
    (tts as any).waitForPythonServer = vi.fn().mockResolvedValue(false);
    (tts as any).speakWithEdgeTTS = vi.fn().mockResolvedValue(undefined);

    await tts.speak('Фраза при недоступном Python', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);
    expect(tts.isBusy()).toBe(false);
    expect(tts.getActiveEngine().activeEngine).toBe('edge');
  });

  it('keeps isBusy() true when an earlier preempted speak() finishes its finally block while the newer speak() is still in flight', async () => {
    (tts as any).isServerKnownReady = true;
    (tts as any).playAudio = vi.fn().mockResolvedValue(undefined);

    let resolveFirstSilero!: () => void;
    let resolveSecondSilero!: () => void;

    const firstDone = new Promise<void>((r) => { resolveFirstSilero = r; });
    const secondDone = new Promise<void>((r) => { resolveSecondSilero = r; });

    let callIndex = 0;
    (tts as any).speakWithSileroTTS = vi.fn().mockImplementation(() => {
      callIndex++;
      return callIndex === 1 ? firstDone : secondDone;
    });

    // 1. Start first speak() -> sets AbortController A
    const speakPromiseA = tts.speak('Первая фраза конкурентного теста', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);
    expect(tts.isBusy()).toBe(true);

    // 2. Start second speak() while first is in flight -> preempts A and sets AbortController B
    const speakPromiseB = tts.speak('Вторая фраза конкурентного теста', 'default', 'eugene', 1.0, 0, 48000, true, true, false, true);
    expect(tts.isBusy()).toBe(true);

    // 3. First speak() finishes and runs its finally block
    resolveFirstSilero();
    await speakPromiseA;

    // 4. Second speak() is still running -> isBusy() MUST still be true (AbortController B was not cleared by A's finally)
    expect(tts.isBusy()).toBe(true);

    // 5. Second speak() finishes -> its finally block clears AbortController B -> isBusy() becomes false
    resolveSecondSilero();
    await speakPromiseB;
    expect(tts.isBusy()).toBe(false);
  });
});



