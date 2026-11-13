<template>
  <div class="flex flex-col gap-2 w-full">
    <!-- 1. USER DIRECTIVE BLOCK -->
    <div 
      v-if="message.role === 'user'"
      class="flex flex-col self-end max-w-[85%] ml-8 sm:ml-12 group relative pt-2"
    >
      <div class="bg-[var(--arc-selected)] border border-[var(--arc-hairline)] rounded-2xl rounded-tr-xs px-4.5 py-3 text-sm text-[var(--arc-text-primary)] relative shadow-[0_4px_16px_rgba(0,0,0,0.45)]">
        <!-- User bubble top actions (Clean non-overlapping floating slot) -->
        <div class="absolute -top-3.5 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-full px-1.5 py-0.5 shadow-xl z-20 pointer-events-auto">
          <button 
            @click="copyText(cleanContent)"
            class="p-1 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            :title="copied ? 'Скопировано!' : 'Копировать директиву'"
          >
            <Check v-if="copied" class="w-3.5 h-3.5 text-[var(--status-ok)]" />
            <Copy v-else class="w-3.5 h-3.5" />
          </button>
          <button 
            @click="$emit('delete', message.id)"
            class="p-1 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-hint)] hover:text-[var(--status-err)] transition-colors cursor-pointer"
            title="Удалить сообщение"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
        
        <!-- Attachments Section if present -->
        <div v-if="message.attachments && message.attachments.length > 0" class="flex flex-wrap gap-2 mb-3">
          <div 
            v-for="(att, idx) in message.attachments" 
            :key="idx"
            class="flex items-center gap-2 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-xl p-1.5 pr-3 text-xs max-w-full group/att transition-colors"
          >
            <div 
              v-if="isImage(att)" 
              class="w-10 h-10 rounded-lg overflow-hidden shrink-0 cursor-pointer bg-[var(--arc-plane)] border border-[var(--arc-hairline)] relative group-hover/att:scale-105 transition-transform"
              @click="previewImage(att)"
            >
              <img :src="att.dataUrl || att.content" class="w-full h-full object-cover" :alt="att.name" />
            </div>
            <div v-else class="w-8 h-8 rounded-lg bg-[var(--arc-plane)] flex items-center justify-center shrink-0 text-[10px] font-mono font-bold text-[var(--arc-text-secondary)]">
              {{ getFileExt(att.name) }}
            </div>
            <div class="flex flex-col min-w-0 flex-1">
              <span class="text-xs text-[var(--arc-text-primary)] font-medium truncate font-sans" :title="att.name">{{ att.name }}</span>
              <span class="text-[10px] text-[var(--arc-text-machine)] font-mono">{{ formatFileSize(att.size) }}</span>
            </div>
            <button 
              v-if="att.dataUrl || att.content"
              @click="downloadFile(att)"
              class="p-1.5 rounded-full text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors ml-1 cursor-pointer"
              title="Скачать файл"
            >
              <Download class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div v-if="cleanContent" class="leading-relaxed break-words whitespace-pre-wrap font-sans text-xs sm:text-sm text-[var(--arc-text-primary)]">
          {{ cleanContent }}
        </div>
      </div>
    </div>

    <!-- 2. EXECUTION FLOW TRACE & FINAL ANSWER (ASSISTANT ROLE) -->
    <div 
      v-else-if="message.role === 'assistant'"
      class="flex flex-col self-start max-w-[92%] sm:max-w-[88%] mr-4 sm:mr-10 group gap-1.5"
    >
      <!-- Execution Flow Block (Collapsible - Only for real observable actions/tools) -->
      <ExecutionTrace 
        v-if="isRealToolExecution && realExecutionSteps.length > 0"
        :steps="realExecutionSteps" 
      />
      <!-- Validator Feedback Card if rejected -->
      <ValidatorRejectionCard 
        v-if="message.validatorFeedback && message.validatorFeedback.rejected"
        :feedback="message.validatorFeedback"
        @retry="$emit('retry-step', message.id)"
        @refine="$emit('refine-step', message.id)"
      />
      <!-- Final Answer Block -->
      <div 
        v-if="cleanContent || (message.attachments && message.attachments.length > 0) || isStreamingCurrent"
        class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-2xl rounded-tl-xs px-4 sm:px-5 py-4 text-[var(--arc-text-primary)] relative overflow-hidden transition-shadow duration-300"
        :class="isLast ? 'shadow-[0_4px_24px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]' : 'shadow-[0_4px_16px_rgba(0,0,0,0.5)]'"
      >
        <div class="absolute top-0 left-0 w-full h-[1px] bg-[var(--arc-hairline-top)] pointer-events-none"></div>

        <!-- Floating Action Toolbar on Hover (Offset to top-right without overlapping text) -->
        <div class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-full px-1.5 py-0.5 shadow-xl z-20 pointer-events-auto">
          <button 
            @click="handleManualSpeak"
            class="p-1 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer flex items-center justify-center"
            title="Озвучить ответ"
          >
            <Volume2 class="w-3.5 h-3.5" />
          </button>
          <button 
            v-if="isLast"
            @click="$emit('regenerate', message.id)"
            class="p-1 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer flex items-center justify-center"
            title="Перегенерировать ответ"
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </button>
          <button 
            @click="copyText(cleanContent)"
            class="p-1 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer flex items-center justify-center"
            :title="copied ? 'Скопировано!' : 'Копировать ответ'"
          >
            <Check v-if="copied" class="w-3.5 h-3.5 text-[var(--status-ok)]" />
            <Copy v-else class="w-3.5 h-3.5" />
          </button>
          <button 
            @click="$emit('delete', message.id)"
            class="p-1 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-hint)] hover:text-[var(--status-err)] transition-colors cursor-pointer flex items-center justify-center"
            title="Удалить сообщение"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- AI Message Attachments -->
        <div v-if="message.attachments && message.attachments.length > 0" class="flex flex-wrap gap-2 mb-2.5 relative z-10">
          <div 
            v-for="(att, idx) in message.attachments" 
            :key="idx"
            class="flex items-center gap-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-xl p-1.5 pr-3 text-xs max-w-full group/att"
          >
            <div 
              v-if="isImage(att)" 
              class="w-10 h-10 rounded-lg overflow-hidden shrink-0 cursor-pointer bg-[var(--arc-code)] border border-[var(--arc-hairline)]"
              @click="previewImage(att)"
            >
              <img :src="att.dataUrl || att.content" class="w-full h-full object-cover" :alt="att.name" />
            </div>
            <div v-else class="w-8 h-8 rounded-lg bg-[var(--arc-block)] flex items-center justify-center shrink-0 text-[10px] font-mono font-bold text-[var(--arc-text-secondary)]">
              {{ getFileExt(att.name) }}
            </div>
            <div class="flex flex-col min-w-0 flex-1">
              <span class="text-xs text-[var(--arc-text-primary)] font-medium truncate font-sans" :title="att.name">{{ att.name }}</span>
              <span class="text-[10px] text-[var(--arc-text-machine)] font-mono">{{ formatFileSize(att.size) }}</span>
            </div>
            <button 
              v-if="att.dataUrl || att.content"
              @click="downloadFile(att)"
              class="p-1.5 rounded-full text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors ml-1 cursor-pointer"
              title="Скачать файл"
            >
              <Download class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Formatted Markdown Content (Human Layer: 14px, relaxed leading) -->
        <div 
          class="leading-relaxed break-words font-sans relative z-10 text-sm text-[var(--arc-text-primary)] markdown-content"
        >
          <!-- Animated Modern Cyber-HUD telemetry wave & stopwatch while waiting for the first token -->
          <CyberWaitingIndicator 
            v-if="isStreamingCurrent && (!cleanContent || cleanContent === '...')" 
            :is-searching="Boolean(message.toolSource || isSearchingActive)"
          />

          <span v-else v-html="parsedContent"></span>
          <span 
            v-if="isStreamingCurrent && cleanContent && cleanContent !== '...'" 
            class="inline-block w-1.5 h-4 bg-[var(--arc-text-primary)] opacity-70 animate-pulse ml-0.5 align-middle"
          ></span>
        </div>
        
        <!-- Footer: Tool Sources & Meta Badge -->
        <MessageFooter 
          v-if="!isStreamingCurrent"
          :meta="message.meta" 
          :tool-source="message.toolSource" 
        />
      </div>
    </div>

    <!-- 3. SYSTEM STATUS / ERROR BLOCK -->
    <div 
      v-else-if="message.role === 'system' || message.blockType === 'system_status'"
      class="flex flex-col self-center max-w-[90%] my-1 text-xs w-full"
    >
      <div 
        class="px-3.5 py-2.5 rounded-xl border flex flex-col gap-2 transition bg-[var(--arc-block)]"
        :class="isErrorStatus ? 'border-[var(--status-err)] text-[var(--arc-text-primary)]' : 'border-[var(--arc-hairline)] text-[var(--arc-text-secondary)]'"
      >
        <div class="flex items-start gap-2.5">
          <AlertCircle v-if="isErrorStatus" class="w-4 h-4 text-[var(--status-err)] shrink-0 mt-0.5" />
          <Info v-else class="w-4 h-4 text-[var(--status-info)] shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0 flex flex-col gap-1.5">
            <span class="font-sans leading-relaxed break-words text-[var(--arc-text-primary)]">
              {{ cleanContent }}
            </span>
            <div v-if="isErrorStatus" class="flex items-center gap-2 mt-1 pt-1.5 border-t border-[var(--arc-divider)]">
              <button 
                type="button"
                @click.stop="$emit('retry-step', message.id)"
                class="px-3 py-1 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--status-err)] text-[var(--status-err)] font-sans text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition active:scale-95"
                title="Повторить запрос"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>Повторить</span>
              </button>
              <button 
                type="button"
                @click.stop="openProviderSettings"
                class="px-3 py-1 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] font-sans text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition active:scale-95"
                title="Перейти в настройки AI-провайдеров"
              >
                <Settings class="w-3.5 h-3.5" />
                <span>Настройки провайдера</span>
              </button>
            </div>
          </div>
        </div>
        <MessageFooter :meta="message.meta || { source: 'system' }" />
      </div>
    </div>

    <!-- Image Lightbox Modal -->
    <Teleport to="body">
      <div 
        v-if="activePreviewImage" 
        class="fixed inset-0 z-50 arc-glass-veil flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
        @click="activePreviewImage = null"
      >
        <div class="relative max-w-4xl max-h-[90vh] flex flex-col items-center gap-3" @click.stop>
          <img 
            :src="activePreviewImage.dataUrl || activePreviewImage.content" 
            class="max-w-full max-h-[80vh] rounded-2xl border border-[var(--arc-hairline)] shadow-2xl object-contain" 
            :alt="activePreviewImage.name" 
          />
          <div class="flex items-center justify-between w-full px-2 text-[var(--arc-text-secondary)] text-xs font-sans">
            <span class="font-medium truncate">{{ activePreviewImage.name }} ({{ formatFileSize(activePreviewImage.size) }})</span>
            <button 
              @click="activePreviewImage = null"
              class="px-4 py-1.5 bg-white/5 hover:bg-[var(--arc-hover)] rounded-full text-[var(--arc-text-primary)] text-xs transition-colors cursor-pointer border border-[var(--arc-hairline)]"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Message, FileAttachment } from '../../../../shared/types/models/chat';
import { Copy, Check, Download, Trash2, RotateCcw, Volume2, AlertCircle, Info, Settings } from 'lucide-vue-next';
import { useUIStore } from '../../../stores/ui.store';
import { useSettingsNav } from '../../settings/composables/useSettingsNav';
import { parseMarkdown, sanitizeRawContent, extractTextForTTS } from '../utils/markdown';
import ExecutionTrace from './ExecutionTrace.vue';
import ValidatorRejectionCard from './ValidatorRejectionCard.vue';
import MessageFooter from './MessageFooter.vue';
import CyberWaitingIndicator from './CyberWaitingIndicator.vue';
const props = defineProps<{ message: Message; isLast?: boolean; isStreaming?: boolean; isSearching?: boolean }>();
const emit = defineEmits<{ (e: 'delete', id: string): void; (e: 'regenerate', id: string): void; (e: 'speak', text: string): void; (e: 'retry-step', id: string): void; (e: 'refine-step', id: string): void; }>();
const uiStore = useUIStore();
const activePreviewImage = ref<FileAttachment | null>(null);
const copied = ref(false);

const handleManualSpeak = () => {
  if (typeof window !== 'undefined' && window.api && typeof window.api.onTtsMeta === 'function') {
    const unsub = window.api.onTtsMeta((data) => {
      if (data?.engine) props.message.meta = { ...(props.message.meta || { source: 'system' }), ttsEngine: data.engine, ttsCached: Boolean(data.isCached) };
      unsub();
    });
    setTimeout(() => unsub(), 15000);
  }
  emit('speak', speakableContent.value);
};

const openProviderSettings = () => {
  uiStore.setActiveTab('settings');
  useSettingsNav().navigateToSection('intelligence', 'section-providers');
};

const isStreamingCurrent = computed(() => Boolean(props.isLast && props.isStreaming));
const isSearchingActive = computed(() => Boolean(props.isSearching || uiStore.timelineStep === 'TOOL_API'));

const realExecutionSteps = computed(() => {
  if (!props.message.executionSteps || props.message.executionSteps.length === 0) return [];
  const internalSyntheticIds = new Set(['step-plan', 'step-exec', 'step-val', 'step-validate']);
  const internalExecutors = new Set(['planner', 'executor', 'validator', 'a.r.c. validator', 'a.r.c. core', 'a.r.c. cognitive kernel', 'локальный ответ']);
  const syntheticRegex = /анализ директивы|построение плана|синтез ответа|синтез и структурирование|проверка валидатор|валидация точности/i;
  return props.message.executionSteps.filter((step: any) => {
    if (step.id && internalSyntheticIds.has(step.id.toLowerCase())) return false;
    const executor = (step.executor || '').toLowerCase().trim();
    if (internalExecutors.has(executor)) return false;
    const text = `${step.description || ''} ${step.title || ''} ${step.name || ''}`;
    if (syntheticRegex.test(text) && !step.tool && !step.toolSource && step.id !== 'step-tool') return false;
    const isExplicitTool = step.id === 'step-tool' || Boolean(step.tool) || Boolean(step.toolSource);
    return isExplicitTool || Boolean(executor && !internalExecutors.has(executor));
  });
});

const isRealToolExecution = computed(() => Boolean(props.message.toolSource || realExecutionSteps.value.length > 0));
const isErrorStatus = computed(() => props.message.statusType === 'error' || props.message.blockType === 'system_status' || /ошибка|сбой|error|failed/i.test(props.message.content || ''));

const copyText = async (text: string) => {
  if (!text) return;
  const showTooltip = () => { copied.value = true; uiStore.showToast('Скопировано', 'success'); setTimeout(() => { copied.value = false; }, 2000); };
  try {
    const fn = (window as any).api?.writeClipboard || (window as any).api?.clipboard?.writeText;
    if (typeof fn === 'function' && (await fn(text)) !== false) return showTooltip();
    if (navigator?.clipboard) { await navigator.clipboard.writeText(text); return showTooltip(); }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const ok = document.execCommand('copy');
    textArea.remove();
    if (ok) showTooltip(); else uiStore.showToast('Не удалось скопировать', 'error');
  } catch {
    uiStore.showToast('Не удалось скопировать', 'error');
  }
};
const isImage = (att: FileAttachment) => {
  if (att.type?.startsWith('image/')) return true;
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(att.name?.split('.').pop()?.toLowerCase() || '');
};
const getFileExt = (name: string) => {
  const ext = name.split('.').pop()?.toUpperCase();
  return ext && ext.length <= 4 ? ext : 'DOC';
};
const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
const previewImage = (att: FileAttachment) => { activePreviewImage.value = att; };
const downloadFile = (att: FileAttachment) => {
  try {
    const link = document.createElement('a');
    link.download = att.name;
    if (att.dataUrl) link.href = att.dataUrl;
    else if (att.content) {
      link.href = URL.createObjectURL(new Blob([att.content], { type: att.type || 'text/plain;charset=utf-8' }));
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error('Failed to download file attachment', e);
  }
};
const cleanContent = computed(() => sanitizeRawContent(props.message.content));
const speakableContent = computed(() => extractTextForTTS(cleanContent.value) || (cleanContent.value ? 'Блок кода опущен.' : ''));
const parsedContent = ref("");
let lastParseTime = 0, parseTimer: any = null;
watch(() => cleanContent.value, (newVal) => {
  if (!newVal) { parsedContent.value = ""; return; }
  if (!props.isLast) { parsedContent.value = parseMarkdown(newVal); return; }
  const now = Date.now();
  if (now - lastParseTime > 100) {
    parsedContent.value = parseMarkdown(newVal);
    lastParseTime = now;
  } else {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => { parsedContent.value = parseMarkdown(newVal); lastParseTime = Date.now(); }, 100);
  }
}, { immediate: true });
</script>
