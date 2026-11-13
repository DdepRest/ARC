import { describe, it, expect } from 'vitest';
import { getCspPolicy, isTrustedOrigin, DEV_CSP, PROD_CSP } from './csp.config';

describe('CSP Configuration & Origin Validator', () => {
  it('returns DEV_CSP when isDev is true', () => {
    const policy = getCspPolicy(true);
    expect(policy).toBe(DEV_CSP);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("'unsafe-inline'");
  });

  it('returns PROD_CSP when isDev is false with hardened security directives', () => {
    const policy = getCspPolicy(false);
    expect(policy).toBe(PROD_CSP);
    // Prod CSP MUST contain wasm-unsafe-eval for ONNX/WASM STT
    expect(policy).toContain("'wasm-unsafe-eval'");
    // Prod CSP script-src MUST NOT contain unsafe-inline, retains unsafe-eval for onnxruntime-web/litegraph
    const scriptSrcMatch = policy.match(/script-src\s+([^;]+);/);
    expect(scriptSrcMatch).not.toBeNull();
    if (scriptSrcMatch) {
      const scriptDirectives = scriptSrcMatch[1];
      expect(scriptDirectives).toContain("'unsafe-eval'");
      expect(scriptDirectives).not.toContain("'unsafe-inline'");
      expect(scriptDirectives).toContain("'wasm-unsafe-eval'");
    }
  });

  it('includes required connect-src domains in PROD_CSP', () => {
    const policy = getCspPolicy(false);
    expect(policy).toContain('huggingface.co');
    expect(policy).toContain('hf-mirror.com');
    expect(policy).toContain('openrouter.ai');
    expect(policy).toContain('api.openai.com');
    expect(policy).toContain('127.0.0.1:*');
  });

  it('allows Google Fonts in style-src and font-src for both DEV_CSP and PROD_CSP', () => {
    for (const policy of [getCspPolicy(true), getCspPolicy(false)]) {
      expect(policy).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;");
      expect(policy).toContain('https://fonts.gstatic.com');
    }
  });

  describe('isTrustedOrigin', () => {
    it('accepts file:// URLs in both dev and prod', () => {
      expect(isTrustedOrigin('file:///app/dist/index.html', false)).toBe(true);
      expect(isTrustedOrigin('file:///C:/ARC/out/renderer/index.html', true)).toBe(true);
    });

    it('rejects foreign web origins in prod', () => {
      expect(isTrustedOrigin('https://google.com', false)).toBe(false);
      expect(isTrustedOrigin('https://malicious-site.com/media', false)).toBe(false);
      expect(isTrustedOrigin('http://localhost:3000', false)).toBe(false);
      expect(isTrustedOrigin('', false)).toBe(false);
      expect(isTrustedOrigin(undefined, false)).toBe(false);
    });

    it('accepts dev renderer URL in dev mode', () => {
      const devRendererUrl = 'http://127.0.0.1:3000';
      expect(isTrustedOrigin('http://127.0.0.1:3000/index.html', true, devRendererUrl)).toBe(true);
      expect(isTrustedOrigin('http://localhost:3000/', true, devRendererUrl)).toBe(true);
    });

    it('rejects malicious external URLs in dev mode', () => {
      expect(isTrustedOrigin('https://evil.com', true, 'http://127.0.0.1:3000')).toBe(false);
      expect(isTrustedOrigin('http://127.0.0.1:8080', true, 'http://127.0.0.1:3000')).toBe(false);
    });
  });
});
