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
    expect(formatTtsEngineName(null)).toBe('Не подтверждён');
    expect(formatTtsProviderSetting('silero')).toBe('Silero v5.6');
  });
});
