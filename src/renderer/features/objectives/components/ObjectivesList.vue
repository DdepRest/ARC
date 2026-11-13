<template>
  <div 
    class="border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px] overflow-hidden flex flex-col"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <div 
      class="px-4 py-3 border-b border-[var(--arc-divider)] flex justify-between items-center bg-[var(--arc-rail)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-2">
        <span class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">Список целей</span>
        <span class="text-xs font-mono text-[var(--arc-text-hint)]">({{ objectives.length }})</span>
      </div>
      <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">РЕЕСТР</span>
    </div>

    <div v-if="objectives.length > 0" class="divide-y divide-[var(--arc-divider)] max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
      <div 
        v-for="obj in objectives" 
        :key="obj.id"
        @click="$emit('selectObjective', obj.id)"
        class="p-4 flex flex-col gap-2 hover:bg-[var(--arc-hover)] cursor-pointer transition-colors relative group"
        :class="[selectedObjId === obj.id ? 'bg-[var(--arc-selected)]' : 'bg-transparent']"
      >
        <!-- Restrained Active Line Indicator -->
        <div 
          class="absolute left-0 top-0 bottom-0 w-[2.5px] transition-all duration-200" 
          :class="selectedObjId === obj.id ? 'bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]' : 'bg-transparent group-hover:bg-[var(--arc-hover)]'"
        ></div>

        <!-- Header: ID + Status Badge -->
        <div class="flex justify-between items-center text-xs font-mono">
          <span class="text-[var(--arc-text-hint)]">ID: {{ safeSlice(obj.id, 0, 8) }}</span>
          <StatusBadge :status="obj.status" />
        </div>

        <!-- Title -->
        <h4 class="text-sm font-sans font-semibold text-[var(--arc-text-primary)] transition-colors leading-snug line-clamp-2">
          {{ obj.title }}
        </h4>

        <!-- Description Snippet -->
        <p v-if="obj.description" class="text-xs font-sans text-[var(--arc-text-secondary)] line-clamp-2 leading-relaxed">
          {{ obj.description }}
        </p>

        <!-- Footer Meta -->
        <div class="flex items-center justify-between mt-1 text-xs font-mono text-[var(--arc-text-hint)] pt-2 border-t border-[var(--arc-divider)]">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1.5">
              <span>CONF:</span>
              <span 
                class="font-semibold"
                :class="obj.confidence > 0.6 ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'"
              >
                {{ Math.round(obj.confidence * 100) }}%
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <span>PRIORITY:</span>
              <span class="text-[var(--arc-text-primary)] font-semibold">{{ obj.priority }}</span>
            </div>
          </div>
          <span v-if="obj.owner" class="text-xs text-[var(--arc-text-hint)] tracking-wider uppercase font-semibold">
            {{ obj.owner }}
          </span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="p-8 flex flex-col items-center justify-center text-center">
      <div 
        class="w-10 h-10 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] flex items-center justify-center text-[var(--arc-text-hint)] mb-3.5"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        <Target class="w-5 h-5 text-[var(--accent)]" />
      </div>
      <span class="text-xs font-mono tracking-[0.16em] text-[var(--arc-text-hint)] uppercase mb-1">VECTORS // EMPTY</span>
      <h4 class="text-xs font-mono tracking-wider uppercase font-semibold text-[var(--arc-text-primary)] mb-1.5">Векторы не заданы</h4>
      <p class="text-xs font-sans text-[var(--arc-text-secondary)] max-w-[240px] leading-relaxed mb-4">
        Стратегические цели и направления автономного контура еще не сформированы.
      </p>
      <ArcButton 
        @click="$emit('createObjective')"
        variant="secondary"
        size="sm"
      >
        <template #icon>
          <Plus class="w-3.5 h-3.5" />
        </template>
        Задать намерение
      </ArcButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Target, Plus } from 'lucide-vue-next';
import StatusBadge from '../../../components/ui/StatusBadge.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';

defineProps<{
  objectives: any[];
  selectedObjId: string | null;
  safeSlice: (val: any, start: number, end?: number) => string;
}>();

defineEmits<{
  (e: 'selectObjective', id: string): void;
  (e: 'createObjective'): void;
}>();
</script>
