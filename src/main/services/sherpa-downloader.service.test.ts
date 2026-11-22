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

  it('should skip already downloaded files with matching size and sha256', async () => {
    const modelIntegrity = await import('./model-integrity.util');
    const PINNED: Record<string, { size: number; sha256: string }> = {
      'encoder.onnx': { size: 90994145, sha256: 'e9c27453e618bc97cf8a10169f34c104bd478166522907fcd122a46a88c78c69' },
      'decoder.onnx': { size: 2093080, sha256: '89b3088a9e20e1ef7f2e85ce1a3478afe6a9c4ac57369cabcc4beb8e95328ea0' },
      'joiner.onnx': { size: 1026462, sha256: 'dde0c7f3be0a16113a3e042c79a492c48667c07a8c1e9422ffe81c768aad4838' },
      'tokens.txt': { size: 6388, sha256: '93bbbc0bae6b78c0bbb743d4aa9fded3bb5ff3aac5f0200e3a769a5a05e0fdf6' }
    };
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockImplementation((filePath: string) => {
      const fileName = path.basename(filePath);
      return { size: PINNED[fileName]?.size || 1000 };
    });
    vi.spyOn(modelIntegrity, 'computeFileSha256Sync').mockImplementation((filePath: string) => {
      const fileName = path.basename(filePath);
      return PINNED[fileName]?.sha256 || null;
    });

    const progressFn = vi.fn();
    const result = await service.downloadModel('zipformer-ru', progressFn);

    expect(result).toEqual({ success: true, status: 'completed' });
    expect(progressFn).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 100, status: 'completed' })
    );
  });
});
