/**
 * A.R.C. Content Security Policy (CSP) & Origin Validator
 * Single source of truth for CSP across Main & Renderer processes
 */

export const DEV_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:;",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:;",
  "worker-src 'self' blob:;",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
  "img-src 'self' data: blob: https:;",
  "connect-src 'self' data: blob: http://127.0.0.1:* http://localhost:* https: https://huggingface.co https://*.huggingface.co https://hf-mirror.com https://*.hf-mirror.com https://openrouter.ai https://*.openrouter.ai https://api.openai.com ws://127.0.0.1:* ws://localhost:* ws: wss:;",
  "media-src 'self' blob: data: http://127.0.0.1:* http://localhost:* https:;",
  "font-src 'self' data: https: https://fonts.gstatic.com;"
].join(' ');

export const PROD_CSP = [
  "default-src 'self' blob: data:;",
  "script-src 'self' 'unsafe-eval' blob: 'wasm-unsafe-eval';",
  "worker-src 'self' blob:;",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
  "img-src 'self' data: blob: https:;",
  "connect-src 'self' data: blob: http://127.0.0.1:* http://localhost:* https: https://huggingface.co https://*.huggingface.co https://hf-mirror.com https://*.hf-mirror.com https://openrouter.ai https://*.openrouter.ai https://api.openai.com ws://127.0.0.1:* ws://localhost:* ws: wss:;",
  "media-src 'self' blob: data: http://127.0.0.1:* http://localhost:* https:;",
  "font-src 'self' data: https: https://fonts.gstatic.com;"
].join(' ');

/**
 * Returns active CSP directive string based on environment
 */
export function getCspPolicy(isDev: boolean): string {
  return isDev ? DEV_CSP : PROD_CSP;
}

/**
 * Validates whether requesting URL is from a trusted application origin
 */
export function isTrustedOrigin(url?: string, isDev?: boolean, rendererUrl?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const trimmed = url.trim();
  if (!trimmed) return false;

  // File protocol is trusted in production or local package loads
  if (trimmed.startsWith('file://')) {
    return true;
  }

  // In development mode, check against renderer dev server
  if (isDev) {
    if (rendererUrl && rendererUrl.trim()) {
      try {
        const expectedOrigin = new URL(rendererUrl).origin;
        const incomingOrigin = new URL(trimmed).origin;
        if (incomingOrigin === expectedOrigin) return true;
      } catch {
        // Fallback string check
        if (trimmed.startsWith(rendererUrl)) return true;
      }
    }
    try {
      const parsed = new URL(trimmed);
      const isLocalhost = (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        (parsed.port === '3000' || parsed.port === '5173' || !parsed.port);
      if (isLocalhost) return true;
    } catch {
      return false;
    }
  }

  return false;
}
