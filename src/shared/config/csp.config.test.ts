import { describe, it, expect } from 'vitest';
import {
  getCspPolicy,
  getHttpCspPolicy,
  isTrustedOrigin,
  isTrustedFileUrl,
  DEV_CSP,
  PROD_CSP
} from './csp.config';

describe('CSP Configuration & Origin Validator', () => {
  it('returns DEV_CSP when isDev is true', () => {
    const policy = getCspPolicy(true);
    expect(policy).toBe(DEV_CSP);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("'unsafe-inline'");
  });

  it('returns PROD_CSP when isDev is false with tightened security directives', () => {
    const policy = getCspPolicy(false);
    expect(policy).toBe(PROD_CSP);
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");

    const scriptSrcMatch = policy.match(/script-src\s+([^;]+);/);
    expect(scriptSrcMatch).not.toBeNull();
    if (scriptSrcMatch) {
      const scriptDirectives = scriptSrcMatch[1];
      expect(scriptDirectives).toContain("'unsafe-eval'");
      expect(scriptDirectives).not.toContain("'unsafe-inline'");
      expect(scriptDirectives).toContain("'wasm-unsafe-eval'");
    }
  });

  it('removes broad wildcards (https:, ws:, wss:) from PROD_CSP while preserving required hosts', () => {
    const policy = getCspPolicy(false);

    const connectSrc = policy.match(/connect-src\s+([^;]+);/)?.[1] || '';
    expect(connectSrc).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
    expect(connectSrc).not.toMatch(/(?:^|\s)ws:(?:\s|$)/);
    expect(connectSrc).not.toMatch(/(?:^|\s)wss:(?:\s|$)/);
    expect(connectSrc).toContain('http://127.0.0.1:*');
    expect(connectSrc).toContain('http://localhost:*');
    expect(connectSrc).toContain('https://huggingface.co');
    expect(connectSrc).toContain('https://*.huggingface.co');
    expect(connectSrc).toContain('https://*.hf.co');
    expect(connectSrc).toContain('https://hf-mirror.com');

    const imgSrc = policy.match(/img-src\s+([^;]+);/)?.[1] || '';
    expect(imgSrc).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
    expect(imgSrc).toContain('https://*.userapi.com');

    const fontSrc = policy.match(/font-src\s+([^;]+);/)?.[1] || '';
    expect(fontSrc).toBe("'self' data:");

    const mediaSrc = policy.match(/media-src\s+([^;]+);/)?.[1] || '';
    expect(mediaSrc).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
    expect(mediaSrc).toContain('https://*.freecodecamp.org');
  });

  it('adds frame-ancestors none only in HTTP CSP header policy, not meta CSP', () => {
    expect(getCspPolicy(false)).not.toContain('frame-ancestors');
    expect(getHttpCspPolicy(false)).toContain("frame-ancestors 'none';");
    expect(getHttpCspPolicy(true)).toContain("frame-ancestors 'none';");
  });

  describe('isTrustedFileUrl & canonical file:// origin validation', () => {
    const winRoot = 'C:\\Program Files\\A.R.C.\\resources\\app.asar\\out\\renderer';
    const linuxRoot = '/opt/arc/resources/app.asar/out/renderer';

    it('accepts canonical renderer index and nested worker/chunk files inside trustedFileRoot', () => {
      expect(
        isTrustedFileUrl(
          'file:///C:/Program%20Files/A.R.C./resources/app.asar/out/renderer/index.html',
          winRoot
        )
      ).toBe(true);
      expect(
        isTrustedFileUrl(
          'file:///c:/Program%20Files/A.R.C./resources/app.asar/out/renderer/assets/whisper.worker.js',
          winRoot
        )
      ).toBe(true);
      expect(
        isTrustedFileUrl(
          'file:///opt/arc/resources/app.asar/out/renderer/index.html',
          linuxRoot
        )
      ).toBe(true);
    });

    it('fails closed when trustedFileRoot is missing or empty', () => {
      expect(isTrustedFileUrl('file:///app/dist/index.html')).toBe(false);
      expect(isTrustedFileUrl('file:///C:/ARC/out/renderer/index.html', '')).toBe(false);
      expect(isTrustedOrigin('file:///app/dist/index.html', false)).toBe(false);
      expect(isTrustedOrigin('file:///C:/ARC/out/renderer/index.html', true)).toBe(false);
    });

    it('rejects arbitrary local files, sibling prefix bypasses, UNC hosts, and traversal payloads', () => {
      expect(
        isTrustedFileUrl('file:///C:/Users/victim/Desktop/evil.html', winRoot)
      ).toBe(false);
      expect(
        isTrustedFileUrl(
          'file:///C:/Program%20Files/A.R.C./resources/app.asar/out/renderer-evil/index.html',
          winRoot
        )
      ).toBe(false);
      expect(
        isTrustedFileUrl(
          'file:///opt/arc/resources/app.asar/out/renderer-evil/index.html',
          linuxRoot
        )
      ).toBe(false);
      expect(
        isTrustedFileUrl(
          'file://attacker/share/out/renderer/index.html',
          winRoot
        )
      ).toBe(false);
      expect(
        isTrustedFileUrl(
          'file:///opt/arc/resources/app.asar/out/renderer/../main/evil.html',
          linuxRoot
        )
      ).toBe(false);
      expect(
        isTrustedFileUrl(
          'file:///opt/arc/resources/app.asar/out/renderer/%2e%2e/evil.html',
          linuxRoot
        )
      ).toBe(false);
      expect(
        isTrustedFileUrl(
          'file:///opt/arc/resources/app.asar/out/renderer/index.html%00.js',
          linuxRoot
        )
      ).toBe(false);
    });
  });

  describe('isTrustedOrigin', () => {
    const trustedRoot = '/app/out/renderer';

    it('accepts canonical file:// URL in prod when trustedFileRoot matches', () => {
      expect(
        isTrustedOrigin('file:///app/out/renderer/index.html', false, undefined, trustedRoot)
      ).toBe(true);
      expect(
        isTrustedOrigin('file:///tmp/evil.html', false, undefined, trustedRoot)
      ).toBe(false);
    });

    it('rejects foreign web origins in prod', () => {
      expect(isTrustedOrigin('https://google.com', false, undefined, trustedRoot)).toBe(false);
      expect(isTrustedOrigin('https://malicious-site.com/media', false, undefined, trustedRoot)).toBe(false);
      expect(isTrustedOrigin('http://localhost:3000', false, undefined, trustedRoot)).toBe(false);
      expect(isTrustedOrigin('', false, undefined, trustedRoot)).toBe(false);
      expect(isTrustedOrigin(undefined, false, undefined, trustedRoot)).toBe(false);
    });

    it('accepts dev renderer URL in dev mode', () => {
      const devRendererUrl = 'http://127.0.0.1:3000';
      expect(isTrustedOrigin('http://127.0.0.1:3000/index.html', true, devRendererUrl, trustedRoot)).toBe(true);
      expect(isTrustedOrigin('http://localhost:3000/', true, devRendererUrl, trustedRoot)).toBe(true);
    });

    it('rejects malicious external URLs in dev mode', () => {
      expect(isTrustedOrigin('https://evil.com', true, 'http://127.0.0.1:3000', trustedRoot)).toBe(false);
      expect(isTrustedOrigin('http://127.0.0.1:8080', true, 'http://127.0.0.1:3000', trustedRoot)).toBe(false);
    });
  });
});
