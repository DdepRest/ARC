import { computed, watch, Ref } from 'vue';
import { SelectOption } from '../types';

export interface NLPTokenBadge {
  type: 'priority' | 'category' | 'date' | 'myday';
  raw: string;
  label: string;
  colorClass: string;
}

export function useTaskNLP(
  textRef: Ref<string>,
  categoryOptions: Ref<SelectOption[]>,
  emitPriority?: (val: string) => void,
  emitCategory?: (val: string) => void,
  emitDueDate?: (val: string) => void
) {
  const todayStr = () => new Date().toISOString().split('T')[0];
  const tomorrowStr = () => new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const detectedTokens = computed<NLPTokenBadge[]>(() => {
    const txt = textRef.value || '';
    if (!txt.trim()) return [];
    const tokens: NLPTokenBadge[] = [];

    // 1. Priority tokens (!high, !1, !высокий, !medium, !2, !low, !3)
    const prioHigh = txt.match(/!(high|1|высокий)\b/i);
    const prioMed = txt.match(/!(medium|2|средний)\b/i);
    const prioLow = txt.match(/!(low|3|низкий)\b/i);

    if (prioHigh) {
      tokens.push({
        type: 'priority',
        raw: prioHigh[0],
        label: 'P1 · Высокий',
        colorClass: 'text-[var(--status-err)] border-[var(--status-err)]'
      });
    } else if (prioMed) {
      tokens.push({
        type: 'priority',
        raw: prioMed[0],
        label: 'P2 · Средний',
        colorClass: 'text-[var(--status-warn)] border-[var(--status-warn)]'
      });
    } else if (prioLow) {
      tokens.push({
        type: 'priority',
        raw: prioLow[0],
        label: 'P3 · Обычный',
        colorClass: 'text-[var(--arc-text-secondary)] border-[var(--arc-hairline)]'
      });
    }

    // 2. Category token (#работа, #dev, etc.)
    const catMatch = txt.match(/#([a-zA-Z0-9_\u0400-\u04FF]+)/);
    if (catMatch) {
      tokens.push({
        type: 'category',
        raw: catMatch[0],
        label: `#${catMatch[1]}`,
        colorClass: 'text-[var(--accent)] border-[var(--accent)]'
      });
    }

    // 3. Date tokens (сегодня, завтра, @YYYY-MM-DD)
    const todayMatch = txt.match(/(?:@|\b)(today|сегодня)\b/i);
    const tomMatch = txt.match(/(?:@|\b)(tomorrow|завтра)\b/i);
    const isoMatch = txt.match(/@(\d{4}-\d{2}-\d{2})/);

    if (todayMatch) {
      tokens.push({
        type: 'date',
        raw: todayMatch[0],
        label: 'Сегодня',
        colorClass: 'text-[var(--status-warn)] border-[var(--status-warn)]'
      });
    } else if (tomMatch) {
      tokens.push({
        type: 'date',
        raw: tomMatch[0],
        label: 'Завтра',
        colorClass: 'text-[var(--status-ok)] border-[var(--status-ok)]'
      });
    } else if (isoMatch) {
      tokens.push({
        type: 'date',
        raw: isoMatch[0],
        label: isoMatch[1],
        colorClass: 'text-[var(--arc-text-primary)] border-[var(--arc-hairline)]'
      });
    }

    // 4. My Day token
    const myDayMatch = txt.match(/☀️|@(myday|день)\b/i);
    if (myDayMatch) {
      tokens.push({
        type: 'myday',
        raw: myDayMatch[0],
        label: 'В Мой день',
        colorClass: 'text-[var(--status-warn)] border-[var(--status-warn)]'
      });
    }

    return tokens;
  });

  // Auto-sync live tokens to form controls
  watch(
    () => textRef.value,
    (txt) => {
      if (!txt) return;
      if (emitPriority) {
        if (/!(high|1|высокий)\b/i.test(txt)) emitPriority('high');
        else if (/!(medium|2|средний)\b/i.test(txt)) emitPriority('medium');
        else if (/!(low|3|низкий)\b/i.test(txt)) emitPriority('low');
      }
      if (emitDueDate) {
        if (/(?:@|\b)(today|сегодня)\b/i.test(txt)) emitDueDate(todayStr());
        else if (/(?:@|\b)(tomorrow|завтра)\b/i.test(txt)) emitDueDate(tomorrowStr());
        else {
          const iso = txt.match(/@(\d{4}-\d{2}-\d{2})/);
          if (iso) emitDueDate(iso[1]);
        }
      }
      if (emitCategory && categoryOptions.value) {
        const catMatch = txt.match(/#([a-zA-Z0-9_\u0400-\u04FF]+)/);
        if (catMatch) {
          const q = catMatch[1].toLowerCase();
          const found = categoryOptions.value.find(
            (opt) =>
              String(opt.value).toLowerCase() === q ||
              String(opt.label).toLowerCase().includes(q)
          );
          if (found && found.value !== '__ADD_NEW__') {
            emitCategory(String(found.value));
          }
        }
      }
    }
  );

  return {
    detectedTokens
  };
}
