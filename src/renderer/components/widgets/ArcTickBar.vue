<template>
  <div class="arc-tick-bar flex items-center gap-[2px] w-full select-none" :title="`${clampedValue} %`">
    <div
      v-for="i in tickCount"
      :key="i"
      class="h-2 flex-1 rounded-[1px] transition-colors duration-150"
      :style="{
        minWidth: '2px',
        backgroundColor: getTickColor(i)
      }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  value: number;
  max?: number;
  warnThreshold?: number;
  tickCount?: number;
}>(), {
  max: 100,
  warnThreshold: 85,
  tickCount: 20
});

const clampedValue = computed(() => {
  const norm = (props.value / props.max) * 100;
  return Math.min(100, Math.max(0, Math.round(norm)));
});

const activeTicks = computed(() => {
  const fraction = clampedValue.value / 100;
  return Math.round(fraction * props.tickCount);
});

const isWarning = computed(() => {
  return clampedValue.value >= props.warnThreshold;
});

const getTickColor = (index: number) => {
  if (index <= activeTicks.value) {
    if (isWarning.value) {
      return 'var(--status-warn)';
    }
    return 'rgba(var(--accent-rgb), 0.75)';
  }
  return 'rgba(255, 255, 255, 0.10)';
};
</script>

<style scoped>
.arc-tick-bar {
  display: flex;
}
</style>
