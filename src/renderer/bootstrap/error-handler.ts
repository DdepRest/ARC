import { useTerminalStore } from '../stores/terminal.store';
import { Pinia } from 'pinia';

function formatTerminalArg(a: any): string {
  if (typeof a === 'string') return a;
  if (a === null || a === undefined || typeof a !== 'object') return String(a);
  if (a instanceof Error) return a.message || String(a);
  try {
    const raw = JSON.stringify(a);
    return raw && raw.length > 400 ? raw.slice(0, 400) + '…' : raw;
  } catch {
    return '[Object]';
  }
}

export function setupErrorHandlers(pinia: Pinia) {
  const terminalStore = useTerminalStore(pinia);
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalConsoleInfo = console.info;

  let lastMsg = '';
  let lastLogAt = 0;

  const pushTerminal = (level: 'INFO' | 'WARN' | 'ERROR', args: any[]) => {
    const msg = args.map(formatTerminalArg).join(' ');
    const now = Date.now();
    if (msg === lastMsg && now - lastLogAt < 500) return;
    lastMsg = msg;
    lastLogAt = now;
    terminalStore.addLog(level, msg);
  };

  console.log = (...args) => {
    originalConsoleLog(...args);
    pushTerminal('INFO', args);
  };

  console.warn = (...args) => {
    originalConsoleWarn(...args);
    pushTerminal('WARN', args);
  };

  console.error = (...args) => {
    originalConsoleError(...args);
    pushTerminal('ERROR', args);
  };

  console.info = (...args) => {
    originalConsoleInfo(...args);
    pushTerminal('INFO', args);
  };

  // Expose a custom EXEC log for explicit terminal actions if needed
  (window as any).sysLogExec = (msg: string) => terminalStore.addLog('EXEC', msg);
  (window as any).sysLogVoice = (msg: string) => terminalStore.addLog('VOICE', msg);
}
