<template>
  <div class="flex-1 relative min-h-[350px]">
    <!-- Loading overlay (plane background, zero canvas blur) -->
    <div v-if="(loading && entries.length === 0) || searchLoading" class="absolute inset-0 flex flex-col items-center justify-center bg-[var(--arc-plane)] rounded-[16px] z-10">
      <div class="w-8 h-8 border-2 border-[var(--arc-hairline)] border-t-[var(--accent)] rounded-full animate-spin mb-3"></div>
      <span class="text-xs font-mono text-[var(--arc-text-muted)] tracking-wider uppercase">
        {{ searchLoading ? 'Семантический поиск векторов...' : 'Загрузка когнитивных узлов...' }}
      </span>
    </div>
    
    <!-- Empty State -->
    <EmptyState 
      v-else-if="entries.length === 0" 
      :title="translations.noMemory || 'Нет записей памяти'" 
      :description="translations.noMemoryDesc || 'Когнитивная база данных в данный момент пуста.'" 
      icon="database" 
      class="mt-12"
    />
    
    <!-- Memory Cards Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <MemoryCard
        v-for="entry in entries" 
        :key="entry.id"
        :entry="entry"
        @select="$emit('select', entry)"
        @edit="$emit('edit', entry)"
        @delete="$emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { type LongTermMemoryEntry } from '../../../../shared/types/memory';
import EmptyState from '../../../components/ui/EmptyState.vue';
import MemoryCard from './MemoryCard.vue';

defineProps<{
  entries: LongTermMemoryEntry[];
  loading: boolean;
  searchLoading?: boolean;
  translations: Record<string, string>;
}>();

defineEmits<{
  (e: 'select', entry: LongTermMemoryEntry): void;
  (e: 'edit', entry: LongTermMemoryEntry): void;
  (e: 'delete', id: string): void;
}>();
</script>
