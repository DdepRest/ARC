import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/arc-test-userdata'),
    isPackaged: false
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}));

const mockIsModelComplete = vi.fn();
const mockDownloadModel = vi.fn();
const mockCancelAllDownloads = vi.fn();
const mockGetActiveModelIds = vi.fn(() => []);

vi.mock('./sherpa-paths.util', () => ({
  resolveSherpaModelDir: (id: string) => ({
    dir: `/tmp/models/${id}`,
    isComplete: Boolean(mockIsModelComplete(id))
  })
}));

vi.mock('./sherpa-downloader.service', () => ({
  sherpaDownloaderService: {
    downloadModel: (...args: any[]) => mockDownloadModel(...args),
    cancelAllDownloads: (...args: any[]) => mockCancelAllDownloads(...args),
    getActiveModelIds: () => mockGetActiveModelIds()
  }
}));

const mockPythonStart = vi.fn();
const mockResolveSileroModelPath = vi.fn(() => null);
const mockResolvePythonExe = vi.fn(() => ({ exe: 'python3', kind: 'system' }));
const mockGetLastDepReadiness = vi.fn(() => ({ coreReady: false }));

vi.mock('./python_server.service', () => ({
  PythonServerService: {
    start: (...args: any[]) => mockPythonStart(...args),
    resolveSileroModelPath: () => mockResolveSileroModelPath(),
    resolvePythonExe: () => mockResolvePythonExe(),
    getLastDependencyReadiness: () => mockGetLastDepReadiness()
  }
}));

import { voiceSetupService } from './voice-setup.service';
import { ensureSileroModelReady } from './python_sync.util';

describe('S2-06 / P1-09: First-Run Voice Setup & No Surprise Downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsModelComplete.mockReturnValue(false);
    mockResolveSileroModelPath.mockReturnValue(null);
    mockResolvePythonExe.mockReturnValue({ exe: 'python3', kind: 'system' });
    mockGetLastDepReadiness.mockReturnValue({ coreReady: false });
  });

  it('ensureSileroModelReady returns null without network activity when allowDownload is false', async () => {
    const res = await ensureSileroModelReady(
      () => '/tmp/nonexistent-arc-dir',
      () => null,
      undefined,
      { allowDownload: false }
    );
    expect(res).toBeNull();
  });

  it('returns honest component inventory with exact manifest sizes and null for unknown Python wheel sizes', () => {
    const status = voiceSetupService.getStatus({ includeWhisper: true, includeGigaam: false });

    const baseline = status.components.filter((c) => c.tier === 'baseline');
    const optional = status.components.filter((c) => c.tier === 'optional');

    expect(baseline.map((c) => c.id)).toEqual(['silero-vad', 'zipformer-ru', 'silero-tts-v5', 'python-env']);
    expect(optional.map((c) => c.id)).toEqual(['whisper-small', 'gigaam-ctc']);

    const pyComp = status.components.find((c) => c.id === 'python-env');
    expect(pyComp?.exactBytes).toBeNull();
    expect(pyComp?.sizeLabel).toContain('неизвестен');

    const zipComp = status.components.find((c) => c.id === 'zipformer-ru');
    expect(zipComp?.exactBytes).toBe(94120075);
    expect(status.hasUnknownSizeComponent).toBe(true);
  });

  it('enforces single-flight protection so concurrent startSetup calls share the same run', async () => {
    mockDownloadModel.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { success: true, status: 'completed' };
    });
    mockPythonStart.mockResolvedValue(undefined);

    const p1 = voiceSetupService.startSetup({ includeTts: false });
    const p2 = voiceSetupService.startSetup({ includeTts: false });

    expect(voiceSetupService.getStatus().inProgress).toBe(true);

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.inProgress).toBe(false);
    expect(res2.inProgress).toBe(false);
    // Only 2 baseline STT models (silero-vad, zipformer-ru) downloaded once total, not duplicated
    expect(mockDownloadModel).toHaveBeenCalledTimes(2);
  });

  it('supports cancelSetup and transitions state to cancelled', async () => {
    mockDownloadModel.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { success: false, status: 'cancelled' };
    });
    mockCancelAllDownloads.mockResolvedValue(undefined);

    const runPromise = voiceSetupService.startSetup({ includeTts: false });
    await voiceSetupService.cancelSetup();
    const finalStatus = await runPromise;

    expect(mockCancelAllDownloads).toHaveBeenCalled();
    expect(finalStatus.overallState).toBe('cancelled');
  });

  it('switches to degraded state when system_fallback mode is chosen without local models', () => {
    const snap = voiceSetupService.setMode('system_fallback');
    expect(snap.mode).toBe('system_fallback');
    expect(snap.overallState).toBe('degraded');
  });
});
