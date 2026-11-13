<script setup lang="ts">
import { computed } from 'vue';
import { Cpu, Cloud, GitBranch } from 'lucide-vue-next';
import { useSettingsStore } from '../../../stores/settings.store';

const settingsStore = useSettingsStore();

type ExecutionMode = 'local' | 'cloud' | 'hybrid';

const currentMode = computed<ExecutionMode>({
  get() {
    if (settingsStore.useSmartRouting) return 'hybrid';
    if (settingsStore.useLocalLLM) return 'local';
    return 'cloud';
  },
  set(val: ExecutionMode) {
    if (val === 'hybrid') {
      settingsStore.useLocalLLM = true;
      settingsStore.useSmartRouting = true;
    } else if (val === 'local') {
      settingsStore.useLocalLLM = true;
      settingsStore.useSmartRouting = false;
    } else {
      settingsStore.useLocalLLM = false;
      settingsStore.useSmartRouting = false;
    }
  }
});

const modeDescriptions: Record<ExecutionMode, { title: string; desc: string }> = {
  local: {
    title: 'Автономная обработка на вашем ПК',
    desc: 'Запросы выполняются на локальном процессоре/видеокарте. Данные не покидают устройство.'
  },
  cloud: {
    title: 'Максимальная мощность облачных нейросетей',
    desc: 'Запросы направляются подключенным облачным шлюзам (Gemini, OpenAI, Groq).'
  },
  hybrid: {
    title: 'Автовыбор модели по сложности задачи',
    desc: 'Короткие команды выполняются локально, а сложные и аналитические задачи передаются в облако.'
  }
};
</script>

<template>
  <div class="flex flex-col gap-3 p-4 rounded-[14px] bg-[var(--arc-block)] border border-[var(--arc-hairline)]" data-search="где думать режим исполнения local cloud hybrid">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="arc-text-group-title text-[#E8E8E8]">Где думать</span>
        <span class="w-1 h-1 rounded-full bg-[var(--arc-hairline)]"></span>
        <span class="arc-text-hint text-[#909090]">Среда выполнения запросов к ИИ</span>
      </div>
      <span class="arc-text-machine text-[#B4B4B4] px-2 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
        {{ currentMode === 'hybrid' ? 'ГИБРИД' : currentMode === 'local' ? 'ЛОКАЛЬНО' : 'ОБЛАКО' }}
      </span>
    </div>

    <!-- 3-Segment Switch Button Group -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 bg-[var(--arc-frame)] rounded-[12px] border border-[var(--arc-hairline)]">
      <!-- Local Option -->
      <button
        type="button"
        @click="currentMode = 'local'"
        class="flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-[8px] text-xs font-mono transition-colors cursor-pointer"
        :class="currentMode === 'local'
          ? 'bg-[var(--arc-selected)] border border-[rgba(var(--accent-rgb),0.50)] text-[#E8E8E8] font-semibold'
          : 'bg-transparent border border-transparent text-[#909090] hover:text-[#E8E8E8] hover:bg-[var(--arc-hover)]'"
      >
        <Cpu class="w-4 h-4 shrink-0" :class="currentMode === 'local' ? 'text-[rgb(var(--accent-rgb))]' : 'text-[#7A7A7A]'" />
        <span>Локально</span>
      </button>

      <!-- Cloud Option -->
      <button
        type="button"
        @click="currentMode = 'cloud'"
        class="flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-[8px] text-xs font-mono transition-colors cursor-pointer"
        :class="currentMode === 'cloud'
          ? 'bg-[var(--arc-selected)] border border-[rgba(var(--accent-rgb),0.50)] text-[#E8E8E8] font-semibold'
          : 'bg-transparent border border-transparent text-[#909090] hover:text-[#E8E8E8] hover:bg-[var(--arc-hover)]'"
      >
        <Cloud class="w-4 h-4 shrink-0" :class="currentMode === 'cloud' ? 'text-[rgb(var(--accent-rgb))]' : 'text-[#7A7A7A]'" />
        <span>В облаке</span>
      </button>

      <!-- Hybrid Option -->
      <button
        type="button"
        @click="currentMode = 'hybrid'"
        class="flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-[8px] text-xs font-mono transition-colors cursor-pointer"
        :class="currentMode === 'hybrid'
          ? 'bg-[var(--arc-selected)] border border-[rgba(var(--accent-rgb),0.50)] text-[#E8E8E8] font-semibold'
          : 'bg-transparent border border-transparent text-[#909090] hover:text-[#E8E8E8] hover:bg-[var(--arc-hover)]'"
      >
        <GitBranch class="w-4 h-4 shrink-0" :class="currentMode === 'hybrid' ? 'text-[rgb(var(--accent-rgb))]' : 'text-[#7A7A7A]'" />
        <span>Гибридно</span>
      </button>
    </div>

    <!-- Mode Detailed Description -->
    <div class="px-3 py-2 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex flex-col gap-0.5">
      <span class="text-xs font-medium text-[#E8E8E8]">
        {{ modeDescriptions[currentMode].title }}
      </span>
      <span class="arc-text-hint text-[#909090]">
        {{ modeDescriptions[currentMode].desc }}
      </span>
    </div>
  </div>
</template>
