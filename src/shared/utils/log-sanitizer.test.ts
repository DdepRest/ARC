import { describe, it, expect } from 'vitest';
import { sanitizeError, maskSecrets } from './log-sanitizer';

describe('Log Sanitizer & Secret Masking', () => {
  describe('maskSecrets', () => {
    it('masks Bearer authorization tokens in text', () => {
      const input = 'Request failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret';
      const output = maskSecrets(input);
      expect(output).toContain('Authorization: Bearer ***');
      expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('masks OpenAI/Anthropic sk- keys', () => {
      const input = 'Connecting with api key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz';
      const output = maskSecrets(input);
      expect(output).toContain('sk-***');
      expect(output).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz');
    });

    it('masks Google Gemini AIza keys', () => {
      const input = 'Key loaded: AIzaSyD1234567890abcdefghij1234567890';
      const output = maskSecrets(input);
      expect(output).toContain('AIza***');
      expect(output).not.toContain('AIzaSyD1234567890');
    });

    it('masks JSON fields with apiKey and token', () => {
      const payload = {
        name: 'OpenRouter',
        apiKey: 'sk-or-v1-supersecretkey12345',
        token: 'secret_token_value'
      };
      const output = maskSecrets(payload);
      expect(output).toContain('"apiKey":"***"');
      expect(output).toContain('"token":"***"');
      expect(output).not.toContain('supersecretkey');
    });
  });

  describe('sanitizeError', () => {
    it('formats Error object with message', () => {
      const err = new Error('File not found');
      expect(sanitizeError(err)).toBe('File not found');
    });

    it('formats Error object with code and message into [CODE] message', () => {
      const err: any = new Error('Connection refused');
      err.code = 'ECONNREFUSED';
      expect(sanitizeError(err)).toBe('[ECONNREFUSED] Connection refused');
    });

    it('formats Axios-like error with HTTP status', () => {
      const axiosErr = {
        code: 'ERR_BAD_REQUEST',
        response: { status: 401, statusText: 'Unauthorized' },
        message: 'Request failed with status code 401'
      };
      expect(sanitizeError(axiosErr)).toBe('[ERR_BAD_REQUEST] Request failed with status code 401');
    });

    it('sanitizes strings containing secrets inside error message', () => {
      const err = new Error('Invalid key Bearer secret_token_123456');
      expect(sanitizeError(err)).toBe('Invalid key Bearer ***');
    });

    it('handles null/undefined gracefully', () => {
      expect(sanitizeError(null)).toBe('Unknown error');
      expect(sanitizeError(undefined)).toBe('Unknown error');
    });
  });
});
