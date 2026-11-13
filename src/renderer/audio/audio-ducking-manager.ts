import { useUIStore } from '../stores/ui.store';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { logger } from '../utils/logger';

export class AudioDuckingManager {
  private isDucked = false;
  private preDuckVolume: number | null = null;
  private appliedDuckedVolume: number | null = null;
  private appliedReductionFactor: number = 0.7;
  private unsubscribers: Array<() => void> = [];

  public get isAudioDucked(): boolean {
    return this.isDucked;
  }

  public get savedPreDuckVolume(): number | null {
    return this.preDuckVolume;
  }

  public init(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    // Clean up any previous listeners if init() is called multiple times
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    const onTtsStart = () => this.duck();
    const onTtsFinish = () => {
      // Restore after TTS finishes ONLY if no active dialogue window is keeping the session open
      setTimeout(() => {
        try {
          const uiStore = useUIStore();
          if (uiStore.conversationCountdown <= 0 && uiStore.reactorState !== 'speaking') {
            this.restore();
          }
        } catch {
          this.restore();
        }
      }, 80);
    };
    const onStopAudio = () => this.restore();
    const onMusicPause = () => {
      // If music was paused while ducked, restore the saved volume setting silently so next play starts at normal volume
      if (this.isDucked && this.preDuckVolume !== null) {
        const uiStore = useUIStore();
        uiStore.setMusicVolume(this.preDuckVolume);
      }
      this.isDucked = false;
      this.preDuckVolume = null;
      this.appliedDuckedVolume = null;
      if (typeof window !== 'undefined' && window.api?.duckSystemAudio) {
        window.api.duckSystemAudio(this.appliedReductionFactor, false).catch(() => {});
      }
    };

    window.addEventListener('arc:tts-start', onTtsStart);
    window.addEventListener('arc:tts-finish', onTtsFinish);
    window.addEventListener('arc:stop-audio', onStopAudio);
    window.addEventListener('arc:music-pause', onMusicPause);

    this.unsubscribers.push(
      () => window.removeEventListener('arc:tts-start', onTtsStart),
      () => window.removeEventListener('arc:tts-finish', onTtsFinish),
      () => window.removeEventListener('arc:stop-audio', onStopAudio),
      () => window.removeEventListener('arc:music-pause', onMusicPause)
    );

    logger.info('[AudioDuckingManager] Initialized with TTS lifecycle hooks');
  }

  /**
   * Reduces background audio volume by `audioDuckingPercentage`% OF THE CURRENT VOLUME.
   * Example: If current volume is 30% (0.30) and reduction is 70%,
   * new volume = 0.30 * (1 - 0.70) = 0.09 (9%). Never increases volume.
   */
  public duck(): void {
    try {
      const settingsStore = useSettingsStore();
      if (!settingsStore.autoDuckMusic) return;
      if (this.isDucked) return;

      const uiStore = useUIStore();
      const reductionPercentage = Math.max(10, Math.min(95, settingsStore.audioDuckingPercentage ?? 70));
      const reductionFactor = reductionPercentage / 100;
      const remainingMultiplier = Math.max(0, Math.min(1, 1 - reductionFactor));

      const currentVol = uiStore.musicVolume;
      this.isDucked = true;
      this.appliedReductionFactor = reductionFactor;

      if (currentVol > 0.01) {
        this.preDuckVolume = currentVol;
        // Strictly relative to currentVol: never exceeds currentVol
        const duckedVol = Math.min(
          currentVol,
          Math.max(0, Math.round(currentVol * remainingMultiplier * 1000) / 1000)
        );
        this.appliedDuckedVolume = duckedVol;

        logger.info(
          `[AudioDuckingManager] Ducking background audio by ${reductionPercentage}% of current value (${Math.round(currentVol * 100)}% -> ${Math.round(duckedVol * 100)}%)`
        );

        // 1. In-app music state
        uiStore.setMusicVolume(duckedVol);

        // 2. VK player WebSocket
        if (typeof window !== 'undefined' && window.api?.vkControl) {
          window.api.vkControl('volume', { value: duckedVol }).catch(() => {});
        }
      } else {
        logger.info(
          `[AudioDuckingManager] Ducking system background audio by ${reductionPercentage}% of current value`
        );
      }

      // 3. System audio stream ducking (relative to current session volume in Windows Volume Mixer)
      if (typeof window !== 'undefined' && window.api?.duckSystemAudio) {
        window.api.duckSystemAudio(reductionFactor, true).catch(() => {});
      }
    } catch (err) {
      logger.warn('[AudioDuckingManager] Error in duck():', err);
    }
  }

  /**
   * Restores the exact volume saved before ducking after all voice/TTS work finishes.
   */
  public restore(): void {
    try {
      if (!this.isDucked) return;
      this.isDucked = false;

      const uiStore = useUIStore();
      const restoreVol = this.preDuckVolume;
      const lastDuckedVol = this.appliedDuckedVolume;
      const factor = this.appliedReductionFactor;

      this.preDuckVolume = null;
      this.appliedDuckedVolume = null;

      if (restoreVol !== null) {
        // Check if user manually changed volume while ducked (e.g. via slider or voice command)
        const currentVol = uiStore.musicVolume;
        const userChangedManually =
          lastDuckedVol !== null && Math.abs(currentVol - lastDuckedVol) > 0.02;

        const targetRestoreVol = userChangedManually ? currentVol : restoreVol;

        logger.info(
          `[AudioDuckingManager] Restoring background audio volume to ${Math.round(targetRestoreVol * 100)}% (${targetRestoreVol})`
        );
        uiStore.setMusicVolume(targetRestoreVol);

        if (typeof window !== 'undefined' && window.api?.vkControl) {
          window.api.vkControl('volume', { value: targetRestoreVol }).catch(() => {});
        }
      }

      if (typeof window !== 'undefined' && window.api?.duckSystemAudio) {
        window.api.duckSystemAudio(factor, false).catch(() => {});
      }
    } catch (err) {
      logger.warn('[AudioDuckingManager] Error in restore():', err);
    }
  }

  public cleanup(): void {
    this.restore();
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}

export const audioDuckingManager = new AudioDuckingManager();
