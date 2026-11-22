import { BrowserWindow, WebContents, WebFrameMain } from 'electron';
import crypto from 'crypto';
import { isTrustedOrigin } from '../../shared/config/csp.config';

export interface ApprovalRequest {
  id: string;
  actionType: 'SHELL_RUN' | 'SYSTEM' | 'FILE_DELETE' | 'FILE_RENAME' | string;
  target: string;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt?: number;
  timeoutMs?: number;
}

export interface ApprovalResolveResult {
  success: boolean;
  error?: string;
}

export interface SenderTrustCheckResult {
  trusted: boolean;
  reason?: string;
}

interface PendingApprovalEntry {
  resolver: ApprovalResolver;
  timer: NodeJS.Timeout;
  createdAt: number;
  expiresAt: number;
  expectedWebContentsId: number | null;
}

type ApprovalResolver = (approved: boolean) => void;

export class ApprovalService {
  private static instance: ApprovalService;
  private pendingApprovals = new Map<string, PendingApprovalEntry>();
  private interceptor: ((request: ApprovalRequest) => Promise<boolean> | boolean) | null = null;
  private trustedWindow: BrowserWindow | null = null;
  private trustedFileRoot: string | null = null;
  private strictTrustedWindowMode = false;
  private cleanupWindowListeners: (() => void) | null = null;

  public static getInstance(): ApprovalService {
    if (!ApprovalService.instance) {
      ApprovalService.instance = new ApprovalService();
    }
    return ApprovalService.instance;
  }

  public setInterceptor(interceptor: ((request: ApprovalRequest) => Promise<boolean> | boolean) | null): void {
    this.interceptor = interceptor;
  }

  public setTrustedWindow(win: BrowserWindow | null, trustedFileRoot?: string | null): void {
    if (this.cleanupWindowListeners) {
      this.cleanupWindowListeners();
      this.cleanupWindowListeners = null;
    }

    if (this.trustedWindow && this.trustedWindow !== win) {
      this.rejectAllPending('TRUSTED_WINDOW_CHANGED');
    }

    this.trustedWindow = win;
    this.trustedFileRoot = win ? (trustedFileRoot ?? null) : null;

    if (!win) {
      this.rejectAllPending('MAIN_WINDOW_CLEARED');
      return;
    }

    this.strictTrustedWindowMode = true;

    const onWindowClosed = () => {
      if (this.trustedWindow === win) {
        this.trustedWindow = null;
      }
      this.rejectAllPending('MAIN_WINDOW_CLOSED');
    };

    const onContentsGone = () => {
      this.rejectAllPending('MAIN_WINDOW_WEBCONTENTS_GONE');
    };

    const onDidStartNavigation = (_event: any, _url: string, isInPlace: boolean, isMainFrame: boolean) => {
      if (isMainFrame && !isInPlace) {
        this.rejectAllPending('MAIN_WINDOW_NAVIGATED');
      }
    };

    win.on?.('closed', onWindowClosed);
    const wc = win.webContents;
    wc?.on?.('destroyed', onContentsGone);
    wc?.on?.('render-process-gone', onContentsGone);
    wc?.on?.('did-start-navigation', onDidStartNavigation);

    this.cleanupWindowListeners = () => {
      win.removeListener?.('closed', onWindowClosed);
      wc?.removeListener?.('destroyed', onContentsGone);
      wc?.removeListener?.('render-process-gone', onContentsGone);
      wc?.removeListener?.('did-start-navigation', onDidStartNavigation);
    };
  }

  public getTrustedWindow(): BrowserWindow | null {
    return this.trustedWindow;
  }

  public isTrustedSender(event: {
    sender?: Partial<WebContents> | null;
    senderFrame?: Partial<WebFrameMain> | null;
  }): SenderTrustCheckResult {
    const sender = event?.sender;
    if (!sender) {
      return { trusted: false, reason: 'MISSING_SENDER' };
    }

    if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
      return { trusted: false, reason: 'SENDER_DESTROYED' };
    }

    const win = this.trustedWindow;
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
      return { trusted: false, reason: 'NO_TRUSTED_MAIN_WINDOW' };
    }

    const trustedContents = win.webContents;
    if (!trustedContents || (typeof trustedContents.isDestroyed === 'function' && trustedContents.isDestroyed())) {
      return { trusted: false, reason: 'TRUSTED_WEBCONTENTS_DESTROYED' };
    }

    if (sender !== trustedContents || sender.id !== trustedContents.id) {
      return { trusted: false, reason: 'UNTRUSTED_SENDER_WEBCONTENTS' };
    }

    if (event.senderFrame && sender.mainFrame && event.senderFrame !== sender.mainFrame) {
      return { trusted: false, reason: 'UNTRUSTED_SUBFRAME' };
    }

    const senderUrl =
      event.senderFrame?.url ||
      (typeof sender.getURL === 'function' ? sender.getURL() : '');
    const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
    if (!isTrustedOrigin(senderUrl, isDev, process.env.ELECTRON_RENDERER_URL, this.trustedFileRoot ?? undefined)) {
      return { trusted: false, reason: 'UNTRUSTED_ORIGIN' };
    }

    return { trusted: true };
  }

  public async requestApproval(requestData: Omit<ApprovalRequest, 'id' | 'createdAt'>): Promise<boolean> {
    const id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `approval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const timeoutMs =
      typeof requestData.timeoutMs === 'number' && requestData.timeoutMs > 0
        ? requestData.timeoutMs
        : 30000;
    const createdAt = Date.now();
    const request: ApprovalRequest = {
      ...requestData,
      id,
      createdAt,
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

    if (this.strictTrustedWindowMode) {
      const win = this.trustedWindow;
      const wc = win?.webContents;
      if (
        !win ||
        (typeof win.isDestroyed === 'function' && win.isDestroyed()) ||
        !wc ||
        (typeof wc.isDestroyed === 'function' && wc.isDestroyed())
      ) {
        console.warn(`[ApprovalService] Rejecting approval request ${id}: trusted main window unavailable.`);
        return false;
      }
    }

    const expectedWebContentsId =
      this.trustedWindow?.webContents && typeof this.trustedWindow.webContents.id === 'number'
        ? this.trustedWindow.webContents.id
        : null;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(id);
        console.warn(`[ApprovalService] Approval request ${id} (${request.actionType}) timed out after ${timeoutMs}ms.`);
        resolve(false);
      }, timeoutMs);

      this.pendingApprovals.set(id, {
        resolver: resolve,
        timer,
        createdAt,
        expiresAt: createdAt + timeoutMs,
        expectedWebContentsId
      });

      this.dispatchRequest(request);
    });
  }

  public resolveApprovalWithStatus(
    id: string,
    approved: boolean,
    senderWebContentsId?: number
  ): ApprovalResolveResult {
    if (typeof id !== 'string' || !id.trim() || typeof approved !== 'boolean') {
      return { success: false, error: 'INVALID_PAYLOAD' };
    }

    const pending = this.pendingApprovals.get(id);
    if (!pending) {
      return { success: false, error: 'UNKNOWN_OR_EXPIRED_APPROVAL_ID' };
    }

    if (Date.now() > pending.expiresAt) {
      clearTimeout(pending.timer);
      this.pendingApprovals.delete(id);
      pending.resolver(false);
      return { success: false, error: 'APPROVAL_EXPIRED' };
    }

    if (
      pending.expectedWebContentsId !== null &&
      senderWebContentsId !== undefined &&
      pending.expectedWebContentsId !== senderWebContentsId
    ) {
      return { success: false, error: 'SENDER_MISMATCH' };
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(id);
    pending.resolver(approved);
    return { success: true };
  }

  public resolveApproval(id: string, approved: boolean, senderWebContentsId?: number): boolean {
    return this.resolveApprovalWithStatus(id, approved, senderWebContentsId).success;
  }

  public rejectAllPending(reason: string = 'REJECTED'): number {
    let rejectedCount = 0;
    for (const [id, pending] of this.pendingApprovals.entries()) {
      clearTimeout(pending.timer);
      this.pendingApprovals.delete(id);
      pending.resolver(false);
      rejectedCount++;
      console.warn(`[ApprovalService] Auto-rejected pending approval ${id} (${reason}).`);
    }
    return rejectedCount;
  }

  private dispatchRequest(request: ApprovalRequest): void {
    try {
      if (this.strictTrustedWindowMode) {
        const win = this.trustedWindow;
        if (win && !win.isDestroyed?.() && win.webContents && !win.webContents.isDestroyed?.()) {
          win.webContents.send('ui:approval-request', request);
        }
        return;
      }

      if (typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('ui:approval-request', request);
          }
        }
      }
    } catch (e: any) {
      console.warn(`[ApprovalService] Failed to dispatch ui:approval-request: ${e.message || e}`);
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
