import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { STTService } from './stt.service';
import * as fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/mock/app/path'),
    getPath: vi.fn().mockReturnValue('/mock/user/data')
  }
}));

const existsSyncMock = vi.fn();
const statSyncMock = vi.fn();
const readFileSyncMock = vi.fn().mockReturnValue('{}');

vi.mock('fs', () => {
    return {
        __esModule: true,
        default: {
            existsSync: (...args: any[]) => existsSyncMock(...args),
            statSync: (...args: any[]) => statSyncMock(...args),
            readFileSync: (...args: any[]) => readFileSyncMock(...args)
        },
        existsSync: (...args: any[]) => existsSyncMock(...args),
        statSync: (...args: any[]) => statSyncMock(...args),
        readFileSync: (...args: any[]) => readFileSyncMock(...args)
    };
});

vi.mock('child_process', () => {
    return {
        __esModule: true,
        fork: vi.fn().mockImplementation(() => {
            const emitter = new EventEmitter() as any;
            emitter.send = vi.fn().mockImplementation((msg: any) => {
                if (msg && msg.type === 'init') {
                    setTimeout(() => {
                        emitter.emit('message', { type: 'init_result', success: true });
                    }, 0);
                }
            });
            emitter.kill = vi.fn();
            emitter.connected = true;
            return emitter;
        })
    };
});

describe('STTService Model Guard', () => {
    let sttService: STTService;

    beforeEach(() => {
        sttService = new STTService();
        existsSyncMock.mockReset();
        statSyncMock.mockReset();
        readFileSyncMock.mockReturnValue('{}');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should fail to initialize if required model files are missing', async () => {
        existsSyncMock.mockReturnValue(false); // Simulate missing files
        
        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(false);
    });

    it('should fail to initialize if a model file is empty', async () => {
        existsSyncMock.mockReturnValue(true); 
        
        statSyncMock.mockReturnValue({
            size: 0 // Empty file
        });

        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(false);
    });

    it('should initialize successfully if all files exist and have valid size', async () => {
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

        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(true);
        expect(sttService['modelLoaded']).toBe(true);
    });

    it('should reject outdated/mismatched model file sizes when meta is empty (e.g. old decoder.onnx = 3621113)', async () => {
        existsSyncMock.mockReturnValue(true);
        readFileSyncMock.mockReturnValue('{}'); // Empty meta

        statSyncMock.mockImplementation((filePath: string) => {
            const fileName = path.basename(filePath);
            if (fileName === 'decoder.onnx') {
                return { size: 3621113 }; // Outdated size from older conversion
            }
            const EXPECTED_SIZES: Record<string, number> = {
                'encoder.onnx': 90994145,
                'joiner.onnx': 1026462,
                'tokens.txt': 6388
            };
            return { size: EXPECTED_SIZES[fileName] || 1000 };
        });

        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(false);
        expect(result?.error).toContain('Invalid file size for decoder.onnx');
    });

    it('should allow files when download_meta.json provides updated expected sizes overriding defaults', async () => {
        existsSyncMock.mockReturnValue(true);
        // Simulate download_meta.json specifying a newly converted size
        const mockMeta = {
            modelUrl: 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-small-ru-2025-08-16',
            files: {
                'decoder.onnx': { size: 2093080, expectedSize: 2093080 },
                'encoder.onnx': { size: 90994145, expectedSize: 90994145 },
                'joiner.onnx': { size: 1026462, expectedSize: 1026462 },
                'tokens.txt': { size: 6388, expectedSize: 6388 }
            }
        };
        readFileSyncMock.mockReturnValue(JSON.stringify(mockMeta));

        statSyncMock.mockImplementation((filePath: string) => {
            const fileName = path.basename(filePath);
            return { size: mockMeta.files[fileName as keyof typeof mockMeta.files]?.size || 1000 };
        });

        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(true);
        expect(sttService['modelLoaded']).toBe(true);
    });

    it('should accept file sizes within the allowed 500 bytes tolerance', async () => {
        existsSyncMock.mockReturnValue(true);
        readFileSyncMock.mockReturnValue('{}');

        statSyncMock.mockImplementation((filePath: string) => {
            const fileName = path.basename(filePath);
            const EXPECTED_SIZES: Record<string, number> = {
                'encoder.onnx': 90994145 + 250, // +250 bytes within +-500 tolerance
                'decoder.onnx': 2093080 - 150,  // -150 bytes within +-500 tolerance
                'joiner.onnx': 1026462,
                'tokens.txt': 6388
            };
            return { size: EXPECTED_SIZES[fileName] || 1000 };
        });

        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(true);
    });

    it('should gracefully handle corrupt download_meta.json and fallback to default sizes', async () => {
        existsSyncMock.mockReturnValue(true);
        readFileSyncMock.mockReturnValue('{ CORRUPTED JSON <<<');

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

        const result = await sttService.reinitialize();
        expect(result?.ready).toBe(true);
    });

    it('should switch model A -> B -> A with worker alive, ready status and no exit error codes', async () => {
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

        const errorLogs: string[] = [];
        const originalWarn = console.warn;
        const originalError = console.error;
        console.warn = (...args: any[]) => {
            errorLogs.push(args.join(' '));
        };
        console.error = (...args: any[]) => {
            errorLogs.push(args.join(' '));
        };

        try {
            // Model A
            const resA1 = await sttService.switchModel('zipformer-ru', 'user_switch');
            expect(resA1.ready).toBe(true);
            expect(sttService.getStatus().modelLoaded).toBe(true);

            // Switch to Model B
            const resB = await sttService.switchModel('whisper-small', 'user_switch');
            expect(resB.ready).toBe(true);
            expect(sttService.getStatus().modelLoaded).toBe(true);

            // Switch back to Model A
            const resA2 = await sttService.switchModel('zipformer-ru', 'user_switch');
            expect(resA2.ready).toBe(true);
            expect(sttService.getStatus().modelLoaded).toBe(true);

            // Check: no exit error codes in log
            const exitErrorLogs = errorLogs.filter(log => log.includes('Worker exited with code') || log.includes('Worker exited prematurely'));
            expect(exitErrorLogs.length).toBe(0);
        } finally {
            console.warn = originalWarn;
            console.error = originalError;
        }
    });

    it('Delta 8: should keep current engine active and start background download if target model is missing', async () => {
        existsSyncMock.mockImplementation((filePath: string) => {
            return !filePath.includes('gigaam'); // GigaAM files missing
        });
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

        // Initialize active engine
        const initRes = await sttService.initializeModels('zipformer-ru');
        expect(initRes.ready).toBe(true);
        expect(sttService.getStatus().modelLoaded).toBe(true);

        // User requests GigaAM (not downloaded yet)
        const switchRes = await sttService.switchModel('gigaam-ctc', 'user_switch');
        
        // Invariant: System is NOT deaf: ready stays true, loading indicator returned, modelLoaded stays true!
        expect(switchRes.ready).toBe(true);
        expect(switchRes.loading).toBe(true);
        expect(sttService.getStatus().modelLoaded).toBe(true);
    });

    it('S2-07: reports consent_required without lastError when startListening is called with missing STT models', async () => {
        existsSyncMock.mockReturnValue(false);
        const started = await sttService.startListening();
        expect(started).toBe(false);
        const status = sttService.getStatus();
        expect(status.modelsInstalled).toBe(false);
        expect(status.setupState).toBe('consent_required');
        expect(status.lastError).toBeNull();
    });
});


