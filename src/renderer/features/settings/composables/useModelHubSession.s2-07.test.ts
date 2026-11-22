import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  useModelHubSession,
  resetModelHubSessionForTests
} from './useModelHubSession';

describe('S2-07 useModelHubSession state restoration & readiness layers', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetModelHubSessionForTests();
    vi.restoreAllMocks();
  });

  it('shows checking (never downloaded: true) on pending timeout list and reconciles on stt:models-updated', async () => {
    let modelsUpdatedCb: ((res: any) => void) | null = null;
    vi.stubGlobal('window', {
      api: {
        getSystemMetrics: vi.fn().mockResolvedValue({ memoryTotalMb: 16384 }),
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        getSttStatus: vi.fn().mockResolvedValue({ ready: false, modelsInstalled: false, setupState: 'missing' }),
        listSttModels: vi.fn().mockResolvedValue({
          sherpaAvailable: true,
          isPending: true,
          models: [
            { id: 'zipformer-ru', downloaded: false, verificationPending: true, setupState: 'checking' },
            { id: 'whisper-small', downloaded: false, verificationPending: true, setupState: 'checking' }
          ]
        }),
        onSttModelsUpdated: vi.fn((cb: (res: any) => void) => {
          modelsUpdatedCb = cb;
          return () => {};
        }),
        getTtsServerStatus: vi.fn().mockResolvedValue({ status: 'stopped', modelInstalled: false }),
        getTtsActiveEngine: vi.fn().mockResolvedValue({ activeEngine: null })
      }
    });

    const hub = useModelHubSession();
    await hub.initializeSession();

    expect(hub.quantStateMap.value['zipformer-ru']?.setupState).toBe('checking');
    expect(hub.downloadState.value['zipformer-ru']?.downloaded).toBe(false);
    expect(hub.quantStateMap.value['v5_6_ru.pt']?.setupState).toBe('consent_required');

    // Async real verification finishes: zipformer verified on disk (not loaded), whisper manual (downloaded != verified)
    modelsUpdatedCb!({
      isPending: false,
      models: [
        { id: 'zipformer-ru', downloaded: true, integrity: { status: 'verified', algorithm: 'sha256' } },
        { id: 'whisper-small', downloaded: true, integrity: { status: 'unverified_manual', algorithm: 'sha256' } }
      ]
    });

    expect(hub.quantStateMap.value['zipformer-ru']?.setupState).toBe('ready');
    expect(hub.quantStateMap.value['zipformer-ru']?.readinessLayer).toBe('verified');
    expect(hub.quantStateMap.value['whisper-small']?.setupState).toBe('degraded');
    expect(hub.quantStateMap.value['whisper-small']?.readinessLayer).toBe('downloaded');
  });

  it('separates verified (disk), loaded (memory standby), and active (selected) across TTS and STT on Settings reopen', async () => {
    vi.stubGlobal('window', {
      api: {
        getSystemMetrics: vi.fn().mockResolvedValue({ memoryTotalMb: 16384 }),
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        getSttStatus: vi.fn().mockResolvedValue({
          ready: true,
          activeEngine: 'whisper',
          activeModelId: 'whisper-small',
          loadedModelIds: ['whisper-small', 'zipformer-ru']
        }),
        listSttModels: vi.fn().mockResolvedValue({
          isPending: false,
          models: [
            { id: 'whisper-small', downloaded: true, integrity: { status: 'verified', algorithm: 'sha256' } },
            { id: 'zipformer-ru', downloaded: true, integrity: { status: 'verified', algorithm: 'sha256' } }
          ]
        }),
        getTtsServerStatus: vi.fn().mockResolvedValue({
          status: 'stopped',
          modelInstalled: true,
          integrity: {
            state: 'READY',
            modelFile: { path: 'v5_6_ru.pt', status: 'verified', sha256Prefix: 'deadbeef' }
          }
        }),
        getTtsActiveEngine: vi.fn().mockResolvedValue({ activeEngine: 'system' })
      }
    });

    const hub = useModelHubSession();
    await hub.checkAllStatuses();

    expect(hub.quantStateMap.value['whisper-small']?.readinessLayer).toBe('active');
    expect(hub.quantStateMap.value['zipformer-ru']?.readinessLayer).toBe('loaded');
    expect(hub.quantStateMap.value['v5_6_ru.pt']?.readinessLayer).toBe('verified');
    expect(hub.quantStateMap.value['v5_6_ru.pt']?.badgeLabel).toBe('Проверена (на диске)');
  });

  it('transitions cancelled download out of downloading immediately', async () => {
    let sttProgressCb: ((data: any) => void) | null = null;
    vi.stubGlobal('window', {
      api: {
        getSystemMetrics: vi.fn().mockResolvedValue({ memoryTotalMb: 16384 }),
        checkBuiltinModel: vi.fn().mockResolvedValue(false),
        listSttModels: vi.fn().mockResolvedValue({ isPending: false, models: [] }),
        getTtsServerStatus: vi.fn().mockResolvedValue({ status: 'stopped', modelInstalled: false }),
        onSttDownloadProgress: vi.fn((cb: (data: any) => void) => {
          sttProgressCb = cb;
          return () => {};
        }),
        cancelSttDownload: vi.fn().mockResolvedValue({ success: true })
      }
    });

    const hub = useModelHubSession();
    await hub.initializeSession();

    sttProgressCb!({ modelId: 'zipformer-ru', status: 'downloading', percent: 40 });
    expect(hub.isQuantDownloading('zipformer-ru')).toBe(true);
    expect(hub.quantStateMap.value['zipformer-ru']?.setupState).toBe('downloading');

    await hub.cancelActiveDownload('zipformer-ru');
    expect(hub.isQuantDownloading('zipformer-ru')).toBe(false);
    expect(hub.quantStateMap.value['zipformer-ru']?.setupState).toBe('cancelled');
  });
});
