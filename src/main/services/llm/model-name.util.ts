/**
 * Pure helper for normalizing built-in GGUF model identifiers.
 * Extracted from prompt-builder.ts to avoid a circular dependency with
 * provider-manager.ts and decouple strict TS modules from built-in-llm.service.ts.
 */
export function sanitizeBuiltinModelName(modelName?: string): string {
  if (!modelName) {
    return 'LFM3-1.7B-Q4_K_M.gguf';
  }
  // Trust already valid GGUF filenames
  if (modelName.endsWith('.gguf')) {
    return modelName;
  }
  const lower = modelName.toLowerCase();
  if (lower.includes('lfm3') || (lower.includes('lfm') && lower.includes('1.7b'))) {
    return 'LFM3-1.7B-Q4_K_M.gguf';
  }
  if (lower.includes('2.6b') || lower.includes('lfm2.5') || lower.includes('lfm')) {
    return 'LFM2.5-2.6B-Q4_K_M.gguf';
  }
  if (lower.includes('3b') || lower.includes('2.5-3b')) {
    return 'qwen2.5-3b-instruct-q4_k_m.gguf';
  }
  if (lower.includes('7b')) {
    return 'qwen2.5-7b-instruct-q4_k_m.gguf';
  }
  if (lower.includes('0.5b') || lower.includes('qwen1.5-0.5b') || lower.includes('xenova')) {
    return 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
  }
  if (lower.includes('1.5b') || lower.includes('1.8b') || lower.includes('qwen1.5')) {
    return 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
  }
  return 'LFM3-1.7B-Q4_K_M.gguf';
}
