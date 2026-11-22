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
  let activeObjectUrl: string | null = null;
  let countdownTimer: any = null;
  let playbackTimer: any = null;
  let errorResetTimer: any = null;
  let abortedByDisconnect = false;

  const revokeActiveUrl = () => {
    if (activeObjectUrl) {
      try { URL.revokeObjectURL(activeObjectUrl); } catch {}
      activeObjectUrl = null;
    }
  };

  const cleanupAudio = () => {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
    if (errorResetTimer) { clearTimeout(errorResetTimer); errorResetTimer = null; }
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
    mediaRecorder = null;
    if (stream) {
      stream.getTracks().forEach(track => {
        track.onended = null;
        try { track.stop(); } catch {}
      });
      stream = null;
    }
    if (audioCtx) {
      if (audioCtx.state !== 'closed') {
        try {
          const p = audioCtx.close();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {}
      }
      audioCtx = null;
    }
    analyser = null;

    if (playbackAudio) {
      playbackAudio.onended = null;
      playbackAudio.onerror = null;
      playbackAudio.pause();
      playbackAudio.src = '';
      playbackAudio = null;
    }
    revokeActiveUrl();
  };

  const stopMicTest = () => {
    abortedByDisconnect = false;
    cleanupAudio();
    isTesting.value = false;
    phase.value = 'idle';
    rmsLevel.value = 0;
    secondsRemaining.value = 3;
  };

  const acquireMicStream = async (deviceId?: string): Promise<MediaStream> => {
    if (!deviceId) {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
    } catch (err: any) {
      if (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError') {
        return navigator.mediaDevices.getUserMedia({ audio: true });
      }
      throw err;
    }
  };

  const startMicTest = async (deviceId?: string) => {
    stopMicTest();
    errorMessage.value = '';
    recordedChunks = [];
    abortedByDisconnect = false;
    isTesting.value = true;
    phase.value = 'recording';
    secondsRemaining.value = 3;

    try {
      stream = await acquireMicStream(deviceId);

      // Guard against unexpected USB microphone unplugging mid-recording
      const onUnexpectedTrackEnd = () => {
        if (phase.value !== 'recording') return;
        abortedByDisconnect = true;
        cleanupAudio();
        isTesting.value = false;
        rmsLevel.value = 0;
        errorMessage.value = 'Микрофон был отключён во время проверки';
        phase.value = 'error';
        errorResetTimer = setTimeout(() => {
          if (phase.value === 'error') stopMicTest();
        }, 3000);
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = onUnexpectedTrackEnd;
      });

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
        if (abortedByDisconnect || recordedChunks.length === 0) {
          if (!abortedByDisconnect) stopMicTest();
          return;
        }

        const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        revokeActiveUrl();
        const audioUrl = URL.createObjectURL(blob);
        activeObjectUrl = audioUrl;

        phase.value = 'playing';
        secondsRemaining.value = 3;

        playbackAudio = new Audio(audioUrl);
        playbackAudio.onended = () => { stopMicTest(); };
        playbackAudio.onerror = () => { stopMicTest(); };

        playbackAudio.play().catch(e => {
          console.warn('[useMicTest] Playback error:', e);
          stopMicTest();
        });

        playbackTimer = setTimeout(() => {
          if (phase.value === 'playing') stopMicTest();
        }, 4000);
      };

      mediaRecorder.start();

      countdownTimer = setInterval(() => {
        secondsRemaining.value -= 1;
        if (secondsRemaining.value <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          if (stream) {
            stream.getTracks().forEach(t => { t.onended = null; });
          }
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          if (stream) {
            stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
          }
        }
      }, 1000);
    } catch (err: any) {
      console.error('[useMicTest] Microphone test failed:', err);
      cleanupAudio();
      isTesting.value = false;
      rmsLevel.value = 0;
      errorMessage.value = err?.message || 'Не удалось получить доступ к микрофону';
      phase.value = 'error';
      errorResetTimer = setTimeout(() => {
        if (phase.value === 'error') stopMicTest();
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
