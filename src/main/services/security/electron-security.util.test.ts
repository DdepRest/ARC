import { EventEmitter } from 'events';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  attachWindowSecurityGuards,
  applySecurityResponseHeaders,
  configureSessionSecurity,
  isDevToolsAllowed,
  isHuggingFaceCorsHost,
  isSafeExternalHttpUrl,
  resolveTrustedRendererRoot,
  shouldRewriteHuggingFaceCors
} from './electron-security.util';

function createMockWindowHarness() {
  const wc = new EventEmitter() as any;
  const session = {
    permissionRequestHandler: null as any,
    permissionCheckHandler: null as any,
    headersHandler: null as any,
    setPermissionRequestHandler: vi.fn((fn: any) => {
      session.permissionRequestHandler = fn;
    }),
    setPermissionCheckHandler: vi.fn((fn: any) => {
      session.permissionCheckHandler = fn;
    }),
    webRequest: {
      onHeadersReceived: vi.fn((fn: any) => {
        session.headersHandler = fn;
      })
    }
  };

  let windowOpenHandler: any = null;
  wc.session = session;
  wc.getURL = vi.fn(() => 'file:///C:/ARC/out/renderer/index.html');
  wc.isDestroyed = vi.fn(() => false);
  wc.toggleDevTools = vi.fn();
  wc.setWindowOpenHandler = vi.fn((fn: any) => {
    windowOpenHandler = fn;
  });

  const win = { webContents: wc } as any;
  return { win, wc, session, getWindowOpenHandler: () => windowOpenHandler };
}

describe('Electron Security Boundary Utility (S3-03)', () => {
  it('resolves canonical renderer root from Main entry directory', () => {
    const resolved = resolveTrustedRendererRoot('/app/out/main');
    expect(resolved).toBe(path.resolve('/app/out/main', '../renderer'));
  });

  describe('isSafeExternalHttpUrl', () => {
    it('allows clean http and https URLs', () => {
      expect(isSafeExternalHttpUrl('https://github.com/DdepRest/ARC')).toBe(true);
      expect(isSafeExternalHttpUrl('http://127.0.0.1:11434/')).toBe(true);
    });

    it('rejects unsafe schemes, spoofed prefixes, embedded credentials, and malformed URLs', () => {
      expect(isSafeExternalHttpUrl('http-evil://attacker.example')).toBe(false);
      expect(isSafeExternalHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeExternalHttpUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false);
      expect(isSafeExternalHttpUrl('ms-msdt:/id PCWDiagnostic')).toBe(false);
      expect(isSafeExternalHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeExternalHttpUrl('https://user:pass@github.com')).toBe(false);
      expect(isSafeExternalHttpUrl('https://github.com\nX-Test: 1')).toBe(false);
      expect(isSafeExternalHttpUrl('')).toBe(false);
      expect(isSafeExternalHttpUrl(null)).toBe(false);
    });
  });

  describe('isDevToolsAllowed', () => {
    it('disables DevTools in packaged/production builds by default', () => {
      expect(isDevToolsAllowed({ isDev: false, isPackaged: true, nodeEnv: 'production', argv: [], env: {} })).toBe(false);
      expect(isDevToolsAllowed({ isDev: false, isPackaged: false, nodeEnv: 'production', argv: [], env: {} })).toBe(false);
      expect(isDevToolsAllowed({ isDev: false, isPackaged: true, argv: [], env: { ARC_ALLOW_DEVTOOLS: '0' } })).toBe(false);
    });

    it('enables DevTools in dev mode or via explicit --debug / ARC_ALLOW_DEVTOOLS=1 flags', () => {
      expect(isDevToolsAllowed({ isDev: true, isPackaged: false })).toBe(true);
      expect(isDevToolsAllowed({ isDev: false, isPackaged: false, nodeEnv: 'development' })).toBe(true);
      expect(isDevToolsAllowed({ isDev: false, isPackaged: true, argv: ['A.R.C.exe', '--debug'], env: {} })).toBe(true);
      expect(isDevToolsAllowed({ isDev: false, isPackaged: true, argv: [], env: { ARC_ALLOW_DEVTOOLS: '1' } })).toBe(true);
    });
  });

  describe('HuggingFace narrow CORS allowlist & CSP response headers', () => {
    const context = {
      isDev: false,
      trustedFileRoot: 'C:\\ARC\\out\\renderer'
    };

    it('matches only exact HuggingFace and mirror hostnames over HTTPS', () => {
      expect(isHuggingFaceCorsHost('huggingface.co')).toBe(true);
      expect(isHuggingFaceCorsHost('cdn-lfs.huggingface.co')).toBe(true);
      expect(isHuggingFaceCorsHost('cas-bridge.xethub.hf.co')).toBe(true);
      expect(isHuggingFaceCorsHost('hf-mirror.com')).toBe(true);
      expect(isHuggingFaceCorsHost('not-huggingface.co')).toBe(false);
      expect(isHuggingFaceCorsHost('huggingface.co.evil.com')).toBe(false);
    });

    it('rewrites CORS only for HTTPS allowlisted HF hosts from trusted/worker contexts', () => {
      expect(
        shouldRewriteHuggingFaceCors(
          {
            url: 'https://huggingface.co/Xenova/whisper-tiny/resolve/main/config.json',
            initiator: 'null',
            webContentsUrl: 'file:///C:/ARC/out/renderer/index.html'
          },
          context
        )
      ).toBe(true);

      expect(
        shouldRewriteHuggingFaceCors(
          {
            url: 'https://cdn-lfs-us-1.hf.co/repos/weights.onnx',
            initiator: 'file://'
          },
          context
        )
      ).toBe(true);

      // Substring spoof, HTTP downgrade, and untrusted initiator must be rejected
      expect(
        shouldRewriteHuggingFaceCors(
          { url: 'https://evil.com/?next=huggingface.co', initiator: 'null' },
          context
        )
      ).toBe(false);
      expect(
        shouldRewriteHuggingFaceCors(
          { url: 'http://huggingface.co/file.bin', initiator: 'null' },
          context
        )
      ).toBe(false);
      expect(
        shouldRewriteHuggingFaceCors(
          { url: 'https://huggingface.co/file.bin', webContentsUrl: 'file:///D:/evil/index.html' },
          context
        )
      ).toBe(false);
      expect(
        shouldRewriteHuggingFaceCors(
          { url: 'https://huggingface.co/file.bin', initiator: 'https://attacker.example' },
          context
        )
      ).toBe(false);
    });

    it('applies HTTP CSP with frame-ancestors none and rewrites CORS only when allowed', () => {
      const hfHeaders = applySecurityResponseHeaders(
        {
          url: 'https://hf-mirror.com/Xenova/whisper-small/resolve/main/model.onnx',
          initiator: 'null',
          responseHeaders: { 'access-control-allow-origin': ['https://hf-mirror.com'] }
        },
        context
      );
      expect(hfHeaders['Content-Security-Policy'][0]).toContain("frame-ancestors 'none';");
      expect(hfHeaders['Access-Control-Allow-Origin']).toEqual(['*']);
      expect(hfHeaders['access-control-allow-origin']).toBeUndefined();

      const otherHeaders = applySecurityResponseHeaders(
        {
          url: 'https://evil.example/?huggingface.co',
          initiator: 'null',
          responseHeaders: {}
        },
        context
      );
      expect(otherHeaders['Content-Security-Policy'][0]).toContain("frame-ancestors 'none';");
      expect(otherHeaders['Access-Control-Allow-Origin']).toBeUndefined();

      const mockSes = {
        webRequest: { onHeadersReceived: vi.fn() }
      } as any;
      configureSessionSecurity(mockSes, context);
      expect(mockSes.webRequest.onHeadersReceived).toHaveBeenCalledTimes(1);
    });
  });

  describe('attachWindowSecurityGuards', () => {
    it('enforces media permission origin check, external URL policy, navigation/webview blocks, and DevTools gate', () => {
      const { win, wc, session, getWindowOpenHandler } = createMockWindowHarness();
      const openExternal = vi.fn();
      const onBlockedNavigation = vi.fn();

      attachWindowSecurityGuards(win, {
        isDev: false,
        trustedFileRoot: 'C:\\ARC\\out\\renderer',
        allowDevTools: false,
        openExternal,
        onBlockedNavigation
      });

      // Permissions: only 'media' from canonical root allowed
      const cb = vi.fn();
      session.permissionRequestHandler(wc, 'media', cb, { requestingUrl: 'file:///C:/ARC/out/renderer/index.html' });
      expect(cb).toHaveBeenLastCalledWith(true);

      session.permissionRequestHandler(wc, 'media', cb, { requestingUrl: 'file:///C:/Users/attacker/evil.html' });
      expect(cb).toHaveBeenLastCalledWith(false);

      session.permissionRequestHandler(wc, 'notifications', cb, { requestingUrl: 'file:///C:/ARC/out/renderer/index.html' });
      expect(cb).toHaveBeenLastCalledWith(false);

      expect(session.permissionCheckHandler(wc, 'media', 'file:///C:/ARC/out/renderer/index.html')).toBe(true);
      expect(session.permissionCheckHandler(wc, 'media', 'file:///D:/evil.html')).toBe(false);
      expect(session.permissionCheckHandler(wc, 'geolocation', 'file:///C:/ARC/out/renderer/index.html')).toBe(false);

      // External window open handler
      const openHandler = getWindowOpenHandler();
      expect(openHandler({ url: 'https://github.com/DdepRest/ARC' })).toEqual({ action: 'deny' });
      expect(openExternal).toHaveBeenCalledWith('https://github.com/DdepRest/ARC');

      openExternal.mockClear();
      expect(openHandler({ url: 'http-evil://bad.example' })).toEqual({ action: 'deny' });
      expect(openHandler({ url: 'file:///C:/Windows/calc.exe' })).toEqual({ action: 'deny' });
      expect(openExternal).not.toHaveBeenCalled();

      // Navigation guard
      const goodNav = { preventDefault: vi.fn() };
      wc.emit('will-navigate', goodNav, 'file:///C:/ARC/out/renderer/index.html#/settings');
      expect(goodNav.preventDefault).not.toHaveBeenCalled();

      const badNav = { preventDefault: vi.fn() };
      wc.emit('will-navigate', badNav, 'https://evil.example/phish.html');
      expect(badNav.preventDefault).toHaveBeenCalledTimes(1);
      expect(onBlockedNavigation).toHaveBeenCalledWith('https://evil.example/phish.html');

      const badFileNav = { preventDefault: vi.fn() };
      wc.emit('will-navigate', badFileNav, 'file:///C:/other/evil.html');
      expect(badFileNav.preventDefault).toHaveBeenCalledTimes(1);

      // WebView attachment blocked
      const webviewEv = { preventDefault: vi.fn() };
      wc.emit('will-attach-webview', webviewEv);
      expect(webviewEv.preventDefault).toHaveBeenCalledTimes(1);

      // DevTools disabled in prod
      const f12Ev = { preventDefault: vi.fn() };
      wc.emit('before-input-event', f12Ev, { type: 'keyDown', key: 'F12' });
      expect(f12Ev.preventDefault).toHaveBeenCalledTimes(1);
      expect(wc.toggleDevTools).not.toHaveBeenCalled();
    });

    it('allows DevTools toggle when allowDevTools is true', () => {
      const { win, wc } = createMockWindowHarness();
      attachWindowSecurityGuards(win, {
        isDev: false,
        trustedFileRoot: 'C:\\ARC\\out\\renderer',
        allowDevTools: true,
        openExternal: vi.fn()
      });

      const shortcutEv = { preventDefault: vi.fn() };
      wc.emit('before-input-event', shortcutEv, { type: 'keyDown', key: 'I', control: true, shift: true });
      expect(shortcutEv.preventDefault).not.toHaveBeenCalled();
      expect(wc.toggleDevTools).toHaveBeenCalledTimes(1);
    });
  });
});
