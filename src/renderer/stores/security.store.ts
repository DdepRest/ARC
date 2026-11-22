import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { voiceMode } from '../composables/useVoice';

export interface ApprovalRequest {
  id: string;
  actionType?: string;
  target?: string;
  reason?: string;
  message?: string;
  metadata?: Record<string, any>;
  timeoutMs?: number;
}

export const useSecurityStore = defineStore('security', () => {
  const requestQueue = ref<ApprovalRequest[]>([]);
  const currentRequest = computed<ApprovalRequest | null>(() => requestQueue.value[0] ?? null);
  const isDialogOpen = computed(() => requestQueue.value.length > 0);
  const trustedMacroIds = ref<Set<string>>(new Set());

  function lockVoiceForApproval() {
    // VoiceFSM lock: switch to WAKE_WORD_ONLY so voice cannot inadvertently confirm dialog
    try {
      voiceMode.value = 'WAKE_WORD_ONLY';
    } catch (err: any) {
      console.warn('[SecurityStore] Failed to lock VoiceFSM:', err?.message || err);
    }
  }

  function setRequest(req: ApprovalRequest | null) {
    if (!req) {
      if (requestQueue.value.length > 0) {
        requestQueue.value = requestQueue.value.slice(1);
      }
      return;
    }

    if (!requestQueue.value.some((item) => item.id === req.id)) {
      requestQueue.value = [...requestQueue.value, req];
    }
    lockVoiceForApproval();
  }

  function respond(approved: boolean, rememberMacro: boolean = false) {
    const active = requestQueue.value[0];
    if (!active) return;

    const id = active.id;
    const macroId = active.metadata?.macroId;

    if (rememberMacro && approved && macroId) {
      trustedMacroIds.value.add(macroId);
    }

    requestQueue.value = requestQueue.value.slice(1);

    if (typeof window !== 'undefined' && window.api?.respondApproval) {
      window.api.respondApproval({ id, approved: !!approved });
    }

    if (requestQueue.value.length > 0) {
      lockVoiceForApproval();
    }
  }

  function clearQueue() {
    requestQueue.value = [];
  }

  function isMacroTrusted(macroId?: string): boolean {
    if (!macroId) return false;
    return trustedMacroIds.value.has(macroId);
  }

  return {
    requestQueue,
    currentRequest,
    isDialogOpen,
    trustedMacroIds,
    setRequest,
    respond,
    clearQueue,
    isMacroTrusted
  };
});
