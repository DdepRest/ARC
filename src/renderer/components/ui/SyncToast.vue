<template>
  <transition name="toast-slide">
    <div 
      v-if="settingsStore.lastChangedToastVisible && settingsStore.lastChangedState"
      class="fixed bottom-6 right-6 z-[200000] flex items-center gap-4 px-4 py-3 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[16px] text-[var(--arc-text-primary)] font-sans pointer-events-auto"
      :style="{
        background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 40px rgba(0, 0, 0, 0.85)'
      }"
    >
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]"></span>
        <span class="text-xs font-bold uppercase tracking-widest text-[var(--accent)] font-mono">✦ SYNCED</span>
      </div>

      <div class="h-4 w-[1px] bg-[var(--arc-divider)]"></div>

      <div class="text-xs text-[var(--arc-text-primary)] font-medium max-w-[200px] truncate">
        {{ settingsStore.lastChangedState.label }}
      </div>

      <button
        @click="settingsStore.lastChangedState.undo()"
        class="ml-2 px-3 py-1 text-xs font-medium theme-accent-btn rounded-full transition duration-200 cursor-pointer flex items-center gap-1 active:scale-95 shrink-0"
      >
        <Undo2 class="w-3 h-3" />
        <span>{{ settingsStore.language === 'EN' ? 'Undo' : 'Отменить' }}</span>
      </button>

      <button
        @click="settingsStore.dismissSyncToast()"
        class="text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors p-1 rounded-full hover:bg-[var(--arc-hover)] cursor-pointer"
        title="Close"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { Undo2, X } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
</script>

<style scoped>
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>
