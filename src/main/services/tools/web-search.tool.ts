import { ToolDefinition, ToolInstance, ToolResult } from '../../../shared/types/tools';
import { DatabaseService } from '../database';

export class WebSearchTool implements ToolInstance {
  definition: ToolDefinition = {
    name: 'web_search',
    description: 'Search the internet for current information, news, and facts. Use this when the user asks about current events or things you don\'t know. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ИСПОЛЬЗОВАТЬ ДЛЯ ЗАПРОСОВ О ПОГОДЕ. Для погоды используй get_weather.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look for'
        }
      },
      required: ['query']
    }
  };

  private db = DatabaseService.db;
  private CACHE_TTL = 3600 * 1000; // 1 hour

  async execute(params: { query: string }): Promise<ToolResult> {
    const { query } = params;
    if (!query) return { success: false, error: 'No query provided', toolName: this.definition.name };

    // 1. Check Cache
    const cached = this.getCachedResult(query, 'ddg');
    if (cached) {
      return { success: true, data: cached, toolName: this.definition.name };
    }

    try {
      // Clean query from common fluff words
      let cleanQuery = query.trim();
      cleanQuery = cleanQuery
        .replace(/^(кто такой|кто такая|что такое|найди информацию о|расскажи про|поиск|search)\s+/i, '')
        .trim();

      console.log(`[WebSearch] Querying DuckDuckGo HTML search for: "${cleanQuery}" (Original: "${query}")`);

      // Try to get real search results from DuckDuckGo HTML search first (more robust, returns real snippets)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
      const htmlResponse = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        const chunks = html.split('<div class="result ');
        const results: any[] = [];

        for (let i = 1; i < chunks.length && results.length < 4; i++) {
          const chunk = chunks[i];

          // Extract URL
          const urlMatch = chunk.match(/<a class="result__url" href="([^"]+)"/);
          let url = urlMatch ? urlMatch[1] : '';
          if (url.includes('uddg=')) {
            const decoded = decodeURIComponent(url);
            const redirectMatch = decoded.match(/uddg=([^&]+)/);
            if (redirectMatch) {
              url = redirectMatch[1];
            }
          }

          // Extract Title
          const titleMatch = chunk.match(/<a class="result__url"[^>]*>([\s\S]*?)<\/a>/);
          let title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

          // Extract Snippet
          const snippetMatch = chunk.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

          if (title || snippet) {
            results.push({
              title: title.replace(/\s+/g, ' '),
              url,
              snippet: snippet.replace(/\s+/g, ' ')
            });
          }
        }

        if (results.length > 0) {
          const resultData = {
            query: cleanQuery,
            source: 'DuckDuckGo Search',
            results
          };
          this.cacheResult(query, 'ddg', resultData);
          console.log(`[WebSearch] HTML search succeeded. Found ${results.length} results.`);
          return { success: true, data: resultData, toolName: this.definition.name };
        }
      }

      console.log('[WebSearch] HTML search yielded no results, falling back to Instant Answer API.');

      // Fallback: DuckDuckGo Instant Answer API (Free, no key)
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(url);
      const data = await response.json();

      const result = {
        abstract: data.AbstractText,
        source: data.AbstractSource,
        url: data.AbstractURL,
        related: data.RelatedTopics?.slice(0, 3).map((t: any) => ({
          text: t.Text,
          url: t.FirstURL
        })) || []
      };

      // Cache result
      this.cacheResult(query, 'ddg', result);

      return { success: true, data: result, toolName: this.definition.name };
    } catch (e: any) {
      console.error('WebSearch Error:', e);
      return { success: false, error: e.message, toolName: this.definition.name };
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
      const id = `${provider}_${Buffer.from(query).toString('base64').substring(0, 32)}`;
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO search_cache (id, query, provider, results, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(id, query, provider, JSON.stringify(results), Date.now());
    } catch (e) { console.warn('Ignored error in catch', e); }
  }
}
