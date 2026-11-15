import type { ArcReleaseEntry, ChangeType } from '../config/releases.registry';

export interface UpdatesSummaryItem {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'ok' | 'warn' | 'err' | 'accent' | 'off';
}

export type UpdatesFilterId = 'all' | ChangeType;
export type UpdateCheckState = 'idle' | 'up-to-date' | 'update-available' | 'error' | 'no-ipc';

export const UPDATE_FILTER_OPTIONS: { id: UpdatesFilterId; labelRu: string; labelEn: string }[] = [
  { id: 'all', labelRu: 'Все', labelEn: 'All' },
  { id: 'feature', labelRu: 'Новое', labelEn: 'New' },
  { id: 'improvement', labelRu: 'Улучшения', labelEn: 'Improvements' },
  { id: 'fix', labelRu: 'Исправления', labelEn: 'Fixes' }
];

export const CHANGE_TYPE_META: Record<ChangeType, { labelRu: string; labelEn: string; dotClass: string; textClass: string }> = {
  feature: { labelRu: 'НОВОЕ', labelEn: 'NEW', dotClass: 'bg-[var(--accent)]', textClass: 'text-[var(--accent)]' },
  improvement: { labelRu: 'УЛУЧШЕНИЕ', labelEn: 'IMPROVED', dotClass: 'bg-[var(--status-ok)]', textClass: 'text-[var(--status-ok)]' },
  fix: { labelRu: 'ИСПРАВЛЕНИЕ', labelEn: 'FIXED', dotClass: 'bg-[var(--status-warn)]', textClass: 'text-[var(--status-warn)]' }
};

export function getUpdatesPresentation(params: {
  isEn: boolean;
  isChecking: boolean;
  checkState: UpdateCheckState;
  latestVersion: string;
  lastCheckedTime: string;
  updateError: string;
  currentVersion: string;
  currentBuild: string;
  releasesCount: number;
  totalChangesCount: number;
}) {
  const { isEn, isChecking, checkState, latestVersion, lastCheckedTime, updateError, currentVersion, currentBuild, releasesCount, totalChangesCount } = params;

  const headerStatus = isChecking
    ? { label: isEn ? 'CHECKING...' : 'ПРОВЕРКА...', tone: 'warn' as const }
    : checkState === 'update-available'
      ? { label: `v${latestVersion} AVAILABLE`, tone: 'warn' as const }
      : checkState === 'up-to-date'
        ? { label: isEn ? `UP TO DATE · v${currentVersion}` : `АКТУАЛЬНО · v${currentVersion}`, tone: 'ok' as const }
        : checkState === 'error'
          ? { label: isEn ? 'CHECK FAILED' : 'ОШИБКА СЕТИ', tone: 'err' as const }
          : checkState === 'no-ipc'
            ? { label: isEn ? 'NO IPC' : 'БЕЗ IPC', tone: 'off' as const }
            : { label: `v${currentVersion} · BUILD ${currentBuild}`, tone: 'accent' as const };

  const statusText = isChecking
    ? (isEn ? 'Checking GitHub Releases...' : 'Запрос к GitHub Releases...')
    : checkState === 'up-to-date'
      ? (isEn ? `Up to date (checked at ${lastCheckedTime})` : `Установлена актуальная версия (${lastCheckedTime})`)
      : checkState === 'update-available'
        ? (isEn ? `Update v${latestVersion} available` : `Доступна новая версия v${latestVersion}`)
        : checkState === 'error'
          ? (updateError || (isEn ? 'Update check failed' : 'Ошибка проверки обновлений'))
          : checkState === 'no-ipc'
            ? (isEn ? 'Update IPC unavailable in browser preview' : 'Канал обновлений недоступен (нет IPC)')
            : (isEn ? 'Not checked yet · Click Check Updates' : 'Проверка не выполнялась · Запустите вручную');

  const dotClass = checkState === 'up-to-date'
    ? 'bg-[var(--status-ok)]'
    : checkState === 'error'
      ? 'bg-[var(--status-err)]'
      : isChecking || checkState === 'update-available'
        ? 'bg-[var(--status-warn)]'
        : 'bg-[var(--arc-text-muted)]';

  const textClass = checkState === 'up-to-date'
    ? 'text-[var(--status-ok)]'
    : checkState === 'error'
      ? 'text-[var(--status-err)]'
      : isChecking || checkState === 'update-available'
        ? 'text-[var(--status-warn)]'
        : 'text-[var(--arc-text-secondary)]';

  const stateValue = isChecking
    ? (isEn ? 'Checking' : 'Проверка')
    : checkState === 'up-to-date'
      ? (isEn ? 'Up to date' : 'Актуально')
      : checkState === 'update-available'
        ? `v${latestVersion}`
        : checkState === 'error'
          ? (isEn ? 'Error' : 'Ошибка')
          : checkState === 'no-ipc'
            ? (isEn ? 'No IPC' : 'Без IPC')
            : (isEn ? 'Not checked' : 'Не проверено');

  const stateTone: UpdatesSummaryItem['tone'] = isChecking
    ? 'warn'
    : checkState === 'up-to-date'
      ? 'ok'
      : checkState === 'update-available'
        ? 'warn'
        : checkState === 'error'
          ? 'err'
          : 'off';

  const summaryItems: UpdatesSummaryItem[] = [
    { label: isEn ? 'Active Version' : 'Активная сборка', value: `v${currentVersion}`, tone: 'accent', detail: `Build ${currentBuild}` },
    { label: isEn ? 'Update Status' : 'Статус обновлений', value: stateValue, tone: stateTone, detail: 'Stable · GitHub Releases' },
    { label: isEn ? 'Releases Logged' : 'Версий в журнале', value: String(releasesCount), tone: 'default', detail: `${totalChangesCount} изменений` },
    { label: isEn ? 'Release Spec' : 'Эталон релиза', value: 'Silero v5.6', tone: 'default', detail: 'GigaAM CTC 220M' }
  ];

  return { headerStatus, statusText, dotClass, textClass, summaryItems };
}

export function filterReleaseEntries(releases: ArcReleaseEntry[], activeFilter: UpdatesFilterId, query: string) {
  const q = query.trim().toLowerCase();
  return releases
    .map((rel) => ({
      ...rel,
      filteredChanges: rel.changes.filter((ch) => {
        if (activeFilter !== 'all' && ch.type !== activeFilter) return false;
        if (!q) return true;
        return (
          rel.version.toLowerCase().includes(q) ||
          rel.buildHash.toLowerCase().includes(q) ||
          ch.subsystem.toLowerCase().includes(q) ||
          ch.titleRu.toLowerCase().includes(q) ||
          ch.titleEn.toLowerCase().includes(q) ||
          ch.detailsRu.toLowerCase().includes(q) ||
          ch.detailsEn.toLowerCase().includes(q)
        );
      })
    }))
    .filter((rel) => rel.filteredChanges.length > 0);
}
