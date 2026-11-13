import { RecurrenceRule } from '../types';

export const WEEKDAYS_LIST = [
  { day: 1, label: 'Пн', full: 'Понедельник' },
  { day: 2, label: 'Вт', full: 'Вторник' },
  { day: 3, label: 'Ср', full: 'Среда' },
  { day: 4, label: 'Чт', full: 'Четверг' },
  { day: 5, label: 'Пт', full: 'Пятница' },
  { day: 6, label: 'Сб', full: 'Суббота' },
  { day: 0, label: 'Вс', full: 'Воскресенье' }
];

export const RECURRENCE_PRESETS = [
  { id: 'none', label: 'Без повторов' },
  { id: 'daily', label: 'Каждый день' },
  { id: 'workdays', label: 'Пн-Пт (Будни)' },
  { id: 'weekly', label: 'Каждую неделю' },
  { id: 'biweekly', label: 'Раз в 2 недели' },
  { id: 'monthly', label: 'Каждый месяц' }
];

export function calculateNextRecurrenceDate(dateStr?: string, rule?: RecurrenceRule): string | undefined {
  if (!dateStr || !rule || rule.type === 'none') return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return undefined;

  const interval = Math.max(1, rule.interval || 1);

  if (rule.type === 'daily') {
    date.setDate(date.getDate() + interval);
  } else if (rule.type === 'weekly' || rule.type === 'custom') {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      let found = false;

      for (let dayOffset = 0; dayOffset < 7 * interval * 12; dayOffset++) {
        const jsDay = nextDate.getDay();
        if (rule.daysOfWeek.includes(jsDay)) {
          found = true;
          break;
        }
        nextDate.setDate(nextDate.getDate() + 1);
      }
      if (found) {
        return nextDate.toISOString().split('T')[0];
      }
      date.setDate(date.getDate() + 7 * interval);
    } else {
      date.setDate(date.getDate() + 7 * interval);
    }
  } else if (rule.type === 'monthly') {
    date.setMonth(date.getMonth() + interval);
  } else if (rule.type === 'yearly') {
    date.setFullYear(date.getFullYear() + interval);
  }
  return date.toISOString().split('T')[0];
}

export function formatRecurrenceSummary(
  type: string,
  intervalVal: number,
  days: number[],
  endType: string,
  count?: number,
  endDate?: string
): string {
  if (type === 'none') return 'Без повторов';
  const interval = Math.max(1, intervalVal || 1);
  let typeStr = '';
  if (type === 'daily') typeStr = interval === 1 ? 'день' : 'дн.';
  else if (type === 'weekly' || type === 'custom') typeStr = interval === 1 ? 'неделю' : 'нед.';
  else if (type === 'monthly') typeStr = interval === 1 ? 'месяц' : 'мес.';
  else if (type === 'yearly') typeStr = interval === 1 ? 'год' : 'лет';

  let text = `Повторять каждые ${interval > 1 ? interval + ' ' : ''}${typeStr}`;
  if (days.length > 0) {
    const dayNames = WEEKDAYS_LIST
      .filter(w => days.includes(w.day))
      .map(w => w.label)
      .join(', ');
    text += ` (${dayNames})`;
  }

  if (endType === 'never') {
    text += ' • ♾️ Бесконечно (пока не отмените)';
  } else if (endType === 'after_occurrences') {
    text += ` • 🔢 Завершится через ${count || 10} повторов`;
  } else if (endType === 'on_date') {
    text += ` • 📅 До ${endDate || 'указанной даты'}`;
  }

  return text;
}

export function getRecurrenceHumanText(rule?: RecurrenceRule): string {
  if (!rule || rule.type === 'none') return 'Без повторов';
  const interval = rule.interval || 1;
  let typeStr = '';
  if (rule.type === 'daily') typeStr = interval === 1 ? 'день' : 'дн.';
  else if (rule.type === 'weekly' || rule.type === 'custom') typeStr = interval === 1 ? 'неделю' : 'нед.';
  else if (rule.type === 'monthly') typeStr = interval === 1 ? 'месяц' : 'мес.';
  else if (rule.type === 'yearly') typeStr = interval === 1 ? 'год' : 'лет';

  let text = `Повторять каждые ${interval > 1 ? interval + ' ' : ''}${typeStr}`;
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayNames = WEEKDAYS_LIST
      .filter(w => rule.daysOfWeek?.includes(w.day))
      .map(w => w.label)
      .join(', ');
    text += ` (${dayNames})`;
  }

  if (rule.endType === 'after_occurrences') {
    text += ` • 🔢 До ${rule.count || 10} раз`;
  } else if (rule.endType === 'on_date') {
    text += ` • 📅 До ${rule.endDate || 'даты'}`;
  } else {
    text += ' • ♾️ Бесконечно';
  }

  return text;
}

export function getRecurrenceBadgeLabel(rule?: RecurrenceRule): string {
  if (!rule || rule.type === 'none') return '';
  const interval = rule.interval || 1;
  const prefix = interval > 1 ? `${interval} ` : '';
  const infSuffix = rule.endType === 'never' || !rule.endType ? ' ♾️' : '';
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayNames = WEEKDAYS_LIST
      .filter(w => rule.daysOfWeek?.includes(w.day))
      .map(w => w.label)
      .join(', ');
    return `${prefix}НЕК. (${dayNames})${infSuffix}`;
  }
  if (rule.type === 'daily') return `${prefix}ДЕНЬ${infSuffix}`;
  if (rule.type === 'weekly') return `${prefix}НЕДЕЛЯ${infSuffix}`;
  if (rule.type === 'monthly') return `${prefix}МЕСЯЦ${infSuffix}`;
  if (rule.type === 'yearly') return `${prefix}ГОД${infSuffix}`;
  return `${prefix}ПОВТОР${infSuffix}`;
}
