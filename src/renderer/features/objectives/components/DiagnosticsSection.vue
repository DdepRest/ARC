<template>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
    <!-- Engine Control & Entropy Metrics -->
    <div class="lg:col-span-12 xl:col-span-4 flex flex-col gap-6">
      <div 
        class="flex flex-col gap-5 border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px] p-5"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.65)'
        }"
      >
        <div class="flex justify-between items-center text-xs font-mono font-semibold select-none uppercase tracking-wider">
          <span class="text-[var(--arc-text-primary)]">Профиль стабильности ядра</span>
          <span class="text-[var(--arc-text-hint)]">Энтропия</span>
        </div>
        
        <div class="flex flex-col gap-3">
          <div class="flex justify-between items-end font-mono">
            <span class="text-xs text-[var(--arc-text-hint)] uppercase tracking-wider">Фактор системной энтропии:</span>
            <span class="text-xl md:text-2xl font-semibold text-[var(--arc-text-primary)] tabular-nums" :class="entropyColorClass">{{ ((entropyState.entropy || 0) * 100).toFixed(1) }}%</span>
          </div>
          
          <ProgressBar :progress="(entropyState.entropy || 0) * 100" size="md" :theme="(entropyState.entropy || 0) > 0.4 ? 'yellow' : 'emerald'" />
        </div>

        <div class="grid grid-cols-2 gap-4 border-t border-[var(--arc-divider)] pt-4 font-mono select-none">
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-[var(--arc-text-hint)] uppercase tracking-wider">СОСТОЯНИЕ ЯДРА</span>
            <span class="text-xs font-semibold border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-[8px] px-2.5 py-1.5 text-center uppercase text-[var(--arc-text-primary)]" :class="stabilityBadgeClass">{{ entropyState.state || 'QUIESCENT' }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-[var(--arc-text-hint)] uppercase tracking-wider">РЕЖИМ ЯДРА</span>
            <span class="text-xs font-semibold border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-[8px] px-2.5 py-1.5 text-center text-[var(--arc-text-primary)] leading-none truncate uppercase" title="EVOLUTIONARY_EXECUTION">{{ (entropyState.systemMode || 'EVOLUTIONARY_EXECUTION').split('_')[0] }}</span>
          </div>
        </div>
        
        <button 
          @click="$emit('toggleAutoApprove')"
          class="w-full h-10 rounded-[10px] border border-[var(--arc-hairline)] font-mono text-xs font-semibold tracking-wider uppercase transition flex items-center justify-center gap-2 mt-2 cursor-pointer bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)]"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
        >
          <span class="w-2 h-2 rounded-full" :class="entropyState.autoApprove ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-off)]'"></span>
          <span>Автоутверждение: {{ entropyState.autoApprove ? 'ВКЛ' : 'ВЫКЛ' }}</span>
        </button>
      </div>

      <!-- System Coherence metrics -->
      <div 
        class="flex flex-col gap-4 border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px] p-5"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.65)'
        }"
      >
        <span class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-hint)]">Метрики согласованности решений</span>
        
        <div class="flex flex-col gap-1 font-mono select-none text-xs">
          <div class="flex justify-between border-b border-[var(--arc-divider)] py-2">
            <span class="text-[var(--arc-text-hint)] uppercase">Индекс когерентности:</span>
            <span class="font-semibold text-[var(--arc-text-primary)] tabular-nums">{{ ((entropyState.coherenceIndex || 0) * 100).toFixed(0) }}%</span>
          </div>
          <div class="flex justify-between border-b border-[var(--arc-divider)] py-2">
            <span class="text-[var(--arc-text-hint)] uppercase">Пространство исследований:</span>
            <span class="font-semibold text-[var(--arc-text-primary)]">{{ (entropyState.coherenceData && entropyState.coherenceData.explorationFreedom) ? 'UNRESTRICTED' : 'BOUNDED' }}</span>
          </div>
          <div class="flex justify-between border-b border-[var(--arc-divider)] py-2">
            <span class="text-[var(--arc-text-hint)] uppercase">Чувствительность:</span>
            <span class="font-semibold text-[var(--arc-text-primary)]">{{ (entropyState.coherenceData && entropyState.coherenceData.suppressionSensitivity) || 'NORMAL' }}</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-[var(--arc-text-hint)] uppercase">Дрейф стабильности:</span>
            <span class="font-semibold text-[var(--arc-text-primary)] tabular-nums">{{ (((entropyState.coherenceData && entropyState.coherenceData.stabilityDrift) || 0) * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Coherence History Timeline Visualization & Governor Prediction Nodes -->
    <div class="lg:col-span-12 xl:col-span-8 flex flex-col gap-6">
      
      <!-- Coherence History Timeline -->
      <div 
        class="flex flex-col gap-5 border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px] p-5"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.65)'
        }"
      >
        <div class="flex justify-between items-center">
          <span class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-hint)]">Профиль дрейфа согласованности</span>
          <span class="text-xs font-mono text-[var(--arc-text-hint)] tracking-widest font-semibold">REALTIME FEED</span>
        </div>

        <div 
          class="relative h-[220px] md:h-[280px] border border-[var(--arc-hairline)] rounded-[12px] bg-[var(--arc-input)] p-6 overflow-hidden flex items-end justify-between select-none"
          :style="{ boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7)' }"
        >
          <div v-if="coherenceHistory.length === 0" class="absolute inset-0 flex items-center justify-center text-xs font-mono text-[var(--arc-text-hint)]">
            Сбор данных когерентности...
          </div>
          
          <div 
            v-for="(record, idx) in coherenceHistory" 
            :key="'hist-'+idx"
            class="flex-1 mx-[2px] bg-[rgba(var(--accent-rgb),0.3)] hover:bg-[var(--accent)] rounded-t transition-colors group relative cursor-pointer"
            :style="{ height: `${Math.max(2, (record.coherence_index || 0) * 100)}%` }"
          >
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 bg-[var(--arc-popover)] text-xs font-mono border border-[var(--arc-hairline)] px-2.5 py-1 rounded-[8px] transition hidden group-hover:block whitespace-nowrap z-10 shadow-xl text-[var(--arc-text-primary)]">
              Coherence: {{ ((record.coherence_index || 0) * 100).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>

      <!-- Dynamic Governor Prediction Nodes -->
      <div 
        class="flex flex-col gap-5 border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px] p-5"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.65)'
        }"
      >
        <span class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-hint)]">Прогнозы регулятора соответствия</span>
        
        <div v-if="predictionNodes && predictionNodes.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            v-for="(pred, idx) in predictionNodes" 
            :key="'pred-'+idx"
            class="p-4 border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-[12px] flex flex-col gap-2"
            :style="{ backgroundImage: 'var(--arc-sheen)' }"
          >
            <div class="flex justify-between items-center text-xs font-mono">
              <span class="text-[var(--arc-text-hint)]">NODE: {{ safeSlice(pred.id || String(idx), 0, 8) }}</span>
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full" :class="pred.confidence > 0.7 ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-warn)]'"></span>
                <span class="text-[var(--arc-text-primary)] font-semibold tabular-nums">{{ Math.round((pred.confidence || 0) * 100) }}%</span>
              </div>
            </div>
            <p class="text-xs font-sans font-medium text-[var(--arc-text-primary)]">{{ pred.description || pred.title }}</p>
          </div>
        </div>
        <div v-else class="text-xs font-mono text-[var(--arc-text-hint)] p-4 text-center">
          Нет активных предиктивных узлов регулятора.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ProgressBar from '../../../components/ui/ProgressBar.vue';

defineProps<{
  entropyState: any;
  entropyColorClass: string;
  stabilityBadgeClass: string;
  coherenceHistory: any[];
  predictionNodes: any[];
  safeSlice: (val: any, start: number, end?: number) => string;
}>();

defineEmits<{
  (e: 'toggleAutoApprove'): void;
}>();
</script>
