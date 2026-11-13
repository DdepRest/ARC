import { RecurrenceRule } from '../types';

export const weekdaysList = [
  { day: 1, label: 'Пн' }, { day: 2, label: 'Вт' }, { day: 3, label: 'Ср' },
  { day: 4, label: 'Чт' }, { day: 5, label: 'Пт' }, { day: 6, label: 'Сб' }, { day: 0, label: 'Вс' }
];

export const getRecurrenceHumanText = (rule?: RecurrenceRule): string => {
  if (!rule || rule.type === 'none') return 'Без повторов';
  const interval = rule.interval || 1;
  let typeStr = '';
  if (rule.type === 'daily') typeStr = interval === 1 ? 'день' : 'дн.';
  else if (rule.type === 'weekly' || rule.type === 'custom') typeStr = interval === 1 ? 'неделю' : 'нед.';
  else if (rule.type === 'monthly') typeStr = interval === 1 ? 'месяц' : 'мес.';
  else if (rule.type === 'yearly') typeStr = interval === 1 ? 'год' : 'лет';

  let text = `Повторять каждые ${interval > 1 ? interval + ' ' : ''}${typeStr}`;
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayNames = weekdaysList
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
};

export const getRecurrenceBadgeLabel = (rule?: RecurrenceRule): string => {
  if (!rule || rule.type === 'none') return '';
  const interval = rule.interval || 1;
  const prefix = interval > 1 ? `${interval} ` : '';
  const infSuffix = rule.endType === 'never' || !rule.endType ? ' ♾️' : '';
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayNames = weekdaysList
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
};

export const detectSmartTags = (txt: string): string[] | null => {
  if (!txt) return null;
  const tags: string[] = [];
  if (/!(high|1|высокий)/i.test(txt)) tags.push('🔥 High Prio');
  else if (/!(medium|2|средний)/i.test(txt)) tags.push('⚡ Medium Prio');
  else if (/!(low|3|низкий)/i.test(txt)) tags.push('📋 Low Prio');

  const catMatch = txt.match(/#([a-zA-Z0-9_\u0400-\u04FF]+)/);
  if (catMatch) tags.push(`🏷️ #${catMatch[1]}`);

  if (/(?:@|)(today|сегодня)\b/i.test(txt)) tags.push('📅 Сегодня');
  else if (/(?:@|)(tomorrow|завтра)\b/i.test(txt)) tags.push('📅 Завтра');
  else if (/(?:@|)next week\b|на следующей неделе/i.test(txt)) tags.push('📅 На след. неделе');
  else {
    const weekdayMatch = txt.match(/(?:в |во |on |@)?(понедельник|вторник|сред[уа]|четверг|пятниц[уа]|суббот[уа]|воскресенье|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (weekdayMatch) {
      tags.push(`📅 ${weekdayMatch[1].charAt(0).toUpperCase() + weekdayMatch[1].slice(1)}`);
    } else {
      const dMatch = txt.match(/@(\d{4}-\d{2}-\d{2})/);
      if (dMatch) tags.push(`📅 ${dMatch[1]}`);
    }
  }

  if (/☀️|@(myday|день)/i.test(txt)) tags.push('☀️ В "Мой день"');

  return tags.length > 0 ? tags : null;
};
