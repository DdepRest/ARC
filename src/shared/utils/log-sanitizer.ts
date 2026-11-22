/**
 * Log Sanitization, PII Redaction & Secret Masking Utilities
 * Prevents full object dumps, personal data, user paths, raw stack traces,
 * and API secrets from leaking into stdout/stderr or disk logs.
 */

export function sanitizeStackTrace(stack: unknown): string {
  if (!stack || typeof stack !== 'string') return '';
  const lines = stack
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !l.includes('node_modules') && !l.includes('node:internal'));
  const head = lines.slice(0, 4).join(' <- ');
  return maskSecrets(head);
}

/**
 * Strips API keys, Bearer tokens, sensitive headers, URL query secrets,
 * email PII, and OS user home paths from strings and objects.
 */
export function maskSecrets(input: unknown): string {
  if (input === null || input === undefined) return '';

  let text = '';
  if (typeof input === 'object') {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  } else {
    text = String(input);
  }

  // Mask Bearer tokens
  text = text.replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{4,}/gi, '$1***');

  // Mask generic sk- tokens (OpenAI, Anthropic, OpenRouter), hf_, ghp_
  text = text.replace(/sk-[A-Za-z0-9_\-]{6,}/gi, 'sk-***');
  text = text.replace(/hf_[A-Za-z0-9_\-]{6,}/gi, 'hf_***');
  text = text.replace(/ghp_[A-Za-z0-9_\-]{6,}/gi, 'ghp_***');

  // Mask Google AIza keys
  text = text.replace(/AIza[A-Za-z0-9_\-]{10,}/gi, 'AIza***');

  // Mask URL query parameters (?key=..., &api_key=..., &token=..., &access_token=..., &secret=...)
  text = text.replace(/([?&](?:api[_-]?key|key|token|access[_-]?token|secret)=)([^&\s"']+)/gi, '$1***');

  // Mask JSON / header key-value pairs (including x-api-key and x-goog-api-key)
  text = text.replace(
    /(["']?(?:apiKey|api_key|x-api-key|x-goog-api-key|token|access_token|secret|authorization|password)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi,
    '$1***$3'
  );

  // Mask OS user home directory paths (/Users/<name>/... or C:\Users\<name>\... or /home/<name>/...)
  text = text.replace(/([\\/](?:Users|home)[\\/])[^\\/\s"':)]+/gi, '$1***');

  // Mask email addresses (PII) — fast guard & bounded quantifiers prevent O(n^2) backtracking on large outputs
  if (text.includes('@')) {
    text = text.replace(/[a-zA-Z0-9._%+-]{1,128}@[a-zA-Z0-9.-]{1,128}\.[a-zA-Z]{2,24}/g, '[EMAIL_REDACTED]');
  }

  return text;
}

/**
 * Converts any error or exception into a concise "CODE message" format
 * without dumping complex object graphs or raw internal stack traces.
 */
export function sanitizeError(err: unknown): string {
  if (!err) return 'Unknown error';

  if (typeof err === 'string') {
    return maskSecrets(err);
  }

  if (typeof err === 'object') {
    const errorObj = err as any;
    const code =
      errorObj.code ||
      errorObj.status ||
      errorObj.statusCode ||
      (errorObj.response && (errorObj.response.status || errorObj.response.statusText)) ||
      '';
    const rawMsg = errorObj.message || errorObj.statusText || errorObj.error || errorObj.reason || '';
    const urlPart = errorObj.config?.url ? ` (url: ${errorObj.config.url})` : '';
    const message = rawMsg ? `${rawMsg}${urlPart}` : urlPart;

    if (code && message) {
      return maskSecrets(`[${code}] ${message}`);
    } else if (code) {
      return maskSecrets(`[${code}]`);
    } else if (message) {
      return maskSecrets(String(message));
    } else {
      return maskSecrets(String(errorObj));
    }
  }

  return maskSecrets(String(err));
}
