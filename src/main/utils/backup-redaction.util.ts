export type RedactionStatus = 'unchanged' | 'sanitized' | 'replaced_with_placeholder';

export type RedactionWarningCode =
  | 'INVALID_JSON'
  | 'INVALID_STRUCTURE'
  | 'DEPTH_LIMIT_EXCEEDED'
  | 'REDACTION_ERROR';

export interface RedactionWarning {
  entry: string;
  code: RedactionWarningCode;
  message: string;
  originalSizeBytes: number;
}

export interface ConfigRedactionOutcome {
  buffer: Buffer;
  status: RedactionStatus;
  redactedFieldCount: number;
  warning?: RedactionWarning;
}

const MAX_REDACTION_DEPTH = 32;

const EXACT_SECRET_KEYS = new Set([
  'secret',
  'secrets',
  'token',
  'tokens',
  'apikeys',
  'password',
  'passwd',
  'passphrase',
  'credential',
  'credentials',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'xapikey',
  'xauthtoken',
  'clientsecret',
  'apisecret',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'authtoken',
  'sessiontoken',
  'bottoken',
  'privatekey',
  'secretkey',
  'encryptionkey',
  'masterkey',
  'signingkey',
  'signingsecret',
  'webhooksecret',
  'oauthsecret',
  'oauthtoken',
  'authkey',
  'providerkey',
  'hftoken',
  'openaikey',
  'openrouterkey',
  'geminikey',
  'anthropickey',
  'groqkey'
]);

const BENIGN_TOKEN_KEYS = new Set([
  'maxtokens',
  'tokenlimit',
  'prompttokens',
  'completiontokens',
  'contexttokens',
  'totaltokens',
  'tokenspersecond',
  'tokensused',
  'tokencount',
  'tokenusage',
  'tokenbudget',
  'tokenprice',
  'tokencost',
  'tokenizer',
  'publickey',
  'keyid'
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  'key',
  'apikey',
  'api_key',
  'x-api-key',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'password',
  'auth'
]);

class RedactionDepthError extends Error {
  constructor() {
    super(`Configuration nesting exceeds maximum safe depth (${MAX_REDACTION_DEPTH})`);
    this.name = 'RedactionDepthError';
  }
}

export function normalizeBackupEntryName(entryName: string): string {
  return entryName.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

export function isProviderConfigEntry(entryName: string): boolean {
  const normalized = normalizeBackupEntryName(entryName);
  return normalized === 'config/ai-providers.json' || /(?:^|\/)ai-providers\.json$/.test(normalized);
}

function splitIdentifierWords(rawKey: string): string[] {
  return rawKey
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
}

type KeyAction =
  | 'preserve_empty_api_key'
  | 'reset_has_api_key'
  | 'delete_secret'
  | 'scrub_auth_header_or_string'
  | 'keep';

function classifySecretKey(rawKey: string, value: unknown): KeyAction {
  if (rawKey === 'apiKey') {
    return 'preserve_empty_api_key';
  }

  const compact = rawKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!compact) return 'keep';

  if (compact === 'hasapikey') {
    return 'reset_has_api_key';
  }
  if (compact === 'noauthheader' || compact === 'apikeystatus') {
    return 'keep';
  }
  if (BENIGN_TOKEN_KEYS.has(compact)) {
    return 'keep';
  }
  if (compact === 'apikey') {
    return 'delete_secret';
  }
  if (EXACT_SECRET_KEYS.has(compact)) {
    return 'delete_secret';
  }

  const words = splitIdentifierWords(rawKey);
  if (words[0] === 'has' || words[0] === 'no') {
    return 'keep';
  }
  if (words[words.length - 1] === 'status') {
    return 'keep';
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    if (
      word === 'secret' ||
      word === 'secrets' ||
      word === 'password' ||
      word === 'passwd' ||
      word === 'passphrase' ||
      word === 'credential' ||
      word === 'credentials' ||
      word === 'authorization'
    ) {
      return 'delete_secret';
    }
    if ((word === 'api' || word === 'private' || word === 'secret' || word === 'auth') && (next === 'key' || next === 'keys')) {
      return 'delete_secret';
    }
    if (word === 'token' && typeof value !== 'number' && typeof value !== 'boolean') {
      return 'delete_secret';
    }
  }

  if (compact === 'auth') {
    return typeof value === 'string' ? 'delete_secret' : 'scrub_auth_header_or_string';
  }

  return 'keep';
}

function scrubStringValue(value: string): { value: string; redacted: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { value, redacted: false };

  if (
    trimmed.startsWith('enc:') ||
    trimmed.startsWith('b64:') ||
    /^sk-(?:proj-|ant-api\d+-|or-v\d+-)?[A-Za-z0-9_-]{12,}$/.test(trimmed) ||
    /^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed) ||
    /^gh[pousr]_[A-Za-z0-9_]{20,}$/.test(trimmed) ||
    /^xox[baprs]-[A-Za-z0-9-]{10,}$/.test(trimmed) ||
    /^Bearer\s+\S+/i.test(trimmed) ||
    /^Basic\s+\S+/i.test(trimmed)
  ) {
    return { value: '', redacted: true };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      let urlChanged = false;
      if (parsedUrl.username || parsedUrl.password) {
        parsedUrl.username = '';
        parsedUrl.password = '';
        urlChanged = true;
      }
      for (const param of Array.from(parsedUrl.searchParams.keys())) {
        if (SENSITIVE_QUERY_PARAMS.has(param.toLowerCase())) {
          parsedUrl.searchParams.set(param, 'REDACTED');
          urlChanged = true;
        }
      }
      if (urlChanged) {
        return { value: parsedUrl.toString(), redacted: true };
      }
    } catch {
      // ignore non-standard URL string without credentials
    }
  }

  return { value, redacted: false };
}

function scrubValueRecursively(
  value: unknown,
  depth: number,
  counter: { count: number }
): unknown {
  if (depth > MAX_REDACTION_DEPTH) {
    throw new RedactionDepthError();
  }

  if (typeof value === 'string') {
    const scrubbed = scrubStringValue(value);
    if (scrubbed.redacted) counter.count += 1;
    return scrubbed.value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValueRecursively(item, depth + 1, counter));
  }

  const out: Record<string, unknown> = {};
  for (const [key, rawChild] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const action = classifySecretKey(key, rawChild);
    if (action === 'preserve_empty_api_key') {
      if (rawChild !== '' && rawChild !== undefined && rawChild !== null) {
        counter.count += 1;
      }
      out[key] = '';
      continue;
    }

    if (action === 'reset_has_api_key') {
      if (rawChild === true) counter.count += 1;
      out[key] = false;
      continue;
    }

    if (action === 'delete_secret') {
      if (rawChild !== '' && rawChild !== undefined && rawChild !== null) {
        counter.count += 1;
      }
      continue;
    }

    out[key] = scrubValueRecursively(rawChild, depth + 1, counter);
  }
  return out;
}

export function createRedactedConfigPlaceholder(params: {
  entryName: string;
  code: RedactionWarningCode;
  message: string;
  originalSizeBytes: number;
}): ConfigRedactionOutcome {
  const { entryName, code, message, originalSizeBytes } = params;
  const placeholder = {
    redacted: true,
    failClosed: true,
    entry: entryName,
    reasonCode: code,
    message,
    originalSizeBytes,
    actionRequired:
      'Reconfigure AI providers and re-enter API keys manually in Settings after restore.'
  };

  return {
    buffer: Buffer.from(JSON.stringify(placeholder, null, 2), 'utf8'),
    status: 'replaced_with_placeholder',
    redactedFieldCount: 1,
    warning: {
      entry: entryName,
      code,
      message,
      originalSizeBytes
    }
  };
}

export function sanitizeExportConfigBuffer(
  entryName: string,
  data: Buffer
): ConfigRedactionOutcome {
  if (!isProviderConfigEntry(entryName)) {
    return {
      buffer: data,
      status: 'unchanged',
      redactedFieldCount: 0
    };
  }

  try {
    const rawText = data.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!rawText) {
      return createRedactedConfigPlaceholder({
        entryName,
        code: 'INVALID_JSON',
        message: 'Provider config file is empty; replaced with fail-closed placeholder.',
        originalSizeBytes: data.length
      });
    }

    const parsed: unknown = JSON.parse(rawText);
    if (parsed === null || typeof parsed !== 'object') {
      return createRedactedConfigPlaceholder({
        entryName,
        code: 'INVALID_STRUCTURE',
        message: 'Provider config top-level JSON must be an array or object; replaced with fail-closed placeholder.',
        originalSizeBytes: data.length
      });
    }

    const counter = { count: 0 };
    const sanitized = scrubValueRecursively(parsed, 0, counter);
    return {
      buffer: Buffer.from(JSON.stringify(sanitized, null, 2), 'utf8'),
      status: 'sanitized',
      redactedFieldCount: counter.count
    };
  } catch (err: unknown) {
    const isDepthErr = err instanceof RedactionDepthError;
    const isSyntaxErr = err instanceof SyntaxError;
    const code: RedactionWarningCode = isDepthErr
      ? 'DEPTH_LIMIT_EXCEEDED'
      : isSyntaxErr
        ? 'INVALID_JSON'
        : 'REDACTION_ERROR';

    return createRedactedConfigPlaceholder({
      entryName,
      code,
      message: isDepthErr
        ? `Provider config exceeded nesting limit (${MAX_REDACTION_DEPTH}); replaced with fail-closed placeholder.`
        : 'Provider config could not be parsed as valid JSON; replaced with fail-closed placeholder without raw bytes.',
      originalSizeBytes: data.length
    });
  }
}
