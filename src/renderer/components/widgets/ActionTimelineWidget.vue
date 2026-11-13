<template>
  <ArcHudWidget status="ok" status-title="Журнал событий ядра">
    <div class="flex flex-col gap-2.5 py-0.5 select-none font-mono">
      <!-- Header Bar: СОБЫТИЯ (чистый приборный заголовок с живым индикатором) -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="text-[13px] font-semibold text-white tracking-tight uppercase">СОБЫТИЯ</span>
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)] animate-pulse shrink-0"></span>
        </div>
        <span class="text-[10px] text-[var(--arc-text-hint)] uppercase">
          {{ liveEvents.length }} ЗАПИСЕЙ
        </span>
      </div>

      <!-- Event Items with Status Dots & Timestamps -->
      <div class="flex flex-col gap-1.5">
        <div 
          v-for="item in displayedEvents" 
          :key="item.id"
          class="flex items-center gap-2.5 text-[11px] group cursor-default p-1 -mx-1 rounded-md hover:bg-[var(--arc-plane)] transition-colors"
          :title="`[${item.time}] ${item.source ? `[${item.source}] ` : ''}${item.text}`"
        >
          <!-- Circular Status Dot -->
          <div 
            class="w-3 h-3 rounded-full shrink-0 flex items-center justify-center transition-all"
            :style="{ 
              backgroundColor: getStatusBg(item.status),
              boxShadow: item.status === 'ok' ? '0 0 6px var(--status-ok)' : (item.status === 'warn' ? '0 0 6px var(--status-warn)' : 'none')
            }"
          >
            <span 
              class="w-1.5 h-1.5 rounded-full"
              :style="{ backgroundColor: getStatusColor(item.status) }"
            ></span>
          </div>

          <!-- Event Text & Timestamp -->
          <div class="flex items-center justify-between flex-1 min-w-0 gap-2">
            <span class="truncate text-white/80 group-hover:text-white transition-colors">
              {{ item.text }}
            </span>
            <span class="text-[10px] text-[var(--arc-text-hint)] shrink-0 font-mono">
              {{ item.time }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </ArcHudWidget>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ArcHudWidget from './ArcHudWidget.vue';
import { useCoreEvents } from '../../composables/useCoreEvents';

const { liveEvents } = useCoreEvents();

const displayedEvents = computed(() => {
  return liveEvents.value.slice(0, 5);
});

const getStatusColor = (status: 'ok' | 'info' | 'warn') => {
  switch (status) {
    case 'ok': return 'var(--status-ok)';
    case 'warn': return 'var(--status-warn)';
    case 'info':
    default: return 'var(--arc-text-secondary, rgba(255, 255, 255, 0.6))';
  }
};

const getStatusBg = (status: 'ok' | 'info' | 'warn') => {
  switch (status) {
    case 'ok': return 'rgba(52, 211, 153, 0.18)';
    case 'warn': return 'rgba(245, 158, 11, 0.18)';
    case 'info':
    default: return 'rgba(255, 255, 255, 0.08)';
  }
};
</script>
