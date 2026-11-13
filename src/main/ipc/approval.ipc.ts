import { ipcMain } from 'electron';
import { approvalService } from '../services/approval.service';

export function registerApprovalIpc() {
  ipcMain.handle('ui:approval-response', async (_event, payload: { id: string; approved: boolean }) => {
    if (!payload || typeof payload.id !== 'string') {
      return { success: false, error: 'INVALID_PAYLOAD' };
    }
    const resolved = approvalService.resolveApproval(payload.id, !!payload.approved);
    return { success: resolved };
  });

  ipcMain.handle('ui:approval-resolve', async (_event, payload: { id: string; approved: boolean }) => {
    if (!payload || typeof payload.id !== 'string') {
      return { success: false, error: 'INVALID_PAYLOAD' };
    }
    const resolved = approvalService.resolveApproval(payload.id, !!payload.approved);
    return { success: resolved };
  });
}
