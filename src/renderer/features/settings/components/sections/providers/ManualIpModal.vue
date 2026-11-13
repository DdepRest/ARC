<script setup lang="ts">
import { ref, computed } from 'vue';
import { Server, Check, Globe, RefreshCw, Zap, Search } from 'lucide-vue-next';
import ArcModal from '../../../../../components/ui/ArcModal.vue';
import { useAiConfigStore } from '../../../../../stores/aiConfig';
import { normalizeOpenAiEndpoint } from '../../../../../../shared/utils/free-llm.util';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'connected', provider: any): void;
}>();

const aiStore = useAiConfigStore();

const providerName = ref('FreeLLMAPI');
const inputIp = ref('127.0.0.1:31415');
const apiKey = ref('');
const modelName = ref('auto');
const makeActive = ref(true);
const isTesting = ref(false);
const isScanning = ref(false);
const testFeedback = ref<{ status: 'success' | 'error'; message: string } | null>(null);

const quickPresets = [
  { label: 'FreeLLMAPI (31415)', host: '127.0.0.1:31415', name: 'FreeLLMAPI' },
  { label: 'FreeLLM (Alt 31416)', host: '127.0.0.1:31416', name: 'FreeLLMAPI' },
  { label: 'FreeAPILLM (3067)', host: '127.0.0.1:3067', name: 'FreeAPILLM' },
  { label: 'Ollama (11434)', host: '127.0.0.1:11434', name: 'Ollama' },
  { label: 'LM Studio (1234)', host: '127.0.0.1:1234', name: 'LM Studio' },
];

function selectPreset(preset: typeof quickPresets[0]) {
  inputIp.value = preset.host;
  providerName.value = preset.name;
  testFeedback.value = null;
}

async function scanForFreeLlm() {
  isScanning.value = true;
  testFeedback.value = null;
  try {
    const res = await aiStore.scanFreeLlm();
    if (res && res.found && res.port) {
      inputIp.value = `${res.host || '127.0.0.1'}:${res.port}`;
      providerName.value = 'FreeLLMAPI';
      testFeedback.value = {
        status: 'success',
        message: `Обнаружен запущенный FreeLLM на порту ${res.port}! Эндпоинт настроен автоматически.`
      };
    } else {
      testFeedback.value = {
        status: 'error',
        message: 'FreeLLM не найден на локальных портах 31415..31422. Убедитесь, что FreeLLM запущен.'
      };
    }
  } catch (err: any) {
    testFeedback.value = { status: 'error', message: err?.message || 'Ошибка автопоиска' };
  } finally {
    isScanning.value = false;
  }
}

const computedEndpoint = computed(() => {
  const val = inputIp.value.trim();
  if (!val) return 'http://127.0.0.1:31415/v1/chat/completions';
  return normalizeOpenAiEndpoint(val);
});

async function handleSaveAndConnect() {
  testFeedback.value = null;
  isTesting.value = true;

  const endpoint = computedEndpoint.value;
  const existing = aiStore.providers.find(
    p => p.name.toLowerCase() === providerName.value.toLowerCase() || p.endpoint === endpoint
  );

  const cleanKey = apiKey.value.trim();
  const providerId = existing ? existing.id : `freeapi_${Date.now()}`;
  const provider = {
    id: providerId,
    name: providerName.value.trim() || 'FreeLLMAPI',
    type: 'local' as const,
    endpoint,
    model: modelName.value.trim() || 'auto',
    selectedModels: [modelName.value.trim() || 'auto'],
    routingStrategy: 'smart_route' as const,
    priority: makeActive.value ? 1 : aiStore.providers.length + 1,
    maxTokens: 2048,
    temperature: 0.7,
    enabled: true,
    apiKey: cleanKey,
    isExclusive: false,
    noAuthHeader: !Boolean(cleanKey)
  };

  try {
    await aiStore.saveProvider(provider);

    const testRes = await aiStore.testConnection(provider);
    if (testRes.success) {
      testFeedback.value = {
        status: 'success',
        message: 'Соединение успешно установлено! Локальный шлюз готов к работе.'
      };
    } else {
      testFeedback.value = {
        status: 'error',
        message: testRes.error || 'Сервер по указанному IP не ответил. Проверьте запущен ли локальный роутер.'
      };
    }

    emit('connected', provider);
    if (testRes.success) {
      setTimeout(() => {
        emit('update:show', false);
      }, 1400);
    }
  } catch (err: any) {
    testFeedback.value = {
      status: 'error',
      message: err?.message || String(err)
    };
  } finally {
    isTesting.value = false;
  }
}
</script>

<template>
  <ArcModal
    :show="show"
    @close="emit('update:show', false)"
    title="Ручной ввод IP (FreeLLM / OpenAI Gateway)"
    subtitle="Подключение локального или удалённого OpenAI-совместимого шлюза по IP"
    maxWidth="max-w-xl"
  >
    <template #title-prefix>
      <Globe class="w-4 h-4 text-[var(--status-ok)]" />
    </template>

    <div class="flex flex-col gap-4 text-xs font-sans">
      <!-- Quick Info Banner -->
      <div 
        class="p-3 bg-[var(--arc-block)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.25)] rounded-[14px] flex items-start gap-2.5"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        <Server class="w-4 h-4 text-[var(--status-ok)] shrink-0 mt-0.5" />
        <div class="flex flex-col gap-0.5">
          <span class="text-xs font-bold font-mono text-[var(--status-ok)] uppercase tracking-wide">
            Прямое подключение к шлюзу
          </span>
          <span class="text-xs text-[var(--arc-text-secondary)] leading-relaxed">
            Укажите IP-адрес и порт локального роутера (FreeLLMAPI на порту 31415, 31416 или FreeAPILLM на 3067). Все запросы идут локально без передачи данных в облака.
          </span>
        </div>
      </div>

      <!-- Quick Preset Chips + Auto-scan Button -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono font-bold text-[var(--arc-text-muted)] uppercase tracking-wider">
            БЫСТРЫЕ ШАБЛОНЫ IP И ПОРТОВ:
          </span>
          <button
            type="button"
            @click="scanForFreeLlm"
            :disabled="isScanning"
            class="px-2 py-0.5 rounded-[6px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] hover:border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] text-xs font-mono text-[var(--status-ok)] flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw v-if="isScanning" class="w-3 h-3 animate-spin" />
            <Search v-else class="w-3 h-3" />
            <span>{{ isScanning ? 'Поиск...' : 'Автопоиск FreeLLM' }}</span>
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="preset in quickPresets"
            :key="preset.host"
            type="button"
            @click="selectPreset(preset)"
            class="px-3 py-1 rounded-[8px] text-xs font-mono border transition-all cursor-pointer flex items-center gap-1.5"
            :class="inputIp === preset.host 
              ? 'bg-[var(--arc-selected)] text-[var(--status-ok)] border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] font-bold' 
              : 'bg-[var(--arc-block)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]'"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
          >
            <span>{{ preset.label }}</span>
          </button>
        </div>
      </div>

      <!-- Input: IP Address / Host -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-mono font-bold text-[var(--arc-text-secondary)] uppercase tracking-wider flex items-center justify-between">
          <span>IP-АДРЕС ИЛИ ХОСТ С ПОРТОМ:</span>
          <span class="text-[var(--status-ok)] font-normal">HTTP / WS</span>
        </label>
        <div class="relative flex items-center">
          <input
            v-model="inputIp"
            type="text"
            placeholder="127.0.0.1:31415 или http://127.0.0.1:31415/v1"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--status-ok)] rounded-[10px] px-3.5 py-2 text-xs font-mono text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none transition-colors"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
          />
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-muted)]">
          Поддерживается любой IP и порт: <code class="text-[var(--arc-text-secondary)]">127.0.0.1:31415</code>, <code class="text-[var(--arc-text-secondary)]">127.0.0.1:31416</code>, сеть <code class="text-[var(--arc-text-secondary)]">192.168.x.x:31415</code>.
        </span>
      </div>

      <!-- Live Resulting Endpoint Preview -->
      <div 
        class="p-2.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[12px] flex items-center justify-between gap-2 font-mono text-xs"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.5)' }"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[var(--arc-text-muted)] shrink-0 uppercase tracking-wider">Эндпоинт:</span>
          <span class="text-[var(--status-ok)] font-semibold truncate">{{ computedEndpoint }}</span>
        </div>
        <span class="px-2 py-0.5 rounded-[6px] bg-[var(--arc-plane)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)] text-xs uppercase font-bold shrink-0">
          OpenAI-совместимый
        </span>
      </div>

      <!-- Input: API Key -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-mono font-bold text-[var(--arc-text-secondary)] uppercase tracking-wider flex items-center justify-between">
          <span>ЕДИНЫЙ КЛЮЧ API FREELLM (BEARER TOKEN):</span>
          <span class="text-[var(--arc-text-muted)] font-normal">Опционально</span>
        </label>
        <div class="relative flex items-center">
          <input
            v-model="apiKey"
            type="password"
            placeholder="freellmapi-72••••••••••••••••••••••••••••••••"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--status-ok)] rounded-[10px] px-3.5 py-2 text-xs font-mono text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none transition-colors"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
          />
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-muted)]">
          Используйте единый ключ из веб-панели FreeLLM API (вкладка Keys).
        </span>
      </div>

      <!-- Extra settings: Name and Model in 2 columns -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-mono font-bold text-[var(--arc-text-muted)] uppercase tracking-wider">
            ИМЯ ПРОФИЛЯ
          </span>
          <input
            v-model="providerName"
            type="text"
            placeholder="FreeLLMAPI"
            class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] focus:outline-none transition-colors"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
          />
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-mono font-bold text-[var(--arc-text-muted)] uppercase tracking-wider">
            ИМЯ МОДЕЛИ (ID)
          </span>
          <input
            v-model="modelName"
            type="text"
            placeholder="auto"
            class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none transition-colors"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
          />
        </div>
      </div>

      <!-- Checkbox: Make Primary / Exclusive -->
      <label class="flex items-center gap-2.5 py-1 px-1 cursor-pointer select-none group">
        <input
          v-model="makeActive"
          type="checkbox"
          class="rounded border-[var(--arc-hairline)] bg-[var(--arc-input)] accent-[var(--status-ok)] focus:ring-0 cursor-pointer"
        />
        <div class="flex flex-col">
          <span class="text-xs font-medium text-[var(--arc-text-primary)] transition-colors">
            Сделать активным приоритетным шлюзом
          </span>
          <span class="text-xs text-[var(--arc-text-muted)]">
            Все запросы диалога и чата будут сразу направляться на указанный IP.
          </span>
        </div>
      </label>

      <!-- Test Feedback Status Banner -->
      <div 
        v-if="testFeedback" 
        class="p-3 rounded-[12px] border bg-[var(--arc-block)] text-xs font-mono flex items-start gap-2 transition"
        :class="testFeedback.status === 'success' 
          ? 'border-[rgba(var(--status-ok-rgb,34,197,94),0.35)] text-[var(--status-ok)]' 
          : 'border-[rgba(var(--status-err-rgb,239,68,68),0.35)] text-[var(--status-err)]'"
      >
        <Check v-if="testFeedback.status === 'success'" class="w-4 h-4 text-[var(--status-ok)] shrink-0 mt-0.5" />
        <span v-else class="text-[var(--status-err)] font-bold shrink-0">!</span>
        <span class="leading-relaxed">{{ testFeedback.message }}</span>
      </div>
    </div>

    <!-- Modal Actions -->
    <template #footer>
      <div class="flex items-center justify-between w-full">
        <button
          type="button"
          @click="emit('update:show', false)"
          class="px-3 py-1.5 text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
        >
          ОТМЕНА
        </button>

        <button
          type="button"
          @click="handleSaveAndConnect"
          :disabled="isTesting"
          class="px-4 py-2 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-ok)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.45)] text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 14px rgba(var(--status-ok-rgb,34,197,94),0.15)' }"
        >
          <RefreshCw v-if="isTesting" class="w-3.5 h-3.5 animate-spin" />
          <Zap v-else class="w-3.5 h-3.5" />
          <span>{{ isTesting ? 'ПРОВЕРКА СВЯЗИ...' : 'ПОДКЛЮЧИТЬ И СОХРАНИТЬ' }}</span>
        </button>
      </div>
    </template>
  </ArcModal>
</template>
