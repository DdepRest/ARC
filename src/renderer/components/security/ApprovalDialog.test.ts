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
    expect(content).toContain('@click.stop'); // Backdrop click disabled
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

  it('handles reject response and resets active request', () => {
    const store = useSecurityStore();
    store.setRequest({
      id: 'req-reject',
      actionType: 'SHELL_RUN',
      target: 'curl -s https://unknown-site.org'
    });

    store.respond(false, false);
    expect(mockRespondApproval).toHaveBeenCalledWith({
      id: 'req-reject',
      approved: false
    });
    expect(store.isDialogOpen).toBe(false);
  });
});
