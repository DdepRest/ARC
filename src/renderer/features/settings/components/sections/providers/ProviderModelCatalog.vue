<script setup lang="ts">
import { ref, computed } from 'vue';
import { Search, RefreshCw } from 'lucide-vue-next';
import { useAiConfigStore } from '../../../../../stores/aiConfig';

const props = defineProps<{
  provider: any;
  fetchedModels: string[];
  isLoadingModels: boolean;
}>();

const emit = defineEmits<{
  (e: 'fetch-models'): void;
}>();

const aiStore = useAiConfigStore();

const searchQuery = ref('');
const activeCategoryFilter = ref('all');
const showAllSelected = ref(false);

const OPENROUTER_VIRTUAL_MODELS = [
  { id: 'openrouter/free', name: 'Free Models Router', context_length: 200000, subtitle: 'Free Models Router • 200K context' },
  { id: 'openrouter/auto', name: 'Auto Router', context_length: 2000000, subtitle: 'Auto Router • 2M context' },
  { id: 'openrouter/fusion', name: 'Fusion', context_length: 1000000, subtitle: 'Fusion • 1M context' }
];

const isOpenRouterProvider = computed(() => {
  const p = props.provider;
  if (!p) return false;
  return p.id === 'openrouter' || Boolean(p.endpoint?.toLowerCase().includes('openrouter')) || Boolean(p.name?.toLowerCase().includes('openrouter'));
});

const getVirtualRouterSubtitle = (modelName: string): string | null => {
  const match = OPENROUTER_VIRTUAL_MODELS.find(v => v.id === modelName);
  return match ? match.subtitle : null;
};

const getCatalogModels = () => {
  const base = props.fetchedModels && props.fetchedModels.length > 0 ? [...props.fetchedModels] : [];
  if (isOpenRouterProvider.value) {
    const virtualIds = OPENROUTER_VIRTUAL_MODELS.map(v => v.id).filter(id => !base.includes(id));
    return [...virtualIds, ...base];
  }
  return base;
};

const selectedList = computed<string[]>(() => {
  if (props.provider.selectedModels && props.provider.selectedModels.length > 0) {
    return props.provider.selectedModels;
  }
  return props.provider.model ? [props.provider.model] : [];
});

const visibleSelectedChips = computed(() => {
  if (showAllSelected.value || selectedList.value.length <= 3) {
    return selectedList.value;
  }
  return selectedList.value.slice(0, 3);
});

const hiddenSelectedModels = computed(() => {
  if (selectedList.value.length <= 3) return [];
  return selectedList.value.slice(3);
});

const filterModels = () => {
  const models = getCatalogModels();
  const query = searchQuery.value.toLowerCase().trim();
  const categoryFilter = activeCategoryFilter.value;

  return models.filter(m => {
    const name = m.toLowerCase();
    
    if (categoryFilter === 'llama' && !name.includes('llama')) return false;
    if (categoryFilter === 'gemini' && !name.includes('gemini')) return false;
    if (categoryFilter === 'deepseek' && !name.includes('deepseek') && !name.includes('r1')) return false;
    if (categoryFilter === 'qwen' && !name.includes('qwen')) return false;
    if (categoryFilter === 'claude' && !name.includes('claude')) return false;
    if (categoryFilter === 'gpt' && !name.includes('gpt')) return false;
    if (categoryFilter === 'free' && !name.includes('free') && name !== 'auto') return false;
    if (categoryFilter === 'reasoning' && !name.includes('r1') && !name.includes('reasoner') && !name.includes('o1') && !name.includes('o3')) return false;

    if (!query) return true;
    return name.includes(query);
  });
};

const addCustomModel = (modelName: string) => {
  const clean = modelName.trim();
  if (!clean) return;
  if (!props.provider.selectedModels) {
    props.provider.selectedModels = props.provider.model ? [props.provider.model] : [];
  }
  if (!props.provider.selectedModels.includes(clean)) {
    props.provider.selectedModels.push(clean);
  }
  props.provider.model = clean;
  aiStore.saveProvider(props.provider);
};

const isModelSelected = (modelName: string) => {
  return selectedList.value.includes(modelName);
};

const toggleModelSelection = (modelName: string) => {
  if (!props.provider.selectedModels) {
    props.provider.selectedModels = props.provider.model ? [props.provider.model] : [];
  }
  const idx = props.provider.selectedModels.indexOf(modelName);
  if (idx > -1) {
    props.provider.selectedModels.splice(idx, 1);
    if (props.provider.selectedModels.length > 0) {
      props.provider.model = props.provider.selectedModels[0];
    }
  } else {
    props.provider.selectedModels.push(modelName);
    props.provider.model = modelName;
  }
  if (!props.provider.routingStrategy) {
    props.provider.routingStrategy = 'smart_route';
  }
  aiStore.saveProvider(props.provider);
};

const removeSelectedModel = (modelName: string) => {
  if (!props.provider.selectedModels) {
    if (props.provider.model === modelName) {
      props.provider.model = '';
      aiStore.saveProvider(props.provider);
    }
    return;
  }
  const idx = props.provider.selectedModels.indexOf(modelName);
  if (idx > -1) {
    props.provider.selectedModels.splice(idx, 1);
    if (props.provider.selectedModels.length > 0) {
      props.provider.model = props.provider.selectedModels[0];
    }
    aiStore.saveProvider(props.provider);
  }
};

const selectAllFilteredModels = () => {
  const filtered = filterModels();
  if (!props.provider.selectedModels) props.provider.selectedModels = [];
  filtered.forEach(m => {
    if (!props.provider.selectedModels.includes(m)) {
      props.provider.selectedModels.push(m);
    }
  });
  if (props.provider.selectedModels.length > 0) {
    props.provider.model = props.provider.selectedModels[0];
  }
  aiStore.saveProvider(props.provider);
};

const clearSelectedModels = () => {
  if (props.provider.selectedModels) {
    const first = props.provider.selectedModels[0] || props.provider.model;
    props.provider.selectedModels = first ? [first] : [];
  }
  aiStore.saveProvider(props.provider);
};

const filteredModelsList = computed(() => filterModels());
const displayedModels = computed(() => {
  const models = filteredModelsList.value;
  if (!searchQuery.value.trim() && models.length > 50) {
    return models.slice(0, 50);
  }
  return models;
});
const remainingCount = computed(() => Math.max(0, filteredModelsList.value.length - 50));
const hasMoreModels = computed(() => !searchQuery.value.trim() && filteredModelsList.value.length > 50);
</script>

<template>
  <div class="flex flex-col gap-2.5 pt-1">
    <!-- Single-row Header: Title + Counter on left, Refresh on right -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">
          КАТАЛОГ МОДЕЛЕЙ
        </span>
        <span class="text-xs font-mono text-[var(--arc-text-muted)] tabular-nums">
          {{ getCatalogModels().length }} доступно
        </span>
      </div>

      <button 
        type="button"
        @click="emit('fetch-models')" 
        class="px-2.5 py-1 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[8px] text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] flex items-center gap-1.5 uppercase transition-colors cursor-pointer shrink-0"
        :disabled="isLoadingModels"
      >
        <RefreshCw class="w-3 h-3" :class="{ 'animate-spin text-[var(--accent)]': isLoadingModels }" />
        <span>ОБНОВИТЬ</span>
      </button>
    </div>

    <!-- Selected Models Compact Chips Strip -->
    <div class="flex flex-wrap gap-1.5 items-center min-h-[30px] p-1.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px]">
      <span 
        v-if="selectedList.length === 0" 
        class="text-xs font-mono text-[var(--arc-text-hint)] px-1"
      >
        Модели не выбраны
      </span>
      <div 
        v-for="m in visibleSelectedChips" 
        :key="m"
        class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[6px] text-xs font-mono text-[var(--arc-text-primary)]"
      >
        <span class="truncate max-w-[180px]">{{ m }}</span>
        <button 
          type="button"
          @click.stop="removeSelectedModel(m)" 
          class="text-[var(--arc-text-muted)] hover:text-[var(--status-err)] transition-colors cursor-pointer leading-none"
          title="Удалить из выбранных"
        >
          ×
        </button>
      </div>
      <button
        v-if="hiddenSelectedModels.length > 0"
        type="button"
        @click="showAllSelected = !showAllSelected"
        :title="hiddenSelectedModels.join(', ')"
        class="px-2 py-0.5 rounded-[6px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--accent)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer tabular-nums"
      >
        {{ showAllSelected ? 'Свернуть' : `+ ${hiddenSelectedModels.length} ещё` }}
      </button>
    </div>

    <!-- Search Input -->
    <div class="relative flex items-center">
      <Search class="w-3.5 h-3.5 absolute left-3 text-[var(--arc-text-muted)] pointer-events-none" />
      <input 
        v-model="searchQuery" 
        type="text"
        placeholder="Поиск модели (llama, gemini, qwen, deepseek, 70b)..."
        class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] pl-9 pr-8 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none transition"
      />
      <button 
        v-if="searchQuery" 
        type="button"
        @click="searchQuery = ''" 
        class="absolute right-3 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] text-xs cursor-pointer"
      >
        ×
      </button>
    </div>

    <!-- Quick Add custom model -->
    <div v-if="searchQuery.trim() && !filterModels().includes(searchQuery.trim())" class="px-2.5 py-1.5 flex items-center justify-between bg-[var(--arc-plane)] border border-dashed border-[var(--arc-hairline)] rounded-[8px]">
      <span class="text-xs font-mono text-[var(--arc-text-primary)] truncate">Добавить «{{ searchQuery.trim() }}»</span>
      <button 
        type="button"
        @click="addCustomModel(searchQuery.trim())" 
        class="px-2 py-0.5 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-ok)] border border-[var(--status-ok)]/35 rounded-[6px] text-xs font-mono uppercase transition-colors cursor-pointer shrink-0"
      >
        + ДОБАВИТЬ
      </button>
    </div>

    <!-- Category Filter Chips -->
    <div class="flex items-center gap-1 overflow-x-auto pb-0.5">
      <button 
        v-for="cat in [
          { id: 'all', label: 'ВСЕ' },
          { id: 'llama', label: 'LLAMA' },
          { id: 'gemini', label: 'GEMINI' },
          { id: 'deepseek', label: 'DEEPSEEK' },
          { id: 'qwen', label: 'QWEN' },
          { id: 'claude', label: 'CLAUDE' },
          { id: 'gpt', label: 'GPT' },
          { id: 'reasoning', label: 'РАССУЖДЕНИЯ' }
        ]"
        :key="cat.id"
        type="button"
        @click="activeCategoryFilter = cat.id"
        class="px-2 py-0.5 rounded-[6px] text-xs font-mono tracking-wider uppercase transition shrink-0 cursor-pointer border"
        :class="activeCategoryFilter === cat.id 
          ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--accent)] font-bold' 
          : 'bg-[var(--arc-plane)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
      >
        {{ cat.label }}
      </button>

      <div class="ml-auto flex items-center gap-1 shrink-0 pl-2">
        <button 
          type="button"
          @click="selectAllFilteredModels" 
          class="text-xs font-mono text-[var(--status-ok)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-plane)] border border-[var(--status-ok)]/30 px-2 py-0.5 rounded-[6px] uppercase cursor-pointer"
          title="Выбрать все отфильтрованные"
        >
          ВСЕ
        </button>
        <button 
          type="button"
          @click="clearSelectedModels" 
          class="text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] px-2 py-0.5 rounded-[6px] uppercase cursor-pointer"
        >
          СБРОС
        </button>
      </div>
    </div>

    <!-- Compact Checkbox List -->
    <div class="max-h-64 overflow-y-auto flex flex-col gap-0.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] p-1">
      <div v-if="filteredModelsList.length === 0" class="py-2.5 px-3 text-center text-xs font-mono text-[var(--arc-text-hint)]">
        {{ getCatalogModels().length === 0 ? 'Модели недоступны. Нажмите "ОБНОВИТЬ"' : 'Ничего не найдено' }}
      </div>

      <label 
        v-for="modelName in displayedModels" 
        :key="modelName"
        class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[6px] hover:bg-[var(--arc-hover)] cursor-pointer text-xs font-mono transition-colors"
        :class="isModelSelected(modelName) ? 'bg-[var(--arc-block)] text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
      >
        <div class="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            :checked="isModelSelected(modelName)"
            @change="toggleModelSelection(modelName)"
            class="w-3.5 h-3.5 rounded border-[var(--arc-hairline)] bg-[var(--arc-input)] accent-[var(--accent)] cursor-pointer shrink-0"
          />
          <span class="truncate">{{ modelName }}</span>
          <span v-if="getVirtualRouterSubtitle(modelName)" class="text-xs font-mono text-[var(--arc-text-hint)] truncate">
            ({{ getVirtualRouterSubtitle(modelName) }})
          </span>
        </div>

        <span 
          v-if="provider.model === modelName" 
          class="text-xs font-mono px-1.5 py-0.5 rounded-[4px] bg-[var(--arc-plane)] text-[var(--status-ok)] border border-[var(--status-ok)]/30 uppercase font-semibold shrink-0"
        >
          ОСНОВНАЯ
        </span>
      </label>

      <div v-if="hasMoreModels" class="py-1.5 px-2.5 text-center text-xs font-mono text-[var(--arc-text-muted)] border-t border-[var(--arc-hairline)] mt-0.5 flex items-center justify-center gap-1.5">
        <span>Показано 50 из {{ filteredModelsList.length }}</span>
        <span class="text-[var(--accent)] font-bold tabular-nums">+{{ remainingCount }} ещё</span>
      </div>
    </div>
  </div>
</template>
