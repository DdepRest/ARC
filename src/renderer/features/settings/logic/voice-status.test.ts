import { describe, it, expect } from 'vitest';
import {
  computeSttSubsystemStatus,
  computeTtsSubsystemStatus,
  formatTtsEngineName,
  formatTtsProviderSetting
} from './voice-status';

describe('computeSttSubsystemStatus', () => {
  it('returns unverified warn status when sherpa is configured in Electron but worker is not ready yet', () => {
    const res = computeSttSubsystemStatus({
      sttProvider: 'sherpa',
      sttEngine: 'gigaam',
      sttModel: 'gigaam-v2',
      isElectronAvailable: true,
      sttStatusChecked: false,
      sttStatusChecking: false,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: null,
      lastError: null
    });

    expect(res.headerTone).toBe('warn');
    expect(res.headerLabel).toBe('ВЫБРАН · НЕ ПРОВЕРЕН');
    expect(res.readinessTone).toBe('warn');
    expect(res.readinessLabel).toBe('Не проверен');
  });

  it('returns checking progress status while weights are loading', () => {
    const res = computeSttSubsystemStatus({
      sttProvider: 'sherpa',
      sttEngine: 'gigaam',
      sttModel: 'gigaam-v2',
      isElectronAvailable: true,
      sttStatusChecked: false,
      sttStatusChecking: true,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: 42,
      lastError: null
    });

    expect(res.headerTone).toBe('warn');
    expect(res.headerLabel).toBe('ПРОВЕРКА · 42%');
    expect(res.readinessLabel).toBe('Проверка (42%)');
  });

  it('returns ok status ONLY when sttEngineReady is confirmed true', () => {
    const res = computeSttSubsystemStatus({
      sttProvider: 'sherpa',
      sttEngine: 'gigaam',
      sttModel: 'gigaam-v2',
      isElectronAvailable: true,
      sttStatusChecked: true,
      sttStatusChecking: false,
      sttEngineReady: true,
      activeEngineName: 'gigaam',
      loadingProgress: null,
      lastError: null
    });

    expect(res.headerTone).toBe('ok');
    expect(res.headerLabel).toBe('ГОТОВ · GIGAAM');
    expect(res.readinessTone).toBe('ok');
    expect(res.readinessLabel).toBe('Готов (GIGAAM)');
  });

  it('returns err status when lastError is present even if sherpa is selected', () => {
    const res = computeSttSubsystemStatus({
      sttProvider: 'sherpa',
      sttEngine: 'gigaam',
      sttModel: 'gigaam-v2',
      isElectronAvailable: true,
      sttStatusChecked: true,
      sttStatusChecking: false,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: null,
      lastError: 'Missing ONNX file'
    });

    expect(res.headerTone).toBe('err');
    expect(res.headerLabel).toBe('ОШИБКА STT');
    expect(res.readinessDetail).toBe('Missing ONNX file');
  });

  it('returns off unknown status without IPC when not ready', () => {
    const res = computeSttSubsystemStatus({
      sttProvider: 'sherpa',
      sttEngine: 'legacy',
      sttModel: 'zipformer-ru',
      isElectronAvailable: false,
      sttStatusChecked: false,
      sttStatusChecking: false,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: null
    });

    expect(res.headerTone).toBe('off');
    expect(res.headerLabel).toBe('НЕИЗВЕСТНО · БЕЗ IPC');
  });

  it('never marks whisper or native Web Speech as ok solely from selection', () => {
    const whisper = computeSttSubsystemStatus({
      sttProvider: 'whisper',
      sttEngine: 'gigaam',
      sttModel: 'small',
      isElectronAvailable: true,
      sttStatusChecked: true,
      sttStatusChecking: false,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: null
    });
    const native = computeSttSubsystemStatus({
      sttProvider: 'native',
      sttEngine: 'legacy',
      sttModel: '',
      isElectronAvailable: false,
      sttStatusChecked: false,
      sttStatusChecking: false,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: null
    });

    expect(whisper.headerTone).toBe('warn');
    expect(whisper.headerLabel).toBe('ВЫБРАН · НЕ ПРОВЕРЕН');
    expect(native.headerTone).toBe('warn');
  });
});

describe('computeTtsSubsystemStatus', () => {
  it('separates selected provider from confirmed activeEngine while server is online without synthesis', () => {
    const res = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'online',
      confirmedActiveEngine: null,
      isElectronAvailable: true
    });

    expect(res.configuredDisplay).toBe('Auto');
    expect(res.serverStatusTone).toBe('ok');
    expect(res.headerTone).toBe('warn');
    expect(res.headerLabel).toBe('СЕРВЕР ОНЛАЙН · ОЖИДАНИЕ');
    expect(res.activeEngineTone).toBe('warn');
    expect(res.activeEngineLabel).toBe('Ожидание синтеза');
  });

  it('reports ok ONLY when backend confirms activeEngine', () => {
    const res = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'online',
      confirmedActiveEngine: 'edge',
      isElectronAvailable: true
    });

    expect(res.headerTone).toBe('ok');
    expect(res.headerLabel).toBe('АКТИВЕН: EDGE TTS');
    expect(res.activeEngineTone).toBe('ok');
    expect(res.activeEngineLabel).toBe('Edge TTS');
    expect(res.configuredDisplay).toBe('Auto');
  });

  it('reports err when strict silero is selected and python server is offline without activeEngine', () => {
    const res = computeTtsSubsystemStatus({
      configuredProvider: 'silero',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true
    });

    expect(res.headerTone).toBe('err');
    expect(res.headerLabel).toBe('СЕРВЕР SILERO ОФЛАЙН');
    expect(res.activeEngineTone).toBe('err');
  });

  it('reports warn auto-fallback when auto is selected and silero server is offline', () => {
    const res = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true
    });

    expect(res.headerTone).toBe('warn');
    expect(res.headerLabel).toBe('SILERO ОФЛАЙН · АВТО-РЕЗЕРВ');
  });

  it('reports unverified warn when edge or native is chosen before first synthesis', () => {
    const res = computeTtsSubsystemStatus({
      configuredProvider: 'edge',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true
    });

    expect(res.headerTone).toBe('warn');
    expect(res.headerLabel).toBe('ВЫБРАН · НЕ ПРОВЕРЕН');
    expect(res.activeEngineLabel).toBe('Не подтверждён');
  });

  it('reports off when Electron IPC is unavailable', () => {
    const res = computeTtsSubsystemStatus({
      configuredProvider: 'silero',
      sileroServerStatus: 'unknown',
      confirmedActiveEngine: null,
      isElectronAvailable: false
    });

    expect(res.headerTone).toBe('off');
    expect(res.headerLabel).toBe('НЕИЗВЕСТНО · БЕЗ IPC');
    expect(res.dictionariesTone).toBe('off');
    expect(res.dictionariesLabel).toBe('Словари: Без IPC');
    expect(formatTtsEngineName(null)).toBe('Не подтверждён');
    expect(formatTtsProviderSetting('silero')).toBe('Silero v5.6');
  });

  it('reports dictionary readiness states READY, DEGRADED, ERROR and null accurately', () => {
    const ready = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'online',
      confirmedActiveEngine: 'silero',
      isElectronAvailable: true,
      dictionariesDiag: {
        state: 'READY',
        bundledDir: 'C:\\Program Files\\ARC\\resources\\Voice\\dicts',
        bundledCounts: { totalFilesLoaded: 3 },
        userOverrideCounts: { totalOverrides: 4 },
        errors: []
      }
    });
    expect(ready.dictionariesTone).toBe('ok');
    expect(ready.dictionariesLabel).toBe('Словари: Готовы (+4)');
    expect(ready.dictionariesDetail).toContain('Комплектных: 3/3');

    const degraded = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'online',
      confirmedActiveEngine: 'silero',
      isElectronAvailable: true,
      dictionariesDiag: {
        state: 'DEGRADED',
        bundledCounts: { totalFilesLoaded: 2 },
        errors: ['bundled dictionary missing: tts_dict_homographs.json']
      }
    });
    expect(degraded.dictionariesTone).toBe('warn');
    expect(degraded.dictionariesLabel).toBe('Словари: Ограничено');
    expect(degraded.dictionariesDetail).toContain('tts_dict_homographs.json');

    const err = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      dictionariesDiag: { state: 'ERROR', bundledCounts: { totalFilesLoaded: 0 }, errors: ['bundled dicts directory not found'] }
    });
    expect(err.dictionariesTone).toBe('err');
    expect(err.dictionariesLabel).toBe('Словари: Ошибка');

    const unchecked = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'checking',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      dictionariesDiag: null
    });
    expect(unchecked.dictionariesTone).toBe('off');
    expect(unchecked.dictionariesLabel).toBe('Словари: Не проверены');
  });

  it('reports Python dependencies readiness states READY, DEGRADED, ERROR, INSTALLING, null and no-IPC accurately', () => {
    const ready = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'online',
      confirmedActiveEngine: 'silero',
      isElectronAvailable: true,
      dependenciesDiag: { state: 'READY', coreReady: true, dspReady: true, accentReady: true, ffmpegReady: true }
    });
    expect(ready.dependenciesTone).toBe('ok');
    expect(ready.dependenciesLabel).toBe('Python: Готов');

    const degraded = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'online',
      confirmedActiveEngine: 'silero',
      isElectronAvailable: true,
      dependenciesDiag: { state: 'DEGRADED', coreReady: true, accentReady: false, dspReady: false }
    });
    expect(degraded.dependenciesTone).toBe('warn');
    expect(degraded.dependenciesLabel).toBe('Python: Ограничено');
    expect(degraded.dependenciesDetail).toContain('без RUAccent');
    expect(degraded.dependenciesDetail).toContain('без FFmpeg/DSP');

    const err = computeTtsSubsystemStatus({
      configuredProvider: 'silero',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      dependenciesDiag: { state: 'ERROR', coreReady: false, reason: 'import_check_failed', errors: ["Core модуль 'torch' недоступен"] }
    });
    expect(err.dependenciesTone).toBe('err');
    expect(err.dependenciesLabel).toBe('Python: Ошибка');
    expect(err.dependenciesDetail).toContain('torch');

    const installing = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'checking',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      dependenciesDiag: { phase: 'INSTALLING_CORE', activePackage: 'torch' }
    });
    expect(installing.dependenciesTone).toBe('warn');
    expect(installing.dependenciesLabel).toBe('Python: Установка...');
    expect(installing.dependenciesDetail).toContain('torch');

    const noIpc = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'unknown',
      confirmedActiveEngine: null,
      isElectronAvailable: false
    });
    expect(noIpc.dependenciesTone).toBe('off');
    expect(noIpc.dependenciesLabel).toBe('Python: Без IPC');
  });

  it('reports unavailable error state, cloud opt-in detail, and forcedOfflineMode lock accurately (S2-05)', () => {
    const unavailable = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: 'unavailable',
      isElectronAvailable: true,
      allowCloudTtsFallback: false,
      lastErrorReason: 'SAPI недоступен; Облачный резерв Edge TTS отключён',
    });
    expect(unavailable.headerTone).toBe('err');
    expect(unavailable.headerLabel).toBe('TTS НЕДОСТУПЕН');
    expect(unavailable.activeEngineLabel).toBe('Недоступен');
    expect(unavailable.activeEngineDetail).toContain('Облачный резерв Edge TTS отключён');

    const localOnlyOffline = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      allowCloudTtsFallback: false,
    });
    expect(localOnlyOffline.activeEngineDetail).toContain('Облачный резерв отключён');
    expect(localOnlyOffline.activeEngineDetail).toContain('SAPI');

    const cloudEnabledOffline = computeTtsSubsystemStatus({
      configuredProvider: 'auto',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      allowCloudTtsFallback: true,
      forcedOfflineMode: false,
    });
    expect(cloudEnabledOffline.activeEngineDetail).toContain('Edge (облако)');

    const edgeLocked = computeTtsSubsystemStatus({
      configuredProvider: 'edge',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      allowCloudTtsFallback: true,
      forcedOfflineMode: true,
    });
    expect(edgeLocked.headerTone).toBe('warn');
    expect(edgeLocked.headerLabel).toBe('ОБЛАКО ЗАБЛОКИРОВАНО · SAPI');
  });

  it('treats missing or consent_required voice resources as warn rather than runtime failure (S2-07)', () => {
    const sttConsent = computeSttSubsystemStatus({
      sttProvider: 'sherpa',
      sttEngine: 'gigaam',
      sttModel: 'gigaam-ctc',
      isElectronAvailable: true,
      sttStatusChecked: true,
      sttStatusChecking: false,
      sttEngineReady: false,
      activeEngineName: '',
      loadingProgress: null,
      lastError: null,
      modelsInstalled: false,
      setupState: 'consent_required'
    });
    expect(sttConsent.setupState).toBe('consent_required');
    expect(sttConsent.headerTone).toBe('warn');
    expect(sttConsent.headerLabel).toBe('ТРЕБУЕТСЯ УСТАНОВКА');

    const ttsMissing = computeTtsSubsystemStatus({
      configuredProvider: 'silero',
      sileroServerStatus: 'offline',
      confirmedActiveEngine: null,
      isElectronAvailable: true,
      sileroModelInstalled: false,
      voiceSetupState: 'consent_required'
    });
    expect(ttsMissing.setupState).toBe('consent_required');
    expect(ttsMissing.headerTone).toBe('warn');
    expect(ttsMissing.headerLabel).toBe('ТРЕБУЕТСЯ УСТАНОВКА');
    expect(ttsMissing.serverStatusTone).toBe('warn');
  });
});

