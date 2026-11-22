<template>
  <div
    v-if="isDialogOpen && currentRequest"
    id="approval-dialog-backdrop"
    class="fixed inset-0 arc-glass-veil flex items-center justify-center z-[50] p-4 animate-in fade-in duration-200 select-none"
    role="dialog"
    aria-modal="true"
    aria-labelledby="approval-dialog-title"
    @keydown="onDialogKeydown"
  >
    <div
      ref="dialogCardRef"
      id="approval-dialog-card"
      class="bg-[var(--arc-popover,#161616)] border border-[var(--arc-hairline)] rounded-[20px] max-w-[480px] w-full p-6 text-[var(--arc-text-primary)] flex flex-col gap-4 pointer-events-auto"
      :style="{
        background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 64px rgba(0, 0, 0, 0.85)'
      }"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-[var(--arc-divider)] pb-3 bg-[image:var(--arc-sheen)]">
        <div class="flex items-center gap-2.5">
          <span class="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] animate-pulse"></span>
          <h2
            id="approval-dialog-title"
            role="heading"
            aria-level="2"
            class="text-sm font-semibold tracking-normal text-[var(--arc-text-primary)] font-sans"
          >
            Подтверждение выполнения системной команды
          </h2>
        </div>
        <span
          id="approval-action-badge"
          class="text-xs px-2.5 py-0.5 rounded-full bg-[var(--arc-block)] text-[var(--arc-text-secondary)] border border-[var(--arc-hairline)] font-mono uppercase tracking-wider"
        >
          {{ currentRequest.actionType || 'SHELL_RUN' }}
        </span>
      </div>

      <!-- Body / Context -->
      <div class="space-y-3">
        <p id="approval-dialog-reason" class="text-xs text-[var(--arc-text-secondary)] font-sans leading-relaxed">
          {{ currentRequest.reason || 'ARC запросил разрешение на выполнение:' }}
        </p>

        <!-- Structured context metadata (initiator / executable / cwd / mode) -->
        <dl
          v-if="displayContext.fields.length > 0"
          id="approval-metadata-grid"
          class="grid grid-cols-1 gap-1.5 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] p-3 text-xs"
        >
          <div
            v-for="field in displayContext.fields"
            :key="field.key"
            class="flex items-baseline justify-between gap-3"
          >
            <dt class="text-[var(--arc-text-muted)] font-sans shrink-0">{{ field.label }}:</dt>
            <dd class="font-mono text-[var(--arc-text-primary)] break-all text-right select-text">
              {{ field.value }}
            </dd>
          </div>
        </dl>

        <!-- Command block (Machine layer) -->
        <div
          id="approval-target-preview"
          class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[12px] p-3 font-mono text-xs text-[var(--status-warn)] break-all select-text max-h-36 overflow-y-auto whitespace-pre-wrap leading-normal"
          :style="{ boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7)' }"
        >
          {{ currentRequest.target || currentRequest.message || '—' }}
        </div>

        <!-- Warning text -->
        <div
          id="approval-consequences"
          class="p-3 rounded-[12px] bg-[var(--arc-block)] border border-[var(--status-err)] text-[var(--status-err)] text-xs flex items-start gap-2"
        >
          <span class="text-sm leading-none mt-0.5">⚠️</span>
          <span class="font-sans leading-snug">
            {{ displayContext.consequences }}
          </span>
        </div>

        <!-- Timeout warning & Auto-reject notice -->
        <p id="approval-timeout-notice" class="text-xs text-[var(--arc-text-muted)] font-mono flex items-center justify-between pt-1">
          <span>Автоотмена через {{ displayContext.timeoutSeconds }} сек</span>
          <span>Esc для отмены</span>
        </p>

        <!-- Optional: Remember choice for macro -->
        <div
          v-if="currentRequest.metadata?.macroId"
          @click="rememberMacroChoice = !rememberMacroChoice"
          class="flex items-center gap-2.5 pt-1 text-xs text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] cursor-pointer select-none transition-colors"
        >
          <ArcCheckbox
            id="approval-remember-checkbox"
            size="sm"
            :model-value="rememberMacroChoice"
            @click.stop
            @update:model-value="val => { rememberMacroChoice = val; }"
          />
          <span class="font-sans">Запомнить выбор для этого макроса</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-3 pt-3 border-t border-[var(--arc-divider)]">
        <button
          ref="cancelButtonRef"
          id="approval-reject-button"
          type="button"
          @click="reject"
          class="px-5 py-2 text-xs font-medium rounded-full bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] transition-colors cursor-pointer font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
        >
          Отмена
        </button>
        <button
          id="approval-approve-button"
          type="button"
          @click="approve"
          class="px-5 py-2 text-xs font-semibold rounded-full bg-[var(--accent)] text-white shadow-[0_0_16px_rgba(var(--accent-rgb),0.3)] border border-transparent transition-all cursor-pointer font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--arc-text-primary)]"
        >
          Выполнить
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useSecurityStore } from '../../stores/security.store';
import ArcCheckbox from '../ui/ArcCheckbox.vue';
import {
  extractApprovalDisplayContext,
  resolveDialogTabFocusTarget,
  restorePreviousFocus
} from './approval-dialog.helpers';

const securityStore = useSecurityStore();
const { currentRequest, isDialogOpen } = storeToRefs(securityStore);

const dialogCardRef = ref<HTMLElement | null>(null);
const cancelButtonRef = ref<HTMLButtonElement | null>(null);
const rememberMacroChoice = ref(false);

const displayContext = computed(() => extractApprovalDisplayContext(currentRequest.value));

let unsubscribe: (() => void) | null = null;
let previouslyFocusedElement: HTMLElement | null = null;

function focusCancelButton() {
  nextTick(() => {
    cancelButtonRef.value?.focus();
  });
}

function capturePreviousFocus() {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && !dialogCardRef.value?.contains(active)) {
    previouslyFocusedElement = active;
  }
}

function releasePreviousFocus() {
  const target = previouslyFocusedElement;
  previouslyFocusedElement = null;
  nextTick(() => {
    restorePreviousFocus(target);
  });
}

watch(
  isDialogOpen,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      capturePreviousFocus();
      focusCancelButton();
    } else if (!open && wasOpen) {
      releasePreviousFocus();
    }
  }
);

watch(
  () => currentRequest.value?.id,
  (newId) => {
    if (newId) {
      rememberMacroChoice.value = false;
      focusCancelButton();
    }
  }
);

function onDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    reject();
    return;
  }

  if (e.key === 'Tab' && dialogCardRef.value) {
    const focusableElements = Array.from(
      dialogCardRef.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const nextFocus = resolveDialogTabFocusTarget(focusableElements, document.activeElement, e.shiftKey);
    if (nextFocus) {
      e.preventDefault();
      nextFocus.focus();
    }
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (isDialogOpen.value && e.key === 'Escape') {
    e.preventDefault();
    reject();
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleGlobalKeydown);
    if (window.api?.onApprovalRequest) {
      unsubscribe = window.api.onApprovalRequest((request: any) => {
        securityStore.setRequest(request);
      });
    }
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleGlobalKeydown);
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (previouslyFocusedElement) {
    restorePreviousFocus(previouslyFocusedElement);
    previouslyFocusedElement = null;
  }
});

function approve() {
  securityStore.respond(true, rememberMacroChoice.value);
}

function reject() {
  securityStore.respond(false, false);
}
</script>
