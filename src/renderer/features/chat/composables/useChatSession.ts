import { watch } from 'vue';
import { useSessionsStore } from '../stores/sessions.store';
import { useChatStore } from '../stores/chat.store';

const MESSAGES_KEY_PREFIX = 'arc_chat_messages_';

export function useChatSession() {
  const sessionsStore = useSessionsStore();
  const chatStore = useChatStore();

  async function loadMessagesForSession(sessionId: number | null): Promise<void> {
    chatStore.setActiveSessionId(sessionId);
    if (!sessionId) {
      chatStore.clearMessages();
      return;
    }

    try {
      if ((window as any).api?.dialogGetMessages) {
        const msgs = await (window as any).api.dialogGetMessages(sessionId);
        chatStore.setMessages(Array.isArray(msgs) ? msgs : []);
        return;
      }

      // Web LocalStorage fallback
      const raw = localStorage.getItem(MESSAGES_KEY_PREFIX + sessionId);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          chatStore.setMessages(Array.isArray(parsed) ? parsed : []);
          return;
        } catch (e) {
          console.warn('[useChatSession] Failed to parse stored messages:', e);
        }
      }
      chatStore.clearMessages();
    } catch (e) {
      console.error('[useChatSession] Failed to load messages for session:', sessionId, e);
      chatStore.clearMessages();
    }
  }

  // Subscribe to activeSessionId changes in sessions.store
  watch(
    () => sessionsStore.activeSessionId,
    (newId) => {
      loadMessagesForSession(newId);
    },
    { immediate: true }
  );

  async function switchSession(id: number): Promise<void> {
    sessionsStore.switchSession(id);
    await loadMessagesForSession(id);
  }

  async function createSession(name?: string) {
    const session = await sessionsStore.createSession(name);
    chatStore.clearMessages();
    chatStore.setActiveSessionId(session.id);
    return session;
  }

  async function deleteSession(id: number): Promise<void> {
    await sessionsStore.deleteSession(id);
    // Active session fallback is handled by sessionsStore updating activeSessionId,
    // which triggers the watch callback to load messages.
  }

  return {
    sessionsStore,
    chatStore,
    activeSessionId: () => sessionsStore.activeSessionId,
    loadMessagesForSession,
    switchSession,
    createSession,
    deleteSession
  };
}
