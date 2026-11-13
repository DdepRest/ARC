import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { mockApp, mockLogger } = vi.hoisted(() => ({
  mockApp: {
    getPath: vi.fn(),
    getAppPath: vi.fn(() => {
      throw new Error('app.getAppPath() must NEVER be called by DialogLogger');
    })
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('electron', () => ({
  app: mockApp
}));

vi.mock('../utils/logger', () => ({
  logger: mockLogger
}));

import { DialogLogger } from './dialog-logger';

describe('Task 1.3 — DialogLogger (userData path, privacy-by-default, maskSecrets, 5 MB x 3 rotation)', () => {
  let tmpUserDataDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ARC_LOG_DIALOG_TEXT;
    tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-dialog-logger-test-'));
    mockApp.getPath.mockReturnValue(tmpUserDataDir);
    DialogLogger.resetForTesting();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('1. writes logs to app.getPath("userData")/logs/dialogs/dialogs.log and never calls app.getAppPath()', () => {
    DialogLogger.log('Привет, АРК', 'Здравствуйте, сэр!', {
      provider: 'OpenRouter',
      model: 'qwen/qwen3-coder:free'
    });

    expect(mockApp.getPath).toHaveBeenCalledWith('userData');
    expect(mockApp.getAppPath).not.toHaveBeenCalled();

    const expectedLogPath = path.join(tmpUserDataDir, 'logs', 'dialogs', 'dialogs.log');
    expect(fs.existsSync(expectedLogPath)).toBe(true);
  });

  it('2. privacy-by-default (fullTextLogging = false): writes only metadata JSON-line without userText, originalText, or arcText, and masks secrets in err', () => {
    expect(DialogLogger.isFullTextLogging()).toBe(false);

    const sensitiveUserText = 'Мой секретный запрос с ключом sk-proj-1234567890abcdef';
    const sensitiveOriginalText = 'Оригинальный голосовой ввод пользователя';
    const sensitiveArcResponse = 'Ответ ассистента с секретом AIzaSyD-9876543210abcdefghijk';

    DialogLogger.log(sensitiveUserText, sensitiveArcResponse, {
      originalText: sensitiveOriginalText,
      preprocessed: true,
      provider: 'OpenRouter',
      model: 'openai/gpt-4o',
      aborted: false,
      isMacro: false,
      err: new Error('Auth failed for Bearer super_secret_token_99999 and sk-or-v1-abcdef123456')
    });

    const logFilePath = path.join(tmpUserDataDir, 'logs', 'dialogs', 'dialogs.log');
    const rawContent = fs.readFileSync(logFilePath, 'utf8');

    // Must NOT contain any user text, original text, or assistant response text
    expect(rawContent).not.toContain('Мой секретный запрос');
    expect(rawContent).not.toContain('Оригинальный голосовой ввод');
    expect(rawContent).not.toContain('Ответ ассистента');
    expect(rawContent).not.toContain('sk-proj-1234567890abcdef');
    expect(rawContent).not.toContain('AIzaSyD-9876543210abcdefghijk');
    expect(rawContent).not.toContain('super_secret_token_99999');
    expect(rawContent).not.toContain('sk-or-v1-abcdef123456');

    const lines = rawContent.trim().split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.kind).toBe('dialogs');
    expect(parsed.mode).toBe('meta');
    expect(parsed.level).toBe('error');
    expect(parsed.provider).toBe('OpenRouter');
    expect(parsed.model).toBe('openai/gpt-4o');
    expect(parsed.preprocessed).toBe(true);
    expect(parsed.userChars).toBe(sensitiveUserText.length);
    expect(parsed.responseChars).toBe(sensitiveArcResponse.length);
    expect(parsed.err).toContain('Bearer ***');
    expect(parsed.err).toContain('sk-***');

    // Fields userText, originalText, arcText must be completely absent in meta mode
    expect('userText' in parsed).toBe(false);
    expect('originalText' in parsed).toBe(false);
    expect('arcText' in parsed).toBe(false);
  });

  it('3. full-text mode (fullTextLogging = true): includes originalText, userText, and arcText with sk-..., AIza..., and Bearer tokens masked via maskSecrets', () => {
    DialogLogger.setFullTextLogging(true);
    expect(DialogLogger.isFullTextLogging()).toBe(true);

    DialogLogger.log(
      'Проверь ключ sk-or-v1-secretkey123456789 и Bearer my_secret_jwt_token_123',
      'Ключ Google AIzaSyDa1234567890abcdefghijk проверен успешно',
      {
        originalText: 'Оригинал с токеном sk-live-999888777666555',
        preprocessed: true,
        provider: 'Gemini',
        model: 'gemini-2.5-flash'
      }
    );

    const logFilePath = path.join(tmpUserDataDir, 'logs', 'dialogs', 'dialogs.log');
    const rawContent = fs.readFileSync(logFilePath, 'utf8');

    expect(rawContent).not.toContain('sk-or-v1-secretkey123456789');
    expect(rawContent).not.toContain('my_secret_jwt_token_123');
    expect(rawContent).not.toContain('AIzaSyDa1234567890abcdefghijk');
    expect(rawContent).not.toContain('sk-live-999888777666555');

    const parsed = JSON.parse(rawContent.trim());
    expect(parsed.mode).toBe('full');
    expect(parsed.originalText).toBe('Оригинал с токеном sk-***');
    expect(parsed.userText).toBe('Проверь ключ sk-*** и Bearer ***');
    expect(parsed.arcText).toBe('Ключ Google AIza*** проверен успешно');
  });

  it('4. rotates dialogs.log -> dialogs.log.1 -> dialogs.log.2 at 5 MB threshold and keeps total files <= 3 (<= 15 MB)', () => {
    const logsDir = path.join(tmpUserDataDir, 'logs', 'dialogs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'dialogs.log');
    const logFile1 = `${logFile}.1`;
    const logFile2 = `${logFile}.2`;

    const fiveMbMinus10 = 5 * 1024 * 1024 - 10;

    // Cycle 1: dialogs.log near 5 MB -> write triggers rotation to .1
    fs.writeFileSync(logFile, Buffer.alloc(fiveMbMinus10, 'A'));
    DialogLogger.log('Первая запись после порога', 'Ответ 1', { provider: 'P1' });

    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.existsSync(logFile1)).toBe(true);
    expect(fs.existsSync(logFile2)).toBe(false);
    expect(fs.statSync(logFile1).size).toBe(fiveMbMinus10);
    expect(fs.statSync(logFile).size).toBeLessThan(1024);

    // Cycle 2: fill dialogs.log near 5 MB again -> rotates .1 -> .2 and log -> .1
    fs.writeFileSync(logFile, Buffer.alloc(fiveMbMinus10, 'B'));
    DialogLogger.log('Вторая запись после порога', 'Ответ 2', { provider: 'P2' });

    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.existsSync(logFile1)).toBe(true);
    expect(fs.existsSync(logFile2)).toBe(true);
    expect(fs.readFileSync(logFile2, 'utf8')[0]).toBe('A');
    expect(fs.readFileSync(logFile1, 'utf8')[0]).toBe('B');

    // Cycle 3: fill dialogs.log near 5 MB a third time -> .2 is overwritten with previous .1 ('B'), no .3 created
    fs.writeFileSync(logFile, Buffer.alloc(fiveMbMinus10, 'C'));
    DialogLogger.log('Третья запись после порога', 'Ответ 3', { provider: 'P3' });

    expect(fs.existsSync(`${logFile}.3`)).toBe(false);
    expect(fs.readFileSync(logFile2, 'utf8')[0]).toBe('B');
    expect(fs.readFileSync(logFile1, 'utf8')[0]).toBe('C');

    const totalSize =
      fs.statSync(logFile).size + fs.statSync(logFile1).size + fs.statSync(logFile2).size;
    expect(totalSize).toBeLessThanOrEqual(15 * 1024 * 1024);
  });

  it('5. does not throw or crash caller when mkdirSync or appendFileSync fails (e.g. read-only filesystem)', () => {
    // Case A: mkdirSync fails during init
    const invalidFileAsDir = path.join(tmpUserDataDir, 'not-a-directory');
    fs.writeFileSync(invalidFileAsDir, 'file-blocking-mkdir', 'utf8');
    DialogLogger.resetForTesting(path.join(invalidFileAsDir, 'logs', 'dialogs'));

    expect(() => {
      DialogLogger.log('Запрос при недоступном каталоге', 'Ответ');
    }).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[DialogLogger] Failed to create logs directory',
      expect.any(String)
    );

    // Case B: appendFileSync fails during write
    DialogLogger.resetForTesting();
    const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => {
      const err: any = new Error('EROFS: read-only file system');
      err.code = 'EROFS';
      throw err;
    });

    expect(() => {
      DialogLogger.log('Запрос при ошибке записи', 'Ответ');
    }).not.toThrow();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[DialogLogger] Error writing to dialog log',
      expect.stringContaining('EROFS')
    );

    appendSpy.mockRestore();
  });
});
