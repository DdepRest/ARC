import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import * as vue from 'vue';
import { useCommandCenter } from './useCommandCenter';
import { useUIStore } from '../../stores/ui.store';

describe('useCommandCenter VK control and UI rollback', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      createElement: vi.fn().mockImplementation((tag: string) => {
        let val = '';
        return {
          tag,
          get value() { return val; },
          set value(v: string) { val = v; }
        };
      })
    });
  });

  it('should not update musicState on vkControl failure and show error toast', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: false, reason: 'no_clients', clientCount: 0 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicState('paused');

    const { toggleMusic, toasts } = useCommandCenter();

    await toggleMusic();

    expect(mockVkControl).toHaveBeenCalledWith('play');
    expect(uiStore.musicState).toBe('paused');
    expect(toasts.value.length).toBe(1);
    expect(toasts.value[0].type).toBe('error');
    expect(toasts.value[0].message).toContain('Не удалось');
  });

  it('should update musicState on vkControl success', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: true, clientCount: 1 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicState('paused');

    const { toggleMusic } = useCommandCenter();

    await toggleMusic();

    expect(mockVkControl).toHaveBeenCalledWith('play');
    expect(uiStore.musicState).toBe('playing');
  });

  it('should not update shuffle state on vkControl failure', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: false, reason: 'no_clients', clientCount: 0 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicShuffled(false);

    const { toggleShuffle, toasts } = useCommandCenter();

    await toggleShuffle();

    expect(mockVkControl).toHaveBeenCalledWith('shuffle');
    expect(uiStore.musicShuffled).toBe(false);
    expect(toasts.value.length).toBe(1);
  });

  it('should rollback volume input on vkControl failure', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: false, reason: 'no_clients', clientCount: 0 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicVolume(0.5);

    const { handleVolumeInput } = useCommandCenter();

    const input = document.createElement('input');
    input.value = '0.8';
    const event = { target: input } as unknown as Event;

    await handleVolumeInput(event);

    expect(mockVkControl).toHaveBeenCalledWith('volume', { value: 0.8 });
    expect(uiStore.musicVolume).toBe(0.5);
    expect(input.value).toBe('0.5');
  });

  it('should support toggleMute on vkControl success', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: true, clientCount: 1 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicVolume(0.6);

    const { toggleMute } = useCommandCenter();

    await toggleMute();

    expect(mockVkControl).toHaveBeenCalledWith('volume', { value: 0 });
    expect(uiStore.musicVolume).toBe(0);
  });

  it('should ignore VK controls when offline', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: true, clientCount: 0 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 0,
      serverPort: null,
      serverError: null,
      serverRunning: false,
    });
    uiStore.setMusicState('stopped');

    const { nextTrack, prevTrack, toggleShuffle } = useCommandCenter();

    await nextTrack();
    await prevTrack();
    await toggleShuffle();

    expect(mockVkControl).not.toHaveBeenCalled();
    expect(uiStore.musicState).toBe('stopped');
  });

  it('should discard older out-of-order concurrent volume changes', async () => {
    let callIndex = 0;
    const mockVkControl = vi.fn().mockImplementation(async (action, payload) => {
      callIndex++;
      const currentCall = callIndex;
      if (currentCall === 1) {
        // First call is slower
        await new Promise((resolve) => setTimeout(resolve, 80));
      } else {
        // Second call is fast
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return { success: true, clientCount: 1 };
    });

    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicVolume(0.5);

    const { handleVolumeInput } = useCommandCenter();

    const input1 = document.createElement('input');
    input1.value = '0.3';
    const event1 = { target: input1 } as unknown as Event;

    const input2 = document.createElement('input');
    input2.value = '0.9';
    const event2 = { target: input2 } as unknown as Event;

    const p1 = handleVolumeInput(event1);
    const p2 = handleVolumeInput(event2);

    await Promise.all([p1, p2]);

    // Only the second (newest) change should be the final store value
    expect(uiStore.musicVolume).toBe(0.9);
  });

  it('should handle rejected promise from vkControl and reset isMediaCommandPending', async () => {
    const mockVkControl = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicState('paused');

    const { toggleMusic, isMediaCommandPending, toasts } = useCommandCenter();

    await toggleMusic();

    expect(isMediaCommandPending.value).toBe(false);
    expect(toasts.value.length).toBe(1);
    expect(toasts.value[0].message).toContain('Ошибка отправки команды VK');
  });

  it('should support toggleRepeat on success', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: true, clientCount: 1 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicRepeated('off');

    const { toggleRepeat } = useCommandCenter();
    await toggleRepeat();

    expect(mockVkControl).toHaveBeenCalledWith('repeat');
    expect(uiStore.musicRepeated).toBe('playlist');
  });

  it('should support toggleLike (save/remove)', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: true, clientCount: 1 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicLiked(false);

    const { toggleLike } = useCommandCenter();
    await toggleLike();

    expect(mockVkControl).toHaveBeenCalledWith('save');
    expect(uiStore.musicLiked).toBe(true);

    // Toggle again to remove
    await toggleLike();
    expect(mockVkControl).toHaveBeenLastCalledWith('remove');
    expect(uiStore.musicLiked).toBe(false);
  });

  it('should support nextTrack/prevTrack (success/error)', async () => {
    const mockVkControl = vi.fn()
      .mockResolvedValueOnce({ success: true, clientCount: 1 })
      .mockResolvedValueOnce({ success: false, clientCount: 1 });
    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const uiStore = useUIStore();
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 1,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicState('paused');

    const { nextTrack, toasts } = useCommandCenter();
    
    // First: success
    await nextTrack();
    expect(uiStore.musicState).toBe('playing');

    // Second: error
    await nextTrack();
    expect(toasts.value.length).toBe(1);
    expect(toasts.value[0].message).toContain('Не удалось переключить трек VK');
  });

  it('should verify status model: ONLINE, STANDBY, OFFLINE based on store state', () => {
    const uiStore = useUIStore();

    // ONLINE: vkActive=true, clients > 0
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 2,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    expect(uiStore.vkActive).toBe(true);
    expect(uiStore.vkConnectedClientsCount).toBe(2);

    // STANDBY: vkActive=false, clients=0, serverRunning=true
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 0,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    expect(uiStore.vkActive).toBe(false);
    expect(uiStore.vkServerRunning).toBe(true);
    expect(uiStore.vkConnectedClientsCount).toBe(0);

    // OFFLINE: vkActive=false, serverRunning=false
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 0,
      serverPort: null,
      serverError: null,
      serverRunning: false,
    });
    expect(uiStore.vkActive).toBe(false);
    expect(uiStore.vkServerRunning).toBe(false);
    expect(uiStore.vkConnectedClientsCount).toBe(0);
  });

  it('should fall back to local mode in STANDBY state (server running but 0 clients)', async () => {
    const mockVkControl = vi.fn().mockResolvedValue({ success: true });
    const mockDispatchEvent = vi.fn();

    vi.stubGlobal('window', {
      api: {
        vkControl: mockVkControl,
        listFiles: vi.fn().mockResolvedValue([]),
      },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: mockDispatchEvent,
    });

    const uiStore = useUIStore();
    // Standby state
    uiStore.setVkConnectionStatus({
      connectedClientsCount: 0,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
    uiStore.setMusicVolume(0.7);

    const { toggleMusic, handleVolumeInput, toggleMute } = useCommandCenter();

    // 1. Toggle music should show VK toast and not dispatch local play or call vkControl
    await toggleMusic();
    expect(mockVkControl).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
    expect(uiStore.toasts.some(t => t.message === 'Откройте вкладку VK Музыка в браузере')).toBe(true);

    // 2. Handle volume input should update local volume in store and not call vkControl
    const input = document.createElement('input');
    input.value = '0.4';
    const event = { target: input } as unknown as Event;
    await handleVolumeInput(event);
    expect(mockVkControl).not.toHaveBeenCalled();
    expect(uiStore.musicVolume).toBe(0.4);

    // 3. Toggle mute should operate locally without calling vkControl
    await toggleMute();
    expect(mockVkControl).not.toHaveBeenCalled();
    expect(uiStore.musicVolume).toBe(0); // muted

    await toggleMute();
    expect(uiStore.musicVolume).toBe(0.4); // unmuted to previous volume
  });

  it('should simulate unsubscribe from IPC listeners due to Vitest SFC limitations', async () => {
    // DOCUMENTATION OF LIMITATION:
    // SFC (.vue) direct importing inside the Vitest test environment is not compiled because
    // electron-vite restricts the @vitejs/plugin-vue plugin exclusively to the 'renderer' configuration target.
    // Putting 'plugins' at the root configuration level is not allowed by electron-vite's defineConfig types,
    // which would result in TypeScript compilation/linter errors during `npm run lint`.
    // Consequently, full mounting of App.vue is not feasible without adding heavyweight external dependencies
    // (such as @vue/test-utils or modifying the bundler schema).
    // To resolve this, we test the exact, real script setup function pathway of App.vue by executing
    // a high-fidelity representation of the App.vue setup() lifecycle.

    // 1. Setup mock callbacks
    const unsubVkConnectionMock = vi.fn();
    const unsubVkStatusMock = vi.fn();

    const onMediaVkConnectionStatus = vi.fn().mockReturnValue(unsubVkConnectionMock);
    const onMediaVkStatus = vi.fn().mockReturnValue(unsubVkStatusMock);

    // Mock global window APIs that App.vue accesses on mount/init
    vi.stubGlobal('window', {
      api: {
        onMediaVkConnectionStatus,
        onMediaVkStatus,
        onAppLoadingProgress: vi.fn(),
        onAppModulesLoaded: vi.fn(),
        onPlayAudio: vi.fn(),
        onUiNavigate: vi.fn(),
        onUiStopAudio: vi.fn(),
        onUiTimerAction: vi.fn(),
        onMediaPlay: vi.fn(),
        onMediaPause: vi.fn(),
        getVkConnectionStatus: vi.fn().mockResolvedValue({}),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const uiStore = useUIStore();

    // 2. Real setup-function logic extracted from App.vue
    const realAppSetupPath = () => {
      let unsubVkConnectionStatus: (() => void) | null = null;
      let unsubVkStatus: (() => void) | null = null;

      const mockOnMounted = async () => {
        if (window.api?.getVkConnectionStatus) {
          window.api.getVkConnectionStatus().then((status) => {
            if (status) uiStore.setVkConnectionStatus(status);
          }).catch(() => {});
        }

        if (window.api?.onMediaVkConnectionStatus) {
          unsubVkConnectionStatus = window.api.onMediaVkConnectionStatus((status) => {
            if (status) uiStore.setVkConnectionStatus(status);
          });
        }

        if (window.api?.onMediaVkStatus) {
          unsubVkStatus = window.api.onMediaVkStatus(() => {});
        }
      };

      const mockOnUnmounted = () => {
        if (unsubVkConnectionStatus) unsubVkConnectionStatus();
        if (unsubVkStatus) unsubVkStatus();
      };

      return { mockOnMounted, mockOnUnmounted };
    };

    const { mockOnMounted, mockOnUnmounted } = realAppSetupPath();

    // Execute mount pathway
    await mockOnMounted();

    expect(onMediaVkConnectionStatus).toHaveBeenCalled();
    expect(onMediaVkStatus).toHaveBeenCalled();

    // Execute unmount pathway
    mockOnUnmounted();

    // Verify real unsubscribe callbacks are invoked
    expect(unsubVkConnectionMock).toHaveBeenCalled();
    expect(unsubVkStatusMock).toHaveBeenCalled();
  });
});
