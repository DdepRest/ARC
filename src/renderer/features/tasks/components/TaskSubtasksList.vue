<template>
  <div class="mt-1 flex flex-col gap-1.5">
    <!-- List of Subtasks -->
    <TransitionGroup name="list" tag="div" class="flex flex-col gap-1">
      <div 
        v-for="(sub, sIdx) in (task.subtasks || [])" 
        :key="sub.id"
        @click="tasksStore.toggleSubtask(task.id, sub.id)"
        class="group/sub flex items-start gap-2 bg-[var(--arc-block)] px-2.5 py-1.5 rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] transition hover:bg-[var(--arc-hover)] cursor-pointer"
        :class="{ 'opacity-65': sub.completed }"
      >
        <button
          type="button"
          role="checkbox"
          :aria-checked="sub.completed"
          @click.stop="tasksStore.toggleSubtask(task.id, sub.id)"
          class="mt-0.5 w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          :class="sub.completed
            ? 'border-[var(--status-ok)] bg-[var(--arc-selected)] text-[var(--status-ok)]'
            : 'border-[rgba(255,255,255,0.35)] bg-[var(--arc-input)] hover:border-[var(--arc-text-primary)]'"
        >
          <Check class="w-3 h-3 stroke-[2.5]" :class="sub.completed ? 'opacity-100' : 'opacity-0'" />
        </button>

        <div class="flex-1 min-w-0">
          <span 
            class="text-xs font-sans font-medium break-words select-text transition leading-snug block"
            :class="[sub.completed ? 'text-[var(--arc-text-muted)] line-through' : 'text-[var(--arc-text-primary)]']"
          >
            {{ sub.text }}
          </span>
        </div>

        <div class="flex items-center gap-0.5 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0" @click.stop>
          <button 
            type="button"
            @click.stop="tasksStore.reorderSubtask(task.id, sub.id, 'up')" 
            :disabled="sIdx === 0" 
            class="p-0.5 hover:bg-[var(--arc-selected)] rounded text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer" 
            title="Выше"
          >
            <ArrowUp class="w-3 h-3" />
          </button>
          <button 
            type="button"
            @click.stop="tasksStore.reorderSubtask(task.id, sub.id, 'down')" 
            :disabled="sIdx === (task.subtasks?.length || 0) - 1" 
            class="p-0.5 hover:bg-[var(--arc-selected)] rounded text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer" 
            title="Ниже"
          >
            <ArrowDown class="w-3 h-3" />
          </button>
          <button 
            type="button"
            @click.stop="tasksStore.deleteSubtask(task.id, sub.id)" 
            class="p-0.5 hover:bg-[var(--arc-hover)] rounded text-[var(--arc-text-muted)] hover:text-[var(--status-err)] transition-colors cursor-pointer" 
            title="Удалить шаг"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
    </TransitionGroup>

    <!-- Add new subtask input (Concise placeholder, no 14px font clipping) -->
    <div class="flex items-center gap-1.5 mt-0.5">
      <input
        v-model="newSubtaskText"
        type="text"
        placeholder="Новый шаг... (Enter)"
        @keydown.enter.prevent="handleAdd"
        class="flex-1 min-w-0 h-8 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[var(--radius-control,8px)] px-2.5 text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
      />
      <button
        type="button"
        @click="handleAdd"
        :disabled="!newSubtaskText.trim()"
        class="h-8 px-2.5 rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center justify-center shrink-0"
        title="Добавить шаг"
      >
        <Plus class="w-3.5 h-3.5 text-[var(--accent)]" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { ArrowUp, ArrowDown, Trash2, Plus, Check } from 'lucide-vue-next';
import { Task } from '../types';

const props = defineProps<{
  task: Task;
}>();

const tasksStore = useTasksStore();
const newSubtaskText = ref('');

const handleAdd = () => {
  if (newSubtaskText.value.trim()) {
    tasksStore.addSubtask(props.task.id, newSubtaskText.value.trim());
    newSubtaskText.value = '';
  }
};
</script>
