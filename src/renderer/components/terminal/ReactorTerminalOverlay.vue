<template>
  <Transition name="fade-slide">
    <div 
      v-if="terminalStore.isTerminalVisible" 
      class="fixed right-6 bottom-24 w-[440px] max-h-[60vh] bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[16px] overflow-hidden flex flex-col z-40 font-mono text-xs"
      :style="{
        background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 64px rgba(0, 0, 0, 0.85)'
      }"
    >
      <!-- Header -->
      <div 
        class="flex items-center justify-between px-4 py-2.5 border-b border-[var(--arc-divider)] bg-[var(--arc-plane)]"
        :style="{ backgroundImage: 'var(--arc-sheen)' }"
      >
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></div>
          <span class="text-[var(--arc-text-primary)] font-bold uppercase tracking-wider text-xs">A.R.C. SYS_LOG</span>
        </div>
        <div class="flex items-center gap-1.5">
          <!-- Filters -->
          <button 
            v-for="f in filters" 
            :key="f"
            @click="terminalStore.setFilter(f)"
            class="text-xs uppercase px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer"
            :class="terminalStore.filter === f ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border border-[var(--arc-border-focus,var(--arc-hairline))]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            {{ f }}
          </button>
          
          <button @click="terminalStore.clearLogs" class="text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors ml-2 cursor-pointer" title="Clear">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button @click="terminalStore.toggleTerminal" class="text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Log List -->
      <div class="flex-1 overflow-y-auto p-3.5 space-y-2" ref="logsContainer">
        <div 
          v-for="log in terminalStore.filteredLogs" 
          :key="log.id"
          class="flex flex-col gap-0.5 break-words"
        >
          <div class="flex items-start gap-2">
            <span class="text-[var(--arc-text-muted)] text-xs shrink-0 mt-0.5 tabular-nums">[{{ formatTime(log.timestamp) }}]</span>
            <span 
              class="font-bold text-xs uppercase shrink-0 mt-0.5"
              :class="getLevelColor(log.level)"
            >
              {{ log.level }}
            </span>
            <span class="text-[var(--arc-text-primary)] whitespace-pre-wrap leading-relaxed">{{ log.message }}</span>
          </div>
          <div 
            v-if="log.details" 
            class="ml-14 mt-1 p-2.5 bg-[var(--arc-input)] rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] overflow-x-auto text-xs"
            :style="{ boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7)' }"
          >
            <pre>{{ formatDetails(log.details) }}</pre>
          </div>
        </div>
        <div v-if="terminalStore.filteredLogs.length === 0" class="text-center text-[var(--arc-text-muted)] py-4 italic">
          No logs matching current filter.
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useTerminalStore, type LogLevel } from '../../stores/terminal.store';

const terminalStore = useTerminalStore();
const logsContainer = ref<HTMLElement | null>(null);

const filters: (LogLevel | 'ALL')[] = ['ALL', 'INFO', 'VOICE', 'EXEC', 'WARN', 'ERROR'];

watch(() => terminalStore.filteredLogs.length, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  });
});

const formatTime = (rawTime: Date | string | number | undefined | null) => {
  if (!rawTime) return '--:--:--.000';
  try {
    const d = rawTime instanceof Date ? rawTime : new Date(rawTime);
    if (!d || isNaN(d.getTime())) return typeof rawTime === 'string' ? rawTime : '--:--:--.000';
    const timeStr = typeof d.toLocaleTimeString === 'function'
      ? d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--:--:--';
    const ms = typeof d.getMilliseconds === 'function' ? d.getMilliseconds().toString().padStart(3, '0') : '000';
    return `${timeStr}.${ms}`;
  } catch {
    return '--:--:--.000';
  }
};

const getLevelColor = (level: LogLevel) => {
  switch (level) {
    case 'INFO': return 'text-[var(--arc-text-secondary)]';
    case 'VOICE': return 'text-[var(--status-ok)]';
    case 'EXEC': return 'text-[var(--accent)]';
    case 'WARN': return 'text-[var(--status-warn)]';
    case 'ERROR': return 'text-[var(--status-err)]';
    default: return 'text-[var(--arc-text-muted)]';
  }
};

const formatDetails = (details: any) => {
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
};
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>
