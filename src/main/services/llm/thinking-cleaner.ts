/**
 * Utility for detecting, buffering and stripping internal LLM reasoning / chain-of-thought blocks
 * (such as <think>...</think>, <thought>...</thought>, and "Here's a thinking process:...").
 */

export function stripThinkingProcess(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // 1. Strip complete <think>...</think> and <thought>...</thought> blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');

  // 2. Handle unclosed <think>... or <thought>... if cut off at the end
  if (/<(?:think|thought)>/i.test(text) && !/<\/(?:think|thought)>/i.test(text)) {
    // If there is preceding text before <think>, keep the preceding text
    const beforeThink = text.replace(/<(?:think|thought)>[\s\S]*$/gi, '').trim();
    if (beforeThink) {
      text = beforeThink;
    } else {
      // The entire response was inside an unclosed <think> block!
      // Extract answer from inside the unclosed thinking block if possible
      const quotedAnswerMatch = text.match(/(?:Answer|Ответ)\s*[:—\-]?\s*["'«]([^"'»\n]+)["'»]/i);
      if (quotedAnswerMatch) {
        text = quotedAnswerMatch[1].trim();
      } else {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const russianLines = lines.filter(l => /[а-яёА-ЯЁ]{3,}/.test(l) && !/^(?:\d+[\.\)]|\*+|\-+)/.test(l) && !/^(?:analyze|identify|check|formulate|here|thinking|user|prompt)/i.test(l));
        if (russianLines.length > 0) {
          text = russianLines[russianLines.length - 1];
        } else {
          text = '';
        }
      }
    }
  }

  // 3. Strip markdown thinking prefixes like:
  // "Here's a thinking process:\n\n..." or "Thinking Process:\n\n..."
  if (/^(?:Here(?:'s| is) a thinking process:?|Thinking Process:?|Thought Process:?)/i.test(text)) {
    const paragraphs = text.split(/\n{2,}/);
    const nonThinkingParagraphs = paragraphs.filter((p, idx) => {
      if (idx === 0 && /^(?:Here(?:'s| is) a thinking process|Thinking Process|Thought Process)/i.test(p.trim())) {
        return false;
      }
      const trimmed = p.trim();
      if (/^(?:\d+[\.\)]|\*+|\-+|\#+|User says|Answer|Identify|Analyze|Check|Formulate)/i.test(trimmed)) {
        return false;
      }
      return /[а-яёА-ЯЁ]/.test(trimmed);
    });

    if (nonThinkingParagraphs.length > 0) {
      text = nonThinkingParagraphs[nonThinkingParagraphs.length - 1].trim();
    } else {
      const quotedAnswerMatch = text.match(/(?:Answer|Ответ)\s*[:—\-]?\s*["'«]([^"'»\n]+)["'»]/i);
      if (quotedAnswerMatch) {
        text = quotedAnswerMatch[1].trim();
      } else {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const russianLines = lines.filter(l => /[а-яёА-ЯЁ]{3,}/.test(l) && !/^(?:\d+[\.\)]|\*+|\-+)/.test(l) && !/^(?:analyze|identify|check|formulate|here|thinking|user|prompt)/i.test(l));
        if (russianLines.length > 0) {
          text = russianLines[russianLines.length - 1];
        }
      }
    }
  }

  // 4. Clean stray opening/closing tags or stray quotes around whole string
  text = text.replace(/<\/?(?:think|thought)>/gi, '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  // 5. Clean leaked meta-prompt instructions and robotic gender self-declarations
  text = text
    .replace(/[.\s]*(?:Я|Мой)\s+(?:пол\s*[-—–:]?\s*мужск(?:ой|ого)|мужского\s+пола)[^.!?]*?[,\s]+помогая\b/gi, '. Помогаю')
    .replace(/[.\s]*(?:Я|Мой)\s+(?:пол\s*[-—–:]?\s*мужск(?:ой|ого)|мужского\s+пола)[^.!?]*?[.!?]/gi, '.')
    .replace(/[.\s]*(?:Я|Мой)\s+(?:пол\s*[-—–:]?\s*мужск(?:ой|ого)|мужского\s+пола)[^.!?]*/gi, '')
    .replace(/(?:говорю|общаюсь)\s+уверенно[,\s]+уважительно\s+и\s+профессионально[,\s]*/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
  // 6. Strip trailing repetitive questions and cliché endings that models tend to append
  text = text
    .replace(/[\n\s]*(?:чем\s+займ[её]мся\??|чем\s+(?:я\s+)?могу\s+помочь\??|что\s+будем\s+делать\??|какие\s+задачи\s+(?:у\s+нас|на\s+сегодня)\??)[\s.]*$/i, '')
    .trim();

  return text;
}

/**
 * Streaming filter that absorbs thinking tokens (<think>...</think> or "Here's a thinking process...")
 * and only forwards final, intended assistant response tokens to the callback.
 */
export class StreamingThinkingFilter {
  private inThinking = false;
  private thinkingCompleted = false;
  private buffer = '';
  private fullRaw = '';
  private hasStreamedRealToken = false;

  public processChunk(chunk: string, onValidChunk: (token: string) => void) {
    this.fullRaw += chunk;

    // Check if we are at the very beginning of the response and detect thinking start
    if (!this.hasStreamedRealToken && !this.inThinking && !this.thinkingCompleted) {
      const trimmedRaw = this.fullRaw.trim();
      if (!trimmedRaw) return;
      if (trimmedRaw.startsWith('<think>') || trimmedRaw.startsWith('<thought>')) {
        this.inThinking = true;
      } else if (/^(?:Here(?:'s| is) a thinking process|Thinking Process)/i.test(trimmedRaw)) {
        this.inThinking = true;
      } else if (trimmedRaw.startsWith('<') && !trimmedRaw.includes('>') && trimmedRaw.length < 10) {
        return;
      }
    }

    if (this.inThinking) {
      this.buffer += chunk;
      // Check if thinking has concluded
      if (this.buffer.includes('</think>')) {
        const parts = this.buffer.split('</think>');
        this.inThinking = false;
        this.thinkingCompleted = true;
        this.buffer = '';
        const afterThink = parts.slice(1).join('</think>').trim();
        if (afterThink) {
          this.hasStreamedRealToken = true;
          onValidChunk(afterThink);
        }
      } else if (this.buffer.includes('</thought>')) {
        const parts = this.buffer.split('</thought>');
        this.inThinking = false;
        this.thinkingCompleted = true;
        this.buffer = '';
        const afterThink = parts.slice(1).join('</thought>').trim();
        if (afterThink) {
          this.hasStreamedRealToken = true;
          onValidChunk(afterThink);
        }
      }
    } else {
      this.hasStreamedRealToken = true;
      onValidChunk(chunk);
    }
  }

  public finalize(onValidChunk: (token: string) => void): string {
    const cleanAnswer = stripThinkingProcess(this.fullRaw);
    if (!this.hasStreamedRealToken && cleanAnswer) {
      this.hasStreamedRealToken = true;
      onValidChunk(cleanAnswer);
    }
    return cleanAnswer;
  }
}
