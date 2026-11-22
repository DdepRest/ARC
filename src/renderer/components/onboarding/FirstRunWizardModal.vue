<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { createWizardFlowController } from './composables/useFirstRunWizard';
import AiModeStep from './steps/AiModeStep.vue';
import VoiceMicStep from './steps/VoiceMicStep.vue';
import GraphicsStep from './steps/GraphicsStep.vue';

const settingsStore = useSettingsStore();
const totalSteps = 3;

const aiStepRef = ref<any>(null);
const voiceStepRef = ref<any>(null);
const graphicsStepRef = ref<any>(null);

interface StepMeta {
  index: number;
  label: string;
  subtitle: string;
}

const steps: StepMeta[] = [
  {
    index: 1,
    label: '01 · КОНТУР ИИ',
    subtitle: 'Выбор вычислительного контура ядра: облачный канал или автономный режим'
  },
  {
    index: 2,
    label: '02 · АУДИО / ГОЛОС',
    subtitle: 'Калибровка входного сигнала микрофона, голосовой активации и речевого синтеза'
  },
  {
    index: 3,
    label: '03 · РЕНДЕР 3D',
    subtitle: 'Профиль шейдерного конвейера 3D-Реактора по объёму видеопамяти GPU'
  }
];

const {
  currentStep,
  savePhase,
  saveError,
  isSaving,
  nextStep,
  prevStep,
  skipWizard,
  retryLastAction
} = createWizardFlowController({
  totalSteps,
  settingsStore,
  getStepHandle: (step) => {
    if (step === 1) return aiStepRef.value;
    if (step === 2) return voiceStepRef.value;
    if (step === 3) return graphicsStepRef.value;
    return null;
  }
});

const currentStepMeta = computed(() => steps[currentStep.value - 1] || steps[0]);

function onSkipAiStep() {
  if (isSaving.value) return;
  if (currentStep.value === 1) {
    currentStep.value = 2;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    void skipWizard();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div
    class="fixed inset-0 z-[9500] bg-[var(--arc-rail)] pointer-events-auto flex items-center justify-center p-4 select-none"
    role="dialog"
    aria-modal="true"
    aria-labelledby="arc-calibration-title"
  >
    <div
      class="w-full max-w-[720px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] border-l-2 border-l-[var(--accent)] rounded-[16px] flex flex-col overflow-hidden max-h-[90vh]"
      :style="{
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 64px rgba(0, 0, 0, 0.85)'
      }"
    >
      <!-- Header -->
      <div
        class="px-6 py-4 border-b border-[var(--arc-divider)] bg-[var(--arc-plane)] flex items-start justify-between gap-4"
        :style="{ backgroundImage: 'var(--arc-sheen)' }"
      >
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2.5">
            <span class="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shrink-0"></span>
            <h2
              id="arc-calibration-title"
              class="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--arc-text-primary)]"
            >
              КАЛИБРОВКА ЯДРА · СИНХРОНИЗАЦИЯ КОНТУРОВ
            </h2>
          </div>
          <p class="font-sans text-xs text-[var(--arc-text-secondary)] truncate">
            {{ currentStepMeta.subtitle }}
          </p>
        </div>

        <button
          type="button"
          :disabled="isSaving"
          @click="skipWizard"
          class="font-mono text-xs text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] shrink-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Esc — пропустить
        </button>
      </div>

      <!-- 3-Segment Progress Stepper -->
      <div class="px-6 py-3.5 border-b border-[var(--arc-divider)] bg-[var(--arc-plane)]">
        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="step in steps"
            :key="step.index"
            class="space-y-1.5"
          >
            <div
              class="h-1.5 rounded-full transition-colors"
              :class="step.index === currentStep
                ? 'bg-[var(--accent)]'
                : step.index < currentStep
                  ? 'bg-[var(--status-ok)]'
                  : 'bg-[var(--arc-rail)]'"
            ></div>
            <div
              class="font-mono text-xs tracking-wider uppercase truncate"
              :class="step.index === currentStep
                ? 'text-[var(--arc-text-primary)] font-semibold'
                : step.index < currentStep
                  ? 'text-[var(--status-ok)]'
                  : 'text-[var(--arc-text-muted)]'"
            >
              {{ step.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- Step Content Area -->
      <div class="p-6 overflow-y-auto flex-1 bg-[var(--arc-plane)]">
        <AiModeStep
          v-if="currentStep === 1"
          ref="aiStepRef"
          @skip-step="onSkipAiStep"
        />
        <VoiceMicStep v-else-if="currentStep === 2" ref="voiceStepRef" />
        <GraphicsStep v-else-if="currentStep === 3" ref="graphicsStepRef" />
      </div>

      <!-- Save Error Banner -->
      <div
        v-if="savePhase === 'error' && saveError"
        role="alert"
        data-testid="wizard-save-error"
        class="px-6 py-2.5 border-t border-[var(--status-err)] bg-[var(--arc-block)] flex items-center justify-between gap-3"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2 h-2 rounded-full bg-[var(--status-err)] shrink-0"></span>
          <span class="font-mono text-xs text-[var(--status-err)] truncate" :title="saveError">
            Ошибка сохранения: {{ saveError }}
          </span>
        </div>
        <button
          type="button"
          :disabled="isSaving"
          @click="retryLastAction"
          data-testid="wizard-retry-btn"
          class="px-3 py-1 rounded-[8px] border border-[var(--status-err)] bg-[var(--arc-plane)] text-[var(--status-err)] hover:bg-[var(--arc-hover)] font-mono text-xs cursor-pointer shrink-0 disabled:opacity-50"
        >
          Повторить
        </button>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-[var(--arc-divider)] bg-[var(--arc-plane)] flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            :disabled="isSaving"
            @click="skipWizard"
            data-testid="wizard-skip-btn"
            class="px-4 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-transparent hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] font-mono text-xs cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Пропустить
          </button>

          <span
            v-if="savePhase === 'saving'"
            data-testid="wizard-save-status"
            class="flex items-center gap-1.5 font-mono text-xs text-[var(--arc-text-secondary)] truncate"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0"></span>
            <span>Сохранение настроек...</span>
          </span>
          <span
            v-else-if="savePhase === 'saved'"
            data-testid="wizard-save-status"
            class="flex items-center gap-1.5 font-mono text-xs text-[var(--status-ok)] truncate"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)] shrink-0"></span>
            <span>Сохранено</span>
          </span>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <button
            v-if="currentStep > 1"
            type="button"
            :disabled="isSaving"
            @click="prevStep"
            data-testid="wizard-prev-btn"
            class="px-4 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] font-mono text-xs cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Назад
          </button>

          <button
            type="button"
            :disabled="isSaving"
            @click="nextStep"
            data-testid="wizard-next-btn"
            class="px-5 py-1.5 rounded-[10px] bg-[var(--accent)] text-white font-mono text-xs font-semibold border border-[rgba(var(--accent-rgb),0.5)] shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)] hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isSaving ? 'Сохранение...' : currentStep === totalSteps ? 'Завершить' : 'Далее' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
