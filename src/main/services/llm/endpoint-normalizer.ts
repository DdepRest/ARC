import { normalizeOpenAiEndpoint } from '../../../shared/utils/free-llm.util';

/**
 * Утилита нормализации эндпоинтов для OpenAI-совместимых и локальных провайдеров.
 * Корректно преобразует базовые URL (например, http://127.0.0.1:31415/v1 или http://localhost:11434/v1)
 * в полные пути для Chat Completions и Models, предотвращая дублирование /v1/v1 и поддерживая форматы FreeLLM.
 */

export function resolveChatEndpoint(endpoint: string): string {
  return normalizeOpenAiEndpoint(endpoint);
}

/**
 * Извлекает базовый URL формата http://<host>:<port>/v1 для отображения пользователю и конфигураций SDK.
 */
export function resolveBaseUrl(endpoint: string): string {
  if (!endpoint || typeof endpoint !== 'string') return '';
  let trimmed = endpoint.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `http://${trimmed}`;
  }

  trimmed = trimmed.replace(/\/v1\/v1\b/g, '/v1');

  let clean = trimmed.replace(/\/+$/, '');
  clean = clean
    .replace(/\/chat\/completions$/, '')
    .replace(/\/messages$/, '')
    .replace(/\/responses$/, '')
    .replace(/\/embeddings$/, '')
    .replace(/\/models$/, '')
    .replace(/\/api\/chat$/, '')
    .replace(/\/api\/generate$/, '')
    .replace(/\/generate\/text$/, '')
    .replace(/\/generate$/, '');

  clean = clean.replace(/\/+$/, '');
  if (!clean.endsWith('/v1') && !clean.endsWith('/v1beta') && !clean.includes('/api/')) {
    clean = `${clean}/v1`;
  }
  return clean;
}

export function resolveModelsEndpoint(endpoint: string): string {
  const base = resolveBaseUrl(endpoint);
  if (!base) return '';
  return `${base}/models`;
}
