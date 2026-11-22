import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSecurityStore } from '../../stores/security.store';
import { voiceMode } from '../../composables/useVoice';
import fs from 'fs';
import path from 'path';

describe('ApprovalDialog (F2.3 Security & Design Constitution)', () => {
  let pinia: any;
  let mockRespondApproval: any;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();

    mockRespondApproval = vi.fn().mockResolvedValue({ success: true });
    Object.defineProperty(global, 'window', {
      value: {
        api: {
          onApprovalRequest: vi.fn(),
          respondApproval: mockRespondApproval
        }
      },
      writable: true,
      configurable: true
    });
  });

  it('verifies ApprovalDialog.vue template contains required visual constitution classes and attributes', () => {
    const componentPath = path.resolve(__dirname, 'ApprovalDialog.vue');
    const content = fs.readFileSync(componentPath, 'utf8');

    // Visual Constitution tokens
    expect(content.includes('arc-glass-veil') || content.includes('bg-black/30')).toBe(true);
    expect(content.includes('arc-glass-veil') || content.includes('backdrop-blur-sm')).toBe(true);
    expect(content.includes('arc-popover') || content.includes('bg-[#070709]/65')).toBe(true);
    expect(content).toContain('z-[50]');
    expect(content).toContain('max-w-[480px]');

    // ARIA & Accessibility
    expect(content).toContain('role="dialog"');
    expect(content).toContain('aria-modal="true"');
    expect(content).toContain('aria-labelledby="approval-dialog-title"');
    expect(content).toContain('role="heading"');
    expect(content).toContain('aria-level="2"');

    // Security & Safety
    expect(content).toContain('focusCancelButton');
    expect(content).toContain('onDialogKeydown');
    expect(content).toContain('cancelButtonRef.value?.focus()');
    expect(content).toContain('@click.stop');
  });

  it('locks VoiceFSM to WAKE_WORD_ONLY when an approval request arrives', () => {
    voiceMode.value = 'ACTIVE_DIALOGUE';
    const store = useSecurityStore();
    store.setRequest({
      id: 'req-voice-lock',
      actionType: 'SHELL_RUN',
      target: 'rm -rf /tmp/arc'
    });

    expect(voiceMode.value).toBe('WAKE_WORD_ONLY');
    expect(store.isDialogOpen).toBe(true);
  });

  it('handles approve response and records trusted macro if checked', () => {
    const store = useSecurityStore();
    store.setRequest({
      id: 'req-approve',
      actionType: 'SHELL_RUN',
      target: 'git status',
      metadata: { macroId: 'macro-101' }
    });

    store.respond(true, true);
    expect(mockRespondApproval).toHaveBeenCalledWith({
      id: 'req-approve',
      approved: true
    });
    expect(store.isDialogOpen).toBe(false);
    expect(store.isMacroTrusted('macro-101')).toBe(true);
  });

  it('handles reject response and resets active request without trusting macro', () => {
    const store = useSecurityStore();
    store.setRequest({
      id: 'req-reject',
      actionType: 'SHELL_RUN',
      target: 'curl -s https://unknown-site.org',
      metadata: { macroId: 'macro-rejected' }
    });

    store.respond(false, true);
    expect(mockRespondApproval).toHaveBeenCalledWith({
      id: 'req-reject',
      approved: false
    });
    expect(store.isDialogOpen).toBe(false);
    expect(store.isMacroTrusted('macro-rejected')).toBe(false);
  });

  it('queues concurrent approval requests in FIFO order and deduplicates IDs', () => {
    const store = useSecurityStore();

    store.setRequest({ id: 'req-1', actionType: 'SHELL_RUN', target: 'git status' });
    store.setRequest({ id: 'req-2', actionType: 'FILE_DELETE', target: '/tmp/a.txt' });
    store.setRequest({ id: 'req-1', actionType: 'SHELL_RUN', target: 'git status' });

    expect(store.requestQueue.map((r) => r.id)).toEqual(['req-1', 'req-2']);
    expect(store.currentRequest?.id).toBe('req-1');

    store.respond(true, false);
    expect(mockRespondApproval).toHaveBeenNthCalledWith(1, { id: 'req-1', approved: true });
    expect(store.isDialogOpen).toBe(true);
    expect(store.currentRequest?.id).toBe('req-2');

    store.respond(false, false);
    expect(mockRespondApproval).toHaveBeenNthCalledWith(2, { id: 'req-2', approved: false });
    expect(store.isDialogOpen).toBe(false);
    expect(store.currentRequest).toBeNull();
  });

  it('extracts structured initiator, executable, cwd, shellMode, consequences, and dynamic timeout', async () => {
    const { extractApprovalDisplayContext } = await import('./approval-dialog.helpers');
    const ctx = extractApprovalDisplayContext({
      id: 'req-meta',
      actionType: 'SHELL_RUN',
      target: 'git status',
      timeoutMs: 30000,
      metadata: {
        macroId: 'deploy-check',
        executable: 'git.exe',
        cwd: 'C:\\Users\\Operator\\Project',
        shellMode: 'direct',
        consequences: 'Чтение состояния репозитория без системного shell.'
      }
    });

    expect(ctx.timeoutSeconds).toBe(30);
    expect(ctx.consequences).toContain('без системного shell');
    expect(ctx.fields).toEqual([
      { key: 'initiator', label: 'Инициатор', value: 'Макрос (deploy-check)' },
      { key: 'executable', label: 'Executable', value: 'git.exe' },
      { key: 'cwd', label: 'Директория', value: 'C:\\Users\\Operator\\Project' },
      { key: 'shellMode', label: 'Режим', value: 'direct (shell: false)' }
    ]);

    const fallbackCtx = extractApprovalDisplayContext({ id: 'req-min', actionType: 'SHELL_RUN' });
    expect(fallbackCtx.timeoutSeconds).toBe(60);
    expect(fallbackCtx.fields).toEqual([]);
    expect(fallbackCtx.consequences).toContain('изменить файлы или настройки');
  });

  it('traps Tab/Shift+Tab inside modal controls and restores previous focus safely on close', async () => {
    const { resolveDialogTabFocusTarget, restorePreviousFocus } = await import('./approval-dialog.helpers');
    const cancelBtn = { focus: vi.fn(), isConnected: true };
    const approveBtn = { focus: vi.fn(), isConnected: true };
    const triggerBtn = { focus: vi.fn(), isConnected: true };
    const detachedBtn = { focus: vi.fn(), isConnected: false };

    // Wrapping forward from last -> first and backward from first -> last
    expect(resolveDialogTabFocusTarget([cancelBtn, approveBtn], approveBtn, false)).toBe(cancelBtn);
    expect(resolveDialogTabFocusTarget([cancelBtn, approveBtn], cancelBtn, true)).toBe(approveBtn);
    // Natural progression inside modal returns null
    expect(resolveDialogTabFocusTarget([cancelBtn, approveBtn], cancelBtn, false)).toBeNull();
    // Focus escaped outside modal -> pull back inside
    expect(resolveDialogTabFocusTarget([cancelBtn, approveBtn], triggerBtn, false)).toBe(cancelBtn);
    expect(resolveDialogTabFocusTarget([cancelBtn, approveBtn], triggerBtn, true)).toBe(approveBtn);

    // Focus restoration succeeds for connected element and skips detached element
    expect(restorePreviousFocus(triggerBtn)).toBe(true);
    expect(triggerBtn.focus).toHaveBeenCalledTimes(1);
    expect(restorePreviousFocus(detachedBtn)).toBe(false);
    expect(detachedBtn.focus).not.toHaveBeenCalled();

    // Template contract check for focus restoration & metadata grid
    const content = fs.readFileSync(path.resolve(__dirname, 'ApprovalDialog.vue'), 'utf8');
    expect(content).toContain('capturePreviousFocus');
    expect(content).toContain('releasePreviousFocus');
    expect(content).toContain('approval-metadata-grid');
    expect(content).toContain('displayContext.timeoutSeconds');
  });
});
