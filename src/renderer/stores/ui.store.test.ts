import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUIStore } from './ui.store';

describe('UI Store - Advanced A.R.C. Extensions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should initialize timeline, routing, voice countdown, and profiler state', () => {
    const store = useUIStore();
    expect(store.timelineStep).toBeNull();
    expect(store.timelineLatency).toBe(0);
    expect(store.activeModel).toContain('Qwen');
    expect(store.activeRoute).toBeNull();
    expect(store.conversationCountdown).toBe(0);
    expect(store.profilerStats.fps).toBe(60);
  });

  it('should update timeline step and latency correctly', () => {
    const store = useUIStore();
    store.setTimelineStep('CLASSIFIER', 42);
    expect(store.timelineStep).toBe('CLASSIFIER');
    expect(store.timelineLatency).toBe(42);

    store.setTimelineStep('ROUTER');
    expect(store.timelineStep).toBe('ROUTER');
    expect(store.timelineLatency).toBe(42); // maintained previous latency when 0 passed
  });

  it('should set active route with target and cause', () => {
    const store = useUIStore();
    store.setActiveRoute({ target: 'local', cause: 'short query (<20 chars)' });
    expect(store.activeRoute).toEqual({ target: 'local', cause: 'short query (<20 chars)' });
  });

  it('should update conversation countdown', () => {
    const store = useUIStore();
    store.setConversationCountdown(8);
    expect(store.conversationCountdown).toBe(8);

    store.setConversationCountdown(-5); // bounds check
    expect(store.conversationCountdown).toBe(0);
  });

  it('should update profiler stats', () => {
    const store = useUIStore();
    store.updateProfilerStats({ fps: 58, frameTime: 17.2, particleCount: 800 });
    expect(store.profilerStats.fps).toBe(58);
    expect(store.profilerStats.frameTime).toBe(17.2);
    expect(store.profilerStats.particleCount).toBe(800);
    expect(store.profilerStats.drawCalls).toBe(12); // preserved default
  });

  it('should manage VK connection status correctly', () => {
    const store = useUIStore();
    expect(store.vkConnectedClientsCount).toBe(0);
    expect(store.vkActive).toBe(false);

    store.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });

    expect(store.vkConnectedClientsCount).toBe(1);
    expect(store.vkServerPort).toBe(8765);
    expect(store.vkServerRunning).toBe(true);
    expect(store.vkActive).toBe(true);

    store.setVkConnectionStatus({
      connectedClientsCount: 0,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });

    expect(store.vkConnectedClientsCount).toBe(0);
    expect(store.vkActive).toBe(false); // STANDBY state: active=false, clients=0

    store.setVkConnectionStatus({
      connectedClientsCount: 0,
      serverPort: null,
      serverError: null,
      serverRunning: false,
    });

    expect(store.vkConnectedClientsCount).toBe(0);
    expect(store.vkActive).toBe(false); // OFFLINE state: active=false
  });

  it('suppresses duplicate speak requests when called with identical text', async () => {
    const store = useUIStore();
    const mockSpeak = vi.fn().mockResolvedValue({ success: true });
    (globalThis as any).window = {
      api: { speak: mockSpeak },
      dispatchEvent: vi.fn(),
    };

    await store.speak('Температура плюс двадцать один градус');
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // Duplicate call without force should be suppressed
    await store.speak('Температура плюс двадцать один градус');
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // Call with force: true should be allowed
    await store.speak('Температура плюс двадцать один градус', undefined, { force: true });
    expect(mockSpeak).toHaveBeenCalledTimes(2);
  });
});
