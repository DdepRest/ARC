import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/arc-resilience-userdata'),
    getAppPath: vi.fn(() => '/tmp/arc-resilience-app')
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) }
}));

import { MacroSchedulerService } from './macro-scheduler.service';
import { providerHealthManager } from './llm/providers/provider-health';
import { SHERPA_MODELS_CONFIG, SherpaDownloaderService } from './sherpa-downloader.service';
import { setLoopbackDownloadTestHarness } from '../utils/network-security.util';

describe('§12.6 Runtime Resilience — Sleep/Resume and Network Loss/Recovery', () => {
  let tmpRoot = '';

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-resilience-'));
    providerHealthManager.resetAll();
  });

  afterEach(async () => {
    setLoopbackDownloadTestHarness(false);
    providerHealthManager.resetAll();
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. OS Sleep / Resume resilience
  // =========================================================================
  it('wires powerMonitor resume/unlock-screen hooks in main/index.ts and catches up <=15m without duplicating or running >15m stale slots', async () => {
    const mainIndexSrc = fs.readFileSync(path.join(process.cwd(), 'src/main/index.ts'), 'utf8');
    expect(mainIndexSrc).toContain("powerMonitor.on('resume'");
    expect(mainIndexSrc).toContain("powerMonitor.on('unlock-screen'");

    const macrosDir = path.join(tmpRoot, 'macros');
    const stateFile = path.join(tmpRoot, 'schedule-state.json');
    fs.mkdirSync(macrosDir, { recursive: true });

    // Two timer macros: 08:00 (missed by 8m on wake -> catch up) and 07:00 (missed by 68m -> skip)
    fs.writeFileSync(
      path.join(macrosDir, 'morning.json'),
      JSON.stringify({
        id: 'morning-catchup',
        name: 'Morning',
        nodes: [{ id: 1, type: 'triggers/timer', properties: { time: '08:00' } }]
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(macrosDir, 'stale.json'),
      JSON.stringify({
        id: 'stale-skip',
        name: 'Stale',
        nodes: [{ id: 2, type: 'triggers/timer', properties: { time: '07:00' } }]
      }),
      'utf8'
    );

    const executedIds: string[] = [];
    const wakeTime = new Date('2026-11-21T08:08:00.000Z');
    const scheduler = new MacroSchedulerService({
      macrosDir,
      stateFilePath: stateFile,
      nowFn: () => wakeTime,
      timeZoneFn: () => 'UTC',
      executor: { execute: async (m: any) => { executedIds.push(m.id); } },
      notifyToast: () => {}
    });

    // First wake (powerMonitor resume)
    await scheduler.checkNow();
    // Second rapid event (unlock-screen right after resume) must NOT duplicate execution
    await scheduler.checkNow();

    expect(executedIds).toEqual(['morning']);
    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(persisted['morning::1']?.lastRunDate).toBe('2026-11-21');
    expect(persisted['stale::2']?.lastRunDate).toBe('2026-11-21');
  });

  // =========================================================================
  // 2. Network Loss & Automatic Recovery (AI Providers)
  // =========================================================================
  it('transitions provider through network cooldown and 10m quarantine, then auto-recovers when network returns', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T10:00:00.000Z'));

    // Single transient network drop -> 30s cooldown, NOT quarantined
    providerHealthManager.markFailure('openrouter', false, true);
    expect(providerHealthManager.getHealth('openrouter').healthy).toBe(false);
    expect(providerHealthManager.isQuarantined('openrouter')).toBe(false);

    // After 31s cooldown expires -> automatically healthy again
    vi.advanceTimersByTime(31_000);
    expect(providerHealthManager.getHealth('openrouter').healthy).toBe(true);

    // Sustained outage (3 consecutive network failures) -> 10m quarantine
    providerHealthManager.markFailure('openrouter', false, true);
    providerHealthManager.markFailure('openrouter', false, true);
    providerHealthManager.markFailure('openrouter', false, true);
    expect(providerHealthManager.isQuarantined('openrouter')).toBe(true);

    // After 10m + 1s -> auto-released from quarantine without app restart
    vi.advanceTimersByTime(10 * 60 * 1000 + 1_000);
    expect(providerHealthManager.isQuarantined('openrouter')).toBe(false);
    expect(providerHealthManager.getHealth('openrouter').healthy).toBe(true);
    expect(providerHealthManager.getHealth('openrouter').consecutiveFails).toBe(0);
  });

  // =========================================================================
  // 3. Network Drop Mid-Download & Clean Recovery (Sherpa Model Downloader)
  // =========================================================================
  it('leaves no corrupt final model after mid-stream TCP reset and succeeds cleanly once network recovers', async () => {
    setLoopbackDownloadTestHarness(true);
    const service = SherpaDownloaderService.getInstance();
    await service.cancelAllDownloads();

    const payload = Buffer.alloc(4096, 0x42);
    const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');
    let dropConnection = true;

    const server = http.createServer((_req, res) => {
      if (dropConnection) {
        // Send partial headers + chunk, then abruptly destroy TCP socket (network loss)
        res.writeHead(200, { 'Content-Length': String(payload.length) });
        res.write(payload.subarray(0, 512));
        setTimeout(() => { res.socket?.destroy(); }, 20);
        return;
      }
      res.writeHead(200, { 'Content-Length': String(payload.length) });
      res.end(payload);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    const origFiles = SHERPA_MODELS_CONFIG['silero-vad'].files.map((f) => ({ ...f }));
    const modelDir = path.join(tmpRoot, 'models', 'silero-vad');
    const getModelDirSpy = vi.spyOn(service as any, 'getModelDir').mockReturnValue(modelDir);

    try {
      SHERPA_MODELS_CONFIG['silero-vad'].files = [
        {
          name: 'silero_vad.onnx',
          url: `http://127.0.0.1:${port}/silero_vad.onnx`,
          size: payload.length,
          sha256: expectedHash
        }
      ];

      // Attempt 1: network drops mid-transfer -> fails cleanly, no final corrupt file
      const failRes = await service.downloadModel('silero-vad', () => {});
      expect(failRes.success).toBe(false);
      expect(fs.existsSync(path.join(modelDir, 'silero_vad.onnx'))).toBe(false);

      // Network recovers
      dropConnection = false;
      const okRes = await service.downloadModel('silero-vad', () => {});
      expect(okRes.success).toBe(true);
      expect(fs.existsSync(path.join(modelDir, 'silero_vad.onnx'))).toBe(true);
      const actualHash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(modelDir, 'silero_vad.onnx')))
        .digest('hex');
      expect(actualHash).toBe(expectedHash);
    } finally {
      getModelDirSpy.mockRestore();
      SHERPA_MODELS_CONFIG['silero-vad'].files = origFiles;
      await service.cancelAllDownloads();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
