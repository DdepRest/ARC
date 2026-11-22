import * as path from 'path';
import type { BrowserWindow, Session } from 'electron';
import { getHttpCspPolicy, isTrustedOrigin } from '../../../shared/config/csp.config';

export interface ElectronSecurityContext {
  isDev: boolean;
  rendererUrl?: string;
  trustedFileRoot: string;
}

export interface DevToolsGateOptions {
  isDev: boolean;
  isPackaged: boolean;
  nodeEnv?: string;
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
}

const HUGGINGFACE_CORS_ROOT_DOMAINS = [
  'huggingface.co',
  'hf.co',
  'hf-mirror.com'
] as const;

/**
 * Resolves the canonical renderer root directory from the Main entry directory (`__dirname`).
 */
export function resolveTrustedRendererRoot(mainEntryDir: string): string {
  return path.resolve(mainEntryDir, '../renderer');
}

/**
 * Validates external URLs opened via shell.openExternal.
 * Strictly allows http: and https: URLs without embedded credentials or control characters.
 */
export function isSafeExternalHttpUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (parsed.username || parsed.password || !parsed.hostname) {
    return false;
  }

  return true;
}

/**
 * Determines whether Chromium DevTools may be opened/toggled in the current runtime.
 * Disabled in packaged/production builds unless explicitly unlocked via `--debug` or `ARC_ALLOW_DEVTOOLS=1`.
 */
export function isDevToolsAllowed(options: DevToolsGateOptions): boolean {
  if (options.isDev) {
    return true;
  }
  if (!options.isPackaged && options.nodeEnv !== 'production') {
    return true;
  }
  const argv = options.argv ?? [];
  const env = options.env ?? {};
  return argv.includes('--debug') || env.ARC_ALLOW_DEVTOOLS === '1';
}

/**
 * Checks whether a hostname strictly matches an allowlisted HuggingFace / mirror domain.
 */
export function isHuggingFaceCorsHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return false;

  return HUGGINGFACE_CORS_ROOT_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

/**
 * Narrow CORS rewrite check for whisper.worker.ts model downloads from HuggingFace / mirrors.
 * Requires HTTPS, exact hostname allowlist, and a trusted application initiator/webContents when present.
 */
export function shouldRewriteHuggingFaceCors(
  details: {
    url?: string;
    initiator?: string;
    webContentsUrl?: string;
  },
  context: ElectronSecurityContext
): boolean {
  if (!details?.url || typeof details.url !== 'string') return false;

  let parsed: URL;
  try {
    parsed = new URL(details.url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return false;
  }

  if (!isHuggingFaceCorsHost(parsed.hostname)) {
    return false;
  }

  if (details.webContentsUrl) {
    if (
      !isTrustedOrigin(
        details.webContentsUrl,
        context.isDev,
        context.rendererUrl,
        context.trustedFileRoot
      )
    ) {
      return false;
    }
  }

  if (details.initiator && details.initiator !== 'null' && details.initiator !== 'file://' && details.initiator !== 'file:///') {
    if (
      !isTrustedOrigin(
        details.initiator,
        context.isDev,
        context.rendererUrl,
        context.trustedFileRoot
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Applies hardened CSP headers and narrow HuggingFace CORS headers to session responses.
 */
export function applySecurityResponseHeaders(
  details: {
    url?: string;
    initiator?: string;
    webContents?: { getURL?: () => string; isDestroyed?: () => boolean } | null;
    responseHeaders?: Record<string, string[]>;
  },
  context: ElectronSecurityContext
): Record<string, string[]> {
  const responseHeaders: Record<string, string[]> = { ...(details.responseHeaders || {}) };
  responseHeaders['Content-Security-Policy'] = [getHttpCspPolicy(context.isDev)];

  let webContentsUrl: string | undefined;
  try {
    if (details.webContents && !details.webContents.isDestroyed?.()) {
      webContentsUrl = details.webContents.getURL?.();
    }
  } catch {
    webContentsUrl = undefined;
  }

  if (
    shouldRewriteHuggingFaceCors(
      { url: details.url, initiator: details.initiator, webContentsUrl },
      context
    )
  ) {
    delete responseHeaders['access-control-allow-origin'];
    delete responseHeaders['Access-Control-Allow-Origin'];
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
  }

  return responseHeaders;
}

/**
 * Attaches permission, external window, navigation, webview, and DevTools guards to the main BrowserWindow.
 */
export function attachWindowSecurityGuards(
  win: BrowserWindow,
  options: ElectronSecurityContext & {
    allowDevTools: boolean;
    openExternal: (url: string) => unknown;
    onBlockedNavigation?: (url: string) => void;
  }
): void {
  const wc = win.webContents;
  const ses = wc.session;

  ses.setPermissionRequestHandler((webContents, permission, callback, details: any) => {
    if (permission !== 'media') {
      callback(false);
      return;
    }
    const requestingUrl =
      details?.requestingUrl ||
      (webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : '');
    const trusted = isTrustedOrigin(
      requestingUrl,
      options.isDev,
      options.rendererUrl,
      options.trustedFileRoot
    );
    callback(trusted);
  });

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission !== 'media') {
      return false;
    }
    return isTrustedOrigin(
      requestingOrigin,
      options.isDev,
      options.rendererUrl,
      options.trustedFileRoot
    );
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalHttpUrl(url)) {
      options.openExternal(url);
    }
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, navigationUrl) => {
    const trusted = isTrustedOrigin(
      navigationUrl,
      options.isDev,
      options.rendererUrl,
      options.trustedFileRoot
    );
    if (!trusted) {
      event.preventDefault();
      options.onBlockedNavigation?.(navigationUrl);
    }
  });

  wc.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  wc.on('before-input-event', (event, input) => {
    const isDevToolsShortcut =
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'i')));
    if (!isDevToolsShortcut) return;

    if (options.allowDevTools) {
      wc.toggleDevTools();
    } else {
      event.preventDefault();
    }
  });
}

/**
 * Configures session-wide security response headers (CSP & strict HF CORS).
 */
export function configureSessionSecurity(ses: Session, context: ElectronSecurityContext): void {
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = applySecurityResponseHeaders(details as any, context);
    callback({ responseHeaders });
  });
}
