import { describe, it, expect } from 'vitest';
import { formatFailureReason } from './failure-reason';

describe('formatFailureReason', () => {
  it('formats ECONNREFUSED error accurately', () => {
    const err = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:11434' };
    expect(formatFailureReason(err)).toBe('Сервер не отвечает (endpoint недоступен)');
  });

  it('formats timeout error accurately', () => {
    const err = { code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' };
    expect(formatFailureReason(err)).toBe('Сервер не уложился в 30 секунд');
  });

  it('formats quarantine error with time and fail count', () => {
    const date = new Date(2026, 8, 21, 14, 30);
    const err = {
      isQuarantine: true,
      quarantineUntil: date.getTime(),
      failuresCount: 3
    };
    expect(formatFailureReason(err)).toBe('Провайдер в карантине до 14:30 после 3 сбоев');
  });

  it('formats HTTP 401 error', () => {
    const err = {
      response: {
        status: 401,
        statusText: 'Unauthorized'
      }
    };
    expect(formatFailureReason(err)).toContain('HTTP 401');
    expect(formatFailureReason(err)).toContain('Unauthorized');
  });

  it('formats HTTP 500 error with server details', () => {
    const err = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: { message: 'CUDA out of memory' } }
      }
    };
    expect(formatFailureReason(err)).toContain('HTTP 500');
    expect(formatFailureReason(err)).toContain('CUDA out of memory');
  });
});
