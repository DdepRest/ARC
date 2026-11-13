import { ToolDefinition, ToolInstance, ToolResult } from '../../../shared/types/tools';
import { DatabaseService } from '../database';

export class WikipediaTool implements ToolInstance {
  definition: ToolDefinition = {
    name: 'wikipedia',
    description: 'Get encyclopedic information from Wikipedia. Best for definitions, companies, history, science, geography, and biographies.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The topic or entity to search for in Wikipedia'
        }
      },
      required: ['query']
    }
  };

  private db = DatabaseService.db;
  private CACHE_TTL = 3600 * 1000; // 1 hour (unified cache TTL)

  async execute(params: { query: string }): Promise<ToolResult> {
    const { query } = params;
    if (!query) return { success: false, error: 'No query provided', toolName: this.definition.name };

    const cached = this.getCachedResult(query, 'wikipedia');
    if (cached) return { success: true, data: cached, toolName: this.definition.name };

    try {
      // Попытка 1: русская Википедия
      console.log(`[WikipediaTool] Searching ru.wikipedia.org for "${query}"`);
      let searchItems = await this.searchWikipedia(query, 'ru');
      let usedLang = 'ru';

      // Попытка 2: английская Википедия (fallback)
      if (!searchItems.length) {
        console.log(`[WikipediaTool] Empty result on ru.wikipedia.org, falling back to en.wikipedia.org for "${query}"`);
        searchItems = await this.searchWikipedia(query, 'en');
        usedLang = 'en';
      }

      if (!searchItems.length) {
        console.log(`[WikipediaTool] No articles found on ru or en Wikipedia for "${query}"`);
        return {
          success: false,
          data: [],
          toolName: this.definition.name,
          error: 'Информация не найдена в Википедии'
        };
      }

      console.log(`[WikipediaTool] Found ${searchItems.length} articles using ${usedLang}.wikipedia.org for "${query}"`);
      this.cacheResult(query, 'wikipedia', searchItems);
      return { success: true, data: searchItems, toolName: this.definition.name };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e), toolName: this.definition.name };
    }
  }

  private async searchWikipedia(query: string, lang: 'ru' | 'en'): Promise<any[]> {
    try {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return [];
      const searchData = await searchRes.json();

      const searchItems = searchData?.query?.search?.slice(0, 3) || [];
      if (!searchItems.length) return [];

      const summaries = await Promise.all(
        searchItems.map(async (item: any) => {
          try {
            const title = item.title;
            const contentUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const contentRes = await fetch(contentUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!contentRes.ok) return null;
            const contentData = await contentRes.json();
            if (!contentData || !contentData.extract) return null;

            return {
              title: contentData.title || title,
              extract: contentData.extract,
              url: contentData.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
              thumbnail: contentData.thumbnail?.source,
              lang
            };
          } catch {
            return null;
          }
        })
      );

      return summaries.filter(s => s !== null && s.extract && s.extract.trim().length > 0);
    } catch (err: any) {
      console.warn(`[WikipediaTool] Error fetching ${lang}.wikipedia.org:`, err?.message || err);
      return [];
    }
  }

  private getCachedResult(query: string, provider: string): any | null {
    try {
      const stmt = this.db.prepare('SELECT results, timestamp FROM search_cache WHERE query = ? AND provider = ?');
      const row = (stmt.get(query, provider) as any);
      if (row && Date.now() - row.timestamp < this.CACHE_TTL) {
        return JSON.parse(row.results);
      }
    } catch (e) { console.warn('Ignored error in catch', e); }
    return null;
  }

  private cacheResult(query: string, provider: string, results: any) {
    try {
      const id = `wiki_${Buffer.from(query).toString('base64').substring(0, 32)}`;
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO search_cache (id, query, provider, results, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(id, query, provider, JSON.stringify(results), Date.now());
    } catch (e) { console.warn('Ignored error in catch', e); }
  }
}
