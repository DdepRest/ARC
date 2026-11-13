import { describe, it, expect, vi } from 'vitest';
import { aggregateAppMetrics, collectAppMetrics } from './app-metrics.util';

describe('aggregateAppMetrics', () => {
  it('converts workingSetSize from KB to MB and sums appMemoryMb across Electron processes', () => {
    const rawMetrics = [
      {
        pid: 1001,
        type: 'Browser',
        memory: { workingSetSize: 204800 }, // 200 MB
        cpu: { percentCPUUsage: 1.25 }
      },
      {
        pid: 1002,
        type: 'GPU',
        memory: { workingSetSize: 102400 }, // 100 MB
        cpu: { percentCPUUsage: 0.5 }
      }
    ];

    const result = aggregateAppMetrics(rawMetrics);

    expect(result.appMemoryMb).toBe(300);
    expect(result.appProcesses).toHaveLength(2);
    expect(result.appProcesses[0]).toEqual({
      pid: 1001,
      type: 'Browser',
      memoryMb: 200,
      cpuPercent: 1.3
    });
    expect(result.appProcesses[1]).toEqual({
      pid: 1002,
      type: 'GPU',
      memoryMb: 100,
      cpuPercent: 0.5
    });
  });

  it('appends python and stt child PIDs with type="child" and memoryMb=null when running', () => {
    const rawMetrics = [
      {
        pid: 1001,
        type: 'Browser',
        memory: { workingSetSize: 51200 } // 50 MB
      }
    ];

    const result = aggregateAppMetrics(rawMetrics, {
      pythonPid: 4321,
      sttPid: 8765
    });

    expect(result.appProcesses).toHaveLength(3);
    const pythonEntry = result.appProcesses.find(p => p.pid === 4321);
    expect(pythonEntry).toEqual({
      pid: 4321,
      type: 'child',
      memoryMb: null,
      label: 'python'
    });

    const sttEntry = result.appProcesses.find(p => p.pid === 8765);
    expect(sttEntry).toEqual({
      pid: 8765,
      type: 'child',
      memoryMb: null,
      label: 'stt'
    });
  });

  it('assigns label to existing process if Electron already tracks child PID', () => {
    const rawMetrics = [
      {
        pid: 4321,
        type: 'Utility',
        memory: { workingSetSize: 81920 } // 80 MB
      }
    ];

    const result = aggregateAppMetrics(rawMetrics, {
      pythonPid: 4321,
      sttPid: null
    });

    expect(result.appProcesses).toHaveLength(1);
    expect(result.appProcesses[0]).toEqual({
      pid: 4321,
      type: 'Utility',
      memoryMb: 80,
      label: 'python'
    });
  });

  it('omits child processes when pythonPid and sttPid are null or non-positive', () => {
    const rawMetrics = [
      {
        pid: 1001,
        type: 'Browser',
        memory: { workingSetSize: 51200 }
      }
    ];

    const result = aggregateAppMetrics(rawMetrics, {
      pythonPid: null,
      sttPid: 0
    });

    expect(result.appProcesses).toHaveLength(1);
    expect(result.appProcesses[0].pid).toBe(1001);
  });

  it('handles empty or non-array raw metrics gracefully', () => {
    expect(aggregateAppMetrics(null)).toEqual({ appMemoryMb: null, appProcesses: [] });
    expect(aggregateAppMetrics(undefined)).toEqual({ appMemoryMb: null, appProcesses: [] });
    expect(aggregateAppMetrics([] as any)).toEqual({ appMemoryMb: 0, appProcesses: [] });
  });
});

describe('collectAppMetrics', () => {
  it('safely catches errors and returns null fallback when getAppMetrics throws', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = collectAppMetrics({
      getAppMetrics: () => {
        throw new Error('Electron app.getAppMetrics not ready');
      }
    });

    expect(result).toEqual({ appMemoryMb: null, appProcesses: [] });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
