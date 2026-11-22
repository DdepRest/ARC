import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let capturedUnmount: (() => void) | null = null;
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onUnmounted: (fn: () => void) => { capturedUnmount = fn; }
  };
});

import { useMicTest } from './useMicTest';

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

function createFakeStream() {
  const track: FakeTrack = { stop: vi.fn(), onended: null };
  const stream: any = {
    getTracks: () => [track],
    getAudioTracks: () => [track]
  };
  return { stream, track };
}

describe('§12.6 Audio Device Unplug/Replug — useMicTest resilience', () => {
  const origWindow = (globalThis as any).window;
  const origNavigator = (globalThis as any).navigator;
  const origMediaRecorder = (globalThis as any).MediaRecorder;
  const origAudio = (globalThis as any).Audio;
  const origRaf = (globalThis as any).requestAnimationFrame;
  const origCaf = (globalThis as any).cancelAnimationFrame;
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;

  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let lastRecorder: any;
  let lastAudio: any;
  let audioCtxCloseSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    capturedUnmount = null;

    createObjectURLSpy = vi.fn(() => 'blob:arc-mic-test-1');
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy as any;
    URL.revokeObjectURL = revokeObjectURLSpy as any;

    audioCtxCloseSpy = vi.fn().mockResolvedValue(undefined);
    const FakeAudioContext = class {
      state = 'running';
      createMediaStreamSource() { return { connect: vi.fn() }; }
      createAnalyser() {
        return {
          fftSize: 64,
          frequencyBinCount: 32,
          getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128)
        };
      }
      close = audioCtxCloseSpy;
    };

    (globalThis as any).window = { AudioContext: FakeAudioContext };
    (globalThis as any).requestAnimationFrame = vi.fn(() => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();

    lastRecorder = null;
    class FakeMediaRecorder {
      static isTypeSupported = () => true;
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor() { lastRecorder = this; }
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    (globalThis as any).MediaRecorder = FakeMediaRecorder;

    lastAudio = null;
    class FakeAudio {
      src: string;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = vi.fn().mockResolvedValue(undefined);
      constructor(url: string) {
        this.src = url;
        lastAudio = this;
      }
    }
    (globalThis as any).Audio = FakeAudio;
  });

  afterEach(() => {
    capturedUnmount?.();
    vi.useRealTimers();
    (globalThis as any).window = origWindow;
    Object.defineProperty(globalThis, 'navigator', { value: origNavigator, configurable: true, writable: true });
    (globalThis as any).MediaRecorder = origMediaRecorder;
    (globalThis as any).Audio = origAudio;
    (globalThis as any).requestAnimationFrame = origRaf;
    (globalThis as any).cancelAnimationFrame = origCaf;
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function setNavigatorMediaDevices(mediaDevices: any) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices },
      configurable: true,
      writable: true
    });
  }

  it('falls back to default system mic when saved deviceId throws OverconstrainedError', async () => {
    const { stream } = createFakeStream();
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Device unplugged'), { name: 'OverconstrainedError' }))
      .mockResolvedValueOnce(stream);
    setNavigatorMediaDevices({ getUserMedia });

    const api = useMicTest();
    await api.startMicTest('usb-mic-unplugged');

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { audio: { deviceId: { exact: 'usb-mic-unplugged' } } });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
    expect(api.phase.value).toBe('recording');
    expect(api.isTesting.value).toBe(true);
  });

  it('transitions immediately to error and cleans up when USB microphone disconnects mid-recording', async () => {
    const { stream, track } = createFakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setNavigatorMediaDevices({ getUserMedia });

    const api = useMicTest();
    await api.startMicTest();

    expect(api.phase.value).toBe('recording');
    expect(typeof track.onended).toBe('function');

    // Push a chunk so if onstop were not guarded, it would wrongly enter 'playing'
    lastRecorder.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    // Simulate physical USB mic unplugging
    track.onended?.();

    expect(api.phase.value).toBe('error');
    expect(api.isTesting.value).toBe(false);
    expect(api.errorMessage.value).toContain('отключён');
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(audioCtxCloseSpy).toHaveBeenCalledTimes(1);

    // Auto-resets to idle after 3s
    vi.advanceTimersByTime(3100);
    expect(api.phase.value).toBe('idle');
  });

  it('revokes Blob URL even when stopMicTest() is called manually during playback', async () => {
    const { stream } = createFakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setNavigatorMediaDevices({ getUserMedia });

    const api = useMicTest();
    await api.startMicTest();
    lastRecorder.ondataavailable?.({ data: new Blob(['voice-bytes'], { type: 'audio/webm' }) });

    // Finish 3s recording -> transitions to playing
    vi.advanceTimersByTime(3000);
    expect(api.phase.value).toBe('playing');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(lastAudio).not.toBeNull();

    // User cancels mid-playback -> Blob URL must still be revoked
    api.stopMicTest();
    expect(api.phase.value).toBe('idle');
    expect(api.isTesting.value).toBe(false);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:arc-mic-test-1');
  });
});
