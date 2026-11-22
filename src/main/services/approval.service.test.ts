import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApprovalService } from './approval.service';

function createMockTrustedWindow(id: number = 42, url: string = 'file:///app/index.html') {
  const win = new EventEmitter() as any;
  const webContents = new EventEmitter() as any;
  const mainFrame = { url };

  webContents.id = id;
  webContents.mainFrame = mainFrame;
  webContents.isDestroyed = vi.fn(() => false);
  webContents.getURL = vi.fn(() => url);
  webContents.send = vi.fn();

  win.isDestroyed = vi.fn(() => false);
  win.webContents = webContents;

  return { win, webContents, mainFrame };
}

describe('ApprovalService', () => {
  let service: ApprovalService;

  beforeEach(() => {
    service = new ApprovalService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.clear();
    service.setTrustedWindow(null);
    vi.useRealTimers();
  });

  it('resolves approval request when approved', async () => {
    const requestPromise = service.requestApproval({
      actionType: 'SHELL_RUN',
      target: 'npm test',
      reason: 'Testing approval flow'
    });

    const pendingMap = (service as any).pendingApprovals;
    expect(pendingMap.size).toBe(1);

    const [id] = pendingMap.keys();
    const resolved = service.resolveApproval(id, true);
    expect(resolved).toBe(true);

    const result = await requestPromise;
    expect(result).toBe(true);
    expect(pendingMap.size).toBe(0);
  });

  it('resolves approval request to false when rejected', async () => {
    const requestPromise = service.requestApproval({
      actionType: 'FILE_DELETE',
      target: '/some/file.txt',
      reason: 'Testing rejection'
    });

    const pendingMap = (service as any).pendingApprovals;
    const [id] = pendingMap.keys();
    service.resolveApproval(id, false);

    const result = await requestPromise;
    expect(result).toBe(false);
  });

  it('times out and rejects after timeoutMs', async () => {
    const requestPromise = service.requestApproval({
      actionType: 'SYSTEM',
      target: 'cmd.exe',
      timeoutMs: 5000
    });

    vi.advanceTimersByTime(5001);

    const result = await requestPromise;
    expect(result).toBe(false);
  });

  it('supports interceptor for automated tests', async () => {
    service.setInterceptor((req) => req.actionType === 'SHELL_RUN');

    const approved = await service.requestApproval({
      actionType: 'SHELL_RUN',
      target: 'node script.js'
    });
    expect(approved).toBe(true);

    const rejected = await service.requestApproval({
      actionType: 'FILE_DELETE',
      target: 'data.db'
    });
    expect(rejected).toBe(false);
  });

  it('auto-rejects all pending approvals when trusted window closes or navigates', async () => {
    const { win } = createMockTrustedWindow(42);
    service.setTrustedWindow(win);

    const p1 = service.requestApproval({ actionType: 'SHELL_RUN', target: 'git status' });
    const p2 = service.requestApproval({ actionType: 'FILE_DELETE', target: 'file.txt' });

    win.emit('closed');

    expect(await p1).toBe(false);
    expect(await p2).toBe(false);

    // Subsequent requests fail closed when window is closed
    expect(await service.requestApproval({ actionType: 'SHELL_RUN', target: 'node -v' })).toBe(false);

    // Re-bind fresh window and test main-frame navigation rejection
    const { win: win2 } = createMockTrustedWindow(43);
    service.setTrustedWindow(win2);
    const p3 = service.requestApproval({ actionType: 'SHELL_RUN', target: 'node -v' });
    win2.webContents.emit('did-start-navigation', {}, 'https://other.example', false, true);
    expect(await p3).toBe(false);
  });

  it('rejects expired IDs and mismatched sender webContents IDs', async () => {
    const { win, webContents } = createMockTrustedWindow(42);
    service.setTrustedWindow(win);

    const reqPromise = service.requestApproval({
      actionType: 'SHELL_RUN',
      target: 'node -v',
      timeoutMs: 2000
    });

    const id = webContents.send.mock.calls[0][1].id;

    // Sender mismatch must be rejected without consuming the valid pending request
    expect(service.resolveApprovalWithStatus(id, true, 999)).toEqual({
      success: false,
      error: 'SENDER_MISMATCH'
    });

    // Advance past expiresAt without letting timer fire yet (simulate Date.now() race)
    vi.setSystemTime(Date.now() + 2500);
    expect(service.resolveApprovalWithStatus(id, true, 42)).toEqual({
      success: false,
      error: 'APPROVAL_EXPIRED'
    });
    expect(await reqPromise).toBe(false);
  });
});
