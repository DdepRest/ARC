import { ref, computed } from 'vue';
import {
  completeFirstRunWizardDurably,
  normalizeStepSaveResult,
  sanitizeWizardErrorMessage,
  type StepSaveResult,
  type WizardActionKind,
  type WizardSavePhase,
  type WizardSettingsStoreLike,
  type WizardStepHandle
} from '../utils/wizard-save';

export function createWizardFlowController(options: {
  totalSteps?: number;
  settingsStore: WizardSettingsStoreLike;
  getStepHandle: (step: number) => WizardStepHandle | null | undefined;
  isStepCritical?: (step: number) => boolean;
  onAfterComplete?: () => void;
}) {
  const totalSteps = options.totalSteps ?? 3;
  const isStepCritical = options.isStepCritical ?? ((step: number) => step === 1);

  const currentStep = ref<number>(1);
  const savePhase = ref<WizardSavePhase>('idle');
  const saveError = ref<string | null>(null);
  const lastFailedAction = ref<WizardActionKind | null>(null);
  const optionalWarnings = ref<string[]>([]);

  const isSaving = computed(() => savePhase.value === 'saving');
  let activeTask: Promise<boolean> | null = null;

  function appendOptionalWarnings(warnings?: string[]) {
    if (!warnings || warnings.length === 0) return;
    for (const w of warnings) {
      if (!optionalWarnings.value.includes(w)) {
        optionalWarnings.value.push(w);
      }
    }
  }

  function emitOptionalWarningsToast() {
    if (optionalWarnings.value.length === 0) return;
    const isEn = options.settingsStore.language === 'EN';
    const joined = optionalWarnings.value.join('; ');
    options.settingsStore.triggerSyncToast?.(
      isEn
        ? `Optional settings skipped (configurable in Settings): ${joined}`
        : `Необязательные параметры пропущены (доступны в Настройках): ${joined}`,
      () => {},
      false,
      {
        variant: 'warn',
        badgeLabel: isEn ? '✦ WARNING' : '✦ ВНИМАНИЕ',
        hideAction: true
      }
    );
  }

  async function saveActiveStep(step: number): Promise<StepSaveResult> {
    const handle = options.getStepHandle(step);
    if (!handle?.saveCurrentState) {
      return { ok: true };
    }

    const critical = isStepCritical(step);
    try {
      const normalized = normalizeStepSaveResult(await handle.saveCurrentState());
      if (!normalized.ok) {
        if (critical) {
          return {
            ok: false,
            criticalError: normalized.criticalError || 'Не удалось сохранить обязательные параметры',
            optionalWarnings: normalized.optionalWarnings
          };
        }
        return {
          ok: true,
          optionalWarnings: [
            ...(normalized.optionalWarnings || []),
            normalized.criticalError || 'Необязательный шаг не сохранён'
          ]
        };
      }
      return normalized;
    } catch (err) {
      const msg = sanitizeWizardErrorMessage(err, 'Ошибка сохранения параметров шага');
      if (critical) {
        return { ok: false, criticalError: msg };
      }
      return { ok: true, optionalWarnings: [msg] };
    }
  }

  function runSingleFlight(fn: () => Promise<boolean>): Promise<boolean> {
    if (activeTask) return activeTask;
    const task = fn().finally(() => {
      activeTask = null;
    });
    activeTask = task;
    return task;
  }

  async function finishWizard(): Promise<boolean> {
    return runSingleFlight(async () => {
      savePhase.value = 'saving';
      saveError.value = null;
      lastFailedAction.value = null;

      const stepRes = await saveActiveStep(currentStep.value);
      appendOptionalWarnings(stepRes.optionalWarnings);
      if (!stepRes.ok) {
        savePhase.value = 'error';
        saveError.value = stepRes.criticalError || 'Не удалось сохранить обязательные настройки';
        lastFailedAction.value = 'finish';
        return false;
      }

      const completion = completeFirstRunWizardDurably(options.settingsStore);
      if (!completion.ok) {
        savePhase.value = 'error';
        saveError.value = completion.error || 'Не удалось подтвердить запись настроек';
        lastFailedAction.value = 'finish';
        return false;
      }

      savePhase.value = 'saved';
      emitOptionalWarningsToast();
      options.onAfterComplete?.();
      return true;
    });
  }

  async function nextStep(): Promise<boolean> {
    if (currentStep.value >= totalSteps) {
      return finishWizard();
    }

    return runSingleFlight(async () => {
      savePhase.value = 'saving';
      saveError.value = null;
      lastFailedAction.value = null;

      const stepRes = await saveActiveStep(currentStep.value);
      appendOptionalWarnings(stepRes.optionalWarnings);
      if (!stepRes.ok) {
        savePhase.value = 'error';
        saveError.value = stepRes.criticalError || 'Не удалось сохранить обязательные настройки';
        lastFailedAction.value = 'next';
        return false;
      }

      savePhase.value = 'saved';
      currentStep.value += 1;
      return true;
    });
  }

  async function skipWizard(): Promise<boolean> {
    return runSingleFlight(async () => {
      savePhase.value = 'saving';
      saveError.value = null;
      lastFailedAction.value = null;

      const stepRes = await saveActiveStep(currentStep.value);
      appendOptionalWarnings(stepRes.optionalWarnings);
      if (!stepRes.ok) {
        savePhase.value = 'error';
        saveError.value = stepRes.criticalError || 'Не удалось сохранить обязательные настройки';
        lastFailedAction.value = 'skip';
        return false;
      }

      const completion = completeFirstRunWizardDurably(options.settingsStore);
      if (!completion.ok) {
        savePhase.value = 'error';
        saveError.value = completion.error || 'Не удалось подтвердить сохранение настроек';
        lastFailedAction.value = 'skip';
        return false;
      }

      savePhase.value = 'saved';
      emitOptionalWarningsToast();
      options.onAfterComplete?.();
      return true;
    });
  }

  function prevStep() {
    if (isSaving.value) return;
    if (currentStep.value > 1) {
      currentStep.value -= 1;
      savePhase.value = 'idle';
      saveError.value = null;
      lastFailedAction.value = null;
    }
  }

  async function retryLastAction(): Promise<boolean> {
    const failed = lastFailedAction.value;
    if (failed === 'next') return nextStep();
    if (failed === 'finish') return finishWizard();
    return skipWizard();
  }

  return {
    currentStep,
    savePhase,
    saveError,
    lastFailedAction,
    optionalWarnings,
    isSaving,
    nextStep,
    prevStep,
    finishWizard,
    skipWizard,
    retryLastAction
  };
}
