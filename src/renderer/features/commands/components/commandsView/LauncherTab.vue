<template>
  <div class="space-y-6 max-w-3xl">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-sans font-semibold text-[var(--arc-text-primary)] truncate">
          Индексация приложений
        </h2>
        <p class="text-xs text-[var(--arc-text-secondary)] mt-0.5 truncate max-w-xl">
          Настройка директорий для нечеткого поиска и мгновенного запуска
        </p>
      </div>
      <ArcButton 
        variant="secondary"
        size="sm"
        @click="launcherStore.refreshIndex()" 
        :disabled="indexing"
      >
        <template #icon>
          <Loader2 v-if="indexing" class="w-3.5 h-3.5 animate-spin" />
          <RefreshCw v-else class="w-3.5 h-3.5" /> 
        </template>
        {{ indexing ? 'Обновление...' : 'Обновить индекс' }}
      </ArcButton>
    </div>

    <!-- Folders Section -->
    <div class="space-y-2.5">
      <div class="flex items-center justify-between px-1">
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-muted)] tracking-wider uppercase">
          Доверенные директории ({{ folders.length }})
        </span>
        <span
          v-if="launcherStore.lastIndexedCount !== null"
          class="text-xs font-mono text-[var(--arc-text-secondary)]"
        >
          В индексе: {{ launcherStore.lastIndexedCount }}
        </span>
      </div>

      <!-- Tactile Obsidian Instrument Container -->
      <div 
        class="border border-[var(--arc-hairline)] rounded-[16px] divide-y divide-[var(--arc-divider)] bg-[var(--arc-block)] overflow-hidden"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
        }"
      >
        <div 
          v-if="folders.length === 0" 
          class="p-6 text-center text-xs font-mono text-[var(--arc-text-muted)]"
        >
          Директории не добавлены
        </div>

        <div 
          v-for="folder in folders" 
          :key="folder" 
          class="p-3.5 hover:bg-[var(--arc-hover)] transition-colors flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-7 h-7 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex items-center justify-center shrink-0">
              <Folder class="w-3.5 h-3.5 text-[var(--accent)]" />
            </div>
            <span class="font-mono text-xs text-[var(--arc-text-primary)] truncate">{{ folder }}</span>
          </div>
          <button 
            @click="launcherStore.removeFolder(folder)" 
            class="p-1.5 rounded-[8px] text-[var(--status-err)] hover:bg-[var(--arc-plane)] transition-colors cursor-pointer shrink-0"
            title="Удалить директорию"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Add folder button -->
      <button 
        @click="launcherStore.addFolder()" 
        class="w-full py-2.5 border border-dashed border-[var(--arc-hairline)] rounded-[12px] bg-[var(--arc-plane)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] hover:bg-[var(--arc-hover)] transition-colors text-xs font-mono font-medium flex items-center justify-center gap-2 cursor-pointer"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
      >
        <Plus class="w-3.5 h-3.5 text-[var(--accent)]" /> 
        Добавить директорию
      </button>
    </div>

    <!-- Search & Launch Section -->
    <div class="space-y-2.5">
      <div class="flex items-center justify-between px-1">
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-muted)] tracking-wider uppercase">
          Поиск и запуск приложений
        </span>
        <span
          v-if="launcherStore.searchResults?.length"
          class="text-xs font-mono text-[var(--arc-text-muted)]"
        >
          Найдено: {{ launcherStore.searchResults.length }}
        </span>
      </div>

      <div class="relative">
        <Search class="w-3.5 h-3.5 text-[var(--arc-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          v-model="localQuery"
          type="text"
          placeholder="Введите название приложения (.exe, .lnk, .bat, .cmd)..."
          class="w-full pl-9 pr-3.5 py-2.5 rounded-[12px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          @input="onQueryInput"
        />
      </div>

      <div class="border border-[var(--arc-hairline)] rounded-[16px] divide-y divide-[var(--arc-divider)] bg-[var(--arc-block)] overflow-hidden">
        <div
          v-if="!launcherStore.searchResults || launcherStore.searchResults.length === 0"
          class="p-6 text-center text-xs font-mono text-[var(--arc-text-muted)]"
        >
          {{ folders.length === 0 ? 'Добавьте доверенную директорию и обновите индекс' : 'Приложения не найдены' }}
        </div>

        <div
          v-for="item in launcherStore.searchResults"
          :key="item.path"
          class="p-3 hover:bg-[var(--arc-hover)] transition-colors flex items-center justify-between gap-3"
        >
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-sans font-medium text-[var(--arc-text-primary)] truncate">
                {{ item.name }}
              </span>
              <span class="px-1.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono uppercase text-[var(--arc-text-secondary)] shrink-0">
                {{ item.type }}
              </span>
            </div>
            <div class="text-xs font-mono text-[var(--arc-text-muted)] truncate">
              {{ item.path }}
            </div>
          </div>
          <ArcButton
            variant="secondary"
            size="sm"
            @click="launcherStore.launchApp(item.path)"
          >
            <template #icon>
              <Play class="w-3.5 h-3.5 text-[var(--accent)]" />
            </template>
            Запустить
          </ArcButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Loader2, RefreshCw, Folder, Trash2, Plus, Search, Play } from 'lucide-vue-next';
import ArcButton from '../../../../components/ui/ArcButton.vue';

const props = defineProps<{
  settingsStore: any;
  launcherStore: any;
  folders: string[];
  indexing: boolean;
}>();

const localQuery = ref(props.launcherStore?.searchQuery || '');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onQueryInput() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    props.launcherStore?.search?.(localQuery.value);
  }, 200);
}

onMounted(() => {
  props.launcherStore?.search?.(localQuery.value);
});

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});
</script>

