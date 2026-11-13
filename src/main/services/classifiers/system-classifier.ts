import { BrowserWindow, shell } from 'electron';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { SystemControlTool } from '../tools/system-control.tool';
import { normalizeRussianNumbers } from '../../../shared/utils/ru-number-parser';
import { resolveSiteQueryToUrl } from '../../../shared/utils/url-normalizer';

const systemControlTool = new SystemControlTool();

export class SystemClassifier {
  static async classify(lower: string, isSearchQuery: boolean): Promise<string | null> {
    const normalizedLower = normalizeRussianNumbers(lower);
    
    // Launch app matches
    const appLaunchRegex = /(?:открой|запусти|запуск|стартани|включи) (калькулятор|блокнот|пейнт|браузер|проводник|paint|notepad|calculator|explorer|chrome)/i;
    if (appLaunchRegex.test(lower)) {
      const match = lower.match(appLaunchRegex);
      if (match) {
        const rawApp = match[1];
        let appKey = '';
        if (rawApp.includes('калькулятор') || rawApp.includes('calc')) appKey = 'calculator';
        else if (rawApp.includes('блокнот') || rawApp.includes('note')) appKey = 'notepad';
        else if (rawApp.includes('пейнт') || rawApp.includes('paint')) appKey = 'paint';
        else if (rawApp.includes('браузер') || rawApp.includes('chrome')) appKey = 'browser';
        else if (rawApp.includes('проводник') || rawApp.includes('explorer')) appKey = 'explorer';

        if (appKey) {
          const res = await systemControlTool.execute({ action: 'launch_app', app_name: appKey });
          if (res.success) {
            return `Слушаюсь. Запускаю ${rawApp}.`;
          }
          return `не удалось запустить приложение ${rawApp}: ${res.error || 'ошибка выполнения ОС'}.`;
        }
      }
    }

    // Universal Site Opener Intent Match (exclude macro/script/media/system keywords)
    const isExcludedFromSiteOpener = /(?:скрипт|сценари|макрос|команд|музык|трек|песн|плеер|громкост|звук|процент|%|таймер|фокус|спринт|отдых|задач|цел)/i.test(lower);
    const siteMatch = !isSearchQuery && !isExcludedFromSiteOpener && lower.match(/(?:открой|открою|открывай|открой-ка|перейди|перейди на|зайди|зайди на|найди сайт|открой сайт)\s+(?:сайт\s+)?(.+)/i);
    if (siteMatch) {
      const siteName = siteMatch[1]
        .trim()
        .replace(/^(?:сайт|страниц[уа])\s+/i, '')
        .replace(/^[.,!?;:"'«»()[\]\s]+|[.,!?;:"'«»()[\]\s]+$/g, '')
        .trim();
      const { url } = resolveSiteQueryToUrl(siteName);

      Promise.resolve(shell.openExternal(url)).catch((e) => {
        console.error('Failed to open external url in SystemClassifier:', e);
      });
      return `Открываю ${siteName}.`;
    }

    // Window Management Commands
    if (/(?:закрою|закрой|сверни|разверни)\s+(?:окно|приложение|программу)?/i.test(lower)) {
      try {
        const focused = BrowserWindow.getFocusedWindow();
        if (focused) {
          if (lower.includes('сверни')) focused.minimize();
          else if (lower.includes('разверни')) focused.maximize();
          else focused.close();
        } else {
          systemControlTool.execute({ action: 'key_press', key: 'Alt+F4' }).catch(() => {});
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
      return `Команда управления окном выполнена.`;
    }

    // System Status
    if (lower === 'статус' || lower === 'состояние системы') {
      try {
        const infoRes = await systemControlTool.execute({ action: 'get_system_info' });
        if (infoRes.success && infoRes.data) {
          const d = infoRes.data;
          return `Все системы функционируют в штатном режиме. Нагрузка на процессор составляет ${d.cpuLoad}, оперативная память использована на ${d.memoryUsed}. Компьютер непрерывно работает ${d.uptime}.`;
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
      return 'Все системы функционируют в штатном режиме. Реактор стабилен.';
    }

    // Battery status
    if (/(?:статус|заряд|уровень)? ?батаре[ия]|аккумулятор/i.test(lower)) {
      try {
        const infoRes = await systemControlTool.execute({ action: 'get_system_info' });
        if (infoRes.success && infoRes.data) {
          const d = infoRes.data;
          if (typeof d.battery === 'string') {
            return 'батарея не обнаружена. Компьютер подключен к источнику питания напрямую.';
          } else {
            return `уровень заряда батареи составляет ${d.battery.percent}%. Режим зарядки: ${d.battery.isCharging ? 'активен' : 'неактивен'}.`;
          }
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
    }

    // Uptime status
    if (/аптайм|время работы/i.test(lower)) {
      try {
        const infoRes = await systemControlTool.execute({ action: 'get_system_info' });
        if (infoRes.success && infoRes.data) {
          return `время непрерывной работы операционной системы составляет ${infoRes.data.uptime}.`;
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
    }

    // System Volume adjustment matches
    if (!/музык|трек|песн|плеер|вк|vk|аудио/i.test(normalizedLower) && !normalizedLower.endsWith(' в')) {
      const sysVolMatch = normalizedLower.match(/(?:сделай|поставь|поставить|установи)?\s*(?:системн[а-я]+\s+)?(?:громкость|звук)?\s*(?:системы|компьютера)?\s*(?:на\s*)?(\d{1,3})\s*(?:%|процент[а-я]*)?/i);
      if (sysVolMatch && /(?:громкость|звук|%|процент)/i.test(normalizedLower)) {
        const level = String(Math.max(0, Math.min(100, parseInt(sysVolMatch[1], 10))));
        const res = await systemControlTool.execute({ action: 'set_volume', volume_level: level });
        if (res.success) {
          return `Конечно. Громкость системы установлена на ${level}%.`;
        }
      }

      if (/тише|убавь громкость|потише/i.test(normalizedLower)) {
        const res = await systemControlTool.execute({ action: 'set_volume', volume_level: '-10' });
        if (res.success) {
          return 'Конечно. Сделал системный звук потише.';
        }
      }

      if (/громче|прибавь громкость|погромче/i.test(normalizedLower)) {
        const res = await systemControlTool.execute({ action: 'set_volume', volume_level: '+10' });
        if (res.success) {
          return 'Сделано. Громкость системы увеличена.';
        }
      }

      if (/выключи звук|включи звук|убери звук|убери громкость|без звука|заглуши/i.test(normalizedLower)) {
        const res = await systemControlTool.execute({ action: 'set_volume', volume_level: 'mute' });
        if (res.success) {
          return 'Звуковой канал переключен.';
        }
      }
    }

    // Vision & Screen Capture Commands
    if (
      /(?:посмотри|покажи|проанализируй|опиши|что\s+ты\s+видишь|что\s+видишь|что\s+на|что|сканируй)\s+.*?(?:экран|монитор|диспл|рабоч[ийе]\s+стол|скриншот|снимок)/i.test(lower) ||
      /(?:что\s+(?:ты\s+)?видишь|что\s+на\s+экране|что\s+на\s+мониторе|посмотри\s+на\s+экран|проанализируй\s+экран)/i.test(lower) ||
      /(?:сделай|снять)\s+(?:скриншот|снимок\s+экрана)/i.test(lower)
    ) {
      try {
        const captureRes = await systemControlTool.execute({ action: 'capture_screen' });
        if (!captureRes.success) {
            console.error('[Vision] capture_screen failed:', captureRes.error);
            return `ошибка захвата экрана: ${captureRes.error}`;
        }
        
        const isWin = os.platform() === 'win32';
        const tmpFile = isWin ? path.join(os.tmpdir(), 'arc_screen.png') : '/tmp/arc_screen.png';
        
        if (fs.existsSync(tmpFile)) {
           const base64Data = fs.readFileSync(tmpFile, { encoding: 'base64' });
           const { providerManager } = require('../llm/providers/provider-manager');
           const config = providerManager.resolveMultimodalGeminiConfig();
           if (!config.apiKey.value) {
               return 'ключ Gemini API не настроен. Модуль визуального анализа недоступен.';
           }
           
           const { GoogleGenAI } = require('@google/genai');
           const ai = new GoogleGenAI({ apiKey: config.apiKey.value, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
           
           const response = await ai.models.generateContent({
             model: config.model,
             contents: [
               { inlineData: { mimeType: 'image/png', data: base64Data } },
               "Что ты видишь на экране? Опиши кратко, емко и по делу, как ИИ-ассистент A.R.C. Отвечай от первого лица, сразу к делу. Если спрашивают, что ты видишь - перечисли основные элементы. Отвечай не более чем 2-3 предложениями."
             ]
           });
           
           return response.text || "не удалось проанализировать изображение.";
        }
      } catch (e: any) {
        console.error('[Vision] Analysis error:', e);
        return `Произошла ошибка при анализе изображения: ${e.message}`;
      }
      return `не удалось получить доступ к экрану или файл снимка не был создан. Возможно, отсутствуют права или графический интерфейс.`;
    }

    // Mouse & Desktop Automation Commands
    if (/(?:кликни|нажми|подвинь|перемести|прокрути|проскролль)\s+(?:мышкой?|курсор)?/i.test(lower)) {
      try {
        if (lower.includes('кликни') || lower.includes('нажми')) {
          const res = await systemControlTool.execute({ action: 'mouse_click', click_type: lower.includes('правой') ? 'right' : 'left' });
          if (res.success) return `Клик мышью выполнен.`;
          return `не удалось выполнить клик мышью: ${res.error || 'ошибка ОС'}`;
        } else if (lower.includes('прокрути') || lower.includes('проскролль')) {
          const res = await systemControlTool.execute({ action: 'mouse_scroll', scroll_direction: lower.includes('вверх') ? 'up' : 'down' });
          if (res.success) return `Прокрутка выполнена.`;
          return `не удалось проскроллить экран: ${res.error || 'ошибка ОС'}`;
        } else {
          const res = await systemControlTool.execute({ action: 'mouse_move', x: 500, y: 500 });
          if (res.success) return `Курсор перемещен.`;
          return `не удалось переместить курсор: ${res.error || 'ошибка ОС'}`;
        }
      } catch (e: any) {
        return `произошел сбой при выполнении команды управления манипулятором: ${e.message || e}`;
      }
    }

    // Time & Date
    if (lower === 'время' || lower === 'который час' || lower === 'сколько времени' || lower === 'текущее время') {
      return `Текущее время - ${new Date().toLocaleTimeString()}`;
    }
    if (lower === 'дата' || lower === 'какое сегодня число' || lower === 'сегодняшняя дата') {
      return `Сегодняшняя дата - ${new Date().toLocaleDateString()}`;
    }

    return null;
  }
}
