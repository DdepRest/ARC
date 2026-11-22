import { ipcMain } from 'electron';
import { approvalService } from '../services/approval.service';

export function registerApprovalIpc() {
  ipcMain.handle('ui:approval-response', async (event, payload: { id: string; approved: boolean }) => {
    const senderTrust = approvalService.isTrustedSender(event as any);
    if (!senderTrust.trusted) {
      console.warn(`[ApprovalIPC] Rejected untrusted approval response (${senderTrust.reason}).`);
      return { success: false, error: senderTrust.reason || 'UNTRUSTED_SENDER' };
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.id !== 'string' ||
      !payload.id.trim() ||
      typeof payload.approved !== 'boolean'
    ) {
      return { success: false, error: 'INVALID_PAYLOAD' };
    }

    const senderId = typeof event?.sender?.id === 'number' ? event.sender.id : undefined;
    return approvalService.resolveApprovalWithStatus(payload.id, payload.approved, senderId);
  });
}
