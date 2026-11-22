import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { handlers, mockGetAllowedRoots, mockIsPathAllowed, mockCpuTemperature, mockGraphics } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  mockGetAllowedRoots: vi.fn<() => string[]>(),
  mockIsPathAllowed: vi.fn<(p: string) => boolean>(),
  mockCpuTemperature: vi.fn<() => Promise<any>>(),
  mockGraphics: vi.fn<() => Promise<any>>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir())
  },
  clipboard: {
    writeText: vi.fn()
  }
}));

vi.mock('systeminformation', () => ({
  osInfo: vi.fn().mockResolvedValue({ platform: 'win32', distro: 'Windows', arch: 'x64' }),
  cpu: vi.fn().mockResolvedValue({ manufacturer: 'Intel', brand: 'Core', cores: 8 }),
  mem: vi.fn().mockResolvedValue({ total: 16 * 1024 ** 3, active: 8 * 1024 ** 3 }),
  networkStats: vi.fn().mockResolvedValue([]),
  cpuTemperature: mockCpuTemperature,
  graphics: mockGraphics
}));

vi.mock('../services/python_server.service', () => ({
  PythonServerService: {
    setEcoState: vi.fn(),
    getPythonPid: vi.fn().mockReturnValue(null)
  }
}));

vi.mock('../services/eco.service', () => ({
  ecoService: {
    getIntervalMs: vi.fn().mockReturnValue(60000),
    getState: vi.fn().mockReturnValue('active'),
    on: vi.fn()
  }
}));

vi.mock('../services/files.service', () => ({
  getAllowedRoots: mockGetAllowedRoots,
  isPathAllowed: mockIsPathAllowed
}));

import { registerSystemIpc } from './system.ipc';

describe('Task 1.3 & Task 3.2 — system.ipc.ts Sandbox Delegation & Real Sensor Telemetry', () => {
  let tmpAllowedDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    tmpAllowedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-system-files-test-'));
    registerSystemIpc();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpAllowedDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('1. system:files never reads "." and returns [] when getAllowedRoots() is empty', async () => {
    const readdirSpy = vi.spyOn(fs.promises, 'readdir');
    mockGetAllowedRoots.mockReturnValue([]);
    mockIsPathAllowed.mockReturnValue(false);

    const systemFilesHandler = handlers.get('system:files')!;
    expect(systemFilesHandler).toBeDefined();

    const result = await systemFilesHandler();
    expect(result).toEqual([]);
    expect(readdirSpy).not.toHaveBeenCalledWith('.');
    expect(readdirSpy).not.toHaveBeenCalled();

    readdirSpy.mockRestore();
  });

  it('2. system:files reads only from an allowed root verified by isPathAllowed() and returns [] if isPathAllowed() rejects the directory', async () => {
    const readdirSpy = vi.spyOn(fs.promises, 'readdir');
    fs.writeFileSync(path.join(tmpAllowedDir, 'safe-doc.txt'), 'ok', 'utf-8');
    fs.writeFileSync(path.join(tmpAllowedDir, 'notes.md'), 'ok', 'utf-8');

    // Allowed case
    mockGetAllowedRoots.mockReturnValue([tmpAllowedDir]);
    mockIsPathAllowed.mockImplementation((target: string) => target === tmpAllowedDir);

    const systemFilesHandler = handlers.get('system:files')!;
    const allowedResult = await systemFilesHandler();

    expect(allowedResult.sort()).toEqual(['notes.md', 'safe-doc.txt']);
    expect(readdirSpy).not.toHaveBeenCalledWith('.');
    expect(readdirSpy).toHaveBeenCalledWith(tmpAllowedDir);

    // Rejected case (isPathAllowed returns false)
    readdirSpy.mockClear();
    mockIsPathAllowed.mockReturnValue(false);
    const rejectedResult = await systemFilesHandler();
    expect(rejectedResult).toEqual([]);
    expect(readdirSpy).not.toHaveBeenCalled();

    readdirSpy.mockRestore();
  });

  it('3. system:metrics reads real CPU/GPU temperatures and VRAM via systeminformation and caches for 5s TTL', async () => {
    mockCpuTemperature.mockResolvedValue({ main: 58.4 });
    mockGraphics.mockResolvedValue({
      controllers: [{ temperatureGpu: 64.2, memoryUsed: 4096, memoryTotal: 12288 }]
    });

    const metricsHandler = handlers.get('system:metrics')!;
    expect(metricsHandler).toBeDefined();

    const res1 = await metricsHandler();
    expect(res1.temperature).toBe(58);
    expect(res1.cpuTemperature).toBe(58);
    expect(res1.gpuTemperature).toBe(64);
    expect(res1.vramUsedMb).toBe(4096);
    expect(res1.vramTotalMb).toBe(12288);
    expect(mockCpuTemperature).toHaveBeenCalledTimes(1);
    expect(mockGraphics).toHaveBeenCalledTimes(1);

    // Second call within 5s TTL uses cache without calling si again
    mockCpuTemperature.mockResolvedValue({ main: 75 });
    const res2 = await metricsHandler();
    expect(res2.cpuTemperature).toBe(58);
    expect(mockCpuTemperature).toHaveBeenCalledTimes(1);
    expect(mockGraphics).toHaveBeenCalledTimes(1);
  });

  it('4. system:metrics returns null for temperature/cpuTemperature/gpuTemperature when sensors return main: -1 or reject', async () => {
    mockCpuTemperature.mockResolvedValue({ main: -1 });
    mockGraphics.mockRejectedValue(new Error('sensor error'));

    const metricsHandler = handlers.get('system:metrics')!;
    const res = await metricsHandler();

    expect(res.temperature).toBeNull();
    expect(res.cpuTemperature).toBeNull();
    expect(res.gpuTemperature).toBeNull();
    expect(res.vramUsedMb).toBeNull();

    // Also verify when cpuTemperature itself rejects
    handlers.clear();
    registerSystemIpc();
    mockCpuTemperature.mockRejectedValue(new Error('wmi access denied'));
    mockGraphics.mockResolvedValue({ controllers: [{ temperatureGpu: -1, memoryUsed: 0, memoryTotal: 0 }] });

    const resRejected = await handlers.get('system:metrics')!();
    expect(resRejected.temperature).toBeNull();
    expect(resRejected.cpuTemperature).toBeNull();
    expect(resRejected.gpuTemperature).toBeNull();
    expect(resRejected.vramUsedMb).toBeNull();
  });

  it('5. system:modules returns unified ModulesCapabilitySnapshot and forwards refresh option', async () => {
    const modulesHandler = handlers.get('system:modules')!;
    expect(modulesHandler).toBeDefined();

    const snap = await modulesHandler();
    expect(snap.schemaVersion).toBe(1);
    expect(Array.isArray(snap.capabilities)).toBe(true);
    expect(snap.capabilities).toHaveLength(14);
    expect(snap.summary.total).toBe(14);
    expect(snap.summary.planned).toBe(4);
    expect(snap.legacyStatusMap).toHaveProperty('Assistant');
    expect(snap.legacyStatusMap).toHaveProperty('Voice');
    expect(snap.legacyStatusMap).toHaveProperty('Memory');
    expect(snap.legacyStatusMap).toHaveProperty('Tasks');

    const refreshed = await modulesHandler({ refresh: true });
    expect(refreshed.schemaVersion).toBe(1);
    expect(typeof refreshed.checkedAt).toBe('string');
  });
});
