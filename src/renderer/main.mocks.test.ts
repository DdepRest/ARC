import { describe, it, expect, beforeEach } from 'vitest';

describe('Web Preview Dialog Mocks', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => { mockStorage[key] = String(value); },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; }
    };
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
        removeItem: (k: string) => { delete mockStorage[k]; },
        clear: () => { mockStorage = {}; }
      },
      writable: true
    });
    delete (global as any).window;
    (global as any).window = {
      localStorage: (global as any).localStorage
    };
  });

  it('should lazily initialize sessions and persist to localStorage', async () => {
    // Re-evaluate main.ts mock setup logic
    const MOCK_SESSIONS_STORAGE_KEY = 'arc_mock_sessions';
    const MOCK_MESSAGES_STORAGE_KEY = 'arc_mock_messages';

    function getMockSessions(): any[] {
      if ((window as any)._mockSessions) {
        return (window as any)._mockSessions;
      }
      const stored = localStorage.getItem(MOCK_SESSIONS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            (window as any)._mockSessions = parsed;
            return parsed;
          }
        } catch (e) { console.warn('Ignored error in catch', e); }
      }
      const initialSessions = [
        {
          id: 1,
          name: 'Основной контур A.R.C.',
          message_count: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_pinned: 1,
          is_archived: 0,
          summary: 'Инициализация ядра реактора',
          tags: null
        }
      ];
      (window as any)._mockSessions = initialSessions;
      saveMockSessions(initialSessions);
      return initialSessions;
    }

    function saveMockSessions(sessions: any[]) {
      (window as any)._mockSessions = sessions;
      localStorage.setItem(MOCK_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    }

    // Step 1: Initial read lazily seeds default session
    const list = getMockSessions();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Основной контур A.R.C.');
    expect(localStorage.getItem(MOCK_SESSIONS_STORAGE_KEY)).toBeTruthy();

    // Step 2: Create a new session
    const s2 = { id: 2, name: 'Второй диалог', message_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_pinned: 0, is_archived: 0, summary: null, tags: null };
    list.unshift(s2);
    saveMockSessions(list);
    expect(getMockSessions()).toHaveLength(2);

    // Step 3: Delete session 1
    let updatedList = getMockSessions().filter((s: any) => s.id !== 1);
    saveMockSessions(updatedList);
    expect(getMockSessions()).toHaveLength(1);
    expect(getMockSessions()[0].id).toBe(2);

    // Step 4: Simulate page reload (F5) - clear window._mockSessions in-memory
    delete (window as any)._mockSessions;
    const reloadedList = getMockSessions();
    expect(reloadedList).toHaveLength(1);
    expect(reloadedList[0].id).toBe(2);
    expect(reloadedList.some((s: any) => s.id === 1)).toBe(false);
  });
});
