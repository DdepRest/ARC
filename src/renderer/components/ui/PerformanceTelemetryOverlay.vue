<template>
  <div 
    v-if="show"
    class="fixed bottom-20 left-6 z-[9999] pointer-events-auto select-none font-mono text-[10px] leading-tight"
  >
    <div class="bg-[#070709]/90 border border-white/10 rounded-xl p-3.5 backdrop-blur-xl shadow-2xl flex flex-col gap-2 min-w-[210px]">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <span class="text-white/40 tracking-widest uppercase">ARC // PERF POLICY</span>
        <button 
          @click="toggleGameMode"
          class="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition"
          :class="policy.mode === 'GAME_MODE' 
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
            : 'bg-white/5 text-white/60 hover:text-white border border-white/10'"
        >
          {{ policy.mode === 'GAME_MODE' ? 'GAME ACTIVE' : 'FORCE GAME' }}
        </button>
      </div>

      <div class="flex flex-col gap-1 text-white/70">
        <div class="flex justify-between">
          <span class="text-white/40">MODE:</span>
          <span class="font-bold text-white">{{ policy.mode }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">TARGET FPS:</span>
          <span class="text-emerald-400 font-bold">{{ policy.targetFps }} FPS</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">POST-FX:</span>
          <span>{{ policy.effectsLevel }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">BLUR:</span>
          <span>{{ policy.blurLevel }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">TELEMETRY:</span>
          <span>{{ policy.telemetryMode }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">POLLING:</span>
          <span>{{ policy.pollingMode }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">EFFECTIVE CADENCE:</span>
          <span class="text-amber-300 font-mono">{{ systemStore.effectiveTelemetryCadence }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/40">SOURCE:</span>
          <span :class="isOperatorOverride ? 'text-amber-400' : 'text-blue-400'">
            {{ policy.source }}
          </span>
        </div>
      </div>

      <div class="pt-1 border-t border-white/5 flex justify-between items-center text-[9px]">
        <span class="text-white/30">CANDIDATE: {{ autoCandidate }}</span>
        <button 
          v-if="isOperatorOverride"
          @click="resetToAuto"
          class="text-white/40 hover:text-white underline cursor-pointer"
        >
          reset to auto
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePerformance } from '../../composables/usePerformance';
import { useSystemStore } from '../../stores/system.store';

defineProps<{
  show?: boolean;
}>();

const { policy, autoCandidate, isOperatorOverride, toggleGameMode, resetToAuto } = usePerformance();
const systemStore = useSystemStore();
</script>
