import { watch } from 'vue';
import { useUIStore } from '../stores/ui.store';
import { audioManager } from './useAudioManager';
import { AppSoundscapeManager } from '../audio/app-soundscape';
import { audioDuckingManager } from '../audio/audio-ducking-manager';
import { logger } from '../utils/logger';

export function useAppMedia() {
  const uiStore = useUIStore();
  const soundscape = new AppSoundscapeManager();

  let currentAudio: HTMLAudioElement | null = null;
  let unsubVkConnectionStatus: (() => void) | null = null;
  let unsubVkStatus: (() => void) | null = null;

  const handleStopAudio = () => {
    if (window.api && (window.api as any).stopSpeak) {
      (window.api as any).stopSpeak().catch((e: any) => console.error('Failed to call stopSpeak', e));
    }
    if (window.api && (window.api as any).abortAiRequest) {
      (window.api as any).abortAiRequest().catch((e: any) => console.error('Failed to abort ai request', e));
    }
    if (audioManager) {
      audioManager.stopAll();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {
        logger.warn('Ignored error in catch', _);
      }
    }
    soundscape.cleanup();

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
      if (window.api && (window.api as any).audioDone) {
        (window.api as any).audioDone();
      }
    }
    uiStore.setSoftPaused(false);
    uiStore.setReactorState('idle');
  };

  const handlePauseAudio = () => {
    if (currentAudio) {
      currentAudio.pause();
      uiStore.setSoftPaused(true);
    }
  };

  const handleResumeAudio = () => {
    if (currentAudio) {
      currentAudio.play().catch(e => console.error('Failed to resume audio', e));
      uiStore.setSoftPaused(false);
    }
  };

  const onMusicPlay = () => soundscape.handleLocalMusicPlay();
  const onMusicPause = () => soundscape.handleLocalMusicPause();

  watch(
    () => uiStore.musicVolume,
    newVol => {
      soundscape.setVolume(newVol);
    }
  );

  const initAppMedia = () => {
    audioDuckingManager.init();
    window.addEventListener('arc:stop-audio', handleStopAudio);
    window.addEventListener('arc:pause-audio', handlePauseAudio);
    window.addEventListener('arc:resume-audio', handleResumeAudio);
    window.addEventListener('arc:music-play', onMusicPlay);
    window.addEventListener('arc:music-pause', onMusicPause);

    if (window.api && (window.api as any).onMediaPlay) {
      (window.api as any).onMediaPlay((data: { url: string; title: string }) => {
        logger.info('Music play triggered:', data);
        if (!soundscape.musicAudio) {
          soundscape.musicAudio = new Audio(data.url);
          soundscape.musicAudio.loop = true;
          soundscape.musicAudio.crossOrigin = 'anonymous';
        } else if (soundscape.musicAudio.src !== data.url) {
          soundscape.musicAudio.src = data.url;
        }
        soundscape.musicAudio.volume = uiStore.musicVolume;
        soundscape.musicAudio
          .play()
          .then(() => {
            uiStore.setMusicState('playing');
            uiStore.setMusicTitle(data.title || 'Атмосферный Эмбиент');
          })
          .catch(e => {
            console.error('Music playback failed:', e);
          });
      });
    }

    if (window.api && (window.api as any).onMediaPause) {
      (window.api as any).onMediaPause(() => {
        logger.info('Music pause triggered');
        if (soundscape.musicAudio) {
          soundscape.musicAudio.pause();
          uiStore.setMusicState('paused');
        }
      });
    }

    if (window.api?.getVkConnectionStatus) {
      window.api
        .getVkConnectionStatus()
        .then(status => {
          if (status) uiStore.setVkConnectionStatus(status);
        })
        .catch(e => console.warn('Failed to get initial VK connection status:', e));
    }

    if (window.api?.onMediaVkConnectionStatus) {
      unsubVkConnectionStatus = window.api.onMediaVkConnectionStatus(status => {
        if (status) uiStore.setVkConnectionStatus(status);
      });
    }

    if (window.api?.onMediaVkStatus) {
      unsubVkStatus = window.api.onMediaVkStatus(data => {
        uiStore.applyVkStatus(data);
      });
    }

    if (window.api && (window.api as any).onMediaQuieter) {
      (window.api as any).onMediaQuieter((data?: any) => {
        const newVol = data?.volume !== undefined ? data.volume : Math.max(0, uiStore.musicVolume - 0.15);
        uiStore.setMusicVolume(newVol);
        soundscape.setVolume(newVol);
        if (uiStore.vkActive && window.api?.vkControl) {
          window.api.vkControl('volume', { value: newVol }).catch((e: unknown) => console.error(e));
        }
      });
    }

    if (window.api && (window.api as any).onMediaLouder) {
      (window.api as any).onMediaLouder((data?: any) => {
        const newVol = data?.volume !== undefined ? data.volume : Math.min(1.0, uiStore.musicVolume + 0.15);
        uiStore.setMusicVolume(newVol);
        soundscape.setVolume(newVol);
        if (uiStore.vkActive && window.api?.vkControl) {
          window.api.vkControl('volume', { value: newVol }).catch((e: unknown) => console.error(e));
        }
      });
    }
  };

  const destroyAppMedia = () => {
    window.removeEventListener('arc:stop-audio', handleStopAudio);
    window.removeEventListener('arc:pause-audio', handlePauseAudio);
    window.removeEventListener('arc:resume-audio', handleResumeAudio);
    window.removeEventListener('arc:music-play', onMusicPlay);
    window.removeEventListener('arc:music-pause', onMusicPause);
    if (unsubVkConnectionStatus) unsubVkConnectionStatus();
    if (unsubVkStatus) unsubVkStatus();
    audioDuckingManager.cleanup();
    soundscape.cleanup();
  };

  return {
    initAppMedia,
    destroyAppMedia,
    handleStopAudio,
    handlePauseAudio,
    handleResumeAudio
  };
}
