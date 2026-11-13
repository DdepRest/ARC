import { ToolDefinition, ToolInstance, ToolResult } from '../../../shared/types/tools';
import { WikipediaTool } from './wikipedia.tool';
import { WebSearchTool } from './web-search.tool';
import { MemorySearchTool } from './memory-search.tool';
import { SystemControlTool } from './system-control.tool';
import { TaskManagementTool } from './task-management.tool';
import { GetWeatherTool } from './get-weather.tool';
import { logger } from '../../utils/logger';
import { extractWeatherLocation, validateCityLocation, WEATHER_STOP_WORDS } from './weather-geocoding.util';

export class ToolDispatcher {
  private static instance: ToolDispatcher;
  private tools: Map<string, ToolInstance> = new Map();

  private constructor() {
    // 1. Wikipedia first (encyclopedic priority)
    this.registerTool(new WikipediaTool());
    // 2. Web search second (current events/news)
    this.registerTool(new WebSearchTool());
    // 3. Memory search
    this.registerTool(new MemorySearchTool());
    // 4. System & Task management
    this.registerTool(new SystemControlTool());
    this.registerTool(new TaskManagementTool());
    // 5. Weather tool
    this.registerTool(new GetWeatherTool());
  }

  public static getInstance(): ToolDispatcher {
    if (!ToolDispatcher.instance) {
      ToolDispatcher.instance = new ToolDispatcher();
    }
    return ToolDispatcher.instance;
  }

  registerTool(tool: ToolInstance) {
    this.tools.set(tool.definition.name, tool);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async executeTool(name: string, params: any): Promise<ToolResult> {
    const normalizedName = name === 'memory_search' ? 'memory:search' : name;
    console.log(`\n[ToolDispatcher] EXECUTE TOOL TRIGGERED: ${normalizedName}`, params);
    
    const tool = this.tools.get(normalizedName);
    if (!tool) {
      console.error(`[ToolDispatcher] ERROR: Tool ${name} not found`);
      return { success: false, error: `Tool ${name} not found`, toolName: name };
    }

    // BLOCK 4: Weather Intercept in ToolDispatcher (when LLM calls web_search for weather)
    if (normalizedName === 'web_search' && !params?.isWeatherFallback && this.detectWeatherIntent(params?.query || '')) {
      const locationCandidate = this.extractLocation(params?.query || '');
      if (locationCandidate) {
        const validation = await validateCityLocation(locationCandidate);
        if (validation.valid && validation.normalizedName) {
          const location = validation.normalizedName;
          const weatherTool = this.tools.get('get_weather');
          if (weatherTool) {
            try {
              const weatherRes = await weatherTool.execute({ location });
              if (weatherRes && weatherRes.success && weatherRes.data) {
                return weatherRes;
              }
            } catch (_) {}
          }
        }
      }
      console.warn(`[ToolDispatcher] Weather API unavailable or city invalid, executing web_search with warning`);
      try {
        const fallbackRes = await tool.execute(params);
        if (fallbackRes.data && typeof fallbackRes.data === 'object') {
          fallbackRes.data.staleWarning = 'Внимание: данные могут быть несвежими.';
          fallbackRes.data.source = 'weather_fallback';
        }
        return fallbackRes;
      } catch (fbErr: any) {
        return { success: false, error: fbErr.message, toolName: 'web_search' };
      }
    }

    // BLOCK 3: Fallback logic for Wikipedia
    if (normalizedName === 'wikipedia') {
      try {
        console.log(`[ToolDispatcher] Calling wikipedia tool.execute...`);
        const result = await tool.execute(params);
        console.log(`[ToolDispatcher] Wikipedia result success: ${result.success}`);
        
        const isEmpty = !result.data || 
          (Array.isArray(result.data) && result.data.length === 0) || 
          result.data === 'No articles found.';

        if (!result.success || isEmpty) {
          console.log(`[Search] Wikipedia returned 0 results, falling back to web_search for query: "${params?.query}"`);
          const webSearchTool = this.tools.get('web_search');
          if (webSearchTool) {
            console.log(`[ToolDispatcher] Executing web_search fallback...`);
            const fallbackRes = await webSearchTool.execute(params);
            console.log(`[ToolDispatcher] Fallback web_search result:`, fallbackRes.success);
            if (fallbackRes.data && typeof fallbackRes.data === 'object') {
              fallbackRes.data.source = 'web_search_fallback';
            }
            return fallbackRes;
          }
        }
        return result;
      } catch (error: any) {
        console.error(`[ToolDispatcher] [Search] Wikipedia error for "${params?.query}", falling back to web_search:`, error?.stack || error?.message || error);
        const webSearchTool = this.tools.get('web_search');
        if (webSearchTool) {
          try {
            console.log(`[ToolDispatcher] Executing web_search fallback after exception...`);
            const fallbackRes = await webSearchTool.execute(params);
            if (fallbackRes.data && typeof fallbackRes.data === 'object') {
              fallbackRes.data.source = 'web_search_fallback';
            }
            return fallbackRes;
          } catch (fbErr: any) {
            console.error(`[ToolDispatcher] Fallback web_search error:`, fbErr?.stack || fbErr);
            return { success: false, error: fbErr.message, toolName: 'web_search' };
          }
        }
        return { success: false, error: error.message, toolName: name };
      }
    }

    try {
      console.log(`[ToolDispatcher] Calling ${normalizedName} tool.execute...`);
      const result = await tool.execute(params);
      console.log(`[ToolDispatcher] ${normalizedName} result success: ${result.success}`);
      return result;
    } catch (e: any) {
      console.error(`[ToolDispatcher] Tool ${normalizedName} error:`, e?.stack || e?.message || e);
      return { success: false, error: e.message, toolName: name };
    }
  }

  detectWeatherIntent(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();
    if (/(?:^|\s)(?:погода|погоду|погоде|погодой|прогноз\s+погоды)(?:$|\s|[.,?!])/i.test(lower)) {
      return true;
    }
    const weatherPhenomena = /(?:дожд[ьяеи]|снег[ае]?|снегопад|осадк[а-я]*|ветер|ветра|температур[а-я]*|градус[а-я]*|пасмурно|ясно|солнечно|холодно|жарко)/i.test(lower);
    const weatherContext = /(?:сегодня|завтра|сейчас|на\s+улице|в\s+[а-яА-Яa-zA-Z-]+|днем|вечером|утром|ночью|будет\s+ли|какая|сколько|ожидает)/i.test(lower);
    return weatherPhenomena && weatherContext;
  }

  extractLocation(text: string, defaultCity: string = 'Москва'): string | null {
    return extractWeatherLocation(text, defaultCity);
  }

  async getPreRoutedWeatherLocation(
    text: string,
    settings?: any
  ): Promise<string | null> {
    if (!this.detectWeatherIntent(text)) {
      return null;
    }

    const defaultCity = settings?.weather?.defaultCity || settings?.defaultCity || 'Москва';
    const locationCandidate = this.extractLocation(text, defaultCity);
    if (!locationCandidate) {
      return null;
    }

    const validation = await validateCityLocation(locationCandidate);
    if (!validation.valid || !validation.normalizedName) {
      return null;
    }

    const location = validation.normalizedName;

    console.log('[ToolDispatcher] PRE-ROUTED: get_weather');

    return location;
  }

  formatWeatherHuman(data: any): string {
    if (!data) return 'Данные о погоде недоступны.';
    const loc = data.location || 'городе';
    const temp = Math.round(data.temperature);
    const feels = Math.round(data.feels_like);
    const tempSign = temp > 0 ? `+${temp}` : `${temp}`;
    const feelsSign = feels > 0 ? `+${feels}` : `${feels}`;

    const parts: string[] = [];
    const locPrefix = /^(?:город|г\.)\s+/i.test(loc) ? '' : 'городе ';
    parts.push(`В ${locPrefix}${loc} сейчас ${tempSign}°C (ощущается как ${feelsSign}°C).`);

    if (data.precipitation !== undefined && data.precipitation > 0) {
      parts.push(`Осадки: ${data.precipitation} мм.`);
    } else {
      parts.push('Без существенных осадков.');
    }

    if (data.wind_speed !== undefined) {
      parts.push(`Ветер ${data.wind_direction || ''} ${Math.round(data.wind_speed)} км/ч.`);
    }

    if (data.humidity !== undefined) {
      parts.push(`Влажность ${Math.round(data.humidity)}%.`);
    }

    if (data.pressure !== undefined) {
      const mmPressure = Math.round(data.pressure * 0.750062);
      parts.push(`Давление ${mmPressure} мм рт. ст.`);
    }

    return parts.join(' ');
  }

  formatResult(data: any): string {
    if (!data) return '';
    if (typeof data === 'string') return data;

    let prefix = '';
    if (data.staleWarning) {
      prefix = `${data.staleWarning}\n\n`;
    }

    if (data.formatted && typeof data.formatted === 'string') {
      return prefix + data.formatted;
    }

    if (data.message && typeof data.message === 'string') {
      return prefix + data.message;
    }

    // Format Weather result
    if (data.location && data.temperature !== undefined) {
      return prefix + this.formatWeatherHuman(data);
    }
    
    // Format Wikipedia articles list
    if (Array.isArray(data) && data.length > 0 && data[0].extract) {
      return prefix + data.map((item: any, idx: number) => 
        `[Статья ${idx + 1}: ${item.title}]\n${item.extract}\nСсылка: ${item.url || ''}`
      ).join('\n\n');
    }

    // Format Web search results
    if (data.results && Array.isArray(data.results)) {
      return prefix + data.results.map((item: any, idx: number) => 
        `[Результат ${idx + 1}: ${item.title}]\n${item.snippet}\nСсылка: ${item.url || ''}`
      ).join('\n\n');
    }

    return prefix + JSON.stringify(data);
  }

  async dispatch(name: string, params: any): Promise<string> {
    const res = await this.executeTool(name, params);
    if (res && res.data) {
      return this.formatResult(res.data);
    }
    if (res && res.error) return `Error: ${res.error}`;
    return JSON.stringify(res);
  }
}

