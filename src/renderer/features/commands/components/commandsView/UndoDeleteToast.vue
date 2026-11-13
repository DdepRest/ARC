<template>
  <div 
    v-if="lastDeletedMacro" 
    class="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 arc-glass-pop border border-[var(--arc-hairline)] rounded-[var(--arc-radius-row,12px)] px-4 py-3 shadow-[var(--arc-glass-edge)] flex items-center gap-3.5 animate-fade-in-up min-w-[320px] max-w-md overflow-hidden select-none"
  >
    <div class="flex items-center gap-2.5 flex-1 min-w-0">
      <div class="w-2 h-2 rounded-full bg-[var(--status-warn)] animate-pulse shrink-0"></div>
      <p class="text-xs font-sans text-[var(--arc-text-primary)] leading-normal truncate">
        Макрос <span class="font-mono text-xs text-[var(--arc-text-primary)] bg-[var(--arc-hover)] px-1.5 py-0.5 rounded border border-[var(--arc-hairline)]">{{ lastDeletedMacro.title }}</span> удален
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button 
        @click="$emit('undoDelete')" 
        class="px-2.5 py-1 bg-[var(--arc-hover)] hover:brightness-125 border border-[var(--arc-hairline)] text-[var(--status-warn)] rounded-[var(--arc-radius-btn,8px)] font-sans text-xs font-medium transition cursor-pointer active:scale-95 duration-150"
      >
        Отменить
      </button>
      <button 
        @click="$emit('finalizeDelete')" 
        class="p-1 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] rounded transition-colors cursor-pointer"
        title="Закрыть"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
    <!-- Thin shrinking progress countdown bar -->
    <div class="absolute bottom-0 left-0 h-[2px] bg-[var(--status-warn)] animate-shrink-width rounded-b-[var(--arc-radius-row,12px)]"></div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';

defineProps<{
  lastDeletedMacro: { id: string; data: any; title: string; timer: any } | null;
}>();

defineEmits<{
  (e: 'undoDelete'): void;
  (e: 'finalizeDelete'): void;
  (e: 'update:lastDeletedMacro', val: any): void;
}>();
</script>

<style scoped>
@keyframes shrink {
  from { width: 100%; }
  to { width: 0%; }
}
.animate-shrink-width {
  animation: shrink 4s linear forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translate(-50%, 1rem);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
.animate-fade-in-up {
  animation: fadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
