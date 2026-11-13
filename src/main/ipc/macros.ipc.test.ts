import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { handlers, mockApp, mockMacroExecutor } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  mockApp: {
    getPath: vi.fn()
  },
  mockMacroExecutor: {
    execute: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    })
  },
  app: mockApp
}));

vi.mock('../services/MacroExecutor', () => ({
  macroExecutor: mockMacroExecutor
}));

import { registerMacrosIpc, resolveMacroFilePath } from './macros.ipc';

describe('Task 1.3 — macros.ipc.ts Path Traversal & Macro ID Validation', () => {
  let tmpUserData: string;
  let macrosDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-macros-ipc-test-'));
    macrosDir = path.join(tmpUserData, 'macros');
    mockApp.getPath.mockReturnValue(tmpUserData);
    registerMacrosIpc();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('1. rejects invalid macro IDs ("../evil", "../../etc/passwd", "a/b", "a\\\\b", ".", "..", "", "${inject}", and length > 128) across macros:save, macros:load, macros:delete, macros:execute with { success: false, error: "Invalid macro id" } and zero filesystem side effects', async () => {
    const saveHandler = handlers.get('macros:save')!;
    const loadHandler = handlers.get('macros:load')!;
    const deleteHandler = handlers.get('macros:delete')!;
    const executeHandler = handlers.get('macros:execute')!;

    // Place a canary file outside macrosDir to ensure "../evil" cannot delete or read it
    const canaryOutsidePath = path.join(tmpUserData, 'evil.json');
    fs.writeFileSync(canaryOutsidePath, JSON.stringify({ name: 'Canary' }), 'utf-8');

    const invalidIds = [
      '../evil',
      '../../etc/passwd',
      'a/b',
      'a\\b',
      '.',
      '..',
      '',
      '   ',
      '${inject}',
      'macro-' + 'x'.repeat(125) // length 131 > 128
    ];

    for (const badId of invalidIds) {
      expect(() => resolveMacroFilePath(badId, macrosDir)).toThrow('Invalid macro id');

      const saveRes = await saveHandler({}, { id: badId, data: { name: 'Malicious' } });
      expect(saveRes).toEqual({ success: false, error: 'Invalid macro id' });

      const loadRes = await loadHandler({}, badId);
      expect(loadRes).toEqual({ success: false, error: 'Invalid macro id' });

      const deleteRes = await deleteHandler({}, badId);
      expect(deleteRes).toEqual({ success: false, error: 'Invalid macro id' });

      const executeRes = await executeHandler({}, badId);
      expect(executeRes).toEqual({ success: false, error: 'Invalid macro id' });
    }

    // Outside canary file must remain completely untouched, and macrosDir must remain empty
    expect(fs.existsSync(canaryOutsidePath)).toBe(true);
    expect(fs.readdirSync(macrosDir)).toEqual([]);
    expect(mockMacroExecutor.execute).not.toHaveBeenCalled();
  });

  it('2. allows valid macro IDs ("macro-1700000000000", "macro-1700000000000-abc_1") for save, load, execute, and delete inside userData/macros', async () => {
    const saveHandler = handlers.get('macros:save')!;
    const loadHandler = handlers.get('macros:load')!;
    const deleteHandler = handlers.get('macros:delete')!;
    const executeHandler = handlers.get('macros:execute')!;

    const validIds = ['macro-1700000000000', 'macro-1700000000000-abc_1'];

    for (const id of validIds) {
      const payload = { name: `Macro ${id}`, enabled: true, triggers: ['тест'] };

      const saveRes = await saveHandler({}, { id, data: payload });
      expect(saveRes).toBe(true);
      expect(fs.existsSync(path.join(macrosDir, `${id}.json`))).toBe(true);

      const loaded = await loadHandler({}, id);
      expect(loaded).toEqual(payload);

      const execRes = await executeHandler({}, id);
      expect(execRes).toBe(true);
      expect(mockMacroExecutor.execute).toHaveBeenLastCalledWith(payload);

      const delRes = await deleteHandler({}, id);
      expect(delRes).toBe(true);
      expect(fs.existsSync(path.join(macrosDir, `${id}.json`))).toBe(false);
    }
  });
});
