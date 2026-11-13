<template>
  <header class="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-[var(--arc-plane)] select-none border-b border-[var(--arc-divider)] shrink-0">
    <!-- Left: Back to Core + Title + Integrated View Switcher -->
    <div class="flex items-center gap-3 flex-wrap">
      <button
        @click="uiStore.setActiveTab('core')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-control,8px)] text-xs font-mono font-medium border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer"
        title="Вернуться к 3D-Ядру (Esc)"
        data-testid="tasks-exit-to-core"
      >
        <ArrowLeft class="w-3.5 h-3.5" />
        <span>К Ядру</span>
      </button>

      <span class="text-[11px] font-mono uppercase tracking-widest text-[var(--arc-text-machine)] hidden xl:inline">
        Очередь задач
      </span>

      <div class="h-4 w-px bg-[var(--arc-divider)] hidden sm:block"></div>

      <!-- Segmented View Modes (Moved from workspace into Header to save vertical height) -->
      <nav class="flex items-center gap-0.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] p-0.5 rounded-[var(--radius-control,8px)]" aria-label="Режимы отображения">
        <button 
          v-for="mode in viewModes"
          :key="mode.id"
          type="button"
          @click="$emit('update:viewMode', mode.id)"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-mono transition cursor-pointer shrink-0"
          :class="[
            viewMode === mode.id 
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] font-semibold shadow-sm' 
              : 'text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'
          ]"
        >
          <component :is="mode.icon" class="w-3.5 h-3.5" />
          <span>{{ mode.label }}</span>
        </button>
      </nav>
    </div>
    
    <!-- Right: Compact Progress + Analytics + Sidebar Toggle -->
    <div class="flex items-center gap-2">
      <!-- Single Compact Progress Indicator (No duplicate in sidebar) -->
      <div 
        class="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-xs font-mono"
        title="Прогресс выполнения очереди"
      >
        <span class="text-[10px] text-[var(--arc-text-machine)] uppercase">Готово</span>
        <span class="text-[var(--arc-text-primary)] font-semibold">{{ completedCount || 0 }}/{{ tasksCount || 0 }}</span>
        <div class="w-12 h-1.5 bg-[var(--arc-plane)] rounded-full overflow-hidden border border-[var(--arc-hairline)]">
          <div 
            class="h-full bg-[var(--status-ok)] transition-[width] duration-300"
            :style="{ width: `${Math.round((completionRatio || 0) * 100)}%` }"
          ></div>
        </div>
        <span class="text-[10px] text-[var(--arc-text-secondary)]">{{ Math.round((completionRatio || 0) * 100) }}%</span>
      </div>

      <!-- Single Analytics Trigger (Removed duplicate from sidebar) -->
      <button 
        type="button"
        @click="$emit('openAnalytics')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-control,8px)] text-xs font-mono font-medium border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer"
        title="Детальная аналитика задач"
      >
        <BarChart2 class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span class="hidden sm:inline">Аналитика</span>
      </button>

      <!-- Context Sidebar Toggle -->
      <button
        type="button"
        @click="$emit('toggleRail')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-control,8px)] text-xs font-mono font-medium border transition cursor-pointer"
        :class="isRailVisible
          ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--arc-hairline)] font-semibold'
          : 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border-[var(--arc-hairline)]'"
        :title="isRailVisible ? 'Скрыть боковую панель' : 'Показать сводку / инспектор'"
      >
        <PanelRight class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Панель</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { BarChart2, ArrowLeft, PanelRight, List, Columns, Timer, History } from 'lucide-vue-next';
import { useUIStore } from '../../../stores/ui.store';

const uiStore = useUIStore();

defineProps<{
  viewMode?: 'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history';
  completedCount?: number;
  tasksCount?: number;
  completionRatio?: number;
  translations?: any;
  isRailVisible?: boolean;
}>();

defineEmits<{
  (e: 'update:viewMode', val: 'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history'): void;
  (e: 'openAnalytics'): void;
  (e: 'toggleRail'): void;
}>();

const viewModes = [
  { id: 'list' as const, label: 'Список', icon: List },
  { id: 'kanban' as const, label: 'Канбан', icon: Columns },
  { id: 'sprint' as const, label: 'Фокус', icon: Timer },
  { id: 'history' as const, label: 'История', icon: History }
];
</script>