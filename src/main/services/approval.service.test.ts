import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApprovalService } from './approval.service';

describe('ApprovalService', () => {
  let service: ApprovalService;

  beforeEach(() => {
    service = new ApprovalService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.clear();
    vi.useRealTimers();
  });

  it('resolves approval request when approved', async () => {
    const requestPromise = service.requestApproval({
      actionType: 'SHELL_RUN',
      target: 'npm test',
      reason: 'Testing approval flow'
    });

    // We know request is pending; let's resolve it
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
    service.setInterceptor((req) => {
      return req.actionType === 'SHELL_RUN';
    });

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
});
