<template>
  <div class="flex flex-col h-full min-h-0 w-full max-w-full mx-auto p-4 md:p-6 z-10 overflow-y-auto custom-scrollbar gap-6 bg-[var(--arc-plane)] text-[var(--arc-text-primary)] select-none">
    <!-- Toolbar Component (Search, Filters, Actions & Stats) -->
    <MemoryToolbar
      :search-query="searchQuery"
      :semantic-search="semanticSearch"
      :selected-category="selectedCategory"
      :sort-by="sortBy"
      :loading="loading"
      :stats="stats"
      :translations="translations"
      @create="openCreateModal"
      @export="handleExportJSON"
      @import="handleImportJSON"
      @clear-all="isConfirmClearOpen = true"
      @refresh="handleRefresh"
      @update:search-query="onSearchQueryChange"
      @update:semantic-search="onSemanticSearchToggle"
      @update:selected-category="onCategoryChange"
      @update:sort-by="sortBy = $event"
    />

    <!-- Main Grid Component -->
    <MemoryGrid
      :entries="displayEntries"
      :loading="loading"
      :search-loading="searchLoading"
      :translations="translations"
      @select="selectedDetailMemory = $event"
      @edit="openEditModal"
      @delete="handleDelete"
    />

    <!-- Modals -->
    <MemoryDetailModal
      :entry="selectedDetailMemory"
      @close="selectedDetailMemory = null"
      @delete="handleDelete"
      @edit="openEditModal"
    />

    <MemoryFormModal
      :is-open="isFormModalOpen"
      :initial-data="editingMemory"
      @close="isFormModalOpen = false; editingMemory = null"
      @submit="handleFormSubmit"
    />

    <!-- Safety Confirmation Modal for Clear All -->
    <Teleport to="body">
      <transition name="modal">
        <div v-if="isConfirmClearOpen" class="fixed inset-0 z-[50000] flex items-center justify-center p-4 arc-glass-veil">
          <div class="w-full max-w-sm bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[var(--arc-radius-block,14px)] p-6 shadow-[var(--arc-glass-edge)] flex flex-col items-center text-center space-y-4 select-none">
            <div class="w-10 h-10 rounded-full bg-[var(--arc-hover)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--status-err)]">
              <AlertTriangle class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-sm font-sans font-medium text-[var(--arc-text-primary)]">Очистить всю память?</h3>
              <p class="text-xs text-[var(--arc-text-hint)] mt-1.5 leading-relaxed">
                Удалит все факты из раздела Память. Настройки и модели не затронет.
              </p>
            </div>
            <div class="flex gap-2.5 w-full pt-1">
              <ArcButton 
                variant="secondary" 
                size="sm" 
                @click="isConfirmClearOpen = false" 
                class="flex-1 justify-center"
              >
                Отмена
              </ArcButton>
              <button 
                @click="handleClearAll" 
                class="flex-1 py-1.5 px-3 rounded-[var(--arc-radius-btn,8px)] border border-[var(--arc-hairline)] bg-transparent text-[var(--status-err)] hover:opacity-80 text-xs font-sans font-medium transition cursor-pointer"
              >
                Очистить память
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useMemoryStore } from '../stores/memory.store';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { storeToRefs } from 'pinia';
import { LongTermMemoryEntry, MemoryCategory } from '../../../../shared/types/memory';
import { AlertTriangle } from 'lucide-vue-next';
import ArcButton from '../../../components/ui/ArcButton.vue';
import MemoryToolbar from './MemoryToolbar.vue';
import MemoryGrid from './MemoryGrid.vue';
import MemoryDetailModal from './MemoryDetailModal.vue';
import MemoryFormModal from './MemoryFormModal.vue';

const store = useMemoryStore();
const settingsStore = useSettingsStore();
const { entries, loading, searchLoading, stats } = storeToRefs(store);

const selectedDetailMemory = ref<LongTermMemoryEntry | null>(null);
const editingMemory = ref<LongTermMemoryEntry | null>(null);
const isFormModalOpen = ref(false);
const isConfirmClearOpen = ref(false);

const searchQuery = ref('');
const semanticSearch = ref(false);
const selectedCategory = ref<MemoryCategory | 'all'>('all');
const sortBy = ref<'newest' | 'oldest' | 'confidence' | 'access'>('newest');

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  store.fetchAll();
  store.fetchStats();
});

const handleRefresh = () => {
  if (semanticSearch.value && searchQuery.value.trim()) {
    store.searchEntries(searchQuery.value, selectedCategory.value !== 'all' ? selectedCategory.value : undefined);
  } else {
    store.fetchAll();
  }
  store.fetchStats();
};

const onSearchQueryChange = (val: string) => {
  searchQuery.value = val;
  if (semanticSearch.value) {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      store.searchEntries(searchQuery.value, selectedCategory.value !== 'all' ? selectedCategory.value : undefined);
    }, 250);
  }
};

const onSemanticSearchToggle = (enabled: boolean) => {
  semanticSearch.value = enabled;
  if (enabled && searchQuery.value.trim()) {
    store.searchEntries(searchQuery.value, selectedCategory.value !== 'all' ? selectedCategory.value : undefined);
  } else if (!enabled) {
    store.fetchAll();
  }
};

const onCategoryChange = (cat: MemoryCategory | 'all') => {
  selectedCategory.value = cat;
  if (semanticSearch.value && searchQuery.value.trim()) {
    store.searchEntries(searchQuery.value, cat !== 'all' ? cat : undefined);
  }
};

const openCreateModal = () => {
  editingMemory.value = null;
  isFormModalOpen.value = true;
};

const openEditModal = (entry: LongTermMemoryEntry) => {
  selectedDetailMemory.value = null;
  editingMemory.value = entry;
  isFormModalOpen.value = true;
};

const handleFormSubmit = async (data: Partial<LongTermMemoryEntry>) => {
  if (data.id) {
    await store.updateEntry(data.id, data);
    settingsStore.triggerSyncToast('Узел памяти обновлен', () => {});
  } else {
    await store.createEntry(data);
    settingsStore.triggerSyncToast('Узел памяти создан', () => {});
  }
  isFormModalOpen.value = false;
  editingMemory.value = null;
  if (semanticSearch.value && searchQuery.value.trim()) {
    await store.searchEntries(searchQuery.value, selectedCategory.value !== 'all' ? selectedCategory.value : undefined);
  }
};

const handleDelete = async (id: string) => {
  await store.deleteEntry(id);
  selectedDetailMemory.value = null;
  settingsStore.triggerSyncToast('Узел памяти удален', () => {});
};

const handleClearAll = async () => {
  await store.clearAll();
  isConfirmClearOpen.value = false;
  settingsStore.triggerSyncToast('Память полностью очищена', () => {});
};

const handleExportJSON = () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(entries.value, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `arc_memory_backup_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  settingsStore.triggerSyncToast('Резервная копия памяти экспортирована', () => {});
};

const handleImportJSON = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  
  const file = target.files[0];
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const content = event.target?.result as string;
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const res = await store.importEntries(parsed);
        if (res.success) {
          settingsStore.triggerSyncToast(`Импортировано узлов: ${res.importedCount}`, () => {});
        } else {
          settingsStore.triggerSyncToast(`Ошибка импорта: ${res.error || 'некорректные данные'}`, () => {});
        }
      } else {
        settingsStore.triggerSyncToast('Неверный формат JSON (ожидался массив узлов)', () => {});
      }
    } catch (err) {
      console.error('[MemoryView] Failed to import JSON memory:', err);
      settingsStore.triggerSyncToast('Ошибка чтения JSON файла памяти', () => {});
    }
    target.value = '';
  };
  reader.readAsText(file);
};

const translations = computed(() => {
  const isEn = settingsStore.language === 'EN';
  return {
    memoryCore: isEn ? 'Memory core' : 'Долговременная память',
    systemMemory: isEn ? 'System memory' : 'Системная память',
    total: isEn ? 'Total' : 'Всего',
    refresh: isEn ? 'Refresh memory' : 'Обновить память',
    search: isEn ? 'Search memory nodes...' : 'Поиск узлов памяти...',
    allCategories: isEn ? 'All' : 'Все',
    sortNewest: isEn ? 'Newest first' : 'Сначала новые',
    sortOldest: isEn ? 'Oldest first' : 'Сначала старые',
    sortConfidence: isEn ? 'Confidence' : 'Уверенность',
    sortAccess: isEn ? 'Most accessed' : 'Часто используемые',
    noMemory: isEn ? 'No memory records' : 'Нет записей памяти',
    noMemoryDesc: isEn ? 'The cognitive database is currently empty.' : 'Когнитивная база данных в данный момент пуста.'
  };
});

const displayEntries = computed(() => {
  let result = [...entries.value];
  
  // Client-side category filtering when not doing IPC semantic search (or alongside it)
  if (selectedCategory.value !== 'all' && !semanticSearch.value) {
    result = result.filter(e => e.category === selectedCategory.value);
  }
  
  // Client-side search filtering when semantic search is OFF
  if (!semanticSearch.value && searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    result = result.filter(e => 
      e.key.toLowerCase().includes(q) || 
      (typeof e.value === 'string' && e.value.toLowerCase().includes(q)) ||
      (e.source && e.source.toLowerCase().includes(q))
    );
  }
  
  // Sort entries (when semantic search is active and items have similarity, default order preserves similarity score unless explicit sort)
  if (semanticSearch.value && searchQuery.value.trim() && sortBy.value === 'newest') {
    return result;
  }
  
  return result.sort((a, b) => {
    switch (sortBy.value) {
      case 'newest': return b.created_at - a.created_at;
      case 'oldest': return a.created_at - b.created_at;
      case 'confidence': return b.confidence - a.confidence;
      case 'access': return b.access_count - a.access_count;
      default: return 0;
    }
  });
});
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) rgba(0, 0, 0, 0.2);
  scroll-behavior: smooth;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 1, 0.4, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
