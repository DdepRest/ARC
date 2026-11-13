<template>
  <div class="relative inline-block w-full min-w-0" ref="containerRef">
    <!-- Trigger Button -->
    <div
      @click="toggleOpen"
      class="group/datepicker w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] rounded-[var(--radius-control,8px)] px-2.5 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] transition duration-200 outline-none focus:border-[var(--accent)] cursor-pointer flex items-center justify-between gap-1.5 select-none"
      :class="[
        size === 'sm' ? 'h-8 py-1 text-xs' : 'py-1.5 text-xs',
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      ]"
      :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
      :title="formattedDisplayValue || placeholder"
    >
      <div class="flex items-center gap-1.5 min-w-0 truncate">
        <Calendar v-if="!hideIcon" class="w-3.5 h-3.5 text-[var(--arc-text-muted)] shrink-0" />
        <span v-if="modelValue" class="truncate font-semibold text-[var(--arc-text-primary)]">
          {{ formattedDisplayValue }}
        </span>
        <span v-else class="text-[var(--arc-text-muted)] truncate">
          {{ placeholder || 'Выбрать дату' }}
        </span>
      </div>

      <div class="flex items-center gap-0.5 shrink-0">
        <button
          v-if="modelValue && clearable"
          type="button"
          @click.stop="clearDate"
          class="hidden group-hover/datepicker:inline-flex p-0.5 hover:bg-[var(--arc-hover)] rounded text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors"
          title="Очистить дату"
        >
          <X class="w-3 h-3" />
        </button>
        <ChevronDown class="w-3.5 h-3.5 text-[var(--arc-text-muted)] transition-transform duration-200" :class="{ 'rotate-180': isOpen }" />
      </div>
    </div>

    <!-- Calendar Popover -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="transform scale-95 opacity-0 -translate-y-1"
      enter-to-class="transform scale-100 opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="transform scale-100 opacity-100 translate-y-0"
      leave-to-class="transform scale-95 opacity-0 -translate-y-1"
    >
      <div
        v-if="isOpen"
        role="dialog"
        aria-label="Календарь"
        class="absolute z-50 mt-1.5 p-3.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px] w-[280px] text-xs font-mono text-[var(--arc-text-primary)] select-none"
        :class="effectiveAlign === 'right' ? 'right-0' : 'left-0'"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 36px rgba(0, 0, 0, 0.7)' }"
      >
        <!-- Header Controls -->
        <div class="flex items-center justify-between mb-3 pb-2 border-b border-[var(--arc-hairline)]">
          <button
            @click="prevMonth"
            type="button"
            class="p-1 hover:bg-[var(--arc-hover)] rounded-lg text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            title="Предыдущий месяц"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>

          <span class="font-bold text-xs uppercase tracking-wider text-[var(--arc-text-primary)] flex items-center gap-1">
            {{ currentMonthName }} {{ currentYear }}
          </span>

          <button
            @click="nextMonth"
            type="button"
            class="p-1 hover:bg-[var(--arc-hover)] rounded-lg text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            title="Следующий месяц"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>

        <!-- Quick Select Bar -->
        <div class="grid grid-cols-3 gap-1 mb-3">
          <button
            @click="selectToday"
            type="button"
            class="py-1 px-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] rounded-md text-xs text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition text-center cursor-pointer border border-[var(--arc-hairline)]"
          >
            Сегодня
          </button>
          <button
            @click="selectTomorrow"
            type="button"
            class="py-1 px-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] rounded-md text-xs text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition text-center cursor-pointer border border-[var(--arc-hairline)]"
          >
            Завтра
          </button>
          <button
            @click="selectNextWeek"
            type="button"
            class="py-1 px-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] rounded-md text-xs text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition text-center cursor-pointer border border-[var(--arc-hairline)]"
          >
            +1 нед.
          </button>
        </div>

        <!-- Weekdays Header -->
        <div class="grid grid-cols-7 gap-1 text-center text-xs text-[var(--arc-text-muted)] mb-1 font-bold">
          <span>Пн</span>
          <span>Вт</span>
          <span>Ср</span>
          <span>Чт</span>
          <span>Пт</span>
          <span class="text-[var(--accent)]">Сб</span>
          <span class="text-[var(--accent)]">Вс</span>
        </div>

        <!-- Days Grid -->
        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="(day, idx) in calendarDays"
            :key="idx"
            @click="selectDay(day)"
            type="button"
            :disabled="isDayDisabled(day)"
            class="h-7 rounded-lg text-xs flex items-center justify-center transition cursor-pointer font-mono"
            :class="[
              !day.isCurrentMonth ? 'text-[var(--arc-text-hint)]' : 'text-[var(--arc-text-primary)]',
              day.isToday && !day.isSelected ? 'ring-1 ring-[var(--accent)] font-bold text-[var(--accent)]' : '',
              day.isSelected
                ? 'bg-[var(--accent)] text-white font-bold shadow-[0_0_10px_rgba(var(--accent-rgb),0.3)]'
                : 'hover:bg-[var(--arc-hover)]',
              isDayDisabled(day) ? 'opacity-20 cursor-not-allowed hover:bg-transparent' : ''
            ]"
          >
            {{ day.date.getDate() }}
          </button>
        </div>

        <!-- Footer Actions -->
        <div v-if="clearable && modelValue" class="mt-3 pt-2 border-t border-[var(--arc-hairline)] flex justify-end">
          <button
            @click="clearDate"
            type="button"
            class="text-xs text-[var(--status-err)] hover:opacity-80 font-bold transition-colors cursor-pointer flex items-center gap-1"
          >
            <X class="w-3 h-3" /> Сбросить дату
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';

interface CalendarDay {
  date: Date;
  isoString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const props = withDefaults(defineProps<{
  modelValue?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  clearable?: boolean;
  hideIcon?: boolean;
  min?: string;
  max?: string;
  align?: 'left' | 'right';
}>(), {
  placeholder: 'Выбрать дату',
  size: 'md',
  disabled: false,
  clearable: true,
  hideIcon: false,
  align: 'left'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | undefined): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);
const viewDate = ref(new Date());

const monthNamesRu = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    const parts = newVal.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        viewDate.value = new Date(year, month, day);
      }
    }
  }
}, { immediate: true });

const currentMonthName = computed(() => monthNamesRu[viewDate.value.getMonth()]);
const currentYear = computed(() => viewDate.value.getFullYear());

const formattedDisplayValue = computed(() => {
  if (!props.modelValue) return '';
  const parts = props.modelValue.split('-');
  if (parts.length !== 3) return props.modelValue;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(d.getTime())) return props.modelValue;
  
  const today = new Date();
  const todayIso = toIsoDate(today);
  
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = toIsoDate(tomorrow);

  if (props.modelValue === todayIso) return 'Сегодня';
  if (props.modelValue === tomorrowIso) return 'Завтра';

  const dayNum = d.getDate();
  const monthNameShort = monthNamesRu[d.getMonth()].substring(0, 3).toLowerCase();
  if (d.getFullYear() === today.getFullYear()) {
    return `${dayNum} ${monthNameShort}.`;
  }
  return `${dayNum} ${monthNameShort}. ${d.getFullYear()}`;
});

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const calendarDays = computed<CalendarDay[]>(() => {
  const year = viewDate.value.getFullYear();
  const month = viewDate.value.getMonth();
  const todayIso = toIsoDate(new Date());

  const firstDay = new Date(year, month, 1);
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  const days: CalendarDay[] = [];
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    const iso = toIsoDate(d);
    days.push({
      date: d,
      isoString: iso,
      isCurrentMonth: false,
      isToday: iso === todayIso,
      isSelected: props.modelValue === iso
    });
  }

  const lastDayCurrentMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDayCurrentMonth; i++) {
    const d = new Date(year, month, i);
    const iso = toIsoDate(d);
    days.push({
      date: d,
      isoString: iso,
      isCurrentMonth: true,
      isToday: iso === todayIso,
      isSelected: props.modelValue === iso
    });
  }

  const totalCells = days.length > 35 ? 42 : 35;
  const remaining = totalCells - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const iso = toIsoDate(d);
    days.push({
      date: d,
      isoString: iso,
      isCurrentMonth: false,
      isToday: iso === todayIso,
      isSelected: props.modelValue === iso
    });
  }

  return days;
});

function isDayDisabled(day: CalendarDay): boolean {
  if (props.min && day.isoString < props.min) return true;
  if (props.max && day.isoString > props.max) return true;
  return false;
}

const effectiveAlign = ref<'left' | 'right'>(props.align || 'left');

function updatePopoverPosition() {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  
  if (props.align === 'right' || (viewportWidth - rect.left < 290)) {
    effectiveAlign.value = 'right';
  } else {
    effectiveAlign.value = 'left';
  }
}

function toggleOpen() {
  if (props.disabled) return;
  if (!isOpen.value) {
    updatePopoverPosition();
  }
  isOpen.value = !isOpen.value;
}

function prevMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1);
}

function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1);
}

function selectDay(day: CalendarDay) {
  if (isDayDisabled(day)) return;
  emit('update:modelValue', day.isoString);
  isOpen.value = false;
}

function selectToday() {
  const today = new Date();
  viewDate.value = today;
  selectDay({
    date: today,
    isoString: toIsoDate(today),
    isCurrentMonth: true,
    isToday: true,
    isSelected: true
  });
}

function selectTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  viewDate.value = tomorrow;
  selectDay({
    date: tomorrow,
    isoString: toIsoDate(tomorrow),
    isCurrentMonth: true,
    isToday: false,
    isSelected: true
  });
}

function selectNextWeek() {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  viewDate.value = nextWeek;
  selectDay({
    date: nextWeek,
    isoString: toIsoDate(nextWeek),
    isCurrentMonth: true,
    isToday: false,
    isSelected: true
  });
}

function clearDate() {
  emit('update:modelValue', undefined);
  isOpen.value = false;
}

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
