<template>
  <div class="flex flex-col gap-4">
    <!-- Header Area with Actions & Stats -->
    <div 
      class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-[var(--arc-hairline)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="memory-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] flex items-center justify-center shrink-0"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Database class="w-4 h-4" />
        </div>
        <div>
          <h2 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            {{ translations.memoryCore || 'Долговременная память' }}
          </h2>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate">
            Факты, предпочтения и семантический индекс знаний оператора
          </p>
        </div>
      </div>

      <!-- Action Toolbar & Stats -->
      <div class="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
        <!-- Single primary button on screen -->
        <ArcButton
          variant="primary"
          size="sm"
          @click="$emit('create')"
        >
          <template #icon>
            <Plus class="w-3.5 h-3.5" />
          </template>
          <span>Создать запись</span>
        </ArcButton>

        <!-- Secondary: Экспорт -->
        <ArcButton
          variant="secondary"
          size="sm"
          @click="$emit('export')"
          title="Экспортировать память в JSON"
        >
          <template #icon>
            <Download class="w-3.5 h-3.5" />
          </template>
          <span class="hidden sm:inline">Экспорт</span>
        </ArcButton>

        <!-- Secondary: Импорт -->
        <label
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] text-xs font-sans font-medium transition cursor-pointer"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
          title="Импортировать память из JSON"
        >
          <Upload class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Импорт</span>
          <input type="file" accept=".json" class="hidden" @change="$emit('import', $event)" />
        </label>

        <!-- Danger: Очистить всю память -->
        <button
          @click="$emit('clear-all')"
          class="p-2 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--status-err)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer flex items-center justify-center"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
          title="Очистить всю память"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>

        <!-- Stats Counter -->
        <div 
          class="flex items-center gap-3 border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 bg-[var(--arc-block)]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
        >
          <div class="flex flex-col">
            <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider leading-tight">Записей</span>
            <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] tabular-nums">{{ stats.totalEntries || 0 }}</span>
          </div>

          <div class="w-px h-5 bg-[var(--arc-hairline)]"></div>

          <div class="flex flex-col" title="Записи с векторным эмбеддингом для семантического поиска">
            <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider leading-tight">С векторами</span>
            <span class="text-xs font-mono font-semibold text-[var(--status-ok)] tabular-nums">
              {{ stats.vectorCount || 0 }} <span class="text-xs text-[var(--arc-text-muted)] font-normal">({{ vectorPercentage }}%)</span>
            </span>
          </div>

          <div class="w-px h-5 bg-[var(--arc-hairline)]"></div>

          <button 
            @click="$emit('refresh')" 
            class="h-6 w-6 rounded border border-[var(--arc-hairline)] bg-[var(--arc-plane)] flex items-center justify-center text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            :title="translations.refresh || 'Обновить память'"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': loading }" />
          </button>
        </div>
      </div>
    </div>

    <!-- Search, Segment Control, Filter & Sort Row -->
    <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
      <!-- Search Input -->
      <div class="relative flex-1 md:max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--arc-text-muted)]" />
        <input 
          :value="searchQuery" 
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          type="text" 
          :placeholder="semanticSearch ? 'Семантический поиск по смыслу...' : (translations.search || 'Поиск узлов памяти...')"
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] py-2 pl-9 pr-4 text-xs font-mono text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition-colors"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        />
      </div>

      <!-- Segment control for search mode (12px/600/UPPER/mono/tracking .10em, 2px bottom line, no fill) -->
      <div class="flex items-center gap-5 border-b border-transparent shrink-0 px-1">
        <button
          type="button"
          @click="$emit('update:semanticSearch', false)"
          class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none"
          :class="!semanticSearch ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
        >
          Точный
          <div v-if="!semanticSearch" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
        </button>

        <button
          type="button"
          @click="$emit('update:semanticSearch', true)"
          class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none flex items-center gap-1.5"
          :class="semanticSearch ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          title="Семантический поиск через векторные эмбеддинги"
        >
          <Brain class="w-3 h-3" />
          Семантический
          <div v-if="semanticSearch" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
        </button>
      </div>

      <!-- Category Filter Dropdown -->
      <div class="relative">
        <select 
          :value="selectedCategory"
          @change="$emit('update:selectedCategory', ($event.target as HTMLSelectElement).value)"
          class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] outline-none cursor-pointer pr-8 transition-colors appearance-none"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        >
          <option 
            v-for="cat in categoryFilters" 
            :key="cat.value" 
            :value="cat.value"
            class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)]"
          >
            {{ cat.label }}
          </option>
        </select>
        <ChevronDown class="w-3 h-3 text-[var(--arc-text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <!-- Reset Filters Button if filter active -->
      <button 
        v-if="selectedCategory !== 'all' || searchQuery"
        @click="$emit('update:selectedCategory', 'all'); $emit('update:searchQuery', '')"
        class="text-xs font-sans text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer whitespace-nowrap px-1"
        title="Сбросить выбранную категорию и поисковый запрос"
      >
        Сбросить фильтры
      </button>
      
      <!-- Sort Select -->
      <div class="ml-auto relative w-full md:w-auto">
        <select 
          :value="sortBy"
          @change="$emit('update:sortBy', ($event.target as HTMLSelectElement).value)"
          class="w-full md:w-auto bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] outline-none pr-8 cursor-pointer transition-colors appearance-none"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        >
          <option value="newest" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">{{ translations.sortNewest || 'Сначала новые' }}</option>
          <option value="oldest" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">{{ translations.sortOldest || 'Сначала старые' }}</option>
          <option value="confidence" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">{{ translations.sortConfidence || 'Уверенность' }}</option>
          <option value="access" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">{{ translations.sortAccess || 'Часто используемые' }}</option>
        </select>
        <ChevronDown class="w-3 h-3 text-[var(--arc-text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type MemoryCategory } from '../../../../shared/types/memory';
import { 
  Database, RefreshCw, Search, Trash2, Plus, Download, Upload,
  Brain, ChevronDown, ArrowLeft
} from 'lucide-vue-next';
import ArcButton from '../../../components/ui/ArcButton.vue';
import { useUIStore } from '../../../stores/ui.store';

const uiStore = useUIStore();

const props = defineProps<{
  searchQuery: string;
  semanticSearch: boolean;
  selectedCategory: MemoryCategory | 'all';
  sortBy: 'newest' | 'oldest' | 'confidence' | 'access';
  loading: boolean;
  stats: {
    totalEntries: number;
    vectorCount?: number;
    categories: Record<string, number>;
    recentBehaviorCount: number;
  };
  translations: Record<string, string>;
}>();

defineEmits<{
  (e: 'create'): void;
  (e: 'export'): void;
  (e: 'import', event: Event): void;
  (e: 'clear-all'): void;
  (e: 'refresh'): void;
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:semanticSearch', val: boolean): void;
  (e: 'update:selectedCategory', val: MemoryCategory | 'all'): void;
  (e: 'update:sortBy', val: 'newest' | 'oldest' | 'confidence' | 'access'): void;
}>();

const vectorPercentage = computed(() => {
  const total = props.stats?.totalEntries || 0;
  const vectors = props.stats?.vectorCount || 0;
  if (total === 0) return 0;
  return Math.min(100, Math.round((vectors / total) * 100));
});

const categoryFilters = computed(() => [
  { value: 'all', label: props.translations.allCategories || 'Все категории' },
  { value: 'fact', label: 'Факты' },
  { value: 'preference', label: 'Предпочтения' },
  { value: 'knowledge', label: 'Знания' },
  { value: 'event', label: 'События' }
]);
</script>
