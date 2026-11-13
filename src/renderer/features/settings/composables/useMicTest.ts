import { ref, onUnmounted } from 'vue';

export type MicTestPhase = 'idle' | 'recording' | 'playing' | 'error';

export function useMicTest() {
  const isTesting = ref(false);
  const phase = ref<MicTestPhase>('idle');
  const secondsRemaining = ref(3);
  const rmsLevel = ref(0);
  const errorMessage = ref('');

  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animId: number | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let playbackAudio: HTMLAudioElement | null = null;
  let countdownTimer: any = null;
  let playbackTimer: any = null;

  const cleanupAudio = () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        // ignore
      }
      mediaRecorder = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      stream = null;
    }
    if (audioCtx) {
      if (audioCtx.state !== 'closed') {
        try {
          const p = audioCtx.close();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        } catch {
          // ignore
        }
      }
      audioCtx = null;
    }
    analyser = null;

    if (playbackAudio) {
      playbackAudio.pause();
      playbackAudio.src = '';
      playbackAudio = null;
    }
  };

  const stopMicTest = () => {
    cleanupAudio();
    isTesting.value = false;
    phase.value = 'idle';
    rmsLevel.value = 0;
    secondsRemaining.value = 3;
  };

  const startMicTest = async (deviceId?: string) => {
    stopMicTest();
    errorMessage.value = '';
    recordedChunks = [];
    isTesting.value = true;
    phase.value = 'recording';
    secondsRemaining.value = 3;

    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateRms = () => {
        if (!analyser || phase.value !== 'recording') return;
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        rmsLevel.value = rmsLevel.value * 0.3 + rms * 0.7;
        animId = requestAnimationFrame(updateRms);
      };
      updateRms();

      // Setup MediaRecorder
      const options = MediaRecorder.isTypeSupported('audio/webm') 
        ? { mimeType: 'audio/webm' } 
        : undefined;
      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordedChunks.length === 0) {
          stopMicTest();
          return;
        }

        const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);

        phase.value = 'playing';
        secondsRemaining.value = 3;

        playbackAudio = new Audio(audioUrl);
        playbackAudio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          stopMicTest();
        };
        playbackAudio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          stopMicTest();
        };

        playbackAudio.play().catch(e => {
          console.warn('[useMicTest] Playback error:', e);
          stopMicTest();
        });

        playbackTimer = setTimeout(() => {
          if (phase.value === 'playing') {
            URL.revokeObjectURL(audioUrl);
            stopMicTest();
          }
        }, 4000);
      };

      mediaRecorder.start();

      countdownTimer = setInterval(() => {
        secondsRemaining.value -= 1;
        if (secondsRemaining.value <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          // Stop stream tracks immediately to free mic
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
          }
        }
      }, 1000);

    } catch (err: any) {
      console.error('[useMicTest] Microphone test failed:', err);
      errorMessage.value = err?.message || 'Не удалось получить доступ к микрофону';
      phase.value = 'error';
      cleanupAudio();
      setTimeout(() => {
        if (phase.value === 'error') {
          stopMicTest();
        }
      }, 3000);
    }
  };

  onUnmounted(() => {
    cleanupAudio();
  });

  return {
    isTesting,
    phase,
    secondsRemaining,
    rmsLevel,
    errorMessage,
    startMicTest,
    stopMicTest
  };
}
