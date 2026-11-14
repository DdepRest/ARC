<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Save, Trash2, Eye, EyeOff, ExternalLink, RefreshCw, Sparkles, Check, Lock, ShieldAlert, ShieldOff, Search, KeyRound, Layers, Sliders, RotateCcw } from 'lucide-vue-next';
import { useAiConfigStore, type ProviderTestState } from '../../../../../stores/aiConfig';
import { validateProviderEndpoint, formatCheckedAtTime } from '../../../logic/provider-validation';
import type { SaveLifecycleState } from '../../../composables/useProviderInspectorDraft';
import { PRESETS } from './presetsData';
import { isFreeLlmGateway, extractHostPort, normalizeOpenAiEndpoint } from '../../../../../../shared/utils/free-llm.util';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSelect from '../../../../../components/ui/ArcSelect.vue';
import ProviderModelCatalog from './ProviderModelCatalog.vue';
import ProviderRoutingStrategy from './ProviderRoutingStrategy.vue';
import ProviderParamsGrid from './ProviderParamsGrid.vue';

const props = withDefaults(defineProps<{
  provider: any;
  enabled?: boolean;
  isExpanded: boolean;
  testResult?: ProviderTestState | null;
  fetchedModels: string[];
  isLoadingModels: boolean;
  saveState?: SaveLifecycleState;
  saveError?: string | null;
  pendingSwitchTargetName?: string | null;
  isQuarantined?: boolean;
  quarantineMinsLeft?: number;
}>(), {
  enabled: true,
  saveState: 'clean',
  saveError: null,
  pendingSwitchTargetName: null,
  isQuarantined: false,
  quarantineMinsLeft: 0
});

const emit = defineEmits<{
  (e: 'toggle-expand'): void;
  (e: 'toggle-enabled'): void;
  (e: 'save-draft'): void;
  (e: 'reset-draft'): void;
  (e: 'confirm-save-switch'): void;
  (e: 'discard-switch'): void;
  (e: 'cancel-switch'): void;
  (e: 'test-provider'): void;
  (e: 'fetch-models', isAutoDetect?: boolean): void;
  (e: 'delete-provider'): void;
}>();

const aiStore = useAiConfigStore();
const activeTab = ref<'access' | 'models' | 'params'>('access');
const showKey = ref(false);
const autoDetectStatus = ref<{ status: 'idle' | 'loading' | 'success' | 'error'; count?: number; message?: string }>({ status: 'idle' });
let apiKeyDebounceTimer: any = null;
let autoDetectTimeout: any = null;
const showDeleteConfirm = ref(false);
const isScanningPort = ref(false);

const endpointValidation = computed(() => validateProviderEndpoint(props.provider.endpoint));
const isDirtyOrError = computed(() => props.saveState === 'dirty' || props.saveState === 'error');

watch(() => props.provider?.id, () => {
  showDeleteConfirm.value = false;
});

const LOCAL_ENDPOINT_PRESETS = [
  { host: '127.0.0.1:31415', label: '127.0.0.1:31415 (FreeLLMAPI)', endpoint: 'http://127.0.0.1:31415/v1/chat/completions' },
  { host: '127.0.0.1:31416', label: '127.0.0.1:31416 (FreeLLM Alt)', endpoint: 'http://127.0.0.1:31416/v1/chat/completions' },
  { host: '127.0.0.1:3067', label: '127.0.0.1:3067 (FreeAPILLM)', endpoint: 'http://127.0.0.1:3067/v1/chat/completions' },
  { host: '127.0.0.1:11434', label: '127.0.0.1:11434 (Ollama)', endpoint: 'http://127.0.0.1:11434/v1/chat/completions' },
  { host: '127.0.0.1:1234', label: '127.0.0.1:1234 (LM Studio)', endpoint: 'http://127.0.0.1:1234/v1/chat/completions' }
];

const handleResetQuarantine = async () => { await aiStore.resetQuarantine(props.provider.id); };

watch(() => props.isLoadingModels, (loading, prevLoading) => {
  if (prevLoading && !loading && autoDetectStatus.value.status === 'loading') {
    const count = props.fetchedModels?.length || 0;
    autoDetectStatus.value = count > 0 ? { status: 'success', message: `Найдено: ${count}` } : { status: 'error', message: 'Модели не найдены' };
    setTimeout(() => { if (autoDetectStatus.value.status !== 'loading') autoDetectStatus.value = { status: 'idle' }; }, 3500);
  }
});

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

const showLocal3067KeyLink = computed(() => props.provider.type === 'local' && isFreeLlmGateway(props.provider));

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
    }
  } finally {
    isScanningPort.value = false;
  }
};

const applyEndpointPreset = (endpoint: string) => {
  props.provider.endpoint = endpoint;
  props.provider.type = 'local';
};

const handleParamsUpdate = (params: { priority: number; temperature: number; maxTokens: number }) => {
  props.provider.priority = params.priority;
  props.provider.temperature = params.temperature;
  props.provider.maxTokens = params.maxTokens;
};

const handleStrategyUpdate = (strategy: 'smart_route' | 'fallback' | 'ensemble') => {
  props.provider.routingStrategy = strategy;
};

const handleExclusiveUpdate = (exclusive: boolean) => {
  props.provider.isExclusive = exclusive;
};

const handleTypeChange = (val: string | number | boolean) => {
  props.provider.type = val === 'local' ? 'local' : 'cloud';
};

const handleNoAuthToggle = (val: boolean) => {
  props.provider.noAuthHeader = val;
};

const requiresApiKey = computed(() => {
  if (props.provider.type === 'local' || props.provider.noAuthHeader) return false;
  const k = props.provider.apiKey?.trim() || '';
  return k.length === 0;
});

const statusBadge = computed(() => {
  if (props.isQuarantined) return { label: 'КАРАНТИН', cls: 'text-[var(--status-err)] border-[var(--status-err)]/30', dot: 'bg-[var(--status-err)]' };
  if (!props.enabled) return { label: 'ОТКЛЮЧЕН', cls: 'text-[var(--arc-text-muted)] border-[var(--arc-hairline)]', dot: 'bg-[var(--status-off)]' };
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

const saveButtonLabel = computed(() => {
  if (props.saveState === 'saving') return 'СОХРАНЕНИЕ...';
  if (props.saveState === 'saved') return 'СОХРАНЕНО';
  if (isDirtyOrError.value) return 'СОХРАНИТЬ*';
  return 'СОХРАНИТЬ';
});
</script>

<template>
  <div 
    class="rounded-[16px] border border-[var(--arc-hairline)] transition-colors duration-150 overflow-hidden bg-[var(--arc-block)] min-w-0 w-full"
    :style="{ background: 'var(--arc-block-gradient, linear-gradient(180deg, #161616 0%, #0F0F0F 100%))', boxShadow: 'var(--arc-block-elevation, inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.65))' }"
  >
    <!-- MATTE SWITCH CONFIRMATION BAR (when switching provider with dirty draft) -->
    <div
      v-if="pendingSwitchTargetName"
      role="alertdialog"
      aria-label="Подтверждение смены шлюза при наличии несохранённых изменений"
      class="px-4 py-3 border-b border-[var(--status-warn)]/40 bg-[var(--arc-well)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
    >
      <div class="flex items-center gap-2 text-[var(--status-warn)] min-w-0">
        <ShieldAlert class="w-4 h-4 shrink-0" />
        <span>Несохранённые правки в профиле «{{ provider.name }}». Перейти к «{{ pendingSwitchTargetName }}»?</span>
      </div>
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        <button type="button" :disabled="saveState === 'saving'" @click="emit('confirm-save-switch')" class="px-2.5 py-1 rounded-[7px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-ok)] border border-[var(--status-ok)]/40 uppercase cursor-pointer disabled:opacity-50">Сохранить и перейти</button>
        <button type="button" :disabled="saveState === 'saving'" @click="emit('discard-switch')" class="px-2.5 py-1 rounded-[7px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-err)] border border-[var(--status-err)]/40 uppercase cursor-pointer disabled:opacity-50">Сбросить правки</button>
        <button type="button" :disabled="saveState === 'saving'" @click="emit('cancel-switch')" class="px-2.5 py-1 rounded-[7px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] border border-[var(--arc-hairline)] uppercase cursor-pointer disabled:opacity-50">Остаться</button>
      </div>
    </div>

    <!-- INSPECTOR HEADER -->
    <div 
      class="p-4 sm:p-5 flex flex-col gap-3 border-b border-[var(--arc-hairline)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 flex-wrap">
          <button type="button" :aria-pressed="Boolean(enabled)" @click.stop="emit('toggle-enabled')" class="px-2.5 py-1 rounded-[8px] border transition cursor-pointer flex items-center gap-2 text-xs font-mono uppercase" :class="enabled ? 'bg-[var(--arc-well)] border-[var(--status-ok)]/30 text-[var(--arc-text-primary)]' : 'bg-[var(--arc-well)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)]'" title="Включить или отключить шлюз в ротации">
            <span class="w-2 h-2 rounded-full transition-colors" :class="statusBadge.dot"></span><span>{{ enabled ? 'В ротации' : 'Отключён' }}</span>
          </button>
          <span class="text-base font-bold text-[var(--arc-text-primary)] tracking-wide font-mono">{{ provider.name }}</span>
          <span class="text-xs font-mono tracking-wider font-semibold px-2.5 py-0.5 rounded-[6px] border uppercase bg-[var(--arc-well)]" :class="statusBadge.cls">{{ statusBadge.label }}</span>
          <span v-if="isDirtyOrError" class="text-xs font-mono px-2 py-0.5 rounded-[6px] bg-[var(--arc-well)] text-[var(--status-warn)] border border-[var(--status-warn)]/35 uppercase font-semibold">ЧЕРНОВИК</span>
          <span v-if="provider.isExclusive" class="text-xs font-mono px-2 py-0.5 rounded-[6px] bg-[var(--arc-well)] text-[var(--status-warn)] border border-[var(--status-warn)]/30 uppercase font-semibold">ЭКСКЛЮЗИВ</span>
          <span v-if="isQuarantined" class="text-xs font-mono px-2 py-0.5 rounded-[6px] bg-[var(--arc-well)] text-[var(--status-err)] border border-[var(--status-err)]/30 uppercase font-semibold tabular-nums">{{ quarantineMinsLeft }} МИН</span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button v-if="isDirtyOrError" type="button" :disabled="saveState === 'saving'" @click.stop="emit('reset-draft')" class="text-xs font-mono px-2.5 py-1.5 rounded-[8px] transition uppercase border border-[var(--arc-hairline)] cursor-pointer disabled:opacity-50 flex items-center gap-1.5 bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]" title="Отменить несохранённые изменения">
            <RotateCcw class="w-3.5 h-3.5" /><span>СБРОСИТЬ</span>
          </button>
          <button type="button" @click.stop="emit('test-provider')" class="text-xs font-mono px-3 py-1.5 rounded-[8px] transition tracking-wider uppercase border cursor-pointer disabled:opacity-50 flex items-center gap-1.5 bg-[var(--arc-well)] hover:bg-[var(--arc-hover)]" :class="testResult?.status === 'success' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/30' : (testResult?.status === 'error' ? 'text-[var(--status-err)] border-[var(--status-err)]/30' : 'text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border-[var(--arc-hairline)]')" :disabled="testResult?.status === 'loading' || !endpointValidation.valid">
            <RefreshCw v-if="testResult?.status === 'loading'" class="w-3.5 h-3.5 animate-spin text-[var(--accent)]" /><span>{{ testResult?.status === 'loading' ? 'ТЕСТ...' : 'ТЕСТ СВЯЗИ' }}</span>
          </button>
          <button type="button" @click.stop="emit('save-draft')" :disabled="!endpointValidation.valid || saveState === 'saving'" class="text-xs font-mono px-3.5 py-1.5 rounded-[8px] transition tracking-wider uppercase border cursor-pointer disabled:opacity-50 flex items-center gap-1.5 bg-[var(--arc-well)] hover:bg-[var(--arc-hover)]" :class="saveState === 'saved' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/40' : isDirtyOrError ? 'text-[var(--status-warn)] border-[var(--status-warn)]/40' : 'text-[var(--accent)] border-[var(--accent)]/35'" title="Сохранить настройки профиля">
            <RefreshCw v-if="saveState === 'saving'" class="w-3.5 h-3.5 animate-spin text-[var(--accent)]" /><Check v-else-if="saveState === 'saved'" class="w-3.5 h-3.5 text-[var(--status-ok)]" /><Save v-else class="w-3.5 h-3.5" /><span>{{ saveButtonLabel }}</span>
          </button>
        </div>
      </div>

      <!-- Quick Telemetry Strip -->
      <div class="px-3.5 py-2 rounded-[10px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="text-[var(--arc-text-hint)]">Модель:</span>
          <span class="font-semibold text-[var(--arc-text-primary)] truncate">{{ provider.model || (provider.selectedModels && provider.selectedModels[0]) || 'Не выбрана' }}</span>
          <span class="text-[var(--arc-text-hint)]">·</span>
          <span class="text-[var(--arc-text-secondary)]">{{ provider.routingStrategy === 'fallback' ? 'Цепочка отказа' : provider.routingStrategy === 'ensemble' ? 'Прямой вызов' : 'Умный маршрут' }}</span>
        </div>
        <div class="flex items-center gap-3 text-[var(--arc-text-muted)] tabular-nums"><span>Приоритет: #{{ provider.priority ?? 1 }}</span><span>·</span><span>{{ provider.maxTokens ?? 2048 }} tok</span><span>·</span><span>T={{ provider.temperature ?? 0.7 }}</span></div>
      </div>

      <!-- Internal Segmented Inspector Tabs -->
      <div class="grid grid-cols-3 gap-1.5 p-1 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)]">
        <button type="button" @click="activeTab = 'access'" class="py-2 px-3 rounded-[8px] text-xs font-mono font-semibold transition flex items-center justify-center gap-2 cursor-pointer" :class="activeTab === 'access' ? 'bg-[var(--arc-block-elevated)] text-[var(--arc-text-primary)] border border-[var(--accent)]/40' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"><KeyRound class="w-3.5 h-3.5 shrink-0" :class="activeTab === 'access' ? 'text-[var(--accent)]' : 'text-[var(--arc-text-hint)]'" /><span class="truncate">01. Доступ и адрес</span></button>
        <button type="button" @click="activeTab = 'models'" class="py-2 px-3 rounded-[8px] text-xs font-mono font-semibold transition flex items-center justify-center gap-2 cursor-pointer" :class="activeTab === 'models' ? 'bg-[var(--arc-block-elevated)] text-[var(--arc-text-primary)] border border-[var(--accent)]/40' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"><Layers class="w-3.5 h-3.5 shrink-0" :class="activeTab === 'models' ? 'text-[var(--accent)]' : 'text-[var(--arc-text-hint)]'" /><span class="truncate">02. Модели и маршрут</span></button>
        <button type="button" @click="activeTab = 'params'" class="py-2 px-3 rounded-[8px] text-xs font-mono font-semibold transition flex items-center justify-center gap-2 cursor-pointer" :class="activeTab === 'params' ? 'bg-[var(--arc-block-elevated)] text-[var(--arc-text-primary)] border border-[var(--accent)]/40' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"><Sliders class="w-3.5 h-3.5 shrink-0" :class="activeTab === 'params' ? 'text-[var(--accent)]' : 'text-[var(--arc-text-hint)]'" /><span class="truncate">03. Лимиты генерации</span></button>
      </div>
    </div>

    <!-- INSPECTOR BODY -->
    <div v-show="isExpanded" class="p-4 sm:p-5 flex flex-col gap-4">
      <div v-if="isQuarantined" class="p-3 bg-[var(--arc-well)] border border-[var(--status-err)]/30 rounded-xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-[var(--status-err)] text-xs font-mono">
          <ShieldAlert class="w-4 h-4 shrink-0" />
          <span>Провайдер заблокирован карантином (осталось {{ quarantineMinsLeft }} мин).</span>
        </div>
        <button type="button" @click="handleResetQuarantine" class="px-2.5 py-1 text-xs font-mono uppercase bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-err)] border border-[var(--status-err)]/35 rounded shrink-0 transition-colors cursor-pointer">СБРОСИТЬ КАРАНТИН</button>
      </div>

      <div v-if="saveError" role="alert" class="text-xs font-mono px-3.5 py-2 rounded-lg border border-[var(--status-err)]/30 bg-[var(--arc-well)] text-[var(--status-err)]">{{ saveError }}</div>
      <div v-if="testResult && testResult.status !== 'untested'" class="text-xs font-mono px-3.5 py-2.5 rounded-lg border bg-[var(--arc-well)] flex flex-col gap-1.5 transition" :class="testResult.status === 'success' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/30' : (testResult.status === 'error' ? 'text-[var(--status-err)] border-[var(--status-err)]/30' : 'text-[var(--accent)] border-[var(--accent)]/30')">
        <div class="flex items-center justify-between gap-2 font-bold tracking-wider text-xs">
          <span v-if="testResult.status === 'success'">✓ СОЕДИНЕНИЕ УСПЕШНО</span>
          <span v-else-if="testResult.status === 'error'">✗ ОШИБКА ПОДКЛЮЧЕНИЯ</span>
          <span v-else>⏱ ПРОВЕРКА ЭНДПОИНТА...</span>
          <span v-if="testResult.checkedAt" class="font-normal text-[var(--arc-text-hint)]">{{ formatCheckedAtTime(testResult.checkedAt) }}</span>
        </div>
        <p v-if="testResult.message" class="text-xs text-[var(--arc-text-muted)] leading-relaxed font-mono whitespace-pre-wrap">{{ testResult.message }}</p>
      </div>

      <!-- TAB 01: ACCESS & ENDPOINT -->
      <div v-show="activeTab === 'access'" class="flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)]">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">Имя профиля</span>
              <span class="text-xs font-mono text-[var(--arc-text-hint)]">ID: {{ provider.id }}</span>
            </div>
            <input v-model="provider.name" class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors" placeholder="например FreeLLMAPI, OpenRouter" />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">Тип контура</span>
            <ArcSelect :model-value="provider.type" :options="[{ label: 'Локальный сетевой шлюз (Local)', value: 'local' }, { label: 'Облачный API (Cloud)', value: 'cloud' }]" @update:model-value="handleTypeChange" />
          </div>

          <div class="flex flex-col gap-1.5 sm:col-span-2 pt-2 border-t border-[var(--arc-hairline)]">
            <span class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">Адрес эндпоинта (Endpoint URL)</span>
            <input v-model="provider.endpoint" @blur="normalizeInputEndpoint" placeholder="http://127.0.0.1:3067/v1/chat/completions" class="bg-[var(--arc-input)] border rounded-[10px] px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none" :class="endpointValidation.valid ? 'border-[var(--arc-hairline)] focus:border-[var(--accent)]' : 'border-[var(--status-err)]/60'" />
            <span v-if="!endpointValidation.valid" class="text-xs font-mono text-[var(--status-err)]">{{ endpointValidation.error }}</span>

            <div v-if="provider.type === 'local'" class="flex flex-wrap items-center gap-1.5 pt-1">
              <button v-for="chip in LOCAL_ENDPOINT_PRESETS" :key="chip.host" type="button" @click="applyEndpointPreset(chip.endpoint)" class="px-2.5 py-1 rounded-[6px] text-xs font-mono border transition-colors cursor-pointer" :class="provider.endpoint && provider.endpoint.includes(chip.host.split(':')[1]) ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-bold' : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'">{{ chip.label }}</button>
              <button type="button" @click="scanFreeLlmPort" :disabled="isScanningPort" class="px-2.5 py-1 rounded-[6px] text-xs font-mono border border-[var(--arc-hairline)] hover:border-[var(--status-ok)] bg-[var(--arc-block)] text-[var(--status-ok)] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50" title="Найти запущенный FreeLLM на портах 31415..31422">
                <RefreshCw v-if="isScanningPort" class="w-3 h-3 animate-spin" /><Search v-else class="w-3 h-3" />
                <span>{{ isScanningPort ? 'Поиск...' : 'Автопоиск FreeLLM' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Authorization & API Key Well -->
        <div class="flex flex-col gap-2.5 p-4 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">
                Ключ авторизации (API Key) <span v-if="provider.type === 'local'" class="text-[var(--arc-text-hint)] text-xs font-normal ml-1">(опционально)</span>
              </span>
              <span v-if="aiStore.isSafeStorageAvailable" class="flex items-center gap-1 text-xs font-mono text-[var(--status-ok)] bg-[var(--arc-block)] border border-[var(--status-ok)]/30 px-2 py-0.5 rounded font-semibold uppercase">
                <Lock class="w-2.5 h-2.5" /> DPAPI
              </span>
            </div>
            <span v-if="autoDetectStatus.status !== 'idle'" class="text-xs font-mono px-2 py-0.5 rounded flex items-center gap-1 transition bg-[var(--arc-block)] border" :class="autoDetectStatus.status === 'loading' ? 'text-[var(--status-warn)] border-[var(--status-warn)]/30' : (autoDetectStatus.status === 'success' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/30 font-bold' : 'text-[var(--status-err)] border-[var(--status-err)]/30')">
              <RefreshCw v-if="autoDetectStatus.status === 'loading'" class="w-2.5 h-2.5 animate-spin" />
              <Check v-else-if="autoDetectStatus.status === 'success'" class="w-2.5 h-2.5 text-[var(--status-ok)]" />
              {{ autoDetectStatus.message }}
            </span>
          </div>

          <div class="relative flex items-center">
            <input v-model="provider.apiKey" @input="onApiKeyInput" :type="showKey ? 'text' : 'password'" class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs font-mono text-[var(--arc-text-primary)] pr-24 focus:outline-none focus:border-[var(--accent)]" :placeholder="provider.type === 'local' ? 'sk-... (или пусто для локальных)' : 'sk-or-v1-...'" />
            <div class="absolute right-2 flex items-center gap-1">
              <button type="button" @click="triggerAutoDetect" class="px-2 py-0.5 text-xs font-mono bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] rounded border border-[var(--arc-hairline)] transition-colors flex items-center gap-1 cursor-pointer" title="Автоопределить модели">
                <Sparkles class="w-3 h-3 text-[var(--accent)]" /> АВТО
              </button>
              <button @click="showKey = !showKey" class="px-1.5 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer" type="button">
                <Eye v-if="showKey" class="w-3.5 h-3.5" /><EyeOff v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="mt-1 px-3 py-2.5 rounded-[10px] border transition-colors bg-[var(--arc-plane)] flex flex-col gap-2" :class="provider.noAuthHeader ? 'border-[rgba(var(--accent-rgb),0.45)]' : 'border-[var(--arc-hairline)] hover:border-[var(--arc-edge-strong)]'">
            <ArcToggle :model-value="Boolean(provider.noAuthHeader)" @update:model-value="handleNoAuthToggle" size="sm" wrapper-class="w-full">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-7 h-7 rounded-[7px] border flex items-center justify-center shrink-0 transition-colors" :class="provider.noAuthHeader ? 'bg-[var(--arc-selected)] border-[rgba(var(--accent-rgb),0.40)] text-[var(--accent)]' : 'bg-[var(--arc-well)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)]'"><ShieldOff class="w-3.5 h-3.5" /></div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap"><span class="text-xs font-semibold text-[var(--arc-text-primary)]">Отправлять запросы без заголовка Authorization</span><span class="text-xs font-mono font-semibold" :class="provider.noAuthHeader ? 'text-[var(--accent)]' : 'text-[var(--arc-text-hint)]'">{{ provider.noAuthHeader ? '· БЕЗ ТОКЕНА' : '· ВЫКЛ' }}</span></div>
                  <span class="text-xs text-[var(--arc-text-hint)] leading-snug">Отключает заголовок Bearer-авторизации для локальных шлюзов без ключа</span>
                </div>
              </div>
            </ArcToggle>
            <div v-if="showLocal3067KeyLink" class="pt-1.5 border-t border-[var(--arc-divider)] flex justify-end"><a :href="getPresetUrl() || 'http://127.0.0.1:3067/'" target="_blank" class="text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--accent)] inline-flex items-center gap-1 transition-colors no-underline shrink-0"><ExternalLink class="w-3 h-3" /><span>Получить ключ в веб-панели шлюза</span></a></div>
          </div>
        </div>
      </div>

      <!-- TAB 02: MODELS & ROUTING STRATEGY -->
      <div v-show="activeTab === 'models'" class="flex flex-col gap-4">
        <ProviderModelCatalog :provider="provider" :fetched-models="fetchedModels" :is-loading-models="isLoadingModels" @fetch-models="emit('fetch-models')" />
        <ProviderRoutingStrategy :model-value="provider.routingStrategy || 'smart_route'" :is-exclusive="provider.isExclusive || false" @update:model-value="handleStrategyUpdate" @update:is-exclusive="handleExclusiveUpdate" />
      </div>

      <!-- TAB 03: GENERATION LIMITS -->
      <div v-show="activeTab === 'params'" class="flex flex-col gap-4">
        <ProviderParamsGrid :model-value="{ priority: provider.priority ?? 1, temperature: provider.temperature ?? 0.7, maxTokens: provider.maxTokens ?? 4096 }" :model-name="provider.model || (provider.selectedModels && provider.selectedModels[0]) || ''" :provider-type="provider.type || 'local'" @update:model-value="handleParamsUpdate" />
      </div>

      <!-- INSPECTOR FOOTER -->
      <div class="flex justify-between items-center pt-3 border-t border-[var(--arc-hairline)]">
        <button type="button" :disabled="!endpointValidation.valid || saveState === 'saving'" @click="emit('save-draft')" class="px-3.5 py-1.5 rounded-[8px] border transition shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] uppercase disabled:opacity-50" :class="saveState === 'saved' ? 'text-[var(--status-ok)] border-[var(--status-ok)]/40' : isDirtyOrError ? 'text-[var(--status-warn)] border-[var(--status-warn)]/40' : 'text-[var(--accent)] border-[var(--accent)]/35'">
          <RefreshCw v-if="saveState === 'saving'" class="w-3.5 h-3.5 animate-spin text-[var(--accent)]" /><Check v-else-if="saveState === 'saved'" class="w-3.5 h-3.5 text-[var(--status-ok)]" /><Save v-else class="w-3.5 h-3.5" />
          <span>{{ saveState === 'saving' ? 'СОХРАНЕНИЕ...' : saveState === 'saved' ? 'СОХРАНЕНО' : isDirtyOrError ? 'СОХРАНИТЬ ПРОФИЛЬ*' : 'СОХРАНИТЬ ПРОФИЛЬ' }}</span>
        </button>

        <div v-if="showDeleteConfirm" class="flex items-center gap-2">
          <span class="text-xs font-mono text-[var(--status-err)]">Удалить профиль?</span>
          <button type="button" @click="emit('delete-provider')" class="text-xs font-mono px-2.5 py-1 bg-[var(--arc-well)] text-[var(--status-err)] hover:text-[var(--arc-text-primary)] border border-[var(--status-err)]/40 rounded transition uppercase cursor-pointer">ДА</button>
          <button type="button" @click="showDeleteConfirm = false" class="text-xs font-mono px-2.5 py-1 bg-[var(--arc-well)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] rounded transition uppercase cursor-pointer">НЕТ</button>
        </div>
        <button v-else type="button" @click="showDeleteConfirm = true" class="text-xs font-mono px-3 py-1.5 bg-[var(--arc-well)] text-[var(--status-err)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)]/30 rounded-[8px] transition uppercase flex items-center gap-1.5 cursor-pointer">
          <Trash2 class="w-3.5 h-3.5" /> УДАЛИТЬ ПРОФИЛЬ
        </button>
      </div>
    </div>
  </div>
</template>
