import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import vm from 'vm';
import { EventEmitter } from 'events';
import { PythonServerService } from './python_server.service';
import { sttService } from './stt.service';

function createWorkerContext(offlineRecognizerFactory?: (config: any) => any) {
  const messagesSent: any[] = [];
  const fakeProcess = new EventEmitter() as any;
  fakeProcess.send = vi.fn((msg: any) => {
    messagesSent.push(msg);
  });
  fakeProcess.exit = vi.fn();

  const offlineRecognizerConstructors: any[] = [];

  const mockSherpa = {
    OfflineRecognizer: function (this: any, config: any) {
      offlineRecognizerConstructors.push(config);
      if (offlineRecognizerFactory) {
        return offlineRecognizerFactory(config);
      }
      return {
        createStream: vi.fn(),
        decode: vi.fn(),
        getResult: vi.fn().mockReturnValue({ text: 'mock text' })
      };
    },
    Vad: function (this: any) {
      return {
        reset: vi.fn()
      };
    },
    OnlineRecognizer: function (this: any) {
      return {
        createStream: vi.fn().mockReturnValue({}),
        reset: vi.fn()
      };
    }
  };

  const workerPath = path.join(__dirname, '../../../scripts/stt_worker.js');
  const workerCode = fs.readFileSync(workerPath, 'utf-8');

  let messageHandler: ((msg: any) => void) | null = null;
  fakeProcess.on = vi.fn((event: string, handler: any) => {
    if (event === 'message') {
      messageHandler = handler;
    }
  });

  const sandbox = {
    require: (mod: string) => {
      if (mod === 'sherpa-onnx-node') return mockSherpa;
      if (mod === 'path') return path;
      if (mod === 'fs') return fs;
      return require(mod);
    },
    process: fakeProcess,
    console,
    Float32Array,
    setTimeout,
    clearTimeout,
    Date
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(workerCode, context);

  return {
    dispatchMessage: (msg: any) => {
      if (!messageHandler) throw new Error('Message handler was not registered');
      messageHandler(msg);
    },
    messagesSent,
    offlineRecognizerConstructors,
    mockSherpa,
    fakeProcess
  };
}

describe('STT Worker Lazy Whisper Initialization', () => {
  it('does NOT initialize Whisper on init when sttEngine is "gigaam" and GigaAM succeeds', () => {
    const worker = createWorkerContext();

    worker.dispatchMessage({
      type: 'init',
      sttEngine: 'gigaam',
      whisperConfig: { model: 'whisper-small-int8' },
      gigaamConfig: { model: 'gigaam-ctc-220m' }
    });

    // OfflineRecognizer should be called ONLY ONCE for GigaAM, not for Whisper
    expect(worker.offlineRecognizerConstructors).toHaveLength(1);
    expect(worker.offlineRecognizerConstructors[0]).toEqual({ model: 'gigaam-ctc-220m' });

    // Should report engine_ready for gigaam, but NOT whisper
    const gigaamReady = worker.messagesSent.find(m => m.type === 'engine_ready' && m.engine === 'gigaam');
    const whisperReady = worker.messagesSent.find(m => m.type === 'engine_ready' && m.engine === 'whisper');
    expect(gigaamReady).toBeDefined();
    expect(whisperReady).toBeUndefined();

    // init_result should show hasGigaam: true, hasWhisper: false
    const initResult = worker.messagesSent.find(m => m.type === 'init_result');
    expect(initResult).toMatchObject({
      type: 'init_result',
      success: true,
      hasGigaam: true,
      hasWhisper: false
    });
  });

  it('lazily initializes Whisper when GigaAM throws during init in "gigaam" mode (floor invariant >= 1 engine)', () => {
    const worker = createWorkerContext((config: any) => {
      if (config?.model === 'gigaam-ctc-220m') {
        throw new Error('Corrupted GigaAM model onnx');
      }
      return {
        createStream: vi.fn(),
        decode: vi.fn(),
        getResult: vi.fn().mockReturnValue({ text: 'whisper fallback text' })
      };
    });

    worker.dispatchMessage({
      type: 'init',
      sttEngine: 'gigaam',
      whisperConfig: { model: 'whisper-small-int8' },
      gigaamConfig: { model: 'gigaam-ctc-220m' }
    });

    // OfflineRecognizer should be attempted for GigaAM, and on failure, for Whisper
    expect(worker.offlineRecognizerConstructors).toHaveLength(2);
    expect(worker.offlineRecognizerConstructors[0]).toEqual({ model: 'gigaam-ctc-220m' });
    expect(worker.offlineRecognizerConstructors[1]).toEqual({ model: 'whisper-small-int8' });

    // Whisper engine_ready should be sent
    const whisperReady = worker.messagesSent.find(m => m.type === 'engine_ready' && m.engine === 'whisper');
    expect(whisperReady).toBeDefined();

    // init_result should show success: true, hasGigaam: false, hasWhisper: true
    const initResult = worker.messagesSent.find(m => m.type === 'init_result');
    expect(initResult).toMatchObject({
      type: 'init_result',
      success: true,
      hasGigaam: false,
      hasWhisper: true
    });
  });

  it('lazily initializes Whisper upon receiving "fallback_to_whisper" after GigaAM-only init', () => {
    const worker = createWorkerContext();

    worker.dispatchMessage({
      type: 'init',
      sttEngine: 'gigaam',
      whisperConfig: { model: 'whisper-small-int8' },
      gigaamConfig: { model: 'gigaam-ctc-220m' }
    });

    // Initially only GigaAM was constructed
    expect(worker.offlineRecognizerConstructors).toHaveLength(1);
    expect(worker.messagesSent.find(m => m.type === 'engine_ready' && m.engine === 'whisper')).toBeUndefined();

    // Now trigger circuit breaker fallback to Whisper
    worker.dispatchMessage({
      type: 'fallback_to_whisper'
    });

    // OfflineRecognizer should now have been called for Whisper
    expect(worker.offlineRecognizerConstructors).toHaveLength(2);
    expect(worker.offlineRecognizerConstructors[1]).toEqual({ model: 'whisper-small-int8' });

    const whisperReady = worker.messagesSent.find(m => m.type === 'engine_ready' && m.engine === 'whisper');
    expect(whisperReady).toBeDefined();
  });

  it('initializes Whisper immediately on init when sttEngine is "legacy"', () => {
    const worker = createWorkerContext();

    worker.dispatchMessage({
      type: 'init',
      sttEngine: 'legacy',
      whisperConfig: { model: 'whisper-small-int8' }
    });

    expect(worker.offlineRecognizerConstructors).toHaveLength(1);
    expect(worker.offlineRecognizerConstructors[0]).toEqual({ model: 'whisper-small-int8' });
    const whisperReady = worker.messagesSent.find(m => m.type === 'engine_ready' && m.engine === 'whisper');
    expect(whisperReady).toBeDefined();
  });
});

describe('PID Getters', () => {
  it('PythonServerService.getPythonPid returns null when process is not running', () => {
    expect(PythonServerService.getPythonPid()).toBeNull();
  });

  it('sttService.getWorkerPid returns null when child process is not running', () => {
    expect(sttService.getWorkerPid()).toBeNull();
  });
});
