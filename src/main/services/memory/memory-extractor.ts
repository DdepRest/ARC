import { LongTermMemoryEntry } from '../../../shared/types/memory';
import crypto from 'crypto';

export class MemoryExtractor {
  // Extraction rules for user statements and preferences
  private rules = [
    { 
      pattern: /запомни(?:,\s*|\s+)что\s+(.+)/i, 
      category: 'fact', 
      getKey: (m: RegExpMatchArray) => `user:fact:${m[1].slice(0, 20).trim().toLowerCase().replace(/\s+/g, '_')}`,
      getValue: (m: RegExpMatchArray) => m[1].trim()
    },
    { 
      pattern: /(?:мне\s+не\s+нравится|я\s+не\s+люблю|не\s+люблю)\s+(.+)/i, 
      category: 'preference', 
      getKey: (m: RegExpMatchArray) => `user:dislike:${m[1].slice(0, 20).trim().toLowerCase().replace(/\s+/g, '_')}`,
      getValue: (m: RegExpMatchArray) => `Не нравится: ${m[1].trim()}`
    },
    { 
      pattern: /я\s+работаю\s+(?:в|на|как|кем)?\s*(.+)/i, 
      category: 'fact', 
      getKey: () => 'user:job',
      getValue: (m: RegExpMatchArray) => `Работа: ${m[1].trim()}`
    },
    { 
      pattern: /я\s+живу\s+(?:в|на|возле|около)?\s*(.+)/i, 
      category: 'fact', 
      getKey: () => 'user:location',
      getValue: (m: RegExpMatchArray) => `Место проживания: ${m[1].trim()}`
    },
    { 
      pattern: /(?:мой|моя|моё|мои|любимый|любимая|любимое)\s+(\w+)\s*[-–—:]\s*([\w\s]+)/i, 
      category: 'preference',
      getKey: (m: RegExpMatchArray) => `user:preference:${m[1].toLowerCase()}`,
      getValue: (m: RegExpMatchArray) => m[2] ? m[2].trim() : m[1].trim()
    },
    { 
      pattern: /я\s+(?:люблю|предпочитаю|хочу)\s+(.+)/i, 
      category: 'preference',
      getKey: (m: RegExpMatchArray) => `user:preference:${m[1].slice(0, 20).trim().toLowerCase().replace(/\s+/g, '_')}`,
      getValue: (m: RegExpMatchArray) => m[1].trim()
    },
    { 
      pattern: /(?:никогда|не)\s+(?:делай|говори|предлагай|показывай)\s+(.+)/i, 
      category: 'preference',
      getKey: (m: RegExpMatchArray) => `user:restriction:${m[1].slice(0, 20).trim().toLowerCase().replace(/\s+/g, '_')}`,
      getValue: (m: RegExpMatchArray) => `Запрет: ${m[1].trim()}`
    }
  ];

  async extract(query: string, response: string): Promise<Partial<LongTermMemoryEntry>[]> {
    const results: Partial<LongTermMemoryEntry>[] = [];
    const textToMatch = query.trim();
    
    for (const rule of this.rules) {
      const match = textToMatch.match(rule.pattern);
      if (match) {
        results.push({
          id: crypto.randomUUID(),
          category: rule.category as any,
          key: rule.getKey(match),
          value: rule.getValue(match),
          confidence: 0.85,
          source: 'extracted',
        });
      }
    }

    // Explicit "remember X" command fallback
    if (query.toLowerCase().startsWith('запомни:') || query.toLowerCase().startsWith('запомни ')) {
      const fact = query.replace(/^запомни[:\s]*(?:что\s+)?/i, '').trim();
      if (fact && !results.some(r => r.value === fact)) {
        results.push({
          id: crypto.randomUUID(),
          category: 'fact',
          key: `user:fact:${Date.now()}`,
          value: fact,
          confidence: 0.95,
          source: 'user_stated',
        });
      }
    }

    return results;
  }
}
