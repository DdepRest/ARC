import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse as parseSfc, compileTemplate } from '@vue/compiler-sfc';
import { completeFirstRunWizard } from './utils/complete-wizard';
import { recommendGraphicsPreset } from './utils/recommend-preset';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { createWizardFlowController } from './composables/useFirstRunWizard';
import {
  completeFirstRunWizardDurably,
  saveAiStepSelection,
  flushVoiceSetupCardSync,
  type WizardStepHandle
} from './utils/wizard-save';
import { persistCloudContourConfig } from './utils/ai-step-persistence';

function createMemoryLocalStorage() {
  const map: Record<string, string> = {};
  return {
    map,
    api: {
      getItem: vi.fn((k: string) => (k in map ? map[k] : null)),
      setItem: vi.fn((k: string, v: string) => {
        map[k] = String(v);
      }),
      removeItem: vi.fn((k: string) => {
        delete map[k];
      }),
      clear: vi.fn(() => {
        for (const k of Object.keys(map)) delete map[k];
      })
    }
  };
}

describe('FirstRunWizard Logic & Recommendations', () => {
  beforeEach(() => {
    const ls = createMemoryLocalStorage();
    (globalThis as any).localStorage = ls.api;
    (globalThis as any).window = (globalThis as any).window || {};
  });

  it('1. completeFirstRunWizard marks firstRunCompleted and sets onboardingVersion', () => {
    const mockStore = {
      firstRunCompleted: false,
      onboardingVersion: 0
    };

    completeFirstRunWizard(mockStore);

    expect(mockStore.firstRunCompleted).toBe(true);
    expect(mockStore.onboardingVersion).toBe(1);
  });

  it('2. recommendGraphicsPreset accurately maps 3-preset VRAM thresholds (4096 / 8192)', () => {
    expect(recommendGraphicsPreset(null)).toBe('Balanced');
    expect(recommendGraphicsPreset(undefined)).toBe('Balanced');
    expect(recommendGraphicsPreset(Number.NaN)).toBe('Balanced');
    expect(recommendGraphicsPreset(0)).toBe('Balanced');
    expect(recommendGraphicsPreset(-512)).toBe('Balanced');

    expect(recommendGraphicsPreset(2048)).toBe('Eco');
    expect(recommendGraphicsPreset(4095)).toBe('Eco');

    expect(recommendGraphicsPreset(4096)).toBe('Balanced');
    expect(recommendGraphicsPreset(8191)).toBe('Balanced');

    expect(recommendGraphicsPreset(8192)).toBe('Cinematic');
    expect(recommendGraphicsPreset(12288)).toBe('Cinematic');
  });

  it('3. GraphicsStep.vue offers only Eco, Balanced, Cinematic without UltraPlus or overwriting saved choice', () => {
    const stepSource = fs.readFileSync(path.resolve(__dirname, 'steps/GraphicsStep.vue'), 'utf8');
    expect(stepSource).toContain('GRAPHICS_PRESET_ORDER');
    expect(stepSource).toContain('hasUserSelectedGraphicsPreset');
    expect(stepSource).not.toContain('UltraPlus');
    expect(stepSource).not.toContain('isUltraPlusAvailable');
  });
});

describe('FirstRunWizard S3-06 Async Save, Critical vs Optional & Single-Flight', () => {
  beforeEach(() => {
    const ls = createMemoryLocalStorage();
    (globalThis as any).localStorage = ls.api;
    (globalThis as any).window = {};
  });

  it('4. skipWizard awaits async step saveCurrentState before marking firstRunCompleted and persists immediately', async () => {
    const settingsStore = {
      firstRunCompleted: false,
      onboardingVersion: 1,
      language: 'RU' as const,
      triggerSyncToast: vi.fn()
    };

    let resolveSave!: () => void;
    const deferredSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const voiceStep: WizardStepHandle = {
      saveCurrentState: vi.fn(() => deferredSave)
    };

    const controller = createWizardFlowController({
      settingsStore,
      getStepHandle: (step) => (step === 2 ? voiceStep : null)
    });
    controller.currentStep.value = 2;

    const skipPromise = controller.skipWizard();
    expect(controller.savePhase.value).toBe('saving');
    expect(controller.isSaving.value).toBe(true);
    expect(settingsStore.firstRunCompleted).toBe(false);
    expect(localStorage.getItem('arc_state_settings')).toBeNull();

    resolveSave();
    const ok = await skipPromise;

    expect(ok).toBe(true);
    expect(controller.savePhase.value).toBe('saved');
    expect(controller.isSaving.value).toBe(false);
    expect(settingsStore.firstRunCompleted).toBe(true);

    const persisted = JSON.parse(localStorage.getItem('arc_state_settings') || '{}');
    expect(persisted.firstRunCompleted).toBe(true);
    expect(persisted.onboardingVersion).toBe(1);
  });

  it('5. critical AI key/provider failure keeps wizard open in error state and allows retry', async () => {
    const settingsStore = {
      firstRunCompleted: false,
      onboardingVersion: 1,
      language: 'RU' as const,
      triggerSyncToast: vi.fn()
    };

    let shouldFail = true;
    const aiStep: WizardStepHandle = {
      saveCurrentState: vi.fn(async () =>
        saveAiStepSelection({
          contour: 'gemini',
          isLocalGateway: false,
          localRuntime: 'ollama',
          trimmedKey: 'AIza-secret-test-key',
          settingsStore: { useLocalLLM: false, localLLMModel: 'llama3.2' },
          persistLocalGateway: async () => ({ success: true }),
          persistCurrentContour: async () =>
            shouldFail
              ? { success: false, error: 'Secret Vault: EACCES при записи secrets.json' }
              : { success: true }
        })
      )
    };

    const controller = createWizardFlowController({
      settingsStore,
      getStepHandle: (step) => (step === 1 ? aiStep : null)
    });

    const skipResult = await controller.skipWizard();
    expect(skipResult).toBe(false);
    expect(settingsStore.firstRunCompleted).toBe(false);
    expect(controller.currentStep.value).toBe(1);
    expect(controller.savePhase.value).toBe('error');
    expect(controller.saveError.value).toContain('EACCES');
    expect(controller.lastFailedAction.value).toBe('skip');

    shouldFail = false;
    const retryResult = await controller.retryLastAction();
    expect(retryResult).toBe(true);
    expect(controller.savePhase.value).toBe('saved');
    expect(settingsStore.firstRunCompleted).toBe(true);
  });

  it('6. localStorage write failure rolls back firstRunCompleted and leaves wizard open with retry', async () => {
    const ls = createMemoryLocalStorage();
    let failWrite = true;
    ls.api.setItem = vi.fn((k: string, v: string) => {
      if (failWrite) throw new Error('QuotaExceededError');
      ls.map[k] = String(v);
    });
    (globalThis as any).localStorage = ls.api;

    const settingsStore = {
      firstRunCompleted: false,
      onboardingVersion: 1,
      language: 'RU' as const,
      triggerSyncToast: vi.fn()
    };

    const directFail = completeFirstRunWizardDurably(settingsStore);
    expect(directFail.ok).toBe(false);
    expect(settingsStore.firstRunCompleted).toBe(false);

    const controller = createWizardFlowController({
      settingsStore,
      getStepHandle: () => ({ saveCurrentState: async () => ({ ok: true }) })
    });
    controller.currentStep.value = 3;

    const finishOk = await controller.finishWizard();
    expect(finishOk).toBe(false);
    expect(settingsStore.firstRunCompleted).toBe(false);
    expect(controller.savePhase.value).toBe('error');
    expect(controller.saveError.value).toContain('QuotaExceededError');
    expect(controller.lastFailedAction.value).toBe('finish');

    failWrite = false;
    const retryOk = await controller.retryLastAction();
    expect(retryOk).toBe(true);
    expect(settingsStore.firstRunCompleted).toBe(true);
    expect(controller.savePhase.value).toBe('saved');
  });

  it('7. optional voice/graphics failures allow skip/finish with an honest warning toast', async () => {
    const triggerSyncToast = vi.fn();
    const settingsStore = {
      firstRunCompleted: false,
      onboardingVersion: 1,
      language: 'RU' as const,
      triggerSyncToast
    };

    (globalThis as any).window = {
      api: {
        setVoiceSetupMode: vi.fn(async () => {
          throw new Error('IPC channel unavailable');
        })
      }
    };

    const voiceStep: WizardStepHandle = {
      saveCurrentState: () =>
        flushVoiceSetupCardSync({
          mode: 'later',
          pendingSync: null,
          lastSyncError: null,
          hasSyncedMode: false
        })
    };

    const controller = createWizardFlowController({
      settingsStore,
      getStepHandle: (step) => (step === 2 ? voiceStep : null)
    });
    controller.currentStep.value = 2;

    const ok = await controller.skipWizard();
    expect(ok).toBe(true);
    expect(settingsStore.firstRunCompleted).toBe(true);
    expect(triggerSyncToast).toHaveBeenCalledTimes(1);
    expect(triggerSyncToast.mock.calls[0][0]).toContain('Необязательные параметры пропущены');
    expect(triggerSyncToast.mock.calls[0][3]).toMatchObject({
      variant: 'warn',
      badgeLabel: '✦ ВНИМАНИЕ',
      hideAction: true
    });
  });

  it('8. single-flight lock prevents duplicate saves on double click / repeated Esc and saves step 3 once', async () => {
    const settingsStore = {
      firstRunCompleted: false,
      onboardingVersion: 1,
      language: 'RU' as const,
      triggerSyncToast: vi.fn()
    };

    let releaseStep!: () => void;
    const stepGate = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });
    const saveSpy = vi.fn(async () => {
      await stepGate;
      return { ok: true };
    });

    const controller = createWizardFlowController({
      settingsStore,
      getStepHandle: () => ({ saveCurrentState: saveSpy })
    });
    controller.currentStep.value = 3;

    const p1 = controller.nextStep();
    const p2 = controller.nextStep();
    const p3 = controller.skipWizard();
    controller.prevStep(); // must be ignored while saving

    expect(controller.currentStep.value).toBe(3);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    releaseStep();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(settingsStore.firstRunCompleted).toBe(true);
  });

  it('9. onboarding and SyncToast Vue SFC templates compile cleanly with honest saving/error UI tokens', () => {
    const sfcPaths = [
      path.resolve(__dirname, 'FirstRunWizardModal.vue'),
      path.resolve(__dirname, 'steps/AiModeStep.vue'),
      path.resolve(__dirname, 'steps/VoiceMicStep.vue'),
      path.resolve(__dirname, 'steps/VoiceSetupCard.vue'),
      path.resolve(__dirname, 'steps/GraphicsStep.vue'),
      path.resolve(__dirname, '../ui/SyncToast.vue')
    ];

    for (const filePath of sfcPaths) {
      const source = fs.readFileSync(filePath, 'utf8');
      const { descriptor, errors } = parseSfc(source);
      expect(errors, `SFC parse errors in ${filePath}`).toHaveLength(0);
      const compiled = compileTemplate({
        source: descriptor.template?.content || '',
        filename: filePath,
        id: path.basename(filePath)
      });
      expect(compiled.errors, `Template compile errors in ${filePath}`).toHaveLength(0);
    }

    const modalSource = fs.readFileSync(path.resolve(__dirname, 'FirstRunWizardModal.vue'), 'utf8');
    expect(modalSource).toContain('wizard-save-error');
    expect(modalSource).toContain('wizard-retry-btn');
    expect(modalSource).toContain('wizard-save-status');
    expect(modalSource).toContain(':disabled="isSaving"');

    const toastSource = fs.readFileSync(path.resolve(__dirname, '../ui/SyncToast.vue'), 'utf8');
    expect(toastSource).toContain('settingsStore.lastChangedState.badgeLabel');
  });

  it('10. real Pinia settingsStore persists firstRunCompleted immediately via completeFirstRunWizardDurably', async () => {
    setActivePinia(createPinia());
    const realStore = useSettingsStore();
    expect(realStore.firstRunCompleted).toBe(false);

    const controller = createWizardFlowController({
      settingsStore: realStore,
      getStepHandle: () => ({ saveCurrentState: async () => ({ ok: true }) })
    });
    controller.currentStep.value = 3;

    const ok = await controller.finishWizard();
    expect(ok).toBe(true);
    expect(realStore.firstRunCompleted).toBe(true);

    const persistedRaw = localStorage.getItem('arc_state_settings');
    expect(persistedRaw).toBeTruthy();
    const parsed = JSON.parse(persistedRaw || '{}');
    expect(parsed.firstRunCompleted).toBe(true);
    expect(parsed.onboardingVersion).toBe(1);
    expect(parsed.reactorColorTheme).toBeUndefined();
  });

  it('11. nextStep blocks advancing on Gemini Secret Vault failure and advances on retry', async () => {
    let vaultFail = true;
    (globalThis as any).window = {
      api: {
        settingsSetKey: vi.fn(async () =>
          vaultFail
            ? { success: false, error: 'Secret Vault: EROFS read-only filesystem' }
            : { success: true }
        )
      }
    };
    const saveProvider = vi.fn(async () => ({ success: true }));

    const settingsStore = {
      firstRunCompleted: false,
      onboardingVersion: 1,
      language: 'RU' as const,
      triggerSyncToast: vi.fn()
    };

    const aiStep: WizardStepHandle = {
      saveCurrentState: () =>
        saveAiStepSelection({
          contour: 'gemini',
          isLocalGateway: false,
          localRuntime: 'ollama',
          trimmedKey: 'AIza-test-vault-key',
          settingsStore: { useLocalLLM: false, localLLMModel: 'llama3.2' },
          persistLocalGateway: async () => ({ success: true }),
          persistCurrentContour: (trimmedKey) =>
            persistCloudContourConfig({
              preset: {
                id: 'gemini',
                name: 'Google Gemini',
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                model: 'gemini-2.5-flash',
                freeTierInfo: 'Free'
              },
              trimmedKey,
              saveProvider
            })
        })
    };

    const controller = createWizardFlowController({
      settingsStore,
      getStepHandle: (step) => (step === 1 ? aiStep : null)
    });

    const firstTry = await controller.nextStep();
    expect(firstTry).toBe(false);
    expect(controller.currentStep.value).toBe(1);
    expect(controller.savePhase.value).toBe('error');
    expect(controller.saveError.value).toContain('EROFS');
    expect(controller.lastFailedAction.value).toBe('next');
    expect(saveProvider).not.toHaveBeenCalled();

    vaultFail = false;
    const retryOk = await controller.retryLastAction();
    expect(retryOk).toBe(true);
    expect(controller.currentStep.value).toBe(2);
    expect(controller.savePhase.value).toBe('saved');
    expect(saveProvider).toHaveBeenCalledTimes(1);
  });

  it('12. settingsStore.triggerSyncToast preserves custom badgeLabel for optional-skip warnings', () => {
    setActivePinia(createPinia());
    const realStore = useSettingsStore();

    realStore.triggerSyncToast('Необязательные параметры пропущены', () => {}, false, {
      variant: 'warn',
      badgeLabel: '✦ ВНИМАНИЕ',
      hideAction: true
    });

    expect(realStore.lastChangedToastVisible).toBe(true);
    expect(realStore.lastChangedState?.variant).toBe('warn');
    expect(realStore.lastChangedState?.badgeLabel).toBe('✦ ВНИМАНИЕ');
    expect(realStore.lastChangedState?.hideAction).toBe(true);
  });
});
