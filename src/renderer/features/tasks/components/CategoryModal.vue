<template>
  <div class="flex flex-col gap-4 relative">
    <!-- Form: Add New Category -->
    <div class="flex flex-col gap-3 bg-[var(--arc-block)] border border-[var(--arc-hairline)] p-3.5 rounded-xl">
      <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold">СОЗДАТЬ НОВУЮ КАТЕГОРИЮ</span>
      
      <div class="flex items-center gap-2">
        <ArcInput
          v-model="newCatName"
          type="text"
          placeholder="Название категории..."
          size="sm"
          @enter="handleCreate"
          class="flex-1"
        />
        <ArcButton
          variant="primary"
          size="sm"
          :disabled="!newCatName.trim()"
          @click="handleCreate"
          class="shrink-0"
        >
          <template #icon>
            <Plus class="w-3.5 h-3.5" />
          </template>
          Добавить
        </ArcButton>
      </div>
    </div>

    <!-- Categories List -->
    <div class="flex flex-col gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
      <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-widest font-semibold">СУЩЕСТВУЮЩИЕ КАТЕГОРИИ ({{ categories.length }})</span>

      <div 
        v-for="cat in categories" 
        :key="cat.id"
        class="flex items-center justify-between p-2.5 rounded-xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-medium)] transition"
      >
        <div class="flex items-center gap-2.5">
          <span 
            class="text-xs font-mono px-2 py-0.5 rounded-md border tracking-wider uppercase font-semibold"
            :class="getCategoryStyles(cat.id)"
          >
            {{ cat.name }}
          </span>
        </div>

        <div v-if="categories.length > 1" class="flex items-center gap-1.5">
          <template v-if="confirmDeleteId === cat.id">
            <span class="text-xs font-mono text-[var(--status-err)]">Удалить?</span>
            <button
              @click="confirmDelete(cat.id)"
              class="px-2 py-0.5 rounded text-xs font-mono text-[var(--status-err)] hover:underline transition-colors cursor-pointer"
            >
              Да
            </button>
            <button
              @click="confirmDeleteId = null"
              class="px-2 py-0.5 rounded text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            >
              Нет
            </button>
          </template>
          <button
            v-else
            @click="confirmDeleteId = cat.id"
            class="w-7 h-7 rounded-lg text-[var(--arc-text-muted)] hover:text-[var(--status-err)] flex items-center justify-center transition-colors cursor-pointer"
            title="Удалить категорию"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Footer action -->
    <div class="flex justify-end pt-2 border-t border-[var(--arc-hairline)]">
      <ArcButton variant="secondary" size="sm" @click="$emit('close')">
        Готово
      </ArcButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import { TaskCategory } from '../types';
import ArcInput from '../../../components/ui/ArcInput.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';

const props = defineProps<{
  categories: TaskCategory[];
  getCategoryStyles: (cat: string) => string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'createCategory', name: string, color?: string): void;
  (e: 'deleteCategory', id: string): void;
}>();

const newCatName = ref('');
const confirmDeleteId = ref<string | null>(null);

const handleCreate = () => {
  if (!newCatName.value.trim()) return;
  emit('createCategory', newCatName.value.trim(), 'default');
  newCatName.value = '';
};

const confirmDelete = (id: string) => {
  emit('deleteCategory', id);
  confirmDeleteId.value = null;
};
</script>
