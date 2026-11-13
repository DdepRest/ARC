import axios from 'axios';

export interface FreeLlmDetectionResult {
  found: boolean;
  host?: string;
  port?: number;
  baseUrl?: string;
  endpoint?: string;
  models?: string[];
  message?: string;
}

/**
 * Автоматически сканирует диапазон локальных портов для поиска запущенного шлюза FreeLLM / FreeAPILLM.
 * Если базовый порт 31415 занят другим приложением на ПК, FreeLLM биндится на 31416..31425.
 * Сканер проверяет доступность в параллельном режиме с коротким таймаутом.
 */
export async function scanLocalFreeLlm(host = '127.0.0.1'): Promise<FreeLlmDetectionResult> {
  const candidatePorts = [31415, 31416, 31417, 31418, 31419, 31420, 31421, 31422, 3067, 3068];

  const probePromises = candidatePorts.map(async (port) => {
    try {
      const url = `http://${host}:${port}/v1/models`;
      const res = await axios.get(url, { timeout: 1000 });
      if (res.status >= 200 && res.status < 300) {
        return { port, data: res.data };
      }
    } catch {
      try {
        const rootUrl = `http://${host}:${port}/`;
        const res = await axios.get(rootUrl, { timeout: 800 });
        if (res.status >= 200 && res.status < 300) {
          return { port, data: null };
        }
      } catch {}
    }
    return null;
  });

  const results = await Promise.all(probePromises);
  const hit = results.find(r => r !== null);
  if (hit) {
    const port = hit.port;
    const models = Array.isArray(hit.data?.data)
      ? hit.data.data.map((m: any) => m.id || m.name).filter(Boolean)
      : Array.isArray(hit.data?.models)
        ? hit.data.models.map((m: any) => m.name || m.id).filter(Boolean)
        : [];
    return {
      found: true,
      host,
      port,
      baseUrl: `http://${host}:${port}/v1`,
      endpoint: `http://${host}:${port}/v1/chat/completions`,
      models,
      message: `Обнаружен запущенный FreeLLM на http://${host}:${port}/v1`
    };
  }

  return { found: false, message: 'FreeLLM не обнаружен на стандартных локальных портах (31415..31422)' };
}
