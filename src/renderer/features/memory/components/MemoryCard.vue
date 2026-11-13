<template>
  <div 
    class="group flex flex-col p-4 rounded-[16px] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] transition-all duration-200 relative overflow-hidden select-none"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <!-- Top Row: Category, Metadata & Ghost Actions -->
    <div class="flex justify-between items-start mb-2.5 gap-2">
      <!-- Category Badge -->
      <div 
        class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[8px] text-xs font-mono font-medium uppercase tracking-wider border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] bg-[var(--arc-plane)] shrink-0"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        <component :is="categoryIcon" class="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>{{ categoryLabel }}</span>
      </div>

      <div class="flex items-center gap-1.5 flex-wrap justify-end">
        <!-- Semantic Similarity Match Badge -->
        <div 
          v-if="entry.similarity !== undefined" 
          class="flex items-center gap-1 border border-[var(--arc-hairline)] text-[var(--status-ok)] rounded-[8px] px-2 py-0.5 text-xs font-mono font-medium tracking-tight bg-[var(--arc-plane)]"
          title="Степень релевантности векторного поиска"
        >
          <Sparkles class="w-3 h-3" />
          <span>{{ entry.similarity }}%</span>
        </div>

        <!-- Vector Embedding Indicator -->
        <div 
          v-if="hasEmbedding" 
          class="flex items-center justify-center w-6 h-6 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--status-ok)] text-xs bg-[var(--arc-plane)]"
          title="Векторное представление доступно для поиска"
        >
          <Brain class="w-3.5 h-3.5" />
        </div>
        
        <!-- Confidence Badge -->
        <div 
          class="flex items-center gap-1.5 border border-[var(--arc-hairline)] rounded-[8px] px-2 py-0.5 bg-[var(--arc-plane)]" 
          :title="`Достоверность данных: ${(entry.confidence * 100).toFixed(0)}%`"
        >
          <span 
            class="w-1.5 h-1.5 rounded-full inline-block" 
            :class="entry.confidence >= 0.8 ? 'bg-[var(--status-ok)]' : entry.confidence >= 0.5 ? 'bg-[var(--status-warn)]' : 'bg-[var(--status-err)]'"
          ></span>
          <span class="text-xs font-mono text-[var(--arc-text-secondary)]">
            {{ (entry.confidence * 100).toFixed(0) }}%
          </span>
        </div>
        
        <!-- Ghost Action Buttons -->
        <div class="flex items-center gap-0.5 ml-0.5 pl-1 border-l border-[var(--arc-divider)]">
          <button 
            @click.stop="$emit('edit', entry)"
            class="p-1 hover:text-[var(--arc-text-primary)] rounded text-[var(--arc-text-muted)] transition-colors cursor-pointer"
            title="Редактировать запись"
          >
            <Edit3 class="w-3.5 h-3.5" />
          </button>
          <button 
            @click.stop="$emit('delete', entry.id)"
            class="p-1 text-[var(--status-err)] hover:opacity-80 rounded transition-opacity cursor-pointer"
            title="Удалить запись"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Title -->
    <h3 
      @click="$emit('select', entry)" 
      class="text-sm font-sans font-semibold text-[var(--arc-text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer truncate mt-1"
    >
      {{ entry.key }}
    </h3>
    
    <!-- Description -->
    <p class="text-xs font-sans text-[var(--arc-text-secondary)] line-clamp-3 my-2 break-all flex-1 leading-relaxed">
      {{ typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value) }}
    </p>
    
    <!-- Footer -->
    <div class="flex items-center justify-between mt-auto pt-2.5 border-t border-[var(--arc-divider)] text-xs font-mono text-[var(--arc-text-muted)]">
      <span class="truncate" :title="entry.source">
        Источник: {{ sourceLabel }}
      </span>
      <div class="flex items-center gap-1 shrink-0" title="Количество обращений">
        <Activity class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" />
        {{ entry.access_count }} обр.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type LongTermMemoryEntry } from '../../../../shared/types/memory';
import { 
  FileText, Heart, Brain, Activity, Database, Edit3, Trash2, Sparkles 
} from 'lucide-vue-next';

const props = defineProps<{
  entry: LongTermMemoryEntry;
}>();

defineEmits<{
  (e: 'select', entry: LongTermMemoryEntry): void;
  (e: 'edit', entry: LongTermMemoryEntry): void;
  (e: 'delete', id: string): void;
}>();

const hasEmbedding = computed(() => {
  return props.entry.embedding && Array.isArray(props.entry.embedding) && props.entry.embedding.length > 0;
});

const categoryIcon = computed(() => {
  switch (props.entry.category) {
    case 'fact': return FileText;
    case 'preference': return Heart;
    case 'knowledge': return Brain;
    case 'event': return Activity;
    default: return Database;
  }
});

const categoryLabel = computed(() => {
  switch (props.entry.category) {
    case 'fact': return 'Факт';
    case 'preference': return 'Предпочтение';
    case 'knowledge': return 'Знание';
    case 'event': return 'Событие';
    default: return 'Общее';
  }
});

const sourceLabel = computed(() => {
  switch (props.entry.source) {
    case 'user_stated': return 'Пользователь';
    case 'inferred': return 'Вывод модели';
    case 'extracted': return 'Диалог';
    case 'system': return 'Система';
    default: return props.entry.source || 'Авто';
  }
});
</script>
