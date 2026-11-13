/**
 * Shared utility for formatting failure reasons into user-facing human messages.
 * Complies with TZ v1.0.10.
 */

export function formatFailureReason(err: any): string {
  if (!err) return 'Неизвестная ошибка связи';

  const errCode = String(err.code || '');
  const errMsg = String(err.message || (typeof err === 'string' ? err : ''));
  const fullText = `${errCode} ${errMsg}`.trim();

  // 1. ECONNREFUSED: «Сервер не отвечает (endpoint недоступен)»
  if (
    errCode === 'ECONNREFUSED' ||
    fullText.includes('ECONNREFUSED') ||
    fullText.includes('connect ECONNREFUSED') ||
    fullText.includes('connection refused')
  ) {
    return 'Сервер не отвечает (endpoint недоступен)';
  }

  // 2. timeout: «Сервер не уложился в 30 секунд»
  if (
    errCode === 'ECONNABORTED' ||
    errCode === 'ETIMEDOUT' ||
    fullText.toLowerCase().includes('timeout') ||
    fullText.toLowerCase().includes('timed out') ||
    fullText.toLowerCase().includes('не уложился')
  ) {
    return 'Сервер не уложился в 30 секунд';
  }

  // 3. quarantine: «Провайдер в карантине до HH:MM после N сбоев»
  if (
    err.isQuarantine ||
    fullText.toLowerCase().includes('карантин') ||
    fullText.toLowerCase().includes('quarantine')
  ) {
    if (err.quarantineUntil) {
      const d = new Date(err.quarantineUntil);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const fails = err.failuresCount || err.failCount || 3;
      return `Провайдер в карантине до ${hh}:${mm} после ${fails} сбоев`;
    }
    // Try regex extraction from message if already formatted or logged
    const match = fullText.match(/до\s+(\d{1,2}:\d{2})\s+после\s+(\d+)\s+сбоев/i);
    if (match) {
      return `Провайдер в карантине до ${match[1]} после ${match[2]} сбоев`;
    }
    return errMsg || 'Провайдер временно в карантине после серии сбоев';
  }

  // 4. HTTP 4xx / 5xx: код и текст сервера
  const statusNum = err.response?.status || err.status || extractHttpStatus(fullText);
  if (statusNum) {
    const statusText = err.response?.statusText || getHttpStatusText(statusNum);
    const detail = err.response?.data?.error?.message || 
                   (typeof err.response?.data?.error === 'string' ? err.response.data.error : '') ||
                   err.detail || '';
    if (detail && detail !== statusText) {
      return `HTTP ${statusNum} ${statusText}: ${detail}`;
    }
    return `HTTP ${statusNum} ${statusText}`;
  }

  // Socket hang up
  if (
    errCode === 'ECONNRESET' ||
    errCode === 'ERR_SOCKET_HANG_UP' ||
    fullText.includes('socket hang up') ||
    fullText.includes('ECONNRESET')
  ) {
    return 'Соединение сброшено сервером (ECONNRESET)';
  }

  // ENOTFOUND
  if (errCode === 'ENOTFOUND' || fullText.includes('ENOTFOUND')) {
    return 'Хост не найден (проверьте URL endpoint в настройках)';
  }

  return errMsg || errCode || 'Сбой при обращении к серверу';
}

function extractHttpStatus(text: string): number | null {
  const match = text.match(/\b(4\d\d|5\d\d)\b/);
  return match ? parseInt(match[1], 10) : null;
}

function getHttpStatusText(status: number): string {
  switch (status) {
    case 400: return 'Bad Request (Некорректный запрос)';
    case 401: return 'Неверный API ключ (Unauthorized)';
    case 402: return 'Закончились токены или баланс (Payment Required)';
    case 403: return 'Доступ запрещён (Forbidden)';
    case 404: return 'Модель или endpoint не найден (Not Found)';
    case 429: return 'Превышен лимит запросов (Rate Limit)';
    case 500: return 'Внутренняя ошибка сервера (Internal Server Error)';
    case 502: return 'Bad Gateway (Шлюз недоступен)';
    case 503: return 'Service Unavailable (Сервис перегружен)';
    case 504: return 'Gateway Timeout (Таймаут шлюза)';
    default: return status >= 500 ? 'Server Error' : 'Client Error';
  }
}
