<template>
  <div 
    class="flex flex-col overflow-hidden rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] transition-colors"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <!-- Header with progress counter -->
    <div 
      class="flex items-center justify-between px-4 py-3 border-b border-[var(--arc-divider)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-2">
        <CheckCircle2 class="w-4 h-4 text-[var(--status-ok)] shrink-0" />
        <span class="text-[13px] font-semibold text-[var(--arc-text-primary)] leading-[1.35]">{{ title }}</span>
      </div>
      <span 
        class="text-xs font-mono px-2 py-0.5 rounded-[6px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[var(--arc-text-muted)] uppercase tracking-[0.08em]"
      >
        {{ completedCount }} из {{ totalCount }}
      </span>
    </div>

    <!-- Steps List -->
    <div class="divide-y divide-[var(--arc-divider)]">
      <div 
        v-for="(step, idx) in steps" 
        :key="idx"
        class="flex items-start gap-3.5 p-3.5 transition-colors"
        :class="step.active ? 'bg-[var(--arc-hover)]' : ''"
      >
        <!-- Step Number or Check Icon -->
        <div 
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold shrink-0 mt-0.5 border"
          :class="step.completed
            ? 'border-[var(--status-ok)]/40 text-[var(--status-ok)] bg-transparent'
            : step.active
              ? 'border-[var(--arc-hairline)] text-[var(--arc-text-primary)] bg-[var(--arc-hover)]'
              : 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-transparent'"
        >
          <Check v-if="step.completed" class="w-3.5 h-3.5" />
          <span v-else>{{ idx + 1 }}</span>
        </div>

        <!-- Step Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span 
              class="text-xs font-semibold"
              :class="step.completed || step.active ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-secondary)]'"
            >
              {{ step.title }}
            </span>
            <span 
              v-if="step.statusLabel" 
              class="text-xs font-mono px-2 py-0.5 rounded-[6px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] uppercase tracking-[0.08em] text-[var(--arc-text-muted)]"
            >
              {{ step.statusLabel }}
            </span>
          </div>

          <p class="text-xs text-[var(--arc-text-secondary)] leading-[1.50] mt-0.5">
            {{ step.description }}
          </p>

          <div v-if="step.actionSlot || $slots[`action-${idx}`]" class="mt-2.5 flex items-center gap-2">
            <slot :name="`action-${idx}`" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, Check } from 'lucide-vue-next';

export interface ChecklistStep {
  title: string;
  description: string;
  completed: boolean;
  active?: boolean;
  statusLabel?: string;
  actionSlot?: boolean;
}

const props = defineProps<{
  title: string;
  steps: ChecklistStep[];
}>();

const totalCount = computed(() => props.steps.length);
const completedCount = computed(() => props.steps.filter(s => s.completed).length);
</script>
