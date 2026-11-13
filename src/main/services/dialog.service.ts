import { providerManager } from './llm/providers/provider-manager';
import { executeRequestFallbackChain } from './llm/request-executor';
import { DatabaseService } from './database';
import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';

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

export interface Message {
    id: number;
    session_id: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata: string | null;
    created_at: string;
}

export class DialogService {
    static createSession(name?: string): Session {
        const defaultName = name || 'Новая сессия';
        const stmt = DatabaseService.db.prepare('INSERT INTO sessions (name) VALUES (?)');
        const result = stmt.run(defaultName);
        return this.getSession(result.lastInsertRowid as number) as Session;
    }

    static getSession(id: number): Session | undefined {
        return DatabaseService.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
    }

    static listSessions(limit: number = 50, offset: number = 0, filter?: { date?: string, archived?: boolean }): Session[] {
        let query = 'SELECT * FROM sessions WHERE 1=1';
        const params: any[] = [];

        if (filter?.archived !== undefined && filter.archived) {
            query += ' AND is_archived = 1';
        } else if (filter?.date === 'archived') {
            query += ' AND is_archived = 1';
        } else {
            query += ' AND is_archived = 0'; // default hide archived
            
            if (filter?.date === 'today') {
                query += " AND date(updated_at, 'localtime') = date('now', 'localtime')";
            } else if (filter?.date === 'yesterday') {
                query += " AND date(updated_at, 'localtime') = date('now', '-1 day', 'localtime')";
            } else if (filter?.date === 'week') {
                query += " AND datetime(updated_at, 'localtime') >= datetime('now', '-7 days', 'localtime')";
            } else if (filter?.date === 'month') {
                query += " AND datetime(updated_at, 'localtime') >= datetime('now', '-30 days', 'localtime')";
            }
        }

        query += ' ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        try {
            return DatabaseService.db.prepare(query).all(...params) as Session[];
        } catch (err) {
            // Fallback for query without SQLite date functions if not supported
            return DatabaseService.db.prepare('SELECT * FROM sessions WHERE is_archived = ? ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?').all(filter?.archived || filter?.date === 'archived' ? 1 : 0, limit, offset) as Session[];
        }
    }

    static addMessage(sessionId: number, role: string, content: string, metadata?: any): Message {
        let currentSession = sessionId ? this.getSession(sessionId) : undefined;
        if (!currentSession) {
            const fallbackName = (role === 'user' && content ? content.trim().replace(/\n+/g, ' ').slice(0, 50) : '') || 'Новая сессия';
            if (sessionId && Number.isInteger(Number(sessionId)) && Number(sessionId) > 0) {
                try {
                    DatabaseService.db.prepare('INSERT OR IGNORE INTO sessions (id, name) VALUES (?, ?)').run(Number(sessionId), fallbackName);
                    currentSession = this.getSession(Number(sessionId));
                } catch {}
            }
            if (!currentSession) {
                currentSession = this.createSession(fallbackName);
                sessionId = currentSession.id;
            }
        }

        const stmt = DatabaseService.db.prepare('INSERT INTO messages (session_id, role, content, metadata) VALUES (?, ?, ?, ?)');
        const metaStr = metadata ? JSON.stringify(metadata) : null;
        const result = stmt.run(sessionId, role, content, metaStr);
        
        // Auto-naming and summary snippet check
        currentSession = this.getSession(sessionId);
        if (role === 'user' && currentSession) {
            const isDefaultName = !currentSession.name || currentSession.name === 'Новая сессия' || currentSession.name === 'Новый диалог';
            if (isDefaultName) {
                const autoName = content.trim().replace(/\n+/g, ' ').slice(0, 50);
                if (autoName) {
                    DatabaseService.db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(autoName, sessionId);
                }
            }
        }

        const snippet = content.trim().replace(/\n+/g, ' ').slice(0, 100);
        if (snippet && currentSession && (!currentSession.summary || currentSession.summary === 'Диалог без сообщений')) {
            DatabaseService.db.prepare('UPDATE sessions SET summary = ?, message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(snippet, sessionId);
        } else {
            DatabaseService.db.prepare('UPDATE sessions SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
        }
        
        return DatabaseService.db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid) as Message;
    }

    static getMessages(sessionId: number): Message[] {
        return DatabaseService.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC').all(sessionId) as Message[];
    }

    static updateSession(id: number, data: Partial<Session>): void {
        const updates: string[] = [];
        const params: any[] = [];
        
        if (data.name !== undefined) {
            updates.push('name = ?');
            params.push(data.name);
        }
        if (data.summary !== undefined) {
            updates.push('summary = ?');
            params.push(data.summary);
        }
        if (data.is_pinned !== undefined) {
            updates.push('is_pinned = ?');
            params.push(data.is_pinned);
        }
        if (data.is_archived !== undefined) {
            updates.push('is_archived = ?');
            params.push(data.is_archived);
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        
        if (updates.length > 0) {
            params.push(id);
            const query = `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`;
            DatabaseService.db.prepare(query).run(...params);
        }
    }

    static deleteSession(id: number): void {
        try {
            DatabaseService.db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
        } catch (_) { console.warn('Ignored error in catch', _); }
        DatabaseService.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    }

    static deleteMessage(id: number): void {
        const msg = DatabaseService.db.prepare('SELECT session_id FROM messages WHERE id = ?').get(id) as {session_id: number};
        DatabaseService.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
        if (msg) {
            DatabaseService.db.prepare('UPDATE sessions SET message_count = message_count - 1 WHERE id = ?').run(msg.session_id);
        }
    }

    static searchMessages(query: string, limit: number = 20): any[] {
        // FTS5 MATCH query
        const sql = `
            SELECT 
                m.id as message_id, 
                m.session_id, 
                m.role, 
                snippet(messages_fts, 0, '<b>', '</b>', '...', 64) as snippet,
                s.name as session_name,
                s.is_archived,
                s.is_pinned,
                s.updated_at,
                s.created_at
            FROM messages_fts f
            JOIN messages m ON f.rowid = m.id
            JOIN sessions s ON m.session_id = s.id
            WHERE messages_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        `;
        
        try {
            return DatabaseService.db.prepare(sql).all(`"${query}"*`, limit);
        } catch (e) {
            return [];
        }
    }

    static async generateSummary(sessionId: number): Promise<string | null> {
        try {
            const session = this.getSession(sessionId);
            if (!session) return null;
            const messages = this.getMessages(sessionId);
            if (!messages || messages.length === 0) return null;
            
            const dialogLines = messages.slice(-10).map(m => {
                const roleLabel = m.role === 'user' ? 'Пользователь' : 'A.R.C.';
                return `${roleLabel}: ${m.content.replace(/\n+/g, ' ')}`;
            }).join('\n');
            const promptText = `Сократи следующий диалог в одно предложение (до 100 символов):\n${dialogLines}`;
            
            let summaryText = '';
            
            const activeProviders = providerManager.getProviders().filter(p => p.enabled).sort((a, b) => a.priority - b.priority);
            
            if (activeProviders.length > 0) {
               const abortController = new AbortController();
               // 10s timeout
               setTimeout(() => abortController.abort(), 10000);
               
               for (const provider of activeProviders) {
                  let fullResponse = '';
                  try {
                    await executeRequestFallbackChain(provider, promptText, [], abortController, (chunk, done) => {
                       fullResponse += chunk;
                    });
                    if (fullResponse.trim()) {
                       summaryText = fullResponse;
                       break;
                    }
                  } catch (e) {
                     // try next
                  }
               }
            }
            
            if (!summaryText) {
                const firstUser = messages.find(m => m.role === 'user');
                if (firstUser) {
                    summaryText = firstUser.content.trim().replace(/\n+/g, ' ');
                }
            }
            
            if (summaryText) {
                summaryText = summaryText
                    .replace(/^["'«]|["'»]$/g, '')
                    .replace(/^(Резюме:|Тема:)\s*/i, '')
                    .replace(/\n+/g, ' ')
                    .replace(/<\|.*?\|>/g, '')
                    .trim();
                if (summaryText.length > 100) {
                    summaryText = summaryText.slice(0, 97) + '...';
                }
                this.updateSession(sessionId, { summary: summaryText });
                return summaryText;
            }
            return null;
        } catch (e) {
            console.error('[DialogService] generateSummary failed:', e);
            return null;
        }
    }

    static async exportSessionToMarkdown(sessionId: number): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            const session = this.getSession(sessionId);
            if (!session) return { success: false, error: 'Session not found' };

            const messages = this.getMessages(sessionId);
            
            let markdown = `# ${session.name}

`;
            markdown += `**Создано:** ${new Date(session.created_at).toLocaleString('ru-RU')}
`;
            markdown += `**Последнее сообщение:** ${new Date(session.updated_at).toLocaleString('ru-RU')}
`;
            markdown += `**Сообщений:** ${session.message_count}

`;

            if (session.summary && session.summary !== 'Диалог без сообщений') {
                markdown += `## Резюме
${session.summary}

`;
            }

            markdown += `## История диалога

`;

            if (messages && messages.length > 0) {
                for (const msg of messages) {
                    const roleLabel = msg.role === 'user' ? 'Пользователь' : 'A.R.C.';
                    const msgDate = new Date(msg.created_at).toLocaleString('ru-RU');
                    markdown += `### ${roleLabel} (${msgDate})
${msg.content}

`;
                }
            } else {
                markdown += `*Диалог пуст*
`;
            }

            const safeName = session.name.replace(/[^a-zа-я0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'session';
            const defaultFileName = `${safeName}.md`;
            
            const { filePath } = await dialog.showSaveDialog({
                title: 'Экспорт диалога',
                defaultPath: path.join(app.getPath('documents'), defaultFileName),
                filters: [{ name: 'Markdown', extensions: ['md'] }]
            });

            if (!filePath) {
                return { success: false, error: 'Cancelled' };
            }

            fs.writeFileSync(filePath, markdown, 'utf8');
            return { success: true, filePath };
        } catch (e: any) {
            console.error('[DialogService] export failed:', e);
            return { success: false, error: e.message };
        }
    }
}

export const dialogService = DialogService;
export default DialogService;
