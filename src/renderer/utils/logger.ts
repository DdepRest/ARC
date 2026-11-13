const DEBUG = import.meta.env ? import.meta.env.DEV : process.env.NODE_ENV !== 'production';

class DeduplicatingLogger {
  private lastMsg = '';
  private lastLevel: 'info' | 'warn' | 'error' | '' = '';
  private repeatCount = 0;
  private flushTimer: any = null;

  private formatArgs(args: any[]): string {
    return args.map(a => {
      if (a === null || a === undefined) return String(a);
      if (typeof a === 'object') {
        try {
          return a.message || JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    }).join(' ');
  }

  private flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.repeatCount > 1 && this.lastLevel) {
      const output = `${this.lastMsg} (x ${this.repeatCount})`;
      if (this.lastLevel === 'info' && DEBUG) console.log('[INFO]', output);
      else if (this.lastLevel === 'warn') console.warn('[WARN]', output);
      else if (this.lastLevel === 'error') console.error('[ERROR]', output);
    }
    this.repeatCount = 0;
    this.lastMsg = '';
    this.lastLevel = '';
  }

  private process(level: 'info' | 'warn' | 'error', ...args: any[]) {
    const msg = this.formatArgs(args);
    if (msg === this.lastMsg && level === this.lastLevel) {
      this.repeatCount++;
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 1000);
      }
      return;
    }

    if (this.repeatCount > 1) {
      this.flush();
    }

    this.lastMsg = msg;
    this.lastLevel = level;
    this.repeatCount = 1;

    if (level === 'info') {
      if (DEBUG) console.log('[INFO]', msg);
    } else if (level === 'warn') {
      console.warn('[WARN]', msg);
    } else if (level === 'error') {
      console.error('[ERROR]', msg);
    }
  }

  info(...args: any[]) { this.process('info', ...args); }
  warn(...args: any[]) { this.process('warn', ...args); }
  error(...args: any[]) { this.process('error', ...args); }
}

export const logger = new DeduplicatingLogger();

