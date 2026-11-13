import { describe, it, expect } from 'vitest';
import { isStopCommand, isGratitudeCommand } from './stop-command';

describe('stop-command', () => {
  it('should match exact stop words', () => {
    expect(isStopCommand('стоп')).toBe(true);
    expect(isStopCommand('stop')).toBe(true);
    expect(isStopCommand('хватит')).toBe(true);
    expect(isStopCommand('замолчи')).toBe(true);
    expect(isStopCommand('молчи')).toBe(true);
    expect(isStopCommand('тихо')).toBe(true);
    expect(isStopCommand('прекрати')).toBe(true);
    expect(isStopCommand('отмена')).toBe(true);
    expect(isStopCommand('отбой')).toBe(true);
    expect(isStopCommand('cnjg')).toBe(true);
  });

  it('should match gratitude expressions with isGratitudeCommand', () => {
    expect(isGratitudeCommand('спасибо')).toBe(true);
    expect(isGratitudeCommand('благодарю')).toBe(true);
    expect(isGratitudeCommand('благодарствую')).toBe(true);
    expect(isGratitudeCommand('спасибки')).toBe(true);
    expect(isGratitudeCommand('спасибо большое')).toBe(true);
    expect(isGratitudeCommand('спасибо огромное')).toBe(true);
    expect(isGratitudeCommand('большое спасибо')).toBe(true);
    expect(isGratitudeCommand('огромное спасибо')).toBe(true);
    expect(isGratitudeCommand('всё, спасибо')).toBe(true);
    expect(isGratitudeCommand('все, спасибо')).toBe(true);
    expect(isGratitudeCommand('всё спасибо')).toBe(true);
    expect(isGratitudeCommand('все спасибо')).toBe(true);
    expect(isGratitudeCommand('спасибо, всё')).toBe(true);
    expect(isGratitudeCommand('спасибо тебе большое')).toBe(true);
    expect(isGratitudeCommand('спасибо огромное')).toBe(true);
    expect(isGratitudeCommand('всё, спасибо огромное, Арк')).toBe(true);
    expect(isGratitudeCommand('благодарствую, друг')).toBe(true);
    expect(isGratitudeCommand('спасибки тебе')).toBe(true);
    expect(isGratitudeCommand('Арк, спасибо большое!')).toBe(true);
    expect(isGratitudeCommand('cgfcbf')).toBe(true);
    expect(isGratitudeCommand('от души')).toBe(true);
    expect(isGratitudeCommand('thanks')).toBe(true);
    expect(isGratitudeCommand('thank you')).toBe(true);
    expect(isGratitudeCommand('Благодарю тебя')).toBe(true);
    expect(isGratitudeCommand('стоп')).toBe(false);
  });

  it('should handle case insensitivity and punctuation', () => {
    expect(isStopCommand('СТОП!')).toBe(true);
    expect(isStopCommand('Стоп.')).toBe(true);
    expect(isStopCommand('Хватит?')).toBe(true);
    expect(isGratitudeCommand(' спасибо, ')).toBe(true);
  });

  it('should cleanup wake words', () => {
    expect(isStopCommand('арк стоп')).toBe(true);
    expect(isStopCommand('стоп арк')).toBe(true);
    expect(isStopCommand('а.р.к. хватит')).toBe(true);
    expect(isStopCommand('arc stop')).toBe(true);
    expect(isStopCommand('арок замолчи')).toBe(true);
  });

  it('should return false for non-stop commands', () => {
    expect(isStopCommand('привет')).toBe(false);
    expect(isStopCommand('как дела')).toBe(false);
    expect(isStopCommand('стоп-кран')).toBe(false); // Does not match exactly because it's a substring
    expect(isStopCommand('найди информацию про стоп-слово')).toBe(false);
    expect(isStopCommand('выключи музыку')).toBe(false);
    expect(isStopCommand('выключи музыку пока')).toBe(false);
    expect(isStopCommand('останови музыку')).toBe(false);
    expect(isStopCommand('поставь музыку на паузу')).toBe(false);
    expect(isStopCommand('арк выключи музыку')).toBe(false);
    expect(isStopCommand('')).toBe(false);
    expect(isStopCommand(' ')).toBe(false);
  });
});
