import { ref, computed, watch, onUnmounted } from 'vue';
import type { FileAttachment } from '../../../../shared/types/models/chat';
import { useVoice } from '../../../composables/useVoice';
import { useUIStore } from '../../../stores/ui.store';

export function useComposerAttachments(
  getFiles: () => FileAttachment[],
  updateFiles: (files: FileAttachment[]) => void,
  onVoiceTranscript: (transcript: string) => void
) {
  const voice = useVoice();
  const uiStore = useUIStore();

  const isRecording = ref(false);
  const recordingSeconds = ref(0);
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let activeRecognition: any = null;
  let startedArcVoiceHere = false;

  const formattedRecordingTime = computed(() => {
    const mins = Math.floor(recordingSeconds.value / 60);
    const secs = String(recordingSeconds.value % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  });

  // Stream partial and final dictation transcripts from A.R.C. voice subsystem while recording in composer
  watch(
    () => [voice.dictationTranscript.value, voice.partialTranscript.value],
    ([finalDictated, partial]) => {
      if (!isRecording.value) return;
      const text = [finalDictated, partial].filter(Boolean).join(' ').trim();
      if (text) {
        onVoiceTranscript(text);
      }
    }
  );

  watch(isRecording, (rec) => {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    if (rec) {
      recordingSeconds.value = 0;
      recordingTimer = setInterval(() => {
        recordingSeconds.value += 1;
      }, 1000);
    }
  });

  onUnmounted(() => {
    if (recordingTimer) clearInterval(recordingTimer);
    if (isRecording.value || voice.isWakeWordSuspended.value) {
      stopVoiceCapture();
    }
  });

  async function stopVoiceCapture() {
    if (!isRecording.value && !voice.isWakeWordSuspended.value) return;
    isRecording.value = false;
    try {
      activeRecognition?.stop?.();
      activeRecognition = null;
    } catch {
      // ignore
    }
    if (startedArcVoiceHere) {
      startedArcVoiceHere = false;
      try {
        voice.stopListening();
      } catch {
        // ignore
      }
    }
    try {
      await voice.resumeWakeWord();
    } catch {
      // ignore
    }
  }

  async function toggleVoiceInput() {
    if (isRecording.value) {
      await stopVoiceCapture();
      return;
    }

    isRecording.value = true;
    const isElectron = typeof window !== 'undefined' && Boolean((window as any).api);

    // 1. Suspend global WakeWord ("АРК") so global voice listener is silent during dictation
    voice.suspendWakeWord(!isElectron);

    if (isElectron) {
      try {
        if (!voice.isListening.value) {
          startedArcVoiceHere = true;
          await voice.startListening();
        }
      } catch {
        isRecording.value = false;
        await voice.resumeWakeWord();
      }
      return;
    }

    // 2. Web browser fallback (when not in Electron IPC mode): isolated SpeechRecognition with AudioWorklet paused
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRec();
        activeRecognition = recognition;
        recognition.lang = 'ru-RU';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          const spoken = Array.from(event.results)
            .map((r: any) => r[0]?.transcript || '')
            .join('');
          if (spoken) {
            onVoiceTranscript(spoken);
          }
        };

        recognition.onerror = () => {
          isRecording.value = false;
          voice.resumeWakeWord();
        };

        recognition.start();
      } catch {
        isRecording.value = false;
        await voice.resumeWakeWord();
        uiStore.showToast('Голосовой захват недоступен в текущем окружении', 'info', 2500);
      }
    } else {
      try {
        voice.suspendWakeWord(false);
        if (!voice.isListening.value) {
          startedArcVoiceHere = true;
          await voice.startListening();
        }
      } catch {
        isRecording.value = false;
        await voice.resumeWakeWord();
        uiStore.showToast('Голосовой захват недоступен в текущем окружении', 'info', 2500);
      }
    }
  }

  function getFileExt(name: string) {
    const ext = name.split('.').pop()?.toUpperCase();
    return ext && ext.length <= 4 ? ext : 'FILE';
  }

  function formatFileSize(bytes: number) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });

  const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  async function processSelectedFiles(fileList: FileList | File[]) {
    const newFiles = [...getFiles()];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file) continue;

      const attachment: FileAttachment = {
        name: file.name,
        size: file.size,
        type: file.type,
      };

      if (file.type.startsWith('image/')) {
        attachment.dataUrl = await readFileAsDataURL(file);
      } else if (file.size <= 2 * 1024 * 1024) {
        try {
          attachment.content = await readFileAsText(file);
        } catch (e) {
          console.warn('[A.R.C] Handled silent error:', e);
        }
      }
      newFiles.push(attachment);
    }
    updateFiles(newFiles);
  }

  function removeAttachedFile(index: number) {
    const newFiles = [...getFiles()];
    newFiles.splice(index, 1);
    updateFiles(newFiles);
  }

  return {
    isRecording,
    formattedRecordingTime,
    toggleVoiceInput,
    stopVoiceCapture,
    getFileExt,
    formatFileSize,
    processSelectedFiles,
    removeAttachedFile,
  };
}
