<template>
  <!-- Separated Task Creation Input & Flat Filter Header (No 6-floor outer box) -->
  <div class="flex flex-col gap-3 select-none" v-if="showFilterZone">
    
    <!-- Zone 1: Progressive Disclosure Task Command Input -->
    <div 
      ref="commandBoxRef"
      class="flex flex-col bg-[var(--arc-block)] border rounded-[var(--radius-card,12px)] px-3 py-2 transition-colors duration-200"
      :class="isExpanded ? 'border-[var(--arc-hairline-top)] shadow-md' : 'border-[var(--arc-hairline)]'"
      :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      @mousedown="isMetaInteracting = true"
    >
      <!-- Single-Line Primary Command Row -->
      <div class="flex items-center gap-2">
        <Plus class="w-4 h-4 text-[var(--accent)] shrink-0" />
        
        <input
          ref="inputRef"
          :value="newTaskText"
          @input="$emit('update:newTaskText', ($event.target as HTMLInputElement).value)"
          @focus="isInputFocused = true"
          @blur="handleInputBlur"
          @keydown.enter.prevent="handleAddTask"
          @keydown.esc.prevent="collapseAndBlur"
          type="text"
          placeholder="Что нужно сделать?"
          title="Подсказка синтаксиса: !high (высокий приоритет), #работа (категория), завтра (срок)"
          class="flex-1 min-w-0 bg-transparent text-sm font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none py-1"
        />

        <!-- Live Recognized Syntax Tokens Inline -->
        <div v-if="detectedTokens.length > 0" class="hidden sm:flex items-center gap-1 shrink-0">
          <span
            v-for="(tok, idx) in detectedTokens"
            :key="idx"
            class="text-[10px] font-mono px-2 py-0.5 rounded-[var(--radius-pill,999px)] bg-[var(--arc-plane)] border font-semibold"
            :class="tok.colorClass"
          >
            {{ tok.label }}
          </span>
        </div>

        <!-- Clear Input Button -->
        <button 
          v-if="newTaskText"
          type="button"
          @click="$emit('update:newTaskText', '')"
          class="p-1 text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer shrink-0"
          aria-label="Очистить текст задачи"
        >
          <X class="w-3.5 h-3.5" />
        </button>

        <!-- Templates Dropdown Trigger (Integrated inside the right side of the input row) -->
        <div class="relative shrink-0">
          <button 
            type="button"
            @click.stop="showTemplatesDropdown = !showTemplatesDropdown"
            class="px-2.5 py-1 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] text-xs font-mono rounded-[var(--radius-control,8px)] transition-colors cursor-pointer flex items-center gap-1.5"
            title="Готовые шаблоны задач"
          >
            <Sparkles class="w-3 h-3 text-[var(--accent)]" />
            <span class="hidden sm:inline">Шаблоны</span>
            <ChevronDown class="w-3 h-3 text-[var(--arc-text-hint)]" />
          </button>

          <div 
            v-if="showTemplatesDropdown"
            class="absolute right-0 top-full mt-1.5 w-44 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[var(--radius-card,12px)] shadow-2xl py-1 z-50 text-xs font-mono"
          >
            <button 
              type="button"
              @click="selectTemplate('audit')"
              class="w-full text-left px-3 py-2 hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Zap class="w-3 h-3 text-[var(--accent)]" />
              <span>Аудит систем</span>
            </button>
            <button 
              type="button"
              @click="selectTemplate('refactor')"
              class="w-full text-left px-3 py-2 hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Zap class="w-3 h-3 text-[var(--accent)]" />
              <span>Рефакторинг</span>
            </button>
            <button 
              type="button"
              @click="selectTemplate('backup')"
              class="w-full text-left px-3 py-2 hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Zap class="w-3 h-3 text-[var(--accent)]" />
              <span>Бэкап данных</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Subtle Syntax Hint Below Input (Shown when expanded) -->
      <div v-if="isExpanded" class="pl-6 pt-0.5 text-[10px] font-mono text-[var(--arc-text-hint)]">
        Быстрый ввод: <span class="text-[var(--arc-text-secondary)]">!high</span> приоритет · <span class="text-[var(--arc-text-secondary)]">#работа</span> категория · <span class="text-[var(--arc-text-secondary)]">завтра</span> срок
      </div>

      <!-- Progressive Disclosure Metadata Row (Reveals ONLY on input focus or when text is entered) -->
      <div 
        v-if="isExpanded" 
        class="flex flex-wrap items-center justify-between gap-2 pt-2 mt-1.5 border-t border-[var(--arc-divider)] text-xs font-mono animate-in fade-in duration-150"
      >
        <!-- Left: Priority, Quick Dates, Date Picker -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <!-- Segmented Priority Control -->
          <div class="flex items-center rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] p-0.5">
            <button
              v-for="p in priorityOptions"
              :key="p.value"
              type="button"
              @click="$emit('update:newTaskPriority', p.value)"
              class="px-2 py-0.5 rounded-[6px] text-[10px] font-mono transition cursor-pointer"
              :class="[
                newTaskPriority === p.value
                  ? p.activeClass
                  : 'text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'
              ]"
              :title="p.label"
            >
              {{ p.short }}
            </button>
          </div>

          <!-- Quick Date Controls -->
          <button
            type="button"
            @click="setQuickDate('today')"
            class="px-2.5 py-1 rounded-[var(--radius-control,8px)] border text-[10px] font-mono transition cursor-pointer"
            :class="isTodayActive
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--accent)] font-semibold'
              : 'border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-plane)]'"
          >
            Сегодня
          </button>
          <button
            type="button"
            @click="setQuickDate('tomorrow')"
            class="px-2.5 py-1 rounded-[var(--radius-control,8px)] border text-[10px] font-mono transition cursor-pointer"
            :class="isTomorrowActive
              ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--accent)] font-semibold'
              : 'border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-plane)]'"
          >
            Завтра
          </button>

          <!-- Custom Date Picker -->
          <div class="w-32">
            <ArcDatePicker 
              :model-value="newTaskDueDate"
              @update:model-value="$emit('update:newTaskDueDate', $event || '')"
              placeholder="Срок..."
              size="sm"
            />
          </div>
        </div>

        <!-- Right: Category, Recurrence, and Submit Action -->
        <div class="flex items-center gap-2 ml-auto">
          <div class="w-36">
            <ArcSelect
              :model-value="newTaskCategory"
              @update:model-value="onCategorySelect"
              :options="categoryOptions"
              size="sm"
            />
          </div>

          <button
            type="button"
            @click="$emit('openRecurrenceModal')"
            class="h-8 px-2.5 rounded-[var(--radius-control,8px)] border border-[var(--arc-hairline)] text-[10px] font-mono transition flex items-center gap-1 cursor-pointer bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)]"
            :class="newTaskRecurrence && newTaskRecurrence.type !== 'none' ? 'text-[var(--accent)] border-[var(--accent)] bg-[var(--arc-selected)] font-semibold' : 'text-[var(--arc-text-secondary)]'"
            :title="getRecurrenceHumanText(newTaskRecurrence)"
          >
            <Repeat class="w-3 h-3" />
            <span class="max-w-[80px] truncate">{{ getRecurrenceBadgeLabel(newTaskRecurrence) || 'Повтор' }}</span>
          </button>

          <button
            type="button"
            :disabled="!newTaskText.trim()"
            @click="handleAddTask"
            class="h-8 px-3.5 rounded-[var(--radius-control,8px)] border text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            :class="newTaskText.trim() 
              ? 'bg-[var(--accent)] hover:bg-[var(--accent)]/90 border-[var(--accent)] text-[var(--accent-ink,#0A0A0A)]' 
              : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] cursor-not-allowed'"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ translations?.add || 'Добавить задачу' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Zone 2: Flat List Filter & Search Toolbar (Separated from Task Creation) -->
    <SearchFiltersPanel
      :translations="translations"
      :viewMode="viewMode"
      :searchQuery="searchQuery"
      :sortBy="sortBy"
      :activeFilter="activeFilter"
      :completedCount="completedCount"
      :filterCount="filterCount"
      :objectives="objectives"
      @update:searchQuery="$emit('update:searchQuery', $event)"
      @update:sortBy="$emit('update:sortBy', $event)"
      @update:activeFilter="$emit('update:activeFilter', $event)"
      @clearCompleted="$emit('clearCompleted')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, onMounted, onUnmounted } from 'vue';
import { 
  Plus, Repeat, X, Zap, Sparkles, ChevronDown 
} from 'lucide-vue-next';
import { RecurrenceRule, SelectOption } from '../types';
import ArcSelect from '../../../components/ui/ArcSelect.vue';
import ArcDatePicker from '../../../components/ui/ArcDatePicker.vue';
import SearchFiltersPanel from './SearchFiltersPanel.vue';
import { getRecurrenceHumanText, getRecurrenceBadgeLabel } from '../composables/useRecurrenceHelpers';
import { useTaskNLP } from '../composables/useTaskNLP';

const props = defineProps<{
  translations: any;
  viewMode: 'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history';
  newTaskText: string;
  newTaskCategory: string;
  categoryOptions: SelectOption[];
  newTaskPriority: string;
  newTaskDueDate: string;
  newTaskRecurrence?: RecurrenceRule;
  searchQuery: string;
  sortBy: string;
  activeFilter: string;
  completedCount: number;
  filterCount: (f: string) => number;
  objectives: any[];
}>();

const emit = defineEmits<{
  (e: 'update:viewMode', val: 'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history'): void;
  (e: 'update:newTaskText', val: string): void;
  (e: 'update:newTaskCategory', val: string): void;
  (e: 'openCategoryModal'): void;
  (e: 'openRecurrenceModal'): void;
  (e: 'update:newTaskPriority', val: string): void;
  (e: 'update:newTaskDueDate', val: string): void;
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:sortBy', val: string): void;
  (e: 'update:activeFilter', val: string): void;
  (e: 'addTask'): void;
  (e: 'clearCompleted'): void;
  (e: 'loadPresetTemplate', presetType: string): void;
}>();

const commandBoxRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const isInputFocused = ref(false);
const isMetaInteracting = ref(false);
const showTemplatesDropdown = ref(false);

const isExpanded = computed(() => {
  return isInputFocused.value || isMetaInteracting.value || Boolean(props.newTaskText.trim());
});

const handleInputBlur = () => {
  setTimeout(() => {
    isInputFocused.value = false;
  }, 120);
};

const collapseAndBlur = () => {
  isInputFocused.value = false;
  isMetaInteracting.value = false;
  inputRef.value?.blur();
};

const handleOutsideClick = (e: MouseEvent) => {
  const target = e.target as Node;
  if (commandBoxRef.value && !commandBoxRef.value.contains(target)) {
    isMetaInteracting.value = false;
    showTemplatesDropdown.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutsideClick);
});

// Live NLP syntax highlighting & control auto-sync (!high -> P1, #работа -> category, завтра -> dueDate)
const { detectedTokens } = useTaskNLP(
  toRef(props, 'newTaskText'),
  toRef(props, 'categoryOptions'),
  (p) => emit('update:newTaskPriority', p),
  (c) => emit('update:newTaskCategory', c),
  (d) => emit('update:newTaskDueDate', d)
);

const selectTemplate = (templateName: string) => {
  emit('loadPresetTemplate', templateName);
  showTemplatesDropdown.value = false;
};

const priorityOptions = [
  { value: 'high', label: 'Высокий приоритет', short: 'P1', activeClass: 'bg-[var(--arc-selected)] text-[var(--status-err)] font-bold' },
  { value: 'medium', label: 'Средний приоритет', short: 'P2', activeClass: 'bg-[var(--arc-selected)] text-[var(--status-warn)] font-bold' },
  { value: 'low', label: 'Обычный приоритет', short: 'P3', activeClass: 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] font-bold' }
];

const todayStr = computed(() => new Date().toISOString().split('T')[0]);
const tomorrowStr = computed(() => new Date(Date.now() + 86400000).toISOString().split('T')[0]);

const isTodayActive = computed(() => props.newTaskDueDate === todayStr.value);
const isTomorrowActive = computed(() => props.newTaskDueDate === tomorrowStr.value);

const setQuickDate = (type: 'today' | 'tomorrow') => {
  const target = type === 'today' ? todayStr.value : tomorrowStr.value;
  if (props.newTaskDueDate === target) {
    emit('update:newTaskDueDate', '');
  } else {
    emit('update:newTaskDueDate', target);
  }
};

const handleAddTask = () => {
  if (props.newTaskText.trim()) {
    emit('addTask');
    isMetaInteracting.value = false;
  }
};

const showFilterZone = computed(() => {
  return props.viewMode === 'list' || props.viewMode === 'kanban';
});

const onCategorySelect = (val: string | number | boolean) => {
  const str = String(val);
  if (str === 'manage_categories' || str === '__ADD_NEW__') {
    emit('openCategoryModal');
    emit('update:newTaskCategory', props.newTaskCategory);
  } else {
    emit('update:newTaskCategory', str);
  }
};
</script>
