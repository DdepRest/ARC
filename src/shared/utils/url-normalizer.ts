export const KNOWN_SITE_DOMAINS: Readonly<Record<string, string>> = {
  'ютуб': 'https://youtube.com',
  'youtube': 'https://youtube.com',
  'гитхаб': 'https://github.com',
  'github': 'https://github.com',
  'вк': 'https://vk.com',
  'вконтакте': 'https://vk.com',
  'яндекс': 'https://yandex.ru',
  'yandex': 'https://yandex.ru',
  'гугл': 'https://google.com',
  'google': 'https://google.com',
  'википедия': 'https://wikipedia.org',
  'хабр': 'https://habr.com',
  'habr': 'https://habr.com',
  'почту': 'https://mail.google.com',
  'телеграм': 'https://web.telegram.org',
  'telegram': 'https://web.telegram.org',
  'одноклассники': 'https://ok.ru',
  'ок': 'https://ok.ru',
  'ok': 'https://ok.ru',
  'чатгпт': 'https://chat.openai.com',
  'chatgpt': 'https://chat.openai.com',
  'твич': 'https://twitch.tv',
  'twitch': 'https://twitch.tv',
  'тикток': 'https://tiktok.com',
  'tiktok': 'https://tiktok.com',
  'инстаграм': 'https://instagram.com',
  'инста': 'https://instagram.com',
  'instagram': 'https://instagram.com',
  'ватсап': 'https://web.whatsapp.com',
  'whatsapp': 'https://web.whatsapp.com',
  'дзен': 'https://dzen.ru',
  'авито': 'https://avito.ru',
  'вб': 'https://wildberries.ru',
  'wildberries': 'https://wildberries.ru',
  'озон': 'https://ozon.ru',
  'ozon': 'https://ozon.ru'
};

export function stripTrailingUrlPunctuation(raw: string): string {
  return String(raw || '').trim().replace(/[.,!?;:"'«»]+$/g, '').trim();
}

export function normalizeMacroExternalUrl(rawUrl: string): string {
  let urlStr = stripTrailingUrlPunctuation(rawUrl);
  if (!urlStr) return '';
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }
  if (!/^https?:\/\/[^/?#]+\.[a-zа-яё]{2,}/i.test(urlStr)) {
    urlStr = urlStr.replace(/^(https?:\/\/[^/?#.]+)\.?/i, '$1.com');
  }
  return urlStr;
}

export function resolveSiteQueryToUrl(siteQuery: string): { url: string; isKnown: boolean } {
  const cleanSite = String(siteQuery || '')
    .trim()
    .replace(/^(?:сайт|страниц[уа])\s+/i, '')
    .replace(/^[.,!?;:"'«»()[\]\s]+|[.,!?;:"'«»()[\]\s]+$/g, '')
    .trim();

  const cleanKey = stripTrailingUrlPunctuation(cleanSite.toLowerCase()).replace(/\s+/g, '');
  const strippedTldKey = cleanKey.replace(/\.(?:com|ru|org|net|tv)$/i, '');
  const knownUrl = KNOWN_SITE_DOMAINS[cleanKey] || KNOWN_SITE_DOMAINS[strippedTldKey];

  if (knownUrl) {
    return { url: knownUrl, isKnown: true };
  }

  if (/^(?:https?:\/\/)?[a-z0-9а-яё.-]+\.[a-zа-яё]{2,}(?:\/.*)?$/i.test(cleanSite) && !cleanSite.includes(' ')) {
    const directUrl = /^https?:\/\//i.test(cleanSite) ? cleanSite : `https://${cleanSite}`;
    return { url: directUrl, isKnown: false };
  }

  return {
    url: `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(cleanSite)}`,
    isKnown: false
  };
}
