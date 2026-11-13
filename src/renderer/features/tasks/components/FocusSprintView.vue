<template>
  <div class="flex flex-col items-center justify-center p-5 md:p-6 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] relative overflow-hidden w-full gap-4 shadow-2xl select-none">
    <!-- Active Task Header & Quick Selector -->
    <div class="flex flex-col items-center text-center gap-2 max-w-xl w-full z-10">
      <div class="flex items-center gap-2 flex-wrap justify-center">
        <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--arc-text-machine)] font-semibold flex items-center gap-1.5 px-2.5 py-0.5 rounded-[var(--radius-pill,999px)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
          <Zap class="w-3 h-3 text-[var(--accent)]" /> A.R.C. FOCUS SPRINT
        </span>
        <span 
          v-if="activeTask" 
          class="text-xs font-mono text-[var(--arc-text-secondary)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] px-2.5 py-0.5 rounded-[var(--radius-pill,999px)] flex items-center gap-1.5 font-semibold"
        >
          <Clock class="w-3 h-3 text-[var(--status-warn)]" />
          <span>В фокусе: {{ activeTask.spentMinutes || 0 }} / {{ activeTask.estimatedMinutes || 30 }}м ({{ taskProgressPercent }}%)</span>
        </span>
      </div>

      <h2 
        v-if="activeTask"
        @click="tasksStore.toggleExpand(activeTask.id)"
        class="text-lg md:text-xl font-sans font-semibold text-[var(--arc-text-primary)] hover:text-[var(--accent)] transition cursor-pointer leading-snug"
        title="Открыть или скрыть инспектор задачи"
      >
        {{ activeTask.text }}
      </h2>
      <h2 v-else class="text-base md:text-lg font-sans font-semibold text-[var(--arc-text-secondary)]">
        Выберите задачу для запуска фокуса
      </h2>

      <!-- Quick Focus Task Switcher -->
      <div v-if="focusTaskOptions.length > 0" class="w-full max-w-md">
        <ArcSelect
          :model-value="activeTask?.id || ''"
          @update:model-value="onSelectFocusTask($event)"
          :options="focusTaskOptions"
          size="sm"
        />
      </div>

      <!-- Compact Subtasks Checklist right under Task Title (Always accessible during Sprint) -->
      <div 
        v-if="activeTask && activeTask.subtasks && activeTask.subtasks.length > 0" 
        class="w-full max-w-lg mt-1 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] p-2.5 flex flex-col gap-1.5 text-left"
      >
        <div class="flex items-center justify-between px-1">
          <span class="text-[10px] font-mono uppercase tracking-wider text-[var(--arc-text-machine)] font-semibold">
            Чек-лист спринта
          </span>
          <span class="text-[10px] font-mono text-[var(--arc-text-secondary)] font-semibold">
            {{ tasksStore.getCompletedSubtasksCount(activeTask) }}/{{ activeTask.subtasks.length }} выполнено
          </span>
        </div>
        <div class="flex flex-col gap-1 max-h-36 overflow-y-auto custom-scrollbar pr-0.5">
          <div 
            v-for="sub in activeTask.subtasks" 
            :key="sub.id"
            @click="tasksStore.toggleSubtask(activeTask.id, sub.id)"
            class="flex items-center gap-2.5 px-2.5 py-1.5 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] cursor-pointer transition"
          >
            <div 
              class="w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors"
              :class="sub.completed ? 'border-[var(--status-ok)] bg-[var(--arc-selected)] text-[var(--status-ok)]' : 'border-[rgba(255,255,255,0.35)] bg-[var(--arc-input)]'"
            >
              <Check class="w-3 h-3 stroke-[2.5]" :class="sub.completed ? 'opacity-100' : 'opacity-0'" />
            </div>
            <span 
              class="text-xs font-sans text-[var(--arc-text-primary)] leading-snug" 
              :class="{ 'line-through !text-[var(--arc-text-muted)]': sub.completed }"
            >
              {{ sub.text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Timer Ring Display -->
    <div 
      class="relative w-60 h-60 flex items-center justify-center z-10 group my-1"
      @wheel.prevent="onTimerWheel"
    >
      <svg class="w-full h-full transform -rotate-90" viewBox="0 0 256 256">
        <circle 
          cx="128" 
          cy="128" 
          r="108" 
          stroke="var(--arc-hairline)" 
          stroke-width="6" 
          fill="transparent"
        />
        <circle 
          cx="128" 
          cy="128" 
          r="108" 
          stroke="var(--accent)" 
          stroke-width="6" 
          class="transition duration-500"
          fill="transparent"
          :stroke-dasharray="678"
          :stroke-dashoffset="dashOffset"
          stroke-linecap="round"
        />
      </svg>

      <!-- Center Display: Time or Direct Edit Mode -->
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <!-- Direct Time Editor Mode -->
        <div v-if="isEditingDirectTime" class="flex flex-col items-center gap-2 bg-[var(--arc-popover)] p-3.5 rounded-[var(--radius-card,12px)] border border-[var(--arc-hairline)] shadow-2xl z-20">
          <span class="text-[10px] font-mono uppercase text-[var(--arc-text-machine)] tracking-wider font-semibold">Установка времени</span>
          <div class="flex items-center gap-1 font-mono text-lg font-bold text-[var(--arc-text-primary)]">
            <input 
              type="number" 
              v-model.number="directMinutesInput" 
              min="0" 
              max="180" 
              @keydown.enter.prevent="applyDirectTime"
              @keydown.esc.prevent="isEditingDirectTime = false"
              class="w-14 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] px-2 py-1 text-center font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] text-base"
              placeholder="ММ"
            />
            <span>:</span>
            <input 
              type="number" 
              v-model.number="directSecondsInput" 
              min="0" 
              max="59" 
              @keydown.enter.prevent="applyDirectTime"
              @keydown.esc.prevent="isEditingDirectTime = false"
              class="w-14 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] px-2 py-1 text-center font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] text-base"
              placeholder="СС"
            />
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <button 
              type="button"
              @click="applyDirectTime"
              class="px-2.5 py-1 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-[var(--accent-ink,#0A0A0A)] text-[10px] font-mono font-semibold rounded-[var(--radius-control,8px)] flex items-center gap-1 transition cursor-pointer"
            >
              <Check class="w-3 h-3" /> ОК
            </button>
            <button 
              type="button"
              @click="isEditingDirectTime = false"
              class="px-2 py-1 bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] text-[10px] font-mono rounded-[var(--radius-control,8px)] flex items-center gap-1 transition cursor-pointer"
            >
              <X class="w-3 h-3" /> Отмена
            </button>
          </div>
        </div>

        <!-- Normal Timer Display (focus-display 48px mono tabular per AGENTS.md §6) -->
        <template v-else>
          <div class="relative flex items-center justify-center w-full">
            <span 
              class="focus-display text-[48px] leading-none font-mono tabular-nums font-bold text-[var(--arc-text-primary)] tracking-widest cursor-pointer hover:text-[var(--accent)] transition-colors select-none" 
              @click="startDirectEdit" 
              title="Кликните для ввода времени или крутите колёсико мыши (±1 мин)"
            >
              {{ formattedTime }}
            </span>
          </div>
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)] uppercase tracking-widest mt-2.5 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full" :class="isSprintRunning ? 'bg-[var(--status-ok)]' : isResumableSprint ? 'bg-[var(--status-warn)]' : 'bg-[var(--arc-text-muted)]'"></span>
            {{ isSprintRunning ? 'Идёт спринт' : isResumableSprint ? 'Готов к продолжению' : 'Пауза' }}
            <span class="text-[var(--arc-text-muted)] font-bold">({{ sprintDurationMinutes }}м)</span>
          </span>
          <span v-if="!isSprintRunning" class="text-[10px] font-mono text-[var(--arc-text-muted)] mt-1 opacity-75">
            Клик или колёсико — изменить
          </span>
        </template>
      </div>
    </div>

    <!-- Single-Row Quick Duration Presets (Smoothly hidden while Sprint is running) -->
    <div 
      v-if="!isSprintRunning" 
      class="flex items-center justify-center gap-1.5 flex-wrap z-10 animate-in fade-in duration-150"
    >
      <button 
        v-for="preset in presets" 
        :key="preset"
        type="button"
        @click="selectPreset(preset)"
        :class="[
          'px-3 py-1 rounded-[var(--radius-control,8px)] text-xs font-mono font-semibold transition border cursor-pointer',
          sprintDurationMinutes === preset
            ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]' 
            : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'
        ]"
      >
        {{ preset }}м
      </button>
    </div>

    <!-- Main Execution Controls -->
    <div class="flex items-center gap-3 z-10 flex-wrap justify-center pt-1">
      <ArcButton 
        :variant="isSprintRunning ? 'warning' : 'primary'"
        size="lg"
        @click="tasksStore.toggleSprintTimer()"
        class="!px-7"
      >
        <template #icon>
          <Pause v-if="isSprintRunning" class="w-4 h-4" />
          <Play v-else class="w-4 h-4 fill-current" />
        </template>
        {{ primaryButtonLabel }}
      </ArcButton>

      <ArcButton 
        variant="ghost"
        size="lg"
        @click="tasksStore.resetSprintTimer()"
      >
        <template #icon>
          <RotateCcw class="w-4 h-4" />
        </template>
        Сброс
      </ArcButton>

      <ArcButton 
        v-if="activeTask"
        variant="secondary"
        size="lg"
        @click="tasksStore.toggleTask(activeTask.id)"
      >
        <template #icon>
          <CheckCircle2 class="w-4 h-4 text-[var(--status-ok)]" />
        </template>
        Завершить задачу
      </ArcButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';
import ArcButton from '../../../components/ui/ArcButton.vue';
import ArcSelect from '../../../components/ui/ArcSelect.vue';
import { 
  Zap, 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  Check, 
  X 
} from 'lucide-vue-next';

const tasksStore = useTasksStore();
const { tasks, activeFocusTask: activeTask, sprintTimeRemaining, sprintDurationMinutes, isSprintRunning } = storeToRefs(tasksStore);
const presets = [15, 25, 30, 45, 60, 90];

const isEditingDirectTime = ref(false);
const directMinutesInput = ref(25);
const directSecondsInput = ref(0);

// Ensure an in-progress task is auto-selected on mount if none is currently selected
onMounted(() => {
  if (!activeTask.value && (tasks.value || []).length > 0) {
    const inProgress = tasks.value.find(
      t => !t.completed && (t.status === 'in_progress' || (t.spentMinutes || 0) > 0)
    );
    const target = inProgress || tasks.value.find(t => !t.completed);
    if (target) {
      tasksStore.startFocusSprint(target.id, false);
    }
  }
});

const isResumableSprint = computed(() => {
  const t = activeTask.value;
  if (!t || t.completed) return false;
  return (t.spentMinutes || 0) > 0 || t.status === 'in_progress' || sprintTimeRemaining.value < sprintDurationMinutes.value * 60;
});

const primaryButtonLabel = computed(() => {
  if (isSprintRunning.value) return 'ПАУЗА';
  if (isResumableSprint.value) return 'ПРОДОЛЖИТЬ СПРИНТ';
  return 'СТАРТ СПРИНТА';
});

const taskProgressPercent = computed(() => {
  const t = activeTask.value;
  if (!t) return 0;
  const est = t.estimatedMinutes || 30;
  const spent = t.spentMinutes || 0;
  return Math.min(100, Math.round((spent / est) * 100));
});

const focusTaskOptions = computed(() => {
  const active = (tasks.value || []).filter(t => !t.completed);
  return active.map(t => ({
    label: `${t.priority === 'high' ? 'P1' : t.priority === 'medium' ? 'P2' : 'P3'} · ${t.text}${t.spentMinutes ? ` (${t.spentMinutes}/${t.estimatedMinutes || 30}м)` : ''}`,
    value: t.id
  }));
});

const onSelectFocusTask = (val: any) => {
  const id = String(val);
  if (id) {
    tasksStore.startFocusSprint(id);
  }
};

const selectPreset = (m: number) => {
  tasksStore.setSprintDurationMinutes(m);
};

const onTimerWheel = (e: WheelEvent) => {
  if (isEditingDirectTime.value) return;
  const stepSeconds = e.shiftKey ? 300 : 60;
  const delta = e.deltaY < 0 ? stepSeconds : -stepSeconds;
  tasksStore.adjustSprintTime(delta);
};

const startDirectEdit = () => {
  const m = Math.floor(sprintTimeRemaining.value / 60);
  const s = sprintTimeRemaining.value % 60;
  directMinutesInput.value = m;
  directSecondsInput.value = s;
  isEditingDirectTime.value = true;
};

const applyDirectTime = () => {
  const m = Math.max(0, Math.min(180, directMinutesInput.value || 0));
  const s = Math.max(0, Math.min(59, directSecondsInput.value || 0));
  const total = m * 60 + s;
  tasksStore.setCustomSprintSeconds(total);
  isEditingDirectTime.value = false;
};

const formattedTime = computed(() => {
  const m = Math.floor(sprintTimeRemaining.value / 60);
  const s = sprintTimeRemaining.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

const dashOffset = computed(() => {
  const total = sprintDurationMinutes.value * 60;
  if (total === 0) return 0;
  const progress = (total - sprintTimeRemaining.value) / total;
  return 678 * (1 - progress);
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--arc-hairline);
  border-radius: 4px;
}
</style>
