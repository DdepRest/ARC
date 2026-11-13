<template>
  <section id="section-audio" class="scroll-mt-14">
    <SettingsSectionHeader 
      :icon="Mic" 
      title="Голос и аудио" 
      :is-collapsed="collapsed.isCollapsed('section-audio')"
      @toggle="collapsed.toggleCollapsed('section-audio')"
    />
    <div v-show="!collapsed.isCollapsed('section-audio')" class="pb-6 mb-6 border-b border-white/5 ">
      
      <!-- === ОСНОВНЫЕ НАСТРОЙКИ === -->
      <div class="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
        <span class="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-text,#f87171)] font-bold">
          Основные параметры
        </span>
      </div>

      <!-- Voice Output Volume -->
      <div class="settings-row rounded-lg" data-setting-id="voice.volume" data-search="громкость volume голос синтез речи speech">
        <div class="flex flex-col max-w-md mb-1">
          <span class="settings-row-title">
            Громкость голоса
          </span>
          <span class="settings-row-desc">
            Настройка громкости синтезатора речи ИИ.
          </span>
        </div>
        <ArcSlider 
          v-model="voiceVolumePercent"
          :min="0" 
          :max="100" 
          :step="1"
          unit="%"
          :show-value="true"
        />
      </div>

      <!-- Auto Speak -->
      <div class="settings-row" data-search="автоматическая озвучка auto speak tts voice">
        <div class="flex justify-between items-center">
          <div class="flex flex-col max-w-md">
            <span class="settings-row-title text-white">Авто-озвучка ответов</span>
            <span class="settings-row-desc">
              Автоматически озвучивать входящие сообщения ИИ в чате
            </span>
          </div>
          <ArcToggle v-model="store.autoSpeak" />
        </div>
      </div>

      <!-- Microphone Live Test (3 seconds) -->
      <div class="settings-row" data-search="тест микрофона mic test проверка запись воспроизведение">
        <div class="flex flex-col gap-3 w-full">
          <div class="flex justify-between items-start">
            <div class="flex flex-col max-w-md">
              <span class="settings-row-title flex items-center gap-2">
                <span>Тест микрофона</span>
                <span 
                  v-if="micTest.phase.value === 'recording'" 
                  class="text-[9px] font-mono text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded animate-pulse"
                >
                  ● ЗАПИСЬ ({{ micTest.secondsRemaining.value }}c)
                </span>
                <span 
                  v-else-if="micTest.phase.value === 'playing'" 
                  class="text-[9px] font-mono text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded animate-pulse"
                >
                  ▶ ВОСПРОИЗВЕДЕНИЕ...
                </span>
              </span>
              <span class="settings-row-desc">
                Записывает 3 секунды звука с выбранного микрофона и сразу проигрывает для проверки качества.
              </span>
            </div>
            
            <button 
              v-if="!micTest.isTesting.value"
              @click="runMicTest"
              class="text-[11px] font-mono text-white flex items-center gap-1.5 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg border border-white/15 transition cursor-pointer shadow-sm active:scale-95 shrink-0"
            >
              <Mic class="w-3.5 h-3.5 text-[var(--accent-text,#f87171)]" />
              <span>🎙️ Тест (3 сек)</span>
            </button>
            <button 
              v-else
              @click="micTest.stopMicTest"
              class="text-[11px] font-mono text-rose-400 bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 rounded-lg border border-rose-500/30 transition cursor-pointer active:scale-95 shrink-0"
            >
              Остановить
            </button>
          </div>

          <!-- Active Mic Test Visual Feedback -->
          <transition name="fade">
            <div 
              v-if="micTest.isTesting.value" 
              class="p-3 bg-black/60 border border-white/10 rounded-xl flex items-center justify-between gap-4"
            >
              <div class="flex items-center gap-3">
                <div 
                  class="w-3 h-3 rounded-full animate-ping" 
                  :class="micTest.phase.value === 'recording' ? 'bg-rose-500' : 'bg-emerald-400'"
                ></div>
                <span class="text-xs font-mono text-white/90">
                  {{ micTest.phase.value === 'recording' ? `Говорите в микрофон... ${micTest.secondsRemaining.value}с` : 'Прослушивание записи...' }}
                </span>
              </div>

              <!-- RMS Bar -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono text-white/40">RMS:</span>
                <div class="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-[var(--accent-color,#ef4444)] transition duration-75"
                    :style="{ width: `${Math.min(100, Math.round(micTest.rmsLevel.value * 250))}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </transition>

          <p v-if="micTest.errorMessage.value" class="text-xs text-rose-400 font-mono">
            {{ micTest.errorMessage.value }}
          </p>
        </div>
      </div>

      <!-- === ПРОДВИНУТЫЕ ПАРАМЕТРЫ === -->
      <div 
        @click="showAdvancedGroup = !showAdvancedGroup"
        class="px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] border-t border-b border-white/5 flex items-center justify-between cursor-pointer transition-colors select-none"
      >
        <div class="flex items-center gap-2">
          <SlidersHorizontal class="w-3.5 h-3.5 text-[var(--accent-text,#f87171)]" />
          <span class="text-[10px] font-mono uppercase tracking-widest text-white/80 font-bold">
            Продвинутые параметры
          </span>
        </div>
        <ChevronDown 
          class="w-4 h-4 text-white/40 transition-transform duration-200" 
          :class="{ 'rotate-180': showAdvancedGroup }"
        />
      </div>

      <div v-show="showAdvancedGroup" class="flex flex-col divide-y divide-white/5 bg-black/20">
        <!-- STT Microphone Sensitivity Slider -->
        <div class="settings-row" data-search="vad чувствительность микрофона порог sensitivity">
          <div class="flex justify-between items-start">
            <div class="flex flex-col max-w-md">
              <span class="settings-row-title">
                Чувствительность микрофона (VAD)
              </span>
              <span class="settings-row-desc">
                Порог активации голоса. Слайдер влево увеличивает чувствительность.
              </span>
            </div>
            <button 
              @click="showAdvancedAudio = !showAdvancedAudio"
              class="text-[11px] font-mono text-[var(--accent-text,#f87171)] hover:text-white flex items-center gap-1 bg-[var(--accent-bg-alpha,rgba(239,68,68,0.2))] px-2.5 py-1 rounded-md border border-[var(--accent-border,rgba(239,68,68,0.3))] transition cursor-pointer"
            >
              <span>{{ showAdvancedAudio ? 'Скрыть RMS' : 'Детали RMS' }}</span>
            </button>
          </div>

          <!-- ArcSlider Component -->
          <ArcSlider 
            v-model="store.sttVolumeThreshold"
            :min="0.001" 
            :max="0.1" 
            :step="0.001"
            :show-value="true"
            class="mt-2"
          />

          <!-- Semantic Guidance Labels under slider -->
          <div class="flex justify-between text-[11px] font-medium text-white/50 pt-1">
            <span class="text-[var(--accent-text,#f87171)] flex items-center gap-1">
              <span>←</span>
              <span>Слышит всё (Высокая чувствительность)</span>
            </span>
            <span class="text-white/40 flex items-center gap-1">
              <span>Только громкий голос (Изоляция шума)</span>
              <span>→</span>
            </span>
          </div>

          <!-- Progressive Disclosure: Technical RMS Details -->
          <transition name="fade">
            <div v-if="showAdvancedAudio" class="mt-3 p-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white/70 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>CURRENT_RMS: <strong class="text-white">{{ (rmsLevel * 100).toFixed(1) }}%</strong></span>
              </div>
              <div>
                <span>VAD_THRESHOLD: <strong class="text-[var(--accent-text,#f87171)]">{{ Number(store.sttVolumeThreshold).toFixed(3) }}</strong></span>
              </div>
            </div>
          </transition>
        </div>

        <!-- Restart Voice Server -->
        <div class="settings-row" data-search="restart voice server tts reboot перезапуск сервер голос">
          <div class="flex justify-between items-center">
            <div class="flex flex-col max-w-md">
              <span class="settings-row-title">
                Перезапуск голосового сервера
              </span>
              <span class="settings-row-desc">
                Принудительно перезапускает процесс синтезатора речи (TTS)
              </span>
            </div>
            <button 
              @click="restartVoiceServer"
              :disabled="isRestartingVoice"
              class="text-[12px] font-medium text-white flex items-center gap-2 bg-[var(--accent-color,#ef4444)] px-3 py-1.5 rounded border border-transparent transition cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Activity class="w-4 h-4" :class="{'animate-spin': isRestartingVoice}" />
              <span>{{ isRestartingVoice ? 'Перезапуск...' : 'Перезапустить' }}</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useVoice } from '../../../../../composables/useVoice';
import { useCollapsedSections } from '../../../composables/useCollapsedSections';
import { useMicTest } from '../../../composables/useMicTest';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { Mic, SlidersHorizontal, Activity, ChevronDown } from 'lucide-vue-next';

const store = useSettingsStore();
const collapsed = useCollapsedSections();
const { rmsLevel } = useVoice();
const micTest = useMicTest();

const showAdvancedAudio = ref(false);
const showAdvancedGroup = ref(false);

const runMicTest = () => {
  micTest.startMicTest(store.sttSelectedMic);
};

const isRestartingVoice = ref(false);
const restartVoiceServer = async () => {
  if (isRestartingVoice.value) return;
  isRestartingVoice.value = true;
  try {
    if (window.api && window.api.restartTtsServer) {
        await window.api.restartTtsServer();
    }
  } catch (e) {
    console.error('Failed to restart voice server:', e);
  } finally {
    setTimeout(() => { isRestartingVoice.value = false; }, 2000);
  }
};

const voiceVolumePercent = computed({
  get: () => Math.round(store.voiceVolume <= 1 ? store.voiceVolume * 100 : store.voiceVolume),
  set: (val: number) => {
    store.voiceVolume = val / 100;
  }
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
