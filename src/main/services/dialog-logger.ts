import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { maskSecrets, sanitizeError } from '../../shared/utils/log-sanitizer';
import { logger } from '../utils/logger';

export interface LogDetails {
  originalText?: string;
  preprocessed?: boolean;
  provider?: string;
  model?: string;
  isMacro?: boolean;
  aborted?: boolean;
  err?: unknown;
  error?: unknown;
}

export interface DialogLogRecord {
  ts: string;
  level: 'info' | 'error';
  kind: 'dialogs';
  mode: 'meta' | 'full';
  provider?: string;
  model?: string;
  preprocessed: boolean;
  aborted: boolean;
  isMacro: boolean;
  userChars: number;
  responseChars: number;
  err?: string;
  originalText?: string;
  userText?: string;
  arcText?: string;
}

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB per file (dialogs.log, .1, .2 => <= 15 MB total)

export class DialogLogger {
  private static logFilePath: string | null = null;
  private static initialized = false;
  private static customLogsDir: string | undefined = undefined;
  private static fullTextLogging: boolean = process.env.ARC_LOG_DIALOG_TEXT === 'true';

  public static setFullTextLogging(enabled: boolean): void {
    this.fullTextLogging = Boolean(enabled);
  }

  public static isFullTextLogging(): boolean {
    return this.fullTextLogging;
  }

  /**
   * Used only in unit tests to reset cached paths and re-read env/custom dirs.
   * Never exposed via preload.
   */
  public static resetForTesting(customLogsDir?: string): void {
    this.logFilePath = null;
    this.initialized = false;
    this.customLogsDir = customLogsDir;
    this.fullTextLogging = process.env.ARC_LOG_DIALOG_TEXT === 'true';
  }

  private static init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const logsDir = this.customLogsDir
        ? path.resolve(this.customLogsDir)
        : path.join(app.getPath('userData'), 'logs', 'dialogs');

      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      this.logFilePath = path.join(logsDir, 'dialogs.log');
    } catch (e: unknown) {
      this.logFilePath = null;
      logger.warn('[DialogLogger] Failed to create logs directory', sanitizeError(e));
    }
  }

  private static rotateLogs(filePath: string): void {
    const archive1 = `${filePath}.1`;
    const archive2 = `${filePath}.2`;

    if (fs.existsSync(archive2)) {
      fs.unlinkSync(archive2);
    }
    if (fs.existsSync(archive1)) {
      fs.renameSync(archive1, archive2);
    }
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, archive1);
    }
    fs.writeFileSync(filePath, '', 'utf8');
  }

  private static extractMaskedError(arcResponse: string, details: LogDetails): string | undefined {
    const rawErr = details.err ?? details.error;
    if (rawErr !== undefined && rawErr !== null) {
      return maskSecrets(sanitizeError(rawErr));
    }
    if (typeof arcResponse === 'string' && arcResponse.startsWith('[FAILED / ABORTED:')) {
      return maskSecrets(arcResponse);
    }
    return undefined;
  }

  public static log(processedText: string, arcResponse: string, details: LogDetails = {}): void {
    this.init();

    const safeProcessed = typeof processedText === 'string' ? processedText : String(processedText ?? '');
    const safeResponse = typeof arcResponse === 'string' ? arcResponse : String(arcResponse ?? '');
    const userChars = safeProcessed.length;
    const responseChars = safeResponse.length;
    const mode: 'meta' | 'full' = this.fullTextLogging ? 'full' : 'meta';
    const maskedErr = this.extractMaskedError(safeResponse, details);

    const record: DialogLogRecord = {
      ts: new Date().toISOString(),
      level: maskedErr ? 'error' : 'info',
      kind: 'dialogs',
      mode,
      ...(details.provider ? { provider: maskSecrets(details.provider) } : {}),
      ...(details.model ? { model: maskSecrets(details.model) } : {}),
      preprocessed: Boolean(details.preprocessed),
      aborted: Boolean(details.aborted),
      isMacro: Boolean(details.isMacro),
      userChars,
      responseChars,
      ...(maskedErr ? { err: maskedErr } : {})
    };

    if (mode === 'full') {
      if (details.originalText && details.originalText.trim() !== safeProcessed.trim()) {
        record.originalText = maskSecrets(details.originalText);
      }
      record.userText = maskSecrets(safeProcessed);
      record.arcText = maskSecrets(safeResponse);
    }

    logger.info(
      `[DialogLogger] Logged interaction (mode=${mode}, userChars=${userChars}, responseChars=${responseChars})`
    );

    if (!this.logFilePath) return;

    try {
      const entryLine = `${JSON.stringify(record)}\n`;
      const entryBytes = Buffer.byteLength(entryLine, 'utf8');

      if (fs.existsSync(this.logFilePath)) {
        const currentSize = fs.statSync(this.logFilePath).size;
        if (currentSize + entryBytes > MAX_LOG_BYTES) {
          this.rotateLogs(this.logFilePath);
        }
      }

      fs.appendFileSync(this.logFilePath, entryLine, 'utf8');
    } catch (e: unknown) {
      logger.error('[DialogLogger] Error writing to dialog log', sanitizeError(e));
    }
  }
}
