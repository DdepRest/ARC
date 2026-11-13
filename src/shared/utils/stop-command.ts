/**
 * Shared Stop Command Evaluator for A.R.C.
 * Unified recognition logic for voice and chat across Main and Renderer processes.
 */

export const STOP_WORDS_REGEX = /^(стоп|stop|cnjg|хватит|молчи|замолчи|заткнись|тихо|тишина|прекрати|cancel|пауза|отмена|отбой|выключи|закрой)$/i;

export const WAKE_WORDS_CLEANUP = ['арк', 'arc', 'а.р.к.', 'a.r.c.', 'арок', 'ар', 'арка', 'акр', 'орк', 'орг', 'харк', 'арт', 'арц'];

export function isStopCommand(text: string): boolean {
  if (!text) return false;
  const cleanLower = text.toLowerCase().trim().replace(/[.,!?]/g, '').trim();

  // If text explicitly targets music/playback, it must be handled by media controller, not hard stop!
  if (/(?:музык|трек|песн|плеер|вк\b|vk\b|вконтакте|радио)/i.test(cleanLower)) {
    return false;
  }

  let commandWithoutWake = cleanLower;
  for (const w of WAKE_WORDS_CLEANUP) {
    if (commandWithoutWake.startsWith(w + ' ')) {
      commandWithoutWake = commandWithoutWake.substring(w.length + 1).trim();
    } else if (commandWithoutWake.endsWith(' ' + w)) {
      commandWithoutWake = commandWithoutWake.substring(0, commandWithoutWake.length - (w.length + 1)).trim();
    }
  }

  return STOP_WORDS_REGEX.test(commandWithoutWake) || STOP_WORDS_REGEX.test(cleanLower);
}

export function isGratitudeCommand(text: string): boolean {
  if (!text) return false;
  let clean = text.toLowerCase().trim().replace(/ё/g, 'е').replace(/[.,!?:;—–]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const w of WAKE_WORDS_CLEANUP) {
    const wNorm = w.replace(/ё/g, 'е');
    if (clean.startsWith(wNorm + ' ')) {
      clean = clean.substring(wNorm.length + 1).trim();
    } else if (clean.endsWith(' ' + wNorm)) {
      clean = clean.substring(0, clean.length - (wNorm.length + 1)).trim();
    }
  }
  // Strip optional address pronouns and polite suffixes
  clean = clean.replace(/(?:^|\s)(?:тебе|тебя|вам|вас|друг)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

  return /^(?:(?:все\s+)?(?:спасибо(?:чки)?|благодарю|благодарствую|спасибки|пасиб(?:о)?|от\s+души|thanks|thank\s+you|thx|cgfcbf)(?:\s+(?:большое|огромное))?|(?:большое|огромное)\s+спасибо(?:чки)?|спасибо(?:\s+большое)?\s+все)$/i.test(clean);
}
