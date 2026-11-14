<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useUIStore } from '../../../../../stores/ui.store';
import { useVoice } from '../../../../../composables/useVoice';
import { useMicTest } from '../../../composables/useMicTest';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import SttWakeWords from '../stt/SttWakeWords.vue';
import { Radio, Mic, MicOff } from 'lucide-vue-next';

const store = useSettingsStore();
const uiStore = useUIStore();
const { isListening, rmsLevel, startListening, stopListening, calibrateNoiseLevel } = useVoice();
const micTest = useMicTest();
const microphones = ref<InputDeviceInfo[]>([]);
const selectedMic = computed({
  get: () => store.sttSelectedMic,
  set: (val: string) => { store.sttSelectedMic = val; }
});
const passiveRms = ref(0);

let passiveAudioStream: MediaStream | null = null;
let passiveAudioCtx: AudioContext | null = null;
let passiveAnalyser: AnalyserNode | null = null;
let passiveAnimationId: number | null = null;

const initPassiveAudio = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    microphones.value = devices.filter(d => d.kind === 'audioinput') as InputDeviceInfo[];
    if (microphones.value.length > 0 && !selectedMic.value) {
      selectedMic.value = microphones.value[0].deviceId;
    }
    const constraints: MediaStreamConstraints = {
      audio: selectedMic.value ? { deviceId: { exact: selectedMic.value } } : true
    };
    passiveAudioStream = await navigator.mediaDevices.getUserMedia(constraints);
    passiveAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = passiveAudioCtx.createMediaStreamSource(passiveAudioStream);
    passiveAnalyser = passiveAudioCtx.createAnalyser();
    passiveAnalyser.fftSize = 64;
    source.connect(passiveAnalyser);
    const dataArray = new Uint8Array(passiveAnalyser.frequencyBinCount);

    const checkVolume = () => {
      if (!passiveAnalyser) return;
      passiveAnalyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      passiveRms.value = passiveRms.value * 0.4 + Math.sqrt(sum / dataArray.length) * 0.6;
      passiveAnimationId = requestAnimationFrame(checkVolume);
    };
    checkVolume();
  } catch {
    console.warn('VoiceAudioSection: Passive mic stream access unavailable.');
  }
};

const stopPassiveAudio = () => {
  if (passiveAnimationId) cancelAnimationFrame(passiveAnimationId);
  passiveAnimationId = null;
  if (passiveAudioStream) {
    passiveAudioStream.getTracks().forEach(t => t.stop());
    passiveAudioStream = null;
  }
  if (passiveAudioCtx && passiveAudioCtx.state !== 'closed') {
    try { passiveAudioCtx.close()?.catch(() => {}); } catch {}
    passiveAudioCtx = null;
  }
  passiveAnalyser = null;
};

const currentRms = computed(() => isListening.value ? Math.max(rmsLevel.value || 0, passiveRms.value) : passiveRms.value);

const visualRmsBars = computed(() => {
  const barsCount = 14;
  const activeBars = Math.min(barsCount, Math.round(currentRms.value * 35));
  return Array.from({ length: barsCount }, (_, i) => i < activeBars);
});

const toggleMicListening = async () => {
  if (isListening.value) {
    uiStore.setListening(false);
    stopListening();
  } else {
    uiStore.setListening(true);
    try { await startListening(); } catch (err) {
      console.error('Failed to start voice STT:', err);
      uiStore.setListening(false);
    }
  }
};

watch(selectedMic, () => { stopPassiveAudio(); initPassiveAudio(); });
onMounted(() => { initPassiveAudio(); });
onUnmounted(() => { stopPassiveAudio(); });

const runMicTest = () => { micTest.startMicTest(store.sttSelectedMic); };

const startCalibration = async () => {
  try {
    store.voiceCalibrationStatus = 'in_progress';
    if (typeof (window as any).api?.startCalibration === 'function') {
      await (window as any).api.startCalibration();
    }
    const finalThreshold = await calibrateNoiseLevel();
    uiStore.speak(`Калибровка завершена. Автоматический порог шума установлен на значение ${finalThreshold}.`);
  } catch (err) {
    console.error('Calibration failed:', err);
    uiStore.speak('Калибровка не удалась. Пожалуйста, убедитесь, что микрофон подключен.');
    store.voiceCalibrationStatus = 'absent';
  }
};
</script>

<template>
  <section id="section-audio" class="scroll-mt-14 flex flex-col gap-5 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Микрофон и активация" 
      description="Единый центр захвата звука: выбор микрофона, проверка тракта, калибровка шума VAD и ключевые фразы."
      blockCountText="3 блока · аудиовход и активация"
      :icon="Radio" 
    />

    <div class="flex flex-col gap-5">
      <!-- Block 1: Microphone Hardware & Live Test -->
      <SettingsBlock title="Устройство ввода и мониторинг" subtitle="Выбор физического микрофона и проверка записи">
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <!-- Live Mic Status & RMS Visualizer -->
          <div class="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <button 
                type="button"
                @click="toggleMicListening"
                class="w-11 h-11 rounded-xl flex items-center justify-center transition duration-200 cursor-pointer shrink-0 border bg-[var(--arc-plane)]"
                :class="isListening ? 'border-[var(--status-ok)]/40 text-[var(--status-ok)]' : 'border-[var(--status-err)]/30 text-[var(--status-err)]'"
                :title="isListening ? 'Выключить микрофон' : 'Включить микрофон'"
              >
                <Mic v-if="isListening" class="w-5 h-5" />
                <MicOff v-else class="w-5 h-5 opacity-75" />
              </button>
              
              <div class="flex flex-col gap-1">
                <span class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">Активный канал захвата</span>
                <span class="text-xs font-mono tracking-wider uppercase" :class="isListening ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'">
                  {{ isListening ? 'АКТИВЕН · СЛУШАЕТ' : 'ОЖИДАНИЕ · МИКРОФОН ОТКЛЮЧЕН' }}
                </span>
              </div>
            </div>

            <!-- Live spectrum visualizer -->
            <div 
              class="flex items-end gap-1 h-8 px-3 bg-[var(--arc-plane)] rounded-lg border border-[var(--arc-hairline)] select-none"
              title="Индикатор уровня входного аудиосигнала (RMS)"
            >
              <span 
                v-for="(active, index) in visualRmsBars" 
                :key="index"
                class="w-1 rounded-full transition duration-150"
                :class="[
                  active ? 'bg-[var(--accent)]' : 'bg-[var(--arc-hover)]',
                  index % 3 === 0 ? 'h-4' : index % 2 === 0 ? 'h-5' : 'h-3'
                ]"
                :style="active && isListening ? { transform: `scaleY(${1.15 + (index % 3) * 0.12})` } : {}"
              ></span>
            </div>
          </div>

          <!-- Microphone Device Selection -->
          <SettingsRow
            v-if="microphones.length > 0"
            id="voice.mic_device"
            label="Устройство захвата звука"
            description="Выберите системный микрофон для голосового управления."
            data-search="микрофон устройство ввода audio input microphone"
          >
            <div class="w-60 sm:w-72 shrink-0">
              <ArcSelect
                :model-value="selectedMic"
                :options="microphones.map(mic => ({ label: mic.label || `Микрофон (${mic.deviceId.slice(0, 6)}...)`, value: mic.deviceId }))"
                @update:model-value="val => { selectedMic = val; }"
              />
            </div>
          </SettingsRow>

          <!-- Microphone Live Test (3 sec) -->
          <SettingsRow
            id="voice.mictest"
            label="Тест микрофона (3 сек)"
            description="Записывает 3 секунды звука и воспроизводит для проверки чистоты тракта."
            data-search="тест микрофона mic test проверка запись воспроизведение"
          >
            <div class="flex items-center gap-2 shrink-0">
              <button 
                v-if="!micTest.isTesting.value"
                type="button"
                @click="runMicTest"
                class="px-3.5 py-1.5 text-xs font-mono font-semibold rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Mic class="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Запустить тест</span>
              </button>
              <button 
                v-else
                type="button"
                @click="micTest.stopMicTest"
                class="px-3.5 py-1.5 text-xs font-mono font-semibold rounded-lg bg-[var(--arc-plane)] text-[var(--status-err)] border border-[var(--status-err)]/30 hover:bg-[var(--arc-hover)] transition-colors cursor-pointer"
              >
                Остановить
              </button>
            </div>
          </SettingsRow>

          <!-- Live Mic Test Result Bar if active -->
          <div v-if="micTest.isTesting.value" class="p-3.5 mx-4 my-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-xl flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="w-2.5 h-2.5 rounded-full" :class="micTest.phase.value === 'recording' ? 'bg-[var(--status-err)]' : 'bg-[var(--status-ok)]'"></div>
              <span class="text-xs font-mono text-[var(--arc-text-primary)] tabular-nums">
                {{ micTest.phase.value === 'recording' ? `Говорите в микрофон... ${micTest.secondsRemaining.value} с` : 'Прослушивание записи...' }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs font-mono text-[var(--arc-text-muted)]">Уровень:</span>
              <div class="w-24 h-1.5 bg-[var(--arc-block)] rounded-full overflow-hidden border border-[var(--arc-hairline)]">
                <div class="h-full bg-[var(--accent)] transition duration-75" :style="{ width: `${Math.min(100, Math.round(micTest.rmsLevel.value * 250))}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </SettingsBlock>

      <!-- Block 2: VAD Sensitivity & Noise Calibration -->
      <SettingsBlock title="Калибровка шума и порог VAD" subtitle="Отсечение фонового шума и чувствительность детектора речи">
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <SettingsRow
            id="voice.calibration"
            label="Автоматическая калибровка фонового шума"
            description="Измеряет тишину в помещении и автоматически вычисляет оптимальный порог срабатывания микрофона."
            data-search="калибровка шума микрофона voice calibration порог тишины"
          >
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs font-mono tracking-wider uppercase" :class="store.voiceCalibrationStatus === 'ready' ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">
                {{ store.voiceCalibrationStatus === 'ready' ? 'Синхронизировано' : 'Не откалибровано' }}
              </span>
              <button 
                type="button"
                @click="startCalibration" 
                class="px-3.5 py-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] text-xs font-mono font-semibold uppercase rounded-lg border border-[var(--arc-hairline)] transition cursor-pointer whitespace-nowrap"
              >
                {{ store.voiceCalibrationStatus === 'ready' ? 'Перекалибровать' : 'Калибровать' }}
              </button>
            </div>
          </SettingsRow>

          <div class="p-4 sm:p-5 flex flex-col gap-2" data-setting-id="settings.stt.vad_sensitivity" data-search="порог срабатывания vad threshold чувствительность микрофона">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-sans font-medium text-[var(--arc-text-primary)]">Порог чувствительности захвата речи (VAD)</span>
              <span class="text-xs font-mono text-[var(--arc-text-muted)]">Voice Activity Detection</span>
            </div>
            <ArcSlider v-model="store.sttVolumeThreshold" :min="0.001" :max="0.1" :step="0.001" :show-value="true" />
            <div class="flex justify-between text-xs font-mono text-[var(--arc-text-hint)] mt-1">
              <span>Высокая чувствительность (тихий голос)</span>
              <span>Низкая чувствительность (только громкий голос)</span>
            </div>
          </div>

          <SettingsRow
            id="voice.noise_reduction"
            label="Фильтрация фонового шума (RNNoise)"
            description="Автоматическая очистка аудиосигнала от бытовых шумов и пауз перед распознаванием."
            data-search="шумоподавление noise reduction rnnoise фильтрация шума"
          >
            <ArcToggle v-model="store.sttNoiseReduction" />
          </SettingsRow>
        </div>
      </SettingsBlock>

      <!-- Block 3: Wake Words & Voice Interaction -->
      <SettingsBlock title="Голосовая активация и диалог" subtitle="Ключевые фразы вызова A.R.C. и озвучка ответов">
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <SettingsRow
            id="voice.wakewords_toggle"
            label="Активация по ключевым фразам (Wake Words)"
            description="Режим постоянного ожидания вызова A.R.C. по кодовым словам."
            data-search="кодовые слова wake words активация голосом алекс джарвис"
          >
            <ArcToggle v-model="store.sttKeywordsEnabled" />
          </SettingsRow>

          <SttWakeWords />

          <SettingsRow 
            id="voice.auto_duck_music"
            data-setting-id="voice.auto_duck_music"
            label="Автоприглушение музыки при диалоге (Audio Ducking)"
            description="Автоматически снижать громкость музыки при обращении к АРК и во время диалога."
            data-search="приглушение музыки автоприглушение audio ducking громкость фон"
          >
            <ArcToggle v-model="store.autoDuckMusic" />
          </SettingsRow>

          <!-- Audio Ducking Level Slider -->
          <div 
            v-if="store.autoDuckMusic"
            class="p-4 sm:p-5 flex flex-col gap-2 bg-[var(--arc-plane)]/30" 
            data-setting-id="voice.audio_ducking_level" 
            data-search="степень приглушения коэффициент ducking audio ducking громкость музыки"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-sans font-medium text-[var(--arc-text-primary)]">Степень снижения громкости фона (Ducking)</span>
              <span class="text-xs font-mono text-[var(--arc-text-muted)]">Уменьшение на {{ store.audioDuckingPercentage }}% от текущей громкости</span>
            </div>
            <ArcSlider v-model="store.audioDuckingPercentage" :min="30" :max="90" :step="5" unit="%" :show-value="true" />
            <div class="flex justify-between text-xs font-mono text-[var(--arc-text-hint)] mt-0.5">
              <span>Мягкое (-30%)</span>
              <span>Стандарт (-70%)</span>
              <span>Глубокое (-90%)</span>
            </div>
          </div>

          <SettingsRow 
            id="voice.autospeak"
            label="Авто-озвучка ответов ассистента"
            description="Автоматически озвучивать входящие текстовые ответы ИИ в диалоге."
            data-search="автоматическая озвучка auto speak tts voice"
          >
            <ArcToggle v-model="store.autoSpeak" />
          </SettingsRow>
        </div>

        <div class="px-4 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]/40">
          <CrossLink tab="voice" sectionId="section-stt" label="Движок распознавания речи (STT)" />
          <CrossLink tab="voice" sectionId="section-tts" label="Голос диктора и громкость (TTS)" />
        </div>
      </SettingsBlock>
    </div>
  </section>
</template>
