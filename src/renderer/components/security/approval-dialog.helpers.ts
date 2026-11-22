import type { ApprovalRequest } from '../../stores/security.store';

export interface ApprovalContextField {
  key: 'initiator' | 'executable' | 'cwd' | 'shellMode';
  label: string;
  value: string;
}

export interface ApprovalDisplayContext {
  fields: ApprovalContextField[];
  consequences: string;
  timeoutSeconds: number;
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_CONSEQUENCES = 'Это действие может изменить файлы или настройки системы.';

export function computeApprovalTimeoutSeconds(timeoutMs?: number): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Math.round(DEFAULT_TIMEOUT_MS / 1000);
  }
  return Math.max(1, Math.round(timeoutMs / 1000));
}

export function extractApprovalDisplayContext(request: ApprovalRequest | null): ApprovalDisplayContext {
  const meta = request?.metadata ?? {};
  const fields: ApprovalContextField[] = [];

  const initiatorRaw =
    typeof meta.initiator === 'string' && meta.initiator.trim().length > 0
      ? meta.initiator.trim()
      : typeof meta.macroId === 'string' && meta.macroId.trim().length > 0
        ? `Макрос (${meta.macroId.trim()})`
        : '';
  if (initiatorRaw) {
    fields.push({ key: 'initiator', label: 'Инициатор', value: initiatorRaw });
  }

  if (typeof meta.executable === 'string' && meta.executable.trim().length > 0) {
    fields.push({ key: 'executable', label: 'Executable', value: meta.executable.trim() });
  }

  if (typeof meta.cwd === 'string' && meta.cwd.trim().length > 0) {
    fields.push({ key: 'cwd', label: 'Директория', value: meta.cwd.trim() });
  }

  if (typeof meta.shellMode === 'string' && meta.shellMode.trim().length > 0) {
    const modeLabel =
      meta.shellMode === 'unsafe_raw_shell'
        ? 'unsafe_raw_shell (системный shell)'
        : `${meta.shellMode} (shell: false)`;
    fields.push({ key: 'shellMode', label: 'Режим', value: modeLabel });
  }

  const consequences =
    typeof meta.consequences === 'string' && meta.consequences.trim().length > 0
      ? meta.consequences.trim()
      : DEFAULT_CONSEQUENCES;

  return {
    fields,
    consequences,
    timeoutSeconds: computeApprovalTimeoutSeconds(request?.timeoutMs)
  };
}

export interface FocusableLike {
  focus: () => void;
  isConnected?: boolean;
}

/**
 * Computes the next focus target for a modal Tab / Shift+Tab trap.
 * Returns null if browser default Tab order stays inside the modal.
 */
export function resolveDialogTabFocusTarget(
  focusables: FocusableLike[],
  activeElement: unknown,
  shiftKey: boolean
): FocusableLike | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeIndex = focusables.indexOf(activeElement as FocusableLike);

  if (activeIndex === -1) {
    return shiftKey ? last : first;
  }
  if (shiftKey && activeIndex === 0) {
    return last;
  }
  if (!shiftKey && activeIndex === focusables.length - 1) {
    return first;
  }
  return null;
}

export function restorePreviousFocus(el: FocusableLike | null): boolean {
  if (!el) return false;
  if (el.isConnected === false) return false;
  try {
    el.focus();
    return true;
  } catch {
    return false;
  }
}
