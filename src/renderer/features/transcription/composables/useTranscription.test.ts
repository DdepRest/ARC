import { describe, it, expect, vi } from 'vitest';
import { useTranscription } from './useTranscription';

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
  };
});

describe('Task 3.2 — useTranscription console integrity', () => {
  it('does not override global console.log, console.warn, or console.error on multiple calls', () => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const first = useTranscription();
    const second = useTranscription();

    expect(console.log).toBe(origLog);
    expect(console.warn).toBe(origWarn);
    expect(console.error).toBe(origError);

    first.setDevice('cuda');
    second.setDevice('dml');

    expect(first.debugLogs.value.length).toBe(1);
    expect(second.debugLogs.value.length).toBe(1);
    expect(console.log).toBe(origLog);
  });
});
