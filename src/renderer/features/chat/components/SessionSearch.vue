<template>
  <ArcInput
    v-model="sessionsStore.searchQuery"
    @update:model-value="onSearch"
    placeholder="Поиск по истории..."
    size="sm"
  >
    <template #prefix>
      <Search class="w-3.5 h-3.5 text-[var(--arc-text-hint)] pointer-events-none" />
    </template>
    <template #suffix v-if="sessionsStore.searchQuery">
      <button 
        @click="clearSearch"
        class="text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] text-xs p-0.5 rounded-full cursor-pointer"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </template>
  </ArcInput>
</template>

<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { useSessionsStore } from '../stores/sessions.store';
import ArcInput from '../../../components/ui/ArcInput.vue';

const sessionsStore = useSessionsStore();
let searchTimeout: any = null;

const onSearch = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (sessionsStore.searchQuery) {
      sessionsStore.searchSessions(sessionsStore.searchQuery);
    } else {
      sessionsStore.loadSessions();
    }
  }, 250);
};

const clearSearch = () => {
  sessionsStore.searchQuery = '';
  sessionsStore.loadSessions();
};
</script>
