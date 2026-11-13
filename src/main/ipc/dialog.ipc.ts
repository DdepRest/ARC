import { ipcMain } from 'electron';
import { DialogService } from '../services/dialog.service';

export function registerDialogIPC() {
    ipcMain.handle('dialog:create-session', async (event, name) => {
        return DialogService.createSession(name);
    });

    ipcMain.handle('dialog:get-session', async (event, id) => {
        return DialogService.getSession(id);
    });
    
    ipcMain.handle('dialog:get-messages', async (event, id) => {
        return DialogService.getMessages(id);
    });

    ipcMain.handle('dialog:list-sessions', async (event, limit, offset, filter) => {
        return DialogService.listSessions(limit, offset, filter);
    });

    ipcMain.handle('dialog:add-message', async (event, sessionId, role, content, metadata) => {
        return DialogService.addMessage(sessionId, role, content, metadata);
    });

    ipcMain.handle('dialog:update-session', async (event, id, data) => {
        DialogService.updateSession(id, data);
        return true;
    });

    ipcMain.handle('dialog:delete-session', async (event, id) => {
        DialogService.deleteSession(id);
        return true;
    });

    ipcMain.handle('dialog:delete-message', async (event, id) => {
        DialogService.deleteMessage(id);
        return true;
    });

    ipcMain.handle('dialog:search', async (event, query, limit) => {
        return DialogService.searchMessages(query, limit);
    });

    ipcMain.handle('dialog:generate-summary', async (event, sessionId) => {
        return DialogService.generateSummary(sessionId);
    });

    ipcMain.handle('dialog:export-session', async (event, sessionId) => {
        return DialogService.exportSessionToMarkdown(sessionId);
    });
}
