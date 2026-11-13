<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '../../../features/settings/stores/settings.store';
import { useUIStore } from '../../../stores/ui.store';

const settingsStore = useSettingsStore();
const uiStore = useUIStore();

const audioDevices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref(settingsStore.sttSelectedMic || '');
const isDropdownOpen = ref(false);
const wakeWordEnabled = ref(settingsStore.sttKeywordsEnabled);

// Mic Level Testing (12 segments)
const TOTAL_SEGMENTS = 12;
const isTestingMic = ref(false);
const micRmsLevel = ref(0);
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let rafId: number | null = null;

// TTS Test
const isTestingTts = ref(false);
const hasTestedTts = ref(false);

const activeSegmentsCount = computed(() => {
  if (!isTestingMic.value || micRmsLevel.value <= 0) return 0;
  return Math.min(
    TOTAL_SEGMENTS,
    Math.max(1, Math.round((micRmsLevel.value / 100) * TOTAL_SEGMENTS))
  );
});

const selectedDeviceLabel = computed(() => {
  if (audioDevices.value.length === 0) {
    return 'Микрофон по умолчанию (система)';
  }
  const found = audioDevices.value.find(d => d.deviceId === selectedDeviceId.value);
  if (found) {
    return found.label || `Устройство ввода ${found.deviceId.slice(0, 8)}`;
  }
  const first = audioDevices.value[0];
  return first?.label || 'Микрофон по умолчанию (система)';
});

onMounted(async () => {
  await updateAudioDevices();
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', updateAudioDevices);
  }
});

onBeforeUnmount(() => {
  stopMicTest();
  if (navigator.mediaDevices?.removeEventListener) {
    navigator.mediaDevices.removeEventListener('devicechange', updateAudioDevices);
  }
});

async function updateAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioDevices.value = devices.filter(d => d.kind === 'audioinput');
    if (!selectedDeviceId.value && audioDevices.value.length > 0) {
      selectedDeviceId.value = audioDevices.value[0].deviceId;
      settingsStore.sttSelectedMic = selectedDeviceId.value;
    }
  } catch (err) {
    console.warn('Failed to enumerate audio devices:', err);
  }
}

function selectDevice(deviceId: string) {
  selectedDeviceId.value = deviceId;
  settingsStore.sttSelectedMic = deviceId;
  isDropdownOpen.value = false;
  if (isTestingMic.value) {
    stopMicTest();
    void startMicTest();
  }
}

async function toggleMicTest() {
  if (isTestingMic.value) {
    stopMicTest();
  } else {
    await startMicTest();
  }
}

async function startMicTest() {
  try {
    const constraints: MediaStreamConstraints = {
      audio: selectedDeviceId.value ? { deviceId: { exact: selectedDeviceId.value } } : true,
      video: false
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    isTestingMic.value = true;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateRms = () => {
      if (!isTestingMic.value || !analyser) return;
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      micRmsLevel.value = Math.min(100, Math.round(rms * 250));

      rafId = requestAnimationFrame(updateRms);
    };

    rafId = requestAnimationFrame(updateRms);
  } catch (err) {
    console.error('Mic access error:', err);
    stopMicTest();
  }
}

function stopMicTest() {
  isTestingMic.value = false;
  micRmsLevel.value = 0;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

function setWakeWordState(enabled: boolean) {
  wakeWordEnabled.value = enabled;
  settingsStore.sttKeywordsEnabled = enabled;
}

async function runTtsTest() {
  isTestingTts.value = true;
  try {
    const testPhrase = 'Голосовой контур A.R.C. синхронизирован.';
    void uiStore.speak(testPhrase, undefined, { force: true });
    hasTestedTts.value = true;
  } catch (err) {
    console.warn('TTS test playback error:', err);
  } finally {
    setTimeout(() => {
      isTestingTts.value = false;
    }, 1200);
  }
}

defineExpose({
  saveCurrentState: () => {
    stopMicTest();
    settingsStore.sttSelectedMic = selectedDeviceId.value;
    settingsStore.sttKeywordsEnabled = wakeWordEnabled.value;
  }
});
</script>

<template>
  <div class="space-y-4">
    <!-- Microphone Selector & 12-Segment RMS Meter -->
    <div class="p-4 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] space-y-4">
      <!-- Custom Microphone Dropdown -->
      <div class="space-y-1.5 relative">
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-secondary)]">
            КАНАЛ ЗАХВАТА (МИКРОФОН)
          </span>
          <span class="font-mono text-xs text-[var(--arc-text-muted)]">
            {{ audioDevices.length > 0 ? `${audioDevices.length} устр.` : 'системный' }}
          </span>
        </div>

        <button
          type="button"
          @click="isDropdownOpen = !isDropdownOpen"
          class="w-full px-3.5 py-2.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-input)] hover:border-[var(--accent)] flex items-center justify-between gap-3 cursor-pointer text-left transition-colors"
        >
          <span class="font-mono text-xs text-[var(--arc-text-primary)] truncate">
            {{ selectedDeviceLabel }}
          </span>
          <span class="font-mono text-xs text-[var(--arc-text-muted)] shrink-0">
            {{ isDropdownOpen ? '▲' : '▼' }}
          </span>
        </button>

        <div
          v-if="isDropdownOpen"
          class="mt-1 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-popover)] overflow-hidden divide-y divide-[var(--arc-divider)]"
        >
          <div
            v-if="audioDevices.length === 0"
            @click="selectDevice('')"
            class="px-3.5 py-2 font-mono text-xs text-[var(--arc-text-primary)] bg-[var(--arc-selected)] cursor-pointer"
          >
            Микрофон по умолчанию (система)
          </div>
          <div
            v-for="device in audioDevices"
            :key="device.deviceId"
            @click="selectDevice(device.deviceId)"
            class="px-3.5 py-2 font-mono text-xs cursor-pointer transition-colors flex items-center justify-between gap-2"
            :class="device.deviceId === selectedDeviceId
              ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)]'
              : 'text-[var(--arc-text-secondary)] hover:bg-[var(--arc-hover)] hover:text-[var(--arc-text-primary)]'"
          >
            <span class="truncate">
              {{ device.label || `Устройство ввода ${device.deviceId.slice(0, 8)}` }}
            </span>
            <span
              v-if="device.deviceId === selectedDeviceId"
              class="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0"
            ></span>
          </div>
        </div>
      </div>

      <!-- 12-Segment RMS Scale -->
      <div class="space-y-2 pt-1">
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-secondary)]">
            УРОВЕНЬ СИГНАЛА (RMS)
          </span>
          <button
            type="button"
            @click="toggleMicTest"
            class="px-3 py-1 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] font-mono text-xs text-[var(--arc-text-primary)] cursor-pointer transition-colors"
          >
            {{ isTestingMic ? 'Остановить замер' : 'Тест микрофона' }}
          </button>
        </div>

        <!-- 12 Segments in a Row -->
        <div class="grid grid-cols-12 gap-1.5 p-2 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
          <div
            v-for="seg in TOTAL_SEGMENTS"
            :key="seg"
            class="h-3.5 rounded-[3px] transition-colors duration-75"
            :class="seg <= activeSegmentsCount ? 'bg-[var(--accent)]' : 'bg-[var(--arc-rail)]'"
          ></div>
        </div>

        <!-- Edge dB Labels -->
        <div class="flex items-center justify-between font-mono text-xs text-[var(--arc-text-muted)]">
          <span>−60 dB</span>
          <span>0 dB</span>
        </div>
      </div>
    </div>

    <!-- Activation Keyword Toggle (Two States with Mono Labels) -->
    <div class="p-4 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] flex items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-primary)]">
          ГОЛОСОВАЯ АКТИВАЦИЯ «A.R.C.»
        </div>
        <p class="text-xs text-[var(--arc-text-secondary)]">
          Дежурный контур распознавания ключевого слова без нажатия клавиш
        </p>
      </div>

      <div
        class="inline-flex rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] p-0.5 shrink-0"
        role="group"
        aria-label="Голосовая активация"
      >
        <button
          type="button"
          @click="setWakeWordState(false)"
          class="px-3 py-1 rounded-[8px] font-mono text-xs cursor-pointer transition-colors"
          :class="!wakeWordEnabled
            ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]'
            : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-secondary)]'"
        >
          ВЫКЛ
        </button>
        <button
          type="button"
          @click="setWakeWordState(true)"
          class="px-3 py-1 rounded-[8px] font-mono text-xs cursor-pointer transition-colors"
          :class="wakeWordEnabled
            ? 'bg-[var(--accent)] text-white font-semibold'
            : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-secondary)]'"
        >
          ВКЛ
        </button>
      </div>
    </div>

    <!-- TTS Voice Verification -->
    <div class="p-4 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] flex items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-primary)]">
          РЕЧЕВОЙ СИНТЕЗАТОР ЯДРА
        </div>
        <p class="text-xs text-[var(--arc-text-secondary)]">
          Контрольная фраза через аудио-тракт (Silero TTS / системный синтез)
        </p>
      </div>

      <button
        type="button"
        @click="runTtsTest"
        :disabled="isTestingTts"
        class="px-4 py-1.5 rounded-[10px] font-mono text-xs cursor-pointer transition-colors shrink-0 disabled:opacity-50"
        :class="!hasTestedTts
          ? 'bg-[var(--accent)] text-white font-semibold border border-[rgba(var(--accent-rgb),0.5)] shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)] hover:opacity-90'
          : 'border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'"
      >
        {{ isTestingTts ? 'Синтез...' : 'Проверить голос' }}
      </button>
    </div>
  </div>
</template>
