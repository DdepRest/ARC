export type SubsystemTone = 'ok' | 'warn' | 'err' | 'off' | 'accent' | 'default';
export type TtsEngineKind = 'silero' | 'edge' | 'system' | 'unavailable';
export type TtsServerStatusKind = 'unknown' | 'checking' | 'online' | 'offline';
export type TtsPronunciationState = 'READY' | 'DEGRADED' | 'ERROR';

export interface TtsDictionariesDiag {
  state?: TtsPronunciationState | string;
  bundledDir?: string;
  userDir?: string;
  bundledCounts?: { totalFilesLoaded?: number; totalEntries?: number };
  userOverrideCounts?: { totalOverrides?: number; totalFiles?: number };
  errors?: string[];
  lastLoadedAt?: string | null;
}

export interface TtsDependenciesDiag {
  state?: TtsPronunciationState | string;
  phase?: string;
  activePackage?: string | null;
  coreReady?: boolean;
  dspReady?: boolean;
  accentReady?: boolean;
  ffmpegReady?: boolean;
  reason?: string;
  missingCore?: string[];
  missingOptional?: string[];
  errors?: string[];
}

export function formatTtsEngineName(engine: string | null | undefined): string {
  if (!engine) return 'Не подтверждён';
  const map: Record<string, string> = { silero: 'Silero', edge: 'Edge TTS', system: 'Native SAPI', unavailable: 'Недоступен' };
  return map[engine] ?? engine;
}

export function formatTtsProviderSetting(provider: string): string {
  switch (provider) {
    case 'auto': return 'Auto';
    case 'silero': return 'Silero v5.6';
    case 'edge': return 'Edge TTS';
    case 'native': return 'Native SAPI';
    default: return provider ? provider.toUpperCase() : 'Не выбран';
  }
}

export function computeDictionariesStatus(
  diag: TtsDictionariesDiag | null | undefined,
  isElectronAvailable: boolean
): { label: string; tone: SubsystemTone; detail: string } {
  if (!isElectronAvailable) return { label: 'Словари: Без IPC', tone: 'off', detail: 'IPC-канал недоступен в браузере' };
  if (!diag) return { label: 'Словари: Не проверены', tone: 'off', detail: 'Статус словарей произношения ещё не получен' };
  const bundledFiles = diag.bundledCounts?.totalFilesLoaded ?? 0;
  const overrides = diag.userOverrideCounts?.totalOverrides ?? 0;
  const firstErr = diag.errors?.[0];
  if (diag.state === 'READY') {
    const dirNote = diag.bundledDir ? ` · ${diag.bundledDir}` : '';
    return {
      label: overrides > 0 ? `Словари: Готовы (+${overrides})` : 'Словари: Готовы',
      tone: 'ok',
      detail: `Комплектных: ${bundledFiles}/3 · Пользовательских: ${overrides}${dirNote}`
    };
  }
  if (diag.state === 'DEGRADED') {
    return { label: 'Словари: Ограничено', tone: 'warn', detail: firstErr || `Загружено ${bundledFiles}/3 комплектных словарей` };
  }
  return { label: 'Словари: Ошибка', tone: 'err', detail: firstErr || 'Не удалось загрузить словари произношения' };
}

export function computeDependenciesStatus(
  diag: TtsDependenciesDiag | null | undefined,
  isElectronAvailable: boolean
): { label: string; tone: SubsystemTone; detail: string } {
  if (!isElectronAvailable) return { label: 'Python: Без IPC', tone: 'off', detail: 'IPC-канал недоступен в браузере' };
  if (!diag) return { label: 'Python: Не проверен', tone: 'off', detail: 'Статус Python-зависимостей ещё не получен' };
  if (diag.phase === 'INSTALLING_CORE' || diag.phase === 'INSTALLING_ACCENT' || diag.phase === 'CHECKING') {
    const pkg = diag.activePackage ? ` (${diag.activePackage})` : '';
    return { label: 'Python: Установка...', tone: 'warn', detail: `Выполняется этап ${diag.phase}${pkg}` };
  }
  if (diag.state === 'READY') {
    return { label: 'Python: Готов', tone: 'ok', detail: 'Core, RUAccent и DSP (FFmpeg) готовы' };
  }
  const firstErr = diag.errors?.[0];
  if (diag.state === 'DEGRADED' && diag.coreReady !== false) {
    const notes = [
      diag.accentReady === false ? 'без RUAccent (встроенные ударения)' : null,
      diag.dspReady === false ? 'без FFmpeg/DSP' : null
    ].filter(Boolean);
    return {
      label: 'Python: Ограничено',
      tone: 'warn',
      detail: notes.length ? `Ядро работает · ${notes.join(', ')}` : (firstErr || 'Опциональные компоненты недоступны')
    };
  }
  return {
    label: 'Python: Ошибка',
    tone: 'err',
    detail: firstErr || (diag.reason ? `Ошибка: ${diag.reason}` : 'Отсутствуют обязательные пакеты ядра Silero')
  };
}
