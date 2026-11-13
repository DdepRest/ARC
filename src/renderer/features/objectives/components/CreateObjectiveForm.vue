<template>
  <transition name="expand">
    <div v-if="show" class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-xl p-6 md:p-8 relative shadow-lg">
      <h3 class="text-sm font-sans font-medium text-[var(--arc-text-primary)] mb-5 flex items-center gap-2">
        <Compass class="w-4 h-4 text-[var(--accent)]" /> 
        <span>Формулирование нового намерения</span>
      </h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="flex flex-col gap-2">
          <label class="text-xs font-sans text-[var(--arc-text-hint)]">Название цели</label>
          <input 
            v-model="newTitle" 
            type="text" 
            placeholder="Например, Увеличить MRR проекта на 35%" 
            class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-lg px-3.5 py-2.5 text-sm font-sans text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        
        <div class="flex flex-col gap-2">
          <label class="text-xs font-sans text-[var(--arc-text-hint)]">Уровень приоритета [1 - 1000]</label>
          <input 
            v-model.number="newPriority" 
            type="number" 
            min="1" 
            max="1000"
            class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-lg px-3.5 py-2.5 text-sm font-sans text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
          />
        </div>

        <div class="col-span-1 md:col-span-2 flex flex-col gap-2">
          <label class="text-xs font-sans text-[var(--arc-text-hint)]">Подробное описание намерения и желаемого состояния мира</label>
          <textarea 
            v-model="newDescription" 
            rows="3" 
            placeholder="Например, Оптимизировать воронку конверсии, наладить сбор логов, исправить ошибки..." 
            class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-lg px-3.5 py-2.5 text-sm font-sans text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
          ></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-6">
        <ArcButton 
          @click="$emit('cancel')"
          variant="secondary"
          size="sm"
        >
          Отмена
        </ArcButton>
        <ArcButton 
          @click="submitObjective"
          :disabled="isSubmitting || !newTitle.trim()"
          variant="primary"
          size="sm"
        >
          <template #icon v-if="isSubmitting">
            <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          </template>
          Инициализировать цель
        </ArcButton>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Compass } from 'lucide-vue-next';
import ArcButton from '../../../components/ui/ArcButton.vue';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'created'): void;
}>();

const newTitle = ref('');
const newDescription = ref('');
const newPriority = ref(100);
const isSubmitting = ref(false);

const submitObjective = async () => {
  if (!window.api || !newTitle.value.trim() || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    const obj = await window.api.objectiveCreate({
      title: newTitle.value,
      description: newDescription.value,
      owner: 'CHAIRMAN',
      priority: newPriority.value
    });

    await window.api.objectiveDecompose({
      objectiveId: obj.id,
      taskDescriptionText: newDescription.value || newTitle.value
    });

    newTitle.value = '';
    newDescription.value = '';
    newPriority.value = 100;
    emit('created');
  } catch (err) {
    console.error('Failed to create and decompose objective:', err);
  } finally {
    isSubmitting.value = false;
  }
};
</script>
