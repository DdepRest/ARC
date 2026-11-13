<template>
  <div 
    @click="settingsStore.useLocalLLM = true; settingsStore.localLLMModel = lastOllamaModel;"
    class="h-full flex flex-col justify-between gap-4 p-4 sm:p-5 rounded-[16px] border transition duration-200 cursor-pointer bg-[var(--arc-block)]"
    :class="[
      settingsStore.useLocalLLM && settingsStore.localLLMModel !== 'builtin'
        ? 'border-[var(--status-warn)]/40' 
        : 'border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]'
    ]"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.50)'
    }"
  >
    <div class="flex flex-col gap-3.5">
      <!-- Header Row with Inline Active Status -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <div class="p-2 bg-[var(--arc-plane)] rounded-[10px] border border-[var(--status-warn)]/30 text-[var(--status-warn)] shrink-0 mt-0.5">
            <Zap class="w-4 h-4" />
          </div>
          <div class="flex flex-col gap-1 min-w-0">
            <span class="text-xs font-mono font-bold tracking-wider text-[var(--arc-text-primary)] uppercase">{{ translations.ollamaEngine }}</span>
            <span class="text-xs text-[var(--arc-text-muted)] leading-normal">{{ translations.ollamaDesc }}</span>
          </div>
        </div>

        <span 
          class="px-2.5 py-0.5 rounded-[6px] text-xs font-mono font-semibold uppercase tracking-wider shrink-0 border"
          :class="settingsStore.useLocalLLM && settingsStore.localLLMModel !== 'builtin'
            ? 'bg-[var(--arc-selected)] text-[var(--status-warn)] border-[var(--status-warn)]/40'
            : 'bg-[var(--arc-plane)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)]'"
        >
          {{ settingsStore.useLocalLLM && settingsStore.localLLMModel !== 'builtin' ? translations.activeEngine : 'РЕЗЕРВ' }}
        </span>
      </div>

      <!-- Ollama Service Status and selection -->
      <div class="border-t border-[var(--arc-hairline)] pt-3 flex flex-col gap-3">
        <div class="flex items-center justify-between" @click.stop>
          <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">{{ translations.ollamaStatusTitle }}</span>
          
          <div class="flex items-center gap-2">
            <div 
              class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-xs font-mono uppercase border bg-[var(--arc-plane)]"
              :class="isOllamaOnline ? 'border-[var(--status-ok)]/30 text-[var(--status-ok)]' : 'border-[var(--status-err)]/30 text-[var(--status-err)]'"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="isOllamaOnline ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-err)]'"></span>
              <span>{{ isOllamaOnline ? translations.ollamaOnline : translations.ollamaOffline }}</span>
            </div>
            
            <button 
              type="button"
              @click.stop="checkOllama" 
              class="text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] p-1.5 rounded-[8px] transition shrink-0 cursor-pointer"
              :disabled="checkingOllama"
              :title="translations.checkStatus"
            >
              <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': checkingOllama }" />
            </button>
          </div>
        </div>

        <!-- Model selection dropdown and terminal warning -->
        <div class="flex flex-col gap-2.5 p-3.5 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]" @click.stop>
          <span class="text-xs font-mono text-[var(--arc-text-hint)] tracking-wider uppercase font-semibold">{{ translations.selectModel }}</span>
          
          <div class="relative w-full">
            <select 
              :value="lastOllamaModel"
              @change="handleOllamaModelChange"
              class="w-full h-10 bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:border-[var(--status-warn)]/30 rounded-[10px] pl-3.5 pr-9 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--status-warn)]/60 appearance-none cursor-pointer transition duration-200 font-semibold"
            >
              <option value="llama3.2" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">llama3.2 (3B - Быстрая и точная)</option>
              <option value="phi3" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">phi3 (3.80B - Высокая информативность)</option>
              <option value="gemma:2b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">gemma:2b (2B - Лёгкая)</option>
              <option value="deepseek-r1:1.5b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">deepseek-r1:1.5b (Рассуждающая — экспериментальная)</option>
              <option value="qwen2.5:1.5b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">qwen2.5:1.5b (1.5B - Лёгкая Qwen)</option>
              <option value="qwen2.5-coder:1.5b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">qwen2.5-coder:1.5b (1.5B - Кодовый помощник)</option>
              <option value="qwen2.5-coder:3b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">qwen2.5-coder:3b (3B - Профессиональный код)</option>
              <option value="qwen3:1.7b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">qwen3 (1.7B - Нового поколения)</option>
              <option value="qwen3:3b" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">qwen3:3b (3B - Новый большой Qwen)</option>
            </select>
            <div class="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--arc-text-muted)] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>

          <span class="text-xs text-[var(--arc-text-hint)] leading-relaxed mt-0.5 font-mono">
            {{ translations.ollamaWarning }}
          </span>

          <!-- Separate Server Reachability vs Model Verification Status -->
          <div class="flex items-center justify-between gap-2 pt-2 border-t border-[var(--arc-hairline)]">
            <span
              class="text-xs font-mono"
              :class="isOllamaVerified ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'"
            >
              {{ isOllamaVerified ? `Инференс проверен${verifiedTimeText ? ` · ${verifiedTimeText}` : ''}` : 'Модель выбрана · инференс не проверен' }}
            </span>
            <button
              v-if="isOllamaOnline && runTestInference"
              type="button"
              @click.stop="runTestInference"
              :disabled="isRunningTestInference"
              class="px-2.5 py-1 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-xs font-mono text-[var(--arc-text-primary)] cursor-pointer disabled:opacity-50"
            >
              {{ isRunningTestInference ? 'ТЕСТ...' : 'ТЕСТ МОДЕЛИ' }}
            </button>
          </div>

          <!-- Ollama Keep Alive selector -->
          <div
            id="localai.ollama_keep_alive"
            data-setting-id="localai.ollama_keep_alive"
            data-search="ollama keep alive удержание в памяти выгрузка таймер vram"
            class="flex items-center justify-between gap-3 pt-2.5 mt-1 border-t border-[var(--arc-hairline)]"
          >
            <span class="text-xs font-mono text-[var(--arc-text-muted)]">Удержание модели в памяти (Keep-Alive)</span>
            <select
              v-model="settingsStore.ollamaKeepAlive"
              class="bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[8px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="5m" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">5 минут</option>
              <option value="15m" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">15 минут</option>
              <option value="30m" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">30 минут</option>
              <option value="1h" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">1 час</option>
              <option value="never" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Не выгружать (Never)</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Activate Ollama Engine Action Footer -->
    <button 
      v-if="!(settingsStore.useLocalLLM && settingsStore.localLLMModel !== 'builtin')"
      type="button"
      @click.stop="() => { settingsStore.useLocalLLM = true; settingsStore.localLLMModel = lastOllamaModel; }"
      class="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-[10px] border border-[var(--status-warn)]/35 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-warn)] font-mono text-xs font-semibold tracking-wider uppercase transition duration-200 cursor-pointer"
    >
      <Check class="w-3.5 h-3.5" />
      <span>{{ translations.useThisEngine }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Zap, RefreshCw, Check } from 'lucide-vue-next';
import { formatCheckedAtTime } from '../../../logic/provider-validation';

const props = defineProps<{
  settingsStore: any;
  translations: any;
  isOllamaOnline: boolean;
  checkingOllama: boolean;
  isOllamaVerified?: boolean;
  verifiedAt?: number;
  isRunningTestInference?: boolean;
  runTestInference?: () => void;
  lastOllamaModel: string;
  checkOllama: () => void;
}>();

const verifiedTimeText = computed(() => formatCheckedAtTime(props.verifiedAt));

const emit = defineEmits<{
  (e: 'update:lastOllamaModel', val: string): void;
}>();

const handleOllamaModelChange = (e: Event) => {
  const val = (e.target as HTMLSelectElement).value;
  emit('update:lastOllamaModel', val);
  if (props.settingsStore.useLocalLLM && props.settingsStore.localLLMModel !== 'builtin') {
    props.settingsStore.localLLMModel = val;
  }
};
</script>
