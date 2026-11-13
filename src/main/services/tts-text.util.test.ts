import { describe, it, expect } from 'vitest';
import { formatTextForSpeech, numberToRussianWords } from './tts-text.util';

describe('tts-text.util', () => {
  describe('Block A: Numbered lists', () => {
    it('formats single numbered list item "3. таблица" to "третья — таблица"', () => {
      expect(formatTextForSpeech('3. таблица')).toBe('третья — таблица');
    });

    it('formats list "1. тест, 2. таблица, 3. сервер" to "первый — тест, вторая — таблица, третья — сервер"', () => {
      expect(formatTextForSpeech('1. тест, 2. таблица, 3. сервер'))
        .toBe('первый — тест, вторая — таблица, третья — сервер');
    });

    it('formats multiline numbered list', () => {
      const input = `1. тест\n2. таблица\n3. сервер`;
      expect(formatTextForSpeech(input)).toBe('первый — тест вторая — таблица третья — сервер');
    });

    it('formats list item 11+ as "номер одиннадцать, [текст]"', () => {
      expect(formatTextForSpeech('11. сервер')).toBe('номер одиннадцать, сервер');
      expect(formatTextForSpeech('12. клиент')).toBe('номер двенадцать, клиент');
    });
  });

  describe('Block C: TTS Dictionary Expansion', () => {
    it('formats pure decimal fraction: 3.1 -> три целых одна десятая', () => {
      expect(formatTextForSpeech('3.1')).toBe('три целых одна десятая');
      expect(formatTextForSpeech('0.5')).toBe('ноль целых пять десятых');
      expect(formatTextForSpeech('2.25')).toBe('две целых двадцать пять сотых');
    });

    it('formats software versions: 3.7 flash -> три точка семь флэш', () => {
      expect(formatTextForSpeech('3.7 flash')).toBe('три точка семь флэш');
    });

    it('formats software versions: gemini 3.1 pro -> джемини три точка один про', () => {
      expect(formatTextForSpeech('gemini 3.1 pro')).toBe('джемини три точка один про');
    });

    it('formats percentages: 45% влажность -> сорок пять процентов влажность', () => {
      expect(formatTextForSpeech('45% влажность')).toBe('сорок пять процентов влажность');
      expect(formatTextForSpeech('1%')).toBe('один процент');
      expect(formatTextForSpeech('2%')).toBe('два процента');
    });

    it('formats dates: 12.09.2026 -> двенадцатое сентября две тысячи двадцать шестого', () => {
      expect(formatTextForSpeech('12.09.2026')).toBe('двенадцатое сентября две тысячи двадцать шестого');
    });

    it('formats currency: 100$ -> сто долларов', () => {
      expect(formatTextForSpeech('100$')).toBe('сто долларов');
      expect(formatTextForSpeech('$100')).toBe('сто долларов');
      expect(formatTextForSpeech('100€')).toBe('сто евро');
      expect(formatTextForSpeech('100₽')).toBe('сто рублей');
    });
  });

  describe('Existing rules preservation', () => {
    it('preserves ARC pronunciation', () => {
      expect(formatTextForSpeech('Привет, я A.R.C.')).toContain('АРК');
      expect(formatTextForSpeech('Привет, я ARC')).toContain('АРК');
    });

    it('preserves temperature declensions', () => {
      expect(formatTextForSpeech('Температура 21 °C')).toBe('Температура 21 градус');
      expect(formatTextForSpeech('Температура 22 °C')).toBe('Температура 22 градуса');
      expect(formatTextForSpeech('Температура 25 °C')).toBe('Температура 25 градусов');
    });

    it('formats decimal weather temperatures and wind speed', () => {
      const weatherText = 'В Горловке сейчас +10.4°C, ощущается как +8.4°C. Ветер северный, около 11 км/ч, влажность 88%.';
      const formatted = formatTextForSpeech(weatherText);
      expect(formatted).toContain('плюс десять целых четыре десятых градуса');
      expect(formatted).toContain('плюс восемь целых четыре десятых градуса');
      expect(formatted).toContain('11 километров в час');
      expect(formatted).toContain('восемьдесят восемь процентов');
      expect(formatted).not.toContain('+');
    });

    it('formats stress for на связи without artificial marker', () => {
      expect(formatTextForSpeech('Я на связи.')).toBe('Я на связи.');
      expect(formatTextForSpeech('На связи!')).toBe('На связи!');
      expect(formatTextForSpeech('В связи с обновлением')).toBe('В связи с обновлением');
    });

    it('strips markdown code blocks and HTML pre/code elements from speech', () => {
      const codeMarkdown = 'Вот решение задачи:\n```python\nprint("Hello World!")\nfor i in range(10):\n  pass\n```\nВсе готово.';
      const res = formatTextForSpeech(codeMarkdown);
      expect(res).toContain('Вот решение задачи:');
      expect(res).toContain('блок кода опущен.');
      expect(res).toContain('Все готово.');
      expect(res).not.toContain('Hello World');

      const htmlCode = '<p>Результат:</p><pre><code>const a = 1; console.log(a);</code></pre><p>Завершено.</p>';
      const resHtml = formatTextForSpeech(htmlCode);
      expect(resHtml).toContain('Результат:');
      expect(resHtml).toContain('Завершено.');
      expect(resHtml).not.toContain('console.log');
    });
  });
});

