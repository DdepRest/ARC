import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  WEATHER_STOP_WORDS,
  extractWeatherLocation,
  validateCityLocation
} from './weather-geocoding.util';
import { ToolDispatcher } from './tool-dispatcher';

describe('weather-geocoding.util', () => {
  describe('WEATHER_STOP_WORDS', () => {
    it('contains all required stop-words from specification', () => {
      const required = [
        'одно', 'два', 'три', 'четыре', 'пять',
        'этот', 'эта', 'это', 'эти', 'тот', 'та', 'то', 'те',
        'мне', 'нас', 'нам', 'вами',
        'сейчас', 'сегодня', 'завтра', 'вчера', 'всегда', 'никогда'
      ];
      for (const word of required) {
        expect(WEATHER_STOP_WORDS.has(word)).toBe(true);
      }
    });
  });

  describe('extractWeatherLocation', () => {
    it('returns null when the extracted candidate is in stop-list (e.g. "какая погода одно")', () => {
      expect(extractWeatherLocation('какая погода одно')).toBeNull();
      expect(extractWeatherLocation('какая погода этот')).toBeNull();
      expect(extractWeatherLocation('какая погода два')).toBeNull();
      expect(extractWeatherLocation('погода мне')).toBeNull();
    });

    it('extracts city from preposition phrase (e.g. "какая погода в горловке")', () => {
      expect(extractWeatherLocation('какая погода в горловке')).toBe('горловке');
      expect(extractWeatherLocation('какая погода в орле')).toBe('орле');
      expect(extractWeatherLocation('какая погода в городе Москва')).toBe('Москва');
    });

    it('extracts city after pogoda (e.g. "погода уфа")', () => {
      expect(extractWeatherLocation('погода уфа')).toBe('уфа');
    });

    it('falls back to defaultCity only when no stopped argument was specified', () => {
      expect(extractWeatherLocation('какая погода')).toBe('Москва');
      expect(extractWeatherLocation('прогноз погоды')).toBe('Москва');
    });
  });

  describe('validateCityLocation', () => {
    it('rejects stop words immediately without network calls', async () => {
      const spy = vi.spyOn(axios, 'get');
      const res = await validateCityLocation('одно');
      expect(res.valid).toBe(false);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('validates city and recovers nominative form (e.g. горловке -> горловка)', async () => {
      vi.spyOn(axios, 'get').mockImplementation(async (url: any) => {
        if (typeof url === 'string' && url.includes(encodeURIComponent('горловка'))) {
          return { data: { results: [{ name: 'Горловка', latitude: 48.3, longitude: 38.0 }] } } as any;
        }
        return { data: { results: [] } } as any;
      });

      const res = await validateCityLocation('горловке');
      expect(res.valid).toBe(true);
      expect(res.normalizedName).toBe('горловка');
      vi.restoreAllMocks();
    });

    it('validates short city names like Орёл and Уфа', async () => {
      vi.spyOn(axios, 'get').mockImplementation(async (url: any) => {
        if (typeof url === 'string' && url.includes(encodeURIComponent('орёл'))) {
          return { data: { results: [{ name: 'Орёл' }] } } as any;
        }
        if (typeof url === 'string' && url.includes(encodeURIComponent('уфа'))) {
          return { data: { results: [{ name: 'Уфа' }] } } as any;
        }
        return { data: { results: [] } } as any;
      });

      const resOrel = await validateCityLocation('орёл');
      expect(resOrel.valid).toBe(true);
      expect(resOrel.normalizedName).toBe('орёл');

      const resUfa = await validateCityLocation('уфа');
      expect(resUfa.valid).toBe(true);
      expect(resUfa.normalizedName).toBe('уфа');

      vi.restoreAllMocks();
    });

    it('returns valid: false when geocoding finds nothing', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { results: [] } });
      const res = await validateCityLocation('несуществующийгород123');
      expect(res.valid).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('ToolDispatcher.getPreRoutedWeatherLocation', () => {
    let dispatcher: ToolDispatcher;

    beforeEach(() => {
      dispatcher = ToolDispatcher.getInstance();
    });

    it('does NOT pre-route "какая погода одно" and yields null for LLM pass-through', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const result = await dispatcher.getPreRoutedWeatherLocation('какая погода одно');
      expect(result).toBeNull();
      expect(consoleSpy).not.toHaveBeenCalledWith('[ToolDispatcher] PRE-ROUTED: get_weather');
      consoleSpy.mockRestore();
    });

    it('pre-routes "какая погода в горловке" with single PRE-ROUTED log and location="горловка"', async () => {
      vi.spyOn(axios, 'get').mockImplementation(async (url: any) => {
        if (typeof url === 'string' && url.includes('geocoding-api')) {
          return { data: { results: [{ name: 'Горловка', latitude: 48.3, longitude: 38.0 }] } } as any;
        }
        return { data: {} } as any;
      });

      const consoleSpy = vi.spyOn(console, 'log');
      const result = await dispatcher.getPreRoutedWeatherLocation('какая погода в горловке');

      expect(result).not.toBeNull();
      expect(result).toBe('горловка');

      const preRoutedCalls = consoleSpy.mock.calls.filter(
        call => call[0] === '[ToolDispatcher] PRE-ROUTED: get_weather'
      );
      expect(preRoutedCalls.length).toBe(1);

      consoleSpy.mockRestore();
      vi.restoreAllMocks();
    });
  });
});
