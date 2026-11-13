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
  const currentRequest = ref<ApprovalRequest | null>(null);
  const isDialogOpen = computed(() => currentRequest.value !== null);
  const trustedMacroIds = ref<Set<string>>(new Set());

  function setRequest(req: ApprovalRequest | null) {
    currentRequest.value = req;
    if (req) {
      // VoiceFSM lock: switch to WAKE_WORD_ONLY so voice cannot inadvertently confirm dialog
      try {
        voiceMode.value = 'WAKE_WORD_ONLY';
      } catch (err: any) {
        console.warn('[SecurityStore] Failed to lock VoiceFSM:', err?.message || err);
      }
    }
  }

  function respond(approved: boolean, rememberMacro: boolean = false) {
    if (!currentRequest.value) return;
    const id = currentRequest.value.id;
    const macroId = currentRequest.value.metadata?.macroId;

    if (rememberMacro && macroId) {
      trustedMacroIds.value.add(macroId);
    }

    if (typeof window !== 'undefined' && window.api?.respondApproval) {
      window.api.respondApproval({ id, approved });
    }

    currentRequest.value = null;
  }

  function isMacroTrusted(macroId?: string): boolean {
    if (!macroId) return false;
    return trustedMacroIds.value.has(macroId);
  }

  return {
    currentRequest,
    isDialogOpen,
    trustedMacroIds,
    setRequest,
    respond,
    isMacroTrusted
  };
});
