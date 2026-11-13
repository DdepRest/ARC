<template>
  <div
    class="group border rounded-[var(--radius-card,12px)] p-3 pl-3.5 flex flex-col gap-1.5 transition duration-200 relative cursor-pointer overflow-hidden"
    :class="[
      task.completed
        ? 'border-[var(--arc-hairline)] opacity-60 bg-[var(--arc-block)]'
        : isSelected
          ? 'border-[var(--arc-hairline-top)] bg-[var(--arc-selected)]'
          : 'border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)]',
      showMenu ? 'z-50' : 'z-10'
    ]"
    :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
    @click="handleHeaderClick"
  >
    <!-- Left Priority / Selection Stripe (2.5px) -->
    <div 
      class="absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none transition-colors"
      :class="leftStripeClass"
    ></div>

    <!-- Primary Row: High-Contrast Checkbox + Priority Badge + Title + Hover Actions -->
    <div class="flex items-start justify-between gap-3 min-w-0">
      <div class="flex items-start gap-2.5 min-w-0 flex-1">
        <!-- High-Contrast Priority-Aware Checkbox -->
        <div class="pt-0.5 shrink-0" @click.stop>
          <button
            type="button"
            role="checkbox"
            :aria-checked="task.completed"
            @click="tasksStore.toggleTask(task.id)"
            class="w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-all cursor-pointer"
            :class="checkboxClass"
            title="Отметить выполнение"
          >
            <Check class="w-3 h-3 stroke-[2.75]" :class="task.completed ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'" />
          </button>
        </div>

        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <!-- Title Line + 1-Click Priority Badge -->
          <div class="flex items-center gap-2 min-w-0" @click.stop="handleHeaderClick" @dblclick.stop="startEditTitle">
            <!-- Clickable Priority Badge next to Checkbox/Title -->
            <button
              type="button"
              @click.stop="cyclePriority"
              class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[4px] border transition cursor-pointer shrink-0 leading-none"
              :class="priorityBadgeClass"
              title="Нажмите для смены приоритета (P1 / P2 / P3)"
            >
              {{ priorityLabel }}
            </button>

            <template v-if="isEditingTitle">
              <input
                ref="titleInputRef"
                v-model="editTitleText"
                @keydown.enter.prevent="saveTitle"
                @keydown.esc.prevent="cancelTitle"
                @blur="saveTitle"
                @click.stop
                class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[var(--radius-control,8px)] px-2 py-0.5 text-sm font-sans font-medium text-[var(--arc-text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </template>
            <span 
              v-else
              class="font-sans text-sm font-medium transition break-words select-text cursor-pointer leading-snug"
              :class="[task.completed ? 'text-[var(--arc-text-muted)] line-through' : 'text-[var(--arc-text-primary)]']"
              title="Кликните для инспектора, двойной клик — редактировать"
            >
              {{ task.text }}
            </span>
          </div>

          <!-- Optional Description Preview -->
          <p v-if="task.description && !task.completed" class="text-xs text-[var(--arc-text-secondary)] line-clamp-1">
            {{ task.description }}
          </p>

          <!-- Footer Metadata Row: Category · Time · Specific Relative Deadline · Subtasks Accordion Trigger -->
          <div class="flex items-center gap-2.5 flex-wrap pt-0.5">
            <TaskBadgeContainer :task="task" />
            
            <!-- Specific Relative Deadline (e.g. "Вчера", "3 дн. назад", "12 окт", "Сегодня") -->
            <span 
              v-if="task.dueDate"
              class="text-[11px] font-mono inline-flex items-center gap-1"
              :class="tasksStore.getDueDateClass(task.dueDate, task.completed)"
              :title="`Срок: ${task.dueDate}`"
            >
              <Calendar class="w-3 h-3 shrink-0" />
              <span>{{ tasksStore.formatDueDateStatus(task.dueDate, task.completed) }}</span>
            </span>

            <!-- Interactive Subtasks Accordion Trigger (1/3 ▾) -->
            <button
              v-if="task.subtasks && task.subtasks.length > 0"
              type="button"
              @click.stop="showInlineSubtasks = !showInlineSubtasks"
              class="text-[11px] font-mono px-1.5 py-0.5 rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-selected)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-1 transition cursor-pointer"
              title="Раскрыть/скрыть чек-лист подзадач"
            >
              <CheckCircle2 class="w-3 h-3 text-[var(--accent)]" />
              <span>{{ tasksStore.getCompletedSubtasksCount(task) }}/{{ task.subtasks.length }}</span>
              <ChevronDown class="w-3 h-3 transition-transform" :class="{ 'rotate-180': showInlineSubtasks }" />
            </button>

            <!-- Quick Add First Subtask Button on Hover -->
            <button
              v-else-if="!task.completed"
              type="button"
              @click.stop="openInlineSubtaskInput"
              class="opacity-0 group-hover:opacity-100 text-[11px] font-mono px-1.5 py-0.5 rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-selected)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] flex items-center gap-1 transition cursor-pointer"
              title="Добавить шаги к задаче"
            >
              <Plus class="w-3 h-3 text-[var(--accent)]" />
              <span>Шаг</span>
            </button>
          </div>

          <!-- Lazy-Rendered Subtasks Accordion (v-if) -->
          <div 
            v-if="showInlineSubtasks" 
            class="mt-1.5 pt-2 border-t border-[var(--arc-divider)] flex flex-col gap-1"
            @click.stop
          >
            <div
              v-for="sub in (task.subtasks || [])"
              :key="sub.id"
              class="group/inline-sub flex items-center justify-between gap-2 px-2 py-1 rounded-[var(--radius-control,8px)] hover:bg-[var(--arc-plane)] transition cursor-pointer"
              @click="tasksStore.toggleSubtask(task.id, sub.id)"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <div 
                  class="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors"
                  :class="sub.completed ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.15)] text-[var(--accent)]' : 'border-[rgba(255,255,255,0.3)]'"
                >
                  <Check class="w-2.5 h-2.5 stroke-[2.5]" :class="sub.completed ? 'opacity-100' : 'opacity-0'" />
                </div>
                <span 
                  class="text-xs font-sans transition truncate"
                  :class="sub.completed ? 'line-through text-[var(--arc-text-muted)]' : 'text-[var(--arc-text-secondary)]'"
                >
                  {{ sub.text }}
                </span>
              </div>
              <button
                type="button"
                @click.stop="tasksStore.deleteSubtask(task.id, sub.id)"
                class="opacity-0 group-hover/inline-sub:opacity-100 p-0.5 text-[var(--arc-text-muted)] hover:text-[var(--status-err)] transition cursor-pointer shrink-0"
                title="Удалить шаг"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>

            <!-- Inline Quick Add Subtask Input -->
            <div v-if="!task.completed" class="flex items-center gap-1.5 px-1 pt-0.5">
              <input
                ref="inlineSubtaskInputRef"
                v-model="inlineSubtaskText"
                @keydown.enter.prevent="handleAddInlineSubtask"
                @keydown.esc.prevent="showInlineSubtasks = false"
                placeholder="Добавить шаг... (Enter)"
                class="flex-1 bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[var(--radius-control,8px)] px-2.5 py-1 text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
              />
              <button
                type="button"
                :disabled="!inlineSubtaskText.trim()"
                @click="handleAddInlineSubtask"
                class="p-1.5 rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--accent)] disabled:opacity-30 transition cursor-pointer shrink-0"
                title="Добавить шаг"
              >
                <Plus class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Hover / Active Actions: ▶ Фокус / Продолжить / Пауза + Мой день + Меню -->
      <div class="flex items-center gap-1 shrink-0" @click.stop>
        <button 
          v-if="!task.completed"
          type="button"
          @click="handleFocusButtonClick" 
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control,8px)] bg-[var(--arc-plane)] hover:bg-[var(--arc-selected)] border text-xs font-mono font-medium transition cursor-pointer"
          :class="isTaskStarted || isRecommended 
            ? 'opacity-100 border-[var(--arc-hairline-top)] text-[var(--arc-text-primary)]' 
            : 'opacity-0 group-hover:opacity-100 border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'"
          :title="isTaskRunningNow ? 'Поставить спринт на паузу' : isTaskStarted ? 'Продолжить выполнение спринта' : 'Запустить спринт фокуса в 1 клик'"
        >
          <Pause v-if="isTaskRunningNow" class="w-3 h-3 text-[var(--status-warn)]" />
          <Play v-else class="w-3 h-3 fill-current" :class="isTaskStarted ? 'text-[var(--status-warn)]' : 'text-[var(--accent)]'" />
          <span>{{ isTaskRunningNow ? 'Пауза' : isTaskStarted ? 'Продолжить' : 'Фокус' }}</span>
        </button>

        <button 
          type="button"
          @click="tasksStore.toggleMyDay(task.id)" 
          class="p-1.5 rounded-[var(--radius-control,8px)] transition-colors cursor-pointer"
          :class="task.isMyDay ? 'text-[var(--status-warn)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)]' : 'opacity-0 group-hover:opacity-100 text-[var(--arc-text-hint)] hover:bg-[var(--arc-plane)] hover:text-[var(--arc-text-primary)]'"
          title="В Мой день"
        >
          <Sun class="w-3.5 h-3.5" />
        </button>

        <div class="relative">
          <button 
            ref="menuTriggerRef"
            type="button"
            @click.stop="toggleMenu($event)" 
            class="p-1.5 hover:bg-[var(--arc-plane)] rounded-[var(--radius-control,8px)] transition cursor-pointer"
            :class="showMenu ? 'opacity-100 bg-[var(--arc-plane)] text-[var(--arc-text-primary)]' : 'opacity-0 group-hover:opacity-100 text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)]'"
            title="Действия с задачей"
          >
            <MoreHorizontal class="w-3.5 h-3.5" />
          </button>
          
          <!-- Dropdown Menu Teleported to Body to avoid overflow-hidden clipping -->
          <Teleport to="body">
            <div 
              v-if="showMenu" 
              ref="dropdownMenuRef"
              @click.stop
              class="fixed w-44 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] shadow-2xl overflow-hidden z-[9999]"
              :style="{ top: menuPosition.top + 'px', left: menuPosition.left + 'px' }"
            >
              <div class="flex flex-col py-1 text-xs font-mono">
                <button @click="handleAction(() => startEditTitle())" class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--arc-hover)] text-left text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer">
                  Переименовать
                </button>
                <button @click="handleAction(() => openInlineSubtaskInput())" class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--arc-hover)] text-left text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer">
                  <Plus class="w-3.5 h-3.5 text-[var(--accent)]" /> Добавить шаг
                </button>
                <button @click="handleAction(() => tasksStore.duplicateTask(task.id))" class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--arc-hover)] text-left text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer">
                  <Copy class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" /> Дублировать
                </button>
                <button @click="handleAction(() => tasksStore.decomposeTaskWithAI(task.id))" class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] text-left transition-colors font-medium cursor-pointer">
                  <Zap class="w-3.5 h-3.5 text-[var(--accent)]" /> Шаги AI
                </button>
                <div class="h-px bg-[var(--arc-divider)] my-1"></div>
                <button @click="handleAction(() => tasksStore.deleteTask(task.id))" class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--arc-hover)] text-[var(--status-err)] text-left transition-colors cursor-pointer">
                  <Trash2 class="w-3.5 h-3.5 text-[var(--status-err)]" /> Удалить
                </button>
              </div>
            </div>
          </Teleport>
        </div>
      </div>
    </div>

    <!-- Bottom Edge Progress Bar (Shown when task has subtasks or tracked time) -->
    <div 
      v-if="cardProgressPercent > 0 && !task.completed" 
      class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--arc-plane)] overflow-hidden pointer-events-none"
    >
      <div 
        class="h-full bg-[var(--accent)] transition-[width] duration-300"
        :style="{ width: `${cardProgressPercent}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useTasksStore } from '../stores/tasks.store';
import { storeToRefs } from 'pinia';
import TaskBadgeContainer from './TaskBadgeContainer.vue';
import { Task } from '../types';
import { Sun, MoreHorizontal, Copy, Zap, Trash2, CheckCircle2, Check, ChevronDown, Plus, Play, Pause, Calendar } from 'lucide-vue-next';

const props = defineProps<{ task: Task }>();
const tasksStore = useTasksStore();
const { expandedTaskId, activeFocusTaskId, isSprintRunning } = storeToRefs(tasksStore);

const isSelected = computed(() => expandedTaskId.value === props.task.id);
const isActiveFocus = computed(() => activeFocusTaskId.value === props.task.id);
const isTaskRunningNow = computed(() => isActiveFocus.value && isSprintRunning.value);
const isTaskStarted = computed(() => !props.task.completed && (props.task.status === 'in_progress' || (props.task.spentMinutes || 0) > 0 || isActiveFocus.value));
const isRecommended = computed(() => !props.task.completed && tasksStore.recommendedTask?.id === props.task.id);

const handleFocusButtonClick = () => {
  if (isTaskRunningNow.value) tasksStore.toggleSprintTimer();
  else tasksStore.startFocusSprint(props.task.id);
};

const priorityLabel = computed(() => props.task.priority === 'high' ? 'P1' : props.task.priority === 'medium' ? 'P2' : 'P3');

const leftStripeClass = computed(() => {
  if (props.task.completed) return 'bg-[var(--status-ok)] opacity-50';
  if (isSelected.value) return 'bg-[var(--accent)]';
  if (props.task.priority === 'high') return 'bg-[var(--status-err)]';
  if (props.task.priority === 'medium') return 'bg-[var(--status-warn)]';
  return 'bg-[var(--arc-divider)]';
});

const checkboxClass = computed(() => {
  if (props.task.completed) return 'border-[var(--status-ok)] bg-[var(--arc-selected)] text-[var(--status-ok)]';
  if (props.task.priority === 'high') return 'border-[var(--status-err)] bg-[var(--arc-input)] hover:bg-[var(--arc-selected)] text-[var(--status-err)]';
  if (props.task.priority === 'medium') return 'border-[var(--status-warn)] bg-[var(--arc-input)] hover:bg-[var(--arc-selected)] text-[var(--status-warn)]';
  return 'border-[rgba(255,255,255,0.35)] bg-[var(--arc-input)] hover:border-[var(--arc-text-primary)] text-[var(--arc-text-primary)]';
});

const priorityBadgeClass = computed(() => {
  if (props.task.priority === 'high') return 'border-[var(--status-err)] text-[var(--status-err)] bg-[var(--arc-plane)]';
  if (props.task.priority === 'medium') return 'border-[var(--status-warn)] text-[var(--status-warn)] bg-[var(--arc-plane)]';
  return 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-[var(--arc-plane)]';
});

const cardProgressPercent = computed(() => {
  if (props.task.subtasks?.length) return Math.round((tasksStore.getCompletedSubtasksCount(props.task) / props.task.subtasks.length) * 100);
  if (props.task.spentMinutes && props.task.estimatedMinutes && props.task.estimatedMinutes > 0) {
    return Math.min(100, Math.round((props.task.spentMinutes / props.task.estimatedMinutes) * 100));
  }
  return 0;
});

const cyclePriority = () => {
  const nextMap: Record<'low' | 'medium' | 'high', 'low' | 'medium' | 'high'> = { low: 'medium', medium: 'high', high: 'low' };
  const next = nextMap[props.task.priority || 'medium'] || 'medium';
  props.task.priority = next;
  props.task.importance = next === 'high' ? 'urgent-important' : next === 'medium' ? 'important' : 'regular';
  tasksStore.saveTasks();
};

const showMenu = ref(false);
const menuPosition = ref({ top: 0, left: 0 });
const menuTriggerRef = ref<HTMLElement | null>(null);
const dropdownMenuRef = ref<HTMLElement | null>(null);

const toggleMenu = (event: MouseEvent) => {
  if (showMenu.value) { showMenu.value = false; return; }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  menuPosition.value = { top: rect.bottom + 6, left: Math.max(8, rect.right - 176) };
  showMenu.value = true;
};

const closeMenuOnOutside = (e: Event) => {
  if (!showMenu.value) return;
  const target = e.target as Node | null;
  if (target && (menuTriggerRef.value?.contains(target) || dropdownMenuRef.value?.contains(target))) return;
  showMenu.value = false;
};

onMounted(() => {
  window.addEventListener('mousedown', closeMenuOnOutside);
  window.addEventListener('scroll', closeMenuOnOutside, true);
});
onUnmounted(() => {
  window.removeEventListener('mousedown', closeMenuOnOutside);
  window.removeEventListener('scroll', closeMenuOnOutside, true);
});

const showInlineSubtasks = ref(false);
const inlineSubtaskText = ref('');
const inlineSubtaskInputRef = ref<HTMLInputElement | null>(null);
const isEditingTitle = ref(false);
const editTitleText = ref('');
const titleInputRef = ref<HTMLInputElement | null>(null);

const handleHeaderClick = () => { if (!isEditingTitle.value) tasksStore.toggleExpand(props.task.id); };

const openInlineSubtaskInput = async () => {
  showInlineSubtasks.value = true;
  await nextTick();
  inlineSubtaskInputRef.value?.focus();
};

const handleAddInlineSubtask = () => {
  const trimmed = inlineSubtaskText.value.trim();
  if (trimmed) { tasksStore.addSubtask(props.task.id, trimmed); inlineSubtaskText.value = ''; }
};

const startEditTitle = async () => {
  isEditingTitle.value = true;
  editTitleText.value = props.task.text;
  await nextTick();
  titleInputRef.value?.focus();
  titleInputRef.value?.select();
};

const saveTitle = () => {
  if (!isEditingTitle.value) return;
  const trimmed = editTitleText.value.trim();
  if (trimmed && trimmed !== props.task.text) tasksStore.updateTaskTitle(props.task.id, trimmed);
  isEditingTitle.value = false;
};

const cancelTitle = () => { editTitleText.value = props.task.text; isEditingTitle.value = false; };
const handleAction = (action: () => void) => { action(); showMenu.value = false; };
</script>
