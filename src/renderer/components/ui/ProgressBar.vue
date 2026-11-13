<template>
  <div :id="id" class="w-full">
    <!-- Optional label row -->
    <div v-if="showLabels" class="flex justify-between items-center mb-1.5 font-mono text-xs uppercase tracking-wider">
      <span class="text-[var(--arc-text-muted)]"><slot name="label">Прогресс</slot></span>
      <span class="text-[var(--accent)] font-semibold tabular-nums">{{ Math.round(progress) }}%</span>
    </div>

    <!-- Progress track -->
    <div 
      class="w-full bg-[var(--arc-input)] rounded-full overflow-hidden border border-[var(--arc-hairline)] relative"
      :class="[size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3.5' : 'h-2.5']"
      :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
    >
      <!-- Progress fill -->
      <div
        class="h-full rounded-full transition duration-500 ease-out relative"
        :class="fillClasses"
        :style="{ width: progress + '%' }"
      >
        <div 
          v-if="animated"
          class="absolute inset-0 w-full animate-progress-slide"
          :style="{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)' }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  id?: string;
  progress: number;
  showLabels?: boolean;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'indigo' | 'emerald' | 'red' | 'yellow';
}>(), {
  showLabels: true,
  animated: true,
  size: 'md',
  theme: 'indigo'
});

const fillClasses = computed(() => {
  switch (props.theme) {
    case 'emerald':
      return 'bg-[var(--status-ok)]';
    case 'red':
      return 'bg-[var(--status-err)]';
    case 'yellow':
      return 'bg-[var(--status-warn)]';
    case 'indigo':
    default:
      return 'bg-[var(--accent)]';
  }
});
</script>

<style scoped>
@keyframes progress-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-progress-slide {
  animation: progress-slide 2s infinite linear;
}
</style>
