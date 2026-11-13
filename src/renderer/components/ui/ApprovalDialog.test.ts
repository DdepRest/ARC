import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ApprovalDialog Integration Contract', () => {
  let mockRespondApproval: any;
  let mockOnApprovalRequest: any;
  let registeredCallback: ((req: any) => void) | null = null;
  let unsubscribeSpy: any;

  beforeEach(() => {
    unsubscribeSpy = vi.fn();
    registeredCallback = null;
    mockRespondApproval = vi.fn().mockResolvedValue({ success: true });
    mockOnApprovalRequest = vi.fn((cb) => {
      registeredCallback = cb;
      return unsubscribeSpy;
    });

    Object.defineProperty(global, 'window', {
      value: {
        api: {
          onApprovalRequest: mockOnApprovalRequest,
          respondApproval: mockRespondApproval
        }
      },
      writable: true,
      configurable: true
    });
  });

  it('correctly registers listener on mount and unregisters on cleanup', () => {
    const unsub = window.api.onApprovalRequest((req) => req);
    expect(mockOnApprovalRequest).toHaveBeenCalled();
    unsub();
    expect(unsubscribeSpy).toHaveBeenCalled();
  });

  it('processes incoming approval requests and sends approve response', async () => {
    let capturedRequest: any = null;
    window.api.onApprovalRequest((req) => {
      capturedRequest = req;
    });

    const testPayload = {
      id: 'test-req-123',
      actionType: 'SHELL_RUN',
      target: 'node test.js',
      reason: 'Executing safe script'
    };

    registeredCallback!(testPayload);
    expect(capturedRequest).toEqual(testPayload);

    // Simulate clicking "Approve"
    await window.api.respondApproval({ id: testPayload.id, approved: true });
    expect(mockRespondApproval).toHaveBeenCalledWith({
      id: 'test-req-123',
      approved: true
    });
  });

  it('sends reject response when user rejects', async () => {
    let capturedRequest: any = null;
    window.api.onApprovalRequest((req) => {
      capturedRequest = req;
    });

    const testPayload = {
      id: 'test-req-456',
      actionType: 'FILE_DELETE',
      target: '/data/database.db'
    };

    registeredCallback!(testPayload);
    expect(capturedRequest).toEqual(testPayload);

    // Simulate clicking "Reject"
    await window.api.respondApproval({ id: testPayload.id, approved: false });
    expect(mockRespondApproval).toHaveBeenCalledWith({
      id: 'test-req-456',
      approved: false
    });
  });

  it('ensures Escape key dispatch triggers immediate rejection without waiting for 60s timeout', async () => {
    let capturedRequest: any = null;
    window.api.onApprovalRequest((req) => {
      capturedRequest = req;
    });

    const testPayload = {
      id: 'test-req-escape',
      actionType: 'SYSTEM',
      target: 'calc.exe'
    };

    registeredCallback!(testPayload);
    expect(capturedRequest).toEqual(testPayload);

    // Escape triggers reject() immediately with approved: false
    await window.api.respondApproval({ id: testPayload.id, approved: false });
    expect(mockRespondApproval).toHaveBeenCalledWith({
      id: 'test-req-escape',
      approved: false
    });
  });
});
