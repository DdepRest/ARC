<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../../../stores/ui.store';
import ArcToggle from '../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../components/ui/ArcSlider.vue';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsBlock from '../primitives/SettingsBlock.vue';
import SettingsRow from '../primitives/SettingsRow.vue';
import CrossLink from '../primitives/CrossLink.vue';
import { Volume2, Square } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const presets = ref<{id: string, name: string}[]>([]);
const currentTier = ref('Base');
const activeEngineLabel = ref<string>('не выбран (ожидание)');

const formatEngineName = (e: string | null | undefined): string => {
  if (!e) return 'не выбран (ожидание)';
  return ({ silero: 'Silero', edge: 'Edge', system: 'Native SAPI' } as const)[e as 'silero' | 'edge' | 'system'] ?? e;
};

const updateBadge = (state?: { provider?: string; activeEngine?: string | null } | null) => {
  if (!state) return;
  if (state.activeEngine) {
    activeEngineLabel.value = formatEngineName(state.activeEngine);
  } else if (state.provider === 'edge') {
    activeEngineLabel.value = 'Edge';
  } else if (state.provider === 'native') {
    activeEngineLabel.value = 'Native SAPI';
  } else if (state.provider === 'silero') {
    activeEngineLabel.value = 'Silero';
  } else {
    activeEngineLabel.value = formatEngineName(null);
  }
};

const fetchTtsPresets = async () => {
  try {
    if (typeof (window as any).api?.getTtsPresets === 'function') {
      const p = await (window as any).api.getTtsPresets();
      if (p && p.length) {
        presets.value = p;
        if (!p.some((item: any) => item.id === settingsStore.voicePresetId)) {
          settingsStore.voicePresetId = p[0].id;
        }
      }
    }
  } catch (e) { console.warn('Ignored error in catch', e); }
};

const onProviderChange = async (event: Event) => {
  const raw = (event.target as HTMLSelectElement).value;
  const v = (!['auto', 'silero', 'edge', 'native'].includes(raw) ? 'auto' : raw) as 'auto' | 'silero' | 'edge' | 'native';
  settingsStore.ttsProvider = v;
  if (typeof window !== 'undefined' && window.api?.setTtsProvider) {
    const state = await window.api.setTtsProvider(v);
    updateBadge(state);
    if (v === 'silero' || v === 'auto') {
      setTimeout(() => { void fetchTtsPresets(); }, 1800);
    }
  }
};

const restartServer = async () => {
  if (typeof window !== 'undefined' && window.api?.restartTtsServer) {
    await window.api.restartTtsServer();
    await fetchTtsPresets();
  }
};

const voiceVolumePercent = computed({
  get: () => Math.round(settingsStore.voiceVolume <= 1 ? settingsStore.voiceVolume * 100 : settingsStore.voiceVolume),
  set: (val: number) => { settingsStore.voiceVolume = val / 100; }
});

let statsInterval: number;
let unsubscribeEngineChanged: (() => void) | null = null;

onMounted(async () => {
  if ((window as any).api) {
    try {
      if (typeof window.api.getTtsActiveEngine === 'function') {
        const state = await window.api.getTtsActiveEngine();
        updateBadge(state);
        if (!state?.activeEngine && (!state?.provider || state.provider === 'auto' || state.provider === 'silero') && typeof (window as any).api.getTtsServerStatus === 'function') {
          const status = await (window as any).api.getTtsServerStatus();
          if (status?.online) activeEngineLabel.value = 'Silero';
        }
      }
      if (typeof window.api.onTtsEngineChanged === 'function') {
        unsubscribeEngineChanged = window.api.onTtsEngineChanged((state) => {
          if (state?.provider && ['auto', 'silero', 'edge', 'native'].includes(state.provider)) {
            settingsStore.ttsProvider = state.provider;
          }
          updateBadge(state);
        });
      }
    } catch (e) { console.warn('Ignored TTS engine state error', e); }

    await fetchTtsPresets();
    
    const refreshTier = async () => {
      try {
        if (typeof (window as any).api.getTtsTier === 'function') {
          const tier = await (window as any).api.getTtsTier();
          currentTier.value = tier === 'heavy' ? 'Base' : tier === 'medium' ? 'E2-TTS (Medium)' : tier === 'light' ? 'E2-TTS' : 'SAPI';
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
    };
    
    refreshTier();
    statsInterval = window.setInterval(refreshTier, 5000);
  }
});

onUnmounted(() => {
  unsubscribeEngineChanged?.();
  unsubscribeEngineChanged = null;
  if (statsInterval) clearInterval(statsInterval);
});

const stopVoice = () => {
  window.dispatchEvent(new CustomEvent('arc:stop-audio'));
};
</script>

<template>
  <section id="section-tts" class="scroll-mt-14 flex flex-col gap-5 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Синтез речи (TTS)" 
      description="Локальный движок генерации голоса Silero TTS v5.6, тембр звучания, правила произношения и кэш фраз."
      blockCountText="3 блока · локальный синтез"
      :icon="Volume2" 
    />

    <div id="section-tts-content" class="flex flex-col gap-5">
      <!-- Block 1: Voice Profile & Acoustics -->
      <SettingsBlock title="Голосовой профиль и звучание" subtitle="Выбор диктора, громкость, темп и частота дискретизации">
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <!-- TTS Provider Selection -->
          <SettingsRow
            id="tts.provider"
            data-setting-id="tts.provider"
            label="TTS-движок"
            description="Выбор базового движка синтеза речи (Auto / Silero / Edge / Native SAPI)."
            data-search="провайдер синтеза речи tts provider auto silero edge native sapi движок"
          >
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <span class="px-2.5 py-1.5 rounded-lg border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-xs font-mono text-[var(--arc-text-muted)]">
                Активный сейчас: <strong class="text-[var(--arc-text-primary)]">{{ activeEngineLabel }}</strong>
              </span>
              <select
                :value="settingsStore.ttsProvider"
                @change="onProviderChange"
                class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer hover:bg-[var(--arc-hover)] min-w-[180px]"
              >
                <option value="auto" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Auto (Silero → Edge → SAPI)</option>
                <option value="silero" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Silero TTS v5.6 (RU)</option>
                <option value="edge" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Edge TTS (Microsoft Neural)</option>
                <option value="native" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Native SAPI / Системный</option>
                <option value="piper" disabled class="bg-[var(--arc-block)] text-[var(--arc-text-muted)]">Piper ONNX (Planned v1.1)</option>
                <option value="kokoro" disabled class="bg-[var(--arc-block)] text-[var(--arc-text-muted)]">Kokoro 82M (Planned v1.1)</option>
              </select>
            </div>
          </SettingsRow>

          <!-- Speaker Selection -->
          <SettingsRow
            id="tts.preset"
            label="Голос диктора (Silero TTS)"
            description="Выберите тембр голоса и прослушайте контрольную фразу."
            data-search="голосовой профиль voice preset спикер speaker диктор"
          >
            <div class="flex items-center gap-2 shrink-0">
              <select 
                v-model="settingsStore.voicePresetId" 
                class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer hover:bg-[var(--arc-hover)] min-w-[180px]"
              >
                <option v-if="presets.length === 0" :value="settingsStore.voicePresetId" class="bg-[var(--arc-block)] text-white">
                  Стандартный профиль ({{ settingsStore.voicePresetId || 'aidar' }})
                </option>
                <option v-for="voice in presets" :key="voice.id" :value="voice.id" class="bg-[var(--arc-block)] text-white">
                  {{ voice.name }}
                </option>
              </select>
              <button 
                type="button"
                @click="uiStore.speak('Синтез речи успешно настроен. A.R.C. готов к работе.', undefined, { force: true })"
                title="Проверить голос"
                class="px-3 py-2 flex items-center justify-center bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--accent)] border border-[var(--arc-hairline)] rounded-lg transition shrink-0 cursor-pointer text-xs font-mono font-semibold"
              >
                ▶ Тест
              </button>
            </div>
          </SettingsRow>

          <!-- Sliders: Volume, Speed, Pitch -->
          <div class="p-4 sm:p-5 flex flex-col gap-4">
            <div id="tts.volume" data-setting-id="tts.volume" data-search="громкость голоса tts volume синтез речи">
              <ArcSlider 
                v-model="voiceVolumePercent"
                :min="0" :max="100" :step="1"
                unit="%" label="Громкость синтеза речи" :show-value="true"
              />
            </div>
            <div id="tts.speed" data-setting-id="tts.speed" class="pt-3 border-t border-[var(--arc-hairline)]" data-search="скорость речи tts speed темп">
              <ArcSlider 
                v-model="settingsStore.ttsSpeed"
                :min="0.5" :max="2.0" :step="0.05"
                unit="x" label="Скорость речи" :show-value="true"
              />
            </div>
            <div id="tts.pitch" data-setting-id="tts.pitch" class="pt-3 border-t border-[var(--arc-hairline)]" data-search="тон голоса tts pitch высота">
              <ArcSlider 
                v-model="settingsStore.ttsPitch"
                :min="-20" :max="20" :step="1"
                unit="%" label="Тон голоса (Pitch)" :show-value="true"
              />
            </div>
          </div>

          <!-- Sample Rate -->
          <SettingsRow
            id="tts.sample_rate"
            label="Частота дискретизации (Качество звука)"
            description="Более высокая частота обеспечивает чистый студийный тембр."
            data-search="качество звука частота дискретизации sample rate 48000"
          >
            <select 
              v-model="settingsStore.ttsSampleRate" 
              class="w-36 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer tabular-nums"
            >
              <option :value="8000">8000 Гц</option>
              <option :value="24000">24000 Гц</option>
              <option :value="48000">48000 Гц</option>
            </select>
          </SettingsRow>

          <!-- DSP Robot Effect -->
          <SettingsRow
            id="tts.dsp"
            label="Аналоговый тембр (WebAudio DSP)"
            description="Дополнительная частотная фильтрация аудиопотока в браузере."
            data-search="эффект робота webaudio dsp фильтрация"
          >
            <ArcToggle v-model="settingsStore.voiceDspEnabled" />
          </SettingsRow>

          <!-- Active playback / Server Restart Footer -->
          <div class="p-4 flex flex-col gap-3 bg-[var(--arc-plane)]/40">
            <div v-if="uiStore.reactorState === 'speaking'" class="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
              <span class="text-xs font-mono font-semibold text-[var(--accent)] uppercase tracking-wider">Воспроизведение речи...</span>
              <button 
                type="button"
                @click="stopVoice"
                class="px-3 py-1.5 bg-[var(--arc-hover)] text-[var(--status-err)] border border-[var(--status-err)]/30 rounded-lg text-xs font-mono font-semibold uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <Square class="w-3.5 h-3.5" />
                <span>Остановить</span>
              </button>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="currentTier !== 'SAPI' ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-warn)]'"></span>
                <span class="text-xs font-mono text-[var(--arc-text-muted)]">
                  Активный уровень: <strong class="text-[var(--arc-text-primary)]">{{ currentTier }}</strong>
                </span>
              </div>
              <button 
                type="button"
                @click="restartServer" 
                class="px-3 py-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-warn)] border border-[var(--arc-hairline)] rounded-lg text-xs font-mono uppercase font-semibold cursor-pointer transition"
                title="Перезапустить фоновый сервер Silero TTS"
              >
                Перезапустить сервер TTS
              </button>
            </div>
          </div>
        </div>
      </SettingsBlock>

      <!-- Block 2: Russian Language & Pronunciation Pipeline -->
      <SettingsBlock title="Правила русского языка и текста" subtitle="Ударения, буква Ё, числительные и чтение кода">
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <SettingsRow
            id="tts.put_accent"
            label="Автоматическая расстановка ударений"
            description="Модель Silero автоматически проставляет ударения в русских словах."
            data-search="обработка ударений putaccent ударения"
          >
            <ArcToggle v-model="settingsStore.ttsPutAccent" />
          </SettingsRow>

          <SettingsRow
            id="tts.put_yo"
            label="Автоматическая буква «Ё»"
            description="Восстанавливать букву «Ё» в словах перед генерацией звука."
            data-search="заменять е на ё putyo"
          >
            <ArcToggle v-model="settingsStore.ttsPutYo" />
          </SettingsRow>

          <SettingsRow
            id="tts.ru_itn"
            label="Читать числа и даты словами (ITN)"
            description="Преобразование числительных, дат и сокращений в словесную форму."
            data-search="читать числа и даты словами itn числительные"
          >
            <ArcToggle v-model="settingsStore.voiceRuITN" />
          </SettingsRow>

          <SettingsRow
            id="tts.raw_code"
            label="Посимвольная диктовка кода"
            description="Озвучивать фрагменты программного кода и спецсимволы дословно."
            data-search="озвучивание кода посимвольно raw code"
          >
            <ArcToggle v-model="settingsStore.voiceRuRawCodeMode" />
          </SettingsRow>
        </div>
      </SettingsBlock>

      <!-- Block 3: Adaptive Resource Profile -->
      <SettingsBlock title="Профиль вычислительной нагрузки" subtitle="Приоритет ресурсов синтеза речи">
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <!-- Adaptive Tier Selector -->
          <SettingsRow
            id="tts.manual_tier"
            label="Профиль вычислительной нагрузки"
            description="Баланс между качеством синтеза и экономией ресурсов процессора."
            data-search="профиль нагрузки адаптивный движок turbo auto eco"
          >
            <div class="flex gap-1 p-1 bg-[var(--arc-plane)] rounded-lg border border-[var(--arc-hairline)] shrink-0">
              <button
                v-for="tier in [
                  { id: 'turbo', label: 'Максимум' },
                  { id: 'auto', label: 'Авто' },
                  { id: 'eco', label: 'Экономия' }
                ] as const"
                :key="tier.id"
                type="button"
                @click="settingsStore.voiceManualTier = tier.id"
                class="px-3 py-1.5 rounded text-xs font-mono font-semibold transition cursor-pointer"
                :class="settingsStore.voiceManualTier === tier.id 
                  ? 'bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)]' 
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
              >
                {{ tier.label }}
              </button>
            </div>
          </SettingsRow>
        </div>

        <div class="px-4 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]/40">
          <CrossLink tab="system" sectionId="section-storage" label="Кэш синтеза и автоочистка (Хранилище)" />
          <CrossLink tab="voice" sectionId="section-audio" label="Калибровка микрофона и авто-озвучка" />
        </div>
      </SettingsBlock>
    </div>
  </section>
</template>
