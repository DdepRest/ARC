export interface TokenDiffResult {
  commonPrefixLength: number;
  rollbackTokenCount: number;
  deltaTokens: number[];
  isPureExtension: boolean;
  isIdentical: boolean;
}

export interface PrefillTelemetryStats {
  utteranceId: string | null;
  backend: 'builtin' | 'ollama' | 'none';
  modelName: string;
  prefilledText: string;
  prefilledTokenCount: number;
  lastDeltaTokens: number;
  lastRollbackTokens: number;
  totalPrefillCalls: number;
  totalSavedTokensOnFinal: number;
  lastPrefillLatencyMs: number;
  updatedAt: number;
}

export interface OllamaPrefillEnvelope {
  utteranceId: string;
  model: string;
  endpointUrl: string;
  systemPrompt: string;
  basePromptPrefix: string;
  prefilledText: string;
  prefilledTokensEstimate: number;
  ollamaContext?: number[];
  updatedAt: number;
}

const LEADING_WAKE_PREFIX_REGEX =
  /^(?:(?:привет|здравствуй|здравствуйте|добрый\s+(?:день|вечер|утро)|слушай|эй|ок|hello|hi)[,\s]+)*(?:a\.r\.c\.|а\.р\.к\.|арк|arc|ark|арок|орг|харк|орк|алекс|джарвис|компьютер)(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)[,\s:!—–\-]*/i;

/**
 * Strips leading greeting and wake-word address from a partial or final voice transcript.
 */
export function stripWakeWordForPrefill(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText
    .replace(/\*MUSIC\*/gi, '')
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|im_end\|>/g, '')
    .trim();
  if (!cleaned) return '';

  if (LEADING_WAKE_PREFIX_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(LEADING_WAKE_PREFIX_REGEX, '').trim();
  }
  cleaned = cleaned
    .replace(/^[\s.,!?'"–—:\-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/**
 * Extracts the stable prefix of an ongoing STT partial transcript.
 * Holds back the last in-flight word unless the partial ends with whitespace/punctuation
 * or the full partial text has stabilized across consecutive STT emissions.
 */
export function extractStableSpeechPrefix(
  currentCleanedText: string,
  previousCleanedText: string = '',
  forceComplete: boolean = false
): string {
  if (!currentCleanedText) return '';
  const normalized = currentCleanedText.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  if (forceComplete) {
    return normalized;
  }

  const endsWithBoundary = /[\s.,!?;:]$/.test(currentCleanedText);
  const stabilizedAcrossPartials =
    previousCleanedText.trim().length > 0 &&
    normalized.toLowerCase() === previousCleanedText.replace(/\s+/g, ' ').trim().toLowerCase();

  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return '';

  if (endsWithBoundary || stabilizedAcrossPartials) {
    return words.join(' ');
  }

  // If only 1 word is present and it hasn't stabilized yet, hold back to avoid prefilling half-spoken syllables
  if (words.length === 1) {
    return '';
  }

  // Return all completed words except the trailing word still being spoken
  return words.slice(0, -1).join(' ');
}

/**
 * Computes Longest Common Prefix (LCP), tail rollback count, and new delta tokens
 * between previously prefilled tokens and the new token sequence.
 */
export function computeTokenDiff(previousTokens: readonly number[], nextTokens: readonly number[]): TokenDiffResult {
  let commonPrefixLength = 0;
  const minLen = Math.min(previousTokens.length, nextTokens.length);
  while (commonPrefixLength < minLen && previousTokens[commonPrefixLength] === nextTokens[commonPrefixLength]) {
    commonPrefixLength++;
  }

  const rollbackTokenCount = previousTokens.length - commonPrefixLength;
  const deltaTokens = nextTokens.slice(commonPrefixLength);

  return {
    commonPrefixLength,
    rollbackTokenCount,
    deltaTokens,
    isPureExtension: rollbackTokenCount === 0 && deltaTokens.length > 0,
    isIdentical: rollbackTokenCount === 0 && deltaTokens.length === 0
  };
}

export function tokenizeWordsApprox(text: string): number[] {
  if (!text || !text.trim()) return [];
  const words = text.trim().split(/\s+/);
  const hashes: number[] = [];
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    hashes.push(h >>> 0);
  }
  return hashes;
}
