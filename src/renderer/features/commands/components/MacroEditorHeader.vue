<template>
  <header 
    class="h-14 border-b border-[var(--arc-hairline)] flex items-center justify-between px-6 bg-[var(--arc-plane)] shrink-0"
    :style="{ backgroundImage: 'var(--arc-sheen)' }"
  >
    <div class="flex items-center gap-4">
      <FloatingBackButton text="Назад" @click="$emit('close')" />
      <div class="h-6 w-px bg-[var(--arc-hairline)]"></div>
      <div class="flex flex-col">
        <div class="flex items-center gap-1.5 leading-none mb-0.5">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)] animate-pulse"></span>
          <span class="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent)]">{{ editingMacroId ? 'Сценарий загружен' : 'Создание сценария' }}</span>
        </div>
        <div class="flex items-baseline gap-3">
          <input 
            type="text" 
            :value="macroName" 
            @input="$emit('update:macroName', ($event.target as HTMLInputElement).value)"
            placeholder="Название макроса..." 
            class="bg-transparent border-none outline-none text-[var(--arc-text-primary)] focus:text-[var(--accent)] font-sans font-bold text-sm tracking-wide transition-colors placeholder-[var(--arc-text-hint)] w-64 focus:ring-0 p-0" 
          />
          <span class="text-[var(--arc-text-hint)] text-xs select-none">/</span>
          <input 
            type="text" 
            :value="macroDesc" 
            @input="$emit('update:macroDesc', ($event.target as HTMLInputElement).value)"
            placeholder="Описание..." 
            class="bg-transparent border-none outline-none text-[var(--arc-text-muted)] hover:text-[var(--arc-text-secondary)] focus:text-[var(--arc-text-primary)] font-mono text-xs transition-colors placeholder-[var(--arc-text-hint)] w-80 focus:ring-0 p-0" 
          />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2.5">
      <button 
        v-if="editingMacroId" 
        :disabled="isRunning" 
        @click="$emit('run')" 
        class="px-4 py-1.5 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] disabled:opacity-50 text-[var(--status-ok)] font-mono text-xs font-semibold rounded-[10px] active:scale-[0.98] border border-[rgba(var(--status-ok-rgb,34,197,94),0.35)] transition flex items-center gap-2 cursor-pointer"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
      >
        <Play class="w-3.5 h-3.5" :class="{ 'animate-pulse': isRunning }" /> 
        <span>{{ isRunning ? 'Запуск...' : 'Тестировать' }}</span>
      </button>
      <button 
        @click="$emit('save')" 
        class="px-4 py-1.5 bg-[var(--accent)] hover:opacity-90 text-white font-mono text-xs font-semibold rounded-[10px] shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)] active:scale-[0.98] border border-[rgba(var(--accent-rgb),0.5)] transition flex items-center gap-2 cursor-pointer"
      >
        <Save class="w-3.5 h-3.5" /> Сохранить
      </button>
      <button 
        @click="$emit('close')" 
        class="px-4 py-1.5 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] font-mono text-xs font-medium border border-[var(--arc-hairline)] rounded-[10px] active:scale-[0.98] transition cursor-pointer"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        Отмена
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Play, Save } from 'lucide-vue-next';
import FloatingBackButton from '../../../components/ui/FloatingBackButton.vue';

defineProps<{
  editingMacroId: string | null;
  macroName: string;
  macroDesc: string;
  isRunning: boolean;
}>();

defineEmits<{
  (e: 'update:macroName', name: string): void;
  (e: 'update:macroDesc', desc: string): void;
  (e: 'close'): void;
  (e: 'save'): void;
  (e: 'run'): void;
}>();
</script>
