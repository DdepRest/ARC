import { describe, it, expect, vi, beforeAll } from 'vitest';

let exposedApi: Record<string, any> = {};
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, api: any) => {
      if (key === 'api') {
        exposedApi = api;
      }
    })
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: (...args: any[]) => mockOn(...args),
    removeListener: (...args: any[]) => mockRemoveListener(...args)
  }
}));

describe('Preload API on* Unsubscribe Contract', () => {
  beforeAll(async () => {
    vi.clearAllMocks();
    await import('./preload');
  });

  it('exposes the api object via contextBridge', () => {
    expect(Object.keys(exposedApi).length).toBeGreaterThan(0);
  });

  it('ensures every on* method returns an unsubscribe function and properly removes listener', () => {
    const onMethods = Object.keys(exposedApi).filter((k) => /^on[A-Z]/.test(k));

    // Ensure we are testing all on* methods (expected > 25)
    expect(onMethods.length).toBeGreaterThan(25);

    for (const methodName of onMethods) {
      mockOn.mockClear();
      mockRemoveListener.mockClear();

      const dummyCallback = vi.fn();
      const result = exposedApi[methodName](dummyCallback);

      // 1. Result must be a function
      expect(
        typeof result,
        `${methodName} must return a function, but returned ${typeof result}`
      ).toBe('function');

      // 2. Result must not be ipcRenderer
      expect(result).not.toHaveProperty('invoke');
      expect(result).not.toHaveProperty('send');

      // 3. ipcRenderer.on must have been called with a channel and listener function
      expect(mockOn).toHaveBeenCalledTimes(1);
      const [channel, registeredListener] = mockOn.mock.calls[0];
      expect(typeof channel).toBe('string');
      expect(typeof registeredListener).toBe('function');

      // 4. Executing unsubscribe must invoke ipcRenderer.removeListener with matching channel and listener
      result();
      expect(
        mockRemoveListener,
        `${methodName}'s unsubscribe function did not call removeListener`
      ).toHaveBeenCalledWith(channel, registeredListener);
    }
  });

  it('specifically verifies onWake contract', () => {
    mockOn.mockClear();
    mockRemoveListener.mockClear();

    const dummyCallback = vi.fn();
    const unsubscribe = exposedApi.onWake(dummyCallback);

    expect(typeof unsubscribe).toBe('function');
    expect(mockOn).toHaveBeenCalledWith('voice:wake', expect.any(Function));

    const [, registeredListener] = mockOn.mock.calls[0];
    unsubscribe();
    expect(mockRemoveListener).toHaveBeenCalledWith('voice:wake', registeredListener);
  });
});
