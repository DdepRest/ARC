export interface EndpointValidationResult {
  valid: boolean;
  error?: string;
}

export function validateProviderEndpoint(endpoint?: string): EndpointValidationResult {
  const raw = (endpoint || '').trim();
  if (!raw) {
    return { valid: false, error: 'Укажите URL эндпоинта (например https://... или http://127.0.0.1:3067/...)' };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Поддерживаются только протоколы http:// и https://' };
    }
    if (!parsed.hostname) {
      return { valid: false, error: 'Некорректное имя хоста в URL' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Некорректный формат URL эндпоинта' };
  }
}

export function formatCheckedAtTime(checkedAt?: number): string {
  if (!checkedAt || !Number.isFinite(checkedAt)) return '';
  try {
    const d = new Date(checkedAt);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}
