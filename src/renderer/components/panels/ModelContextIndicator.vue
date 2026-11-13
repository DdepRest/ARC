<template>
  <div class="relative flex items-center select-none">
    <!-- Models Avatar / Ring Stack -->
    <div class="flex items-center -space-x-2">
      <div
        v-for="(model, index) in displayModels"
        :key="model.id || model.name || index"
        class="relative group cursor-pointer transition-transform hover:scale-110 active:scale-95"
        @click="togglePopup(model)"
        :title="`${model.name}: ${model.contextUsed}/${model.contextMax} токенов`"
      >
        <!-- SVG Progress Ring -->
        <div class="relative w-6 h-6 flex items-center justify-center bg-[var(--arc-block)] rounded-full border border-[var(--arc-hairline)] shadow-lg">
          <svg class="w-5 h-5 -rotate-90" viewBox="0 0 36 36">
            <!-- Background track -->
            <path
              class="text-[var(--arc-hairline)]"
              stroke-width="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <!-- Progress stroke -->
            <path
              :class="getProgressColor(model.contextUsed, model.contextMax)"
              stroke-width="3.5"
              :stroke-dasharray="`${Math.min(100, Math.round((model.contextUsed / (model.contextMax || 1)) * 100))}, 100`"
              stroke-linecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          
          <!-- Center Dot -->
          <span class="absolute w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
        </div>
      </div>
    </div>

    <!-- Mini Modal / Popup with Details -->
    <div
      v-if="selectedModel"
      class="absolute bottom-10 right-0 z-50 w-64 bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[14px] p-3.5 shadow-2xl font-mono text-xs text-[var(--arc-text-primary)] flex flex-col gap-2.5 animate-fadeIn"
      :style="{
        background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 40px rgba(0, 0, 0, 0.85)'
      }"
      @click.stop
    >
      <div class="flex items-center justify-between border-b border-[var(--arc-divider)] pb-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
          <span class="font-bold text-xs text-[var(--arc-text-primary)] truncate max-w-[170px]" :title="selectedModel.name">
            {{ selectedModel.name }}
          </span>
        </div>
        <button
          @click="selectedModel = null"
          class="text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors text-xs p-0.5 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <!-- Context Progress Bar -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[var(--arc-text-secondary)] text-xs">
          <span>КОНТЕКСТ</span>
          <span class="tabular-nums" :class="getTextColor(selectedModel.contextUsed, selectedModel.contextMax)">
            {{ selectedModel.contextUsed }} / {{ selectedModel.contextMax }} ({{ Math.round((selectedModel.contextUsed / (selectedModel.contextMax || 1)) * 100) }}%)
          </span>
        </div>
        <div class="w-full h-1.5 bg-[var(--arc-input)] rounded-full overflow-hidden border border-[var(--arc-hairline)]">
          <div
            class="h-full transition duration-300 rounded-full"
            :class="getBarColor(selectedModel.contextUsed, selectedModel.contextMax)"
            :style="{ width: `${Math.min(100, (selectedModel.contextUsed / (selectedModel.contextMax || 1)) * 100)}%` }"
          ></div>
        </div>
      </div>

      <!-- Memory Stats -->
      <div class="grid grid-cols-2 gap-2 bg-[var(--arc-input)] p-2.5 rounded-[10px] border border-[var(--arc-hairline)]">
        <div class="flex flex-col">
          <span class="text-[var(--arc-text-muted)] text-xs uppercase">Память</span>
          <span class="text-[var(--arc-text-primary)] font-bold text-xs tabular-nums">~{{ selectedModel.memoryMb }} MB</span>
        </div>
        <div class="flex flex-col">
          <span class="text-[var(--arc-text-muted)] text-xs uppercase">Устройство</span>
          <span class="text-[var(--status-ok)] font-bold text-xs uppercase">{{ selectedModel.target || 'GPU/CPU' }}</span>
        </div>
      </div>

      <!-- Actions -->
      <button
        @click="handleForceUnload"
        :disabled="isUnloading"
        class="w-full py-2 px-3 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] text-[var(--status-err)] rounded-[10px] text-xs font-bold tracking-wider uppercase transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <span v-if="isUnloading" class="w-3 h-3 border border-[var(--status-err)] border-t-transparent rounded-full animate-spin"></span>
        <span>{{ isUnloading ? 'ВЫГРУЗКА...' : 'ВЫГРУЗИТЬ ИЗ ПАМЯТИ' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUIStore } from '../../stores/ui.store';

export interface ModelIndicatorInfo {
  id?: string;
  name: string;
  contextUsed: number;
  contextMax: number;
  memoryMb: number;
  target: string;
  isLoaded: boolean;
}

const props = defineProps<{
  models?: ModelIndicatorInfo[];
}>();

const uiStore = useUIStore();
const selectedModel = ref<ModelIndicatorInfo | null>(null);
const isUnloading = ref(false);

const displayModels = computed<ModelIndicatorInfo[]>(() => {
  if (props.models && props.models.length > 0) {
    return props.models;
  }
  if (uiStore.modelTelemetry) {
    return [{
      id: uiStore.modelTelemetry.modelName,
      name: uiStore.modelTelemetry.modelName,
      contextUsed: uiStore.modelTelemetry.contextUsedTokens || 0,
      contextMax: uiStore.modelTelemetry.contextMaxTokens || 2048,
      memoryMb: uiStore.modelTelemetry.modelMemoryMb || 1800,
      target: uiStore.modelTelemetry.offloadTarget || 'GPU',
      isLoaded: true
    }];
  }
  return [];
});

const getProgressColor = (used: number, max: number) => {
  const pct = (used / (max || 1)) * 100;
  if (pct < 60) return 'text-[var(--status-ok)] stroke-[var(--status-ok)]';
  if (pct <= 85) return 'text-[var(--status-warn)] stroke-[var(--status-warn)]';
  return 'text-[var(--status-err)] stroke-[var(--status-err)]';
};

const getBarColor = (used: number, max: number) => {
  const pct = (used / (max || 1)) * 100;
  if (pct < 60) return 'bg-[var(--status-ok)]';
  if (pct <= 85) return 'bg-[var(--status-warn)]';
  return 'bg-[var(--status-err)]';
};

const getTextColor = (used: number, max: number) => {
  const pct = (used / (max || 1)) * 100;
  if (pct < 60) return 'text-[var(--status-ok)]';
  if (pct <= 85) return 'text-[var(--status-warn)]';
  return 'text-[var(--status-err)]';
};

const togglePopup = (model: ModelIndicatorInfo) => {
  if (selectedModel.value?.name === model.name) {
    selectedModel.value = null;
  } else {
    selectedModel.value = model;
  }
};

const handleForceUnload = async () => {
  if (isUnloading.value) return;
  isUnloading.value = true;
  try {
    if (window.api?.forceUnloadAiModel) {
      await window.api.forceUnloadAiModel();
    }
    uiStore.modelTelemetry = null;
    selectedModel.value = null;
  } catch (err) {
    console.error('Failed to force unload model:', err);
  } finally {
    isUnloading.value = false;
  }
};
</script>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn {
  animation: fadeIn 0.15s ease-out forwards;
}
</style>
