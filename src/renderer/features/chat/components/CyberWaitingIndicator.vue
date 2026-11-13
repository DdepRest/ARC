<template>
  <div class="flex items-center gap-3 py-1 px-1.5 select-none font-mono">
    <!-- 5-Channel Telemetry Wave -->
    <div class="flex items-center gap-[3px] h-3.5 px-0.5">
      <span 
        class="w-[2.5px] rounded-full bg-[var(--status-ok)] transition-all duration-150 transform origin-bottom animate-arc-wave-1"
        style="height: 100%;"
      ></span>
      <span 
        class="w-[2.5px] rounded-full bg-[var(--status-ok)] transition-all duration-150 transform origin-bottom animate-arc-wave-2 opacity-90"
        style="height: 100%;"
      ></span>
      <span 
        class="w-[2.5px] rounded-full bg-[var(--status-ok)] transition-all duration-150 transform origin-bottom animate-arc-wave-3"
        style="height: 100%;"
      ></span>
      <span 
        class="w-[2.5px] rounded-full bg-[var(--status-ok)] transition-all duration-150 transform origin-bottom animate-arc-wave-4 opacity-85"
        style="height: 100%;"
      ></span>
      <span 
        class="w-[2.5px] rounded-full bg-[var(--status-ok)] transition-all duration-150 transform origin-bottom animate-arc-wave-5 opacity-70"
        style="height: 100%;"
      ></span>
    </div>

    <!-- Status text & separator -->
    <div class="flex items-center gap-2 text-[11px] tracking-wider text-[var(--arc-text-secondary)] font-mono">
      <span class="uppercase tracking-widest text-[var(--arc-text-primary)] font-medium">
        {{ isSearching ? 'ПОИСК ДАННЫХ' : 'СИНТЕЗ ОТВЕТА' }}
      </span>
      <span class="text-[var(--arc-hairline)]" aria-hidden="true">·</span>
      <!-- Live Stopwatch Timer -->
      <span class="tabular-nums text-[var(--arc-text-hint)] tracking-normal">
        {{ formattedElapsed }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  isSearching?: boolean;
}>();

const startTimestamp = ref(Date.now());
const elapsedSeconds = ref(0);
let timerId: any = null;

onMounted(() => {
  startTimestamp.value = Date.now();
  timerId = setInterval(() => {
    elapsedSeconds.value = (Date.now() - startTimestamp.value) / 1000;
  }, 100);
});

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
});

const formattedElapsed = computed(() => {
  return `${elapsedSeconds.value.toFixed(1)} s`;
});
</script>

<style scoped>
@keyframes arc-wave-anim-1 {
  0%, 100% { transform: scaleY(0.25); opacity: 0.5; }
  50% { transform: scaleY(0.95); opacity: 1; }
}
@keyframes arc-wave-anim-2 {
  0%, 100% { transform: scaleY(0.4); opacity: 0.6; }
  50% { transform: scaleY(1.0); opacity: 1; }
}
@keyframes arc-wave-anim-3 {
  0%, 100% { transform: scaleY(0.8); opacity: 0.9; }
  50% { transform: scaleY(0.3); opacity: 0.5; }
}
@keyframes arc-wave-anim-4 {
  0%, 100% { transform: scaleY(0.35); opacity: 0.6; }
  50% { transform: scaleY(0.85); opacity: 1; }
}
@keyframes arc-wave-anim-5 {
  0%, 100% { transform: scaleY(0.2); opacity: 0.4; }
  50% { transform: scaleY(0.7); opacity: 0.9; }
}

.animate-arc-wave-1 {
  animation: arc-wave-anim-1 0.85s ease-in-out infinite;
}
.animate-arc-wave-2 {
  animation: arc-wave-anim-2 0.75s ease-in-out infinite 0.15s;
}
.animate-arc-wave-3 {
  animation: arc-wave-anim-3 0.95s ease-in-out infinite 0.3s;
}
.animate-arc-wave-4 {
  animation: arc-wave-anim-4 0.8s ease-in-out infinite 0.1s;
}
.animate-arc-wave-5 {
  animation: arc-wave-anim-5 1.05s ease-in-out infinite 0.25s;
}
</style>
