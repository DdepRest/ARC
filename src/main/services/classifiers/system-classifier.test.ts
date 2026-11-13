import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemClassifier } from './system-classifier';
import { SystemControlTool } from '../tools/system-control.tool';
import os from 'os';

vi.mock('../tools/system-control.tool', () => {
  return {
    SystemControlTool: class {
      execute = vi.fn().mockResolvedValue({ success: true, data: { battery: { percent: 100, isCharging: true }, cpuLoad: '10%', memoryUsed: '40%', uptime: '10h' } });
    }
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
    getFocusedWindow: vi.fn().mockReturnValue({
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn()
    })
  },
  shell: {
    openExternal: vi.fn()
  }
}));

describe('SystemClassifier', () => {
  it('should parse battery status', async () => {
    const result = await SystemClassifier.classify('статус батареи', false);
    expect(result).toContain('уровень заряда батареи составляет 100%');
  });

  it('should parse system uptime', async () => {
    const result = await SystemClassifier.classify('аптайм', false);
    expect(result).toContain('непрерывной работы операционной системы составляет 10h');
  });

  it('should launch a site using Universal Site Opener', async () => {
    const result = await SystemClassifier.classify('открой сайт github', false);
    expect(result).toContain('Открываю github.');
  });
});
