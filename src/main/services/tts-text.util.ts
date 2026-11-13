import crypto from 'crypto';

export function computeTtsHash(text: string, queryId?: string): string {
  const raw = queryId ? `${queryId}:${text.trim().toLowerCase()}` : text.trim().toLowerCase();
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_N = ['', 'одно', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function smallNumberToWords(n: number, gender: 'm' | 'f' | 'n' = 'm'): string {
  if (n === 0) return 'ноль';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  if (h > 0) parts.push(HUNDREDS[h]);
  const rem = n % 100;
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) {
      if (gender === 'f') parts.push(ONES_F[o]);
      else if (gender === 'n') parts.push(ONES_N[o]);
      else parts.push(ONES_M[o]);
    }
  }
  return parts.join(' ');
}

export function numberToRussianWords(num: number, gender: 'm' | 'f' | 'n' = 'm'): string {
  if (num === 0) return 'ноль';
  let n = Math.abs(num);
  const parts: string[] = [];
  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000);
    n %= 1000000;
    const mStr = smallNumberToWords(millions, 'm');
    const mod10 = millions % 10;
    const mod100 = millions % 100;
    let mWord = 'миллионов';
    if (mod100 < 11 || mod100 > 14) {
      if (mod10 === 1) mWord = 'миллион';
      else if (mod10 >= 2 && mod10 <= 4) mWord = 'миллиона';
    }
    parts.push(`${mStr} ${mWord}`);
  }
  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    n %= 1000;
    const tStr = smallNumberToWords(thousands, 'f');
    const mod10 = thousands % 10;
    const mod100 = thousands % 100;
    let tWord = 'тысяч';
    if (mod100 < 11 || mod100 > 14) {
      if (mod10 === 1) tWord = 'тысяча';
      else if (mod10 >= 2 && mod10 <= 4) tWord = 'тысячи';
    }
    parts.push(`${tStr} ${tWord}`);
  }
  if (n > 0) {
    parts.push(smallNumberToWords(n, gender));
  }
  return parts.join(' ');
}

function getDegreeDeclension(numStr: string): string {
  const num = Math.abs(parseInt(numStr, 10));
  const mod10 = num % 10;
  const mod100 = num % 100;

  if (mod100 >= 11 && mod100 <= 14) return 'градусов';
  if (mod10 === 1) return 'градус';
  if (mod10 >= 2 && mod10 <= 4) return 'градуса';
  return 'градусов';
}

function getPercentDeclension(n: number): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'процентов';
  if (mod10 === 1) return 'процент';
  if (mod10 >= 2 && mod10 <= 4) return 'процента';
  return 'процентов';
}

function getDollarDeclension(n: number): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'долларов';
  if (mod10 === 1) return 'доллар';
  if (mod10 >= 2 && mod10 <= 4) return 'доллара';
  return 'долларов';
}

function getRubleDeclension(n: number): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'рублей';
  if (mod10 === 1) return 'рубль';
  if (mod10 >= 2 && mod10 <= 4) return 'рубля';
  return 'рублей';
}

function getKmhDeclension(numStr: string): string {
  const num = Math.abs(parseInt(numStr, 10));
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'километров в час';
  if (mod10 === 1) return 'километр в час';
  if (mod10 >= 2 && mod10 <= 4) return 'километра в час';
  return 'километров в час';
}

function getMsDeclension(numStr: string): string {
  const num = Math.abs(parseInt(numStr, 10));
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'метров в секунду';
  if (mod10 === 1) return 'метр в секунду';
  if (mod10 >= 2 && mod10 <= 4) return 'метра в секунду';
  return 'метров в секунду';
}

const MONTHS_GENITIVE: Record<number, string> = {
  1: 'января', 2: 'февраля', 3: 'марта', 4: 'апреля', 5: 'мая', 6: 'июня',
  7: 'июля', 8: 'августа', 9: 'сентября', 10: 'октября', 11: 'ноября', 12: 'декабря'
};

const DAYS_ORDINAL: Record<number, string> = {
  1: 'первое', 2: 'второе', 3: 'третье', 4: 'четвёртое', 5: 'пятое',
  6: 'шестое', 7: 'седьмое', 8: 'восьмое', 9: 'девятое', 10: 'десятое',
  11: 'одиннадцатое', 12: 'двенадцатое', 13: 'тринадцатое', 14: 'четырнадцатое', 15: 'пятнадцатое',
  16: 'шестнадцатое', 17: 'семнадцатое', 18: 'восемнадцатое', 19: 'девятнадцатое', 20: 'двадцатое',
  21: 'двадцать первое', 22: 'двадцать второе', 23: 'двадцать третье', 24: 'двадцать четвёртое', 25: 'двадцать пятое',
  26: 'двадцать шестое', 27: 'двадцать седьмое', 28: 'двадцать восьмое', 29: 'двадцать девятое', 30: 'тридцатое',
  31: 'тридцать первое'
};

function convertYearToGenitive(year: number): string {
  if (year === 2000) return 'двухтысячного';
  const prefix = year >= 2000 ? 'две тысячи' : 'тысяча девятьсот';
  const lastTwo = year % 100;
  if (lastTwo === 0) return `${prefix}го`;

  const ORDINALS_GENITIVE_TENS: Record<number, string> = {
    10: 'десятого', 20: 'двадцатого', 30: 'тридцатого', 40: 'сорокового',
    50: 'пятидесятого', 60: 'шестидесятого', 70: 'семидесятого', 80: 'восьмидесятого', 90: 'девяностого'
  };
  const ORDINALS_GENITIVE_ONES: Record<number, string> = {
    1: 'первого', 2: 'второго', 3: 'третьего', 4: 'четвёртого', 5: 'пятого',
    6: 'шестого', 7: 'седьмого', 8: 'восьмого', 9: 'девятого',
    11: 'одиннадцатого', 12: 'двенадцатого', 13: 'тринадцатого', 14: 'четырнадцатого', 15: 'пятнадцатого',
    16: 'шестнадцатого', 17: 'семнадцатого', 18: 'восемнадцатого', 19: 'девятнадцатого'
  };
  const TENS_CARDINAL: Record<number, string> = {
    20: 'двадцать', 30: 'тридцать', 40: 'сорок', 50: 'пятьдесят',
    60: 'шестьдесят', 70: 'семьдесят', 80: 'восемьдесят', 90: 'девяносто'
  };

  if (ORDINALS_GENITIVE_TENS[lastTwo]) {
    return `${prefix} ${ORDINALS_GENITIVE_TENS[lastTwo]}`;
  }
  if (ORDINALS_GENITIVE_ONES[lastTwo]) {
    return `${prefix} ${ORDINALS_GENITIVE_ONES[lastTwo]}`;
  }
  const tens = Math.floor(lastTwo / 10) * 10;
  const ones = lastTwo % 10;
  return `${prefix} ${TENS_CARDINAL[tens]} ${ORDINALS_GENITIVE_ONES[ones]}`;
}

const ORDINAL_MAP_1_TO_10: Record<number, string> = {
  1: 'первый',
  2: 'вторая',
  3: 'третья',
  4: 'четвёртая',
  5: 'пятая',
  6: 'шестая',
  7: 'седьмая',
  8: 'восьмая',
  9: 'девятая',
  10: 'десятая'
};

const VERSION_WORDS = new Set([
  'pro', 'про', 'flash', 'флэш', 'beta', 'бета', 'alpha', 'альфа',
  'rc', 'preview', 'превью', 'ultra', 'ультра', 'mini', 'мини', 'nano', 'нано',
  'plus', 'плюс', 'max', 'макс', 'lite', 'лайт', 'turbo', 'турбо',
  'версия', 'версии', 'версию', 'версией', 'v'
]);

const VERSION_PREFIXES = new Set([
  'gemini', 'джемини', 'gpt', 'гпт', 'claude', 'клод', 'qwen', 'квен',
  'llama', 'лама', 'whisper', 'виспер', 'gigaam', 'гигаам', 'silero', 'силеро',
  'arc', 'арк', 'windows', 'виндовс', 'ios', 'иос', 'android', 'андроид',
  'python', 'питон', 'node', 'нода', 'v8', 'версия', 'версии', 'версию', 'версией', 'v'
]);

function formatDecimalFraction(wholeStr: string, fracStr: string): string {
  const whole = parseInt(wholeStr, 10);
  const frac = parseInt(fracStr, 10);
  const wholeWords = numberToRussianWords(whole, 'f');
  const wholeSuffix = (whole % 10 === 1 && whole % 100 !== 11) ? 'целая' : 'целых';

  const len = fracStr.length;
  let fracWords = '';
  let fracSuffix = '';

  if (len === 1) {
    if (frac === 1) {
      fracWords = 'одна';
      fracSuffix = 'десятая';
    } else if (frac === 2) {
      fracWords = 'две';
      fracSuffix = 'десятых';
    } else {
      fracWords = numberToRussianWords(frac, 'f');
      fracSuffix = 'десятых';
    }
  } else if (len === 2) {
    fracWords = numberToRussianWords(frac, 'f');
    if (frac % 10 === 1 && frac % 100 !== 11) {
      fracSuffix = 'сотая';
    } else {
      fracSuffix = 'сотых';
    }
  } else if (len === 3) {
    fracWords = numberToRussianWords(frac, 'f');
    if (frac % 10 === 1 && frac % 100 !== 11) {
      fracSuffix = 'тысячная';
    } else {
      fracSuffix = 'тысячных';
    }
  } else {
    return `${wholeWords} ${wholeSuffix} и ${numberToRussianWords(frac, 'f')}`;
  }

  return `${wholeWords} ${wholeSuffix} ${fracWords} ${fracSuffix}`;
}

export function formatTextForSpeech(text: string): string {
  let formatted = text.trim();

  // 0. Pre-strip code blocks and markup so code is never converted to spoken words
  formatted = formatted
    .replace(/```[\s\S]*?```/g, ' блок кода опущен. ')
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' блок кода опущен. ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ');

  // 1. Brand name & assistant acronym pronunciation
  formatted = formatted
    .replace(/\bA\.?R\.?C\.?\b/gi, 'АРК')
    .replace(/\bARC\b/gi, 'АРК')
    .replace(/\bgemini\b/gi, 'джемини')
    .replace(/\bflash\b/gi, 'флэш')
    .replace(/\bpro\b/gi, 'про');

  // 2. Dates: DD.MM.YYYY (e.g. 12.09.2026)
  formatted = formatted.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (_match, dStr, mStr, yStr) => {
    const day = parseInt(dStr, 10);
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);
    const dayWord = DAYS_ORDINAL[day] || numberToRussianWords(day, 'n');
    const monthWord = MONTHS_GENITIVE[month] || '';
    const yearWord = convertYearToGenitive(year);
    return monthWord ? `${dayWord} ${monthWord} ${yearWord}` : `${dayWord} ${yearWord}`;
  });

  // 3. Numbered lists: "1. тест, 2. таблица, 3. сервер" or "3. таблица" or multi-line
  formatted = formatted.replace(/(?:^|(?<=[\n\r,;]))(\s*)(\d+)\.\s+(?=(\S+))/gm, (_match, leadSpace, numStr, nextWord) => {
    const n = parseInt(numStr, 10);
    if (n >= 1 && n <= 10) {
      let ord = ORDINAL_MAP_1_TO_10[n];
      if (n === 1) {
        const cleanWord = (nextWord || '').replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}]+$/u, '').toLowerCase();
        if (cleanWord.endsWith('а') || cleanWord.endsWith('я')) {
          ord = 'первая';
        }
      }
      return `${leadSpace || ''}${ord} — `;
    } else if (n >= 11) {
      return `${leadSpace || ''}номер ${numberToRussianWords(n)}, `;
    }
    return _match;
  });

  // 4. Currency amounts
  formatted = formatted.replace(/(?:(\d+)\s*\$|\$\s*(\d+))/g, (_m, p1, p2) => {
    const val = parseInt(p1 || p2, 10);
    return `${numberToRussianWords(val, 'm')} ${getDollarDeclension(val)}`;
  });
  formatted = formatted.replace(/(?:(\d+)\s*€|€\s*(\d+))/g, (_m, p1, p2) => {
    const val = parseInt(p1 || p2, 10);
    return `${numberToRussianWords(val, 'm')} евро`;
  });
  formatted = formatted.replace(/(?:(\d+)\s*₽|(\d+)\s*руб(?:\.|\b))/gi, (_m, p1, p2) => {
    const val = parseInt(p1 || p2, 10);
    return `${numberToRussianWords(val, 'm')} ${getRubleDeclension(val)}`;
  });

  // 5. Percentages: 45% -> сорок пять процентов
  formatted = formatted.replace(/(\d+)\s*%/g, (_m, p1) => {
    const val = parseInt(p1, 10);
    return `${numberToRussianWords(val, 'm')} ${getPercentDeclension(val)}`;
  });

  // 5.5 Weather, Temperatures and Physical units
  // A. Temperatures with decimals or signs: +10.4°C, -8.4°C, +10°C, 21 °C, etc.
  formatted = formatted.replace(/(?:(?<=\s)|(?<=^)|(?<=[(\[,;]))([+-]?)\s*(\d+(?:[.,]\d+)?)\s*°\s*(?:[cCсСfFфФ](?![a-zA-Zа-яА-Я0-9]))?/g, (_match, signStr, numStr) => {
    const sign = signStr === '+' ? 'плюс ' : (signStr === '-' ? 'минус ' : '');
    const clean = numStr.replace(',', '.');
    if (clean.includes('.')) {
      const [wholeStr, fracStr] = clean.split('.');
      const fracText = formatDecimalFraction(wholeStr, fracStr);
      return `${sign}${fracText} градуса`;
    }
    return `${sign}${numStr} ${getDegreeDeclension(numStr)}`;
  });
  formatted = formatted.replace(/°\s*[cCсСfFфФ]?/gi, 'градусов');

  // B. Wind / Speed: км/ч, м/с
  formatted = formatted.replace(/(\d+(?:[.,]\d+)?)\s*(?:км\/ч(?:ас)?|км\s*\/\s*ч(?:ас)?)(?![a-zA-Zа-яА-Я])/gi, (_match, numStr) => {
    const clean = numStr.replace(',', '.');
    if (clean.includes('.')) {
      const [wholeStr, fracStr] = clean.split('.');
      return `${formatDecimalFraction(wholeStr, fracStr)} километра в час`;
    }
    return `${numStr} ${getKmhDeclension(numStr)}`;
  });
  formatted = formatted.replace(/(\d+(?:[.,]\d+)?)\s*(?:м\/с(?:ек)?|м\s*\/\s*с(?:ек)?)(?![a-zA-Zа-яА-Я])/gi, (_match, numStr) => {
    const clean = numStr.replace(',', '.');
    if (clean.includes('.')) {
      const [wholeStr, fracStr] = clean.split('.');
      return `${formatDecimalFraction(wholeStr, fracStr)} метра в секунду`;
    }
    return `${numStr} ${getMsDeclension(numStr)}`;
  });

  // C. Pressure: мм рт. ст.
  formatted = formatted.replace(/(\d+(?:[.,]\d+)?)\s*(?:мм\.?\s*рт\.?\s*ст\.?)(?![a-zA-Zа-яА-Я])/gi, (_match, numStr) => {
    return `${numStr} миллиметров ртутного столба`;
  });

  // D. Standalone units without numbers
  formatted = formatted.replace(/(^|[^\p{L}])(?:км\/ч(?:ас)?|км\s*\/\s*ч(?:ас)?)(?=[^\p{L}]|$)/gui, '$1километров в час');
  formatted = formatted.replace(/(^|[^\p{L}])(?:м\/с(?:ек)?|м\s*\/\s*с(?:ек)?)(?=[^\p{L}]|$)/gui, '$1метров в секунду');
  formatted = formatted.replace(/(^|[^\p{L}])(?:мм\.?\s*рт\.?\s*ст\.?)(?=[^\p{L}]|$)/gui, '$1миллиметров ртутного столба');

  // E. Standalone signs before numbers (e.g. +10, -5 when degree symbol is missing)
  formatted = formatted.replace(/(?:(?<=\s)|(?<=^))\+(\d+(?:[.,]\d+)?)\b/g, 'плюс $1');
  formatted = formatted.replace(/(?:(?<=\s)|(?<=^))-(\d+(?:[.,]\d+)?)\b/g, 'минус $1');

  // 6. Versions and Decimal fractions
  // Match numbers with dots (e.g. 3.1, 3.7, 1.0.1, v2.5)
  formatted = formatted.replace(/(\b[a-zа-яё0-9_-]+\s+)?(\bv?\d+(?:\.\d+)+\b)(\s+[a-zа-яё0-9_-]+)?/gi, (match, prefix, numPart, suffix) => {
    const prevWord = (prefix || '').trim().toLowerCase();
    const nextWord = (suffix || '').trim().toLowerCase();
    const cleanNum = numPart.startsWith('v') ? numPart.substring(1) : numPart;

    const isMultiDot = cleanNum.split('.').length > 2;
    const isVersionByPrefix = numPart.startsWith('v') || VERSION_PREFIXES.has(prevWord);
    const isVersionBySuffix = VERSION_WORDS.has(nextWord);

    if (isMultiDot || isVersionByPrefix || isVersionBySuffix) {
      const parts = cleanNum.split('.');
      const words = parts.map(p => numberToRussianWords(parseInt(p, 10), 'm')).join(' точка ');
      return `${prefix || ''}${words}${suffix || ''}`;
    }

    // Otherwise standard decimal fraction (e.g. 3.1 -> три целых одна десятая)
    const [wholeStr, fracStr] = cleanNum.split('.');
    const fracText = formatDecimalFraction(wholeStr, fracStr);
    return `${prefix || ''}${fracText}${suffix || ''}`;
  });

  // 8. Markdown and noise stripping
  return formatted
    .replace(/<[^>]+>/g, ' ')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[*_~]{1,2}/g, '')
    .replace(/^[\s]*[-+*]\s/gm, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\|/g, ', ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
