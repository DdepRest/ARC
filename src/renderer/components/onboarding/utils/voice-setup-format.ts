export type VoiceHealthState =
  | 'runtime_missing'
  | 'dependencies_missing'
  | 'model_missing'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'cancelled';

export type VoiceSetupChoiceMode = 'setup_now' | 'later' | 'system_fallback';

export interface VoiceComponentItem {
  id: string;
  title: string;
  tier: 'baseline' | 'optional';
  source: string;
  exactBytes: number | null;
  sizeLabel: string;
  diskRequiredBytes: number | null;
  networkRequired: boolean;
  installed: boolean;
  state: VoiceHealthState;
}

export interface VoiceStatusSnapshot {
  overallState: VoiceHealthState;
  mode: VoiceSetupChoiceMode;
  inProgress: boolean;
  isPaused: boolean;
  activeComponentId: string | null;
  bytesDone: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  error: string | null;
  totalKnownDownloadBytes: number;
  totalKnownDiskRequiredBytes: number;
  hasUnknownSizeComponent: boolean;
  components: VoiceComponentItem[];
}

export function formatVoiceBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return 'неизвестен';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} МБ`;
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

export function formatVoiceSpeed(bps: number): string {
  if (!bps || bps <= 0) return '0 B/s';
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

export function formatVoiceStateLabel(st: VoiceHealthState): string {
  const labels: Record<VoiceHealthState, string> = {
    runtime_missing: 'runtime_missing · нет Python',
    dependencies_missing: 'dependencies_missing · нет пакетов',
    model_missing: 'model_missing · не скачано',
    downloading: 'downloading · загрузка',
    verifying: 'verifying · проверка SHA-256',
    ready: 'ready · готов',
    degraded: 'degraded · системный fallback',
    failed: 'failed · ошибка',
    cancelled: 'cancelled · отменено'
  };
  return labels[st] || st;
}

export function voiceStateColorClass(st: VoiceHealthState): string {
  if (st === 'ready') return 'text-[var(--status-ok)] border-[var(--status-ok)]';
  if (st === 'downloading' || st === 'verifying') return 'text-[var(--accent)] border-[var(--accent)]';
  if (st === 'failed') return 'text-[var(--status-err)] border-[var(--status-err)]';
  if (st === 'degraded' || st === 'cancelled') return 'text-[var(--status-warn)] border-[var(--status-warn)]';
  return 'text-[var(--arc-text-muted)] border-[var(--arc-hairline)]';
}
