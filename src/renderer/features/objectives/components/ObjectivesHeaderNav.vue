<template>
  <div class="flex flex-col gap-5 select-none">
    <!-- Top Action Header -->
    <div 
      class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[var(--arc-hairline)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="objectives-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] flex items-center justify-center shrink-0"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Target class="w-4 h-4" />
        </div>
        <div>
          <h2 class="text-[15px] font-sans font-semibold text-[var(--arc-text-primary)] tracking-normal">Стратегические цели</h2>
          <p class="text-xs font-mono text-[var(--arc-text-muted)] mt-0.5">Управление системными и долгосрочными намерениями ядра A.R.C.</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <ArcButton 
          @click="$emit('update:showCreateForm', !showCreateForm)"
          variant="primary"
          size="sm"
        >
          <template #icon>
            <Plus class="w-3.5 h-3.5 shrink-0" />
          </template>
          {{ showCreateForm ? 'Скрыть форму' : 'Создать цель' }}
        </ArcButton>
      </div>
    </div>

    <!-- Tabbed Navigation Bar (12px/600/UPPER/mono/.10em, 2px bottom line, zero fill) -->
    <div role="tablist" class="flex items-center gap-6 border-b border-[var(--arc-hairline)] px-1">
      <button 
        role="tab"
        :aria-selected="activeSection === 'goals'"
        @click="$emit('update:activeSection', 'goals')"
        class="pb-2.5 text-xs font-mono font-semibold tracking-[0.10em] uppercase transition cursor-pointer border-b-2 focus-visible:outline-none"
        :class="activeSection === 'goals' 
          ? 'border-[var(--accent)] text-[var(--arc-text-primary)]' 
          : 'border-transparent text-[var(--arc-text-secondary)] hover:text-white'"
      >
        ЦЕЛИ И РЕЗУЛЬТАТЫ
      </button>
      <button 
        role="tab"
        :aria-selected="activeSection === 'topology'"
        @click="$emit('update:activeSection', 'topology')"
        class="pb-2.5 text-xs font-mono font-semibold tracking-[0.10em] uppercase transition relative cursor-pointer border-b-2 focus-visible:outline-none"
        :class="activeSection === 'topology' 
          ? 'border-[var(--accent)] text-[var(--arc-text-primary)]' 
          : 'border-transparent text-[var(--arc-text-secondary)] hover:text-white'"
      >
        КАРТА ТРАЕКТОРИЙ
        <span v-if="hasDraftObjective" class="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--status-warn)] animate-pulse"></span>
      </button>
      <button 
        role="tab"
        :aria-selected="activeSection === 'diagnostics'"
        @click="$emit('update:activeSection', 'diagnostics')"
        class="pb-2.5 text-xs font-mono font-semibold tracking-[0.10em] uppercase transition cursor-pointer border-b-2 focus-visible:outline-none"
        :class="activeSection === 'diagnostics' 
          ? 'border-[var(--accent)] text-[var(--arc-text-primary)]' 
          : 'border-transparent text-[var(--arc-text-secondary)] hover:text-white'"
      >
        СИСТЕМНЫЙ АНАЛИЗ
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, ArrowLeft, Target } from 'lucide-vue-next';
import ArcButton from '../../../components/ui/ArcButton.vue';
import { useUIStore } from '../../../stores/ui.store';

const uiStore = useUIStore();

defineProps<{
  activeSection: 'goals' | 'topology' | 'diagnostics';
  showCreateForm: boolean;
  hasDraftObjective: boolean;
}>();

defineEmits<{
  (e: 'update:activeSection', section: 'goals' | 'topology' | 'diagnostics'): void;
  (e: 'update:showCreateForm', show: boolean): void;
}>();
</script>
