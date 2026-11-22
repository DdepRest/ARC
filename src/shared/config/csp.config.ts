/**
 * A.R.C. Content Security Policy (CSP) & Origin Validator
 * Single source of truth for CSP across Main & Renderer processes.
 */

export const DEV_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:;",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:;",
  "worker-src 'self' blob:;",
  "style-src 'self' 'unsafe-inline';",
  "img-src 'self' data: blob: https://*.userapi.com https://*.vkuserphoto.net https://*.vk-cdn.net https://*.vk.com https://*.vk.ru https://*.mycdn.me;",
  "connect-src 'self' data: blob: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* https://huggingface.co https://*.huggingface.co https://hf.co https://*.hf.co https://hf-mirror.com https://*.hf-mirror.com;",
  "media-src 'self' blob: data: http://127.0.0.1:* http://localhost:* https://*.freecodecamp.org;",
  "font-src 'self' data:;",
  "object-src 'none';",
  "base-uri 'self';",
  "form-action 'self';"
].join(' ');

export const PROD_CSP = [
  "default-src 'self' blob: data:;",
  // 'unsafe-eval' is temporarily retained solely for litegraph.js & onnxruntime-web; 'wasm-unsafe-eval' for ONNX WASM
  "script-src 'self' 'unsafe-eval' blob: 'wasm-unsafe-eval';",
  "worker-src 'self' blob:;",
  // 'unsafe-inline' is required for Vue dynamic :style bindings and litegraph canvas CSS
  "style-src 'self' 'unsafe-inline';",
  // Local assets, chat attachments (data/blob), and VK Music album art CDNs
  "img-src 'self' data: blob: https://*.userapi.com https://*.vkuserphoto.net https://*.vk-cdn.net https://*.vk.com https://*.vk.ru https://*.mycdn.me;",
  // Local Ollama/service probes + HuggingFace/mirror for whisper.worker.ts fallback; broad https:/ws:/wss: removed
  "connect-src 'self' data: blob: http://127.0.0.1:* http://localhost:* https://huggingface.co https://*.huggingface.co https://hf.co https://*.hf.co https://hf-mirror.com https://*.hf-mirror.com;",
  // Local TTS/soundscape audio + CodeRadio relay streams
  "media-src 'self' blob: data: http://127.0.0.1:* http://localhost:* https://*.freecodecamp.org;",
  // All UI fonts are bundled locally as .woff2 in src/renderer/assets/fonts/
  "font-src 'self' data:;",
  "object-src 'none';",
  "base-uri 'self';",
  "form-action 'self';"
].join(' ');

/**
 * Returns active CSP directive string suitable for HTML <meta> or HTTP headers.
 */
export function getCspPolicy(isDev: boolean): string {
  return isDev ? DEV_CSP : PROD_CSP;
}

/**
 * Returns HTTP header CSP policy including directives ignored in <meta> tags (e.g. frame-ancestors).
 */
export function getHttpCspPolicy(isDev: boolean): string {
  return `${getCspPolicy(isDev)} frame-ancestors 'none';`;
}

function hasUnsafeEncodedPathSequences(rawUrl: string): boolean {
  const withoutHashOrQuery = rawUrl.split('#')[0].split('?')[0];
  if (withoutHashOrQuery.includes('\0') || withoutHashOrQuery.includes('\\')) {
    return true;
  }
  if (/%00|%2f|%5c|%2e/i.test(withoutHashOrQuery)) {
    return true;
  }
  const rawSegments = withoutHashOrQuery.split('/');
  return rawSegments.some((seg) => seg === '..');
}

function normalizeFilePathString(rawPath: string): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let normalized = rawPath.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return null;

  // Normalize Windows drive path (e.g. "C:/ARC/out/renderer" -> "/c:/ARC/out/renderer")
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = `/${normalized}`;
  } else if (/^[a-zA-Z]:$/.test(normalized)) {
    normalized = `/${normalized}/`;
  }

  // Collapse duplicate slashes
  normalized = normalized.replace(/\/+/g, '/');

  // Strip trailing slash except root "/"
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  if (!normalized.startsWith('/')) {
    return null;
  }

  // Reject unresolved traversal segments
  const parts = normalized.split('/');
  if (parts.some((p) => p === '..' || p === '.')) {
    return null;
  }

  return normalized;
}

function resolveFileRootPath(trustedFileRoot?: string): string | null {
  if (!trustedFileRoot || typeof trustedFileRoot !== 'string') return null;
  const trimmed = trustedFileRoot.trim();
  if (!trimmed) return null;

  if (/^file:/i.test(trimmed)) {
    if (hasUnsafeEncodedPathSequences(trimmed)) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'file:' || parsed.username || parsed.password || parsed.hostname !== '') {
        return null;
      }
      const decoded = decodeURIComponent(parsed.pathname);
      return normalizeFilePathString(decoded);
    } catch {
      return null;
    }
  }

  return normalizeFilePathString(trimmed);
}

function isWindowsDrivePath(p: string): boolean {
  return /^\/[a-zA-Z]:(\/|$)/.test(p);
}

/**
 * Validates whether a file:// URL resolves strictly inside the canonical renderer root/entrypoint.
 * Fails closed if trustedFileRoot is missing or invalid.
 */
export function isTrustedFileUrl(url: string, trustedFileRoot?: string): boolean {
  const canonicalRoot = resolveFileRootPath(trustedFileRoot);
  if (!canonicalRoot) return false;
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!/^file:/i.test(trimmed) || hasUnsafeEncodedPathSequences(trimmed)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'file:' || parsed.username || parsed.password || parsed.hostname !== '') {
    return false;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return false;
  }

  const normalizedTarget = normalizeFilePathString(decodedPath);
  if (!normalizedTarget) return false;

  const caseInsensitive = isWindowsDrivePath(canonicalRoot) || isWindowsDrivePath(normalizedTarget);
  const rootCmp = caseInsensitive ? canonicalRoot.toLowerCase() : canonicalRoot;
  const targetCmp = caseInsensitive ? normalizedTarget.toLowerCase() : normalizedTarget;

  if (rootCmp.endsWith('.html') || rootCmp.endsWith('.htm')) {
    return targetCmp === rootCmp;
  }

  return targetCmp === rootCmp || targetCmp.startsWith(`${rootCmp}/`);
}

/**
 * Validates whether requesting URL is from a trusted application origin.
 */
export function isTrustedOrigin(
  url?: string,
  isDev?: boolean,
  rendererUrl?: string,
  trustedFileRoot?: string
): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // file:// is ONLY trusted if it stays strictly inside canonical renderer root
  if (/^file:/i.test(trimmed)) {
    return isTrustedFileUrl(trimmed, trustedFileRoot);
  }

  // In development mode, check against renderer dev server
  if (isDev) {
    if (rendererUrl && rendererUrl.trim()) {
      try {
        const expected = new URL(rendererUrl);
        const incoming = new URL(trimmed);
        if (incoming.origin === expected.origin) return true;
        // Allow localhost <-> 127.0.0.1 equivalence on the configured dev port
        const devHosts = new Set(['localhost', '127.0.0.1']);
        if (
          incoming.protocol === expected.protocol &&
          devHosts.has(incoming.hostname) &&
          devHosts.has(expected.hostname) &&
          incoming.port === expected.port
        ) {
          return true;
        }
      } catch {
        return false;
      }
    }
    try {
      const parsed = new URL(trimmed);
      const isLocalhost =
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        (parsed.port === '3000' || parsed.port === '5173');
      if (isLocalhost) return true;
    } catch {
      return false;
    }
  }

  return false;
}
