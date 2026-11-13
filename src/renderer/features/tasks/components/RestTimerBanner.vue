<template>
  <transition name="slide-down">
    <div 
      v-if="restTimeRemaining > 0" 
      class="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg"
    >
      <div class="p-3 bg-[var(--arc-block)] border border-[var(--status-warn)] rounded-2xl shadow-2xl">
        <div class="flex items-center justify-between gap-3 text-[var(--arc-text-primary)]">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex items-center justify-center shrink-0">
              <Flame class="w-5 h-5 text-[var(--status-warn)] animate-pulse" />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] font-mono uppercase tracking-wider text-[var(--status-warn)] font-semibold flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
                ТАЙМЕР ОТДЫХА МЕЖДУ ПОДХОДАМИ
              </span>
              <span class="text-xs font-mono font-medium text-[var(--arc-text-secondary)] truncate">
                {{ activeRestSubtaskName || 'Отдых перед следующим шагом' }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xl md:text-2xl font-mono font-bold text-[var(--status-warn)] tracking-wider">
              {{ formattedTime }}
            </span>
            <button 
              @click="tasksStore.toggleRestTimer()"
              class="p-2 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] text-[var(--status-warn)] border border-[var(--arc-hairline)] transition cursor-pointer"
            >
              <Pause v-if="isRestRunning" class="w-4 h-4" />
              <Play v-else class="w-4 h-4" />
            </button>
            <button 
              @click="tasksStore.adjustRestTime(15)"
              class="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[10px] font-mono font-bold text-[var(--arc-text-primary)] transition cursor-pointer"
            >
              +15с
            </button>
            <button 
              @click="tasksStore.stopRestTimer()"
              class="p-2 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--status-err)] border border-[var(--arc-hairline)] transition cursor-pointer"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Flame, Play, Pause, X } from 'lucide-vue-next';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';

const tasksStore = useTasksStore();
const { restTimeRemaining, isRestRunning, activeRestSubtaskName } = storeToRefs(tasksStore);

const formattedTime = computed(() => {
  const m = Math.floor(restTimeRemaining.value / 60);
  const s = restTimeRemaining.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});
</script>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
