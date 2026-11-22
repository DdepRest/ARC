import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as path from 'path';

const {
  mockResolveSherpaModelDir,
  mockBroadcastSttToast,
  mockBuildSttWorkerConfigs,
  mockIsGigaamPreVerified,
  mockAttemptGigaamHotSwap,
  mockCircuitBreaker,
  mockFork,
  spawnedWorkers,
  workerBehavior
} = vi.hoisted(() => {
  const spawnedWorkers: any[] = [];
  const workerBehavior = {
    autoInit: true,
    hasGigaam: false,
    hasWhisper: true,
    hasVad: true
  };

  return {
    mockResolveSherpaModelDir: vi.fn((modelKey: string) => ({
      dir: `/mock/models/${modelKey}`,
      isComplete: modelKey === 'whisper-small' || modelKey === 'zipformer-ru',
      missingFiles: [] as string[]
    })),
    mockBroadcastSttToast: vi.fn(),
    mockBuildSttWorkerConfigs: vi.fn(() => ({
      vadConfig: null,
      sherpaConfig: { modelConfig: { tokens: '/mock/tokens.txt' } },
      whisperConfig: { modelConfig: { tokens: '/mock/small-tokens.txt' } },
      gigaamConfig: null,
      gigaamSourceInfo: null
    })),
    mockIsGigaamPreVerified: vi.fn(() => false),
    mockAttemptGigaamHotSwap: vi.fn(async () => false),
    mockCircuitBreaker: {
      isSourceBlocked: vi.fn(() => false),
      recordWorkerCrash: vi.fn(() => false)
    },
    mockFork: vi.fn(),
    spawnedWorkers,
    workerBehavior
  };
});

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app'),
    getPath: vi.fn(() => '/mock/userData')
  }
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const existsSync = vi.fn((p: string) => String(p).includes('stt_worker.js'));
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual,
      existsSync
    },
    existsSync
  };
});

vi.mock('./sherpa-paths.util', () => ({
  resolveSherpaModelDir: mockResolveSherpaModelDir
}));

vi.mock('./stt-config.helper', () => ({
  buildSttWorkerConfigs: mockBuildSttWorkerConfigs,
  broadcastSttToast: mockBroadcastSttToast,
  executeSttAutoDownload: vi.fn(async () => ({ success: false, error: 'offline' })),
  isGigaamPreVerified: mockIsGigaamPreVerified,
  attemptGigaamHotSwap: mockAttemptGigaamHotSwap
}));

vi.mock('./stt-circuit-breaker.util', () => ({
  sttCircuitBreaker: mockCircuitBreaker
}));

vi.mock('child_process', async () => {
  const { EventEmitter: EE } = await import('events');
  let nextPid = 41000;

  mockFork.mockImplementation(() => {
    const proc = new EE() as any;
    proc.pid = nextPid++;
    proc.connected = true;
    proc.killed = false;
    proc.stdout = new EE();
    proc.stderr = new EE();
    proc.sentMessages = [] as any[];
    proc.disconnect = vi.fn(() => {
      proc.connected = false;
    });
    proc.kill = vi.fn((_sig?: string) => {
      proc.killed = true;
      proc.connected = false;
      return true;
    });
    proc.send = vi.fn((msg: any, cb?: () => void) => {
      proc.sentMessages.push(msg);
      if (cb) cb();
      if (msg?.type === 'init' && workerBehavior.autoInit) {
        queueMicrotask(() => {
          if (!proc.killed) {
            proc.emit('message', {
              type: 'init_result',
              success: true,
              hasGigaam: workerBehavior.hasGigaam,
              hasWhisper: workerBehavior.hasWhisper,
              hasVad: workerBehavior.hasVad
            });
          }
        });
      }
      return true;
    });
    spawnedWorkers.push(proc);
    return proc;
  });

  return {
    __esModule: true,
    default: { fork: mockFork },
    fork: mockFork
  };
});

import { STTService } from './stt.service';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('STTService Worker Lifecycle (TZ §12.4 / §12.6 / S4-01)', () => {
  let service: STTService;

  beforeEach(() => {
    spawnedWorkers.length = 0;
    workerBehavior.autoInit = true;
    workerBehavior.hasGigaam = false;
    workerBehavior.hasWhisper = true;
    workerBehavior.hasVad = true;
    mockFork.mockClear();
    mockBroadcastSttToast.mockClear();
    mockResolveSherpaModelDir.mockImplementation((modelKey: string) => ({
      dir: `/mock/models/${modelKey}`,
      isComplete: modelKey === 'whisper-small' || modelKey === 'zipformer-ru',
      missingFiles: []
    }));
    service = new STTService();
  });

  afterEach(() => {
    service.shutdown();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts worker, exposes PID, shuts down cleanly without respawn even after delayed non-zero exit, and supports explicit restart', async () => {
    const started = await service.startListening();
    expect(started).toBe(true);
    expect(spawnedWorkers).toHaveLength(1);

    const firstWorker = spawnedWorkers[0];
    expect(service.getWorkerPid()).toBe(firstWorker.pid);
    expect(service.getStatus()).toMatchObject({
      ready: true,
      modelLoaded: true,
      activeEngine: 'whisper',
      setupState: 'ready',
      lastError: null
    });

    // Clean shutdown stops worker, clears PID and pending queues, and is idempotent
    service.shutdown();
    service.shutdown();

    expect(firstWorker.disconnect).toHaveBeenCalledTimes(1);
    expect(firstWorker.kill).toHaveBeenCalledWith('SIGTERM');
    expect(service.getWorkerPid()).toBeNull();
    expect(service.getStatus().ready).toBe(false);
    expect(service.getStatus().modelLoaded).toBe(false);

    // Delayed non-zero exit from the already-stopped worker must NEVER trigger auto-respawn
    firstWorker.emit('exit', 1, null);
    await flushMicrotasks();

    expect(spawnedWorkers).toHaveLength(1);
    expect(mockBroadcastSttToast).not.toHaveBeenCalled();

    // Explicit restart after shutdown works cleanly
    const restarted = await service.startListening();
    expect(restarted).toBe(true);
    expect(spawnedWorkers).toHaveLength(2);
    expect(service.getWorkerPid()).toBe(spawnedWorkers[1].pid);
    expect(service.getStatus().ready).toBe(true);
  });

  it('automatically recovers floor Whisper worker after a single unexpected runtime exit', async () => {
    const started = await service.startListening();
    expect(started).toBe(true);
    expect(spawnedWorkers).toHaveLength(1);

    const crashedWorker = spawnedWorkers[0];
    crashedWorker.emit('exit', 1, null);
    await flushMicrotasks();

    expect(spawnedWorkers).toHaveLength(2);
    expect(service.getWorkerPid()).toBe(spawnedWorkers[1].pid);
    expect(service.getStatus()).toMatchObject({
      ready: true,
      modelLoaded: true,
      activeEngine: 'whisper',
      setupState: 'ready',
      lastError: null
    });
  });

  it('trips crash-loop guard after 3 rapid crashes within 30s, reports truthful failed state, stops respawning, and clears error on later recovery', async () => {
    await service.startListening();
    expect(spawnedWorkers).toHaveLength(1);

    // Crash #1 -> auto-recovers worker #2
    spawnedWorkers[0].emit('exit', 1, null);
    await flushMicrotasks();
    expect(spawnedWorkers).toHaveLength(2);

    // Crash #2 -> auto-recovers worker #3
    spawnedWorkers[1].emit('exit', 1, null);
    await flushMicrotasks();
    expect(spawnedWorkers).toHaveLength(3);

    // Crash #3 -> crash-loop guard trips; NO 4th worker spawned
    spawnedWorkers[2].emit('exit', 1, null);
    await flushMicrotasks();
    expect(spawnedWorkers).toHaveLength(3);
    expect(service.getWorkerPid()).toBeNull();

    const failedStatus = service.getStatus();
    expect(failedStatus.ready).toBe(false);
    expect(failedStatus.setupState).toBe('failed');
    expect(failedStatus.lastError).toContain('циклическое падение');
    expect(mockBroadcastSttToast).toHaveBeenCalledWith(
      expect.stringContaining('циклическое падение'),
      'error'
    );

    // Later explicit startListening() works because isListening was reset, and clears stale lastError
    const recovered = await service.startListening();
    expect(recovered).toBe(true);
    expect(spawnedWorkers).toHaveLength(4);
    expect(service.getStatus()).toMatchObject({
      ready: true,
      setupState: 'ready',
      lastError: null
    });
  });

  it('handles heartbeat timeout via reset_buffer/ping: pong cancels restart, silence triggers single clean recovery', async () => {
    vi.useFakeTimers();

    const initPromise = service.startListening();
    await flushMicrotasks();
    expect(await initPromise).toBe(true);
    expect(spawnedWorkers).toHaveLength(1);

    const worker1 = spawnedWorkers[0];

    // Advance past 15s heartbeat threshold (interval=2000ms -> 16000ms)
    vi.advanceTimersByTime(16000);
    expect(worker1.sentMessages.some((m: any) => m.type === 'reset_buffer')).toBe(true);

    // Case A: worker responds with pong before 3s grace expires -> no kill/restart
    worker1.emit('message', { type: 'pong' });
    vi.advanceTimersByTime(3500);
    expect(worker1.kill).not.toHaveBeenCalled();
    expect(spawnedWorkers).toHaveLength(1);

    // Case B: worker hangs completely -> past 15s threshold + 3s recovery grace -> SIGTERM + single respawn
    vi.advanceTimersByTime(16000);
    vi.advanceTimersByTime(3100);
    await flushMicrotasks();

    expect(worker1.kill).toHaveBeenCalledWith('SIGTERM');
    expect(spawnedWorkers).toHaveLength(2);

    // Delayed exit from old hung worker #1 must NOT trigger a second respawn
    worker1.emit('exit', 1, null);
    await flushMicrotasks();
    expect(spawnedWorkers).toHaveLength(2);
    expect(service.getWorkerPid()).toBe(spawnedWorkers[1].pid);
  });

  it('verifies src/main/index.ts wires sttService.shutdown() and sherpaDownloaderService.cancelAllDownloads() on quit with a single before-quit handler', async () => {
    const actualFs = await vi.importActual<typeof import('fs')>('fs');
    const mainIndexPath = path.resolve(process.cwd(), 'src/main/index.ts');
    const source = actualFs.readFileSync(mainIndexPath, 'utf-8');

    const beforeQuitMatches = source.match(/app\.on\('before-quit'/g) || [];
    expect(beforeQuitMatches).toHaveLength(1);

    const windowAllClosedBlock = source.slice(source.indexOf("app.on('window-all-closed'"), source.indexOf("app.on('before-quit'"));
    const beforeQuitBlock = source.slice(source.indexOf("app.on('before-quit'"));

    expect(windowAllClosedBlock).toContain('sttService.shutdown()');
    expect(windowAllClosedBlock).toContain('sherpaDownloaderService.cancelAllDownloads()');
    expect(beforeQuitBlock).toContain('sttService.shutdown()');
    expect(beforeQuitBlock).toContain('sherpaDownloaderService.cancelAllDownloads()');
  });
});
