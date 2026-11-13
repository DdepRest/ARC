<template>
  <div ref="composerWrapRef" class="aic-composer-wrap relative flex flex-col gap-2 w-full select-none">
    <!-- Attached Context File Chips -->
    <div
      v-if="files.length > 0"
      class="flex flex-wrap items-center gap-2 p-2 bg-[var(--arc-block)] rounded-xl border border-[var(--arc-hairline)] animate-in fade-in duration-200"
    >
      <div
        v-for="(file, idx) in files"
        :key="`${file.name}-${idx}`"
        class="inline-flex items-center gap-2 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] rounded-full px-3 py-1 text-xs text-[var(--arc-text-primary)] transition"
      >
        <div v-if="file.dataUrl" class="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <img :src="file.dataUrl" class="w-full h-full object-cover" :alt="file.name" />
        </div>
        <div v-else class="w-5 h-5 rounded-full bg-[var(--arc-plane)] flex items-center justify-center text-xs font-mono font-bold text-[var(--arc-text-secondary)] shrink-0">
          {{ getFileExt(file.name) }}
        </div>
        <span class="max-w-[160px] truncate font-sans font-medium text-xs text-[var(--arc-text-primary)]" :title="file.name">{{ file.name }}</span>
        <span class="text-xs text-[var(--arc-text-machine)] font-mono tabular-nums">{{ formatFileSize(file.size) }}</span>
        <button type="button" @click.stop="removeAttachedFile(idx)" class="ml-0.5 p-0.5 rounded-full text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer" title="Удалить файл">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="text-xs text-[var(--arc-text-machine)] font-mono tabular-nums ml-auto px-1.5">
        {{ files.length }} {{ files.length === 1 ? 'файл' : 'файла(-ов)' }}
      </div>
    </div>

    <!-- Hidden File Input -->
    <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileInputChange" />

    <!-- Primary Composer Card -->
    <section class="aic-composer-card">
      <!-- @ Context Mention Popover -->
      <div
        ref="contextPopoverRef"
        @click.stop
        :class="['aic-glass-popover absolute left-4 bottom-[calc(100%+8px)] w-60 rounded-[16px] p-1.5 z-50', contextMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden']"
      >
        <div class="px-2.5 py-1 text-xs font-mono uppercase tracking-wider text-[var(--arc-text-secondary)]">Контекст директивы</div>
        <button
          v-for="item in CONTEXT_OPTIONS"
          :key="item.tag"
          type="button"
          @click.stop="handleInsertContextTag(item.tag)"
          class="aic-mode-menu-item w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between"
        >
          <span class="font-mono text-xs text-[var(--arc-text-primary)]">{{ item.tag }}</span>
          <span class="text-xs text-[var(--arc-text-secondary)]">{{ item.category }}</span>
        </button>
      </div>

      <!-- Top Row: Prompt Textarea + Clear Action -->
      <div class="relative flex items-start gap-2 mb-3.5">
        <textarea
          ref="textareaRef"
          :value="modelValue"
          @input="onTextInput"
          @keydown.enter="onKeydownEnter"
          @paste="onPaste"
          rows="1"
          :placeholder="dynamicPlaceholder"
          class="aic-prompt-input flex-1"
          aria-label="Поле ввода директивы"
        ></textarea>
        <button
          v-if="modelValue.trim()"
          type="button"
          @click="clearInput"
          class="p-1 rounded-full text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer shrink-0"
          title="Очистить поле"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Bottom Controls Bar -->
      <div class="flex items-center justify-between gap-2 relative min-w-0">
        <!-- Left Controls Group -->
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- 1. "+ Файлы" Expanding Pill Button -->
          <button
            type="button"
            @click="triggerFilePicker"
            class="aic-pill-control aic-add-files-btn"
            aria-label="Прикрепить файлы"
            title="Прикрепить файлы к директиве"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="shrink-0 text-[var(--arc-text-primary)]">
              <path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
            <span class="aic-add-files-label">Файлы</span>
          </button>

          <!-- 2. Mode Selector ("Auto v" / "Build v" / "Plan v" / "Ask v") -->
          <div ref="modeWrapRef" class="relative shrink-0">
            <button
              type="button"
              @click.stop="toggleModeMenu"
              :class="['aic-pill-control aic-mode-btn', modeMenuOpen ? 'menu-open' : '']"
              aria-haspopup="true"
              :aria-expanded="modeMenuOpen"
            >
              <span class="mode-btn-text transition-colors">{{ mode }}</span>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" :class="['mt-0.5 text-[var(--arc-text-secondary)] transition-transform duration-200', modeMenuOpen ? 'rotate-180' : '']">
                <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <!-- Mode Popover Menu -->
            <div
              @click.stop
              :class="['aic-glass-popover absolute left-0 bottom-[calc(100%+8px)] w-[188px] rounded-[18px] p-1.5 z-50', modeMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden']"
              role="menu"
            >
              <div class="flex flex-col gap-0.5">
                <button
                  v-for="modeOption in orderedModes"
                  :key="modeOption"
                  type="button"
                  role="menuitem"
                  @click.stop="selectMode(modeOption)"
                  class="aic-mode-menu-item w-full"
                >
                  <div class="flex items-baseline gap-1.5 min-w-0">
                    <span class="font-medium text-[var(--arc-text-primary)]">{{ modeOption }}</span>
                    <span class="text-xs text-[var(--arc-text-secondary)] truncate">{{ MODE_META[modeOption].hint }}</span>
                  </div>
                  <svg v-if="modeOption === mode" width="15" height="15" viewBox="0 0 16 16" fill="none" class="shrink-0 text-[var(--accent)]">
                    <path d="M3.2 8.5L6.5 11.8L13 4.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- 3. Model & Effort Selector -->
          <ComposerModelSelector
            ref="modelSelectorRef"
            :models="models"
            :active-model="activeModel"
            :auto-mode="autoMode"
            :model-menu-open="modelMenuOpen"
            :is-pinging="isPingingModels"
            @update:auto-mode="autoMode = $event"
            @update:model-menu-open="modelMenuOpen = $event"
            @open-menu="modeMenuOpen = false; contextMenuOpen = false"
            @select-model="selectModel"
            @select-effort="setModelEffort($event.modelId, $event.effort)"
            @toggle-fav="toggleFavModel"
            @refresh-models="refreshConnectedModels(true)"
          />
        </div>

        <!-- Right Controls Group -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- 4. Microphone / "Запись" Expanding Button -->
          <button
            type="button"
            @click="toggleVoiceInput"
            :class="['aic-pill-control aic-record-btn', isRecording ? 'recording' : '']"
            :title="isRecording ? 'Остановить голосовой ввод' : 'Голосовой ввод директивы'"
            aria-label="Голосовой ввод"
          >
            <span class="shrink-0 flex items-center justify-center text-[var(--arc-text-primary)]">
              <span v-if="isRecording" class="w-2.5 h-2.5 rounded-full bg-[var(--accent)] aic-recording-dot" />
              <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="1.8" width="5" height="7.6" rx="2.5" stroke="currentColor" stroke-width="1.45" />
                <path d="M3.2 7.2C3.2 9.85 5.35 12 8 12C10.65 12 12.8 9.85 12.8 7.2" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" />
                <path d="M8 12V14.2M5.8 14.2H10.2" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" />
              </svg>
            </span>
            <span class="aic-record-label font-mono tabular-nums">{{ isRecording ? formattedRecordingTime : 'Запись' }}</span>
          </button>

          <!-- 5. Stop Generation Button (when streaming) or Submit Up-Arrow Button -->
          <button
            v-if="chatStore.isStreaming"
            type="button"
            @click="handleStop"
            class="w-[38px] h-[38px] rounded-full text-[var(--status-err)] transition duration-200 shrink-0 flex items-center justify-center bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] active:scale-95 cursor-pointer"
            title="Остановить генерацию"
            aria-label="Остановить генерацию"
          >
            <Square class="w-3.5 h-3.5 text-[var(--status-err)] fill-current" />
          </button>

          <button
            v-else
            type="button"
            :disabled="!canSend"
            @click="handleSend"
            :class="['aic-submit-btn', canSend ? 'ready' : '']"
            title="Отправить директиву (Enter)"
            aria-label="Отправить директиву"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 12.8V3.2M8 3.2L3.8 7.4M8 3.2L12.2 7.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { X, Square } from 'lucide-vue-next';
import { useChatStore } from '../stores/chat.store';
import type { FileAttachment } from '../../../../shared/types/models/chat';
import ComposerModelSelector from './ComposerModelSelector.vue';
import './composer.css';
import { useComposerModels, ALL_MODES, MODE_META, CONTEXT_OPTIONS, type ComposerMode } from '../composables/useComposerModels';
import { useComposerAttachments } from '../composables/useComposerAttachments';

const props = defineProps<{ modelValue: string; files: FileAttachment[] }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:files', files: FileAttachment[]): void;
  (e: 'send'): void;
}>();

const chatStore = useChatStore();
const { mode, autoMode, models, activeModel, isPingingModels, refreshConnectedModels, toggleFavModel, selectModel, setModelEffort } = useComposerModels();

const composerWrapRef = ref<HTMLElement | null>(null);
const modeWrapRef = ref<HTMLElement | null>(null);
const modelSelectorRef = ref<InstanceType<typeof ComposerModelSelector> | null>(null);
const contextPopoverRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const modeMenuOpen = ref(false);
const modelMenuOpen = ref(false);
const contextMenuOpen = ref(false);

const basePromptBeforeRecording = ref('');

const adjustHeight = () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto';
      textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 140)}px`;
    }
  });
};

const { isRecording, formattedRecordingTime, toggleVoiceInput: rawToggleVoiceInput, stopVoiceCapture, getFileExt, formatFileSize, processSelectedFiles, removeAttachedFile } =
  useComposerAttachments(
    () => props.files,
    (updated) => emit('update:files', updated),
    (transcript) => {
      const base = basePromptBeforeRecording.value.trim();
      const combined = base ? `${base} ${transcript.trim()}` : transcript.trim();
      emit('update:modelValue', combined);
      adjustHeight();
    }
  );

const toggleVoiceInput = () => {
  if (!isRecording.value) {
    basePromptBeforeRecording.value = props.modelValue || '';
  }
  rawToggleVoiceInput();
};

const MODE_PLACEHOLDERS: Record<ComposerMode, string> = {
  Auto: 'Авто-режим A.R.C.: быстрые задачи — сразу Ask/Build, сложные — последовательно Plan → Build...',
  Plan: 'Спроектировать архитектуру, декомпозировать этапы / @ для контекста...',
  Ask: 'Задать вопрос по коду, памяти или документации / @ для контекста...',
  Build: 'Планирование, сборка, автоматизация / @ для контекста...',
};

const dynamicPlaceholder = computed(() => {
  if (isRecording.value) {
    return 'Слушаю...';
  }
  return MODE_PLACEHOLDERS[mode.value] || MODE_PLACEHOLDERS.Auto;
});
const orderedModes = computed<ComposerMode[]>(() => [...ALL_MODES.filter((m) => m !== mode.value), mode.value]);
const canSend = computed(() => props.modelValue.trim().length > 0 || props.files.length > 0);

function closeAllMenus() {
  modeMenuOpen.value = false;
  modelMenuOpen.value = false;
  contextMenuOpen.value = false;
}

function handleGlobalPointerDown(e: PointerEvent) {
  const target = e.target as Node | null;
  if (!target) return;
  if (modeMenuOpen.value && modeWrapRef.value && !modeWrapRef.value.contains(target)) modeMenuOpen.value = false;
  const modelRoot = modelSelectorRef.value?.rootRef;
  if (modelMenuOpen.value && modelRoot && !modelRoot.contains(target)) modelMenuOpen.value = false;
  if (contextMenuOpen.value && contextPopoverRef.value && !contextPopoverRef.value.contains(target)) contextMenuOpen.value = false;
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAllMenus();
}

onMounted(() => {
  window.addEventListener('pointerdown', handleGlobalPointerDown, true);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
  window.removeEventListener('keydown', handleGlobalKeydown);
});

const onTextInput = (e: Event) => {
  const val = (e.target as HTMLTextAreaElement).value;
  emit('update:modelValue', val);
  contextMenuOpen.value = val.endsWith('@');
  adjustHeight();
};

const handleInsertContextTag = (tag: string) => {
  emit('update:modelValue', props.modelValue.replace(/@$/, `${tag} `));
  contextMenuOpen.value = false;
  nextTick(() => {
    textareaRef.value?.focus();
    adjustHeight();
  });
};

const toggleModeMenu = () => {
  modelMenuOpen.value = false;
  contextMenuOpen.value = false;
  modeMenuOpen.value = !modeMenuOpen.value;
};

const selectMode = (nextMode: ComposerMode) => {
  mode.value = nextMode;
  modeMenuOpen.value = false;
};

const clearInput = () => {
  if (isRecording.value) {
    stopVoiceCapture();
  }
  basePromptBeforeRecording.value = '';
  emit('update:modelValue', '');
  contextMenuOpen.value = false;
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.focus();
  }
};

const onKeydownEnter = (e: KeyboardEvent) => {
  if (e.shiftKey) return;
  e.preventDefault();
  handleSend();
};

const handleStop = () => {
  if (window.api && (window as any).api.invoke) {
    (window as any).api.invoke('ai:abort-request').catch(() => {});
    (window as any).api.invoke('arc:stop-audio').catch(() => {});
    if (typeof (window as any).api.stopSpeak === 'function') (window as any).api.stopSpeak().catch(() => {});
  }
  window.speechSynthesis.cancel();
  chatStore.clearStreaming();
};

const triggerFilePicker = () => {
  closeAllMenus();
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
};

const onFileInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) processSelectedFiles(target.files);
};

const onPaste = (e: ClipboardEvent) => {
  if (e.clipboardData?.files?.length) processSelectedFiles(e.clipboardData.files);
};

const handleSend = () => {
  if (!canSend.value) return;
  if (isRecording.value) stopVoiceCapture();
  closeAllMenus();
  emit('send');
  nextTick(() => {
    if (textareaRef.value) textareaRef.value.style.height = 'auto';
  });
};
</script>
