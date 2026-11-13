<template>
  <div class="flex flex-col h-full bg-black/40 border-l border-white/10 w-[300px] shrink-0 font-sans transition-all duration-300 relative select-none">
    
    <!-- Top Action Bar -->
    <div class="p-3 border-b border-white/5 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Brain class="w-4 h-4 text-purple-400" />
        <span class="text-xs font-semibold text-white/90 tracking-wide uppercase">Memory Stream</span>
      </div>
      <button 
        @click="memoryStore.fetchAll"
        class="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        title="Обновить память"
      >
        <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': memoryStore.loading }" />
      </button>
    </div>

    <!-- Memory List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
      <div v-if="memoryStore.loading && memoryStore.entries.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
        <Loader2 class="w-4 h-4 animate-spin text-white/40" />
        <span class="text-[10px] text-white/40 uppercase tracking-widest font-mono">Синхронизация</span>
      </div>
      
      <div v-else-if="memoryStore.entries.length === 0" class="flex flex-col items-center justify-center py-10 gap-3 text-center opacity-50">
        <Database class="w-6 h-6 text-white/40" />
        <span class="text-xs text-white/60">База знаний пуста</span>
      </div>
      
      <div 
        v-else
        v-for="entry in recentEntries" 
        :key="entry.id"
        class="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2 hover:bg-white/10 transition-colors cursor-default group"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 uppercase">
            {{ entry.category || 'general' }}
          </span>
          <span class="text-[9px] text-white/30 font-mono mt-0.5">
            {{ formatTime(entry.created_at) }}
          </span>
        </div>
        <p class="text-xs text-white/80 leading-relaxed font-sans line-clamp-3 group-hover:line-clamp-none transition-all">
          {{ entry.content }}
        </p>
      </div>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Brain, RefreshCw, Loader2, Database } from 'lucide-vue-next';
import { useMemoryStore } from '../../memory/stores/memory.store';

const memoryStore = useMemoryStore();

onMounted(() => {
  if (memoryStore.entries.length === 0) {
    memoryStore.fetchAll();
  }
});

const recentEntries = computed(() => {
  return memoryStore.entries.slice(0, 10);
});

const formatTime = (ts: number | undefined) => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 3px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
</style>
