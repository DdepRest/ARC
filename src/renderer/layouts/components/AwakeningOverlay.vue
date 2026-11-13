<template>
  <div 
    v-if="isAwakening" 
    class="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-1000"
  >
    <div class="text-[14px] font-mono tracking-[0.4em] text-white animate-pulse">INITIATING COGNITIVE BRIDGE...</div>
    <div class="w-48 h-[1px] bg-[var(--arc-hairline)] mt-4 relative overflow-hidden">
      <div class="absolute inset-y-0 left-0 bg-white shadow-[0_0_10px_white] animate-[shimmer_1s_infinite]" style="width: 50%;"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isAwakening: boolean;
}>();
</script>

<style scoped>
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
