import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { SHERPA_MODELS_CONFIG, SherpaDownloaderService } from './sherpa-downloader.service';
import { verifyModelFiles } from './sherpa-paths.util';
import { setLoopbackDownloadTestHarness } from '../utils/network-security.util';
import * as validatorModule from './sherpa-validator.util';

const HASH_128_FILL_7 = crypto.createHash('sha256').update(Buffer.alloc(128, 7)).digest('hex');
const HASH_2048_FILL_7 = crypto.createHash('sha256').update(Buffer.alloc(2048, 7)).digest('hex');

vi.mock('axios', () => ({
  default: {
    head: vi.fn().mockRejectedValue(new Error('skip head')),
    get: vi.fn().mockResolvedValue({ data: {} })
  }
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/tmp/arc-nonexistent-app'),
    getPath: vi.fn().mockReturnValue('/tmp/arc-nonexistent-user')
  },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) }
}));

describe('SherpaDownloaderService Cancellation & Staging Isolation (Real HTTP + FS)', () => {
  let service: SherpaDownloaderService;
  let server: http.Server;
  let port = 0;
  let tmpRoot = '';
  let serverMode: 'slow' | 'redirect-slow' | 'fail-then-retry' | 'fail-second-file' | 'fast-zipformer-slow-whisper' = 'slow';
  let abortedSockets = 0;

  const originalConfigs: Record<string, { files: typeof SHERPA_MODELS_CONFIG[string]['files'] }> = {};

  beforeEach(async () => {
    setLoopbackDownloadTestHarness(true);
    service = SherpaDownloaderService.getInstance();
    await service.cancelAllDownloads();
    abortedSockets = 0;
    serverMode = 'slow';
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-sherpa-cancel-'));

    for (const key of ['zipformer-ru', 'whisper-small', 'silero-vad', 'gigaam-ctc']) {
      originalConfigs[key] = {
        files: SHERPA_MODELS_CONFIG[key].files.map((f) => ({ ...f }))
      };
    }

    server = http.createServer((req, res) => {
      const reqUrl = req.url || '/';

      if (serverMode === 'redirect-slow' && reqUrl.startsWith('/redir/')) {
        res.writeHead(302, { Location: reqUrl.replace('/redir/', '/slow/') });
        res.end();
        return;
      }

      if (serverMode === 'fail-then-retry') {
        res.writeHead(500);
        res.end('server error');
        return;
      }

      if (serverMode === 'fail-second-file' && reqUrl.includes('decoder')) {
        res.writeHead(500);
        res.end('second file error');
        return;
      }

      const isFastFile =
        serverMode === 'fail-second-file' ||
        (serverMode === 'fast-zipformer-slow-whisper' && !reqUrl.includes('small-'));

      if (isFastFile) {
        const size = reqUrl.includes('2048') ? 2048 : 128;
        res.writeHead(200, { 'Content-Length': String(size) });
        res.end(Buffer.alloc(size, 7));
        return;
      }

      // Slow chunked stream (~60ms intervals) to allow deterministic mid-stream cancellation within maxBytes=128
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.write(Buffer.alloc(16, 1));
      const timer = setInterval(() => {
        if (!res.destroyed && !res.writableEnded) {
          res.write(Buffer.alloc(16, 2));
        }
      }, 60);

      const cleanup = () => clearInterval(timer);
      res.on('close', () => {
        if (!res.writableEnded) abortedSockets++;
        cleanup();
      });
      req.on('aborted', () => {
        abortedSockets++;
        cleanup();
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });

    const base = `http://127.0.0.1:${port}`;
    SHERPA_MODELS_CONFIG['zipformer-ru'].files = [
      { name: 'encoder.onnx', url: `${base}/slow/encoder.onnx`, size: 128, sha256: HASH_128_FILL_7 },
      { name: 'decoder.onnx', url: `${base}/slow/decoder.onnx`, size: 128, sha256: HASH_128_FILL_7 },
      { name: 'joiner.onnx', url: `${base}/slow/joiner.onnx`, size: 128, sha256: HASH_128_FILL_7 },
      { name: 'tokens.txt', url: `${base}/slow/tokens.txt`, size: 128, sha256: HASH_128_FILL_7 }
    ];
    SHERPA_MODELS_CONFIG['whisper-small'].files = [
      { name: 'small-encoder.int8.onnx', url: `${base}/slow/small-encoder.int8.onnx`, size: 128, sha256: HASH_128_FILL_7 },
      { name: 'small-decoder.int8.onnx', url: `${base}/slow/small-decoder.int8.onnx`, size: 128, sha256: HASH_128_FILL_7 },
      { name: 'small-tokens.txt', url: `${base}/slow/small-tokens.txt`, size: 128, sha256: HASH_128_FILL_7 }
    ];
    SHERPA_MODELS_CONFIG['silero-vad'].files = [
      { name: 'silero_vad.onnx', url: `${base}/slow/silero_vad.onnx`, size: 128, sha256: HASH_128_FILL_7 }
    ];
  });

  afterEach(async () => {
    setLoopbackDownloadTestHarness(false);
    await service.cancelAllDownloads();
    for (const [key, orig] of Object.entries(originalConfigs)) {
      SHERPA_MODELS_CONFIG[key].files = orig.files;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('cancels zipformer-ru mid-stream, aborts socket, removes .staging, and emits cancelled without error', async () => {
    const modelDir = path.join(tmpRoot, 'zipformer');
    vi.spyOn(service, 'getModelDir').mockReturnValue(modelDir);

    const events: any[] = [];
    let triggered = false;
    const dlPromise = service.downloadModel('zipformer-ru', (ev) => {
      events.push(ev);
      if (!triggered && ev.status === 'downloading' && (ev as any).bytes_done > 0) {
        triggered = true;
        void service.cancelDownload('zipformer-ru');
      }
    });

    const result = await dlPromise;
    expect(result).toEqual({ success: false, cancelled: true, status: 'cancelled' });
    for (let i = 0; i < 10 && abortedSockets === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(abortedSockets).toBeGreaterThanOrEqual(1);
    expect(service.getActiveModelIds()).toEqual([]);
    expect(fs.existsSync(path.join(modelDir, '.staging'))).toBe(false);
    expect(fs.existsSync(path.join(modelDir, 'encoder.onnx'))).toBe(false);
    expect(events.some((e) => e.status === 'cancelled')).toBe(true);
    expect(events.some((e) => e.status === 'error')).toBe(false);
  });

  it('cancels silero-vad mid-stream over HTTP without leaving staging files', async () => {
    const vadDir = path.join(tmpRoot, 'silero-vad');
    vi.spyOn(service, 'getModelDir').mockReturnValue(vadDir);

    const events: any[] = [];
    let cancelled = false;
    const result = await service.downloadModel('silero-vad', (ev) => {
      events.push(ev);
      if (!cancelled && ev.status === 'downloading' && (ev as any).bytes_done > 0) {
        cancelled = true;
        void service.cancelDownload('silero-vad');
      }
    });

    expect(result).toEqual({ success: false, cancelled: true, status: 'cancelled' });
    expect(fs.existsSync(path.join(vadDir, '.staging'))).toBe(false);
    expect(events.some((e) => e.status === 'error')).toBe(false);
  });

  it('preserves previously working whisper-small files when a new download fails on file #2 or is cancelled', async () => {
    const whisperDir = path.join(tmpRoot, 'whisper');
    fs.mkdirSync(whisperDir, { recursive: true });
    fs.writeFileSync(path.join(whisperDir, 'small-encoder.int8.onnx'), Buffer.from('WORKING_ENCODER'));
    fs.writeFileSync(path.join(whisperDir, 'small-decoder.int8.onnx'), Buffer.from('WORKING_DECODER'));
    fs.writeFileSync(path.join(whisperDir, 'small-tokens.txt'), Buffer.from('WORKING_TOKENS'));
    vi.spyOn(service, 'getModelDir').mockReturnValue(whisperDir);

    // 1. Cancel mid-stream
    let cancelSent = false;
    const cancelRes = await service.downloadModel('whisper-small', (ev) => {
      if (!cancelSent && ev.status === 'downloading' && (ev as any).bytes_done > 0) {
        cancelSent = true;
        void service.cancelDownload('whisper-small');
      }
    });
    expect(cancelRes.cancelled).toBe(true);
    expect(fs.readFileSync(path.join(whisperDir, 'small-encoder.int8.onnx'), 'utf8')).toBe('WORKING_ENCODER');
    expect(fs.readFileSync(path.join(whisperDir, 'small-tokens.txt'), 'utf8')).toBe('WORKING_TOKENS');
    expect(fs.existsSync(path.join(whisperDir, '.staging'))).toBe(false);

    // 2. Fail on second file after first staged file completed
    serverMode = 'fail-second-file';
    SHERPA_MODELS_CONFIG['whisper-small'].files = [
      { name: 'small-encoder.int8.onnx', url: `http://127.0.0.1:${port}/fast/2048/small-encoder.int8.onnx`, size: 2048, sha256: HASH_2048_FILL_7 },
      { name: 'small-decoder.int8.onnx', url: `http://127.0.0.1:${port}/fail/small-decoder.int8.onnx`, size: 2048, sha256: HASH_2048_FILL_7 },
      { name: 'small-tokens.txt', url: `http://127.0.0.1:${port}/fast/2048/small-tokens.txt`, size: 2048, sha256: HASH_2048_FILL_7 }
    ];
    const failRes = await service.downloadModel('whisper-small', () => {});
    expect(failRes.success).toBe(false);
    expect(fs.readFileSync(path.join(whisperDir, 'small-encoder.int8.onnx'), 'utf8')).toBe('WORKING_ENCODER');
    expect(fs.readFileSync(path.join(whisperDir, 'small-decoder.int8.onnx'), 'utf8')).toBe('WORKING_DECODER');
    expect(fs.existsSync(path.join(whisperDir, '.staging'))).toBe(false);
  }, 15000);

  it('targeted cancelDownload(whisper-small) cancels only whisper while zipformer-ru completes cleanly', async () => {
    serverMode = 'fast-zipformer-slow-whisper';
    const zipDir = path.join(tmpRoot, 'zip-parallel');
    const whispDir = path.join(tmpRoot, 'whisp-parallel');
    vi.spyOn(service, 'getModelDir').mockImplementation((id) => (id === 'whisper-small' ? whispDir : zipDir));

    let cancelRequested = false;
    const whisperPromise = service.downloadModel('whisper-small', (ev) => {
      if (!cancelRequested && ev.status === 'downloading' && (ev as any).bytes_done > 0) {
        cancelRequested = true;
        void service.cancelDownload('whisper-small');
      }
    });

    const zipPromise = service.downloadModel('zipformer-ru', () => {});
    const [whispRes, zipRes] = await Promise.all([whisperPromise, zipPromise]);

    expect(whispRes).toEqual({ success: false, cancelled: true, status: 'cancelled' });
    expect(zipRes).toEqual({ success: true, status: 'completed' });
    expect(verifyModelFiles(zipDir, 'zipformer-ru').isComplete).toBe(true);
    expect(fs.existsSync(path.join(whispDir, 'small-encoder.int8.onnx'))).toBe(false);

    // Unknown modelId should not affect anything and repeated cancel is idempotent
    expect(await service.cancelDownload('unknown-model')).toBe(false);
    expect(await service.cancelDownload('zipformer-ru')).toBe(false);
  });

  it('cancelAllDownloads stops multiple concurrent downloads and leaves no active tasks or staging', async () => {
    const zipDir = path.join(tmpRoot, 'zip-all');
    const whispDir = path.join(tmpRoot, 'whisp-all');
    vi.spyOn(service, 'getModelDir').mockImplementation((id) => (id === 'whisper-small' ? whispDir : zipDir));

    const p1 = service.downloadModel('zipformer-ru', () => {});
    const p2 = service.downloadModel('whisper-small', () => {});
    await new Promise((r) => setTimeout(r, 80));

    expect(await service.cancelDownload('not-active')).toBe(false);
    await service.cancelAllDownloads();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.cancelled).toBe(true);
    expect(r2.cancelled).toBe(true);
    expect(service.getActiveModelIds()).toEqual([]);
    expect(fs.existsSync(path.join(zipDir, '.staging'))).toBe(false);
    expect(fs.existsSync(path.join(whispDir, '.staging'))).toBe(false);
  });

  it('cancels during HTTP 302 redirect stream and during retry backoff immediately', async () => {
    const zipDir = path.join(tmpRoot, 'zip-redir');
    vi.spyOn(service, 'getModelDir').mockReturnValue(zipDir);

    // 1. 302 redirect -> slow stream -> cancel
    serverMode = 'redirect-slow';
    SHERPA_MODELS_CONFIG['zipformer-ru'].files[0].url = `http://127.0.0.1:${port}/redir/encoder.onnx`;
    let sent = false;
    const redirRes = await service.downloadModel('zipformer-ru', (ev) => {
      if (!sent && ev.status === 'downloading' && (ev as any).bytes_done > 0) {
        sent = true;
        void service.cancelDownload('zipformer-ru');
      }
    });
    expect(redirRes.cancelled).toBe(true);

    // 2. HTTP 500 -> enters retry backoff delay -> cancel aborts timer immediately
    serverMode = 'fail-then-retry';
    const start = Date.now();
    const retryPromise = service.downloadModel('zipformer-ru', () => {});
    await new Promise((r) => setTimeout(r, 120));
    await service.cancelDownload('zipformer-ru');
    const retryRes = await retryPromise;
    expect(retryRes.cancelled).toBe(true);
    expect(Date.now() - start).toBeLessThan(1200);
  });

  it('ignores crashed .staging artifacts in verifyModelFiles, prunes them, and allows clean immediate retry', async () => {
    serverMode = 'fast-zipformer-slow-whisper';
    const zipDir = path.join(tmpRoot, 'zip-retry');
    const orphanedDir = path.join(zipDir, '.staging', 'zipformer-ru-999-stale');
    fs.mkdirSync(orphanedDir, { recursive: true });
    fs.writeFileSync(path.join(orphanedDir, 'encoder.onnx.part'), Buffer.from('garbage'));

    expect(verifyModelFiles(zipDir, 'zipformer-ru').isComplete).toBe(false);
    vi.spyOn(service, 'getModelDir').mockReturnValue(zipDir);

    // Start slow download, cancel, then immediately restart in fast mode
    serverMode = 'slow';
    const p1 = service.downloadModel('zipformer-ru', () => {});
    await new Promise((r) => setTimeout(r, 60));
    serverMode = 'fast-zipformer-slow-whisper';
    await service.cancelDownload('zipformer-ru');
    const r1 = await p1;
    expect(r1.cancelled).toBe(true);

    const r2 = await service.downloadModel('zipformer-ru', () => {});
    expect(r2).toEqual({ success: true, status: 'completed' });
    expect(fs.existsSync(orphanedDir)).toBe(false);
    expect(fs.existsSync(path.join(zipDir, '.staging'))).toBe(false);
    expect(verifyModelFiles(zipDir, 'zipformer-ru').isComplete).toBe(true);
  });

  it('cancels gigaam-ctc through sherpaDownloaderService.cancelDownload', async () => {
    const gigaDir = path.join(tmpRoot, 'gigaam');
    vi.spyOn(service, 'getModelDir').mockReturnValue(gigaDir);
    const { gigaamSourcesService } = await import('./gigaam-sources.service');
    vi.spyOn(gigaamSourcesService, 'resolveRepoFiles').mockResolvedValue({
      modelFile: 'model.int8.onnx',
      tokensFile: 'tokens.txt'
    });
    const spySingle = vi.spyOn(gigaamSourcesService, 'downloadSingleFile').mockImplementation(
      async (_url, dest, onChunk, _retries, opts) => {
        if (opts?.signal?.aborted) throw new Error('Download cancelled by user');
        if (dest.endsWith('tokens.txt')) {
          fs.writeFileSync(dest, 'tok');
          onChunk(3);
          return;
        }
        await new Promise<void>((_, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new Error('Download cancelled by user')), { once: true });
        });
      }
    );
    const spyVal = vi.spyOn(validatorModule, 'validateSherpaModelSacrificial').mockResolvedValue({ success: true, verified: true });

    const modelIntegrity = await import('./model-integrity.util');
    const spyDigest = vi.spyOn(modelIntegrity, 'verifyStagedFileDigest').mockImplementation((_p, expectedSize, expectedSha) => ({
      ok: true,
      actualSize: expectedSize,
      actualSha256: expectedSha
    }));

    const events: any[] = [];
    const p = service.downloadModel('gigaam-ctc', (ev) => events.push(ev));
    await new Promise((r) => setTimeout(r, 40));
    expect(await service.cancelDownload('gigaam-ctc')).toBe(true);
    const res = await p;

    expect(res).toEqual({ success: false, cancelled: true, status: 'cancelled' });
    expect(events.some((e) => e.status === 'cancelled')).toBe(true);
    expect(events.some((e) => e.status === 'error')).toBe(false);
    expect(fs.existsSync(path.join(gigaDir, '.staging'))).toBe(false);
    spyDigest.mockRestore();
    spySingle.mockRestore();
    spyVal.mockRestore();
  });
});
