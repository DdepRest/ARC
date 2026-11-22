<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '../../../features/settings/stores/settings.store';
import { syncVoiceModeWithMain, flushVoiceSetupCardSync } from '../utils/wizard-save';
import {
  formatVoiceBytes as formatBytes,
  formatVoiceSpeed as formatSpeed,
  formatVoiceStateLabel as stateLabel,
  voiceStateColorClass as stateColorClass,
  type VoiceHealthState,
  type VoiceSetupChoiceMode,
  type VoiceStatusSnapshot
} from '../utils/voice-setup-format';

const emit = defineEmits<{
  (e: 'mode-changed', mode: VoiceSetupChoiceMode): void;
}>();

const settingsStore = useSettingsStore();
const selectedMode = ref<VoiceSetupChoiceMode>('later');
const includeWhisper = ref(false);
const includeGigaam = ref(false);
const status = ref<VoiceStatusSnapshot>({
  overallState: 'model_missing',
  mode: 'later',
  inProgress: false,
  isPaused: false,
  activeComponentId: null,
  bytesDone: 0,
  totalBytes: 0,
  speedBps: 0,
  etaSeconds: null,
  error: null,
  totalKnownDownloadBytes: 242428339,
  totalKnownDiskRequiredBytes: 484856678,
  hasUnknownSizeComponent: true,
  components: []
});

let unsubscribeProgress: (() => void) | null = null;
let pendingModeSync: Promise<string | null> | null = null;
let lastModeSyncError: string | null = null;
let hasSyncedMode = false;

const baselineComponents = computed(() => status.value.components.filter(c => c.tier === 'baseline'));
const optionalComponents = computed(() => status.value.components.filter(c => c.tier === 'optional'));

const progressPercent = computed(() => {
  if (status.value.totalBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((status.value.bytesDone / status.value.totalBytes) * 100)));
});

const formattedEta = computed(() => {
  const sec = status.value.etaSeconds;
  if (sec === null || sec === undefined || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

async function refreshStatus() {
  try {
    if (window.api?.getVoiceSetupStatus) {
      const snap = await window.api.getVoiceSetupStatus({
        includeWhisper: includeWhisper.value,
        includeGigaam: includeGigaam.value,
        includeTts: true
      });
      if (snap) {
        status.value = snap;
        selectedMode.value = snap.mode || selectedMode.value;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch voice setup status:', err);
  }
}

async function selectMode(mode: VoiceSetupChoiceMode) {
  selectedMode.value = mode;
  if (mode === 'system_fallback') {
    settingsStore.ttsProvider = 'native';
    settingsStore.sttKeywordsEnabled = false;
  }
  const syncTask = syncVoiceModeWithMain(mode, (snap) => { if (snap) status.value = snap; });
  pendingModeSync = syncTask;
  lastModeSyncError = await syncTask;
  hasSyncedMode = lastModeSyncError === null;
  if (pendingModeSync === syncTask) pendingModeSync = null;
  emit('mode-changed', mode);
}

async function handleStartOrRetry() {
  if (status.value.inProgress) return;
  selectedMode.value = 'setup_now';
  try {
    if (window.api?.startVoiceSetup) {
      const snap = await window.api.startVoiceSetup({
        includeWhisper: includeWhisper.value,
        includeGigaam: includeGigaam.value,
        includeTts: true
      });
      if (snap) status.value = snap;
    }
  } catch (err) {
    console.warn('Voice setup start error:', err);
  }
}

async function handlePause() {
  try {
    if (window.api?.pauseVoiceSetup) {
      const snap = await window.api.pauseVoiceSetup();
      if (snap) status.value = snap;
    }
  } catch (err) {
    console.warn('Voice setup pause error:', err);
  }
}

async function handleCancel() {
  try {
    if (window.api?.cancelVoiceSetup) {
      const snap = await window.api.cancelVoiceSetup();
      if (snap) status.value = snap;
    }
  } catch (err) {
    console.warn('Voice setup cancel error:', err);
  }
}

onMounted(async () => {
  await refreshStatus();
  if (window.api?.onVoiceSetupProgress) {
    unsubscribeProgress = window.api.onVoiceSetupProgress((snap: VoiceStatusSnapshot) => {
      if (snap) status.value = snap;
    });
  }
});

onBeforeUnmount(() => {
  if (unsubscribeProgress) {
    unsubscribeProgress();
    unsubscribeProgress = null;
  }
});

defineExpose({
  saveCurrentState: () => flushVoiceSetupCardSync({
    mode: selectedMode.value,
    pendingSync: pendingModeSync,
    lastSyncError: lastModeSyncError,
    hasSyncedMode,
    onSnapshot: (snap) => { if (snap) status.value = snap; }
  })
});
</script>

<template>
  <div class="p-4 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] space-y-3.5">
    <!-- Header + Honest Overall Health Badge -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="space-y-0.5">
        <div class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-primary)]">
          РЕЖИМ ИНИЦИАЛИЗАЦИИ ГОЛОСА
        </div>
        <p class="text-xs text-[var(--arc-text-secondary)]">
          Тяжёлые модели и Python-окружение не скачиваются без вашего явного решения
        </p>
      </div>
      <span
        id="voice-setup-overall-state"
        class="px-2.5 py-1 rounded-[8px] border bg-[var(--arc-plane)] font-mono text-xs"
        :class="stateColorClass(status.overallState)"
      >
        {{ stateLabel(status.overallState) }}
      </span>
    </div>

    <!-- 3 Explicit Onboarding Choices -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
      <button
        id="btn-voice-mode-setup-now"
        type="button"
        @click="selectMode('setup_now')"
        class="p-2.5 rounded-[10px] border text-left transition-colors cursor-pointer space-y-1"
        :class="selectedMode === 'setup_now'
          ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]'
          : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:bg-[var(--arc-hover)]'"
      >
        <div class="font-mono text-xs font-semibold text-[var(--arc-text-primary)]">Настроить голос сейчас</div>
        <div class="text-xs text-[var(--arc-text-muted)]">Скачать и проверить локальные модели STT/TTS</div>
      </button>

      <button
        id="btn-voice-mode-later"
        type="button"
        @click="selectMode('later')"
        class="p-2.5 rounded-[10px] border text-left transition-colors cursor-pointer space-y-1"
        :class="selectedMode === 'later'
          ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]'
          : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:bg-[var(--arc-hover)]'"
      >
        <div class="font-mono text-xs font-semibold text-[var(--arc-text-primary)]">Позже</div>
        <div class="text-xs text-[var(--arc-text-muted)]">Не качать модели при старте, настроить из Настроек</div>
      </button>

      <button
        id="btn-voice-mode-fallback"
        type="button"
        @click="selectMode('system_fallback')"
        class="p-2.5 rounded-[10px] border text-left transition-colors cursor-pointer space-y-1"
        :class="selectedMode === 'system_fallback'
          ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]'
          : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:bg-[var(--arc-hover)]'"
      >
        <div class="font-mono text-xs font-semibold text-[var(--arc-text-primary)]">Продолжить без голоса / системный fallback</div>
        <div class="text-xs text-[var(--arc-text-muted)]">Локальный SAPI без скачивания нейросетей</div>
      </button>
    </div>

    <!-- Component Inventory & Controls -->
    <div v-if="selectedMode === 'setup_now' || status.inProgress" class="space-y-3 pt-1">
      <!-- Baseline Mandatory Components -->
      <div class="p-3 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] space-y-2">
        <div class="flex items-center justify-between font-mono text-xs text-[var(--arc-text-secondary)]">
          <span>БАЗОВЫЙ КОНТУР (МИНИМАЛЬНЫЙ НАБОР)</span>
          <span>Сеть: {{ baselineComponents.some(c => c.networkRequired) ? 'требуется' : 'не требуется' }}</span>
        </div>
        <div v-for="comp in baselineComponents" :key="comp.id" class="p-2 rounded-[8px] bg-[var(--arc-rail)] border border-[var(--arc-hairline)] flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs text-[var(--arc-text-primary)]">{{ comp.title }}</span>
            <span class="font-mono text-xs px-2 py-0.5 rounded border" :class="stateColorClass(comp.state)">
              {{ comp.state }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 flex-wrap font-mono text-xs text-[var(--arc-text-muted)]">
            <span>Источник: {{ comp.source }}</span>
            <span>Размер: {{ comp.sizeLabel }} · Диск: {{ formatBytes(comp.diskRequiredBytes) }}</span>
          </div>
        </div>
      </div>

      <!-- Optional Enhanced STT Models -->
      <div class="p-3 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] space-y-2">
        <div class="font-mono text-xs text-[var(--arc-text-secondary)]">
          ОПЦИОНАЛЬНЫЕ МОДЕЛИ ПОВЫШЕННОЙ ТОЧНОСТИ
        </div>
        <div v-for="comp in optionalComponents" :key="comp.id" class="p-2 rounded-[8px] bg-[var(--arc-rail)] border border-[var(--arc-hairline)] flex flex-col gap-1">
          <label class="flex items-center justify-between gap-2 cursor-pointer">
            <span class="flex items-center gap-2 font-mono text-xs text-[var(--arc-text-primary)]">
              <input
                v-if="comp.id === 'whisper-small'"
                v-model="includeWhisper"
                type="checkbox"
                @change="refreshStatus"
                class="accent-[var(--accent)]"
              />
              <input
                v-else-if="comp.id === 'gigaam-ctc'"
                v-model="includeGigaam"
                type="checkbox"
                @change="refreshStatus"
                class="accent-[var(--accent)]"
              />
              <span>{{ comp.title }}</span>
            </span>
            <span class="font-mono text-xs px-2 py-0.5 rounded border" :class="stateColorClass(comp.state)">
              {{ comp.state }}
            </span>
          </label>
          <div class="flex items-center justify-between gap-2 flex-wrap font-mono text-xs text-[var(--arc-text-muted)]">
            <span>Источник: {{ comp.source }}</span>
            <span>Размер: {{ comp.sizeLabel }} · Диск: {{ formatBytes(comp.diskRequiredBytes) }}</span>
          </div>
        </div>
      </div>

      <!-- Summary & Real Byte Progress -->
      <div class="p-3 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] space-y-2 font-mono text-xs">
        <div class="flex items-center justify-between flex-wrap gap-2 text-[var(--arc-text-secondary)]">
          <span>К загрузке (модели): {{ formatBytes(status.totalKnownDownloadBytes) }}{{ status.hasUnknownSizeComponent ? ' + PyPI (неизвестен)' : '' }}</span>
          <span>Требуется на диске: {{ formatBytes(status.totalKnownDiskRequiredBytes) }}</span>
        </div>

        <div v-if="status.inProgress || status.bytesDone > 0" class="space-y-1.5">
          <div class="h-2 w-full rounded-full bg-[var(--arc-rail)] border border-[var(--arc-hairline)] overflow-hidden">
            <div class="h-full bg-[var(--accent)] transition-all duration-150" :style="{ width: `${progressPercent}%` }"></div>
          </div>
          <div class="flex items-center justify-between text-[var(--arc-text-muted)] tabular-nums">
            <span>{{ formatBytes(status.bytesDone) }} / {{ status.totalBytes > 0 ? formatBytes(status.totalBytes) : 'неизвестен' }}</span>
            <span>Скорость: {{ formatSpeed(status.speedBps) }} · ETA: {{ formattedEta }}</span>
          </div>
        </div>

        <div v-if="status.error" class="text-[var(--status-err)]">
          Ошибка: {{ status.error }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            v-if="!status.inProgress"
            id="btn-voice-setup-start"
            type="button"
            @click="handleStartOrRetry"
            class="px-3.5 py-1.5 rounded-[8px] bg-[var(--accent)] text-white font-semibold cursor-pointer hover:opacity-90 transition-opacity"
          >
            {{ status.overallState === 'failed' || status.overallState === 'cancelled' || status.isPaused ? 'Повторить / Продолжить' : 'Скачать выбранные компоненты' }}
          </button>
          <button
            v-if="status.inProgress"
            id="btn-voice-setup-pause"
            type="button"
            @click="handlePause"
            class="px-3 py-1.5 rounded-[8px] border border-[var(--status-warn)] text-[var(--status-warn)] bg-[var(--arc-block)] cursor-pointer"
          >
            Пауза
          </button>
          <button
            v-if="status.inProgress"
            id="btn-voice-setup-cancel"
            type="button"
            @click="handleCancel"
            class="px-3 py-1.5 rounded-[8px] border border-[var(--status-err)] text-[var(--status-err)] bg-[var(--arc-block)] cursor-pointer"
          >
            Отменить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
