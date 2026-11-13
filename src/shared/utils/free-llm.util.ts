export interface MinimalAiProvider {
  id?: string;
  name?: string;
  endpoint?: string;
  type?: string;
  apiKey?: string;
  freeTier?: string;
  model?: string;
  noAuthHeader?: boolean;
}

/**
 * Определяет, является ли провайдер локальным или сетевым шлюзом FreeLLM / FreeAPILLM.
 * Учитывает:
 * - Имя или ID провайдера (freellm, freeapi)
 * - Формат ключа API (начинается с freellmapi-)
 * - Адрес эндпоинта (содержит freellm, freeapi)
 * - Динамические порты FreeLLM (31415..31430, 3067..3075) при занятости базового порта
 * - Локальный шлюз с моделью 'auto'
 */
export function isFreeLlmGateway(provider?: MinimalAiProvider | null): boolean {
  if (!provider) return false;
  const endpointLower = (provider.endpoint || '').toLowerCase();
  const nameLower = (provider.name || '').toLowerCase();
  const idLower = (provider.id || '').toLowerCase();
  const keyLower = (provider.apiKey || '').toLowerCase();

  // Явное указание в имени или ID
  if (
    nameLower.includes('freellm') ||
    nameLower.includes('freeapi') ||
    idLower.includes('freellm') ||
    idLower.includes('freeapi')
  ) {
    return true;
  }

  // Сигнатура единого ключа FreeLLM API (freellmapi-...)
  if (keyLower.startsWith('freellmapi-') || keyLower.includes('freellm')) {
    return true;
  }

  // Подстрока freellm / freeapi в эндпоинте
  if (endpointLower.includes('freellm') || endpointLower.includes('freeapi')) {
    return true;
  }

  // Динамические локальные порты FreeLLM:
  // 31415 (стандарт) и 31416..31430 (когда порт 31415 занят на ПК), а также 3067..3075 (FreeAPILLM)
  if (/:3141[5-9]|:3142[0-9]|:31430|:306[7-9]|:307[0-5]/.test(endpointLower)) {
    return true;
  }

  // Локальный шлюз с моделью 'auto'
  if (provider.type === 'local' && (provider.freeTier === 'free' || provider.model === 'auto')) {
    return true;
  }

  return false;
}

/**
 * Извлекает хост и порт из любого формата URL/эндпоинта (например, "127.0.0.1:31415" или "http://192.168.1.50:31416/v1")
 */
export function extractHostPort(endpoint?: string): string {
  if (!endpoint || typeof endpoint !== 'string') return '';
  const match = endpoint.match(/https?:\/\/([^/]+)/);
  if (match?.[1]) return match[1];
  return endpoint.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

/**
 * Единая кросс-процессная нормализация эндпоинта для OpenAI-совместимых и локальных шлюзов (FreeLLM, Ollama, LM Studio).
 * Корректно обрабатывает:
 * - голый хост/порт (127.0.0.1:31415) -> http://127.0.0.1:31415/v1/chat/completions
 * - базу URL (http://127.0.0.1:31415/v1) -> http://127.0.0.1:31415/v1/chat/completions
 * - пути из дашборда FreeLLM (/v1/responses, /v1/embeddings) -> http://127.0.0.1:31415/v1/chat/completions
 * - дублирующиеся сегменты /v1/v1 -> /v1
 */
export function normalizeOpenAiEndpoint(endpoint?: string): string {
  if (!endpoint || typeof endpoint !== 'string') return '';
  let trimmed = endpoint.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `http://${trimmed}`;
  }

  // Устраняем случайные дублированные /v1/v1 от слияния путей
  trimmed = trimmed.replace(/\/v1\/v1\b/g, '/v1');

  // Отрезаем завершающие слэши для проверки суффиксов
  const clean = trimmed.replace(/\/+$/, '');

  // Если указан альтернативный эндпоинт FreeLLM (/responses или /embeddings), нормализуем к /v1/chat/completions
  if (
    clean.endsWith('/responses') ||
    clean.endsWith('/v1/responses') ||
    clean.endsWith('/embeddings') ||
    clean.endsWith('/v1/embeddings')
  ) {
    const base = clean
      .replace(/\/v1\/(?:responses|embeddings)$/, '')
      .replace(/\/(?:responses|embeddings)$/, '')
      .replace(/\/+$/, '');
    return `${base}/v1/chat/completions`;
  }

  // Если уже содержит целевой путь или это специализированный эндпоинт (Anthropic, AI Horde, Ollama native)
  if (
    clean.endsWith('/chat/completions') ||
    clean.includes('/chat/completions?') ||
    clean.endsWith('/messages') ||
    clean.includes('/api/generate') ||
    clean.includes('/generate/text') ||
    clean.endsWith('/api/chat')
  ) {
    return clean;
  }

  if (clean.endsWith('/v1') || clean.endsWith('/v1beta')) {
    return `${clean}/chat/completions`;
  }

  return `${clean}/v1/chat/completions`;
}
