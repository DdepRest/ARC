export interface AppProcessEntry {
  pid: number;
  type: string;
  memoryMb: number | null;
  cpuPercent?: number;
  label?: 'python' | 'stt';
}

export interface AggregatedAppMetrics {
  appMemoryMb: number | null;
  appProcesses: AppProcessEntry[];
}

export interface CollectAppMetricsOptions {
  getAppMetrics?: () => Array<{
    pid: number;
    type?: string;
    memory?: {
      workingSetSize?: number; // in KB in Electron
      peakWorkingSetSize?: number;
    };
    cpu?: {
      percentCPUUsage?: number;
    };
  }>;
  pythonPid?: number | null;
  sttPid?: number | null;
}

export function aggregateAppMetrics(
  rawMetrics: Array<{
    pid: number;
    type?: string;
    memory?: { workingSetSize?: number };
    cpu?: { percentCPUUsage?: number };
  }> | null | undefined,
  childPids?: { pythonPid?: number | null; sttPid?: number | null }
): AggregatedAppMetrics {
  if (!rawMetrics || !Array.isArray(rawMetrics)) {
    return { appMemoryMb: null, appProcesses: [] };
  }

  let totalWorkingSetKb = 0;
  const appProcesses: AppProcessEntry[] = [];

  for (const m of rawMetrics) {
    if (!m || typeof m.pid !== 'number') continue;
    const workingSetKb = typeof m.memory?.workingSetSize === 'number' ? Math.max(0, m.memory.workingSetSize) : 0;
    totalWorkingSetKb += workingSetKb;

    const entry: AppProcessEntry = {
      pid: m.pid,
      type: m.type || 'Unknown',
      memoryMb: Math.round(workingSetKb / 1024)
    };

    if (typeof m.cpu?.percentCPUUsage === 'number' && !Number.isNaN(m.cpu.percentCPUUsage)) {
      entry.cpuPercent = Math.round(m.cpu.percentCPUUsage * 10) / 10;
    }

    appProcesses.push(entry);
  }

  const appMemoryMb = Math.round(totalWorkingSetKb / 1024);

  // Merge child processes (Python TTS server, STT worker)
  const pythonPid = childPids?.pythonPid;
  if (typeof pythonPid === 'number' && pythonPid > 0) {
    const existing = appProcesses.find(p => p.pid === pythonPid);
    if (existing) {
      existing.label = 'python';
    } else {
      appProcesses.push({
        pid: pythonPid,
        type: 'child',
        memoryMb: null,
        label: 'python'
      });
    }
  }

  const sttPid = childPids?.sttPid;
  if (typeof sttPid === 'number' && sttPid > 0) {
    const existing = appProcesses.find(p => p.pid === sttPid);
    if (existing) {
      existing.label = 'stt';
    } else {
      appProcesses.push({
        pid: sttPid,
        type: 'child',
        memoryMb: null,
        label: 'stt'
      });
    }
  }

  return { appMemoryMb, appProcesses };
}

export function collectAppMetrics(options: CollectAppMetricsOptions = {}): AggregatedAppMetrics {
  try {
    const rawMetrics = options.getAppMetrics ? options.getAppMetrics() : [];
    return aggregateAppMetrics(rawMetrics, {
      pythonPid: options.pythonPid,
      sttPid: options.sttPid
    });
  } catch (err) {
    console.warn('[AppMetrics] Failed to collect app metrics:', err);
    return { appMemoryMb: null, appProcesses: [] };
  }
}
