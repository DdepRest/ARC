import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionsStore } from './sessions.store';

describe('sessions.store', () => {
  let mockSessions: any[] = [];
  let mockMessages: Record<number, any[]> = {};

  beforeEach(() => {
    setActivePinia(createPinia());
    const now = Date.now();
    mockSessions = [
      { id: 101, name: 'Сессия 1', is_archived: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now + 1000).toISOString() },
      { id: 102, name: 'Сессия 2', is_archived: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }
    ];
    mockMessages = {
      101: [{ id: 1, role: 'user', content: 'Сообщение 1' }],
      102: [{ id: 2, role: 'user', content: 'Сообщение 2' }]
    };

    (global as any).window = {
      api: {
        dialogListSessions: vi.fn(async () => [...mockSessions]),
        dialogCreateSession: vi.fn(async (name: string) => {
          const s = { id: Date.now(), name: name || 'Новый диалог', is_archived: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          mockSessions.unshift(s);
          return s;
        }),
        dialogDeleteSession: vi.fn(async (id: number) => {
          mockSessions = mockSessions.filter(s => s.id !== id);
          delete mockMessages[id];
          return { success: true };
        }),
        dialogGetMessages: vi.fn(async (id: number) => mockMessages[id] || [])
      }
    };
  });

  it('should load existing sessions without duplicating or creating extra sessions', async () => {
    const store = useSessionsStore();
    await store.loadSessions();

    expect(store.sessions).toHaveLength(2);
    expect(store.activeSessionId).toBe(101);
  });

  it('should switch to first available session when active session is deleted and other sessions remain', async () => {
    const store = useSessionsStore();
    await store.loadSessions();
    expect(store.activeSessionId).toBe(101);

    await store.deleteSession(101);

    expect(store.sessions).toHaveLength(1);
    expect(store.activeSessionId).toBe(102);
  });

  it('should explicitly create a new session if all sessions are deleted', async () => {
    const store = useSessionsStore();
    await store.loadSessions();

    await store.deleteSession(101);
    await store.deleteSession(102);

    expect((window.api as any).dialogCreateSession).toHaveBeenCalledWith('Новый диалог');
    expect(store.sessions).toHaveLength(1);
    expect(store.activeSessionId).not.toBeNull();
  });
});
