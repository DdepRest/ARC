<script setup lang="ts">
import { ref, watch } from 'vue';
import { RefreshCw, Search } from 'lucide-vue-next';
import { useAiConfigStore } from '../../../../../stores/aiConfig';

const props = defineProps<{
  provider: any;
}>();

const aiStore = useAiConfigStore();

const ipInput = ref('');
const apiKeyInput = ref('');
const isScanning = ref(false);
const scanMessage = ref<string | null>(null);

const updateFromIpInput = () => {
  const raw = (ipInput.value || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw) return;
  props.provider.endpoint = `http://${raw}/v1/chat/completions`;
  props.provider.type = 'local';
};

const updateApiKey = () => {
  const key = apiKeyInput.value.trim();
  props.provider.apiKey = key;
  props.provider.noAuthHeader = !Boolean(key);
};

const applyQuickIp = (host: string) => {
  ipInput.value = host;
  props.provider.endpoint = `http://${host}/v1/chat/completions`;
  props.provider.type = 'local';
  scanMessage.value = null;
};

const setQuickModel = (m: string) => {
  props.provider.model = m;
  if (!props.provider.selectedModels?.includes(m)) {
    props.provider.selectedModels = [m];
  }
};

const handleAutoScan = async () => {
  isScanning.value = true;
  scanMessage.value = null;
  try {
    const res = await aiStore.scanFreeLlm();
    if (res && res.found && res.port) {
      const host = res.host || '127.0.0.1';
      ipInput.value = `${host}:${res.port}`;
      props.provider.endpoint = res.endpoint || `http://${host}:${res.port}/v1/chat/completions`;
      props.provider.type = 'local';
      if (Array.isArray(res.models) && res.models.length > 0) {
        props.provider.selectedModels = res.models;
      }
      scanMessage.value = `FreeLLM обнаружен на порту ${res.port}!`;
    } else {
      scanMessage.value = 'FreeLLM не найден на портах 31415..31422';
    }
  } catch (err: any) {
    scanMessage.value = err?.message || 'Ошибка поиска FreeLLM';
  } finally {
    isScanning.value = false;
    setTimeout(() => {
      scanMessage.value = null;
    }, 4500);
  }
};

watch(() => props.provider.endpoint, (newEp) => {
  if (!newEp) return;
  const match = newEp.match(/https?:\/\/([^/]+)/);
  if (match?.[1]) ipInput.value = match[1];
}, { immediate: true });

watch(() => props.provider.apiKey, (newKey) => {
  apiKeyInput.value = newKey || '';
}, { immediate: true });
</script>

<template>
  <div 
    class="sm:col-span-2 flex flex-col gap-2.5 p-3.5 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[12px]"
    :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
  >
    <div class="flex items-center justify-between flex-wrap gap-2">
      <span class="text-xs font-mono font-bold text-[var(--arc-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
        РУЧНОЙ ВВОД IP И ПОРТА ШЛЮЗА:
      </span>
      <div class="flex items-center gap-2">
        <span class="text-xs font-mono text-[var(--status-ok)]">База URL: http://{{ ipInput || '127.0.0.1:31415' }}/v1</span>
        <button
          type="button"
          @click="handleAutoScan"
          :disabled="isScanning"
          class="px-2 py-0.5 rounded-[6px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] hover:border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] text-xs font-mono text-[var(--status-ok)] flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
          title="Автоматический поиск FreeLLM на локальных портах 31415..31422"
        >
          <RefreshCw v-if="isScanning" class="w-3 h-3 animate-spin" />
          <Search v-else class="w-3 h-3" />
          <span>{{ isScanning ? 'Поиск...' : 'Автопоиск порта' }}</span>
        </button>
      </div>
    </div>

    <div v-if="scanMessage" class="text-xs font-mono px-2 py-1 rounded-[6px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--status-ok)]">
      {{ scanMessage }}
    </div>

    <!-- IP Input & Model Buttons -->
    <div class="flex flex-col sm:flex-row gap-2">
      <div class="relative flex-1">
        <input
          v-model="ipInput"
          @input="updateFromIpInput"
          placeholder="127.0.0.1:31415 или 127.0.0.1:31416"
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--status-ok)] rounded-[10px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none transition-colors"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
        />
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          @click="setQuickModel('auto')"
          class="px-2.5 py-1 text-xs font-mono rounded-[8px] border transition-colors cursor-pointer"
          :class="provider.model === 'auto' ? 'bg-[var(--arc-selected)] text-[var(--status-ok)] border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] font-bold' : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          title="Auto mode (активная цепочка моделей)"
        >
          auto
        </button>
        <button
          type="button"
          @click="setQuickModel('auto:fast')"
          class="px-2.5 py-1 text-xs font-mono rounded-[8px] border transition-colors cursor-pointer"
          :class="provider.model === 'auto:fast' ? 'bg-[var(--arc-selected)] text-[var(--status-ok)] border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] font-bold' : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
          title="Fast mode (приоритет скорости)"
        >
          auto:fast
        </button>
      </div>
    </div>

    <!-- API Key Input Field -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <label class="text-xs font-mono text-[var(--arc-text-muted)]">ЕДИНЫЙ КЛЮЧ API FREELLM (ИЗ ВЕБ-ПАНЕЛИ):</label>
        <span class="text-xs font-mono text-[var(--arc-text-hint)]">Необязательно при отключённой авторизации</span>
      </div>
      <input
        v-model="apiKeyInput"
        @input="updateApiKey"
        type="password"
        placeholder="freellmapi-72••••••••••••••••••••••••••••••••"
        class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--status-ok)] rounded-[10px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none transition-colors"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
      />
    </div>

    <!-- Quick presets list -->
    <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
      <span class="text-xs font-mono text-[var(--arc-text-muted)] mr-1">Шаблоны:</span>
      <button
        v-for="chip in [
          { host: '127.0.0.1:31415', label: '127.0.0.1:31415 (FreeLLMAPI)' },
          { host: '127.0.0.1:31416', label: '127.0.0.1:31416 (FreeLLM Alt)' },
          { host: '127.0.0.1:3067', label: '127.0.0.1:3067 (FreeAPILLM)' },
          { host: '127.0.0.1:11434', label: '127.0.0.1:11434 (Ollama)' },
          { host: '127.0.0.1:1234', label: '127.0.0.1:1234 (LM Studio)' }
        ]"
        :key="chip.host"
        type="button"
        @click="applyQuickIp(chip.host)"
        class="px-2.5 py-1 rounded-[8px] text-xs font-mono border transition-colors cursor-pointer"
        :class="ipInput.includes(chip.host.split(':')[1]) 
          ? 'bg-[var(--arc-selected)] text-[var(--status-ok)] border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] font-bold' 
          : 'bg-[var(--arc-block)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]'"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>
