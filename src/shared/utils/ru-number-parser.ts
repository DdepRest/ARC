/**
 * Russian Spoken Number & Media Phonetics Normalizer
 * Converts Russian number words (from STT) into digits (0..100)
 * and normalizes colloquial volume/media expressions.
 */

const TENS_MAP: Record<string, number> = {
  'двадцать': 20,
  'двадцати': 20,
  'тридцать': 30,
  'тридцати': 30,
  'сорок': 40,
  'сорока': 40,
  'пятьдесят': 50,
  'пятидесяти': 50,
  'полтинник': 50,
  'шестьдесят': 60,
  'шестидесяти': 60,
  'семьдесят': 70,
  'семидесяти': 70,
  'восемьдесят': 80,
  'восьмидесяти': 80,
  'девяносто': 90,
  'девяноста': 90
};

const TEENS_AND_EXACT_MAP: Record<string, number> = {
  'сто': 100,
  'ста': 100,
  'сотку': 100,
  'соточку': 100,
  'десять': 10,
  'десяти': 10,
  'одиннадцать': 11,
  'одиннадцати': 11,
  'двенадцать': 12,
  'двенадцати': 12,
  'тринадцать': 13,
  'тринадцати': 13,
  'четырнадцать': 14,
  'четырнадцати': 14,
  'пятнадцать': 15,
  'пятнадцати': 15,
  'шестнадцать': 16,
  'шестнадцати': 16,
  'семнадцать': 17,
  'семнадцати': 17,
  'восемнадцать': 18,
  'восемнадцати': 18,
  'девятнадцать': 19,
  'девятнадцати': 19
};

const UNITS_MAP: Record<string, number> = {
  'ноль': 0,
  'нуль': 0,
  'нуля': 0,
  'один': 1,
  'одна': 1,
  'одну': 1,
  'одного': 1,
  'два': 2,
  'две': 2,
  'двух': 2,
  'три': 3,
  'трех': 3,
  'трёх': 3,
  'четыре': 4,
  'четырех': 4,
  'четырёх': 4,
  'пять': 5,
  'пяти': 5,
  'шесть': 6,
  'шести': 6,
  'семь': 7,
  'семи': 7,
  'восемь': 8,
  'восьми': 8,
  'девять': 9,
  'девяти': 9
};

/**
 * Converts Russian spoken numbers (0-100) and colloquial volume presets in a string to digits.
 */
export function normalizeRussianNumbers(input: string): string {
  if (!input) return '';

  let result = input
    // Colloquial volume presets
    .replace(/(?:на\s+половину|наполовину|вполовину|половину\s+громкости|пол\s+громкости|средн(?:юю|яя)\s+громкость)/giu, 'на 50 процентов')
    .replace(/(?:на\s+максимум|на\s+полную|на\s+всю(?:\s+катушку)?|максимальн(?:ую|ая)\s+громкость)/giu, 'на 100 процентов')
    .replace(/(?:на\s+минимум|минимальн(?:ую|ая)\s+громкость)/giu, 'на 5 процентов')
    .replace(/на\s+четверть/giu, 'на 25 процентов');

  const tokens = result.split(/\s+/);
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const rawToken = tokens[i];
    const cleanToken = rawToken.toLowerCase().replace(/[^а-яёa-z0-9%]/gi, '');
    const trailingPunct = rawToken.slice(cleanToken.length);

    if (TENS_MAP[cleanToken] !== undefined) {
      const tensVal = TENS_MAP[cleanToken];
      // Check if next token is a unit (1..9), e.g., "двадцать пять" -> 25
      if (i + 1 < tokens.length) {
        const nextRaw = tokens[i + 1];
        const nextClean = nextRaw.toLowerCase().replace(/[^а-яёa-z0-9%]/gi, '');
        const nextTrailing = nextRaw.slice(nextClean.length);
        if (UNITS_MAP[nextClean] !== undefined && UNITS_MAP[nextClean] > 0) {
          out.push(`${tensVal + UNITS_MAP[nextClean]}${nextTrailing}`);
          i++;
          continue;
        }
      }
      out.push(`${tensVal}${trailingPunct}`);
      continue;
    }

    if (TEENS_AND_EXACT_MAP[cleanToken] !== undefined) {
      out.push(`${TEENS_AND_EXACT_MAP[cleanToken]}${trailingPunct}`);
      continue;
    }

    if (UNITS_MAP[cleanToken] !== undefined) {
      out.push(`${UNITS_MAP[cleanToken]}${trailingPunct}`);
      continue;
    }

    out.push(rawToken);
  }

  return out.join(' ');
}

/**
 * Normalizes STT phonetic artifacts for VK Music & media commands.
 */
export function normalizeMediaPhonetics(input: string): string {
  if (!input) return '';
  return (' ' + input + ' ')
    .replace(/(?:^|\s)в\s+ключ(?:и|ить|ай)?(?=\s|$)/giu, ' включи ')
    .replace(/(?:^|\s)п(?:о)?лечи\s+музык/giu, ' включи музык')
    .replace(/(?:^|\s)музыкого\s+[kк](?=\s|$)/giu, ' музыку вк ')
    .replace(/(?:^|\s)(?:музу|музыку|музыка)\s+(?:кулука|лука|кулака)(?=\s|$)/giu, ' музыку вк ')
    .replace(/(?:^|\s)(?:пк|п\s+к)\s+музык[а-я]?(?=\s|$)/giu, ' музыку вк ')
    .replace(/(?:^|\s)музык[а-я]?\s+(?:в\s+)?(?:ока|ака|ак|в\s+к|вка|лка|кулака|кулука|vk|к)(?=\s|$)/giu, ' музыку вк ')
    .replace(/(?:^|\s)поставь\s+(?:пока|рука|река|руку)\s+на\s+пауз[а-я]?(?=\s|$)/giu, ' поставь трек на паузу ')
    .replace(/(?:^|\s)на\s+пауза(?=\s|$)/giu, ' на паузу ')
    .replace(/(?:^|\s)трак(?=\s|$)/giu, ' трек ')
    .replace(/(?:^|\s)в\s+контакт[а-я]?(?=\s|$)/giu, ' вконтакте ')
    .replace(/(?:^|\s)в\s+к(?=\s|$)/giu, ' вк ')
    .replace(/\s+/g, ' ')
    .trim();
}
