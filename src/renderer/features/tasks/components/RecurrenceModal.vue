<template>
  <div class="flex flex-col gap-4 relative">
    <!-- Quick Presets -->
    <div class="flex flex-col gap-2">
      <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold">БЫСТРЫЕ ШАБЛОНЫ</span>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          v-for="preset in presets"
          :key="preset.id"
          @click="applyPreset(preset.id)"
          class="px-3 py-2 rounded-xl border text-xs font-mono transition flex items-center justify-between cursor-pointer"
          :class="[
            activePreset === preset.id
              ? 'bg-[var(--accent-bg-alpha)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold shadow-md'
              : 'bg-[var(--arc-block)] text-[var(--arc-text-secondary)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-medium)] hover:text-[var(--arc-text-primary)]'
          ]"
        >
          <span>{{ preset.label }}</span>
          <Check v-if="activePreset === preset.id" class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        </button>
      </div>
    </div>

    <!-- Custom Schedule Constructor -->
    <div class="flex flex-col gap-3.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] p-4 rounded-xl">
      <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold flex items-center justify-between">
        <span>КОНСТРУКТОР СВОЕГО ГРАФИКА</span>
        <span v-if="localType !== 'none'" class="text-xs text-[var(--status-ok)] font-normal flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
          АКТИВЕН
        </span>
      </span>

      <!-- Interval & Unit -->
      <div class="flex flex-wrap items-center gap-2.5 text-xs font-mono">
        <span class="text-[var(--arc-text-secondary)]">Повторять каждые</span>
        <input 
          type="number"
          min="1"
          max="99"
          v-model.number="localInterval"
          class="w-16 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-lg text-center px-2 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] outline-none focus:border-[var(--accent)] transition font-bold"
        />
        <select
          v-model="localType"
          class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] outline-none cursor-pointer focus:border-[var(--accent)]"
        >
          <option value="none">Не повторять</option>
          <option value="daily">Дней</option>
          <option value="weekly">Недель</option>
          <option value="monthly">Месяцев</option>
          <option value="yearly">Лет</option>
        </select>
      </div>

      <!-- Days of Week Selector -->
      <div v-if="localType === 'weekly' || localType === 'custom'" class="flex flex-col gap-2 border-t border-[var(--arc-hairline)] pt-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">Дни недели:</span>
          <div class="flex items-center gap-1.5">
            <button 
              @click="setPresetDays('workdays')"
              class="text-xs font-mono px-2 py-0.5 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] rounded text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer border border-[var(--arc-hairline)]"
            >
              Пн-Пт
            </button>
            <button 
              @click="setPresetDays('weekend')"
              class="text-xs font-mono px-2 py-0.5 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] rounded text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer border border-[var(--arc-hairline)]"
            >
              Сб-Вс
            </button>
            <button 
              @click="setPresetDays('all')"
              class="text-xs font-mono px-2 py-0.5 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] rounded text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer border border-[var(--arc-hairline)]"
            >
              Все
            </button>
          </div>
        </div>

        <div class="grid grid-cols-7 gap-1.5">
          <button
            v-for="w in weekdaysList"
            :key="w.day"
            @click="toggleDay(w.day)"
            class="py-1.5 text-xs font-mono rounded-lg transition border flex flex-col items-center justify-center cursor-pointer"
            :class="[
              localDays.includes(w.day)
                ? 'bg-[var(--accent-bg-alpha)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold shadow-sm'
                : 'bg-[var(--arc-frame)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-secondary)] hover:bg-[var(--arc-hover)]'
            ]"
            :title="`Повторять в ${w.full}`"
          >
            <span>{{ w.label }}</span>
          </button>
        </div>
      </div>

      <!-- End Condition Section (Infinity vs Limit) -->
      <div v-if="localType !== 'none'" class="flex flex-col gap-2 border-t border-[var(--arc-hairline)] pt-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider flex items-center gap-1">
            <span>ОКОНЧАНИЕ ПОВТОРЕНИЙ:</span>
          </span>
          <span v-if="localEndType === 'never'" class="text-xs font-mono text-[var(--arc-text-primary)] font-semibold flex items-center gap-1 bg-[var(--accent-bg-alpha)] px-2 py-0.5 rounded border border-[var(--accent)]">
            ♾️ Бесконечный цикл
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            @click="localEndType = 'never'"
            class="px-3 py-2 rounded-xl border text-xs font-mono transition flex items-center gap-2 cursor-pointer"
            :class="[
              localEndType === 'never'
                ? 'bg-[var(--accent-bg-alpha)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold shadow-md'
                : 'bg-[var(--arc-block)] text-[var(--arc-text-secondary)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-medium)] hover:text-[var(--arc-text-primary)]'
            ]"
          >
            <span class="text-base leading-none">♾️</span>
            <div class="flex flex-col text-left">
              <span class="text-xs font-semibold">Бесконечно</span>
              <span class="text-xs text-[var(--arc-text-machine)]">пока не отменю</span>
            </div>
          </button>

          <button
            @click="localEndType = 'after_occurrences'"
            class="px-3 py-2 rounded-xl border text-xs font-mono transition flex items-center gap-2 cursor-pointer"
            :class="[
              localEndType === 'after_occurrences'
                ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold shadow-md'
                : 'bg-[var(--arc-block)] text-[var(--arc-text-secondary)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-medium)] hover:text-[var(--arc-text-primary)]'
            ]"
          >
            <span class="text-base leading-none">🔢</span>
            <div class="flex flex-col text-left">
              <span class="text-xs font-semibold">Лимит раз</span>
              <span class="text-xs text-[var(--arc-text-machine)]">N повторов</span>
            </div>
          </button>

          <button
            @click="localEndType = 'on_date'"
            class="px-3 py-2 rounded-xl border text-xs font-mono transition flex items-center gap-2 cursor-pointer"
            :class="[
              localEndType === 'on_date'
                ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold shadow-md'
                : 'bg-[var(--arc-block)] text-[var(--arc-text-secondary)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-medium)] hover:text-[var(--arc-text-primary)]'
            ]"
          >
            <span class="text-base leading-none">📅</span>
            <div class="flex flex-col text-left">
              <span class="text-xs font-semibold">До даты</span>
              <span class="text-xs text-[var(--arc-text-machine)]">конечная дата</span>
            </div>
          </button>
        </div>

        <!-- Input field for 'after_occurrences' -->
        <div v-if="localEndType === 'after_occurrences'" class="flex items-center gap-2 mt-1 bg-[var(--arc-frame)] p-2 rounded-lg border border-[var(--arc-hairline)] text-xs font-mono">
          <span class="text-[var(--arc-text-secondary)]">Завершить ровно через</span>
          <input 
            type="number"
            min="1"
            max="999"
            v-model.number="localCount"
            class="w-16 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded text-center px-2 py-1 text-xs font-mono text-[var(--arc-text-primary)] font-bold outline-none focus:border-[var(--accent)]"
          />
          <span class="text-[var(--arc-text-secondary)]">повторений</span>
        </div>

        <!-- Input field for 'on_date' -->
        <div v-if="localEndType === 'on_date'" class="flex items-center gap-2 mt-1 bg-[var(--arc-frame)] p-2 rounded-lg border border-[var(--arc-hairline)] text-xs font-mono">
          <span class="text-[var(--arc-text-secondary)] shrink-0">Повторять до даты:</span>
          <div class="w-48">
            <ArcDatePicker 
              v-model="localEndDate"
              placeholder="Выбрать дату"
              size="sm"
              align="right"
            />
          </div>
        </div>
      </div>

      <!-- Dynamic Rule Description -->
      <div class="text-xs font-mono text-[var(--arc-text-primary)] bg-[var(--arc-frame)] border border-[var(--arc-hairline)] px-3 py-2 rounded-xl flex items-center gap-2">
        <Sparkles class="w-4 h-4 text-[var(--status-ok)] shrink-0" />
        <span>{{ humanSummary }}</span>
      </div>
    </div>

    <!-- Footer Buttons -->
    <div class="flex items-center justify-between pt-2 border-t border-[var(--arc-hairline)]">
      <div class="flex items-center gap-2">
        <template v-if="confirmClear">
          <span class="text-xs font-mono text-[var(--status-err)]">Сбросить?</span>
          <button
            @click="doClear"
            class="px-2 py-1 rounded text-xs font-mono text-[var(--status-err)] hover:underline transition-colors cursor-pointer"
          >
            Да, сбросить
          </button>
          <button
            @click="confirmClear = false"
            class="px-2 py-1 rounded text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
          >
            Отмена
          </button>
        </template>
        <button 
          v-else
          @click="confirmClear = true"
          class="text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--status-err)] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          Сбросить повтор
        </button>
      </div>

      <div class="flex items-center gap-2">
        <ArcButton variant="secondary" size="sm" @click="$emit('close')">
          Отмена
        </ArcButton>
        <ArcButton variant="primary" size="sm" @click="handleSave">
          Сохранить график
        </ArcButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Check, Sparkles } from 'lucide-vue-next';
import { RecurrenceRule, RecurrenceType, RecurrenceEndType } from '../types';
import ArcButton from '../../../components/ui/ArcButton.vue';
import ArcDatePicker from '../../../components/ui/ArcDatePicker.vue';
import { WEEKDAYS_LIST, RECURRENCE_PRESETS, formatRecurrenceSummary } from '../composables/useRecurrenceHelpers';

const props = defineProps<{
  rule?: RecurrenceRule;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', rule: RecurrenceRule | undefined): void;
}>();

const localType = ref<RecurrenceType>('none');
const localInterval = ref<number>(1);
const localDays = ref<number[]>([]);
const localEndType = ref<RecurrenceEndType>('never');
const localCount = ref<number>(10);
const localEndDate = ref<string>('');
const activePreset = ref<string>('none');

const weekdaysList = WEEKDAYS_LIST;
const presets = RECURRENCE_PRESETS;

watch(() => props.rule, (rule) => {
  if (rule && rule.type !== 'none') {
    localType.value = rule.type;
    localInterval.value = Math.max(1, rule.interval || 1);
    localDays.value = rule.daysOfWeek ? [...rule.daysOfWeek] : [];
    localEndType.value = rule.endType || 'never';
    localCount.value = rule.count || 10;
    localEndDate.value = rule.endDate || '';
  } else {
    localType.value = 'none';
    localInterval.value = 1;
    localDays.value = [];
    localEndType.value = 'never';
    localCount.value = 10;
    localEndDate.value = '';
  }
  updateActivePresetState();
}, { immediate: true });

const updateActivePresetState = () => {
  if (localType.value === 'none') activePreset.value = 'none';
  else if (localType.value === 'daily' && localInterval.value === 1) activePreset.value = 'daily';
  else if (localType.value === 'monthly' && localInterval.value === 1) activePreset.value = 'monthly';
  else if (localType.value === 'weekly' && localInterval.value === 1 && localDays.value.length === 0) activePreset.value = 'weekly';
  else if ((localType.value === 'weekly' || localType.value === 'custom') && localInterval.value === 2) activePreset.value = 'biweekly';
  else if (localDays.value.length === 5 && [1, 2, 3, 4, 5].every(d => localDays.value.includes(d))) activePreset.value = 'workdays';
  else activePreset.value = 'custom';
};

const applyPreset = (id: string) => {
  activePreset.value = id;
  localEndType.value = 'never';
  if (id === 'none') {
    localType.value = 'none';
    localInterval.value = 1;
    localDays.value = [];
  } else if (id === 'daily') {
    localType.value = 'daily';
    localInterval.value = 1;
    localDays.value = [];
  } else if (id === 'workdays') {
    localType.value = 'custom';
    localInterval.value = 1;
    localDays.value = [1, 2, 3, 4, 5];
  } else if (id === 'weekly') {
    localType.value = 'weekly';
    localInterval.value = 1;
    localDays.value = [];
  } else if (id === 'biweekly') {
    localType.value = 'custom';
    localInterval.value = 2;
    localDays.value = [1, 2, 3, 4, 5];
  } else if (id === 'monthly') {
    localType.value = 'monthly';
    localInterval.value = 1;
    localDays.value = [];
  }
};

const toggleDay = (day: number) => {
  if (localDays.value.includes(day)) {
    localDays.value = localDays.value.filter(d => d !== day);
  } else {
    localDays.value = [...localDays.value, day];
  }
  if (localType.value !== 'custom' && localType.value !== 'weekly') {
    localType.value = 'custom';
  }
  activePreset.value = 'custom';
};

const setPresetDays = (preset: 'workdays' | 'weekend' | 'all') => {
  if (preset === 'workdays') localDays.value = [1, 2, 3, 4, 5];
  else if (preset === 'weekend') localDays.value = [6, 0];
  else localDays.value = [1, 2, 3, 4, 5, 6, 0];
  
  if (localType.value !== 'custom' && localType.value !== 'weekly') {
    localType.value = 'custom';
  }
  activePreset.value = 'custom';
};

const humanSummary = computed(() => {
  return formatRecurrenceSummary(
    localType.value,
    localInterval.value,
    localDays.value,
    localEndType.value,
    localCount.value,
    localEndDate.value
  );
});

const handleSave = () => {
  if (localType.value === 'none') {
    emit('save', undefined);
  } else {
    const rule: RecurrenceRule = {
      type: localType.value,
      interval: Math.max(1, localInterval.value || 1),
      daysOfWeek: (localType.value === 'weekly' || localType.value === 'custom') && localDays.value.length > 0
        ? [...localDays.value]
        : undefined,
      endType: localEndType.value,
      count: localEndType.value === 'after_occurrences' ? Math.max(1, localCount.value || 1) : undefined,
      endDate: localEndType.value === 'on_date' ? localEndDate.value : undefined
    };
    emit('save', rule);
  }
  emit('close');
};

const confirmClear = ref(false);

const doClear = () => {
  localType.value = 'none';
  localInterval.value = 1;
  localDays.value = [];
  localEndType.value = 'never';
  localCount.value = 10;
  localEndDate.value = '';
  confirmClear.value = false;
  emit('save', undefined);
  emit('close');
};
</script>
