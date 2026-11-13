<template>
  <div 
    class="group relative flex flex-col px-2.5 py-2 rounded-lg cursor-pointer transition duration-150 border-l-2"
    :class="[
      isActive 
        ? 'bg-[var(--arc-selected)] border-l-[var(--accent)]' 
        : 'border-l-transparent hover:bg-[var(--arc-hover)]'
    ]"
    :title="session.name || 'Новый диалог'"
    @click="$emit('select', session.id)"
  >
    <div class="flex items-start justify-between gap-2 mb-0.5">
      <!-- Inline rename or title display -->
      <div class="flex items-center gap-1.5 flex-1 min-w-0">
        <Pin 
          v-if="session.is_pinned" 
          class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0 fill-[var(--status-warn)]" 
          title="Закреплено" 
        />
        
        <div v-if="isEditing" class="flex-1 min-w-0" @click.stop>
          <input 
            ref="inlineInputRef"
            :value="editValue"
            @input="editValue = ($event.target as HTMLInputElement).value"
            @blur="saveInlineRename"
            @keyup.enter="saveInlineRename"
            @keyup.esc="cancelInlineRename"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded px-1.5 py-0.5 text-xs text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] font-sans"
          />
        </div>
        <span 
          v-else 
          @dblclick.stop="startInlineRename"
          class="font-medium text-xs font-sans transition-colors break-words line-clamp-2"
          :class="isActive ? 'text-[var(--arc-text-primary)] font-semibold' : 'text-[var(--arc-text-secondary)] group-hover:text-[var(--arc-text-primary)]'"
          :title="session.name || 'Новый диалог'"
        >
          {{ displaySessionName }}
        </span>
      </div>
      
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-[10px] font-mono whitespace-nowrap" :class="isActive ? 'text-[var(--arc-text-hint)]' : 'text-[var(--arc-text-machine)] group-hover:text-[var(--arc-text-hint)]'">
          {{ formatSessionDate(session.updated_at) }}
        </span>
        <!-- Context Menu Button -->
        <button 
          @click.stop="(e) => $emit('context-menu', e, session)"
          class="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-[var(--arc-hover)] transition cursor-pointer text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)]"
        >
          <MoreVertical class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    
    <div class="flex items-start justify-between mt-0.5 gap-2 cursor-pointer" @click.stop="isSummaryExpanded = !isSummaryExpanded">
      <span 
        class="text-xs font-sans text-[var(--arc-text-hint)] flex-1 min-w-0 transition-colors hover:text-[var(--arc-text-secondary)]"
        :class="isSummaryExpanded ? 'break-words whitespace-normal' : 'truncate'"
        :title="isSummaryExpanded ? 'Скрыть полный текст' : (session.summary || 'Показать полный текст')"
      >
        {{ session.summary || '...' }}
      </span>
      <span v-if="session.message_count" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--arc-block)] text-[var(--arc-text-machine)] shrink-0">
        {{ session.message_count }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { Pin, MoreVertical } from 'lucide-vue-next';
import type { Session } from '../stores/sessions.store';

const isSummaryExpanded = ref(false);

const props = defineProps<{
  session: Session;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: number): void;
  (e: 'context-menu', event: MouseEvent, session: Session): void;
  (e: 'update-name', id: number, newName: string): void;
}>();

const formatSessionDate = (dateVal: string | number | undefined | Date) => {
  if (!dateVal) return '';
  try {
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (!d || isNaN(d.getTime()) || typeof d.toLocaleTimeString !== 'function') return '';
    
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (isYesterday) {
      return 'Вчера';
    } else {
      return typeof d.toLocaleDateString === 'function' 
        ? d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) 
        : '';
    }
  } catch {
    return '';
  }
};

const isEditing = ref(false);
const editValue = ref('');
const inlineInputRef = ref<HTMLInputElement | null>(null);

const displaySessionName = computed(() => {
  const name = props.session.name || 'Новый диалог';
  if (name.length > 40) {
    return name.substring(0, 38) + '...';
  }
  return name;
});

const startInlineRename = () => {
  isEditing.value = true;
  editValue.value = props.session.name || '';
  nextTick(() => {
    if (inlineInputRef.value) {
      inlineInputRef.value.focus();
      inlineInputRef.value.select();
    }
  });
};

const saveInlineRename = () => {
  if (!isEditing.value) return;
  const newName = editValue.value.trim();
  isEditing.value = false;
  if (newName && newName !== props.session.name) {
    emit('update-name', props.session.id, newName);
  }
};

const cancelInlineRename = () => {
  isEditing.value = false;
};
</script>
