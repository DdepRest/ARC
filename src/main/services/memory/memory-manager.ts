import { ShortTermMemory } from './short-term-memory';
import { LongTermMemory } from './long-term-memory';
import { BehavioralMemory } from './behavioral-memory';
import { MemoryExtractor } from './memory-extractor';
import { ContextCompressor } from './context-compressor';
import { BehaviorEvent, LongTermMemoryEntry, ShortTermMessage } from '../../../shared/types/memory';
import crypto from 'crypto';

function cleanMessageContent(content: string): string {
  if (!content) return content;
  
  let cleaned = content;
  
  // If the message has the system prompt leaked inside
  if (cleaned.includes('Ты — A.R.C.') || cleaned.includes('A.R.C., преданный интеллектуальный голосовой ассистент')) {
    const assistantMarkerIdx = cleaned.lastIndexOf('assistant\n');
    if (assistantMarkerIdx !== -1) {
      cleaned = cleaned.substring(assistantMarkerIdx + 10);
    } else {
      const assistantIdx = cleaned.lastIndexOf('assistant');
      if (assistantIdx !== -1) {
        cleaned = cleaned.substring(assistantIdx + 9);
      } else {
        const systemEndStr = 'содействие в решении повседневных задач.';
        const idx = cleaned.indexOf(systemEndStr);
        if (idx !== -1) {
          cleaned = cleaned.substring(idx + systemEndStr.length).trim();
        }
      }
    }
  }

  // Strip typical template wrappers, formatting leftovers, and Chinese characters
  cleaned = cleaned
    .replace(/<\|im_start\|>system[\s\S]*?<\|im_end\|>/gi, '')
    .replace(/<\|im_start\|>user[\s\S]*?<\|im_end\|>/gi, '')
    .replace(/<\|im_start\|>assistant/gi, '')
    .replace(/<\|im_end\|>/gi, '')
    .replace(/system\n/gi, '')
    .replace(/user\n/gi, '')
    .replace(/assistant\n/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
    .replace(/TOOL:\s*\w+\s*\{.*?\}/gi, '')
    .replace(/TOOL:\s*\w+[\s\S]*?(?=\n|$)/gi, '') // line-level TOOL block
    .replace(/[\u4e00-\u9fa5]/g, '') // Chinese characters
    .trim();

  return cleaned;
}

export class MemoryManager {
  public stm: ShortTermMemory;
  public ltm: LongTermMemory;
  public bm: BehavioralMemory;
  public extractor: MemoryExtractor;
  public compressor: ContextCompressor;

  constructor() {
    this.stm = new ShortTermMemory();
    this.ltm = new LongTermMemory();
    this.bm = new BehavioralMemory();
    this.extractor = new MemoryExtractor();
    this.compressor = new ContextCompressor();
  }

  async processInteraction(query: string, response: string, metadata?: any): Promise<void> {
    const now = Date.now();
    const cleanedResponse = cleanMessageContent(response);
    await this.stm.addMessage({ id: crypto.randomUUID(), role: 'user', content: query, timestamp: now, metadata });
    await this.stm.addMessage({ id: crypto.randomUUID(), role: 'assistant', content: cleanedResponse, timestamp: now + 1, metadata });

    const extractedItems = await this.extractor.extract(query, response);

    for (const item of extractedItems) {
      if (item.confidence && item.confidence > 0.6) {
        // Complete the entry with fields that might be missing
        const fullEntry: LongTermMemoryEntry = {
          id: item.id || crypto.randomUUID(),
          category: item.category || 'fact',
          key: item.key!,
          value: item.value,
          embedding: item.embedding || null,
          confidence: item.confidence,
          source: item.source || 'extracted',
          created_at: now,
          updated_at: now,
          last_accessed_at: now,
          access_count: 0
        };
        await this.ltm.upsert(fullEntry);
      }
    }

    // Basic behavioral logging for this phase
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('спасибо') || lowerQuery.includes('отлично') || lowerQuery.includes('хорошо')) {
      this.bm.logEvent({
        id: crypto.randomUUID(),
        type: 'user_accepted_suggestion',
        context: { query, response },
        timestamp: Date.now()
      });
    } else if (lowerQuery.includes('не') && (lowerQuery.includes('надо') || lowerQuery.includes('хочу'))) {
      this.bm.logEvent({
        id: crypto.randomUUID(),
        type: 'user_rejected_suggestion',
        context: { query, response },
        timestamp: Date.now()
      });
    }
  }

  async enrichContext(query: string): Promise<{
    relevantFacts: LongTermMemoryEntry[];
    userPreferences: LongTermMemoryEntry[];
    recentBehavior: BehaviorEvent[];
  }> {
    const trimmed = (query || '').trim();
    const isShortConversational = /^(?:привет(?:ствую)?|здравствуй(?:те)?|как дела|добр(?:ое|ый|ый день|ое утро|ый вечер)|хай|салют|спасибо|благодарю|ясно|понятно|ок|хорошо|ладно)[\s.!?,]*$/i.test(trimmed);

    // Fast-path: for simple greetings or pleasantries, skip 3s ONNX embedding generation
    const facts = isShortConversational
      ? []
      : await this.ltm.search(query, { category: 'fact' });
    const prefs = this.ltm.getByCategory('preference');
    const recentBehavior = this.bm.getRecentEvents(50);
    
    return { relevantFacts: facts, userPreferences: prefs, recentBehavior };
  }

  async getContextMessages(): Promise<{ role: string, content: string }[]> {
    const messages = await this.stm.getRecentMessages(this.stm['MAX_MESSAGES']);
    const mapped: ShortTermMessage[] = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.role === 'assistant' ? cleanMessageContent(m.content) : m.content,
      timestamp: m.timestamp,
      metadata: m.metadata
    }));
    if (mapped.length <= 10) {
      return mapped;
    } else {
      // Compress older messages
      const olderMessages = mapped.slice(0, mapped.length - 10);
      const recentMessages = mapped.slice(mapped.length - 10);
      
      const compressed = await this.compressor.compress(olderMessages);
      
      return [
        { role: 'system', content: compressed },
        ...recentMessages
      ];
    }
  }

  async storeKnowledgeFromTool(toolName: string, query: string, data: any) {
    if (toolName === 'web_search' || toolName === 'wikipedia') {
      const finalValue = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : 'No results found';
      await this.ltm.upsert({
        id: `knowledge_${Date.now()}`,
        category: 'knowledge',
        key: query,
        value: finalValue,
        confidence: 0.5,
        source: toolName,
        created_at: Date.now(),
        updated_at: Date.now(),
        last_accessed_at: Date.now(),
        access_count: 1
      });
    }
  }
}

// Global instance to be initialized after DB
export let memoryManager: MemoryManager;

export function initMemory() {
    memoryManager = new MemoryManager();
}
