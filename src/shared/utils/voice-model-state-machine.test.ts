import { describe, it, expect } from 'vitest';
import {
  canTransitionSetupState,
  transitionSetupState,
  isStateApplicableToComponent,
  mapVoiceHealthToSetupState,
  deriveResourceStateSnapshot,
  type VoiceModelSetupState
} from './voice-model-state-machine';
import { FALLBACK_STT_MODELS_LIST } from '../../main/services/stt-models-list.helper';

describe('S2-07 Unified Voice/Model Setup State Machine', () => {
  it('supports canonical happy-path progression unknown -> checking -> missing -> consent_required -> downloading -> verifying -> ready', () => {
    const chain: VoiceModelSetupState[] = [
      'unknown',
      'checking',
      'missing',
      'consent_required',
      'downloading',
      'verifying',
      'ready'
    ];
    let current = chain[0];
    for (let i = 1; i < chain.length; i++) {
      expect(canTransitionSetupState(current, chain[i])).toBe(true);
      current = transitionSetupState(current, chain[i]);
    }
    expect(current).toBe('ready');
  });

  it('forbids failed -> ready direct transition without re-checking or re-verifying', () => {
    expect(canTransitionSetupState('failed', 'ready')).toBe(false);
    expect(() => transitionSetupState('failed', 'ready')).toThrow(/Invalid voice\/model setup transition/);
    expect(canTransitionSetupState('failed', 'checking')).toBe(true);
    expect(canTransitionSetupState('failed', 'downloading')).toBe(true);
  });

  it('documents applicability per component kind', () => {
    expect(isStateApplicableToComponent('stt_model', 'incompatible')).toBe(true);
    expect(isStateApplicableToComponent('tts_model', 'incompatible')).toBe(false);
    expect(isStateApplicableToComponent('llm_model', 'degraded')).toBe(false);
    expect(isStateApplicableToComponent('voice_subsystem', 'degraded')).toBe(true);
  });

  it('Criterion 1: missing and consent_required resources never report failed/err state', () => {
    const missing = deriveResourceStateSnapshot({ kind: 'stt_model', downloaded: false });
    expect(missing.setupState).toBe('missing');
    expect(missing.badgeTone).toBe('off');
    expect(missing.readinessLayer).toBe('none');

    const consent = deriveResourceStateSnapshot({ kind: 'tts_model', downloaded: false, consentRequired: true });
    expect(consent.setupState).toBe('consent_required');
    expect(consent.badgeTone).toBe('warn');
    expect(consent.requiresConsent).toBe(true);
    expect(mapVoiceHealthToSetupState('model_missing', 'later')).toBe('consent_required');
  });

  it('Criterion 2: downloaded (unverified_manual) is NOT equal to verified', () => {
    const manual = deriveResourceStateSnapshot({
      kind: 'stt_model',
      downloaded: true,
      integrityStatus: 'unverified_manual'
    });
    expect(manual.readinessLayer).toBe('downloaded');
    expect(manual.setupState).toBe('degraded');
    expect(manual.badgeTone).toBe('warn');
    expect(manual.badgeLabel).toBe('Скачана · Не проверена');

    const verified = deriveResourceStateSnapshot({
      kind: 'stt_model',
      downloaded: true,
      integrityStatus: 'verified'
    });
    expect(verified.readinessLayer).toBe('verified');
    expect(verified.setupState).toBe('ready');
    expect(verified.badgeTone).toBe('ok');
  });

  it('Criterion 3: verified on disk is NOT equal to loaded in runtime', () => {
    const onDisk = deriveResourceStateSnapshot({
      kind: 'tts_model',
      downloaded: true,
      integrityStatus: 'verified',
      loaded: false,
      active: false
    });
    expect(onDisk.readinessLayer).toBe('verified');
    expect(onDisk.badgeLabel).toBe('Проверена (на диске)');

    const inRuntime = deriveResourceStateSnapshot({
      kind: 'tts_model',
      downloaded: true,
      integrityStatus: 'verified',
      loaded: true,
      active: false
    });
    expect(inRuntime.readinessLayer).toBe('loaded');
    expect(inRuntime.badgeLabel).toBe('Загружена');
  });

  it('Criterion 4: loaded in memory is NOT equal to active selected engine', () => {
    const loadedStandby = deriveResourceStateSnapshot({
      kind: 'stt_model',
      downloaded: true,
      integrityStatus: 'verified',
      loaded: true,
      active: false
    });
    const activeEngine = deriveResourceStateSnapshot({
      kind: 'stt_model',
      downloaded: true,
      integrityStatus: 'verified',
      loaded: true,
      active: true
    });
    expect(loadedStandby.readinessLayer).toBe('loaded');
    expect(activeEngine.readinessLayer).toBe('active');
    expect(activeEngine.badgeLabel).toBe('Активен');
  });

  it('Criterion 5: cancelled does NOT remain stuck in downloading', () => {
    const snap = deriveResourceStateSnapshot({
      kind: 'stt_model',
      downloading: true,
      cancelled: true
    });
    expect(snap.setupState).toBe('cancelled');
    expect(snap.badgeTone).toBe('warn');
    expect(snap.badgeLabel).toBe('Отменено');
  });

  it('Criterion 6: failed or tampered NEVER turns into green ready even if downloaded/loaded/active flags are stale', () => {
    const tampered = deriveResourceStateSnapshot({
      kind: 'tts_model',
      downloaded: true,
      loaded: true,
      active: true,
      integrityStatus: 'tampered'
    });
    expect(tampered.setupState).toBe('failed');
    expect(tampered.badgeTone).toBe('err');
    expect(tampered.canActivate).toBe(false);

    const errored = deriveResourceStateSnapshot({
      kind: 'llm_model',
      downloaded: true,
      error: 'Download corrupted'
    });
    expect(errored.setupState).toBe('failed');
    expect(errored.badgeTone).toBe('err');
  });

  it('Criterion 7: fallback STT list marks unverified pending timeout models as checking (downloaded: false)', () => {
    expect(FALLBACK_STT_MODELS_LIST.isPending).toBe(true);
    for (const m of FALLBACK_STT_MODELS_LIST.models) {
      expect(m.downloaded).toBe(false);
      expect(m.verificationPending).toBe(true);
      expect(m.setupState).toBe('checking');
    }
  });
});
