import { describe, it, expect } from 'vitest';
import { stripThinkingProcess, StreamingThinkingFilter } from './thinking-cleaner';
import { cleanPreprocessResponse, preprocessText } from './prompt-builder';

describe('thinking-cleaner', () => {
  it('should strip <think> blocks completely', () => {
    const raw = '<think>User is asking about weather. Let us formulate answer.</think>Погода ясная.';
    const result = stripThinkingProcess(raw);
    expect(result).toBe('Погода ясная.');
  });

  it('should strip unclosed <think> blocks if cut off', () => {
    const raw = 'Ответ готов.<think>Some unfinished thinking...';
    const result = stripThinkingProcess(raw);
    expect(result).toBe('Ответ готов.');
  });

  it('should handle "Here\'s a thinking process" from the user riddle failure', () => {
    const raw = `Here's a thinking process:

1.  **Analyze User Input:** User says: "отгадай загадку, висит груша, нельможно скушать" (Guess the riddle, a pear hangs, can't be eaten)
2.  **Identify the Riddle:** This is a classic Russian riddle. The answer is typically "лампочка" (light bulb).
3.  **Formulate Response:**
    - Answer: "Лампочка"
    - Something like: "Это лампочка."

Это лампочка.`;
    const result = stripThinkingProcess(raw);
    expect(result).toBe('Это лампочка.');
  });

  it('should extract answer if only thinking process was output before cutoff', () => {
    const raw = `Here's a thinking process:

1.  **Analyze User Input:** User asks riddle.
2.  **Formulate Response:**
    - Answer: "Лампочка"`;
    const result = stripThinkingProcess(raw);
    expect(result).toBe('Лампочка');
  });

  it('should correctly filter tokens in StreamingThinkingFilter', () => {
    const filter = new StreamingThinkingFilter();
    const emitted: string[] = [];

    filter.processChunk('<think>Reasoning tokens', (t) => emitted.push(t));
    filter.processChunk(' more reasoning</think>', (t) => emitted.push(t));
    filter.processChunk('Это лампочка', (t) => emitted.push(t));

    expect(emitted.join('')).toBe('Это лампочка');
  });

  it('should finalize with clean answer if stream ended inside thinking', () => {
    const filter = new StreamingThinkingFilter();
    const emitted: string[] = [];

    filter.processChunk('<think>Reasoning: Answer: "Лампочка"', (t) => emitted.push(t));
    const finalAnswer = filter.finalize((t) => emitted.push(t));

    expect(finalAnswer).toBe('Лампочка');
    expect(emitted.join('')).toBe('Лампочка');
  });

  it('should clean robotic leaked prompt self-declarations', () => {
    const raw = 'Я — A.R.C., интеллектуальный ассистент и цифровой напарник. Я мужского пола, говорю уверенно, уважительно и профессионально, помогая с информацией, задачами и системными действиями. Чем могу быть полезен?';
    const result = stripThinkingProcess(raw);
    expect(result).toBe('Я — A.R.C., интеллектуальный ассистент и цифровой напарник. Чем могу быть полезен?');
  });

  it('preprocessText and cleanPreprocessResponse preserve "Как дела?" and strip introductory prefixes/newlines', async () => {
    expect(await preprocessText('Как дела?', { aiPreprocessEnabled: true })).toBe('Как дела?');
    expect(await preprocessText('как дела', { aiPreprocessEnabled: true })).toBe('Как дела?');
    expect(
      cleanPreprocessResponse('Вот исправленный текст: Как дела?\nПояснение: добавлен вопросительный знак', 'как дела')
    ).toBe('Как дела?');
    expect(cleanPreprocessResponse('У меня всё хорошо, спасибо!', 'Как дела?')).toBe('Как дела?');
  });

  it('should strip trailing repetitive questions like Чем займёмся', () => {
    const raw1 = 'Привет. На связи. Чем займёмся?';
    expect(stripThinkingProcess(raw1)).toBe('Привет. На связи.');

    const raw2 = 'Стабильно. Системы работают в штатном режиме.\n\nЧем займёмся?';
    expect(stripThinkingProcess(raw2)).toBe('Стабильно. Системы работают в штатном режиме.');

    const raw3 = 'Готово. Что будем делать?';
    expect(stripThinkingProcess(raw3)).toBe('Готово.');
  });
});
