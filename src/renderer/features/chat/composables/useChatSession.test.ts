import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionsStore } from '../stores/sessions.store';
import { useChatStore } from '../stores/chat.store';
import { useChatSession } from './useChatSession';

describe('useChatSession coordinator', () => {
  let mockSessions: any[] = [];

  beforeEach(() => {
    setActivePinia(createPinia());
    mockSessions = [
      { id: 101, name: 'Сессия 1', is_archived: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ];

    (global as any).window = {
      api: {
        dialogGetMessages: vi.fn(async (id: number) => [
          { id: '1', role: 'user', content: `Message for session ${id}` }
        ]),
        dialogCreateSession: vi.fn(async (name: string) => {
          const s = {
            id: 555,
            name: name || 'Новый диалог',
            is_archived: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          mockSessions.unshift(s);
          return s;
        }),
        dialogListSessions: vi.fn(async () => [...mockSessions])
      }
    };
  });

  it('loads messages into chatStore when switchSession is invoked', async () => {
    const coordinator = useChatSession();
    const chatStore = useChatStore();

    await coordinator.switchSession(101);

    expect(chatStore.activeSessionId).toBe(101);
    expect(chatStore.messages).toHaveLength(1);
    expect(chatStore.messages[0].content).toBe('Message for session 101');
  });

  it('clears messages in chatStore when session is null', async () => {
    const coordinator = useChatSession();
    const chatStore = useChatStore();

    await coordinator.switchSession(101);
    expect(chatStore.messages).toHaveLength(1);

    await coordinator.loadMessagesForSession(null);
    expect(chatStore.activeSessionId).toBeNull();
    expect(chatStore.messages).toHaveLength(0);
  });

  it('creates new session through coordinator and updates both stores', async () => {
    const coordinator = useChatSession();
    const chatStore = useChatStore();
    const sessionsStore = useSessionsStore();

    const session = await coordinator.createSession('Диалог 555');

    expect(session.id).toBe(555);
    expect(sessionsStore.activeSessionId).toBe(555);
    expect(chatStore.activeSessionId).toBe(555);
    expect(chatStore.messages).toHaveLength(0);
  });
});
