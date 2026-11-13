import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MacroExecutor } from './MacroExecutor';
import { approvalService } from './approval.service';
import * as childProcess from 'child_process';
import { ttsService } from './tts.service';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    isPackaged: false
  },
  shell: {
    openPath: vi.fn().mockResolvedValue('')
  },
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn()
  }))
}));

vi.mock('child_process', () => ({
  exec: vi.fn((cmd, cb) => {
    if (cb) cb(null, 'ok', '');
  }),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    on: vi.fn()
  }))
}));

vi.mock('./tts.service', () => ({
  ttsService: {
    speak: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('MacroExecutor Approval & Security Tests', () => {
  let executor: MacroExecutor;

  beforeEach(() => {
    executor = new MacroExecutor();
    vi.clearAllMocks();
    approvalService.clear();
    approvalService.setInterceptor(null);
  });

  it('rejects shell command blocked by PolicyEngine without asking approval', async () => {
    const requestApprovalSpy = vi.spyOn(approvalService, 'requestApproval');

    const macroData = {
      nodes: [
        {
          id: 1,
          type: 'actions/shell',
          properties: { command: 'curl https://malicious.site' },
          flags: {}
        }
      ],
      links: []
    };

    await executor.execute(macroData);

    expect(requestApprovalSpy).not.toHaveBeenCalled();
    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('requests approval for allowed shell command and blocks execution if user rejects', async () => {
    approvalService.setInterceptor(() => false);

    const macroData = {
      nodes: [
        {
          id: 1,
          type: 'actions/shell',
          properties: { command: 'node -e "console.log(1)"' },
          flags: {}
        }
      ],
      links: []
    };

    await executor.execute(macroData);

    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('executes shell command when user approves', async () => {
    approvalService.setInterceptor(() => true);

    const macroData = {
      nodes: [
        {
          id: 1,
          type: 'actions/shell',
          properties: { command: 'node -e "console.log(1)"' },
          flags: {}
        }
      ],
      links: []
    };

    await executor.execute(macroData);

    expect(childProcess.exec).toHaveBeenCalledWith(
      'node -e "console.log(1)"',
      expect.any(Function)
    );
  });

  it('blocks SYSTEM launch action if user rejects approval', async () => {
    approvalService.setInterceptor(() => false);

    const macroData = {
      nodes: [
        {
          id: 1,
          type: 'actions/launch',
          properties: { appPath: 'calc.exe' },
          flags: {}
        }
      ],
      links: []
    };

    await executor.execute(macroData);

    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('Task 2.3 — actions/speak routes through ttsService.speak and awaits speech', async () => {
    const macroData = {
      nodes: [
        {
          id: 1,
          type: 'actions/speak',
          properties: { text: 'Привет, ядро A.R.C.' },
          flags: {}
        }
      ],
      links: []
    };

    await executor.execute(macroData);

    expect(ttsService.speak).toHaveBeenCalledTimes(1);
    expect(ttsService.speak).toHaveBeenCalledWith('Привет, ядро A.R.C.');
    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('Task 2.3 — actions/speak handles ttsService.speak errors gracefully without crashing and returns [0]', async () => {
    vi.mocked(ttsService.speak).mockRejectedValueOnce(new Error('TTS failure'));

    const node = {
      id: 1,
      type: 'actions/speak',
      properties: { text: 'Текст при ошибке' },
      flags: {}
    };

    const outputSlots = await (executor as any).executeNode(node);
    expect(ttsService.speak).toHaveBeenCalledWith('Текст при ошибке');
    expect(outputSlots).toEqual([0]);
  });
});
