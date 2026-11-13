<template>
  <transition name="fade-slide">
    <div 
      v-if="lyrics && musicState === 'playing'"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] z-40 w-full max-w-2xl pointer-events-none px-8"
    >
      <div class="relative text-center">
        <!-- Background Glow -->
        <div class="absolute inset-0 bg-[var(--accent)] blur-[120px] rounded-full scale-150 opacity-15"></div>
        
        <div class="relative z-10 space-y-6">
          <div class="text-xs font-mono tracking-[0.5em] text-[var(--accent)] uppercase opacity-60 mb-12 animate-pulse">
            ✦ NEURAL_LYRIC_SYNC // BIO_INTERFACE
          </div>
          
          <div class="flex flex-col items-center gap-6">
            <p 
              v-for="(line, idx) in visibleLyrics" 
              :key="idx"
              class="text-2xl md:text-4xl font-bold tracking-tight transition duration-700 ease-out"
              :class="line.isCenter ? 'text-white scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'text-white/20 blur-[2px] scale-90'"
            >
              {{ line.text }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  lyrics: string | null;
  musicState: string;
  visibleLyrics: { text: string; isCenter: boolean }[];
}>();
</script>

<style scoped>
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.5s ease;
}
.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}
</style>
