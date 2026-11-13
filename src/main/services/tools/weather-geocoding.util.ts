import axios from 'axios';

export const WEATHER_STOP_WORDS = new Set([
  // Numbers / counting (ТЗ: одно, два, три, четыре, пять)
  'одно', 'одна', 'один', 'одни', 'два', 'две', 'три', 'четыре', 'пять',
  // Demonstrative pronouns (ТЗ: этот, эта, это, эти, тот, та, то, те)
  'этот', 'эта', 'это', 'эти', 'этом', 'этой', 'этих', 'эту',
  'тот', 'та', 'то', 'те', 'том', 'той', 'тех', 'ту',
  // Personal / reflexive pronouns (ТЗ: мне, нас, нам, вами, мне)
  'мне', 'нас', 'нам', 'нами', 'вами', 'вас', 'вам',
  'меня', 'тебе', 'тебя', 'тобой', 'тобою', 'им', 'ей', 'ему', 'ими', 'себе', 'собой',
  // Temporal adverbs & markers (ТЗ: сейчас, сегодня, завтра, вчера, всегда, никогда)
  'сейчас', 'сегодня', 'завтра', 'вчера', 'всегда', 'никогда',
  'утром', 'днем', 'вечером', 'ночью', 'скоро', 'потом', 'послезавтра', 'позавчера',
  'выходные', 'субботу', 'воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу',
  'ноябре', 'декабре', 'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре',
  // Common place / ambient nouns
  'мире', 'городе', 'деревне', 'целом', 'принципе', 'итоге', 'улице', 'окном', 'доме', 'дворе',
  // Prepositions & conjunctions
  'в', 'во', 'для', 'на', 'у', 'о', 'об', 'обо', 'по', 'из', 'под', 'над', 'при', 'к', 'ко',
  'тут', 'там', 'здесь', 'везде', 'всюду',
  'ли', 'же', 'бы', 'что', 'как', 'где', 'куда', 'откуда', 'когда', 'почему', 'зачем'
]);

export const WEATHER_TERMS = new Set([
  'погода', 'погоду', 'погоде', 'погодой', 'погоды',
  'прогноз', 'прогноза', 'прогнозу', 'прогнозом', 'прогнозе',
  'температура', 'температуры', 'температуре'
]);

/**
 * Extracts candidate location from weather query.
 * Returns null if the specified candidate word is a stop-word or invalid.
 * Returns defaultCity if no location was specified at all in a generic weather query.
 */
export function extractWeatherLocation(text: string, defaultCity: string = 'Москва'): string | null {
  if (!text || typeof text !== 'string') return defaultCity;

  // 1. "в / во <город>" or "в городе <город>" or "в г. <город>"
  const inMatch = text.match(/(?:^|\s)(?:в|во)\s+(?:городе\s+|г\.\s*)?([а-яА-ЯёЁa-zA-Z-]+)/i);
  if (inMatch && inMatch[1]) {
    const loc = inMatch[1].trim().replace(/[.,!?:;]$/, '');
    if (WEATHER_STOP_WORDS.has(loc.toLowerCase())) {
      return null;
    }
    return loc;
  }

  // 2. "погода / прогноз / температура <город>"
  const pogodaMatch = text.match(/(?:погода|прогноз|температура)\s+([а-яА-ЯёЁa-zA-Z-]+)/i);
  if (pogodaMatch && pogodaMatch[1]) {
    const loc = pogodaMatch[1].trim().replace(/[.,!?:;]$/, '');
    const locLower = loc.toLowerCase();
    if (WEATHER_TERMS.has(locLower)) {
      // e.g. "прогноз погоды" -> generic weather request, continue to defaultCity
    } else if (WEATHER_STOP_WORDS.has(locLower)) {
      return null;
    } else {
      return loc;
    }
  }

  return defaultCity;
}

/**
 * Validates candidate location using Open-Meteo Geocoding API.
 * Inflects Russian cases (Горловке -> Горловка, Орле -> Орёл/Орле, Уфе -> Уфа).
 * Returns { valid: true, normalizedName: '...' } if found, or { valid: false } if empty.
 */
export async function validateCityLocation(
  location: string
): Promise<{ valid: boolean; normalizedName?: string }> {
  if (!location || typeof location !== 'string') {
    return { valid: false };
  }

  const trimmed = location.trim();
  const lower = trimmed.toLowerCase();

  // Stop words, generic weather terms, and single letters are immediately rejected
  if (WEATHER_STOP_WORDS.has(lower) || WEATHER_TERMS.has(lower) || trimmed.length < 2) {
    return { valid: false };
  }

  const candidates: string[] = [trimmed];

  // Russian nominative recovery heuristics
  if (lower.endsWith('е')) {
    candidates.push(trimmed.slice(0, -1) + 'а');
    candidates.push(trimmed.slice(0, -1));
  } else if (lower.endsWith('и')) {
    candidates.push(trimmed.slice(0, -1) + 'ь');
    candidates.push(trimmed.slice(0, -1) + 'я');
    candidates.push(trimmed.slice(0, -1));
  } else if (lower.endsWith('у')) {
    candidates.push(trimmed.slice(0, -1) + 'а');
  }

  for (const cand of candidates) {
    if (!cand || WEATHER_STOP_WORDS.has(cand.toLowerCase()) || WEATHER_TERMS.has(cand.toLowerCase())) continue;
    try {
      const geoRes = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cand)}&count=1&language=ru&format=json`,
        { timeout: 3000 }
      );
      if (geoRes.data?.results && Array.isArray(geoRes.data.results) && geoRes.data.results.length > 0) {
        const found = geoRes.data.results[0];
        if (found && found.name) {
          const canonical = (found.name || cand).toLowerCase();
          return { valid: true, normalizedName: canonical };
        }
      }
    } catch (_) {
      // Network timeout or offline geocoding failure
    }
  }

  return { valid: false };
}
