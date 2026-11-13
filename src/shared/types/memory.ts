// ===== Краткосрочная память =====
export interface ShortTermMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ===== Долговременная память =====
export type MemoryCategory = 'fact' | 'preference' | 'knowledge' | 'event';

export interface LongTermMemoryEntry {
  id: string;
  category: MemoryCategory;
  key: string;              // Уникальный ключ (например, "user:preferred_browser")
  value: any;               // Произвольные данные
  embedding?: number[] | null;     // Вектор для семантического поиска (768 или 384 размерность)
  similarity?: number;      // Процент семантического совпадения при поиске (0..100)
  confidence: number;       // 0..1, насколько мы уверены в этом факте
  source: string;           // Откуда взято: 'user_stated', 'inferred', 'extracted'
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  access_count: number;
}

// ===== Поведенческая память =====
export type BehaviorEventType = 
  | 'user_accepted_suggestion'   // пользователь принял предложение
  | 'user_ignored_suggestion'    // проигнорировал
  | 'user_rejected_suggestion'   // явно отверг
  | 'user_corrected_answer'      // исправил ответ
  | 'user_repeated_question'     // переспросил (значит, первый ответ был плох)
  | 'user_rated_answer';         // поставил оценку (👍/👎)

export interface BehaviorEvent {
  id: string;
  type: BehaviorEventType;
  context: {
    query?: string;           // Оригинальный запрос
    response?: string;        // Ответ системы
    suggestionType?: string;  // Тип предложения (если это проактивное)
  };
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface MemoryQueryResult {
  entries: LongTermMemoryEntry[];
  semanticMatches?: LongTermMemoryEntry[];  // Результаты векторного поиска
  relevanceScores?: number[];
}
