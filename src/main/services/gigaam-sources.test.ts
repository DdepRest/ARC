import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GIGAAM_SOURCES, gigaamSourcesService } from './gigaam-sources.service';
import { resolveGigaamFiles, verifyModelFiles } from './sherpa-paths.util';
import * as validatorModule from './sherpa-validator.util';

describe('GigaAM Sources Fallback Chain & Acceptance Criteria', () => {
  const testDir = path.join(process.cwd(), 'temp-test-gigaam-dir');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('Criteria 1: Ordered source chain has verified sources', () => {
    expect(GIGAAM_SOURCES.length).toBeGreaterThanOrEqual(2);
    expect(GIGAAM_SOURCES[0].id).toBe('csukuangfj-ru-v3');
    expect(GIGAAM_SOURCES[0].repo).toBe('csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16');

    expect(GIGAAM_SOURCES[1].id).toBe('csukuangfj-ru-v2');
    expect(GIGAAM_SOURCES[1].repo).toBe('csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19');
  });

  it('Criteria 1 & 2: Dynamic file resolution picks onnx and tokens', async () => {
    const resolved = await gigaamSourcesService.resolveRepoFiles(
      'fussraider/GigaAM-Multilingual-sherpa-onnx-ctc',
      'model.int8.onnx',
      'tokens.txt'
    );
    expect(resolved.modelFile).toMatch(/\.onnx$/);
    expect(resolved.tokensFile).toMatch(/\.txt$/);
  });

  it('Criteria 3: Automatic fallback from source #1 to source #2 on error', async () => {
    let attempts: string[] = [];
    const spyDownload = vi.spyOn(gigaamSourcesService as any, 'downloadSingleFile').mockImplementation(
      async (url: string, dest: string, onChunk: any) => {
        if (url.includes('-v3-')) {
          throw new Error('Simulated error for source #1');
        }
        attempts.push(url);
        fs.writeFileSync(dest, Buffer.alloc(1024 * 1024 * 2));
      }
    );

    const spyValidator = vi.spyOn(validatorModule, 'validateSherpaModelSacrificial').mockResolvedValue({
      success: true,
      verified: true
    });

    const progressEvents: any[] = [];
    const result = await gigaamSourcesService.downloadWithFallbackChain(testDir, (p) => {
      progressEvents.push(p);
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe('csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19');

    const metaPath = path.join(testDir, 'download_meta.json');
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    expect(meta.source).toBe('csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19');
    expect(meta.status).toBe('verified');

    spyDownload.mockRestore();
    spyValidator.mockRestore();
  });

  it('Criteria 4: Graceful soft fallback when all sources fail (no FSM crash)', async () => {
    const spyDownload = vi.spyOn(gigaamSourcesService as any, 'downloadSingleFile').mockImplementation(
      async () => {
        throw new Error('All network down');
      }
    );

    const progressEvents: any[] = [];
    const result = await gigaamSourcesService.downloadWithFallbackChain(testDir, (p) => {
      progressEvents.push(p);
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('All GigaAM sources failed');

    const check = verifyModelFiles(testDir, 'gigaam-ctc');
    expect(check.isComplete).toBe(false);

    spyDownload.mockRestore();
  });

  it('Criteria 5: Metadata persistence & file path resolution for GigaAM', () => {
    const dummyModel = path.join(testDir, 'model.int8.onnx');
    const dummyTokens = path.join(testDir, 'tokens.txt');
    fs.writeFileSync(dummyModel, Buffer.alloc(1024 * 1024 * 2));
    fs.writeFileSync(dummyTokens, 'token 0\ntoken 1');

    const meta = {
      source: 'fussraider/GigaAM-Multilingual-sherpa-onnx-ctc',
      modelFile: 'model.int8.onnx',
      tokensFile: 'tokens.txt',
      downloadedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(testDir, 'download_meta.json'), JSON.stringify(meta));

    const resolved = resolveGigaamFiles(testDir);
    expect(resolved).not.toBeNull();
    expect(resolved?.modelPath).toBe(dummyModel);
    expect(resolved?.tokensPath).toBe(dummyTokens);

    const check = verifyModelFiles(testDir, 'gigaam-ctc');
    expect(check.isComplete).toBe(true);
    expect(check.totalSize).toBeGreaterThan(0);
  });
});
