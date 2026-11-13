import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Session {
    id: number;
    name: string;
    summary: string | null;
    created_at: string;
    updated_at: string;
    message_count: number;
    is_pinned: number;
    is_archived: number;
    tags: string | null;
}

const STORAGE_KEY = 'arc_chat_sessions';
const MESSAGES_KEY_PREFIX = 'arc_chat_messages_';

function getStoredSessions(): Session[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (_) { }
    return [];
}

function saveStoredSessions(list: Session[]) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_) { }
}

export const useSessionsStore = defineStore('sessions', () => {
    const sessions = ref<Session[]>([]);
    const activeSessionId = ref<number | null>(null);
    const isLoading = ref(false);
    const searchQuery = ref('');
    const dateFilter = ref('all'); // all, today, yesterday, week, archived

    function sortSessionList(list: Session[]): Session[] {
        return [...list].sort((a, b) => {
            if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
                return (b.is_pinned || 0) - (a.is_pinned || 0);
            }
            const timeA = new Date(a.updated_at || a.created_at).getTime() || 0;
            const timeB = new Date(b.updated_at || b.created_at).getTime() || 0;
            return timeB - timeA;
        });
    }

    function filterSessionsByDate(list: Session[], filter: string): Session[] {
        const now = new Date();
        const todayStr = now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

        return list.filter(s => {
            if (filter === 'archived') {
                return s.is_archived === 1;
            }
            // For all non-archived views, hide archived
            if (s.is_archived === 1) return false;

            if (filter === 'all') return true;

            const sDate = new Date(s.updated_at || s.created_at);
            if (isNaN(sDate.getTime())) return true;

            if (filter === 'today') {
                return sDate.toDateString() === todayStr;
            }
            if (filter === 'yesterday') {
                return sDate.toDateString() === yesterdayStr;
            }
            if (filter === 'week') {
                return sDate.getTime() >= sevenDaysAgo;
            }
            if (filter === 'month') {
                return sDate.getTime() >= thirtyDaysAgo;
            }
            return true;
        });
    }

    async function loadSessions() {
        isLoading.value = true;
        try {
            // 1. Try Electron IPC
            if ((window as any).api?.dialogListSessions) {
                const list = await (window as any).api.dialogListSessions(100, 0, {
                    archived: dateFilter.value === 'archived',
                    date: dateFilter.value
                });
                if (Array.isArray(list)) {
                    sessions.value = sortSessionList(list);
                    if (sessions.value.length > 0) {
                        if (!activeSessionId.value || !sessions.value.some(s => s.id === activeSessionId.value)) {
                            switchSession(sessions.value[0].id);
                        }
                    } else {
                        activeSessionId.value = null;
                    }
                    return;
                }
            }

            // 2. Web LocalStorage fallback
            const allStored = getStoredSessions();
            const filtered = filterSessionsByDate(allStored, dateFilter.value);
            sessions.value = sortSessionList(filtered);

            if (sessions.value.length > 0) {
                if (!activeSessionId.value || !sessions.value.some(s => s.id === activeSessionId.value)) {
                    switchSession(sessions.value[0].id);
                }
            } else {
                activeSessionId.value = null;
            }
        } catch (e) {
            console.error('Failed to load sessions', e);
        } finally {
            isLoading.value = false;
        }
    }

    async function createSession(name?: string): Promise<Session> {
        isLoading.value = true;
        const sessionName = name || 'Новый диалог';
        try {
            let session: Session | null = null;
            if ((window as any).api?.dialogCreateSession) {
                session = await (window as any).api.dialogCreateSession(sessionName);
            }
            
            if (!session || !session.id) {
                session = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: sessionName,
                    summary: 'Диалог без сообщений',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    message_count: 0,
                    is_pinned: 0,
                    is_archived: 0,
                    tags: null
                };
                const allStored = getStoredSessions();
                allStored.unshift(session);
                saveStoredSessions(allStored);
            }

            // Force filter to 'all' so we can see the newly created session
            if (dateFilter.value === 'archived') {
                dateFilter.value = 'all';
            }
            
            activeSessionId.value = session.id;
            
            await loadSessions();

            return session;
        } catch (e) {
            console.error('Error in createSession:', e);
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    function switchSession(id: number) {
        activeSessionId.value = id;
    }

    function sortSessions() {
        sessions.value = sortSessionList(sessions.value);
    }

    async function deleteSession(id: number) {
        isLoading.value = true;
        try {
            if ((window as any).api?.dialogDeleteSession) {
                await (window as any).api.dialogDeleteSession(id);
            }
        } catch (e) {
            console.error('Failed to delete session via IPC', e);
        }

        // Web LocalStorage cleanup
        const allStored = getStoredSessions().filter(s => s.id !== id);
        saveStoredSessions(allStored);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(MESSAGES_KEY_PREFIX + id);
            }
        } catch (_) { }

        // Reload sessions list
        await loadSessions();

        // Predictable fallback
        if (activeSessionId.value === id || !activeSessionId.value || !sessions.value.some(s => s.id === activeSessionId.value)) {
            if (sessions.value.length > 0) {
                await switchSession(sessions.value[0].id);
            } else {
                await createSession('Новый диалог');
            }
        }
        isLoading.value = false;
    }

    async function updateSession(id: number, data: Partial<Session>) {
        const nowIso = new Date().toISOString();
        const mergedData = { ...data, updated_at: nowIso };

        try {
            if ((window as any).api?.dialogUpdateSession) {
                await (window as any).api.dialogUpdateSession(id, mergedData);
            }
        } catch (e) {
            console.error('Failed to update session via IPC', e);
        }

        // Update in localStorage
        const allStored = getStoredSessions();
        const storedIndex = allStored.findIndex(s => s.id === id);
        if (storedIndex !== -1) {
            Object.assign(allStored[storedIndex], mergedData);
            saveStoredSessions(allStored);
        }

        await loadSessions();
    }

    async function searchSessions(query: string) {
        if (!query.trim()) {
            await loadSessions();
            return;
        }
        isLoading.value = true;
        try {
            if ((window as any).api?.dialogSearch) {
                const results = await (window as any).api.dialogSearch(query, 20);
                const sessionIds = new Set();
                const matchedSessions: Session[] = [];
                for (const r of results) {
                    if (!sessionIds.has(r.session_id)) {
                        sessionIds.add(r.session_id);
                        matchedSessions.push({
                            id: r.session_id,
                            name: r.session_name,
                            summary: r.snippet,
                            created_at: r.created_at || new Date().toISOString(),
                            updated_at: r.updated_at || new Date().toISOString(),
                            message_count: 0,
                            is_pinned: r.is_pinned || 0,
                            is_archived: r.is_archived || 0,
                            tags: null
                        });
                    }
                }
                sessions.value = sortSessionList(filterSessionsByDate(matchedSessions, dateFilter.value));
                return;
            }

            // Web fallback search
            const allStored = getStoredSessions();
            const lower = query.toLowerCase();
            const matched = allStored.filter(s => 
                (s.name && s.name.toLowerCase().includes(lower)) || 
                (s.summary && s.summary.toLowerCase().includes(lower))
            );
            sessions.value = sortSessionList(filterSessionsByDate(matched, dateFilter.value));
        } catch (e) {
            console.error('Failed to search', e);
        } finally {
            isLoading.value = false;
        }
    }

    
    async function exportSession(id: number): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            if ((window as any).api?.dialogExportSession) {
                return await (window as any).api.dialogExportSession(id);
            }
            // Web fallback export
            const session = sessions.value.find(s => s.id === id);
            const rawMsgs = typeof localStorage !== 'undefined' ? localStorage.getItem(MESSAGES_KEY_PREFIX + id) : null;
            const msgs = rawMsgs ? JSON.parse(rawMsgs) : [];
            let mdContent = `# ${session?.name || 'Диалог A.R.C.'}\nДата: ${new Date().toLocaleString()}\n\n---\n\n`;
            for (const m of msgs) {
                const author = m.role === 'user' ? '👤 Пользователь' : '🤖 A.R.C.';
                let timeStr = '';
                if (m.created_at) {
                    try {
                        const d = new Date(m.created_at);
                        if (!isNaN(d.getTime()) && typeof d.toLocaleTimeString === 'function') {
                            timeStr = d.toLocaleTimeString();
                        }
                    } catch (_) {}
                }
                mdContent += `### ${author} (${timeStr})\n\n${m.content || ''}\n\n---\n\n`;
            }
            const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(session?.name || 'dialog').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_')}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return { success: true, filePath: a.download };
        } catch (e: any) {
            console.error('Failed to export session', e);
            return { success: false, error: e.message };
        }
    }

    async function duplicateSession(id: number): Promise<Session | null> {
        try {
            const source = sessions.value.find(s => s.id === id);
            if (!source) return null;
            const newName = `${source.name || 'Диалог'} (Копия)`;
            const newSession = await createSession(newName);
            
            // Duplicate messages if in web mode
            const rawMsgs = typeof localStorage !== 'undefined' ? localStorage.getItem(MESSAGES_KEY_PREFIX + id) : null;
            if (rawMsgs && typeof localStorage !== 'undefined') {
                localStorage.setItem(MESSAGES_KEY_PREFIX + newSession.id, rawMsgs);
            }
            await switchSession(newSession.id);
            return newSession;
        } catch (e) {
            console.error('Failed to duplicate session', e);
            return null;
        }
    }

    return {
        sessions,
        activeSessionId,
        isLoading,
        searchQuery,
        dateFilter,
        loadSessions,
        createSession,
        switchSession,
        deleteSession,
        updateSession,
        searchSessions,
        sortSessions,
        exportSession,
        duplicateSession
    };
});
