import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const registeredHandlers = new Map<string, (...args: any[]) => Promise<any>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<any>) => {
      registeredHandlers.set(channel, handler);
    })
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}));

import { registerApprovalIpc } from './approval.ipc';
import { approvalService } from '../services/approval.service';

function createMockMainWindow(url: string = 'file:///app/index.html', id: number = 101) {
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

describe('Approval IPC Sender Validation & Lifecycle Contract', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    approvalService.clear();
    approvalService.setInterceptor(null);
    registerApprovalIpc();
  });

  afterEach(() => {
    approvalService.clear();
    approvalService.setTrustedWindow(null);
    (approvalService as any).strictTrustedWindowMode = false;
  });

  it('registers only canonical ui:approval-response channel and removes ui:approval-resolve alias', () => {
    expect(registeredHandlers.has('ui:approval-response')).toBe(true);
    expect(registeredHandlers.has('ui:approval-resolve')).toBe(false);
  });

  it('accepts response from trusted main window webContents and rejects duplicate submission', async () => {
    const { win, webContents, mainFrame } = createMockMainWindow('file:///C:/ARC/index.html', 101);
    approvalService.setTrustedWindow(win, 'C:/ARC');

    const requestPromise = approvalService.requestApproval({
      actionType: 'SHELL_RUN',
      target: 'git status',
      timeoutMs: 10000
    });

    const [sentChannel, sentPayload] = webContents.send.mock.calls[0];
    expect(sentChannel).toBe('ui:approval-request');

    const handler = registeredHandlers.get('ui:approval-response')!;
    const firstResult = await handler(
      { sender: webContents, senderFrame: mainFrame },
      { id: sentPayload.id, approved: true }
    );
    expect(firstResult).toEqual({ success: true });
    expect(await requestPromise).toBe(true);

    const duplicateResult = await handler(
      { sender: webContents, senderFrame: mainFrame },
      { id: sentPayload.id, approved: true }
    );
    expect(duplicateResult).toEqual({ success: false, error: 'UNKNOWN_OR_EXPIRED_APPROVAL_ID' });
  });

  it('rejects untrusted sender webContents, subframes, and untrusted origins without resolving pending approval', async () => {
    const { win, webContents, mainFrame } = createMockMainWindow('file:///C:/ARC/index.html', 101);
    approvalService.setTrustedWindow(win, 'C:/ARC');

    const requestPromise = approvalService.requestApproval({
      actionType: 'SHELL_RUN',
      target: 'node build.js',
      timeoutMs: 10000
    });

    const sentPayload = webContents.send.mock.calls[0][1];
    const handler = registeredHandlers.get('ui:approval-response')!;

    // 1. Different webContents sender
    const rogueContents = {
      id: 999,
      mainFrame: { url: 'file:///C:/ARC/index.html' },
      isDestroyed: () => false,
      getURL: () => 'file:///C:/ARC/index.html'
    };
    const rogueRes = await handler(
      { sender: rogueContents, senderFrame: rogueContents.mainFrame },
      { id: sentPayload.id, approved: true }
    );
    expect(rogueRes).toEqual({ success: false, error: 'UNTRUSTED_SENDER_WEBCONTENTS' });

    // 2. Same webContents but subframe instead of mainFrame
    const subframeRes = await handler(
      { sender: webContents, senderFrame: { url: 'file:///C:/ARC/index.html' } },
      { id: sentPayload.id, approved: true }
    );
    expect(subframeRes).toEqual({ success: false, error: 'UNTRUSTED_SUBFRAME' });

    // 3. Untrusted origin
    webContents.getURL.mockReturnValue('https://attacker.example/exploit.html');
    mainFrame.url = 'https://attacker.example/exploit.html';
    const badOriginRes = await handler(
      { sender: webContents, senderFrame: mainFrame },
      { id: sentPayload.id, approved: true }
    );
    expect(badOriginRes).toEqual({ success: false, error: 'UNTRUSTED_ORIGIN' });

    // 4. Foreign local file:// outside canonical renderer root
    webContents.getURL.mockReturnValue('file:///D:/evil/exploit.html');
    mainFrame.url = 'file:///D:/evil/exploit.html';
    const foreignFileRes = await handler(
      { sender: webContents, senderFrame: mainFrame },
      { id: sentPayload.id, approved: true }
    );
    expect(foreignFileRes).toEqual({ success: false, error: 'UNTRUSTED_ORIGIN' });

    // Pending approval must still be alive so legitimate UI on trusted origin can reject it
    mainFrame.url = 'file:///C:/ARC/index.html';
    webContents.getURL.mockReturnValue('file:///C:/ARC/index.html');
    const legitRes = await handler(
      { sender: webContents, senderFrame: mainFrame },
      { id: sentPayload.id, approved: false }
    );
    expect(legitRes).toEqual({ success: true });
    expect(await requestPromise).toBe(false);
  });

  it('rejects non-boolean approved payload and stale unknown approval IDs', async () => {
    const { win, webContents, mainFrame } = createMockMainWindow('file:///C:/ARC/index.html', 101);
    approvalService.setTrustedWindow(win, 'C:/ARC');

    const handler = registeredHandlers.get('ui:approval-response')!;

    expect(
      await handler({ sender: webContents, senderFrame: mainFrame }, { id: 'abc', approved: 'yes' })
    ).toEqual({ success: false, error: 'INVALID_PAYLOAD' });

    expect(
      await handler({ sender: webContents, senderFrame: mainFrame }, { id: '   ', approved: true })
    ).toEqual({ success: false, error: 'INVALID_PAYLOAD' });

    expect(
      await handler({ sender: webContents, senderFrame: mainFrame }, { id: 'non-existent-id', approved: true })
    ).toEqual({ success: false, error: 'UNKNOWN_OR_EXPIRED_APPROVAL_ID' });
  });

  it('fails closed on file:// origin if trustedFileRoot is not configured', async () => {
    const { win, webContents, mainFrame } = createMockMainWindow('file:///C:/ARC/index.html', 101);
    approvalService.setTrustedWindow(win);

    const handler = registeredHandlers.get('ui:approval-response')!;
    const res = await handler(
      { sender: webContents, senderFrame: mainFrame },
      { id: 'any-id', approved: true }
    );
    expect(res).toEqual({ success: false, error: 'UNTRUSTED_ORIGIN' });
  });
});
