<template>
  <div class="w-full flex flex-col p-3.5 rounded-xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-xs my-1 select-none animate-in fade-in duration-200">
    <div class="flex items-start gap-2.5">
      <div class="p-1.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--status-warn)] shrink-0 mt-0.5">
        <ShieldAlert class="w-4 h-4" />
      </div>

      <div class="flex-1 flex flex-col gap-1.5 min-w-0 font-sans">
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs font-bold uppercase tracking-wider text-[var(--status-warn)] flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
            Validator · Результат отклонен
          </span>
          <span class="text-[10px] font-mono text-[var(--arc-text-machine)]">Требуется действие</span>
        </div>

        <p class="text-[var(--arc-text-primary)] text-xs leading-relaxed font-sans">
          {{ feedback.reason || 'Ответ не прошел автоматическую проверку качества или содержит неточности.' }}
        </p>

        <!-- Collapsible Technical Details for debugging -->
        <div v-if="feedback.details" class="mt-1">
          <button 
            @click="showDetails = !showDetails" 
            type="button"
            class="text-xs font-mono text-[var(--status-warn)] hover:opacity-80 underline underline-offset-2 transition-opacity cursor-pointer"
          >
            {{ showDetails ? 'Скрыть технические детали' : 'Показать технические детали' }}
          </button>
          
          <div 
            v-if="showDetails" 
            class="mt-1.5 p-2 rounded-lg bg-[var(--arc-code)] border border-[var(--arc-hairline)] font-mono text-xs text-[var(--arc-text-secondary)] overflow-x-auto whitespace-pre-wrap select-text"
          >
            {{ feedback.details }}
          </div>
        </div>

        <!-- Action Buttons: Повторить & Уточнить -->
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--arc-divider)]">
          <button 
            @click="$emit('retry')"
            type="button"
            class="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] text-xs font-medium flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Повторить</span>
          </button>

          <button 
            @click="openProviderSettings"
            type="button"
            class="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] text-xs font-medium flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Settings class="w-3.5 h-3.5" />
            <span>Настройки провайдера</span>
          </button>

          <button 
            @click="$emit('refine')"
            type="button"
            class="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] text-xs font-medium flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Edit2 class="w-3.5 h-3.5" />
            <span>Уточнить</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ShieldAlert, RotateCcw, Edit2, Settings } from 'lucide-vue-next';
import type { ValidatorFeedback } from '../../../../shared/types/models/chat';
import { useUIStore } from '../../../stores/ui.store';
import { useSettingsNav } from '../../settings/composables/useSettingsNav';

defineProps<{
  feedback: ValidatorFeedback;
}>();

defineEmits<{
  (e: 'retry'): void;
  (e: 'refine'): void;
}>();

const showDetails = ref(false);

const openProviderSettings = () => {
  useUIStore().setActiveTab('settings');
  useSettingsNav().navigateToSection('intelligence', 'section-providers');
};
</script>
