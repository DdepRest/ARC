<template>
  <!-- Flat Single-Row Filter & Search Toolbar (Strictly 1 line on desktop, justify-between) -->
  <div class="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 pb-2 border-b border-[var(--arc-divider)] select-none">
    
    <!-- Left: Clean Flat State Tabs with Bottom Underline -->
    <div class="flex items-center gap-0.5 min-w-0 overflow-x-auto custom-scrollbar">
      <button
        v-for="tab in filterTabs"
        :key="tab.id"
        type="button"
        @click="$emit('update:activeFilter', tab.id)"
        class="relative flex items-center gap-1 px-2 py-1 rounded-[var(--radius-control,8px)] text-xs font-mono transition cursor-pointer shrink-0 whitespace-nowrap"
        :class="[
          activeFilter === tab.id
            ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] font-semibold'
            : 'text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'
        ]"
      >
        <component 
          :is="tab.icon" 
          class="w-3 h-3 shrink-0" 
          :class="activeFilter === tab.id ? 'text-[var(--accent)]' : tab.iconClass"
        />
        <span>{{ tab.label }}</span>
        <span 
          class="text-[10px] px-1 rounded-[var(--radius-pill,999px)] font-mono font-semibold transition-colors"
          :class="[
            tab.id === 'overdue' && getCount('overdue') > 0
              ? 'text-[var(--status-err)]'
              : activeFilter === tab.id
                ? 'text-[var(--arc-text-primary)]'
                : 'text-[var(--arc-text-machine)]'
          ]"
        >
          {{ getCount(tab.id) }}
        </span>
        <!-- Active Bottom Underline Indicator -->
        <span 
          v-if="activeFilter === tab.id" 
          class="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full"
          :class="tab.id === 'overdue' ? 'bg-[var(--status-err)]' : 'bg-[var(--accent)]'"
        ></span>
      </button>

      <!-- Active Objective Filter Indicator (if selected from Right Sidebar) -->
      <button
        v-if="activeObjectiveTitle"
        type="button"
        @click="$emit('update:activeFilter', 'all')"
        class="relative flex items-center gap-1 px-2 py-1 rounded-[var(--radius-control,8px)] text-xs font-mono bg-[var(--arc-selected)] text-[var(--arc-text-primary)] font-semibold transition cursor-pointer shrink-0 max-w-[180px]"
        :title="`Фильтр по цели: ${activeObjectiveTitle} (нажмите для сброса)`"
      >
        <Target class="w-3 h-3 text-[var(--accent)] shrink-0" />
        <span class="truncate">{{ activeObjectiveTitle }}</span>
        <X class="w-3 h-3 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] shrink-0" />
        <span class="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-[var(--accent)]"></span>
      </button>
    </div>

    <!-- Right: Compact Search + Hotkey Badge + Sort + Clear Completed on the SAME row -->
    <div class="flex items-center gap-1.5 shrink-0 ml-auto">
      <!-- Compact Search Input with "/" Hotkey Hint -->
      <div class="relative flex items-center w-36 xl:w-44">
        <Search class="w-3.5 h-3.5 text-[var(--arc-text-muted)] absolute left-2.5 pointer-events-none" />
        <input
          ref="searchInputRef"
          :value="searchQuery"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          @keydown.esc.prevent="clearAndBlurSearch"
          type="text"
          :placeholder="translations?.searchPlaceholder || 'Поиск...'"
          class="w-full h-8 pl-7 pr-7 rounded-[var(--radius-control,8px)] bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
        />
        <button 
          v-if="searchQuery"
          type="button"
          @click="$emit('update:searchQuery', '')"
          class="absolute right-2 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
          aria-label="Очистить поиск"
        >
          <X class="w-3 h-3" />
        </button>
        <kbd
          v-else
          class="absolute right-2 px-1 py-0.2 text-[10px] font-mono text-[var(--arc-text-machine)] bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[4px] pointer-events-none leading-tight"
          title="Нажмите «/» для быстрого поиска"
        >
          /
        </kbd>
      </div>

      <!-- Sort Dropdown -->
      <div class="w-[136px] shrink-0">
        <ArcSelect
          :model-value="sortBy"
          @update:model-value="$emit('update:sortBy', String($event))"
          :options="sortOptions"
          size="sm"
        />
      </div>

      <!-- Clear Completed Action -->
      <button
        v-if="completedCount > 0"
        type="button"
        @click="$emit('clearCompleted')"
        class="flex items-center gap-1 h-8 px-2 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] hover:border-[var(--status-err)] text-[var(--arc-text-secondary)] hover:text-[var(--status-err)] text-xs font-mono rounded-[var(--radius-control,8px)] transition cursor-pointer shrink-0"
        :title="`Очистить завершенные задачи (${completedCount})`"
      >
        <Trash class="w-3 h-3" />
        <span class="hidden 2xl:inline">Очистить</span>
        <span>({{ completedCount }})</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { 
  Search, X, Trash, Sun, AlertTriangle, 
  Star, CheckCircle2, Layers, CheckSquare, Target
} from 'lucide-vue-next';
import ArcSelect from '../../../components/ui/ArcSelect.vue';
import { SelectOption } from '../types';

const props = defineProps<{
  translations: any;
  viewMode?: 'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history';
  searchQuery: string;
  sortBy: string;
  activeFilter: string;
  completedCount: number;
  filterCount: (f: string) => number;
  objectives?: any[];
}>();

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:sortBy', val: string): void;
  (e: 'update:activeFilter', val: string): void;
  (e: 'clearCompleted'): void;
}>();

// If switching to Kanban while 'active' or 'completed' tab is selected, reset to 'all' so columns are not artificially empty
watch(
  () => props.viewMode,
  (mode) => {
    if (mode === 'kanban' && (props.activeFilter === 'active' || props.activeFilter === 'completed')) {
      emit('update:activeFilter', 'all');
    }
  },
  { immediate: true }
);

const searchInputRef = ref<HTMLInputElement | null>(null);

const clearAndBlurSearch = () => {
  emit('update:searchQuery', '');
  searchInputRef.value?.blur();
};

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (active as HTMLElement)?.isContentEditable) {
      return;
    }
    e.preventDefault();
    searchInputRef.value?.focus();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

const getCount = (id: string) => {
  return typeof props.filterCount === 'function' ? props.filterCount(id) : 0;
};

const activeObjectiveTitle = computed(() => {
  if (!props.activeFilter?.startsWith('obj_')) return null;
  const objId = props.activeFilter.replace('obj_', '');
  const found = (props.objectives || []).find((o: any) => o.id === objId);
  return found ? found.title : 'Цель';
});

const sortOptions: SelectOption[] = [
  { label: 'По приоритету', value: 'priority-desc' },
  { label: 'По сроку', value: 'due-asc' },
  { label: 'Сначала новые', value: 'date-desc' },
  { label: 'Сначала старые', value: 'date-asc' }
];

const filterTabs = computed(() => {
  const isKanban = props.viewMode === 'kanban';
  const base: Array<{ id: string; label: string; icon: any; iconClass: string }> = [
    { id: 'all', label: isKanban ? 'Все задачи' : 'Все', icon: Layers, iconClass: 'text-[var(--arc-text-muted)]' }
  ];

  if (!isKanban) {
    base.push({ id: 'active', label: 'Активные', icon: CheckSquare, iconClass: 'text-[var(--accent)]' });
  }

  base.push(
    { id: 'my_day', label: 'Мой день', icon: Sun, iconClass: 'text-[var(--status-warn)]' },
    { id: 'important', label: 'Важные', icon: Star, iconClass: 'text-[var(--status-warn)]' }
  );

  if (getCount('overdue') > 0 || props.activeFilter === 'overdue') {
    base.push({
      id: 'overdue',
      label: 'Просрочено',
      icon: AlertTriangle,
      iconClass: 'text-[var(--status-err)]'
    });
  }

  if (!isKanban) {
    base.push({
      id: 'completed',
      label: 'Готово',
      icon: CheckCircle2,
      iconClass: 'text-[var(--status-ok)]'
    });
  }

  return base;
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--arc-hairline);
  border-radius: 4px;
}
</style>
