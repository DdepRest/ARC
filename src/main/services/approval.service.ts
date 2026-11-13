import { BrowserWindow } from 'electron';
import crypto from 'crypto';

export interface ApprovalRequest {
  id: string;
  actionType: 'SHELL_RUN' | 'SYSTEM' | 'FILE_DELETE' | 'FILE_RENAME' | string;
  target: string;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt?: number;
  timeoutMs?: number;
}

type ApprovalResolver = (approved: boolean) => void;

export class ApprovalService {
  private static instance: ApprovalService;
  private pendingApprovals = new Map<string, { resolver: ApprovalResolver; timer: NodeJS.Timeout }>();
  private interceptor: ((request: ApprovalRequest) => Promise<boolean> | boolean) | null = null;

  public static getInstance(): ApprovalService {
    if (!ApprovalService.instance) {
      ApprovalService.instance = new ApprovalService();
    }
    return ApprovalService.instance;
  }

  public setInterceptor(interceptor: ((request: ApprovalRequest) => Promise<boolean> | boolean) | null): void {
    this.interceptor = interceptor;
  }

  public async requestApproval(requestData: Omit<ApprovalRequest, 'id' | 'createdAt'>): Promise<boolean> {
    const id = typeof crypto.randomUUID === 'function' 
      ? crypto.randomUUID() 
      : `approval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const timeoutMs = requestData.timeoutMs || 30000;
    const request: ApprovalRequest = {
      ...requestData,
      id,
      createdAt: Date.now(),
      timeoutMs
    };

    if (this.interceptor) {
      try {
        return await Promise.resolve(this.interceptor(request));
      } catch (err: any) {
        console.warn(`[ApprovalService] Interceptor error: ${err.message || err}`);
        return false;
      }
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(id);
        console.warn(`[ApprovalService] Approval request ${id} (${request.actionType}) timed out after ${timeoutMs}ms.`);
        resolve(false);
      }, timeoutMs);

      this.pendingApprovals.set(id, { resolver: resolve, timer });
      this.broadcastRequest(request);
    });
  }

  public resolveApproval(id: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(id);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(id);
    pending.resolver(approved);
    return true;
  }

  private broadcastRequest(request: ApprovalRequest): void {
    try {
      if (typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('ui:approval-request', request);
          }
        }
      }
    } catch (e: any) {
      console.warn(`[ApprovalService] Failed to broadcast ui:approval-request: ${e.message || e}`);
    }
  }

  public clear(): void {
    for (const [, pending] of this.pendingApprovals.entries()) {
      clearTimeout(pending.timer);
      pending.resolver(false);
    }
    this.pendingApprovals.clear();
  }
}

export const approvalService = ApprovalService.getInstance();
