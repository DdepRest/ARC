import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useModelDownloadStore } from './modelDownload.store';

describe('modelDownload.store STT cancellation semantics', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it('handles status=cancelled by clearing download without errorText', () => {
    const store = useModelDownloadStore();

    store.updateSttProgress({
      modelId: 'zipformer-ru',
      percent: 42,
      status: 'downloading',
      bytes_done: 4200,
      total_bytes: 10000
    });
    expect(store.isDownloading).toBe(true);
    expect(store.currentFilename).toBe('zipformer-ru');

    store.updateSttProgress({
      modelId: 'zipformer-ru',
      percent: 0,
      status: 'cancelled'
    });

    expect(store.isDownloading).toBe(false);
    expect(store.errorText).toBe('');
    expect(store.currentFilename).toBe('');
    expect(store.hasActiveNotification).toBe(false);
  });

  it('sends active STT modelId to cancelSttDownload on user cancel', async () => {
    const cancelSttDownload = vi.fn().mockResolvedValue({ success: true, cancelled: true, modelId: 'whisper-small' });
    const cancelBuiltinModelDownload = vi.fn();
    (globalThis as any).window = {
      api: {
        cancelSttDownload,
        cancelBuiltinModelDownload
      }
    };

    const store = useModelDownloadStore();
    store.updateSttProgress({
      modelId: 'whisper-small',
      percent: 15,
      status: 'downloading',
      bytes_done: 1500,
      total_bytes: 10000
    });

    await store.cancelDownload();

    expect(cancelSttDownload).toHaveBeenCalledWith('whisper-small');
    expect(cancelBuiltinModelDownload).not.toHaveBeenCalled();
    expect(store.isDownloading).toBe(false);
    expect(store.errorText).toBe('');
  });

  it('does not invent a fake 235MB totalBytes when total_bytes is unknown', () => {
    const store = useModelDownloadStore();

    store.updateSttProgress({
      modelId: 'zipformer-ru',
      percent: 25,
      status: 'downloading'
    });

    expect(store.totalBytes).toBe(0);
    expect(store.bytesDone).toBe(0);
    expect(store.progressPercent).toBe('25.0');
    expect(store.estimatedTimeFormatted).toBe('--:--');
  });

  it('shows ETA only after at least 2 speed measurement samples', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const store = useModelDownloadStore();

      store.updateSttProgress({
        modelId: 'zipformer-ru',
        percent: 0,
        status: 'downloading',
        bytes_done: 0,
        total_bytes: 100000
      });
      expect(store.estimatedTimeFormatted).toBe('--:--');

      // Sample 1 (+500ms) -> speed measured, but still only 1 sample -> ETA stays '--:--'
      vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'));
      store.updateSttProgress({
        modelId: 'zipformer-ru',
        percent: 20,
        status: 'downloading',
        bytes_done: 20000,
        total_bytes: 100000
      });
      expect(store.estimatedTimeFormatted).toBe('--:--');

      // Sample 2 (+1000ms) -> 2 samples collected -> ETA becomes numeric MM:SS
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
      store.updateSttProgress({
        modelId: 'zipformer-ru',
        percent: 40,
        status: 'downloading',
        bytes_done: 40000,
        total_bytes: 100000
      });
      expect(store.estimatedTimeFormatted).not.toBe('--:--');
    } finally {
      vi.useRealTimers();
    }
  });
});
