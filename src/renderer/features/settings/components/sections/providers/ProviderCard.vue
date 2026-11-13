<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Save, Trash2, Eye, EyeOff, ExternalLink, RefreshCw, Sparkles, Check, Lock, ShieldAlert, ChevronDown, ChevronUp, Search } from 'lucide-vue-next';
import { useAiConfigStore, type ProviderTestState } from '../../../../../stores/aiConfig';
import { validateProviderEndpoint, formatCheckedAtTime } from '../../../logic/provider-validation';
import { PRESETS } from './presetsData';
import { isFreeLlmGateway, extractHostPort, normalizeOpenAiEndpoint } from '../../../../../../shared/utils/free-llm.util';
import ProviderModelCatalog from './ProviderModelCatalog.vue';
import ProviderRoutingStrategy from './ProviderRoutingStrategy.vue';
import ProviderParamsGrid from './ProviderParamsGrid.vue';

const props = defineProps<{
  provider: any;
  isExpanded: boolean;
  testResult?: ProviderTestState | null;
  fetchedModels: string[];
  isLoadingModels: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-expand'): void;
  (e: 'test-provider'): void;
  (e: 'fetch-models', isAutoDetect?: boolean): void;
  (e: 'delete-provider'): void;
}>();

const aiStore = useAiConfigStore();
const showKey = ref(false);
const autoDetectStatus = ref<{ status: 'idle' | 'loading' | 'success' | 'error'; count?: number; message?: string }>({ status: 'idle' });
let apiKeyDebounceTimer: any = null;
let autoDetectTimeout: any = null;
const isSaved = ref(false);
const saveError = ref<string | null>(null);
const hasUnsavedChanges = ref(false);
const showDeleteConfirm = ref(false);
const endpointValidation = computed(() => validateProviderEndpoint(props.provider.endpoint));
const markConfigDirty = () => { hasUnsavedChanges.value = true; saveError.value = null; aiStore.clearProviderTestState(props.provider.id); };

const LOCAL_ENDPOINT_PRESETS = [
  { host: '127.0.0.1:31415', label: '127.0.0.1:31415 (FreeLLMAPI)', endpoint: 'http://127.0.0.1:31415/v1/chat/completions' },
  { host: '127.0.0.1:31416', label: '127.0.0.1:31416 (FreeLLM Alt)', endpoint: 'http://127.0.0.1:31416/v1/chat/completions' },
  { host: '127.0.0.1:3067', label: '127.0.0.1:3067 (FreeAPILLM)', endpoint: 'http://127.0.0.1:3067/v1/chat/completions' },
  { host: '127.0.0.1:11434', label: '127.0.0.1:11434 (Ollama)', endpoint: 'http://127.0.0.1:11434/v1/chat/completions' },
  { host: '127.0.0.1:1234', label: '127.0.0.1:1234 (LM Studio)', endpoint: 'http://127.0.0.1:1234/v1/chat/completions' }
];

const quarantineInfo = computed(() => aiStore.quarantinedProviders.find(q => q.id === props.provider.id));
const isQuarantined = computed(() => Boolean(quarantineInfo.value && quarantineInfo.value.quarantineUntil > Date.now()));
const quarantineMinsLeft = computed(() => quarantineInfo.value ? Math.max(1, Math.ceil((quarantineInfo.value.quarantineUntil - Date.now()) / 60000)) : 0);

const handleResetQuarantine = async () => { await aiStore.resetQuarantine(props.provider.id); };

watch(() => props.isLoadingModels, (loading, prevLoading) => {
  if (prevLoading && !loading && autoDetectStatus.value.status === 'loading') {
    const count = props.fetchedModels?.length || 0;
    autoDetectStatus.value = count > 0 ? { status: 'success', message: `Найдено: ${count}` } : { status: 'error', message: 'Модели не найдены' };
    setTimeout(() => { if (autoDetectStatus.value.status !== 'loading') autoDetectStatus.value = { status: 'idle' }; }, 3500);
  }
});

const handleSave = async () => {
  saveError.value = null;
  if (!endpointValidation.value.valid) {
    saveError.value = endpointValidation.value.error || 'Некорректный URL эндпоинта';
    return;
  }
  const res = await aiStore.saveProvider(props.provider);
  if (res && res.success === false) {
    saveError.value = res.error || 'Ошибка сохранения настроек провайдера';
    return;
  }
  hasUnsavedChanges.value = false;
  isSaved.value = true;
  setTimeout(() => { isSaved.value = false; }, 2000);
};

const toggleEnabled = () => {
  props.provider.enabled = !props.provider.enabled;
  aiStore.saveProvider(props.provider);
};

const triggerAutoDetect = () => {
  autoDetectStatus.value = { status: 'loading', message: 'Сканирование API...' };
  emit('fetch-models', true);
  if (autoDetectTimeout) clearTimeout(autoDetectTimeout);
  autoDetectTimeout = setTimeout(() => {
    if (autoDetectStatus.value.status === 'loading') {
      const count = props.fetchedModels?.length || 0;
      autoDetectStatus.value = count > 0 ? { status: 'success', message: `Найдено: ${count}` } : { status: 'idle' };
      setTimeout(() => { if (autoDetectStatus.value.status !== 'loading') autoDetectStatus.value = { status: 'idle' }; }, 3000);
    }
  }, 7000);
};

const onApiKeyInput = () => {
  markConfigDirty();
  if (apiKeyDebounceTimer) clearTimeout(apiKeyDebounceTimer);
  const raw = props.provider.apiKey?.trim() || '';
  if (!raw || raw.length < 3 || raw === '••••••••••••••••') {
    autoDetectStatus.value = { status: 'idle' };
    return;
  }
  props.provider.noAuthHeader = false;
  autoDetectStatus.value = { status: 'loading', message: 'Сканирование API...' };
  apiKeyDebounceTimer = setTimeout(() => { triggerAutoDetect(); }, 600);
};

const getPresetUrl = () => {
  if (isFreeLlmGateway(props.provider)) {
    const hp = extractHostPort(props.provider.endpoint);
    return hp ? `http://${hp}/` : 'http://127.0.0.1:31415/';
  }
  return PRESETS.find(p => p.name === props.provider.name)?.url;
};

const showLocal3067KeyLink = computed(() => {
  return props.provider.type === 'local' && isFreeLlmGateway(props.provider);
});

const isScanningPort = ref(false);

const normalizeInputEndpoint = () => {
  if (!props.provider.endpoint || typeof props.provider.endpoint !== 'string') return;
  const normalized = normalizeOpenAiEndpoint(props.provider.endpoint);
  if (normalized) props.provider.endpoint = normalized;
};

const scanFreeLlmPort = async () => {
  isScanningPort.value = true;
  try {
    const res = await aiStore.scanFreeLlm();
    if (res?.found && res.port) {
      props.provider.endpoint = res.endpoint || `http://${res.host || '127.0.0.1'}:${res.port}/v1/chat/completions`;
      props.provider.type = 'local';
      markConfigDirty();
      await aiStore.saveProvider(props.provider);
    }
  } finally {
    isScanningPort.value = false;
  }
};

const applyEndpointPreset = (endpoint: string) => {
  props.provider.endpoint = endpoint;
  props.provider.type = 'local';
  markConfigDirty();
  aiStore.saveProvider(props.provider);
};

const handleParamsUpdate = (params: { priority: number; temperature: number; maxTokens: number }) => {
  props.provider.priority = params.priority;
  props.provider.temperature = params.temperature;
  props.provider.maxTokens = params.maxTokens;
  aiStore.saveProvider(props.provider);
};

const handleStrategyUpdate = (strategy: 'smart_route' | 'fallback' | 'ensemble') => {
  props.provider.routingStrategy = strategy;
  aiStore.saveProvider(props.provider);
};

const handleExclusiveUpdate = (exclusive: boolean) => {
  props.provider.isExclusive = exclusive;
  aiStore.saveProvider(props.provider);
};
const requiresApiKey = computed(() => {
  if (props.provider.type === 'local' || props.provider.noAuthHeader) return false;
  const k = props.provider.apiKey?.trim() || '';
  return k.length === 0;
});

const statusBadge = computed(() => {
  if (isQuarantined.value) return { label: 'КАРАНТИН', cls: 'text-[var(--status-err)] border-[var(--status-err)]/30', dot: 'bg-[var(--status-err)]' };
  if (!props.provider.enabled) return { label: 'ОТКЛЮЧЕН', cls: 'text-[var(--arc-text-muted)] border-[var(--arc-hairline)]', dot: 'bg-[var(--status-off)]' };
  if (props.testResult?.status === 'loading') return { label: 'ПРОВЕРКА...', cls: 'text-[var(--status-warn)] border-[var(--status-warn)]/30', dot: 'bg-[var(--status-warn)]' };
  if (props.testResult?.status === 'error') return { label: 'ОШИБКА СВЯЗИ', cls: 'text-[var(--status-err)] border-[var(--status-err)]/30', dot: 'bg-[var(--status-err)]' };
  if (!endpointValidation.value.valid) return { label: 'НЕВЕРНЫЙ URL', cls: 'text-[var(--status-err)] border-[var(--status-err)]/30', dot: 'bg-[var(--status-err)]' };
  if (requiresApiKey.value) return { label: 'НУЖЕН КЛЮЧ', cls: 'text-[var(--status-warn)] border-[var(--status-warn)]/30', dot: 'bg-[var(--status-warn)]' };
  if (props.testResult?.status === 'success') {
    const t = formatCheckedAtTime(props.testResult.checkedAt);
    return { label: t ? `ПРОВЕРЕН · ${t}` : 'ПРОВЕРЕН', cls: 'text-[var(--status-ok)] border-[var(--status-ok)]/30', dot: 'bg-[var(--status-ok)]' };
  }
  return { label: 'НАСТРОЕН · НЕ ПРОВЕРЕН', cls: 'text-[var(--arc-text-secondary)] border-[var(--arc-hairline)]', dot: 'bg-[var(--status-warn)]' };
});
</script>

<template>
  <div 
    class="rounded-[16px] border transition-colors duration-150 overflow-hidden bg-[var(--arc-block)]"
    :class="isExpanded ? 'border-[rgba(var(--accent-rgb),0.35)]' : 'border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]'"
    :style="{ background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
  >
    <!-- SUMMARY HEADER (Clickable) -->
    <div 
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      aria-label="Переключить параметры провайдера"
      @click="emit('toggle-expand')" 
      @keydown.enter.prevent="emit('toggle-expand')"
      @keydown.space.prevent="emit('toggle-expand')"
      class="p-4 flex flex-col gap-2.5 cursor-pointer hover:bg-[var(--arc-hover)] transition-colors group select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <!-- Row 1: Identity & Honest Status -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 flex-wrap">
          <button @click.stop="toggleEnabled" class="shrink-0 flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--arc-hover)] transition cursor-pointer" title="Включить или отключить провайдер в ротации">
            <span class="w-2.5 h-2.5 rounded-full transition-colors" :class="statusBadge.dot"></span>
          </button>
          <span class="text-sm font-bold text-[var(--arc-text-primary)] tracking-wide font-mono uppercase">{{ provider.name }}</span>
          <span class="text-xs font-mono tracking-wider font-semibold px-2.5 py-0.5 rounded-[6px] border uppercase bg-[var(--arc-plane)]" :class="statusBadge.cls">{{ statusBadge.label }}</span>
          <span v-if="provider.isExclusive" class="text-xs font-mono px-2 py-0.5 rounded-[6px] bg-[var(--arc-plane)] text-[var(--status-warn)] border border-[var(--status-warn)]/30 uppercase font-semibold">ЭКСКЛЮЗИВ</span>
          <span v-if="isQuarantined" class="text-xs font-mono px-2 py-0.5 rounded-[6px] bg-[var(--arc-plane)] text-[var(--status-err)] border border-[var(--status-err)]/30 uppercase font-semibold flex items-center gap-1 tabular-nums">{{ quarantineMinsLeft }} МИН</span>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
          <span class="text-xs font-mono px-2 py-0.5 rounded-[6px] border uppercase bg-[var(--arc-plane)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)]">
            {{ provider.type === 'local' ? 'ЛОКАЛЬНЫЙ ШЛЮЗ' : 'ОБЛАЧНЫЙ API' }}
          </span>
          <span v-if="provider.endpoint" class="text-xs font-mono text-[var(--arc-text-hint)] truncate max-w-[200px] hidden sm:inline">{{ provider.endpoint.replace(/^https?:\/\//, '') }}</span>
          <ChevronUp v-if="isExpanded" class="w-4 h-4 text-[var(--accent)] transition-colors" />
          <ChevronDown v-else class="w-4 h-4 text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)] transition-colors" />
        </div>
      </div>

      <!-- Row 2: Model & Specs Strip -->
      <div class="pt-2.5 border-t border-[var(--arc-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div class="flex items-baseline gap-2 min-w-0 flex-wrap">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase">Модель:</span>
          <span class="font-mono text-xs font-semibold text-[var(--arc-text-primary)] truncate">{{ provider.model || (provider.selectedModels && provider.selectedModels[0]) || 'Не выбрана' }}</span>
          <span class="text-[var(--arc-text-hint)] text-xs">·</span>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase">{{ provider.routingStrategy === 'fallback' ? 'ФОЛБЕК' : provider.routingStrategy === 'ensemble' ? 'ПРЯМОЙ' : 'УМНЫЙ МАРШРУТ' }}</span>
          <span class="text-[var(--arc-text-hint)] text-xs">·</span>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] tabular-nums">MAX: {{ provider.maxTokens }} TOK</span>
          <span class="text-[var(--arc-text-hint)] text-xs">·</span>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] tabular-nums">TEMP: {{ provider.temperature }}</span>
        </div>

        <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button type="button" @click.stop="handleSave" :disabled="!endpointValidation.valid" class="text-xs font-mono px-3 py-1 rounded-[8px] transition tracking-wider uppercase border cursor-pointer disabled:opacity-50 flex items-center gap-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)]" :class="isSaved ? 'text-[var(--status-ok)] border-[var(--status-ok)]/40' : hasUnsavedChanges ? 'text-[var(--status-warn)] border-[var(--status-warn)]/40' : 'text-[var(--accent)] border-[var(--accent)]/35'" title="Сохранить настройки профиля">
            <Check v-if="isSaved" class="w-3 h-3 text-[var(--status-ok)]" />
            <Save v-else class="w-3 h-3" />
            <span>{{ isSaved ? 'СОХРАНЕНО' : hasUnsavedChanges ? 'СОХРАНИТЬ*' : 'СОХРАНИТЬ' }}</span>
          </button>
          <button type="button" @click.stop="emit('test-provider')" class="text-xs font-mono px-3 py-1 rounded-[8px] transition tracking-wider uppercase border cursor-pointer disabled:opacity-50 flex items-center gap-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)]" :class="testResult?.status === 'success' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/30' : (testResult?.status === 'error' ? 'text-[var(--status-err)] border-[var(--status-err)]/30' : 'text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border-[var(--arc-hairline)]')" :disabled="testResult?.status === 'loading' || !endpointValidation.valid">
            <RefreshCw v-if="testResult?.status === 'loading'" class="w-3 h-3 animate-spin text-[var(--accent)]" />
            <span>{{ testResult?.status === 'loading' ? 'ТЕСТ...' : 'ТЕСТ СВЯЗИ' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- EXPANDED DETAIL BODY -->
    <div v-show="isExpanded" class="border-t border-[var(--arc-hairline)] p-4 flex flex-col gap-4">
      <div v-if="isQuarantined" class="p-3 bg-[var(--arc-plane)] border border-[var(--status-err)]/30 rounded-xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-[var(--status-err)] text-xs font-mono">
          <ShieldAlert class="w-4 h-4 shrink-0" />
          <span>Провайдер заблокирован карантином (осталось {{ quarantineMinsLeft }} мин).</span>
        </div>
        <button @click="handleResetQuarantine" class="px-2.5 py-1 text-xs font-mono uppercase bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-err)] border border-[var(--status-err)]/35 rounded shrink-0 transition-colors cursor-pointer">СБРОСИТЬ КАРАНТИН</button>
      </div>

      <div v-if="saveError" class="text-xs font-mono px-3.5 py-2 rounded-lg border border-[var(--status-err)]/30 bg-[var(--arc-plane)] text-[var(--status-err)]">{{ saveError }}</div>
      <div v-if="testResult && testResult.status !== 'untested'" class="text-xs font-mono px-3.5 py-2.5 rounded-lg border bg-[var(--arc-plane)] flex flex-col gap-1.5 transition" :class="testResult.status === 'success' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/30' : (testResult.status === 'error' ? 'text-[var(--status-err)] border-[var(--status-err)]/30' : 'text-[var(--accent)] border-[var(--accent)]/30')">
        <div class="flex items-center justify-between gap-2 font-bold tracking-wider text-xs">
          <span v-if="testResult.status === 'success'">✓ СОЕДИНЕНИЕ УСПЕШНО</span>
          <span v-else-if="testResult.status === 'error'">✗ ОШИБКА ПОДКЛЮЧЕНИЯ</span>
          <span v-else>⏱ ПРОВЕРКА ЭНДПОИНТА...</span>
          <span v-if="testResult.checkedAt" class="font-normal text-[var(--arc-text-hint)]">{{ formatCheckedAtTime(testResult.checkedAt) }}</span>
        </div>
        <p v-if="testResult.message" class="text-xs text-[var(--arc-text-muted)] leading-relaxed font-mono whitespace-pre-wrap">{{ testResult.message }}</p>
      </div>

      <!-- Section (a): Identification -->
      <div class="flex items-center justify-between gap-4 pb-3 border-b border-[var(--arc-hairline)]">
        <div class="flex flex-col gap-1.5 w-full max-w-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">ИМЯ ПРОФИЛЯ</span>
            <span class="text-xs font-mono text-[var(--arc-text-hint)]">ID: {{ provider.id }}</span>
          </div>
          <input v-model="provider.name" class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors" placeholder="например FreeLLMAPI, OpenRouter" />
        </div>
      </div>

      <!-- Section (b): Authorization & Key -->
      <div class="flex flex-col gap-1.5 pb-3 border-b border-[var(--arc-hairline)]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">
              API КЛЮЧ <span v-if="provider.type === 'local'" class="text-[var(--arc-text-hint)] text-xs font-normal lowercase ml-1">(опционально)</span>
            </span>
            <span v-if="aiStore.isSafeStorageAvailable" class="flex items-center gap-1 text-xs font-mono text-[var(--status-ok)] bg-[var(--arc-plane)] border border-[var(--status-ok)]/30 px-1.5 py-0.5 rounded font-semibold uppercase">
              <Lock class="w-2.5 h-2.5" /> DPAPI
            </span>
          </div>
          <span v-if="autoDetectStatus.status !== 'idle'" class="text-xs font-mono px-2 py-0.5 rounded flex items-center gap-1 transition bg-[var(--arc-plane)] border" :class="autoDetectStatus.status === 'loading' ? 'text-[var(--status-warn)] border-[var(--status-warn)]/30' : (autoDetectStatus.status === 'success' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/30 font-bold' : 'text-[var(--status-err)] border-[var(--status-err)]/30')">
            <RefreshCw v-if="autoDetectStatus.status === 'loading'" class="w-2.5 h-2.5 animate-spin" />
            <Check v-else-if="autoDetectStatus.status === 'success'" class="w-2.5 h-2.5 text-[var(--status-ok)]" />
            {{ autoDetectStatus.message }}
          </span>
        </div>

        <div class="relative flex items-center">
          <input v-model="provider.apiKey" @input="onApiKeyInput" :type="showKey ? 'text' : 'password'" class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] pr-24 focus:outline-none focus:border-[var(--accent)]" :placeholder="provider.type === 'local' ? 'sk-... (или пусто для локальных)' : 'sk-or-v1-...'" />
          <div class="absolute right-2 flex items-center gap-1">
            <button @click="triggerAutoDetect" class="px-2 py-0.5 text-xs font-mono bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] rounded border border-[var(--arc-hairline)] transition-colors flex items-center gap-1 cursor-pointer" title="Автоопределить модели">
              <Sparkles class="w-3 h-3 text-[var(--accent)]" /> АВТО
            </button>
            <button @click="showKey = !showKey" class="px-1.5 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer" type="button">
              <Eye v-if="showKey" class="w-3.5 h-3.5" /><EyeOff v-else class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2 mt-0.5">
          <label class="flex items-center gap-2 cursor-pointer text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors">
            <input type="checkbox" v-model="provider.noAuthHeader" @change="markConfigDirty(); aiStore.saveProvider(provider)" class="rounded border-[var(--arc-hairline)] bg-[var(--arc-input)] focus:ring-0" />
            <span>Отправлять без заголовка Authorization (если авторизация в шлюзе отключена)</span>
          </label>
          <a v-if="showLocal3067KeyLink" :href="getPresetUrl() || 'http://127.0.0.1:3067/'" target="_blank" class="text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--accent)] inline-flex items-center gap-1 transition-colors no-underline shrink-0">
            <ExternalLink class="w-3 h-3" /><span>Получить ключ</span>
          </a>
        </div>
      </div>

      <!-- Subcomponents: Catalog, Strategy, Params -->
      <ProviderModelCatalog :provider="provider" :fetched-models="fetchedModels" :is-loading-models="isLoadingModels" @fetch-models="emit('fetch-models')" />
      <ProviderRoutingStrategy :model-value="provider.routingStrategy || 'smart_route'" :is-exclusive="provider.isExclusive || false" @update:model-value="handleStrategyUpdate" @update:is-exclusive="handleExclusiveUpdate" />
      <ProviderParamsGrid :model-value="{ priority: provider.priority ?? 1, temperature: provider.temperature ?? 0.7, maxTokens: provider.maxTokens ?? 4096 }" :model-name="provider.model || (provider.selectedModels && provider.selectedModels[0]) || ''" :provider-type="provider.type || 'local'" @update:model-value="handleParamsUpdate" />

      <!-- Section (f): Endpoint & Local Gateway Settings -->
      <div class="flex flex-col gap-2.5 pt-3 border-t border-[var(--arc-hairline)]">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">ТИП СЕРВИСА</span>
            <select v-model="provider.type" @change="markConfigDirty" class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer">
              <option value="local" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Локальная интеграция (Local)</option>
              <option value="cloud" class="bg-[var(--arc-block)] text-[var(--arc-text-primary)]">Облачная интеграция (Cloud)</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-mono font-bold text-[var(--arc-text-machine)] uppercase tracking-wider">АДРЕС ЭНДПОИНТА (ENDPOINT)</span>
            <input v-model="provider.endpoint" @input="markConfigDirty" @blur="normalizeInputEndpoint" placeholder="http://127.0.0.1:3067/v1/chat/completions" class="bg-[var(--arc-input)] border rounded-[10px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none" :class="endpointValidation.valid ? 'border-[var(--arc-hairline)] focus:border-[var(--accent)]' : 'border-[var(--status-err)]/60'" />
            <span v-if="!endpointValidation.valid" class="text-xs font-mono text-[var(--status-err)]">{{ endpointValidation.error }}</span>
          </div>
        </div>

        <div v-if="provider.type === 'local'" class="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button v-for="chip in LOCAL_ENDPOINT_PRESETS" :key="chip.host" type="button" @click="applyEndpointPreset(chip.endpoint)" class="px-2 py-0.5 rounded-[6px] text-xs font-mono border transition-colors cursor-pointer" :class="provider.endpoint && provider.endpoint.includes(chip.host.split(':')[1]) ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-bold' : 'bg-[var(--arc-plane)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'">{{ chip.label }}</button>
          <button type="button" @click="scanFreeLlmPort" :disabled="isScanningPort" class="px-2 py-0.5 rounded-[6px] text-xs font-mono border border-[var(--arc-hairline)] hover:border-[var(--status-ok)] bg-[var(--arc-plane)] text-[var(--status-ok)] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50" title="Найти запущенный FreeLLM на портах 31415..31422">
            <RefreshCw v-if="isScanningPort" class="w-3 h-3 animate-spin" /><Search v-else class="w-3 h-3" />
            <span>{{ isScanningPort ? 'Поиск...' : 'Автопоиск FreeLLM' }}</span>
          </button>
        </div>
      </div>

      <!-- Section (g): Footer (Save left, Delete right) -->
      <div class="flex justify-between items-center pt-3 border-t border-[var(--arc-hairline)]">
        <button type="button" @click="handleSave" class="px-3.5 py-1.5 rounded-[8px] border transition shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] uppercase" :class="isSaved ? 'text-[var(--status-ok)] border-[var(--status-ok)]/40' : 'text-[var(--accent)] border-[var(--accent)]/35'">
          <Check v-if="isSaved" class="w-3.5 h-3.5 text-[var(--status-ok)]" /><Save v-else class="w-3.5 h-3.5" />
          <span>{{ isSaved ? 'СОХРАНЕНО' : 'СОХРАНИТЬ' }}</span>
        </button>

        <div v-if="showDeleteConfirm" class="flex items-center gap-2">
          <span class="text-xs font-mono text-[var(--status-err)]">Удалить профиль?</span>
          <button @click="emit('delete-provider')" class="text-xs font-mono px-2.5 py-1 bg-[var(--arc-plane)] text-[var(--status-err)] hover:text-[var(--arc-text-primary)] border border-[var(--status-err)]/40 rounded transition uppercase cursor-pointer">ДА</button>
          <button @click="showDeleteConfirm = false" class="text-xs font-mono px-2.5 py-1 bg-[var(--arc-plane)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] rounded transition uppercase cursor-pointer">НЕТ</button>
        </div>
        <button v-else @click="showDeleteConfirm = true" class="text-xs font-mono px-3 py-1.5 bg-[var(--arc-plane)] text-[var(--status-err)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)]/30 rounded-[8px] transition uppercase flex items-center gap-1.5 cursor-pointer">
          <Trash2 class="w-3.5 h-3.5" /> УДАЛИТЬ ПРОФИЛЬ
        </button>
      </div>
    </div>
  </div>
</template>
