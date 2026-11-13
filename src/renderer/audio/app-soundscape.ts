import { useUIStore } from '../stores/ui.store';
import { logger } from '../utils/logger';

export class AppSoundscapeManager {
  private ambientAudioCtx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private ambientOscillators: OscillatorNode[] = [];
  public isAmbientPlaying = false;
  public musicAudio: HTMLAudioElement | null = null;
  private currentRadioStreamIdx = 0;
  private isActivatingAmbientFallback = false;

  private readonly radioStreams = [
    'https://coderadio-relay-ffm.freecodecamp.org/radio/8010/radio.mp3',
    'https://coderadio-relay-ams.freecodecamp.org/radio/8010/radio.mp3',
    'https://coderadio-admin.freecodecamp.org/radio/8010/radio.mp3'
  ];

  public stopAmbient(): void {
    if (this.ambientOscillators.length > 0) {
      this.ambientOscillators.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (_) {
          logger.warn('Ignored error in catch', _);
        }
      });
      this.ambientOscillators = [];
    }
    this.isAmbientPlaying = false;
  }

  public pauseAmbient(): void {
    if (this.ambientAudioCtx && this.ambientAudioCtx.state === 'running') {
      this.ambientAudioCtx.suspend().catch(() => {});
    }
    this.isAmbientPlaying = false;
  }

  public resumeAmbient(): void {
    if (this.ambientAudioCtx && this.ambientAudioCtx.state === 'suspended') {
      this.ambientAudioCtx.resume().catch(() => {});
      this.isAmbientPlaying = true;
    } else if (!this.isAmbientPlaying) {
      this.startAmbient();
    }
  }

  public startAmbient(): void {
    try {
      const uiStore = useUIStore();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.ambientAudioCtx) {
        this.ambientAudioCtx = new AudioCtx();
      }
      if (this.ambientAudioCtx.state === 'suspended') {
        this.ambientAudioCtx.resume().catch(() => {});
      }

      this.stopAmbient();

      this.ambientGain = this.ambientAudioCtx.createGain();
      const vol = uiStore.musicVolume !== undefined ? uiStore.musicVolume : 0.5;
      this.ambientGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)) * 0.12, this.ambientAudioCtx.currentTime);

      const filter = this.ambientAudioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, this.ambientAudioCtx.currentTime);

      const freqs = [108, 162, 216, 324];
      this.ambientOscillators = freqs.map((freq, idx) => {
        const osc = this.ambientAudioCtx!.createOscillator();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, this.ambientAudioCtx!.currentTime);

        const subGain = this.ambientAudioCtx!.createGain();
        subGain.gain.setValueAtTime(0.25 / freqs.length, this.ambientAudioCtx!.currentTime);

        osc.connect(subGain);
        subGain.connect(filter);
        try {
          osc.start();
        } catch (_) {
          logger.warn('Ignored error in catch', _);
        }
        return osc;
      });

      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.ambientAudioCtx.destination);
      this.isAmbientPlaying = true;
      uiStore.setMusicState('playing');
      uiStore.setMusicTitle('A.R.C. Quantum Soundscape');
    } catch (err) {
      console.warn('[Soundscape] Ambient soundscape notice:', err);
      const uiStore = useUIStore();
      uiStore.setMusicState('playing');
      uiStore.setMusicTitle('A.R.C. Media Stream');
    }
  }

  public playRadioStream(index: number): void {
    const uiStore = useUIStore();
    if (index >= this.radioStreams.length) {
      if (!this.isActivatingAmbientFallback) {
        this.isActivatingAmbientFallback = true;
        console.warn('[Media] All CodeRadio stream relays unreachable, activating Quantum Soundscape.');
        if (this.musicAudio) {
          try {
            this.musicAudio.pause();
          } catch (_) {
            logger.warn('Ignored error in catch', _);
          }
          this.musicAudio = null;
        }
        this.startAmbient();
        setTimeout(() => {
          this.isActivatingAmbientFallback = false;
        }, 1200);
      }
      return;
    }

    const url = this.radioStreams[index];
    try {
      if (this.musicAudio) {
        try {
          this.musicAudio.pause();
        } catch (_) {
          logger.warn('Ignored error in catch', _);
        }
        this.musicAudio = null;
      }
      this.musicAudio = new Audio(url);
      this.musicAudio.loop = true;
      this.musicAudio.crossOrigin = 'anonymous';
      this.musicAudio.volume = Math.max(0, Math.min(1, uiStore.musicVolume));

      let hasHandledFailure = false;
      const onStreamFailed = (errReason?: any) => {
        if (hasHandledFailure) return;
        hasHandledFailure = true;
        console.warn(
          `[Media] CodeRadio relay [${index}] failed (${errReason?.message || errReason || 'offline'}), attempting next relay...`
        );
        this.playRadioStream(index + 1);
      };

      this.musicAudio.onerror = () => {
        onStreamFailed('network/connection reset');
      };

      this.musicAudio
        .play()
        .then(() => {
          this.currentRadioStreamIdx = index;
          uiStore.setMusicState('playing');
          uiStore.setMusicTitle('FreeCodeCamp Code Radio');
        })
        .catch(e => {
          onStreamFailed(e);
        });
    } catch (err) {
      this.playRadioStream(index + 1);
    }
  }

  public handleLocalMusicPlay(): void {
    const uiStore = useUIStore();
    if (this.isAmbientPlaying && this.ambientAudioCtx && this.ambientAudioCtx.state === 'suspended') {
      this.resumeAmbient();
      return;
    }

    if (this.musicAudio && this.musicAudio.src) {
      this.musicAudio
        .play()
        .then(() => {
          uiStore.setMusicState('playing');
        })
        .catch(e => {
          console.warn('[Media] Stream playback failed, retrying relays:', e?.message || e);
          this.playRadioStream(0);
        });
    } else {
      this.currentRadioStreamIdx = 0;
      this.playRadioStream(0);
    }
  }

  public handleLocalMusicPause(): void {
    const uiStore = useUIStore();
    if (this.musicAudio) {
      try {
        this.musicAudio.pause();
      } catch (_) {
        logger.warn('Ignored error in catch', _);
      }
    }
    if (this.isAmbientPlaying) {
      this.pauseAmbient();
    }
    uiStore.setMusicState('paused');
  }

  public setVolume(newVol: number): void {
    const clampedVol = Math.max(0, Math.min(1, newVol));
    if (this.musicAudio) {
      this.musicAudio.volume = clampedVol;
    }
    if (this.ambientGain && this.ambientAudioCtx) {
      try {
        const targetGain = clampedVol * 0.12;
        if (typeof this.ambientGain.gain.setTargetAtTime === 'function') {
          this.ambientGain.gain.setTargetAtTime(targetGain, this.ambientAudioCtx.currentTime, 0.08);
        } else {
          this.ambientGain.gain.setValueAtTime(targetGain, this.ambientAudioCtx.currentTime);
        }
      } catch (_) {
        logger.warn('Ignored error in catch', _);
      }
    }
  }

  public cleanup(): void {
    if (this.musicAudio) {
      try {
        this.musicAudio.pause();
      } catch (_) {
        logger.warn('Ignored error in catch', _);
      }
      this.musicAudio = null;
    }
    this.stopAmbient();
  }
}
