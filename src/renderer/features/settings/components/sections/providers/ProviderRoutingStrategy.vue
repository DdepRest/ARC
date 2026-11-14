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
  <div class="flex flex-col gap-3" :style="{ fontFamily: 'var(--font-ui)' }">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Target class="w-4 h-4 text-[var(--accent)]" />
        <span class="text-[13.5px] font-semibold text-[var(--arc-text-primary)] tracking-tight">
          Стратегия маршрутизации внутри шлюза
        </span>
      </div>
    </div>

    <!-- Strategy Selection Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <!-- Smart Route -->
      <button 
        type="button"
        @click="selectStrategy('smart_route')"
        class="p-3 rounded-[10px] border text-left flex flex-col gap-1 transition cursor-pointer"
        :class="modelValue === 'smart_route' 
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.45)] text-[var(--arc-text-primary)]' 
          : 'bg-[var(--arc-well)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      >
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold flex items-center gap-1.5">
            <Zap class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            Умный маршрут
          </span>
          <Check v-if="modelValue === 'smart_route'" class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        </div>
        <span class="text-xs text-[var(--arc-text-hint)] leading-snug">
          Динамический выбор модели под задачу
        </span>
      </button>

      <!-- Fallback Chain -->
      <button 
        type="button"
        @click="selectStrategy('fallback')"
        class="p-3 rounded-[10px] border text-left flex flex-col gap-1 transition cursor-pointer"
        :class="modelValue === 'fallback' 
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--status-warn-rgb,234,179,8),0.45)] text-[var(--arc-text-primary)]' 
          : 'bg-[var(--arc-well)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      >
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold flex items-center gap-1.5">
            <RefreshCw class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0" />
            Фолбек цепочка
          </span>
          <Check v-if="modelValue === 'fallback'" class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0" />
        </div>
        <span class="text-xs text-[var(--arc-text-hint)] leading-snug">
          Автопереход при сбое модели
        </span>
      </button>

      <!-- First Available / Ensemble -->
      <button 
        type="button"
        @click="selectStrategy('ensemble')"
        class="p-3 rounded-[10px] border text-left flex flex-col gap-1 transition cursor-pointer"
        :class="modelValue === 'ensemble' 
          ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.45)] text-[var(--arc-text-primary)]' 
          : 'bg-[var(--arc-well)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      >
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold flex items-center gap-1.5">
            <Crosshair class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            Первая доступная
          </span>
          <Check v-if="modelValue === 'ensemble'" class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        </div>
        <span class="text-xs text-[var(--arc-text-hint)] leading-snug">
          Прямой запрос к первой модели
        </span>
      </button>
    </div>

    <!-- Exclusive Mode Toggle Strip -->
    <div 
      class="py-3 px-4 bg-[var(--arc-well)] border border-[var(--arc-hairline)] rounded-[10px] flex items-center justify-between gap-3"
      :style="{ boxShadow: 'var(--arc-well-shadow)' }"
    >
      <div class="flex flex-col gap-0.5 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-semibold text-[var(--arc-text-primary)]">
            Эксклюзивный режим
          </span>
          <span 
            v-if="isExclusive" 
            class="text-xs font-mono text-[var(--status-warn)] font-semibold"
          >
            · Активен
          </span>
        </div>
        <span class="text-xs text-[var(--arc-text-hint)] truncate">
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
