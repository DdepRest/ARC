<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../../../stores/ui.store';
import {
  computeTtsSubsystemStatus,
  type TtsEngineKind,
  type TtsServerStatusKind
} from '../../logic/voice-status';
import ArcToggle from '../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../components/ui/ArcSlider.vue';
import ArcSelect from '../../../../components/ui/ArcSelect.vue';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsGroup from '../primitives/SettingsGroup.vue';
import SettingsBlock from '../primitives/SettingsBlock.vue';
import SettingsRow from '../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../primitives/SettingsSummaryStrip.vue';
import CrossLink from '../primitives/CrossLink.vue';
import { Volume2, Square } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const presets = ref<{ id: string; name: string }[]>([]);
const currentTier = ref('Не проверен');
const confirmedActiveEngine = ref<TtsEngineKind | null>(null);
const sileroServerStatus = ref<TtsServerStatusKind>('unknown');
const isElectronMode = typeof window !== 'undefined' && Boolean((window as any).api);

const applyTtsEngineState = (state?: { provider?: string; activeEngine?: string | null } | null) => {
  if (!state) return;
  const eng = state.activeEngine;
  confirmedActiveEngine.value =
    eng === 'silero' || eng === 'edge' || eng === 'system' ? eng : null;
};

const checkSileroServer = async () => {
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (!api?.getTtsServerStatus) {
    sileroServerStatus.value = 'unknown';
    return;
  }
  sileroServerStatus.value = 'checking';
  try {
    const status = await api.getTtsServerStatus();
    sileroServerStatus.value = status?.online || status?.status === 'ready' ? 'online' : 'offline';
  } catch {
    sileroServerStatus.value = 'offline';
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

const onProviderValueChange = async (raw: string | number | boolean) => {
  const str = String(raw);
  const v = (!['auto', 'silero', 'edge', 'native'].includes(str) ? 'auto' : str) as 'auto' | 'silero' | 'edge' | 'native';
  settingsStore.ttsProvider = v;
  confirmedActiveEngine.value = null;
  if (typeof window !== 'undefined' && window.api?.setTtsProvider) {
    const state = await window.api.setTtsProvider(v);
    applyTtsEngineState(state);
    void checkSileroServer();
    if (v === 'silero' || v === 'auto') {
      setTimeout(() => { void fetchTtsPresets(); }, 1800);
    }
  }
};

const onSampleRateChange = (val: number | string | boolean) => {
  settingsStore.ttsSampleRate = Number(val) as 8000 | 24000 | 48000;
};

const restartServer = async () => {
  if (typeof window !== 'undefined' && window.api?.restartTtsServer) {
    sileroServerStatus.value = 'checking';
    confirmedActiveEngine.value = null;
    await window.api.restartTtsServer();
    await checkSileroServer();
    if (typeof window.api.getTtsActiveEngine === 'function') {
      const state = await window.api.getTtsActiveEngine();
      applyTtsEngineState(state);
    }
    await fetchTtsPresets();
  }
};

const voiceVolumePercent = computed({
  get: () => Math.round(settingsStore.voiceVolume <= 1 ? settingsStore.voiceVolume * 100 : settingsStore.voiceVolume),
  set: (val: number) => { settingsStore.voiceVolume = val / 100; }
});

const ttsStatus = computed(() =>
  computeTtsSubsystemStatus({
    configuredProvider: settingsStore.ttsProvider,
    sileroServerStatus: sileroServerStatus.value,
    confirmedActiveEngine: confirmedActiveEngine.value,
    isElectronAvailable: isElectronMode
  })
);

const serverDotClass = computed(() => {
  if (sileroServerStatus.value === 'online') return 'bg-[var(--status-ok)]';
  if (sileroServerStatus.value === 'offline') return 'bg-[var(--status-err)]';
  if (sileroServerStatus.value === 'checking') return 'bg-[var(--status-warn)]';
  return 'bg-[var(--arc-text-muted)]';
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Выбранный режим',
    value: ttsStatus.value.configuredDisplay,
    detail: ttsStatus.value.serverStatusLabel,
    tone: 'accent'
  },
  {
    label: 'Активный движок',
    value: ttsStatus.value.activeEngineLabel,
    detail: ttsStatus.value.activeEngineDetail,
    tone: ttsStatus.value.activeEngineTone
  },
  {
    label: 'Голосовой профиль',
    value: settingsStore.voicePresetId || 'aidar',
    detail: `${settingsStore.ttsSampleRate} Гц · ${currentTier.value}`,
    tone: 'default'
  },
  {
    label: 'Акустика тракта',
    value: `${voiceVolumePercent.value}% · ${settingsStore.ttsSpeed}x`,
    detail: `Тон: ${settingsStore.ttsPitch > 0 ? '+' : ''}${settingsStore.ttsPitch}%`,
    tone: voiceVolumePercent.value > 0 ? 'accent' : 'off'
  }
]);

let statsInterval: number;
let unsubscribeEngineChanged: (() => void) | null = null;

onMounted(async () => {
  if ((window as any).api) {
    try {
      await checkSileroServer();
      if (typeof window.api.getTtsActiveEngine === 'function') {
        const state = await window.api.getTtsActiveEngine();
        applyTtsEngineState(state);
      }
      if (typeof window.api.onTtsEngineChanged === 'function') {
        unsubscribeEngineChanged = window.api.onTtsEngineChanged((state) => {
          if (state?.provider && ['auto', 'silero', 'edge', 'native'].includes(state.provider)) {
            settingsStore.ttsProvider = state.provider;
          }
          applyTtsEngineState(state);
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
  <section id="section-tts" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Голос · Подсистема 02"
      title="Синтез речи (TTS)"
      description="Локальный движок генерации голоса Silero TTS v5.6, тембр звучания, правила произношения и профиль нагрузки."
      :statusLabel="ttsStatus.headerLabel"
      :statusTone="ttsStatus.headerTone"
      blockCountText="3 функциональные группы"
      :icon="Volume2"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <div id="section-tts-content" class="flex flex-col gap-8">
      <!-- Группа 01: Голосовой профиль и звучание -->
      <SettingsGroup
        indexLabel="01"
        title="Голосовой профиль и звучание"
        description="Выбор диктора, громкость, темп и частота дискретизации синтезатора."
        :badgeText="`${settingsStore.ttsSampleRate} Гц`"
      >
        <SettingsBlock>
          <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
            <SettingsRow
              id="tts.provider"
              data-setting-id="tts.provider"
              label="TTS-движок"
              description="Выбор базового движка синтеза речи (Auto / Silero / Edge / Native SAPI)."
              data-search="провайдер синтеза речи tts provider auto silero edge native sapi движок"
            >
              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <span class="px-2.5 py-1.5 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-well)] text-xs font-mono text-[var(--arc-text-muted)]">
                  Подтверждён: <strong class="text-[var(--arc-text-primary)]">{{ ttsStatus.activeEngineLabel }}</strong>
                </span>
                <div class="w-56 shrink-0">
                  <ArcSelect
                    :model-value="settingsStore.ttsProvider"
                    :options="[
                      { label: 'Auto (Silero → Edge → SAPI)', value: 'auto' },
                      { label: 'Silero TTS v5.6 (RU)', value: 'silero' },
                      { label: 'Edge TTS (Microsoft Neural)', value: 'edge' },
                      { label: 'Native SAPI / Системный', value: 'native' },
                      { label: 'Piper ONNX (Planned v1.1)', value: 'piper', disabled: true },
                      { label: 'Kokoro 82M (Planned v1.1)', value: 'kokoro', disabled: true }
                    ]"
                    @update:model-value="onProviderValueChange"
                  />
                </div>
              </div>
            </SettingsRow>

            <SettingsRow
              id="tts.preset"
              label="Голос диктора (Silero TTS)"
              description="Выберите тембр голоса и прослушайте контрольную фразу."
              data-search="голосовой профиль voice preset спикер speaker диктор"
            >
              <div class="flex items-center gap-2 shrink-0">
                <div class="w-52 shrink-0">
                  <ArcSelect
                    :model-value="settingsStore.voicePresetId"
                    :options="presets.length === 0
                      ? [{ label: `Стандартный профиль (${settingsStore.voicePresetId || 'aidar'})`, value: settingsStore.voicePresetId }]
                      : presets.map(v => ({ label: v.name, value: v.id }))"
                    @update:model-value="val => { settingsStore.voicePresetId = String(val); }"
                  />
                </div>
                <button
                  type="button"
                  @click="uiStore.speak('Синтез речи успешно настроен. A.R.C. готов к работе.', undefined, { force: true })"
                  title="Проверить голос"
                  class="px-3 py-2 flex items-center justify-center bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--accent)] border border-[var(--arc-hairline)] rounded-[8px] transition shrink-0 cursor-pointer text-xs font-mono font-semibold"
                >
                  ▶ Тест
                </button>
              </div>
            </SettingsRow>

            <div class="p-4 sm:p-5 flex flex-col gap-4 bg-[var(--arc-well)]">
              <div id="tts.volume" data-setting-id="tts.volume" data-search="громкость голоса tts volume синтез речи">
                <ArcSlider v-model="voiceVolumePercent" :min="0" :max="100" :step="1" unit="%" label="Громкость синтеза речи" :show-value="true" />
              </div>
              <div id="tts.speed" data-setting-id="tts.speed" class="pt-3 border-t border-[var(--arc-divider)]" data-search="скорость речи tts speed темп">
                <ArcSlider v-model="settingsStore.ttsSpeed" :min="0.5" :max="2.0" :step="0.05" unit="x" label="Скорость речи" :show-value="true" />
              </div>
              <div id="tts.pitch" data-setting-id="tts.pitch" class="pt-3 border-t border-[var(--arc-divider)]" data-search="тон голоса tts pitch высота">
                <ArcSlider v-model="settingsStore.ttsPitch" :min="-20" :max="20" :step="1" unit="%" label="Тон голоса (Pitch)" :show-value="true" />
              </div>
            </div>

            <SettingsRow
              id="tts.sample_rate"
              label="Частота дискретизации (Качество звука)"
              description="Более высокая частота обеспечивает чистый студийный тембр."
              data-search="качество звука частота дискретизации sample rate 48000"
            >
              <div class="w-36 shrink-0">
                <ArcSelect
                  :model-value="settingsStore.ttsSampleRate"
                  :options="[
                    { label: '8000 Гц', value: 8000 },
                    { label: '24000 Гц', value: 24000 },
                    { label: '48000 Гц', value: 48000 }
                  ]"
                  @update:model-value="onSampleRateChange"
                />
              </div>
            </SettingsRow>

            <SettingsRow
              id="tts.dsp"
              label="Аналоговый тембр (WebAudio DSP)"
              description="Дополнительная частотная фильтрация аудиопотока в браузере."
              data-search="эффект робота webaudio dsp фильтрация"
            >
              <ArcToggle v-model="settingsStore.voiceDspEnabled" />
            </SettingsRow>

            <div class="px-5 py-3.5 flex flex-col gap-3 bg-[var(--arc-well)]">
              <div v-if="uiStore.reactorState === 'speaking'" class="flex items-center justify-between gap-3 p-3 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
                <span class="text-xs font-mono font-semibold text-[var(--accent)] uppercase tracking-wider">Воспроизведение речи...</span>
                <button
                  type="button"
                  @click="stopVoice"
                  class="px-3 py-1.5 bg-[var(--arc-hover)] text-[var(--status-err)] border border-[var(--status-err)]/30 rounded-[8px] text-xs font-mono font-semibold uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <Square class="w-3.5 h-3.5" />
                  <span>Остановить</span>
                </button>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full" :class="serverDotClass"></span>
                  <span class="text-xs font-mono text-[var(--arc-text-muted)]">
                    {{ ttsStatus.serverStatusLabel }} · Уровень: <strong class="text-[var(--arc-text-primary)]">{{ currentTier }}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  @click="restartServer"
                  class="px-3 py-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-warn)] border border-[var(--arc-hairline)] rounded-[8px] text-xs font-mono uppercase font-semibold cursor-pointer transition"
                  title="Перезапустить фоновый сервер Silero TTS"
                >
                  Перезапустить сервер TTS
                </button>
              </div>
            </div>
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <!-- Группа 02: Правила русского языка и текста -->
      <SettingsGroup
        indexLabel="02"
        title="Правила русского языка и текста"
        description="Ударения, буква Ё, числительные и режим посимвольной диктовки кода."
        :badgeText="settingsStore.ttsPutAccent ? 'Ударения ВКЛ' : 'Базовый'"
      >
        <SettingsBlock>
          <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
            <SettingsRow id="tts.put_accent" label="Автоматическая расстановка ударений" description="Модель Silero автоматически проставляет ударения в русских словах." data-search="обработка ударений putaccent ударения">
              <ArcToggle v-model="settingsStore.ttsPutAccent" />
            </SettingsRow>
            <SettingsRow id="tts.put_yo" label="Автоматическая буква «Ё»" description="Восстанавливать букву «Ё» в словах перед генерацией звука." data-search="заменять е на ё putyo">
              <ArcToggle v-model="settingsStore.ttsPutYo" />
            </SettingsRow>
            <SettingsRow id="tts.ru_itn" label="Читать числа и даты словами (ITN)" description="Преобразование числительных, дат и сокращений в словесную форму." data-search="читать числа и даты словами itn числительные">
              <ArcToggle v-model="settingsStore.voiceRuITN" />
            </SettingsRow>
            <SettingsRow id="tts.raw_code" label="Посимвольная диктовка кода" description="Озвучивать фрагменты программного кода и спецсимволы дословно." data-search="озвучивание кода посимвольно raw code">
              <ArcToggle v-model="settingsStore.voiceRuRawCodeMode" />
            </SettingsRow>
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <!-- Группа 03: Профиль вычислительной нагрузки -->
      <SettingsGroup
        indexLabel="03"
        title="Профиль вычислительной нагрузки"
        description="Приоритет ресурсов синтеза речи и переход к управлению аудио-кэшем."
        :badgeText="settingsStore.voiceManualTier.toUpperCase()"
      >
        <SettingsBlock>
          <SettingsRow
            id="tts.manual_tier"
            label="Профиль вычислительной нагрузки"
            description="Баланс между качеством синтеза и экономией ресурсов процессора."
            data-search="профиль нагрузки адаптивный движок turbo auto eco"
          >
            <div class="flex gap-1 p-1 bg-[var(--arc-well)] rounded-[10px] border border-[var(--arc-hairline)] shrink-0">
              <button
                v-for="tier in ([{ id: 'turbo', label: 'Максимум' }, { id: 'auto', label: 'Авто' }, { id: 'eco', label: 'Экономия' }] as const)"
                :key="tier.id"
                type="button"
                @click="settingsStore.voiceManualTier = tier.id"
                class="px-3 py-1.5 rounded-[7px] text-xs font-mono font-semibold transition cursor-pointer"
                :class="settingsStore.voiceManualTier === tier.id
                  ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]'
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
              >
                {{ tier.label }}
              </button>
            </div>
          </SettingsRow>

          <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
            <CrossLink tab="system" sectionId="section-storage" label="Кэш синтеза и автоочистка (Хранилище)" />
            <CrossLink tab="voice" sectionId="section-audio" label="Калибровка микрофона и авто-озвучка" />
          </div>
        </SettingsBlock>
      </SettingsGroup>
    </div>
  </section>
</template>
