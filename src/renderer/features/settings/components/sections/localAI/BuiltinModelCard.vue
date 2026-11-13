<template>
  <div 
    @click="settingsStore.useLocalLLM = true; settingsStore.localLLMModel = 'builtin';"
    class="h-full flex flex-col justify-between gap-4 p-4 sm:p-5 rounded-[16px] border transition duration-200 cursor-pointer bg-[var(--arc-block)]"
    :class="[
      settingsStore.useLocalLLM && settingsStore.localLLMModel === 'builtin'
        ? 'border-[rgba(var(--accent-rgb),0.40)]' 
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
          <div class="p-2 bg-[var(--arc-plane)] rounded-[10px] border border-[var(--arc-hairline)] text-[var(--accent)] shrink-0 mt-0.5">
            <Server class="w-4 h-4" />
          </div>
          <div class="flex flex-col gap-1 min-w-0">
            <span class="text-xs font-mono font-bold tracking-wider text-[var(--arc-text-primary)] uppercase">{{ translations.builtinEngine }}</span>
            <span class="text-xs text-[var(--arc-text-muted)] leading-normal">{{ translations.builtinDesc }}</span>
          </div>
        </div>

        <span 
          class="px-2.5 py-0.5 rounded-[6px] text-xs font-mono font-semibold uppercase tracking-wider shrink-0 border"
          :class="settingsStore.useLocalLLM && settingsStore.localLLMModel === 'builtin'
            ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)]'
            : 'bg-[var(--arc-plane)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)]'"
        >
          {{ settingsStore.useLocalLLM && settingsStore.localLLMModel === 'builtin' ? translations.activeEngine : 'РЕЗЕРВ' }}
        </span>
      </div>

      <!-- Model Selection Dropdown -->
      <div class="flex flex-col gap-1.5 border-t border-[var(--arc-hairline)] pt-3" @click.stop>
        <label class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">
          {{ translations.chooseModel }}
        </label>
        <div class="relative">
          <select 
            v-model="settingsStore.builtinLLMModel"
            class="w-full h-10 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] pl-3.5 pr-10 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] transition appearance-none cursor-pointer"
          >
            <option value="LFM3-1.7B-Q4_K_M.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">★ LFM 3 (1.7B) - Liquid AI (~1.1 ГБ, Приоритет)</option>
            <option value="LFM2.5-2.6B-Q4_K_M.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">LFM 2.5 (2.6B) - Liquid AI (~1.6 ГБ)</option>
            <option value="qwen2.5-3b-instruct-q4_k_m.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">★ Qwen 2.5 (3B) - Рекомендуемая (~2.1 ГБ)</option>
            <option value="qwen2.5-7b-instruct-q4_k_m.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Qwen 2.5 (7B) - Продвинутая (~4.5 ГБ)</option>
            <option value="Qwen3.5-4B-Q4_K_M.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Qwen 3.5 (4B) - Сбалансированная (~2.6 ГБ)</option>
            <option value="Qwen3.5-2B-Q4_K_M.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Qwen 3.5 (2B) - Быстрая и легкая (~1.4 ГБ)</option>
            <option value="qwen2.5-1.5b-instruct-q4_k_m.gguf" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Qwen 2.5 (1.5B) - Компактная (~1.1 ГБ)</option>
          </select>
          <div class="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--arc-text-muted)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </div>

      <!-- Built-in model cache and action control -->
      <div class="border-t border-[var(--arc-hairline)] pt-3 flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">{{ translations.modelStatus }}</span>
          
          <div v-if="checkingBuiltin" class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--status-warn)]/30 text-[var(--status-warn)] text-xs font-mono uppercase">
            <Loader2 class="w-3.5 h-3.5 animate-spin text-[var(--status-warn)]" />
            <span>ПРОВЕРКА ФАЙЛОВ...</span>
          </div>

          <div v-else-if="builtinCheckError" class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--status-err)]/30 text-[var(--status-err)] text-xs font-mono uppercase" :title="builtinCheckError">
            <AlertTriangle class="w-3.5 h-3.5 text-[var(--status-err)]" />
            <span>ОШИБКА ПРОВЕРКИ</span>
          </div>

          <div v-else-if="isBuiltinDownloaded && isBuiltinVerified" class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--status-ok)]/30 text-[var(--status-ok)] text-xs font-mono uppercase">
            <CheckCircle class="w-3.5 h-3.5 text-[var(--status-ok)]" />
            <span>ПРОВЕРЕНО{{ verifiedTimeText ? ` · ${verifiedTimeText}` : '' }}</span>
          </div>

          <div v-else-if="isBuiltinDownloaded" class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--status-ok)] text-xs font-mono uppercase">
            <CheckCircle class="w-3.5 h-3.5 text-[var(--status-ok)]" />
            <span>{{ settingsStore.useLocalLLM && settingsStore.localLLMModel === 'builtin' ? translations.readyActive : translations.readyStandby }} · НЕ ТЕСТИРОВАНА</span>
          </div>
          
          <div v-else-if="downloadingBuiltin || downloadStore.isDownloading" class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--status-warn)]/30 text-[var(--status-warn)] text-xs font-mono uppercase tabular-nums">
            <Loader2 class="w-3.5 h-3.5 animate-spin text-[var(--status-warn)]" />
            <span>{{ downloadStore.progressPercent }}%</span>
          </div>
          
          <div v-else class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] text-xs font-mono uppercase">
            <AlertTriangle class="w-3.5 h-3.5 text-[var(--arc-text-hint)]" />
            <span>{{ translations.notInstalled }}</span>
          </div>
        </div>

        <!-- Download / Action Panel -->
        <div class="flex flex-col gap-3 p-3 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]" @click.stop>
          <div v-if="downloadingBuiltin || downloadStore.isDownloading" class="flex flex-col gap-2.5">
            <div class="flex items-center justify-between text-xs text-[var(--status-warn)] font-mono tabular-nums">
              <span class="flex items-center gap-1.5">
                <Loader2 class="w-3.5 h-3.5 animate-spin text-[var(--status-warn)]" />
                <span>{{ translations.downloading }}</span>
              </span>
              <span class="font-bold">{{ downloadStore.progressPercent }}%</span>
            </div>
            
            <div class="relative w-full h-1.5 bg-[var(--arc-input)] rounded-full overflow-hidden border border-[var(--arc-hairline)]">
              <div 
                class="absolute top-0 left-0 h-full bg-[var(--status-warn)] transition duration-300 rounded-full"
                :style="{ width: downloadStore.progressPercent + '%' }"
              ></div>
            </div>

            <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-muted)] tabular-nums">
              <span class="truncate max-w-[180px]" :title="downloadStore.currentFilename">
                {{ translations.fileLabel }}: {{ downloadStore.currentFilename || translations.initializing }}
              </span>
              <span>
                {{ formatBytes(downloadStore.bytesDone) }} / {{ formatBytes(downloadStore.totalBytes || computedModelSizeEstimate) }}
              </span>
            </div>
          </div>

          <div class="flex flex-col gap-2.5">
            <p v-if="!isBuiltinDownloaded && !(downloadingBuiltin || downloadStore.isDownloading)" class="text-xs text-[var(--status-warn)] leading-relaxed font-mono flex items-center gap-1.5">
              <AlertTriangle class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0" />
              <span>{{ translations.notDownloadedAlert }}</span>
            </p>

            <button 
              @click.stop="downloadBuiltin" 
              :disabled="downloadingBuiltin"
              class="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[10px] font-mono text-xs font-bold tracking-wider uppercase transition duration-200 cursor-pointer border"
              :class="[
                isBuiltinDownloaded || downloadingBuiltin || downloadStore.isDownloading
                  ? 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border-[var(--arc-hairline)] text-[var(--arc-text-primary)]' 
                  : 'bg-[var(--accent)] border-[var(--accent)] hover:opacity-90 text-[var(--arc-text-primary)]'
              ]"
            >
              <Loader2 v-if="downloadingBuiltin" class="w-3.5 h-3.5 animate-spin" />
              <Download v-else class="w-3.5 h-3.5" />
              <span>
                {{ 
                  (downloadingBuiltin || downloadStore.isDownloading)
                    ? 'Перезапустить загрузку' 
                    : isBuiltinDownloaded 
                      ? 'Проверить / обновить модель' 
                      : translations.downloadBtn 
                }}
              </span>
            </button>
          </div>
        </div>

        <!-- Advanced LLM Configuration -->
        <div v-if="isBuiltinDownloaded" class="border-t border-[var(--arc-hairline)] pt-3 flex flex-col gap-3" @click.stop>
          <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">Параметры производительности</span>
          
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-[var(--arc-text-muted)]">Авто-выгрузка (минут)</label>
              <input 
                v-model.number="settingsStore.llmAutoUnloadMinutes" 
                type="number" min="0" step="1"
                class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[8px] px-2.5 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] tabular-nums" 
                title="Время бездействия до автоматической выгрузки модели из ОЗУ (0 - не выгружать)"
              />
            </div>
            
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-[var(--arc-text-muted)]">Контекст (токенов)</label>
              <input 
                v-model.number="settingsStore.llmMaxContextSize" 
                type="number" min="512" max="16384" step="512"
                class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[8px] px-2.5 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] tabular-nums" 
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-[var(--arc-text-muted)]">Режим рендеринга</label>
              <select v-model="settingsStore.llmGpuOffloadMode" class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[8px] px-2.5 py-1.5 text-xs font-mono text-[var(--arc-text-primary)]">
                <option value="auto">Авто (GPU + CPU)</option>
                <option value="gpu">Только GPU</option>
                <option value="cpu">Только CPU</option>
                <option value="split">Смешанный (Слои)</option>
              </select>
            </div>
            
            <div class="flex flex-col gap-1.5" v-if="settingsStore.llmGpuOffloadMode === 'split'">
              <label class="text-xs text-[var(--arc-text-muted)]">GPU Слои</label>
              <input 
                v-model.number="settingsStore.llmGpuLayers" 
                type="number" min="-1" max="128" step="1"
                class="bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[8px] px-2.5 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] tabular-nums" 
              />
            </div>
            <div class="flex items-center gap-2 mt-2" v-else>
              <input type="checkbox" v-model="settingsStore.llmContextSummarization" id="llmSummarization" class="rounded bg-[var(--arc-plane)] border-[var(--arc-hairline)]" />
              <label for="llmSummarization" class="text-xs text-[var(--arc-text-muted)]">Сжатие контекста</label>
            </div>
          </div>
          <div class="flex items-center gap-2" v-if="settingsStore.llmGpuOffloadMode === 'split'">
            <input type="checkbox" v-model="settingsStore.llmContextSummarization" id="llmSummarizationSplit" class="rounded bg-[var(--arc-plane)] border-[var(--arc-hairline)]" />
            <label for="llmSummarizationSplit" class="text-xs text-[var(--arc-text-muted)]">Сжатие контекста при переполнении памяти</label>
          </div>
        </div>

        <!-- Interactive Test Model Section -->
        <div v-if="isBuiltinDownloaded" class="border-t border-[var(--arc-hairline)] pt-3.5 flex flex-col gap-2" @click.stop>
          <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">{{ translations.testTitle }}</span>
          <button 
            @click.stop="runTestInference"
            :disabled="isRunningTestInference"
            class="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-[10px] border border-[var(--status-ok)]/30 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-ok)] font-mono text-xs font-bold tracking-wider uppercase transition duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="isRunningTestInference" class="w-3.5 h-3.5 animate-spin text-[var(--status-ok)]" />
            <Zap v-else class="w-3.5 h-3.5 text-[var(--status-ok)]" />
            <span>{{ isRunningTestInference ? translations.testRunning : translations.testRun }}</span>
          </button>

          <div v-if="testInferenceOutput || testInferenceError || isRunningTestInference" class="mt-1 p-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] font-mono text-xs leading-relaxed">
            <div class="flex items-center justify-between border-b border-[var(--arc-hairline)] pb-1 mb-1.5 text-xs text-[var(--arc-text-hint)] uppercase tracking-wider">
              <span>{{ translations.testResponse }}</span>
              <span v-if="isRunningTestInference" class="text-[var(--status-warn)]">{{ translations.generating }}</span>
              <span v-else-if="testInferenceError" class="text-[var(--status-err)]">{{ translations.error }}</span>
              <span v-else class="text-[var(--status-ok)]">{{ translations.completed }}</span>
            </div>
            <p v-if="testInferenceOutput" class="text-[var(--arc-text-primary)] whitespace-pre-wrap">{{ testInferenceOutput }}</p>
            <p v-else-if="isRunningTestInference" class="text-[var(--arc-text-muted)] italic">{{ translations.testOutputLoading }}</p>
            <p v-if="testInferenceError" class="text-[var(--status-err)] font-bold mt-1">Error: {{ testInferenceError }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Activate Engine Action Footer -->
    <button 
      v-if="!(settingsStore.useLocalLLM && settingsStore.localLLMModel === 'builtin')"
      type="button"
      @click.stop="() => { settingsStore.useLocalLLM = true; settingsStore.localLLMModel = 'builtin'; }"
      class="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-[10px] border border-[rgba(var(--accent-rgb),0.35)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--accent)] font-mono text-xs font-bold tracking-wider uppercase transition duration-200 cursor-pointer"
    >
      <Check class="w-3.5 h-3.5" />
      <span>{{ translations.useThisEngine }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Server, CheckCircle, AlertTriangle, Loader2, Download, Check, Zap } from 'lucide-vue-next';
import { formatCheckedAtTime } from '../../../logic/provider-validation';

const props = defineProps<{
  settingsStore: any;
  downloadStore: any;
  translations: any;
  isBuiltinDownloaded: boolean;
  checkingBuiltin?: boolean;
  builtinCheckError?: string | null;
  isBuiltinVerified?: boolean;
  verifiedAt?: number;
  downloadingBuiltin: boolean;
  computedModelSizeEstimate: number;
  formatBytes: (bytes: number) => string;
  downloadBuiltin: () => void;
  runTestInference: () => void;
  isRunningTestInference: boolean;
  testInferenceOutput: string;
  testInferenceError: string;
}>();

const verifiedTimeText = computed(() => formatCheckedAtTime(props.verifiedAt));
</script>
