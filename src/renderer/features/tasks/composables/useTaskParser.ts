import { Ref } from 'vue';
import { TaskCategory } from '../types';

export interface ParsedTaskResult {
  cleanedText: string;
  parsedCategory: string | null;
  parsedPriority: 'low' | 'medium' | 'high' | null;
  parsedDueDate: string | null;
  parsedIsMyDay: boolean;
}

export function useTaskParser(
  categories: Ref<TaskCategory[]>,
  addCategory: (name: string) => string
) {
  const parseSmartTaskInput = (rawText: string): ParsedTaskResult => {
    let cleanedText = rawText;
    let parsedCategory: string | null = null;
    let parsedPriority: 'low' | 'medium' | 'high' | null = null;
    let parsedDueDate: string | null = null;
    let parsedIsMyDay = false;

    // 1. Priority tags: !high, !medium, !low or !1, !2, !3
    if (/!(high|1|высокий)/i.test(cleanedText)) {
      parsedPriority = 'high';
      cleanedText = cleanedText.replace(/!(high|1|высокий)/gi, '');
    } else if (/!(medium|2|средний)/i.test(cleanedText)) {
      parsedPriority = 'medium';
      cleanedText = cleanedText.replace(/!(medium|2|средний)/gi, '');
    } else if (/!(low|3|низкий)/i.test(cleanedText)) {
      parsedPriority = 'low';
      cleanedText = cleanedText.replace(/!(low|3|низкий)/gi, '');
    }

    // 2. Category tags: #category
    const catMatch = cleanedText.match(/#([a-zA-Z0-9_\u0400-\u04FF]+)/);
    if (catMatch) {
      const catNameOrId = catMatch[1].toLowerCase();
      const existing = categories.value.find(c => c.id === catNameOrId || c.name.toLowerCase() === catNameOrId);
      if (existing) {
        parsedCategory = existing.id;
      } else {
        const createdId = addCategory(catMatch[1]);
        parsedCategory = createdId;
      }
      cleanedText = cleanedText.replace(/#([a-zA-Z0-9_\u0400-\u04FF]+)/g, '');
    }

    // 3. Due Date tags: @today, @tomorrow, @сегодня, @завтра, @YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];

    if (/(?:@|)(today|сегодня)\b/i.test(cleanedText)) {
      parsedDueDate = todayStr;
      cleanedText = cleanedText.replace(/(?:@|)(today|сегодня)\b/gi, '');
    } else if (/(?:@|)(tomorrow|завтра)\b/i.test(cleanedText)) {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      parsedDueDate = tom.toISOString().split('T')[0];
      cleanedText = cleanedText.replace(/(?:@|)(tomorrow|завтра)\b/gi, '');
    } else if (/(?:@|)next week\b|на следующей неделе/i.test(cleanedText)) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      parsedDueDate = nextWeek.toISOString().split('T')[0];
      cleanedText = cleanedText.replace(/(?:@|)next week\b|на следующей неделе/gi, '');
    } else {
      const weekdayMatch = cleanedText.match(/(?:в |во |on |@)?(понедельник|вторник|сред[уа]|четверг|пятниц[уа]|суббот[уа]|воскресенье|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      if (weekdayMatch) {
        const dayStr = weekdayMatch[1].toLowerCase();
        let targetDay = 1;
        if (dayStr.startsWith('пон') || dayStr.startsWith('mon')) targetDay = 1;
        else if (dayStr.startsWith('вт') || dayStr.startsWith('tue')) targetDay = 2;
        else if (dayStr.startsWith('ср') || dayStr.startsWith('wed')) targetDay = 3;
        else if (dayStr.startsWith('чет') || dayStr.startsWith('thu')) targetDay = 4;
        else if (dayStr.startsWith('пят') || dayStr.startsWith('fri')) targetDay = 5;
        else if (dayStr.startsWith('суб') || dayStr.startsWith('sat')) targetDay = 6;
        else if (dayStr.startsWith('вос') || dayStr.startsWith('sun')) targetDay = 0;

        const d = new Date();
        const currentDay = d.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        parsedDueDate = d.toISOString().split('T')[0];
        cleanedText = cleanedText.replace(weekdayMatch[0], '');
      } else {
        const dateMatch = cleanedText.match(/@(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          parsedDueDate = dateMatch[1];
          cleanedText = cleanedText.replace(/@(\d{4}-\d{2}-\d{2})/, '');
        }
      }
    }

    // 4. My Day tags: ☀️, @myday, @день
    if (/☀️|@(myday|день)/i.test(cleanedText)) {
      parsedIsMyDay = true;
      cleanedText = cleanedText.replace(/☀️|@(myday|день)/gi, '');
    }

    return {
      cleanedText: cleanedText.trim().replace(/\s+/g, ' '),
      parsedCategory,
      parsedPriority,
      parsedDueDate,
      parsedIsMyDay
    };
  };

  return {
    parseSmartTaskInput
  };
}
