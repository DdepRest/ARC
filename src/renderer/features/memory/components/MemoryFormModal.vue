<template>
  <ArcModal
    :show="isOpen"
    :title="isEdit ? 'Редактирование узла' : 'Новый узел памяти'"
    :subtitle="isEdit ? 'Изменение данных когнитивного слоя' : 'Добавление записи в долговременную память'"
    @close="$emit('close')"
    maxWidth="max-w-lg"
  >
    <template #title-prefix>
      <Database class="w-4 h-4 text-[var(--arc-text-muted)]" />
    </template>
    
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- Category Selection -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="block text-xs uppercase font-mono text-[var(--arc-text-muted)] tracking-wider">Категория узла</label>
          <span class="text-xs text-[var(--arc-text-hint)] font-mono">{{ selectedCategoryHint }}</span>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="cat in categories"
            :key="cat.value"
            type="button"
            @click="form.category = cat.value"
            :title="cat.description"
            class="py-2 px-1 text-xs font-mono font-medium rounded-[10px] border text-center transition flex flex-col items-center gap-1 cursor-pointer"
            :class="[
              form.category === cat.value
                ? 'border-[var(--accent)] text-[var(--arc-text-primary)] bg-[var(--arc-selected)]'
                : 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-[var(--arc-block)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'
            ]"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
          >
            <component :is="cat.icon" class="w-3.5 h-3.5" :class="form.category === cat.value ? 'text-[var(--accent)]' : ''" />
            <span class="truncate max-w-full px-0.5">{{ cat.label }}</span>
          </button>
        </div>
      </div>

      <!-- Key Input -->
      <div>
        <label class="block text-xs uppercase font-mono text-[var(--arc-text-muted)] tracking-wider mb-1">Ключ / Заголовок</label>
        <input
          v-model="form.key"
          type="text"
          required
          placeholder="напр., Предпочитаемая тема"
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none focus:border-[var(--accent)] transition-colors"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
        />
      </div>

      <!-- Value Textarea -->
      <div>
        <label class="block text-xs uppercase font-mono text-[var(--arc-text-muted)] tracking-wider mb-1">Содержимое (текст или JSON)</label>
        <textarea
          v-model="form.value"
          required
          rows="4"
          placeholder="Внесите факты, предпочтения или инструкцию..."
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] p-3 text-xs text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none focus:border-[var(--accent)] transition-colors custom-scrollbar resize-none"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
        ></textarea>
      </div>

      <!-- Source & Confidence Row -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs uppercase font-mono text-[var(--arc-text-muted)] tracking-wider mb-1">Источник</label>
          <div class="relative">
            <select
              v-model="form.source"
              class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] outline-none appearance-none cursor-pointer pr-8 focus:border-[var(--accent)] transition-colors"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
            >
              <option value="user_stated" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)] py-1">Заявлено пользователем</option>
              <option value="inferred" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)] py-1">Выведено агентом</option>
              <option value="extracted" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)] py-1">Извлечено из диалога</option>
              <option value="system" class="bg-[var(--arc-plane)] text-[var(--arc-text-primary)] py-1">Системный модуль</option>
            </select>
            <ChevronDown class="w-3.5 h-3.5 text-[var(--arc-text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div class="flex flex-col justify-end">
          <ArcSlider
            v-model="form.confidence"
            :min="0.1"
            :max="1.0"
            :step="0.05"
            label="Уверенность"
            :format-value="(val) => `${(val * 100).toFixed(0)}%`"
            :show-value="true"
          />
        </div>
      </div>

      <!-- Modal Actions -->
      <div class="pt-3 flex justify-end gap-2.5 border-t border-[var(--arc-hairline)]">
        <ArcButton
          type="button"
          variant="secondary"
          size="sm"
          @click="$emit('close')"
        >
          Отмена
        </ArcButton>
        <ArcButton
          type="submit"
          variant="primary"
          size="sm"
        >
          {{ isEdit ? 'Сохранить' : 'Создать' }}
        </ArcButton>
      </div>
    </form>
  </ArcModal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { type LongTermMemoryEntry, type MemoryCategory } from '../../../../shared/types/memory';
import { Database, FileText, Heart, Brain, Activity, ChevronDown } from 'lucide-vue-next';
import ArcSlider from '../../../components/ui/ArcSlider.vue';
import ArcModal from '../../../components/ui/ArcModal.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';

const props = defineProps<{
  isOpen: boolean;
  initialData?: LongTermMemoryEntry | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', data: Partial<LongTermMemoryEntry>): void;
}>();

const isEdit = computed(() => !!props.initialData?.id);

const form = ref({
  id: '',
  key: '',
  value: '',
  category: 'fact' as MemoryCategory,
  confidence: 0.9,
  source: 'user_stated'
});

const categories = [
  { value: 'fact' as MemoryCategory, label: 'Факт', icon: FileText, description: 'Неизменяемые факты (имя, место, язык)' },
  { value: 'preference' as MemoryCategory, label: 'Предпочтение', icon: Heart, description: 'Вкусы, стили, привычки работы' },
  { value: 'knowledge' as MemoryCategory, label: 'Знание', icon: Brain, description: 'Технические знания, стек, API' },
  { value: 'event' as MemoryCategory, label: 'Событие', icon: Activity, description: 'Прошлые действия, задачи, события' }
];

const selectedCategoryHint = computed(() => {
  const cat = categories.find(c => c.value === form.value.category);
  return cat ? cat.description : '';
});

watch(() => props.initialData, (newVal) => {
  if (newVal) {
    form.value = {
      id: newVal.id || '',
      key: newVal.key || '',
      value: typeof newVal.value === 'string' ? newVal.value : JSON.stringify(newVal.value, null, 2),
      category: newVal.category || 'fact',
      confidence: newVal.confidence !== undefined ? newVal.confidence : 0.9,
      source: newVal.source || 'user_stated'
    };
  } else {
    form.value = {
      id: '',
      key: '',
      value: '',
      category: 'fact',
      confidence: 0.9,
      source: 'user_stated'
    };
  }
}, { immediate: true });

const handleSubmit = () => {
  let valToSave: any = form.value.value;
  try {
    const trimmed = form.value.value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      valToSave = JSON.parse(trimmed);
    }
  } catch {
    // Keep as string if parsing fails
  }

  emit('submit', {
    id: form.value.id || undefined,
    key: form.value.key,
    value: valToSave,
    category: form.value.category,
    confidence: form.value.confidence,
    source: form.value.source
  });
};
</script>
