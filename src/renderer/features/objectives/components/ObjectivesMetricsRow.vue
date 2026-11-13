<template>
  <div 
    class="px-5 py-3.5 border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px] flex flex-wrap items-center justify-between gap-6 select-none"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <!-- Total & Complete metrics -->
    <div class="flex items-center gap-6">
      <div class="flex flex-col">
        <span class="text-xs font-sans text-[var(--arc-text-hint)]">Всего целей</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-base font-mono font-semibold text-[var(--arc-text-primary)]">{{ totalObjectives }}</span>
          <span class="text-xs font-mono text-[var(--arc-text-hint)]">ед</span>
        </div>
      </div>

      <div class="h-6 w-px bg-[var(--arc-divider)] hidden sm:block"></div>

      <div class="flex flex-col">
        <span class="text-xs font-sans text-[var(--arc-text-hint)]">Завершено</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-base font-mono font-semibold text-[var(--status-ok)]">{{ completedCount }}</span>
          <span class="text-xs font-mono text-[var(--arc-text-hint)]">целей</span>
        </div>
      </div>
    </div>

    <!-- Health Index & Average Progress -->
    <div class="flex items-center gap-6">
      <div class="flex flex-col">
        <span class="text-xs font-sans text-[var(--arc-text-hint)]">Индекс стабильности</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-base font-mono font-semibold text-[var(--arc-text-primary)]">{{ systemHealthIndex }}</span>
          <span class="text-xs font-mono text-[var(--arc-text-hint)]">%</span>
        </div>
      </div>

      <div class="h-6 w-px bg-[var(--arc-divider)] hidden sm:block"></div>

      <div class="flex flex-col min-w-[140px]">
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs font-sans text-[var(--arc-text-hint)]">Прогресс выполнения</span>
          <div class="flex items-baseline gap-0.5">
            <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)]">{{ avgProgress.toFixed(0) }}</span>
            <span class="text-xs font-mono text-[var(--arc-text-hint)]">%</span>
          </div>
        </div>
        <div class="mt-1.5 w-full">
          <ArcTickBar :value="avgProgress" :tickCount="16" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ArcTickBar from '../../../components/widgets/ArcTickBar.vue';

defineProps<{
  totalObjectives: number;
  completedCount: number;
  systemHealthIndex: number;
  avgProgress: number;
}>();
</script>
