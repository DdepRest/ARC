<script setup lang="ts">
import ReactorCore from '../components/reactor/ReactorCore.vue';
import StatusOverlay from '../components/overlay/StatusOverlay.vue';
import ChatView from '../features/chat/components/ChatView.vue';
import { useUIStore } from '../stores/ui.store';
import { useKeyboard } from '../composables/useKeyboard';
import { useReactor } from '../composables/useReactor';

const uiStore = useUIStore();
const reactor = useReactor();

const exitFocusMode = () => {
  uiStore.toggleFocusMode();
};

const startListening = () => {
  reactor.startListening();
};

const stopListening = () => {
  if (uiStore.isListening) {
    reactor.stopListening();
  }
};

useKeyboard({
  'Escape': () => {
    exitFocusMode();
  },
  'Space': (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    startListening();
  },
  'Space:up': (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    stopListening();
  }
});
</script>

<template>
  <div class="h-full w-full relative overflow-hidden bg-black flex flex-col items-center">
    <!-- Reactor full bleed -->
    <div class="absolute inset-0 z-0 cursor-default scale-90 mt-[-100px]" @dblclick="exitFocusMode">
      <ReactorCore class="pointer-events-none" />
    </div>

    <!-- Visual Overlays -->
    <div class="terminal-overlay" style="z-index: 0;"></div>
    <div class="noise-overlay" style="z-index: 1;"></div>

    <!-- Top nav -->
    <div class="z-20 w-full p-6 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
      <div>
        <StatusOverlay class="!p-3" />
      </div>
      <button 
        @click="exitFocusMode"
        class="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] transition group cursor-pointer"
        :style="{ backgroundImage: 'var(--arc-sheen)' }"
        title="Выйти из минимального режима"
      >
        <span class="text-xs font-mono tracking-widest text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)] transition-colors uppercase">STD_MD</span>
        <div class="w-2 h-2 rounded-full border border-[var(--arc-hairline)] group-hover:bg-[var(--accent)] transition"></div>
      </button>
    </div>

    <div class="z-10 flex-1 w-full max-w-sm flex items-center justify-center p-4">
      <ChatView class="h-full w-full max-h-[600px] border-none shadow-none glass-panel-none bg-transparent !p-0" />
    </div>

    <!-- Bottom Interactive Dock -->
    <div class="z-10 p-6 w-full max-w-sm">
      <div class="pointer-events-auto w-full glass-panel rounded-2xl h-16 flex flex-col items-center justify-center relative shadow-2xl mix-blend-plus-lighter border border-[var(--border)] overflow-hidden group">
        <button 
          class="absolute inset-0 w-full h-full flex flex-col items-center justify-center pt-1 hover:bg-[var(--arc-hover)] transition duration-300 cursor-pointer"
          @mousedown="startListening" 
          @mouseup="stopListening"
          @mouseleave="stopListening"
        >
          <div class="flex items-center gap-3">
            <div 
              class="w-2 h-2 rounded-full transition duration-500" 
              :class="uiStore.isListening ? 'bg-white shadow-[0_0_12px_rgba(255,255,255,1)] scale-150' : 'bg-[var(--status-off)] group-hover:bg-white'"
            ></div>
            <span class="font-sans text-xs tracking-[0.2em] font-medium transition-colors duration-300 uppercase" 
                  :class="uiStore.isListening ? 'text-white' : 'text-[var(--arc-text-secondary)] group-hover:text-white'">
              {{ uiStore.isListening ? 'СЛУШАЮ...' : 'НАЖМИТЕ ДЛЯ СВЯЗИ' }}
            </span>
          </div>

          <!-- Cinematic Text output right below when AI talks -->
          <div class="mt-1 flex items-center justify-center" v-if="!uiStore.isListening && uiStore.reactorState !== 'idle'">
             <span class="text-xs font-sans tracking-wide text-[var(--arc-text-primary)]">
                <span class="text-white font-medium mr-2 uppercase tracking-widest text-xs">A.R.C. Core</span>
                <span class="text-[var(--dim)] italic">{{ uiStore.reactorState === 'processing' ? 'Адаптация алгоритмов...' : 'Передача данных...' }}</span>
             </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
