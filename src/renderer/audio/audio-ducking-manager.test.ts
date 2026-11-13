import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { AudioDuckingManager } from './audio-ducking-manager';
import { useUIStore } from '../stores/ui.store';
import { useSettingsStore } from '../features/settings/stores/settings.store';

describe('AudioDuckingManager', () => {
  let manager: AudioDuckingManager;
  let mockVkControl: ReturnType<typeof vi.fn>;
  let mockDuckSystemAudio: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    manager = new AudioDuckingManager();
    mockVkControl = vi.fn().mockResolvedValue({ success: true });
    mockDuckSystemAudio = vi.fn().mockResolvedValue({ success: true });

    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.api = {
      vkControl: mockVkControl,
      duckSystemAudio: mockDuckSystemAudio
    };
  });

  it('reduces background audio gain by 70% on duck() and restores full volume on restore()', () => {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();

    settingsStore.autoDuckMusic = true;
    settingsStore.audioDuckingPercentage = 70;
    uiStore.setMusicState('playing');
    uiStore.setVkActive(true);
    uiStore.setMusicVolume(1.0);

    manager.duck();

    expect(manager.isAudioDucked).toBe(true);
    expect(uiStore.musicVolume).toBe(0.3);
    expect(mockVkControl).toHaveBeenCalledWith('volume', { value: 0.3 });
    expect(mockDuckSystemAudio).toHaveBeenCalledWith(0.7, true);

    manager.restore();

    expect(manager.isAudioDucked).toBe(false);
    expect(uiStore.musicVolume).toBe(1.0);
    expect(mockVkControl).toHaveBeenCalledWith('volume', { value: 1.0 });
    expect(mockDuckSystemAudio).toHaveBeenCalledWith(0.7, false);
  });

  it('respects configurable audioDuckingPercentage slider value', () => {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();

    settingsStore.autoDuckMusic = true;
    settingsStore.audioDuckingPercentage = 50;
    uiStore.setMusicState('playing');
    uiStore.setMusicVolume(0.8);

    manager.duck();

    expect(uiStore.musicVolume).toBe(0.4);
    expect(mockDuckSystemAudio).toHaveBeenCalledWith(0.5, true);

    manager.restore();
    expect(uiStore.musicVolume).toBe(0.8);
  });

  it('does not duck when autoDuckMusic is disabled in settings', () => {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();

    settingsStore.autoDuckMusic = false;
    uiStore.setMusicState('playing');
    uiStore.setMusicVolume(0.9);

    manager.duck();

    expect(manager.isAudioDucked).toBe(false);
    expect(uiStore.musicVolume).toBe(0.9);
    expect(mockDuckSystemAudio).not.toHaveBeenCalled();
  });

  it('reduces 30% current volume by 70% of its value (to 9%) and never increases it, then restores exact 30%', () => {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();

    settingsStore.autoDuckMusic = true;
    settingsStore.audioDuckingPercentage = 70;
    uiStore.setMusicState('playing');
    uiStore.setVkActive(true);
    uiStore.setMusicVolume(0.3);

    manager.duck();

    // 30% reduced by 70% of current value = 0.30 * (1 - 0.70) = 0.09 (9%)
    expect(uiStore.musicVolume).toBe(0.09);
    expect(uiStore.musicVolume).toBeLessThan(0.3);
    expect(mockVkControl).toHaveBeenCalledWith('volume', { value: 0.09 });

    // Calling duck() again while already ducked does not overwrite saved 0.30
    manager.duck();
    expect(manager.savedPreDuckVolume).toBe(0.3);

    manager.restore();

    expect(uiStore.musicVolume).toBe(0.3);
    expect(mockVkControl).toHaveBeenCalledWith('volume', { value: 0.3 });
  });

  it('ducks system audio and VK even when internal musicState is stopped (external Windows media playing)', () => {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();

    settingsStore.autoDuckMusic = true;
    settingsStore.audioDuckingPercentage = 70;
    uiStore.setMusicState('stopped');
    uiStore.setVkActive(false);
    uiStore.setMusicVolume(0.5);

    manager.duck();

    expect(manager.isAudioDucked).toBe(true);
    expect(uiStore.musicVolume).toBe(0.15);
    expect(mockDuckSystemAudio).toHaveBeenCalledWith(0.7, true);

    manager.restore();

    expect(manager.isAudioDucked).toBe(false);
    expect(uiStore.musicVolume).toBe(0.5);
    expect(mockDuckSystemAudio).toHaveBeenCalledWith(0.7, false);
  });
});
