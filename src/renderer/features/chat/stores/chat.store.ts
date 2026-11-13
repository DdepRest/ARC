import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import type { Message, AgentStateStatus, ExecutionStep } from '../../../../shared/types/models/chat';
import { sanitizeRawContent } from '../utils/markdown';

function cleanMessageContent(content: any): string {
  return content ? sanitizeRawContent(content) : '';
}

function sanitizeForIpc<T>(val: T): T {
  if (val === undefined || val === null || typeof val !== 'object') return val;
  const raw = toRaw(val);
  try { return JSON.parse(JSON.stringify(raw)); } catch { return raw; }
}

function sanitizeMetaObject(meta: any): Message['meta'] | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = toRaw(meta);
  const clean: Record<string, any> = {
    source: raw.source === 'cache' || raw.source === 'local' || raw.source === 'live' || raw.source === 'system' ? raw.source : 'system'
  };
  if (typeof raw.provider === 'string') clean.provider = raw.provider;
  if (typeof raw.latency === 'number') clean.latency = raw.latency;
  if (typeof raw.isCache === 'boolean') clean.isCache = raw.isCache;
  if (typeof raw.reqId === 'string') clean.reqId = raw.reqId;
  if (raw.ttsEngine === 'silero' || raw.ttsEngine === 'edge' || raw.ttsEngine === 'sapi') {
    clean.ttsEngine = raw.ttsEngine;
    clean.ttsCached = Boolean(raw.ttsCached);
  }
  return clean as Message['meta'];
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([]);
  const activeSessionId = ref<number | null>(null);
  const isStreaming = ref(false);
  const currentResponse = ref('');
  const isSearching = ref(false);
  const agentStatus = ref<AgentStateStatus>('idle');
  const agentActionText = ref<string>('');
  const activeExecutionSteps = ref<ExecutionStep[]>([]);

  function setActiveSessionId(id: number | null) { activeSessionId.value = id; }
  function setAgentStatus(status: AgentStateStatus, actionText: string = '') { agentStatus.value = status; agentActionText.value = actionText; }
  function setExecutionSteps(steps: ExecutionStep[]) { activeExecutionSteps.value = [...steps]; }
  function addExecutionStep(step: ExecutionStep) { activeExecutionSteps.value.push({ ...step }); }
  function updateExecutionStep(id: string, updates: Partial<ExecutionStep>) {
    const idx = activeExecutionSteps.value.findIndex(s => s.id === id);
    if (idx !== -1) activeExecutionSteps.value[idx] = { ...activeExecutionSteps.value[idx], ...updates };
  }

  const TTS_META_CACHE_KEY = 'arc_tts_meta_cache';

  function loadTtsMetaCache(): Record<string, { ttsEngine: 'silero' | 'edge' | 'sapi'; ttsCached: boolean }> {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(TTS_META_CACHE_KEY);
        if (raw) return JSON.parse(raw) || {};
      }
    } catch {}
    return {};
  }

  function saveTtsMetaToCache(id: string | undefined, content: string | undefined, ttsEngine: 'silero' | 'edge' | 'sapi', ttsCached: boolean) {
    try {
      if (typeof localStorage === 'undefined') return;
      const cache = loadTtsMetaCache();
      if (id) cache[`id:${id}`] = { ttsEngine, ttsCached };
      const normText = (content || '').trim().toLowerCase().slice(0, 120);
      if (normText) cache[`txt:${normText}`] = { ttsEngine, ttsCached };
      const keys = Object.keys(cache);
      if (keys.length > 300) {
        for (const k of keys.slice(0, keys.length - 300)) delete cache[k];
      }
      localStorage.setItem(TTS_META_CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  function setMessages(msgs: any[]) {
    const ttsCache = loadTtsMetaCache();
    messages.value = msgs.map((m: any) => {
      let attachments = m.attachments;
      if (!attachments && m.metadata) {
        try {
          const parsed = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
          if (parsed && Array.isArray(parsed.attachments)) {
            attachments = parsed.attachments;
          }
        } catch (e) {
          console.warn('[A.R.C] Handled silent error:', e);
        }
      }
      let executionSteps = m.executionSteps;
      if (Array.isArray(executionSteps)) {
         executionSteps = executionSteps.map(s => ({
            ...s,
            status: s.status === 'running' ? 'error' : s.status
         }));
      }
      let isRetried = m.isRetried;
      let providerName = m.providerName;
      let providerTarget = m.providerTarget;
      let latency = m.latency;
      let meta = m.meta;
      
      if (m.metadata) {
        try {
          const parsed = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
          if (parsed) {
             if (parsed.executionSteps) executionSteps = parsed.executionSteps;
             if (parsed.isRetried !== undefined) isRetried = parsed.isRetried;
             if (parsed.providerName) providerName = parsed.providerName;
             if (parsed.providerTarget) providerTarget = parsed.providerTarget;
             if (parsed.latency) latency = parsed.latency;
             if (parsed.meta) meta = parsed.meta;
          }
        } catch(e) {}
      }

      const msgId = (m.id ?? Date.now()).toString();
      const role = m.role || 'user';
      const contentStr = (typeof m.content === 'object' && m.content !== null ? (m.content.text || m.content.content || JSON.stringify(m.content)) : m.content) || '';

      if ((role === 'assistant' || role === 'system') && !meta?.ttsEngine) {
        const normText = contentStr.trim().toLowerCase().slice(0, 120);
        const cachedTts = ttsCache[`id:${msgId}`] || (normText ? ttsCache[`txt:${normText}`] : undefined);
        if (cachedTts) {
          meta = { ...(meta || { source: 'system' }), ttsEngine: cachedTts.ttsEngine, ttsCached: cachedTts.ttsCached };
        }
      }
      
      return {
        id: msgId,
        role,
        content: contentStr,
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : (m.created_at ? new Date(m.created_at).getTime() : Date.now()),
        attachments: attachments || undefined,
        executionSteps,
        isRetried,
        providerName,
        providerTarget,
        latency,
        meta
      };
    });
  }

  function clearMessages() {
    messages.value = [];
  }

  async function addMessage(msg: Message) {
    const plainInput = sanitizeForIpc(msg);
    const sanitizedContent = cleanMessageContent(plainInput.content);
    if (!sanitizedContent && (!plainInput.attachments || plainInput.attachments.length === 0)) return;

    // Prevent duplicate consecutive messages with identical role & content added within 2000ms
    const lastMsg = messages.value[messages.value.length - 1];
    if (
      lastMsg &&
      lastMsg.role === plainInput.role &&
      lastMsg.content.trim().toLowerCase() === (sanitizedContent || '').trim().toLowerCase() &&
      Math.abs((plainInput.timestamp || Date.now()) - lastMsg.timestamp) < 2000
    ) {
      console.info('[ChatStore] Suppressed duplicate message:', sanitizedContent);
      return;
    }

    const cleanMeta = sanitizeMetaObject(plainInput.meta);
    const sanitizedMsg: Message = {
      ...plainInput,
      id: String(plainInput.id ?? Date.now()),
      role: plainInput.role || 'user',
      timestamp: typeof plainInput.timestamp === 'number' ? plainInput.timestamp : Date.now(),
      content: sanitizedContent || '',
      attachments: Array.isArray(plainInput.attachments) ? sanitizeForIpc(plainInput.attachments) : undefined,
      executionSteps: Array.isArray(plainInput.executionSteps) ? sanitizeForIpc(plainInput.executionSteps) : undefined,
      meta: cleanMeta
    };

    if (sanitizedMsg.meta?.ttsEngine) {
      saveTtsMetaToCache(sanitizedMsg.id, sanitizedMsg.content, sanitizedMsg.meta.ttsEngine, Boolean(sanitizedMsg.meta.ttsCached));
    }

    // Push immediately so UI renders the message even if DB/IPC persistence fails
    messages.value.push(sanitizedMsg);
    const addedIndex = messages.value.length - 1;

    try {
      let activeId = activeSessionId.value;
      if (!activeId && (window as any).api?.dialogCreateSession) {
        const sessionTitle = sanitizedContent
          ? sanitizedContent.substring(0, 50)
          : (sanitizedMsg.attachments?.[0]?.name ? `Файл: ${sanitizedMsg.attachments[0].name}` : 'Новая сессия');
        const session = await (window as any).api.dialogCreateSession(String(sessionTitle));
        if (session?.id) {
          activeId = Number(session.id);
          activeSessionId.value = activeId;
        }
      }

      if (activeId && (window as any).api?.dialogAddMessage) {
        const currentTarget = sanitizeForIpc(messages.value[addedIndex] || sanitizedMsg);
        const metadataPayload: Record<string, any> = {};
        if (Array.isArray(currentTarget.attachments) && currentTarget.attachments.length > 0) {
          metadataPayload.attachments = currentTarget.attachments;
        }
        if (typeof currentTarget.providerName === 'string' && currentTarget.providerName) {
          metadataPayload.providerName = currentTarget.providerName;
        }
        if (typeof currentTarget.providerTarget === 'string' && currentTarget.providerTarget) {
          metadataPayload.providerTarget = currentTarget.providerTarget;
        }
        if (typeof currentTarget.cause === 'string' && currentTarget.cause) {
          metadataPayload.cause = currentTarget.cause;
        }
        if (typeof currentTarget.latency === 'number') {
          metadataPayload.latency = currentTarget.latency;
        }
        if (Array.isArray(currentTarget.executionSteps)) {
          metadataPayload.executionSteps = currentTarget.executionSteps;
        }
        if (currentTarget.isRetried !== undefined) {
          metadataPayload.isRetried = Boolean(currentTarget.isRetried);
        }
        const safeMeta = sanitizeMetaObject(currentTarget.meta);
        if (safeMeta) {
          metadataPayload.meta = safeMeta;
        }

        const plainMetadata = Object.keys(metadataPayload).length > 0
          ? JSON.parse(JSON.stringify(metadataPayload))
          : undefined;

        const dbMsg = await (window as any).api.dialogAddMessage(
          Number(activeId),
          String(sanitizedMsg.role || 'user'),
          String(sanitizedContent || ''),
          plainMetadata
        );
        if (dbMsg && messages.value[addedIndex]) {
          const newId = dbMsg.id?.toString() || messages.value[addedIndex].id;
          const newTs = dbMsg.created_at ? new Date(dbMsg.created_at).getTime() : messages.value[addedIndex].timestamp;
          const rawExisting = sanitizeForIpc(messages.value[addedIndex]);
          messages.value[addedIndex] = {
            ...rawExisting,
            id: newId,
            timestamp: newTs
          };
          const updatedMeta = messages.value[addedIndex].meta;
          if (updatedMeta?.ttsEngine) {
            saveTtsMetaToCache(newId, sanitizedContent, updatedMeta.ttsEngine, Boolean(updatedMeta.ttsCached));
          }
        }

        const assistantMsgCount = messages.value.filter(m => m.role === 'assistant').length;
        const totalMsgCount = messages.value.length;
        // Generate summary quietly after initial turns only if dialog is not in active speech
        const shouldSummarize = (totalMsgCount >= 4 && totalMsgCount % 6 === 0);

        if (shouldSummarize && (window as any).api?.dialogGenerateSummary) {
          (window as any).api.dialogGenerateSummary(Number(activeId))
            .catch((err: any) => console.warn('[chat.store] Background summary generation error:', err));
        }
      } else if (activeId) {
        localStorage.setItem(`arc_chat_messages_${activeId}`, JSON.stringify(sanitizeForIpc(messages.value)));
      }
    } catch (ipcErr) {
      console.error('[ChatStore] Failed to persist message via IPC (message kept in UI):', ipcErr);
    }
  }

  function updateMessageTtsMeta(data: { engine: 'silero' | 'edge' | 'sapi'; isCached?: boolean; queryId?: string; textHash?: string }): boolean {
    if (!data || !data.engine) return false;
    const cleanEngine: 'silero' | 'edge' | 'sapi' =
      data.engine === 'edge' || data.engine === 'sapi' ? data.engine : 'silero';
    const cleanCached = Boolean(data.isCached);
    const cleanQueryId = typeof data.queryId === 'string' ? data.queryId : undefined;

    let targetIdx = -1;
    if (cleanQueryId) {
      targetIdx = messages.value.findIndex(
        m => (m.role === 'assistant' || m.role === 'system') && (m.id === cleanQueryId || (m.meta as any)?.reqId === cleanQueryId)
      );
      if (targetIdx === -1) return false;
    } else {
      if (isStreaming.value) return false;
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const m = messages.value[i];
        if (m.role === 'assistant' || m.role === 'system') {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx === -1) return false;

    const rawTarget = sanitizeForIpc(messages.value[targetIdx]);
    const updatedMeta = sanitizeMetaObject({
      ...(rawTarget.meta || { source: 'system' as const }),
      ttsEngine: cleanEngine,
      ttsCached: cleanCached
    });
    messages.value[targetIdx] = {
      ...rawTarget,
      meta: updatedMeta
    };
    saveTtsMetaToCache(rawTarget.id, rawTarget.content, cleanEngine, cleanCached);
    const activeId = activeSessionId.value;
    if (activeId && !(window as any).api?.dialogAddMessage) {
      try {
        localStorage.setItem(`arc_chat_messages_${activeId}`, JSON.stringify(sanitizeForIpc(messages.value)));
      } catch {}
    }
    return true;
  }

  function markAsRetried(messageId: string) {
    const msg = messages.value.find(m => m.id === messageId);
    if (msg) {
      msg.isRetried = true;
      const activeId = activeSessionId.value;
      if (activeId && !window.api?.dialogDeleteMessage) {
         try {
             localStorage.setItem(`arc_chat_messages_${activeId}`, JSON.stringify(sanitizeForIpc(messages.value)));
         } catch(_) {}
      }
    }
  }

  function clearStreaming() {
    isStreaming.value = false;
    currentResponse.value = '';
  }

  async function deleteMessage(messageId: string) {
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    
    messages.value.splice(idx, 1);
    
    const activeId = activeSessionId.value;
    if (activeId) {
      try {
        if ((window as any).api?.dialogDeleteMessage) {
          await (window as any).api.dialogDeleteMessage(Number(messageId));
        } else {
          localStorage.setItem(`arc_chat_messages_${activeId}`, JSON.stringify(sanitizeForIpc(messages.value)));
        }
      } catch (err) {
        console.error('[ChatStore] Failed to delete message via IPC:', err);
      }
    }
  }

  return {
    activeSessionId,
    setActiveSessionId,
    setMessages,
    clearMessages,
    messages,
    isStreaming,
    currentResponse,
    isSearching,
    addMessage,
    updateMessageTtsMeta,
    deleteMessage,
    markAsRetried,
    clearStreaming,
    agentStatus,
    agentActionText,
    activeExecutionSteps,
    setAgentStatus,
    setExecutionSteps,
    addExecutionStep,
    updateExecutionStep
  };
});
