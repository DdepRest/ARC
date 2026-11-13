<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-[var(--widget-gap-lg)] w-full select-none">
    <!-- Quadrant 1 -->
    <div 
      class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-2xl p-4 flex flex-col gap-3 min-h-[220px] transition-colors duration-200"
      :class="{ 'border-[var(--status-err)] bg-[var(--arc-selected)]': dragOverQuadrant === 'urgent-important' }"
      @dragover.prevent="dragOverQuadrant = 'urgent-important'"
      @dragleave.prevent="dragOverQuadrant = null"
      @drop.prevent="onDrop($event, 'urgent-important')"
    >
      <div class="flex items-center justify-between border-b border-[var(--arc-hairline)] pb-2.5">
        <div class="flex items-center gap-2">
          <AlertOctagon class="w-4 h-4 text-[var(--status-err)]" />
          <h3 class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-primary)]">Q1 · Срочно и Важно (Do First)</h3>
        </div>
        <span class="text-[10px] font-mono bg-[var(--arc-plane)] text-[var(--status-err)] px-2.5 py-0.5 rounded-full border border-[var(--arc-hairline)]">{{ q1Tasks.length }}</span>
      </div>
      <div class="flex flex-col gap-2 flex-1">
        <div 
          v-for="task in q1Tasks" 
          :key="task.id" 
          draggable="true" 
          @dragstart="onDragStart($event, task)" 
          @dragend="dragOverQuadrant = null" 
          @click="tasksStore.toggleExpand(task.id)"
          class="p-2.5 rounded-xl bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] hover:border-[var(--status-err)] transition cursor-pointer active:cursor-grabbing border border-[var(--arc-hairline)]" 
          :class="{ 
            'opacity-50': draggingTaskId === task.id,
            '!bg-[var(--arc-selected)] border-l-2 !border-l-[var(--accent)]': tasksStore.expandedTaskId === task.id
          }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <ArcCheckbox :model-value="task.completed" @update:model-value="tasksStore.toggleTask(task.id)" class="scale-75" />
              <span class="text-xs font-mono text-[var(--arc-text-primary)] truncate" :title="task.text" :class="{ 'line-through !text-[var(--arc-text-muted)]': task.completed }">{{ task.text }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button @click.stop="tasksStore.startFocusSprint(task.id)" class="p-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-selected)] text-[var(--accent)] transition cursor-pointer"><Timer class="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
        <div v-if="q1Tasks.length === 0" class="text-xs font-mono text-[var(--arc-text-hint)] italic text-center py-6 pointer-events-none">Квадрант пуст</div>
      </div>
    </div>

    <!-- Quadrant 2 -->
    <div 
      class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-2xl p-4 flex flex-col gap-3 min-h-[220px] transition-colors duration-200"
      :class="{ 'border-[var(--status-warn)] bg-[var(--arc-selected)]': dragOverQuadrant === 'important' }"
      @dragover.prevent="dragOverQuadrant = 'important'"
      @dragleave.prevent="dragOverQuadrant = null"
      @drop.prevent="onDrop($event, 'important')"
    >
      <div class="flex items-center justify-between border-b border-[var(--arc-hairline)] pb-2.5">
        <div class="flex items-center gap-2">
          <Star class="w-4 h-4 text-[var(--status-warn)]" />
          <h3 class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-primary)]">Q2 · Важно, Не срочно (Schedule)</h3>
        </div>
        <span class="text-[10px] font-mono bg-[var(--arc-plane)] text-[var(--status-warn)] px-2.5 py-0.5 rounded-full border border-[var(--arc-hairline)]">{{ q2Tasks.length }}</span>
      </div>
      <div class="flex flex-col gap-2 flex-1">
        <div 
          v-for="task in q2Tasks" 
          :key="task.id" 
          draggable="true" 
          @dragstart="onDragStart($event, task)" 
          @dragend="dragOverQuadrant = null" 
          @click="tasksStore.toggleExpand(task.id)"
          class="p-2.5 rounded-xl bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] hover:border-[var(--status-warn)] transition cursor-pointer active:cursor-grabbing border border-[var(--arc-hairline)]" 
          :class="{ 
            'opacity-50': draggingTaskId === task.id,
            '!bg-[var(--arc-selected)] border-l-2 !border-l-[var(--accent)]': tasksStore.expandedTaskId === task.id
          }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <ArcCheckbox :model-value="task.completed" @update:model-value="tasksStore.toggleTask(task.id)" class="scale-75" />
              <span class="text-xs font-mono text-[var(--arc-text-primary)] truncate" :title="task.text" :class="{ 'line-through !text-[var(--arc-text-muted)]': task.completed }">{{ task.text }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button @click.stop="tasksStore.startFocusSprint(task.id)" class="p-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-selected)] text-[var(--accent)] transition cursor-pointer"><Timer class="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
        <div v-if="q2Tasks.length === 0" class="text-xs font-mono text-[var(--arc-text-hint)] italic text-center py-6 pointer-events-none">Квадрант пуст</div>
      </div>
    </div>

    <!-- Quadrant 3 -->
    <div 
      class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-2xl p-4 flex flex-col gap-3 min-h-[220px] transition-colors duration-200"
      :class="{ 'border-[var(--accent)] bg-[var(--arc-selected)]': dragOverQuadrant === 'urgent' }"
      @dragover.prevent="dragOverQuadrant = 'urgent'"
      @dragleave.prevent="dragOverQuadrant = null"
      @drop.prevent="onDrop($event, 'urgent')"
    >
      <div class="flex items-center justify-between border-b border-[var(--arc-hairline)] pb-2.5">
        <div class="flex items-center gap-2">
          <Clock class="w-4 h-4 text-[var(--accent)]" />
          <h3 class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-primary)]">Q3 · Срочно, Не важно (Delegate)</h3>
        </div>
        <span class="text-[10px] font-mono bg-[var(--arc-plane)] text-[var(--accent)] px-2.5 py-0.5 rounded-full border border-[var(--arc-hairline)]">{{ q3Tasks.length }}</span>
      </div>
      <div class="flex flex-col gap-2 flex-1">
        <div 
          v-for="task in q3Tasks" 
          :key="task.id" 
          draggable="true" 
          @dragstart="onDragStart($event, task)" 
          @dragend="dragOverQuadrant = null" 
          @click="tasksStore.toggleExpand(task.id)"
          class="p-2.5 rounded-xl bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] hover:border-[var(--accent)] transition cursor-pointer active:cursor-grabbing border border-[var(--arc-hairline)]" 
          :class="{ 
            'opacity-50': draggingTaskId === task.id,
            '!bg-[var(--arc-selected)] border-l-2 !border-l-[var(--accent)]': tasksStore.expandedTaskId === task.id
          }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <ArcCheckbox :model-value="task.completed" @update:model-value="tasksStore.toggleTask(task.id)" class="scale-75" />
              <span class="text-xs font-mono text-[var(--arc-text-primary)] truncate" :title="task.text" :class="{ 'line-through !text-[var(--arc-text-muted)]': task.completed }">{{ task.text }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button @click.stop="tasksStore.startFocusSprint(task.id)" class="p-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-selected)] text-[var(--accent)] transition cursor-pointer"><Timer class="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
        <div v-if="q3Tasks.length === 0" class="text-xs font-mono text-[var(--arc-text-hint)] italic text-center py-6 pointer-events-none">Квадрант пуст</div>
      </div>
    </div>

    <!-- Quadrant 4 -->
    <div 
      class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-2xl p-4 flex flex-col gap-3 min-h-[220px] transition-colors duration-200"
      :class="{ 'border-[var(--arc-text-muted)] bg-[var(--arc-selected)]': dragOverQuadrant === 'regular' }"
      @dragover.prevent="dragOverQuadrant = 'regular'"
      @dragleave.prevent="dragOverQuadrant = null"
      @drop.prevent="onDrop($event, 'regular')"
    >
      <div class="flex items-center justify-between border-b border-[var(--arc-hairline)] pb-2.5">
        <div class="flex items-center gap-2">
          <MinusCircle class="w-4 h-4 text-[var(--arc-text-muted)]" />
          <h3 class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-muted)]">Q4 · Не срочно, Не важно (Eliminate)</h3>
        </div>
        <span class="text-[10px] font-mono bg-[var(--arc-plane)] text-[var(--arc-text-muted)] px-2.5 py-0.5 rounded-full border border-[var(--arc-hairline)]">{{ q4Tasks.length }}</span>
      </div>
      <div class="flex flex-col gap-2 flex-1">
        <div 
          v-for="task in q4Tasks" 
          :key="task.id" 
          draggable="true" 
          @dragstart="onDragStart($event, task)" 
          @dragend="dragOverQuadrant = null" 
          @click="tasksStore.toggleExpand(task.id)"
          class="p-2.5 rounded-xl bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] transition cursor-pointer active:cursor-grabbing border border-[var(--arc-hairline)]" 
          :class="{ 
            'opacity-50': draggingTaskId === task.id,
            '!bg-[var(--arc-selected)] border-l-2 !border-l-[var(--accent)]': tasksStore.expandedTaskId === task.id
          }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <ArcCheckbox :model-value="task.completed" @update:model-value="tasksStore.toggleTask(task.id)" class="scale-75" />
              <span class="text-xs font-mono text-[var(--arc-text-primary)] truncate" :title="task.text" :class="{ 'line-through !text-[var(--arc-text-muted)]': task.completed }">{{ task.text }}</span>
            </div>
          </div>
        </div>
        <div v-if="q4Tasks.length === 0" class="text-xs font-mono text-[var(--arc-text-hint)] italic text-center py-6 pointer-events-none">Квадрант пуст</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { Task, EisenhowerQuadrant } from '../types';
import { AlertOctagon, Star, Clock, MinusCircle, Timer } from 'lucide-vue-next';
import ArcCheckbox from '../../../components/ui/ArcCheckbox.vue';

const props = defineProps<{
  tasks: Task[];
}>();

const tasksStore = useTasksStore();

const draggingTaskId = ref<string | null>(null);
const dragOverQuadrant = ref<EisenhowerQuadrant | null>(null);

const onDragStart = (event: DragEvent, task: Task) => {
  draggingTaskId.value = task.id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  }
};

const onDrop = (event: DragEvent, quadrant: EisenhowerQuadrant) => {
  dragOverQuadrant.value = null;
  const taskId = event.dataTransfer?.getData('text/plain');
  if (taskId && taskId === draggingTaskId.value) {
    tasksStore.updateTaskImportance(taskId, quadrant);
  }
  draggingTaskId.value = null;
};

const q1Tasks = computed(() => (props.tasks || []).filter(t => t.importance === 'urgent-important' || (t.priority === 'high' && !t.importance)));
const q2Tasks = computed(() => (props.tasks || []).filter(t => t.importance === 'important' || (t.priority === 'medium' && !t.importance)));
const q3Tasks = computed(() => (props.tasks || []).filter(t => t.importance === 'urgent'));
const q4Tasks = computed(() => (props.tasks || []).filter(t => t.importance === 'regular' || (t.priority === 'low' && !t.importance)));
</script>
