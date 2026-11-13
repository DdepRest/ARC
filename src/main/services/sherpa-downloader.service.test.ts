import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SherpaDownloaderService } from './sherpa-downloader.service';
import * as fs from 'fs';
import path from 'path';

vi.mock('axios', () => ({
  default: {
    head: vi.fn().mockResolvedValue({ headers: { 'content-length': '0' } }),
    get: vi.fn().mockResolvedValue({ data: {} })
  }
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/mock/app/path'),
    getPath: vi.fn().mockReturnValue('/mock/user/data')
  }
}));

const existsSyncMock = vi.fn();
const statSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const readFileSyncMock = vi.fn().mockReturnValue('{}');
const createWriteStreamMock = vi.fn().mockReturnValue({
  close: vi.fn(),
  on: vi.fn()
});

vi.mock('fs', () => {
  return {
    __esModule: true,
    default: {
      existsSync: (...args: any[]) => existsSyncMock(...args),
      statSync: (...args: any[]) => statSyncMock(...args),
      mkdirSync: (...args: any[]) => mkdirSyncMock(...args),
      writeFileSync: (...args: any[]) => writeFileSyncMock(...args),
      readFileSync: (...args: any[]) => readFileSyncMock(...args),
      createWriteStream: (...args: any[]) => createWriteStreamMock(...args)
    },
    existsSync: (...args: any[]) => existsSyncMock(...args),
    statSync: (...args: any[]) => statSyncMock(...args),
    mkdirSync: (...args: any[]) => mkdirSyncMock(...args),
    writeFileSync: (...args: any[]) => writeFileSyncMock(...args),
    readFileSync: (...args: any[]) => readFileSyncMock(...args),
    createWriteStream: (...args: any[]) => createWriteStreamMock(...args)
  };
});

describe('SherpaDownloaderService Unit Tests', () => {
  let service: SherpaDownloaderService;

  beforeEach(() => {
    service = SherpaDownloaderService.getInstance();
    existsSyncMock.mockReset();
    statSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    readFileSyncMock.mockReturnValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error for unknown modelId', async () => {
    const progressFn = vi.fn();
    const result = await service.downloadModel('unknown-model-xyz', progressFn);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown modelId');
    expect(progressFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  it('should skip already downloaded files with matching size', async () => {
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockImplementation((filePath: string) => {
      const fileName = path.basename(filePath);
      const EXPECTED_SIZES: Record<string, number> = {
        'encoder.onnx': 90994145,
        'decoder.onnx': 2093080,
        'joiner.onnx': 1026462,
        'tokens.txt': 6388
      };
      return { size: EXPECTED_SIZES[fileName] || 1000 };
    });

    const progressFn = vi.fn();
    const result = await service.downloadModel('zipformer-ru', progressFn);

    expect(result.success).toBe(true);
    expect(progressFn).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 100, status: 'completed' })
    );
  });
});
