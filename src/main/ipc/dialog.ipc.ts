import { ipcMain } from 'electron';
import { DialogService } from '../services/dialog.service';
import {
    DialogTrashService,
    dialogTrashScheduler,
    getTrashConfig,
    setTrashConfig
} from '../services/dialog-trash.service';

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

    ipcMain.handle('dialog:search', async (event, query, limit, filter) => {
        return DialogService.searchMessages(query, limit, filter);
    });

    ipcMain.handle('dialog:generate-summary', async (event, sessionId) => {
        return DialogService.generateSummary(sessionId);
    });

    ipcMain.handle('dialog:export-session', async (event, sessionId) => {
        return DialogService.exportSessionToMarkdown(sessionId);
    });

    ipcMain.handle('dialog:bulk-archive', async (_event, ids, archived) => {
        return DialogTrashService.archiveSessions(ids, Boolean(archived));
    });

    ipcMain.handle('dialog:move-to-trash', async (_event, ids) => {
        return DialogTrashService.moveSessionsToTrash(ids);
    });

    ipcMain.handle('dialog:restore-from-trash', async (_event, ids) => {
        return DialogTrashService.restoreSessionsFromTrash(ids);
    });

    ipcMain.handle('dialog:permanent-delete', async (_event, ids) => {
        return DialogTrashService.permanentlyDeleteSessions(ids);
    });

    ipcMain.handle('dialog:get-trash-config', async () => {
        return getTrashConfig();
    });

    ipcMain.handle('dialog:set-trash-config', async (_event, retentionDays) => {
        const res = setTrashConfig(retentionDays);
        if (res.success && res.config?.retentionDays !== null) {
            dialogTrashScheduler.scheduleDeferredCleanup();
        }
        return res;
    });

    ipcMain.handle('dialog:run-trash-cleanup', async () => {
        return dialogTrashScheduler.runCleanupSafely();
    });
}
