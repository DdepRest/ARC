<template>
  <div class="flex flex-col gap-1.5">
    <div v-if="task.attachments && task.attachments.length > 0" class="flex flex-wrap items-center gap-1.5">
      <div 
        v-for="att in task.attachments" 
        :key="att.id"
        class="flex items-center gap-1.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] px-2.5 py-1 text-xs font-mono group/att hover:bg-[var(--arc-hover)] transition cursor-pointer"
        @click="openLink(att.url)"
      >
        <component :is="getAttachmentIcon(att.type)" class="w-3.5 h-3.5 text-[var(--arc-text-muted)] group-hover/att:text-[var(--arc-text-primary)] transition-colors shrink-0" />
        <span class="text-[var(--arc-text-secondary)] truncate max-w-[160px] group-hover/att:text-[var(--arc-text-primary)] transition-colors" :title="att.title">{{ att.title }}</span>
        <button 
          type="button"
          @click.stop="tasksStore.removeLink(task.id, att.id)" 
          class="ml-0.5 opacity-0 group-hover/att:opacity-100 p-0.5 hover:bg-[var(--arc-hover)] rounded text-[var(--arc-text-muted)] hover:text-[var(--status-err)] transition cursor-pointer"
          title="Удалить ссылку"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>
    
    <!-- Compact vertical link form tailored for 310px Inspector width -->
    <div v-if="isAddingLink" class="flex flex-col gap-1.5 p-2.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)]">
      <input
        v-model="newLinkUrl"
        type="text"
        placeholder="https://..."
        @keydown.enter.prevent="handleAddLink"
        @keydown.esc.prevent="isAddingLink = false"
        class="w-full h-8 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[var(--radius-control,8px)] px-2.5 text-xs font-mono text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
      />
      <div class="flex items-center gap-1.5">
        <input
          v-model="newLinkTitle"
          type="text"
          placeholder="Название (опционально)"
          @keydown.enter.prevent="handleAddLink"
          @keydown.esc.prevent="isAddingLink = false"
          class="flex-1 min-w-0 h-8 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[var(--radius-control,8px)] px-2.5 text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
        />
        <button
          type="button"
          :disabled="!newLinkUrl.trim()"
          @click="handleAddLink"
          class="h-8 px-2.5 rounded-[var(--radius-control,8px)] bg-[var(--accent)] text-[var(--accent-ink,#0A0A0A)] disabled:opacity-40 text-xs font-mono font-semibold flex items-center justify-center transition cursor-pointer shrink-0"
          title="Сохранить ссылку"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          @click="isAddingLink = false"
          class="h-8 px-2 rounded-[var(--radius-control,8px)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] flex items-center justify-center transition cursor-pointer shrink-0"
          title="Отмена"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    <button
      v-else
      type="button"
      @click="isAddingLink = true"
      class="w-full py-1.5 px-2.5 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center justify-center gap-1.5 transition cursor-pointer"
    >
      <Link class="w-3.5 h-3.5 text-[var(--accent)]" />
      <span>Прикрепить ссылку</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { Link, FileText, Image as ImageIcon, X, Plus } from 'lucide-vue-next';
import { Task } from '../types';

const props = defineProps<{
  task: Task;
}>();

const tasksStore = useTasksStore();

const isAddingLink = ref(false);
const newLinkUrl = ref('');
const newLinkTitle = ref('');

const getAttachmentIcon = (type: string) => {
  if (type === 'image') return ImageIcon;
  if (type === 'file') return FileText;
  return Link;
};

const openLink = (url: string) => {
  window.open(url, '_blank');
};

const handleAddLink = () => {
  if (!newLinkUrl.value.trim()) return;
  const title = newLinkTitle.value.trim() || newLinkUrl.value.trim();
  
  let type: 'link' | 'image' | 'file' = 'link';
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(newLinkUrl.value)) type = 'image';
  else if (/\.(pdf|doc|docx|xls|xlsx|txt)$/i.test(newLinkUrl.value)) type = 'file';

  tasksStore.addLink(props.task.id, {
    id: 'att-' + Date.now(),
    url: newLinkUrl.value,
    title,
    type
  });
  
  newLinkUrl.value = '';
  newLinkTitle.value = '';
  isAddingLink.value = false;
};
</script>
