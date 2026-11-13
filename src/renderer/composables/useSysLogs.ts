import { ref } from 'vue';

const MAX_LOGS = 500;
const systemLogs = ref<string[]>([]);

let originalLog: any = null;
let originalError: any = null;
let originalWarn: any = null;

function safeStringifyLog(obj: any): string {
  if (typeof obj === 'string') return obj;
  if (obj === null || obj === undefined || typeof obj !== 'object') return String(obj);
  if (obj instanceof Error) return obj.message || String(obj);
  try {
    const seen = new WeakSet();
    const str = JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return str && str.length > 600 ? str.slice(0, 600) + '…' : str;
  } catch {
    return String(obj);
  }
}

export function initSysLogs() {
  if (originalLog) return;
  
  originalLog = console.log;
  originalError = console.error;
  originalWarn = console.warn;

  let lastErrorMsg = '';
  let errorCount = 0;
  let lastDownloadLogTime = 0;
  let lastWakeHitFalseTime = 0;

  const isProd = process.env.NODE_ENV === 'production';

  const intercept = (originalFn: any, level: string) => {
    return (...args: any[]) => {
      const msg = args.map(a => safeStringifyLog(a)).join(' ');

      // Filter benign ONNX/ort-wasm noise from console and system telemetry logs
      if (
        (msg.includes('Removing initializer') && msg.includes('not used by any node')) ||
        (msg.includes('ort-wasm') && msg.includes('Removing initializer')) ||
        (msg.includes('onnxruntime') && msg.includes('Removing initializer')) ||
        msg.includes('Unable to determine content-length') ||
        msg.includes('[Reactor Telemetry')
      ) {
        return;
      }

      const now = Date.now();
      const ts = new Date().toISOString().substring(11, 19);

      // Throttling: BuiltIn-LLM Download (at most once every 2 seconds in console, update last in UI)
      if (msg.includes('[BuiltIn-LLM Download]') || msg.includes('[BuiltIn-LLM] Download')) {
        const lastIdx = systemLogs.value.length - 1;
        if (lastIdx >= 0 && (systemLogs.value[lastIdx].includes('[BuiltIn-LLM Download]') || systemLogs.value[lastIdx].includes('[BuiltIn-LLM] Download'))) {
          systemLogs.value[lastIdx] = `[${ts}] [${level}] ${msg}`;
          if (now - lastDownloadLogTime < 2000) {
            return; // Suppress rapid stdout spam
          }
          lastDownloadLogTime = now;
        } else {
          lastDownloadLogTime = now;
        }
      }

      // Throttling: WakeWord hit: false spam suppression (at most once per 2s)
      if (msg.includes('[WakeWord] hit: false') || msg.includes('[Wake word] Rejected')) {
        if (now - lastWakeHitFalseTime < 2000 || isProd) {
          return; // Suppress frequent negative detection misses
        }
        lastWakeHitFalseTime = now;
      }

      // Suppress verbose wake-word info logs in production builds
      if (isProd && level === 'INFO' && (msg.includes('[WakeWord]') || msg.includes('[Voice:evaluateVoiceTrigger]'))) {
        return;
      }

      if (level === 'ERROR' || level === 'WARN') {
        if (msg === lastErrorMsg) {
          errorCount++;
          // Update the last log entry with a counter in-place
          const lastIndex = systemLogs.value.length - 1;
          if (lastIndex >= 0) {
            systemLogs.value[lastIndex] = `[${ts}] [${level}] ${msg} (x${errorCount + 1})`;
          }
          return; // Skip console output for repeats to prevent terminal spam
        } else {
          lastErrorMsg = msg;
          errorCount = 0;
        }
      } else {
        // Reset counter if a normal info log comes in
        lastErrorMsg = '';
        errorCount = 0;
      }

      originalFn.apply(console, args);
      
      systemLogs.value.push(`[${ts}] [${level}] ${msg}`);
      
      // Ring buffer cap: maintain at most MAX_LOGS entries without excessive shifting
      if (systemLogs.value.length > MAX_LOGS) {
        systemLogs.value.splice(0, systemLogs.value.length - MAX_LOGS);
      }
    };
  };

  console.log = intercept(originalLog, 'INFO');
  console.error = intercept(originalError, 'ERROR');
  console.warn = intercept(originalWarn, 'WARN');
}

export function useSysLogs() {
  return {
    systemLogs,
    copyLogsToClipboard: async () => {
      const txt = systemLogs.value.join('\n');
      try {
        if (window.api && typeof window.api.writeClipboard === 'function') {
          const success = await window.api.writeClipboard(txt);
          if (success) return true;
        }
      } catch {}

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
          return true;
        }
      } catch (e) {
        // Silently continue to fallback
      }

      // Fallback method using textarea selection
      try {
        const textArea = document.createElement('textarea');
        textArea.value = txt;
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch (err) {
        return false;
      }
    }
  };
}