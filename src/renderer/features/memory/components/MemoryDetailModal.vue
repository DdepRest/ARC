<template>
  <ArcModal
    :show="!!entry"
    title="Детали узла"
    subtitle="Сведения о записи долговременной памяти"
    @close="$emit('close')"
    maxWidth="max-w-2xl"
  >
    <template #title-prefix>
      <Database class="w-4 h-4 text-[var(--arc-text-muted)]" />
    </template>
    
    <div v-if="entry" class="flex flex-col max-h-[80vh] space-y-5">
      <!-- Modal Header Info -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--arc-hairline)]">
        <div class="flex items-center gap-3">
          <div 
            class="w-10 h-10 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center shrink-0"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
          >
            <component :is="categoryIcon" class="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <span class="text-xs font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] bg-[var(--arc-block)] inline-block mb-1">
              {{ categoryLabel }}
            </span>
            <h3 class="text-sm font-sans font-semibold text-[var(--arc-text-primary)] truncate max-w-md">
              {{ entry.key }}
            </h3>
          </div>
        </div>
      </div>

      <!-- Memory Value -->
      <div>
        <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider block mb-1.5">Содержимое узла</span>
        <div 
          class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[12px] p-4 font-mono text-xs text-[var(--arc-text-primary)] whitespace-pre-wrap break-words leading-relaxed select-text"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
        >
          {{ formattedValue }}
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div 
          class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[10px] p-2.5"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase mb-1">Уверенность</span>
          <div class="flex items-center gap-1.5">
            <span 
              class="w-1.5 h-1.5 rounded-full inline-block" 
              :class="entry.confidence >= 0.8 ? 'bg-[var(--status-ok)]' : entry.confidence >= 0.5 ? 'bg-[var(--status-warn)]' : 'bg-[var(--status-err)]'"
            ></span>
            <span class="text-xs font-mono font-medium text-[var(--arc-text-primary)]">{{ (entry.confidence * 100).toFixed(0) }}%</span>
          </div>
        </div>

        <div 
          class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[10px] p-2.5"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
          title="Наличие векторного эмбеддинга для семантического поиска"
        >
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase mb-1">Вектор</span>
          <span class="text-xs font-mono font-medium truncate" :class="hasEmbedding ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'">
            {{ hasEmbedding ? '384 dim' : 'Отсутствует' }}
          </span>
        </div>
        
        <div 
          class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[10px] p-2.5"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase mb-1">Источник</span>
          <span class="text-xs font-mono font-medium text-[var(--arc-text-primary)] truncate" :title="sourceLabel">{{ sourceLabel }}</span>
        </div>
        
        <div 
          class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[10px] p-2.5"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase mb-1">Создано</span>
          <span class="text-xs font-mono font-medium text-[var(--arc-text-primary)] truncate">{{ formatCreatedDate(entry.created_at) }}</span>
        </div>
        
        <div 
          class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[10px] p-2.5"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase mb-1">Доступ</span>
          <span class="text-xs font-mono font-medium text-[var(--arc-text-primary)] truncate">{{ entry.access_count }} раз</span>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="pt-4 border-t border-[var(--arc-hairline)] flex justify-between items-center gap-3">
        <button 
          @click="$emit('delete', entry.id)" 
          class="flex items-center gap-1.5 text-xs text-[var(--status-err)] hover:opacity-80 border border-[var(--arc-hairline)] bg-[var(--arc-block)] px-3 py-1.5 rounded-[10px] font-mono font-medium transition cursor-pointer"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Удалить запись</span>
        </button>
        
        <div class="flex items-center gap-2">
          <ArcButton 
            variant="secondary"
            size="sm"
            @click="$emit('edit', entry)"
          >
            <template #icon>
              <Edit3 class="w-3.5 h-3.5" />
            </template>
            <span>Редактировать</span>
          </ArcButton>

          <ArcButton 
            variant="secondary"
            size="sm"
            @click="$emit('close')"
          >
            <span>Закрыть</span>
          </ArcButton>
        </div>
      </div>
    </div>
  </ArcModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type LongTermMemoryEntry } from '../../../../shared/types/memory';
import { Trash2, Edit3, Database, FileText, Heart, Brain, Activity } from 'lucide-vue-next';
import ArcModal from '../../../components/ui/ArcModal.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';

const props = defineProps<{
  entry: LongTermMemoryEntry | null;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'delete', id: string): void;
  (e: 'edit', entry: LongTermMemoryEntry): void;
}>();

const formatCreatedDate = (ts: any) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) || typeof d.toLocaleDateString !== 'function' ? '' : d.toLocaleDateString();
  } catch {
    return '';
  }
};

const hasEmbedding = computed(() => {
  return props.entry?.embedding && Array.isArray(props.entry.embedding) && props.entry.embedding.length > 0;
});

const categoryIcon = computed(() => {
  switch (props.entry?.category) {
    case 'fact': return FileText;
    case 'preference': return Heart;
    case 'knowledge': return Brain;
    case 'event': return Activity;
    default: return Database;
  }
});

const categoryLabel = computed(() => {
  switch (props.entry?.category) {
    case 'fact': return 'Факт';
    case 'preference': return 'Предпочтение';
    case 'knowledge': return 'Знание';
    case 'event': return 'Событие';
    default: return 'Общее';
  }
});

const sourceLabel = computed(() => {
  switch (props.entry?.source) {
    case 'user_stated': return 'Пользователь';
    case 'inferred': return 'Вывод модели';
    case 'extracted': return 'Диалог';
    case 'system': return 'Система';
    default: return props.entry?.source || 'Авто';
  }
});

const formattedValue = computed(() => {
  if (!props.entry) return '';
  if (typeof props.entry.value === 'string') {
    try {
      const parsed = JSON.parse(props.entry.value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return props.entry.value;
    }
  }
  return JSON.stringify(props.entry.value, null, 2);
});
</script>
