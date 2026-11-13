<template>
  <div 
    class="flex h-full w-full max-w-full mx-auto z-10 overflow-hidden relative select-none bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[16px]"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Drag-and-Drop Global Dropzone Overlay -->
    <div 
      v-if="isDraggingOver" 
      class="absolute inset-0 z-50 arc-glass-veil border-2 border-dashed border-[var(--arc-hairline)] rounded-2xl m-3 flex flex-col items-center justify-center gap-3 transition animate-in fade-in duration-200 pointer-events-none"
    >
      <div class="w-16 h-16 rounded-2xl bg-[var(--arc-block)] flex items-center justify-center text-[var(--arc-text-primary)] shadow-2xl border border-[var(--arc-hairline)]">
        <UploadCloud class="w-8 h-8 text-[var(--accent)] animate-bounce" />
      </div>
      <div class="text-base font-semibold text-[var(--arc-text-primary)] font-sans">Перетащите файлы для отправки в A.R.C.</div>
      <div class="text-xs text-[var(--arc-text-hint)] font-sans">Поддерживаются исходный код, текст, изображения и технические документы</div>
    </div>

    <!-- Sidebar with Date-Grouped Dialogs -->
    <SessionSidebar />
    
    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col p-2 md:p-4 relative min-w-0 bg-[var(--arc-plane)]">
      <!-- Real-time Agent Status Bar (Planning -> Executing -> Validating -> Ready) -->
      <ChatStatusBar 
        :status="agentStatus"
        :action-text="agentActionText"
        :model-name="activeProviderInfo?.name"
        :is-local="settingsStore.useLocalLLM"
        class="mb-2.5"
      />

      <!-- Messages List -->
      <div class="flex-1 overflow-y-auto pr-2 md:pr-4 mb-3 flex flex-col custom-chat-scrollbar" ref="messageContainer">
        <!-- Centered message flow with comfortable max-w-4xl reading boundary -->
        <div class="w-full max-w-4xl mx-auto flex flex-col gap-4 flex-1">
          <!-- Empty Welcome Screen if no messages -->
          <div v-if="messages.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--arc-text-hint)] gap-4 select-none my-auto max-w-xl mx-auto">
            <div 
              class="w-14 h-14 rounded-2xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-primary)]"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.5)' }"
            >
              <Sparkles class="w-7 h-7 text-[var(--accent)]" />
            </div>
            <div class="flex flex-col gap-1.5 mt-2">
              <h3 class="font-sans font-bold text-lg text-[var(--arc-text-primary)]">Когнитивный канал открыт</h3>
              <p class="font-sans text-xs text-[var(--arc-text-hint)] leading-relaxed max-w-md mx-auto">А.Р.К. готов к выполнению задач. Вы можете отправлять код, тексты, изображения или использовать голосовой ввод (SPACE) для взаимодействия.</p>
            </div>

            <!-- Interactive Quick Starter Chips -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full mt-6">
              <button
                v-for="(chip, index) in promptChips"
                :key="index"
                @click="usePromptChip(chip.prompt)"
                class="p-3 rounded-xl bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] active:scale-[0.98] border border-[var(--arc-hairline)] hover:border-[var(--arc-divider)] transition text-left flex items-start gap-2.5 group cursor-pointer"
                :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
              >
                <component :is="chip.icon" class="w-4 h-4 mt-0.5 text-[var(--arc-text-hint)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
                <div class="flex flex-col min-w-0 gap-0.5">
                  <span class="text-xs font-medium text-[var(--arc-text-primary)] font-sans truncate">{{ chip.title }}</span>
                  <span class="text-xs text-[var(--arc-text-hint)] font-sans line-clamp-1">{{ chip.subtitle }}</span>
                </div>
              </button>
            </div>
          </div>

          <MessageBubble 
            v-for="(msg, idx) in messages" 
            :key="msg.id" 
            :message="msg" 
            :is-last="idx === messages.length - 1"
            @delete="handleDeleteMessage"
            @regenerate="handleRegenerate"
            @speak="handleSpeak"
            @retry-step="handleRetryDirective"
            @refine-step="handleRefineDirective"
          />

          <!-- Active Streaming Bubble (Unified Message Surface - No Layout Shift) -->
          <MessageBubble
            v-if="chatStore.isStreaming && !chatStore.isSearching"
            :message="streamingVirtualMessage"
            :is-last="true"
            :is-streaming="true"
          />
          
          <!-- Searching State Indicator -->
          <div v-if="chatStore.isSearching" class="self-start max-w-[85%] mr-12 flex flex-col gap-1 relative z-10">
            <div class="px-4 py-2.5 rounded-2xl rounded-tl-xs bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center gap-2.5 relative">
              <Search class="w-3.5 h-3.5 text-[var(--status-info)] animate-pulse" />
              <span class="text-xs text-[var(--arc-text-secondary)] font-sans tracking-wide">Поиск в источниках...</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Input and Attachment Box -->
      <ChatInputZone 
        v-model="input" 
        v-model:files="attachedFiles"
        @send="handleSend"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SessionSidebar from './SessionSidebar.vue';
import ChatInputZone from './ChatInputZone.vue';
import MessageBubble from './MessageBubble.vue';
import ChatStatusBar from './ChatStatusBar.vue';
import { useSessionsStore } from '../stores/sessions.store';
import { ref, onUpdated, nextTick, computed, onMounted } from 'vue';
import { useChat } from '../composables/useChat';
import { useChatSession } from '../composables/useChatSession';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useUIStore } from '../../../stores/ui.store';
import { useChatStore } from '../stores/chat.store';
import { useAiConfigStore } from '../../../stores/aiConfig';
import { useComposerModels } from '../composables/useComposerModels';
import { logger } from '../../../utils/logger';
import type { FileAttachment } from '../../../../shared/types/models/chat';
import { UploadCloud, Sparkles, Search, Zap, Cpu, FileText, Activity } from 'lucide-vue-next';

useChatSession();
const { messages, sendMessage, agentStatus, agentActionText } = useChat();
const chatStore = useChatStore();
const sessionsStore = useSessionsStore();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const aiConfigStore = useAiConfigStore();
const { activeModel, autoMode, mode } = useComposerModels();

const input = ref('');
const messageContainer = ref<HTMLElement | null>(null);
const attachedFiles = ref<FileAttachment[]>([]);
const isDraggingOver = ref(false);

const streamingVirtualMessage = computed(() => {
  return {
    id: 'streaming-active-message',
    role: 'assistant' as const,
    blockType: 'final_answer' as const,
    timestamp: Date.now(),
    content: chatStore.currentResponse || '...',
    executionSteps: chatStore.activeExecutionSteps,
    providerName: activeProviderInfo.value?.name
  };
});

const promptChips = [
  {
    icon: Activity,
    title: 'Экспресс-аудит системы',
    subtitle: 'Анализ текущей производительности и FPS',
    prompt: 'Проведи экспресс-аудит текущей производительности и дай рекомендации по оптимизации.'
  },
  {
    icon: Cpu,
    title: 'Анализ архитектуры',
    subtitle: 'Структура компонентов и модулей A.R.C.',
    prompt: 'Проанализируй архитектуру компонентов и структуру модулей A.R.C. в текущей кодовой базе.'
  },
  {
    icon: Zap,
    title: 'Оптимизация реактора',
    subtitle: 'Улучшение энергоэффективности и шейдеров',
    prompt: 'Предложи варианты оптимизации параметров реактора, WebGL эффектов и расхода ресурсов.'
  },
  {
    icon: FileText,
    title: 'Создание директивы',
    subtitle: 'Формирование плана и этапов работы',
    prompt: 'Сформируй техническую директиву с четкими этапами выполнения для следующей задачи.'
  }
];

const usePromptChip = (chipPrompt: string) => {
  input.value = chipPrompt;
  handleSend();
};

onMounted(async () => {
  if (aiConfigStore.providers.length === 0) {
    aiConfigStore.loadProviders();
  }
  if (sessionsStore.sessions.length === 0) {
    await sessionsStore.loadSessions();
    if (sessionsStore.sessions.length === 0) {
      await sessionsStore.createSession('Новый диалог');
    }
  }
  nextTick(scrollToBottom);
});

const activeProviderInfo = computed(() => {
  if (autoMode.value) {
    return {
      name: `Auto · ${mode.value}`,
      model: 'smart-router'
    };
  }
  if (activeModel.value) {
    return {
      name: `${activeModel.value.name} · ${activeModel.value.effort} (${mode.value})`,
      model: activeModel.value.modelKey
    };
  }
  return null;
});

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const processSelectedFiles = async (fileList: FileList | File[]) => {
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;

    const attachment: FileAttachment = {
      name: file.name,
      size: file.size,
      type: file.type
    };

    if (file.type.startsWith('image/')) {
      const dataUrl = await readFileAsDataURL(file);
      attachment.dataUrl = dataUrl;
    } else {
      if (file.size <= 2 * 1024 * 1024) {
        try {
          const textContent = await readFileAsText(file);
          attachment.content = textContent;
        } catch (e) {
          console.warn('[A.R.C] Handled silent error:', e);
        }
      }
    }

    attachedFiles.value.push(attachment);
  }
};

const onDragOver = (e: DragEvent) => {
  e.dataTransfer!.dropEffect = 'copy';
  isDraggingOver.value = true;
};

const onDragLeave = () => {
  isDraggingOver.value = false;
};

const onDrop = (e: DragEvent) => {
  isDraggingOver.value = false;
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processSelectedFiles(e.dataTransfer.files);
  }
};

const handleSend = () => {
  const text = input.value;
  const files = [...attachedFiles.value];

  if (!text.trim() && files.length === 0) return;

  input.value = '';
  attachedFiles.value = [];
  sendMessage(text, files.length > 0 ? files : undefined);
};

const handleDeleteMessage = (id: string) => {
  chatStore.deleteMessage(id);
};

const handleRegenerate = (id: string) => {
  const idx = chatStore.messages.findIndex((m: any) => m.id === id);
  if (idx > 0 && chatStore.messages[idx].role === 'assistant') {
    let userMsg = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (chatStore.messages[i].role === 'user') {
        userMsg = chatStore.messages[i];
        break;
      }
    }
    
    if (userMsg) {
      chatStore.markAsRetried(id);
      sendMessage(userMsg.content, userMsg.attachments, false, true);
    }
  }
};

const handleRetryDirective = (arg?: any) => {
  const id = typeof arg === 'string' ? arg : arg?.id || arg?.messageId;
  logger.info(`[Chat] Retry directive triggered for ${id || 'latest'}`);
  let userMsg = null;
  if (id) {
    const idx = chatStore.messages.findIndex((m: any) => m.id === id);
    if (idx >= 0) {
      for (let i = idx; i >= 0; i--) {
        if (chatStore.messages[i].role === 'user') { userMsg = chatStore.messages[i]; break; }
      }
    }
  }
  if (!userMsg) {
    for (let i = chatStore.messages.length - 1; i >= 0; i--) {
      if (chatStore.messages[i].role === 'user') { userMsg = chatStore.messages[i]; break; }
    }
  }
  if (userMsg) {
    if (id) chatStore.deleteMessage(id);
    sendMessage(userMsg.content, userMsg.attachments, false, true);
  }
};

const handleRefineDirective = (arg?: any) => {
  const id = typeof arg === 'string' ? arg : arg?.id || arg?.messageId;
  logger.info(`[Chat] Refine directive triggered for ${id || 'latest'}`);
  let userMsg = null;
  if (id) {
    const idx = chatStore.messages.findIndex((m: any) => m.id === id);
    if (idx >= 0) {
      for (let i = idx; i >= 0; i--) {
        if (chatStore.messages[i].role === 'user') { userMsg = chatStore.messages[i]; break; }
      }
    }
  }
  if (!userMsg) {
    for (let i = chatStore.messages.length - 1; i >= 0; i--) {
      if (chatStore.messages[i].role === 'user') { userMsg = chatStore.messages[i]; break; }
    }
  }
  if (userMsg) {
    input.value = userMsg.content;
    nextTick(() => {
      const ta = document.querySelector('textarea');
      if (ta) { ta.focus(); ta.select(); }
    });
  }
};

const handleSpeak = (text: string) => {
  if (window.api && typeof (window as any).api.stopSpeak === 'function') {
    (window as any).api.stopSpeak().catch(() => {});
  } else {
    window.speechSynthesis.cancel();
  }
  uiStore.speak(text, undefined, { force: true });
};

const scrollToBottom = () => {
  if (messageContainer.value) messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
};

onUpdated(() => { nextTick(scrollToBottom); });
defineExpose({ handleRetryDirective, handleRefineDirective });
</script>

<style scoped>
.custom-chat-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-chat-scrollbar::-webkit-scrollbar-thumb { background: var(--arc-hairline); border-radius: 4px; }
.custom-chat-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--arc-border); }
</style>
