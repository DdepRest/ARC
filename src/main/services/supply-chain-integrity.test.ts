import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockAppState = vi.hoisted(() => ({ isPackaged: false, appPath: process.cwd() }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawn(...args),
    exec: (...args: any[]) => mockExec(...args)
  };
});

vi.mock('electron', () => ({
  app: {
    get isPackaged() { return mockAppState.isPackaged; },
    getAppPath: () => mockAppState.appPath,
    getPath: () => mockAppState.appPath
  },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) }
}));

import {
  TRUSTED_MODEL_HOSTS,
  DownloadSecurityError,
  createSsrfSafeLookup,
  isBlockedIpAddress,
  setLoopbackDownloadTestHarness,
  validateTrustedDownloadUrl
} from '../utils/network-security.util';
import { downloadFileWithSignal } from './sherpa-http-download.util';
import { SHERPA_MODELS_CONFIG, SherpaDownloaderService } from './sherpa-downloader.service';
import { verifyModelFiles } from './sherpa-paths.util';
import { attemptGigaamHotSwap } from './stt-config.helper';
import * as validatorModule from './sherpa-validator.util';
import {
  calculateHash,
  syncPythonFiles,
  verifyPythonBundleFiles,
  verifySileroModelOnDisk
} from './python_sync.util';
import { PythonServerService } from './python_server.service';

const REPO_ROOT = process.cwd();
const sha256Of = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');

describe('S2-04 Supply-Chain Security: URL Allowlist, Redirects & SSRF/DNS Rebinding', () => {
  it('enforces HTTPS-only, rejects IP literals, credentials, and untrusted hosts', () => {
    expect(validateTrustedDownloadUrl('https://huggingface.co/owner/repo/resolve/abc/model.onnx').hostname).toBe('huggingface.co');
    expect(validateTrustedDownloadUrl('https://models.silero.ai/models/tts/ru/v5_6_ru.pt').hostname).toBe('models.silero.ai');
    expect(TRUSTED_MODEL_HOSTS.has('release-assets.githubusercontent.com')).toBe(true);

    expect(() => validateTrustedDownloadUrl('http://huggingface.co/file.onnx')).toThrowError(DownloadSecurityError);
    expect(() => validateTrustedDownloadUrl('https://user:pass@huggingface.co/file.onnx')).toThrowError(DownloadSecurityError);
    expect(() => validateTrustedDownloadUrl('https://127.0.0.1/file.onnx')).toThrowError(DownloadSecurityError);
    expect(() => validateTrustedDownloadUrl('https://[::1]/file.onnx')).toThrowError(DownloadSecurityError);
    expect(() => validateTrustedDownloadUrl('https://evil.example.com/file.onnx')).toThrowError(DownloadSecurityError);
    expect(() => validateTrustedDownloadUrl('https://huggingface.co.evil.com/file.onnx')).toThrowError(DownloadSecurityError);
  });

  it('blocks private, loopback, link-local, CGNAT, and IPv4-mapped IPv6 addresses in SSRF lookup', async () => {
    for (const bad of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.1.20', '169.254.169.254', '100.64.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.5', '::ffff:7f00:1']) {
      expect(isBlockedIpAddress(bad), `Expected ${bad} blocked`).toBe(true);
    }
    expect(isBlockedIpAddress('151.101.1.1')).toBe(false);
    expect(isBlockedIpAddress('2606:4700:4700::1111')).toBe(false);

    const mixedDns = ((_h: string, _o: any, cb: any) =>
      cb(null, [{ address: '151.101.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }])) as any;
    const safeMixed = createSsrfSafeLookup(mixedDns);
    await expect(new Promise((res, rej) => safeMixed('huggingface.co', { all: true }, (e: any, v: any) => (e ? rej(e) : res(v)))))
      .rejects.toThrowError(/SSRF|DNS rebinding/i);

    const okDns = ((_h: string, _o: any, cb: any) => cb(null, '151.101.1.1', 4)) as any;
    const safeOk = createSsrfSafeLookup(okDns);
    await expect(new Promise((res, rej) => safeOk('huggingface.co', {}, (e: any, addr: any) => (e ? rej(e) : res(addr)))))
      .resolves.toBe('151.101.1.1');
  });
});

describe('S2-04 Supply-Chain HTTP Downloader & Staging Integrity (Real Local HTTP + FS)', () => {
  let server: http.Server;
  let port = 0;
  let tmpDir = '';
  let hits = 0;
  let mode: 'disallowed-redir' | 'http-downgrade' | 'redirect-loop' | 'oversized-stream' | 'oversized-header' | 'truncated' | 'retry-then-ok' | 'good' = 'good';
  const goodBuf = Buffer.from('ARC_VALID_PAYLOAD_BYTES_1234567890');
  const goodSha = sha256Of(goodBuf);

  const origZipFiles = SHERPA_MODELS_CONFIG['zipformer-ru'].files.map((f) => ({ ...f }));
  const origVadFiles = SHERPA_MODELS_CONFIG['silero-vad'].files.map((f) => ({ ...f }));

  beforeEach(async () => {
    setLoopbackDownloadTestHarness(true);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-s204-http-'));
    hits = 0;
    mode = 'good';

    server = http.createServer((req, res) => {
      hits++;
      const url = req.url || '/';
      if (mode === 'disallowed-redir') {
        res.writeHead(302, { Location: 'https://evil.example.com/malware.onnx' });
        return res.end();
      }
      if (mode === 'http-downgrade') {
        res.writeHead(302, { Location: 'http://cdn-lfs.hf.co/downgrade.onnx' });
        return res.end();
      }
      if (mode === 'redirect-loop') {
        const step = Number(url.split('/hop/')[1] || '0');
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/hop/${step + 1}` });
        return res.end();
      }
      if (mode === 'oversized-header') {
        res.writeHead(200, { 'Content-Length': '9999999' });
        return res.end('x');
      }
      if (mode === 'oversized-stream') {
        res.writeHead(200);
        return res.end(Buffer.alloc(1024, 9));
      }
      if (mode === 'truncated') {
        res.writeHead(200, { Connection: 'close' });
        res.write(goodBuf.subarray(0, 10));
        return res.end();
      }
      if (mode === 'retry-then-ok' && hits === 1) {
        res.writeHead(502);
        return res.end('bad gateway');
      }
      res.writeHead(200, { 'Content-Length': String(goodBuf.length) });
      res.end(goodBuf);
    });

    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port;
      r();
    }));
  });

  afterEach(async () => {
    setLoopbackDownloadTestHarness(false);
    SHERPA_MODELS_CONFIG['zipformer-ru'].files = origZipFiles.map((f) => ({ ...f }));
    SHERPA_MODELS_CONFIG['silero-vad'].files = origVadFiles.map((f) => ({ ...f }));
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('blocks disallowed redirects, HTTP downgrades, redirect loops, oversized payloads without retry, and retries transient errors', async () => {
    const part = path.join(tmpDir, 'dl.part');

    mode = 'disallowed-redir';
    await expect(downloadFileWithSignal({ url: `http://127.0.0.1:${port}/f`, destPartPath: part, onProgressChunk: () => {}, retries: 3, retryDelayMs: 10 }))
      .rejects.toThrowError(DownloadSecurityError);
    expect(hits).toBe(1); // security errors never retry

    hits = 0; mode = 'http-downgrade';
    await expect(downloadFileWithSignal({ url: `http://127.0.0.1:${port}/f`, destPartPath: part, onProgressChunk: () => {}, retries: 2 }))
      .rejects.toThrowError(/HTTPS required/i);

    mode = 'redirect-loop';
    await expect(downloadFileWithSignal({ url: `http://127.0.0.1:${port}/hop/0`, destPartPath: part, onProgressChunk: () => {}, maxRedirects: 5, retries: 1 }))
      .rejects.toThrowError(/maximum redirects/i);

    mode = 'oversized-header';
    await expect(downloadFileWithSignal({ url: `http://127.0.0.1:${port}/f`, destPartPath: part, onProgressChunk: () => {}, maxBytes: 128, retries: 1 }))
      .rejects.toThrowError(/exceeds allowed limit/i);

    mode = 'oversized-stream';
    await expect(downloadFileWithSignal({ url: `http://127.0.0.1:${port}/f`, destPartPath: part, onProgressChunk: () => {}, maxBytes: 128, retries: 1 }))
      .rejects.toThrowError(/exceeded maxBytes/i);
    expect(fs.existsSync(part)).toBe(false);

    hits = 0; mode = 'retry-then-ok';
    const res = await downloadFileWithSignal({ url: `http://127.0.0.1:${port}/f`, destPartPath: part, onProgressChunk: () => {}, retries: 2, retryDelayMs: 10 });
    expect(hits).toBe(2);
    expect(res.sha256).toBe(goodSha);
  });

  it('rejects wrong hash / truncated payload fail-closed, preserves working files, and skips/replaces atomically', async () => {
    const svc = SherpaDownloaderService.getInstance();
    const vadDir = path.join(tmpDir, 'vad-fail-closed');
    fs.mkdirSync(vadDir, { recursive: true });
    const targetFile = path.join(vadDir, 'silero_vad.onnx');
    fs.writeFileSync(targetFile, 'EXISTING_WORKING_MODEL');
    vi.spyOn(svc, 'getModelDir').mockReturnValue(vadDir);

    // 1. Wrong hash
    SHERPA_MODELS_CONFIG['silero-vad'].files = [
      { name: 'silero_vad.onnx', url: `http://127.0.0.1:${port}/vad.onnx`, size: goodBuf.length, sha256: '0'.repeat(64) }
    ];
    const wrongHashRes = await svc.downloadModel('silero-vad', () => {});
    expect(wrongHashRes.success).toBe(false);
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('EXISTING_WORKING_MODEL');
    expect(fs.existsSync(path.join(vadDir, '.staging'))).toBe(false);

    // 2. Truncated stream (wrong size)
    mode = 'truncated';
    SHERPA_MODELS_CONFIG['silero-vad'].files = [
      { name: 'silero_vad.onnx', url: `http://127.0.0.1:${port}/vad.onnx`, size: goodBuf.length, sha256: goodSha }
    ];
    const truncRes = await svc.downloadModel('silero-vad', () => {});
    expect(truncRes.success).toBe(false);
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('EXISTING_WORKING_MODEL');

    // 3. Atomic replace when valid payload arrives
    mode = 'good';
    const okRes = await svc.downloadModel('silero-vad', () => {});
    expect(okRes).toEqual({ success: true, status: 'completed' });
    expect(fs.readFileSync(targetFile)).toEqual(goodBuf);
    const meta = JSON.parse(fs.readFileSync(path.join(vadDir, 'download_meta.json'), 'utf8'));
    expect(meta.integrity.status).toBe('verified');
    expect(meta.provenance.origin).toBe('official_auto');

    // 4. Existing valid file skips download (0 HTTP hits)
    hits = 0;
    const skipRes = await svc.downloadModel('silero-vad', () => {});
    expect(skipRes).toEqual({ success: true, status: 'completed' });
    expect(hits).toBe(0);
  }, 15000);
});

describe('S2-04 Provenance Distinction (Verified vs Unverified Manual vs Tampered) & Python Integrity Gate', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-s204-prov-'));
    delete process.env.ARC_STRICT_MODEL_INTEGRITY;
    mockSpawn.mockReset();
    mockExec.mockReset();
  });

  afterEach(() => {
    PythonServerService.stop();
    delete process.env.ARC_STRICT_MODEL_INTEGRITY;
    mockAppState.isPackaged = false;
    mockAppState.appPath = REPO_ROOT;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('marks tampered official files as tampered and keeps manual models unverified_manual even after runtime validation', async () => {
    const modelDir = path.join(tmpDir, 'vad-tamper');
    fs.mkdirSync(modelDir, { recursive: true });
    const payload = Buffer.from('TAMPERED_BYTES');
    fs.writeFileSync(path.join(modelDir, 'silero_vad.onnx'), payload);
    fs.writeFileSync(path.join(modelDir, 'download_meta.json'), JSON.stringify({
      provenance: { origin: 'official_auto' },
      files: { 'silero_vad.onnx': { size: payload.length, sha256: 'f'.repeat(64) } }
    }));

    const tamperedCheck = verifyModelFiles(modelDir, 'silero-vad', { forceRehash: true });
    expect(tamperedCheck.isComplete).toBe(false);
    expect(tamperedCheck.integrity?.status).toBe('tampered');

    // Manual GigaAM model without official meta -> unverified_manual
    const gigaDir = path.join(tmpDir, 'giga-manual');
    fs.mkdirSync(gigaDir, { recursive: true });
    const mPath = path.join(gigaDir, 'model.int8.onnx');
    const tPath = path.join(gigaDir, 'tokens.txt');
    fs.writeFileSync(mPath, Buffer.alloc(1_100_000, 3));
    fs.writeFileSync(tPath, 'a 0\nb 1\n'.repeat(20));

    const manualCheck = verifyModelFiles(gigaDir, 'gigaam-ctc');
    expect(manualCheck.isComplete).toBe(true);
    expect(manualCheck.integrity?.status).toBe('unverified_manual');
    expect(manualCheck.provenance?.origin).toBe('manual_local');

    // Runtime sacrificial validation must NOT auto-promote manual model to verified
    vi.spyOn(validatorModule, 'validateSherpaModelSacrificial').mockResolvedValue({ success: true, verified: true });
    const fakeChild = { connected: true, send: vi.fn() };
    const swapped = await attemptGigaamHotSwap(fakeChild, 'manual-local', { modelConfig: {} }, { modelPath: mPath, tokensPath: tPath, dir: gigaDir });
    expect(swapped).toBe(true);
    const savedMeta = JSON.parse(fs.readFileSync(path.join(gigaDir, 'download_meta.json'), 'utf8'));
    expect(savedMeta.verified).toBe(false);
    expect(savedMeta.runtimeValidated).toBe(true);
    expect(savedMeta.integrity?.status).toBe('unverified_manual');
  });

  it('verifies repo Python TTS bundle via SHA-256, blocks tampered script spawn, and rejects tampered v5_6_ru.pt in strict mode', async () => {
    const cleanBundle = verifyPythonBundleFiles((rel) => path.join(REPO_ROOT, rel));
    expect(cleanBundle.state).toBe('READY');
    expect(cleanBundle.failedFiles).toEqual([]);

    // calculateHash must use SHA-256 (64 hex chars) instead of legacy MD5 (32 chars)
    expect(calculateHash(path.join(REPO_ROOT, 'requirements-silero.txt'))).toMatch(/^[a-f0-9]{64}$/);

    // Copy bundle into tempRoot and tamper tts_dict_loader.py
    for (const f of ['silero_server.py', 'silero_number_converter.py', 'silero_text_prep.py', 'requirements-silero.txt', 'tts_dict_loader.py']) {
      fs.copyFileSync(path.join(REPO_ROOT, f), path.join(tmpDir, f));
    }
    fs.appendFileSync(path.join(tmpDir, 'tts_dict_loader.py'), '\n# malicious edit\n');

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mockAppState.isPackaged = false;
    mockAppState.appPath = tmpDir;

    const fakeWin: any = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    await PythonServerService.start(fakeWin);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(PythonServerService.getLastIntegrityReport()?.state).toBe('ERROR');
    expect(PythonServerService.getLastIntegrityReport()?.failedFiles[0]?.name).toBe('tts_dict_loader.py');

    // syncPythonFiles refuses copying tampered source
    const targetSync = path.join(tmpDir, 'sync-out');
    fs.mkdirSync(targetSync, { recursive: true });
    mockAppState.isPackaged = true;
    (process as any).resourcesPath = tmpDir;
    syncPythonFiles((rel) => (rel === '.' ? targetSync : path.join(tmpDir, rel)), fakeWin);
    expect(fs.existsSync(path.join(targetSync, 'tts_dict_loader.py'))).toBe(false);

    // Strict v5_6_ru.pt SHA-256 check
    process.env.ARC_STRICT_MODEL_INTEGRITY = '1';
    const fakeModel = path.join(tmpDir, 'v5_6_ru.pt');
    fs.writeFileSync(fakeModel, 'tampered-silero-weights');
    const sileroCheck = verifySileroModelOnDisk(fakeModel, { strict: true });
    expect(sileroCheck.ok).toBe(false);
    expect(sileroCheck.status).toBe('tampered');
  });
});
