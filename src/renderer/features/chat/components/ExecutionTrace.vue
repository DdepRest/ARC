<template>
  <div class="w-full flex flex-col my-1 select-none">
    <div 
      class="rounded-xl border transition duration-200 overflow-hidden bg-[var(--arc-plane)]"
      :class="[
        hasError 
          ? 'border-[var(--status-err)]' 
          : isAnyRunning
            ? 'border-[var(--accent)]'
            : 'border-[var(--arc-hairline)]'
      ]"
    >
      <!-- Collapsible Header -->
      <button 
        @click="toggleExpand"
        type="button"
        class="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer hover:bg-[var(--arc-hover)]"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="flex items-center justify-center w-5 h-5 rounded-md bg-[var(--arc-block)] border border-[var(--arc-hairline)] shrink-0">
            <Loader2 v-if="isAnyRunning" class="w-3.5 h-3.5 animate-spin text-[var(--status-info)]" />
            <AlertCircle v-else-if="hasError" class="w-3.5 h-3.5 text-[var(--status-err)]" />
            <CheckCircle2 v-else class="w-3.5 h-3.5 text-[var(--status-ok)]" />
          </div>

          <span class="text-xs font-mono font-medium text-[var(--arc-text-primary)] truncate">
            Ход выполнения · {{ stepCountLabel }}
          </span>

          <span 
            v-if="hasError" 
            class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--arc-block)] text-[var(--status-err)] font-mono border border-[var(--status-err)] inline-flex items-center gap-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-err)]"></span>
            Ошибка
          </span>
          <span 
            v-else-if="isAnyRunning" 
            class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--arc-block)] text-[var(--status-info)] font-mono border border-[var(--arc-hairline)] inline-flex items-center gap-1 animate-pulse"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-info)]"></span>
            Выполняется
          </span>
        </div>

        <div class="flex items-center gap-2 text-[var(--arc-text-hint)] group-hover:text-[var(--arc-text-primary)] shrink-0">
          <span class="text-xs font-sans text-[var(--arc-text-hint)] hidden sm:inline">
            {{ isExpanded ? 'Свернуть' : 'Развернуть' }}
          </span>
          <ChevronDown 
            class="w-4 h-4 transition-transform duration-200" 
            :class="isExpanded ? 'rotate-180 text-[var(--arc-text-secondary)]' : 'text-[var(--arc-text-hint)]'" 
          />
        </div>
      </button>

      <!-- Steps Content List -->
      <div 
        v-show="isExpanded" 
        class="px-3.5 pb-3 pt-2 border-t border-[var(--arc-divider)] flex flex-col gap-2 animate-in fade-in duration-150 bg-[var(--arc-plane)]"
      >
        <div 
          v-for="(step, idx) in steps" 
          :key="step.id || idx"
          class="flex flex-col p-2.5 rounded-lg bg-[var(--arc-block)] border border-[var(--arc-hairline)] transition text-xs"
        >
          <div class="flex items-start justify-between gap-2.5">
            <!-- Status indicator icon -->
            <div class="flex items-center gap-2 min-w-0">
              <div class="mt-0.5 shrink-0">
                <Loader2 v-if="step.status === 'running'" class="w-3.5 h-3.5 animate-spin text-[var(--status-info)]" />
                <Check v-else-if="step.status === 'success'" class="w-3.5 h-3.5 text-[var(--status-ok)]" />
                <X v-else-if="step.status === 'error'" class="w-3.5 h-3.5 text-[var(--status-err)]" />
                <div v-else class="w-3.5 h-3.5 rounded-full border border-[var(--arc-hairline)] flex items-center justify-center">
                  <div class="w-1.5 h-1.5 rounded-full bg-[var(--arc-text-hint)]"></div>
                </div>
              </div>

              <!-- Executor tag & Description -->
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span 
                    class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase tracking-wider inline-flex items-center gap-1 bg-[var(--arc-plane)] text-[var(--arc-text-machine)] border border-[var(--arc-hairline)]"
                  >
                    <span 
                      class="w-1.5 h-1.5 rounded-full shrink-0" 
                      :class="step.status === 'success' ? 'bg-[var(--status-ok)]' : step.status === 'error' ? 'bg-[var(--status-err)]' : step.status === 'running' ? 'bg-[var(--status-info)]' : 'bg-[var(--status-off)]'"
                    ></span>
                    {{ step.executor || 'System' }}
                  </span>
                  <span class="text-xs font-sans font-medium text-[var(--arc-text-primary)]">
                    {{ step.description || 'Выполнение...' }}
                  </span>
                </div>

                <!-- Error Message if present -->
                <div v-if="step.errorDetails" class="text-xs text-[var(--status-err)] font-sans mt-1.5 bg-[var(--arc-plane)] p-2 rounded-lg border border-[var(--status-err)]">
                  {{ step.errorDetails }}
                </div>
              </div>
            </div>

            <!-- Duration & Debug Info Toggle -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span v-if="step.durationMs" class="text-[10px] font-mono text-[var(--arc-text-machine)]">
                {{ step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s` }}
              </span>

              <button 
                v-if="step.inputData || step.outputData"
                @click="toggleDebugDetails(step.id || String(idx))"
                class="px-2 py-0.5 rounded-full text-[10px] font-mono text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] bg-white/5 hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition-colors cursor-pointer"
                :title="isDetailsOpen(step.id || String(idx)) ? 'Скрыть отладочные данные' : 'Показать входные/выходные данные'"
              >
                {{ isDetailsOpen(step.id || String(idx)) ? 'Скрыть JSON' : 'Детали' }}
              </button>
            </div>
          </div>

          <!-- Debug Payload details sub-block (collapsed by default) -->
          <div 
            v-if="isDetailsOpen(step.id || String(idx)) && (step.inputData || step.outputData)"
            class="mt-2 pt-2 border-t border-[var(--arc-divider)] flex flex-col gap-1.5 font-mono text-xs text-[var(--arc-text-hint)]"
          >
            <div v-if="step.inputData">
              <span class="text-[10px] text-[var(--arc-text-machine)] uppercase">Входные данные:</span>
              <pre class="bg-[var(--arc-code)] p-2 rounded border border-[var(--arc-hairline)] overflow-x-auto text-[var(--arc-text-secondary)] mt-1">{{ formatPayload(step.inputData) }}</pre>
            </div>
            <div v-if="step.outputData">
              <span class="text-[10px] text-[var(--arc-text-machine)] uppercase">Результат:</span>
              <pre class="bg-[var(--arc-code)] p-2 rounded border border-[var(--arc-hairline)] overflow-x-auto text-[var(--status-ok)] mt-1">{{ formatPayload(step.outputData) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Check, 
  X 
} from 'lucide-vue-next';
import type { ExecutionStep } from '../../../../shared/types/models/chat';

const props = defineProps<{
  steps: ExecutionStep[];
}>();

const isExpanded = ref(false);
const openDebugIds = ref<Record<string, boolean>>({});

const hasError = computed(() => {
  return props.steps.some(s => s.status === 'error');
});

const isAnyRunning = computed(() => {
  return props.steps.some(s => s.status === 'running');
});

watch(hasError, (newVal) => {
  if (newVal) {
    isExpanded.value = true;
  }
}, { immediate: true });

const stepCountLabel = computed(() => {
  const count = props.steps.length;
  if (count === 1) return '1 шаг';
  if (count >= 2 && count <= 4) return `${count} шага`;
  return `${count} шагов`;
});

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const isDetailsOpen = (id: string) => {
  return !!openDebugIds.value[id];
};

const toggleDebugDetails = (id: string) => {
  openDebugIds.value[id] = !openDebugIds.value[id];
};

const formatPayload = (data: any): string => {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};
</script>
