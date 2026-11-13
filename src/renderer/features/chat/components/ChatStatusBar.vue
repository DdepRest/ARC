<template>
  <div class="w-full flex items-center justify-between px-3.5 py-2 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-xl shrink-0 z-20 select-none transition-all duration-300">
    <!-- Left: Status indicator & current state / action -->
    <div class="flex items-center gap-2 min-w-0">
      <!-- Status Dot with Dynamic States -->
      <div class="relative flex items-center justify-center shrink-0">
        <span 
          class="w-2 h-2 rounded-full transition duration-300"
          :class="statusDotClasses"
        ></span>
        <span 
          v-if="isProcessing" 
          class="absolute w-3.5 h-3.5 rounded-full animate-ping opacity-35"
          :class="statusPulseClasses"
        ></span>
      </div>

      <!-- State Title & Action Description -->
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-mono font-medium tracking-wide uppercase" :class="statusTextClasses">
          {{ statusTitle }}
        </span>

        <span 
          v-if="currentActionText && isProcessing" 
          class="text-xs font-mono text-[var(--arc-text-hint)] truncate max-w-[220px] sm:max-w-[340px] border-l border-[var(--arc-divider)] pl-2 hidden xs:inline-block"
          :title="currentActionText"
        >
          {{ currentActionText }}
        </span>
      </div>
    </div>

    <!-- Right: Secondary Active Model Brain Badge -->
    <div class="flex items-center gap-2 shrink-0">
      <div 
        v-if="activeModelName" 
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-hint)] transition-colors"
        :title="modelTooltip"
      >
        <Cpu class="w-3 h-3 text-[var(--arc-text-machine)]" />
        <span class="text-[10px] font-mono tracking-wider truncate max-w-[140px]">
          {{ activeModelName }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Cpu } from 'lucide-vue-next';
import type { AgentStateStatus } from '../../../../shared/types/models/chat';

const props = defineProps<{
  status: AgentStateStatus;
  actionText?: string;
  modelName?: string;
  isLocal?: boolean;
}>();

const isProcessing = computed(() => {
  return ['planning', 'executing', 'validating'].includes(props.status);
});

const statusTitle = computed(() => {
  switch (props.status) {
    case 'planning':
      return 'Планирую...';
    case 'executing':
      return 'Выполняю...';
    case 'validating':
      return 'Проверяю результат...';
    case 'ready':
      return 'Готово';
    case 'error':
      return 'Ошибка';
    case 'idle':
    default:
      return 'Ожидание директивы';
  }
});

const currentActionText = computed(() => {
  return props.actionText || '';
});

const statusDotClasses = computed(() => {
  switch (props.status) {
    case 'planning':
      return 'bg-[var(--status-info)]';
    case 'executing':
      return 'bg-[var(--status-warn)]';
    case 'validating':
      return 'bg-[var(--accent)]';
    case 'ready':
      return 'bg-[var(--status-ok)]';
    case 'error':
      return 'bg-[var(--status-err)]';
    case 'idle':
    default:
      return 'bg-[var(--status-off)]';
  }
});

const statusPulseClasses = computed(() => {
  switch (props.status) {
    case 'planning':
      return 'bg-[var(--status-info)]';
    case 'executing':
      return 'bg-[var(--status-warn)]';
    case 'validating':
      return 'bg-[var(--accent)]';
    case 'error':
      return 'bg-[var(--status-err)]';
    default:
      return 'bg-[var(--arc-text-muted)]';
  }
});

const statusTextClasses = computed(() => {
  switch (props.status) {
    case 'planning':
      return 'text-[var(--status-info)]';
    case 'executing':
      return 'text-[var(--status-warn)]';
    case 'validating':
      return 'text-[var(--arc-text-primary)]';
    case 'ready':
      return 'text-[var(--status-ok)]';
    case 'error':
      return 'text-[var(--status-err)]';
    case 'idle':
    default:
      return 'text-[var(--arc-text-muted)]';
  }
});

const activeModelName = computed(() => {
  return props.modelName || 'A.R.C. Neural Core';
});

const modelTooltip = computed(() => {
  return `Текущий активный модуль: ${activeModelName.value} (${props.isLocal ? 'Локальный' : 'Облачный'})`;
});
</script>
