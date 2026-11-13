<script setup lang="ts">
import { Zap, RefreshCw, Crosshair, Target, Check } from 'lucide-vue-next';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';

interface Props {
  modelValue?: 'smart_route' | 'fallback' | 'ensemble';
  isExclusive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 'smart_route',
  isExclusive: false
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: 'smart_route' | 'fallback' | 'ensemble'): void;
  (e: 'update:isExclusive', value: boolean): void;
}>();

const selectStrategy = (strategy: 'smart_route' | 'fallback' | 'ensemble') => {
  emit('update:modelValue', strategy);
};

const toggleExclusive = (val: boolean) => {
  emit('update:isExclusive', val);
};
</script>

<template>
  <div class="flex flex-col gap-2.5 pt-1">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <Target class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">
          СТРАТЕГИЯ МАРШРУТИЗАЦИИ
        </span>
      </div>
    </div>

    <!-- Strategy Selection Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <!-- Smart Route -->
      <button 
        type="button"
        @click="selectStrategy('smart_route')"
        class="px-3 py-2 rounded-[10px] border text-left flex flex-col gap-1 transition cursor-pointer"
        :class="modelValue === 'smart_route' 
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.4)] text-[var(--arc-text-primary)]' 
          : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Zap class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            УМНЫЙ МАРШРУТ
          </span>
          <Check v-if="modelValue === 'smart_route'" class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-hint)] leading-tight">
          Динамический выбор модели под задачу
        </span>
      </button>

      <!-- Fallback Chain -->
      <button 
        type="button"
        @click="selectStrategy('fallback')"
        class="px-3 py-2 rounded-[10px] border text-left flex flex-col gap-1 transition cursor-pointer"
        :class="modelValue === 'fallback' 
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--status-warn-rgb,234,179,8),0.4)] text-[var(--arc-text-primary)]' 
          : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
            <RefreshCw class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0" />
            ФОЛБЕК ЦЕПОЧКА
          </span>
          <Check v-if="modelValue === 'fallback'" class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0" />
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-hint)] leading-tight">
          Автопереход при сбое модели
        </span>
      </button>

      <!-- First Available / Ensemble -->
      <button 
        type="button"
        @click="selectStrategy('ensemble')"
        class="px-3 py-2 rounded-[10px] border text-left flex flex-col gap-1 transition cursor-pointer"
        :class="modelValue === 'ensemble' 
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.4)] text-[var(--arc-text-primary)]' 
          : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Crosshair class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            ПЕРВАЯ ДОСТУПНАЯ
          </span>
          <Check v-if="modelValue === 'ensemble'" class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-hint)] leading-tight">
          Прямой запрос к первой модели
        </span>
      </button>
    </div>

    <!-- Exclusive Mode Toggle Strip -->
    <div 
      class="py-2.5 px-3.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] flex items-center justify-between gap-3"
      :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
    >
      <div class="flex flex-col gap-0.5 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase tracking-wider">
            Эксклюзивный режим
          </span>
          <span 
            v-if="isExclusive" 
            class="text-xs font-mono px-2 py-0.5 bg-[var(--arc-block)] text-[var(--status-warn)] border border-[rgba(var(--status-warn-rgb,234,179,8),0.3)] rounded-[6px] font-bold"
          >
            АКТИВЕН
          </span>
        </div>
        <span class="text-xs text-[var(--arc-text-hint)] font-mono truncate">
          Запросы отправляются только этому шлюзу без фолбеков
        </span>
      </div>

      <ArcToggle
        :model-value="isExclusive"
        @update:model-value="toggleExclusive"
        size="sm"
      />
    </div>
  </div>
</template>
