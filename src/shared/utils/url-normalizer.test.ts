import { describe, it, expect } from 'vitest';
import {
  stripTrailingUrlPunctuation,
  normalizeMacroExternalUrl,
  resolveSiteQueryToUrl
} from './url-normalizer';

describe('Shared URL Normalizer Utility', () => {
  it('strips trailing punctuation from URLs', () => {
    expect(stripTrailingUrlPunctuation('https://vk.ru/audios123...')).toBe('https://vk.ru/audios123');
    expect(stripTrailingUrlPunctuation('youtube.com!»')).toBe('youtube.com');
  });

  it('normalizes macro external URLs with https and fallback .com TLD', () => {
    expect(normalizeMacroExternalUrl('youtube.')).toBe('https://youtube.com');
    expect(normalizeMacroExternalUrl('https://github.com/repo,')).toBe('https://github.com/repo');
    expect(normalizeMacroExternalUrl('habr.ru')).toBe('https://habr.ru');
  });

  it('resolves known Russian and English site aliases and domain names', () => {
    expect(resolveSiteQueryToUrl('ютуб.')).toEqual({ url: 'https://youtube.com', isKnown: true });
    expect(resolveSiteQueryToUrl('github.com')).toEqual({ url: 'https://github.com', isKnown: true });
    expect(resolveSiteQueryToUrl('example.org')).toEqual({ url: 'https://example.org', isKnown: false });
    expect(resolveSiteQueryToUrl('неизвестный портал')).toEqual({
      url: 'https://duckduckgo.com/?q=!ducky+%D0%BD%D0%B5%D0%B8%D0%B7%D0%B2%D0%B5%D1%81%D1%82%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D1%80%D1%82%D0%B0%D0%BB',
      isKnown: false
    });
  });
});
